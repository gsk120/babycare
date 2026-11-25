"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bell, BookOpen, CalendarDays, Check, ChevronRight, ClipboardList,
  CookingPot, House, KeyRound, LogOut, Package, Plus, Settings as SettingsIcon,
  Smartphone, UserRound, Utensils, X,
} from "lucide-react";
import { formatDate, monthsOld, shoppingList, stages, todayInKorea, units, weekdays } from "./model";

const tabs = [
  { id: "today", name: "오늘", Icon: House },
  { id: "inventory", name: "재고", Icon: Package },
  { id: "records", name: "기록", Icon: ClipboardList },
  { id: "settings", name: "설정", Icon: SettingsIcon },
];
const routes = new Set([...tabs.map((tab) => tab.id), "login", "signup"]);

function SectionTitle({ title, children }) {
  return <div className="section-title"><h2>{title}</h2>{children}</div>;
}

function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function Empty({ children }) {
  return <p className="empty">{children}</p>;
}

function Overlay({ title, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => { ref.current.showModal(); }, []);
  return <dialog ref={ref} className="sheet" onClose={onClose} onClick={(event) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  }} aria-labelledby="sheet-title">
    <div className="sheet-content">
      <div className="sheet-head"><h2 id="sheet-title">{title}</h2><button type="button" className="icon-button" onClick={() => ref.current.close()} aria-label="닫기"><X size={20} /></button></div>
      {children}
    </div>
  </dialog>;
}

function Today({ data, date, onRecipe, onRecord }) {
  const { profile, recommendation } = data;
  const recipes = recommendation?.recipes ?? [];
  const shopping = shoppingList(data.inventory, recipes);
  const hasProfile = Boolean(profile.birth);
  return <>
    <section className="greeting">
      <div className="today-date"><CalendarDays size={15} />{formatDate(date)}</div>
      <h1>{profile.child ? profile.child + "의 이유식" : "우리 집 이유식"}</h1>
      {hasProfile
        ? <p><span className="age-dot" />생후 {monthsOld(profile.birth, date)}개월 · {profile.stage} 이유식</p>
        : <a className="text-button" href="#settings">아이 프로필 설정하기</a>}
    </section>
    {!recipes.length ? <Empty>저장된 추천이 아직 없어요. 추천이 준비되면 여기에 표시돼요.</Empty> : <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-caption">
          <div className="hero-icon"><Utensils size={20} /></div>
          <div><span className="eyebrow">{formatDate(recommendation.date)}</span><h2 id="hero-title">{recommendation.date === date ? "오늘의 추천 묶음" : "최근 추천 묶음"}</h2></div>
          <div className="meal-count"><strong>{recommendation.menuCount}가지</strong><span></span><strong>{recommendation.meals}끼</strong></div>
        </div>
      </section>
      <section className="dashboard-section">
        <SectionTitle title="추천 메뉴" />
        <div className="recipe-list">
          {recipes.map((recipe) => <button className="recipe-row" key={recipe.id} onClick={() => onRecipe(recipe)}>
            <span className="recipe-icon lilac" aria-hidden="true"><CookingPot size={20} /></span>
            <span className="recipe-text"><strong>{recipe.name}</strong>{recipe.sources[0] && <small>{recipe.sources[0].book} · p.{recipe.sources[0].page}</small>}</span>
            <span className="pill lilac">{recipe.meals}끼</span><ChevronRight className="chevron" size={17} />
          </button>)}
        </div>
      </section>
      <section className="dashboard-section shopping">
        <SectionTitle title="필요한 재료"><a className="text-button" href="#inventory">재고 보기 <ChevronRight size={16} /></a></SectionTitle>
        {shopping.length ? <div className="shopping-card">{shopping.map((item) => <div key={item.id}><strong>{item.name}</strong><span className={"pill " + item.tone}>{item.text}</span></div>)}</div> : <Empty>등록된 재고로 추천 메뉴를 만들 수 있어요.</Empty>}
      </section>
      <button className="primary-button full" onClick={() => onRecord(recipes[0])}><CookingPot size={19} /> 조리 기록 남기기</button>
    </>}
  </>;
}

function RecipeDetails({ recipe, onRecord }) {
  return <>
    {recipe.sources.map(({ book, page }) => <p className="muted source-line" key={book + ":" + page}><BookOpen size={17} />{book} · p.{page}</p>)}
    <div className="info-band">추천 분량 <strong>{recipe.meals}끼</strong></div>
    {recipe.reason && <p className="recipe-reason">{recipe.reason}</p>}
    <h3>이 추천의 재료량</h3>
    <ul className="detail-list">{recipe.ingredients.map((item, index) => <li key={index}><span>{item.name}</span><strong>{item.quantity}{item.unit}</strong></li>)}</ul>
    <h3>조리 순서</h3>
    <ol className="steps">{recipe.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
    <button className="primary-button full" onClick={() => onRecord(recipe)}><CookingPot size={18} />조리 기록 남기기</button>
  </>;
}

function Inventory({ entries, onEdit, onAdd }) {
  const [filter, setFilter] = useState("all");
  const visible = entries.filter((item) => filter === "all" || item.available === (filter === "available"));
  return <>
    <div className="page-intro"><h1>식재료 재고</h1><p>양을 몰라도 보유 여부부터 기록할 수 있어요.</p></div>
    <div className="split-line">
      <div className="filter-group" aria-label="재고 필터">
        {[["all", "전체"], ["available", "있음"], ["missing", "없음"]].map(([id, name]) => <button key={id} className={id === filter ? "selected" : ""} aria-pressed={id === filter} onClick={() => setFilter(id)}>{name}</button>)}
      </div>
      <button className="primary-button compact" onClick={onAdd}><Plus size={19} />재료 추가</button>
    </div>
    <div className="card stack">{visible.length ? visible.map((item) => <button key={item.id} className="list-row" onClick={() => onEdit(item)}>
      <span className="list-icon"><Package size={19} /></span>
      <span className="recipe-text"><strong>{item.name}</strong><small>{item.available ? item.quantity == null ? "양 미입력" : item.quantity + item.unit : "보유량 없음"}</small></span>
      <span className={"pill " + (item.available ? "green" : "peach")}>{item.available ? "있음" : "없음"}</span><ChevronRight className="chevron" size={17} />
    </button>) : <Empty>이 상태의 재료가 없어요.</Empty>}</div>
  </>;
}

function InventoryForm({ item, entries, onSave, saving }) {
  const [available, setAvailable] = useState(item?.available ?? true);
  const [error, setError] = useState("");
  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = form.get("name").trim();
    if (!name) return setError("재료 이름을 입력해 주세요.");
    if (entries.some((entry) => entry.id !== item?.id && entry.name === name)) return setError("이미 등록된 재료예요.");
    const quantity = available && form.get("quantity") ? Number(form.get("quantity")) : null;
    onSave({ id: item?.id ?? null, name, available: available && quantity !== 0, quantity, unit: quantity === null ? null : form.get("unit") });
  }
  return <form className="form" onSubmit={submit}>
    <Field label="재료 이름"><input name="name" required maxLength={50} defaultValue={item?.name} placeholder="예: 닭고기" /></Field>
    <label className="check"><input type="checkbox" checked={available} onChange={(event) => setAvailable(event.target.checked)} />현재 보유 중이에요</label>
    {available && <div className="field-grid">
      <Field label="남은 양 (선택)"><input name="quantity" type="number" min="0" step=".001" defaultValue={item?.quantity ?? ""} placeholder="예: 100" /></Field>
      <Field label="단위"><select name="unit" defaultValue={item?.unit ?? "g"}>{units.map((unit) => <option key={unit}>{unit}</option>)}</select></Field>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}
    <button className="primary-button full" type="submit" disabled={saving}>{saving ? "저장 중…" : "저장하기"}</button>
  </form>;
}

function Records({ entries, onAdd }) {
  return <>
    <div className="page-intro"><h1>조리·식사 기록</h1><p>먹은 반응과 다음에 바라는 점을 줄글로 남겨요.</p></div>
    <div className="split-line"><h2>최근 기록</h2><button className="primary-button compact" onClick={onAdd}><Plus size={19} />기록 추가</button></div>
    <div className="record-list">{entries.length ? entries.map((entry) => <article className="card record-card" key={entry.id}>
      <div className="split-line"><span className="pill lilac">{entry.kind}</span><small className="muted">{formatDate(entry.date)}</small></div>
      <h3>{entry.recipe || entry.kind + " 기록"}</h3>
      {entry.notes && <p>{entry.notes}</p>}
      {entry.usage?.length > 0 && <small className="muted">사용 재료 · {entry.usage.map((item) => item.name + " " + item.quantity + item.unit).join(", ")}</small>}
    </article>) : <Empty>아직 기록이 없어요.</Empty>}</div>
  </>;
}

function RecordForm({ recipe, recipes, date, onSave, saving }) {
  const [kind, setKind] = useState(recipe ? "조리" : "식사");
  const [selected, setSelected] = useState(recipe?.id ?? "");
  const entryId = useRef(null);
  const current = recipes.find((item) => item.id === selected);

  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!entryId.current) entryId.current = crypto.randomUUID();
    const usage = kind === "조리" ? (current?.ingredients ?? []).map((item, index) => ({
      ...item, quantity: Number(form.get("usage-" + index)),
    })).filter((item) => item.quantity > 0) : [];
    onSave({ id: entryId.current, kind, recipe: current?.name ?? form.get("dish"), date: form.get("date"), notes: form.get("notes").trim(), usage });
  }

  return <form className="form" onSubmit={submit}>
    <div className="field-grid">
      <Field label="기록 종류"><select value={kind} onChange={(event) => setKind(event.target.value)}><option>식사</option><option>조리</option></select></Field>
      <Field label="날짜"><input name="date" type="date" defaultValue={date} max={date} required /></Field>
    </div>
    {recipes.length > 0 && <Field label="추천 메뉴"><select value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">직접 입력</option>{recipes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
    {!current && <Field label="메뉴 이름 (선택)"><input name="dish" maxLength={150} /></Field>}
    {kind === "조리" && current && <fieldset className="usage-fieldset" key={current.id}><legend>실제로 사용한 재료</legend>
      {current.ingredients.map((item, index) => <Field key={index} label={item.name + " (" + item.unit + ")"}><input name={"usage-" + index} type="number" min="0" step=".001" required defaultValue={item.quantity} /></Field>)}
    </fieldset>}
    <Field label="피드백"><textarea name="notes" rows={4} maxLength={1200} placeholder="예: 오늘은 잘 먹었어요. 다음엔 조금 더 묽게 만들어 주세요." required={kind === "식사" || !current} /></Field>
    <button className="primary-button full" type="submit" disabled={saving}>{saving ? "저장 중…" : "기록 저장"}</button>
  </form>;
}

function SettingsPage({ profile, familyName, date, onSave, onLogout, onChangePassword, saving }) {
  const [days, setDays] = useState(profile.days);
  const [device, setDevice] = useState("iphone");
  const [error, setError] = useState("");
  useEffect(() => {
    if (/Android/i.test(navigator.userAgent)) setDevice("android");
  }, []);
  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const child = form.get("child").trim();
    const meals = Number(form.get("meals"));
    const menuCount = Number(form.get("menuCount"));
    if (!child) return setError("아이 이름을 입력해 주세요.");
    if (!days.length) return setError("추천 요일을 하나 이상 선택해 주세요.");
    if (meals < menuCount) return setError("총 끼 수는 메뉴 수 이상이어야 해요.");
    setError("");
    onSave({ child, birth: form.get("birth"), stage: form.get("stage"), days: weekdays.filter((day) => days.includes(day)), menuCount, meals });
  }
  return <>
    <div className="page-intro"><h1>설정</h1><p>{familyName}의 아이 정보와 이유식 일정을 관리해요.</p></div>
    <form className="form" onSubmit={submit}>
      <section className="card settings-card">
        <SectionTitle title="아이 프로필" />
        <Field label="아이 이름"><input name="child" defaultValue={profile.child} maxLength={30} required /></Field>
        <div className="field-grid">
          <Field label="생년월일"><input name="birth" type="date" defaultValue={profile.birth} max={date} required /></Field>
          <Field label="이유식 단계"><select name="stage" defaultValue={profile.stage}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select></Field>
        </div>
      </section>
      <section className="card settings-card">
        <SectionTitle title="추천 일정" />
        <fieldset className="week-fieldset"><legend>추천받을 요일</legend><div className="week-row">
          {weekdays.map((day) => <button type="button" className={days.includes(day) ? "selected" : ""} aria-pressed={days.includes(day)} key={day} onClick={() => setDays(days.includes(day) ? days.filter((entry) => entry !== day) : [...days, day])}>{day}</button>)}
        </div></fieldset>
        <div className="field-grid">
          <Field label="메뉴 수"><input name="menuCount" type="number" min="1" max="30" defaultValue={profile.menuCount} required /></Field>
          <Field label="총 끼 수"><input name="meals" type="number" min="1" max="99" defaultValue={profile.meals} required /></Field>
        </div>
      </section>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary-button full" type="submit" disabled={saving}>{saving ? "저장 중…" : "설정 저장"}</button>
    </form>
    <section className="card settings-card settings-after">
      <SectionTitle title="휴대폰 알림"><Smartphone className="accent" size={21} /></SectionTitle>
      <div className="filter-group" aria-label="휴대폰 운영체제">
        <button className={device === "iphone" ? "selected" : ""} aria-pressed={device === "iphone"} onClick={() => setDevice("iphone")}>아이폰</button>
        <button className={device === "android" ? "selected" : ""} aria-pressed={device === "android"} onClick={() => setDevice("android")}>안드로이드</button>
      </div>
      <p>{device === "iphone" ? "Safari에서 공유 메뉴를 열고 홈 화면에 추가해요. 추가된 아이콘에서 웹앱을 열고 알림을 허용해요." : "Chrome에서 웹앱을 열고 알림 권한을 허용해요. 이미 차단했다면 Chrome의 사이트 설정에서 알림을 허용해요."}</p>
      <span className="muted">실제 알림 연결은 이후 단계에서 제공돼요.</span>
    </section>
    <div className="card stack settings-after">
      <button className="list-row" onClick={onChangePassword} disabled={saving}><span className="list-icon"><KeyRound size={19} /></span><strong>비밀번호 변경</strong><ChevronRight className="chevron end" size={17} /></button>
      <button className="list-row" onClick={onLogout} disabled={saving}><span className="list-icon"><LogOut size={19} /></span><strong>로그아웃</strong><ChevronRight className="chevron end" size={17} /></button>
    </div>
  </>;
}

function PasswordForm({ saving, onSave }) {
  function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      currentPassword: form.get("currentPassword"),
      newPassword: form.get("newPassword"),
      confirmPassword: form.get("confirmPassword"),
    });
  }

  return <form className="form" onSubmit={submit}>
    <Field label="현재 비밀번호"><input name="currentPassword" type="password" autoComplete="current-password" required /></Field>
    <Field label="새 비밀번호"><input name="newPassword" type="password" autoComplete="new-password" minLength={8} required /></Field>
    <Field label="새 비밀번호 확인"><input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required /></Field>
    <p className="muted">변경한 뒤 새 비밀번호로 다시 로그인해 주세요.</p>
    <button className="primary-button full" type="submit" disabled={saving}>{saving ? "변경 중…" : "비밀번호 변경"}</button>
  </form>;
}

async function request(path, { method = "GET", body, signal } = {}) {
  const response = await fetch(path, {
    method,
    signal,
    cache: "no-store",
    ...(body && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(result?.error ?? "서버에 연결할 수 없어요.");
    error.status = response.status;
    throw error;
  }
  return result;
}

const savedEmailKey = "babycare.login.email";

function AuthView({ signup, onLogin, initialError }) {
  const [email, setEmail] = useState("");
  const [saveEmail, setSaveEmail] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (signup) return;
    try {
      const saved = window.localStorage.getItem(savedEmailKey);
      if (saved) {
        setEmail(saved);
        setSaveEmail(true);
      }
    } catch {}
  }, [signup]);

  function toggleSaveEmail(event) {
    const enabled = event.target.checked;
    setSaveEmail(enabled);
    if (!enabled) {
      try { window.localStorage.removeItem(savedEmailKey); } catch {}
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (pending || signup) return;
    const form = new FormData(event.currentTarget);
    const address = form.get("email").trim();
    setError("");
    setPending(true);
    try {
      await onLogin({ email: address, password: form.get("password"), remember: form.has("remember") });
      try {
        if (saveEmail) window.localStorage.setItem(savedEmailKey, address);
        else window.localStorage.removeItem(savedEmailKey);
      } catch {}
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending(false);
    }
  }

  return <div className="auth-view">
    <div className="auth-icon"><Utensils size={28} /></div>
    <h1>{signup ? "회원가입" : "가족 계정 로그인"}</h1>
    <p className="muted">{signup ? "새 가족 계정 등록은 준비 중이에요." : "등록된 가족 계정으로 로그인해 주세요."}</p>
    <form className="form card settings-card" onSubmit={submit}>
      <Field label="이메일"><input type="email" name="email" placeholder="email@example.com" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} disabled={signup} required /></Field>
      <Field label="비밀번호"><input type="password" name="password" autoComplete={signup ? "new-password" : "current-password"} disabled={signup} required /></Field>
      {signup && <Field label="비밀번호 확인"><input type="password" name="confirm" autoComplete="new-password" disabled /></Field>}
      {!signup && <div className="login-options">
        <label className="check"><input type="checkbox" name="remember" />자동 로그인</label>
        <label className="check"><input type="checkbox" checked={saveEmail} onChange={toggleSaveEmail} />이메일 ID 저장</label>
      </div>}
      {(error || initialError) && <p className="error" role="alert">{error || initialError}</p>}
      <button className="primary-button full" type="submit" disabled={pending || signup}>{signup ? "회원가입 준비 중" : pending ? "로그인 중…" : "로그인"}</button>
    </form>
    <div className="auth-links"><a href={signup ? "#login" : "#signup"}>{signup ? "로그인으로 돌아가기" : "회원가입"}</a></div>
  </div>;
}

export default function Babycare() {
  const [page, setPage] = useState("today");
  const [data, setData] = useState(null);
  const [date, setDate] = useState(todayInKorea);
  const [loading, setLoading] = useState(true);
  const [overlay, setOverlay] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const operation = useRef(false);

  useEffect(() => {
    function syncRoute() {
      const route = window.location.hash.slice(1);
      setPage(routes.has(route) ? route : "today");
      setOverlay(null);
      window.scrollTo(0, 0);
    }
    syncRoute();
    setDate(todayInKorea());
    window.addEventListener("hashchange", syncRoute);
    const controller = new AbortController();
    request("/api/family", { signal: controller.signal }).then((snapshot) => {
      if (!controller.signal.aborted) setData(snapshot);
    }).catch((failure) => {
      if (!controller.signal.aborted && failure.status !== 401) setError(failure.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => {
      controller.abort();
      window.removeEventListener("hashchange", syncRoute);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 3500);
    return () => clearTimeout(timeout);
  }, [notice]);

  const recipes = data?.recommendation?.recipes ?? [];
  const currentPage = data && (page === "login" || page === "signup") ? "today" : page;
  const close = () => { setOverlay(null); setError(""); };
  const show = (modal) => { setError(""); setOverlay(modal); };
  const openRecord = (recipe = null) => show({ type: "record", recipe });

  async function login(credentials) {
    setError("");
    await request("/api/session", { method: "POST", body: credentials });
    setData(await request("/api/family"));
    setNotice("");
    window.location.hash = "today";
  }

  async function logout() {
    if (operation.current) return;
    operation.current = true;
    setSaving(true);
    setError("");
    try {
      await request("/api/session", { method: "DELETE" });
      close();
      setNotice("");
      setData(null);
      window.location.hash = "login";
    } catch (failure) {
      setError(failure.message);
    } finally {
      operation.current = false;
      setSaving(false);
    }
  }

  async function changePassword(payload) {
    if (operation.current) return;
    if (payload.newPassword !== payload.confirmPassword) {
      setError("새 비밀번호 확인이 일치하지 않아요.");
      return;
    }
    operation.current = true;
    setSaving(true);
    setError("");
    try {
      await request("/api/session", { method: "PATCH", body: payload });
      close();
      setData(null);
      setNotice("비밀번호를 변경했어요. 다시 로그인해 주세요.");
      window.location.hash = "login";
    } catch (failure) {
      if (failure.status === 401) {
        close();
        setData(null);
        window.location.hash = "login";
      }
      setError(failure.message);
    } finally {
      operation.current = false;
      setSaving(false);
    }
  }

  async function save(action, payload, message) {
    if (operation.current) return;
    operation.current = true;
    setSaving(true);
    setError("");
    try {
      setData(await request("/api/family", { method: "POST", body: { action, payload } }));
      close();
      setNotice(message);
    } catch (failure) {
      if (failure.status === 401 || failure.status === 403) {
        close();
        setData(null);
        window.location.hash = "login";
      }
      setError(failure.message);
    } finally {
      operation.current = false;
      setSaving(false);
    }
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#today"><span className="brand-icon"><Utensils size={19} strokeWidth={2.2} /></span>이유식케어<span className="brand-ai">AI</span></a>
      {data && <div className="header-actions"><a className="icon-button" href="#settings" aria-label="알림 설정"><Bell size={20} /></a><a className="icon-button avatar" href="#settings" aria-label="가족 설정"><UserRound size={19} /></a></div>}
    </header>
    <main className="main">
      {loading && <p className="empty" role="status">가족 정보를 불러오는 중이에요.</p>}
      {!loading && !data && <AuthView key={page === "signup" ? "signup" : "login"} signup={page === "signup"} onLogin={login} initialError={error} />}
      {data && <>
        {!overlay && error && <p className="error page-error" role="alert">{error}</p>}
        {currentPage === "today" && <Today data={data} date={date} onRecipe={(recipe) => show({ type: "recipe", recipe })} onRecord={openRecord} />}
        {currentPage === "inventory" && <Inventory entries={data.inventory} onAdd={() => show({ type: "inventory" })} onEdit={(item) => show({ type: "inventory", item })} />}
        {currentPage === "records" && <Records entries={data.records} onAdd={() => openRecord()} />}
        {currentPage === "settings" && <SettingsPage profile={data.profile} familyName={data.family.name} date={date} saving={saving} onLogout={logout} onChangePassword={() => show({ type: "password" })} onSave={(profile) => save("profile", profile, "설정을 저장했어요.")} />}
      </>}
    </main>
    {data && <nav className="bottom-nav" aria-label="주 메뉴">
      {tabs.map(({ id, name, Icon }) => <a key={id} href={"#" + id} className={currentPage === id ? "active" : ""} aria-current={currentPage === id ? "page" : undefined}>
        <span><Icon size={21} strokeWidth={currentPage === id ? 2.25 : 1.8} /></span>{name}
      </a>)}
    </nav>}
    <div className="notice-wrap" aria-live="polite">{notice && <div className="notice"><Check size={18} />{notice}</div>}</div>
    {data && overlay?.type === "password" && <Overlay key="password" title="비밀번호 변경" onClose={close}>
      {error && <p className="error page-error" role="alert">{error}</p>}
      <PasswordForm saving={saving} onSave={changePassword} />
    </Overlay>}
    {data && overlay?.type === "recipe" && <Overlay key="recipe" title={overlay.recipe.name} onClose={close}><RecipeDetails recipe={overlay.recipe} onRecord={openRecord} /></Overlay>}
    {data && overlay?.type === "inventory" && <Overlay key="inventory" title={overlay.item ? "재고 수정" : "재료 추가"} onClose={close}>
      {error && <p className="error page-error" role="alert">{error}</p>}
      <InventoryForm item={overlay.item} entries={data.inventory} saving={saving} onSave={(item) => save("inventory", item, "재고를 저장했어요.")} />
    </Overlay>}
    {data && overlay?.type === "record" && <Overlay key="record" title="조리·식사 기록 추가" onClose={close}>
      {error && <p className="error page-error" role="alert">{error}</p>}
      <RecordForm recipe={overlay.recipe} recipes={recipes} date={date} saving={saving} onSave={(record) => save("record", record, "기록을 저장했어요.")} />
    </Overlay>}
  </div>;
}
