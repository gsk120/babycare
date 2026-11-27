import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { formatDate } from "./model.js";

function HistoryRequestError({ message, onRetry }) {
  return <div className="history-request-error">
    <p className="error" role="alert">{message}</p>
    <button type="button" className="text-button" onClick={onRetry}>다시 시도</button>
  </div>;
}

function HistoryDate({ date, today }) {
  const year = date.slice(0, 4);
  return <time dateTime={date}>{today.startsWith(year) ? "" : year + "년 "}{formatDate(date)}</time>;
}

function PastMenus({ batchId, load, cachedRecipes, onRecipe }) {
  const [recipes, setRecipes] = useState(() => cachedRecipes.get(batchId) ?? null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (cachedRecipes.has(batchId)) return;
    const controller = new AbortController();
    load({ batchId }, controller.signal).then(({ recipes }) => {
      if (controller.signal.aborted) return;
      cachedRecipes.set(batchId, recipes);
      setRecipes(recipes);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, [attempt, batchId, cachedRecipes, load]);

  if (error) return <HistoryRequestError message={error} onRetry={() => { setError(""); setAttempt((n) => n + 1); }} />;
  if (!recipes) return <p className="empty" role="status">추천 메뉴를 불러오는 중이에요.</p>;
  if (!recipes.length) return <p className="empty">이 날짜에 저장된 메뉴가 없어요.</p>;

  return <ul className="history-recipes">
    {recipes.map((recipe) => <li key={recipe.id}>
      <button type="button" className="history-recipe-row" onClick={() => onRecipe(recipe)}>
        <strong>{recipe.name}</strong><span className="pill lilac">{recipe.meals}끼</span>
        <ChevronRight className="chevron" size={17} aria-hidden="true" />
      </button>
    </li>)}
  </ul>;
}

function RecipeSearchResults({ query, date, load, onRecipe }) {
  const [recipes, setRecipes] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [pageRequest, setPageRequest] = useState({ cursor: null, delay: 300 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(null);
  const [detailError, setDetailError] = useState(null);
  const detailRequest = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    const { cursor, delay } = pageRequest;
    async function loadResults() {
      try {
        const page = await load(cursor ? { q: query, cursor } : { q: query }, controller.signal);
        if (controller.signal.aborted) return;
        setRecipes((previous) => cursor ? [...previous, ...page.recipes] : page.recipes);
        setNextCursor(page.nextCursor);
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    const timer = setTimeout(loadResults, delay);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [load, pageRequest, query]);

  useEffect(() => () => detailRequest.current?.abort(), []);

  function requestPage(cursor) {
    setError("");
    setLoading(true);
    setPageRequest({ cursor, delay: 0 });
  }

  async function openResult(itemId) {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setOpening(itemId);
    setDetailError(null);
    try {
      const { recipe } = await load({ itemId }, controller.signal);
      if (!controller.signal.aborted) onRecipe(recipe);
    } catch (failure) {
      if (!controller.signal.aborted) setDetailError({ itemId, message: failure.message });
    } finally {
      if (!controller.signal.aborted) setOpening(null);
    }
  }

  return <div aria-label="레시피 검색 결과">
    {!!recipes.length && <ul className="record-list history-search-results" aria-label="찾은 레시피">
      {recipes.map((recipe) => <li key={recipe.id} className="card">
        <button type="button" className="history-recipe-row" aria-busy={opening === recipe.id} onClick={() => openResult(recipe.id)}>
          <span><strong>{recipe.name}</strong>
            <small><HistoryDate date={recipe.date} today={date} /></small>
            {!!recipe.matchedIngredients.length && <small>재료 · {recipe.matchedIngredients.join(", ")}</small>}
          </span>
          <ChevronRight className="chevron" size={17} aria-hidden="true" />
        </button>
        {detailError?.itemId === recipe.id && <HistoryRequestError message={detailError.message} onRetry={() => openResult(recipe.id)} />}
      </li>)}
    </ul>}
    {opening && <p className="empty" role="status">레시피를 불러오는 중이에요.</p>}
    {loading && <p className="empty" role="status">레시피를 검색하는 중이에요.</p>}
    {error && <HistoryRequestError message={error} onRetry={() => requestPage(pageRequest.cursor)} />}
    {!loading && !error && !recipes.length && <p className="empty" role="status">검색 결과가 없어요.</p>}
    {!loading && !error && nextCursor && <button type="button" className="text-button history-more" onClick={() => requestPage(nextCursor)}>검색 결과 더 보기</button>}
  </div>;
}

export function RecommendationHistory({ date, load, onRecipe }) {
  const [batches, setBatches] = useState([]);
  const [nextBefore, setNextBefore] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [pageRequest, setPageRequest] = useState({ before: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [composing, setComposing] = useState(false);
  const cachedRecipes = useRef(new Map());
  const searchInput = useRef(null);
  const query = searchText.trim();

  useEffect(() => {
    const controller = new AbortController();
    const { before } = pageRequest;
    load(before ? { before } : {}, controller.signal).then((page) => {
      if (controller.signal.aborted) return;
      setBatches((previous) => before ? [...previous, ...page.batches] : page.batches);
      setNextBefore(page.nextBefore);
      if (!before) setExpanded(page.batches[0]?.id ?? null);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [load, pageRequest]);

  function requestPage(before) {
    setError("");
    setLoading(true);
    setPageRequest({ before });
  }

  return <section aria-label="지난 추천">
    <div className="history-search" role="search" aria-label="지난 추천 검색">
      <Search size={19} aria-hidden="true" />
      <input ref={searchInput} type="search" maxLength={100} autoComplete="off" aria-label="메뉴나 재료 검색"
        placeholder="메뉴나 재료 검색" value={searchText} onChange={(event) => setSearchText(event.target.value)}
        onCompositionStart={() => setComposing(true)} onCompositionEnd={(event) => {
          setSearchText(event.currentTarget.value);
          setComposing(false);
        }} />
      {searchText && <button type="button" aria-label="검색어 지우기" onClick={() => {
        setSearchText("");
        setComposing(false);
        searchInput.current?.focus();
      }}><X size={17} aria-hidden="true" /></button>}
    </div>
    {query ? (composing ? null : <RecipeSearchResults key={query} query={query} date={date} load={load} onRecipe={onRecipe} />) : <>
      <div className="record-list">
        {batches.map((batch) => {
          const open = expanded === batch.id;
          const menuId = "history-menus-" + batch.id;
          return <article className="card history-batch" key={batch.id}>
            <h2><button type="button" className="history-batch-button" aria-expanded={open} aria-controls={menuId}
              onClick={() => setExpanded(open ? null : batch.id)}>
              <span><HistoryDate date={batch.date} today={date} />
                <small>메뉴 {batch.menuCount}가지 · 총 {batch.meals}끼</small></span>
              <ChevronDown className="chevron" size={19} aria-hidden="true" />
            </button></h2>
            <div id={menuId} hidden={!open}>
              {open && <PastMenus batchId={batch.id} load={load} cachedRecipes={cachedRecipes.current} onRecipe={onRecipe} />}
            </div>
          </article>;
        })}
      </div>
      {loading && <p className="empty" role="status">지난 추천을 불러오는 중이에요.</p>}
      {error && <HistoryRequestError message={error} onRetry={() => requestPage(pageRequest.before)} />}
      {!loading && !error && !batches.length && <p className="empty">아직 지난 추천이 없어요.</p>}
      {!loading && !error && nextBefore && <button type="button" className="text-button history-more" onClick={() => requestPage(nextBefore)}>이전 추천 더 보기</button>}
    </>}
  </section>;
}
