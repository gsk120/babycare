export const recipeImagePollInterval = 12000;

export function createRecipeImageCache(load) {
  const entries = new Map();
  const firstImages = new Map();
  let session = new AbortController();

  function get(itemId) {
    const previous = entries.get(itemId);
    if (previous?.pending) return previous.pending;
    const startedAt = Date.now();
    if (previous?.refreshAt > startedAt) return Promise.resolve(previous.steps);

    const entry = previous ?? { steps: [], expiresAt: 0, refreshAt: 0 };
    const { signal } = session;
    entry.pending = load(itemId, signal).then(({ steps, expiresIn = 3600 }) => {
      if (signal.aborted) return [];
      const seconds = Math.max(0, expiresIn - Math.min(30, expiresIn * 0.05));
      const newExpiry = startedAt + seconds * 1000;
      const oldUrls = entry.expiresAt > Date.now()
        ? new Map(entry.steps.filter(({ url }) => url).map(({ step, url }) => [step, url]))
        : new Map();
      let reused = false;
      entry.steps = steps.map((step) => {
        const oldUrl = step.status === "ready" && oldUrls.get(step.step);
        if (!oldUrl) return step;
        reused = true;
        return { ...step, url: oldUrl };
      });
      entry.expiresAt = reused && steps.some(({ url }) => url) ? Math.min(entry.expiresAt, newExpiry)
        : reused ? entry.expiresAt : newExpiry;
      const complete = entry.steps.length > 0 && entry.steps.every(({ status, url }) => status === "ready" && url);
      entry.refreshAt = complete ? entry.expiresAt : Math.min(entry.expiresAt, Date.now() + recipeImagePollInterval);
      return entry.steps;
    }).finally(() => { entry.pending = null; });
    entries.set(itemId, entry);
    return entry.pending;
  }

  function loadFirstImage(itemId, source) {
    const previous = firstImages.get(itemId);
    if (previous?.source === source) return previous.pending;
    if (previous?.objectUrl) URL.revokeObjectURL(previous.objectUrl);

    const { signal } = session;
    const entry = { source, objectUrl: null, url: null };
    entry.pending = fetch(source, { credentials: "omit", signal }).then(async (response) => {
      if (!response.ok) throw new Error("이미지를 불러오지 못했어요.");
      const blob = await response.blob();
      if (signal.aborted || firstImages.get(itemId) !== entry) return null;
      entry.objectUrl = URL.createObjectURL(blob);
      entry.url = entry.objectUrl;
      return entry.url;
    }).catch(() => {
      if (signal.aborted || firstImages.get(itemId) !== entry) return null;
      entry.url = source;
      return source;
    });
    firstImages.set(itemId, entry);
    return entry.pending;
  }

  return {
    get,
    peek(itemId) {
      const entry = entries.get(itemId);
      return entry?.expiresAt > Date.now() ? entry.steps : [];
    },
    async preloadFirst(itemId) {
      const { signal } = session;
      const steps = await get(itemId);
      const first = steps.find(({ step }) => step === 1);
      if (signal.aborted || !first) return false;
      if (!first.url) return first.status === "pending" || first.status === "processing";
      void loadFirstImage(itemId, first.url);
      return false;
    },
    loadFirstImage,
    peekFirstImage(itemId, source) {
      const entry = firstImages.get(itemId);
      return entry?.source === source ? entry.url : null;
    },
    clear() {
      session.abort();
      entries.clear();
      for (const { objectUrl } of firstImages.values()) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
      firstImages.clear();
      session = new AbortController();
    },
  };
}
