// Offline support. The app opens from the cache straight away (most elevators have no
// signal) and checks for a newer version in the background.
//
// The page and its scripts are always swapped as a set: a newer page only replaces the
// cached one after every file it needs is cached too, so a half-downloaded update can
// never leave the app blank.

const CACHE = 'got-motion-v1';
const PAGE = './';
// Some servers answer with "Vary: Origin". Honouring that makes a stored file miss when the
// page asks for it, so lookups go by URL alone.
const LOOKUP = { ignoreVary: true };

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => refreshPage(cache, new Request(PAGE)))
      .catch(() => {}),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

/** Absolute URLs of the built scripts and styles a page references. */
function assetsOf(html) {
  return [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map(
    (match) => new URL(match[1], self.registration.scope).href,
  );
}

/** Drops built scripts and styles that the cached page does not use (left from older versions). */
async function prune(cache) {
  const page = await cache.match(PAGE, LOOKUP);
  if (!page) return;
  const keep = assetsOf(await page.text());
  for (const key of await cache.keys()) {
    const isBuilt = /\/assets\/[^/]+\.(js|css)$/.test(new URL(key.url).pathname);
    if (isBuilt && !keep.includes(key.url)) await cache.delete(key);
  }
}

/**
 * Fetches the page; if it is newer, caches everything it needs before switching to it.
 * Old files are pruned first, and only ones the cached page does not reference, because the
 * page on screen right now may still be loading the previous version's scripts.
 */
async function refreshPage(cache, request) {
  await prune(cache);
  const response = await fetch(request, { cache: 'no-cache' });
  if (!response.ok) return response;
  const html = await response.clone().text();
  const cached = await cache.match(PAGE, LOOKUP);
  const previous = cached ? await cached.text() : null;
  const assets = assetsOf(html);
  try {
    await Promise.all(
      assets.map(async (url) => {
        if (!(await cache.match(url, LOOKUP))) await cache.add(url);
      }),
    );
    await cache.put(PAGE, response.clone());
    // A newer version is now fully cached. Tell any open page, so it can switch to it
    // instead of waiting for the app to be closed and opened again.
    if (previous !== null && previous !== html) {
      const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const page of pages) page.postMessage({ type: 'updated' });
    }
  } catch {
    /* connection dropped mid-update: keep the complete older copy */
  }
  return response;
}

// The page reports the other files it loaded (fonts, icons), so one visit is enough
// to work offline afterwards.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'precache' || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter((url) => new URL(url, self.location.href).origin === self.location.origin);
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        urls.map(async (url) => {
          if (!(await cache.match(url, LOOKUP))) await cache.add(url).catch(() => {});
        }),
      ),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      if (request.mode === 'navigate') {
        const cached = await cache.match(PAGE, LOOKUP);
        const fresh = refreshPage(cache, request).catch(() => null);
        if (cached) {
          event.waitUntil(fresh);
          return cached;
        }
        return (await fresh) || Response.error();
      }

      const cached = await cache.match(request, LOOKUP);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        return Response.error();
      }
    })(),
  );
});
