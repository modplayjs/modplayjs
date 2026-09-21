// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Demo service worker: PWA precache + auto-update + COI header injection.
//
// This replaces coi-serviceworker.js (which only re-wrote responses with
// COOP/COEP headers because GitHub Pages cannot set them) and adds:
//  - precache of all build assets from precache-manifest.js (hashed
//    revisions → cache-first is always correct)
//  - navigation requests: network-first with cache fallback (offline
//    support; a deploy is picked up on the next reload)
//  - auto-update: on install, skipWaiting + clients.claim so the next
//    load runs the new SW against the new precache immediately
//
// IMPORTANT: COI headers are added to EVERY response (document and
// assets) — crossOriginIsolated (SharedArrayBuffer audio transport)
// depends on it.

// Cache name derived from the precache-manifest contents: any asset
// change changes the manifest → changes the cache name → the activate
// handler drops the stale cache. (A version query on this file would be
// lost across updates, so the manifest hash is the version.)
// Precache manifest: inlined at build time by scripts/precache-plugin.mjs
// (the importScripts line below stays as a dev-mode fallback — the build
// overwrites this file with the manifest assignment inline).
importScripts('./precache-manifest.js');
// Nothing precached (dev mode): everything goes through the network path.
const PRECACHE_URLS = (self.__PRECACHE_MANIFEST || []).map((e) => e.url);
const MANIFEST_JSON = JSON.stringify(self.__PRECACHE_MANIFEST || []);
const CACHE = 'modplayjs-precache-' + (() => {
  let h = 0;
  for (let i = 0; i < MANIFEST_JSON.length; i++) {
    h = (Math.imul(31, h) + MANIFEST_JSON.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
})();
const COI_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Precache each entry under its PLAIN url (no revision query) —
      // the cache name itself is versioned, so there is no need for
      // query-string revisions, and module-loader requests (no query)
      // hit the cache directly.
      await Promise.all(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(url);
          } catch {
            /* one missing asset must not abort the whole install */
          }
        }),
      );
      await cache.addAll(['./index.html', './manifest.webmanifest']);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // drop every cache that isn't ours (old versions, foreign names)
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Re-serve with COI headers added (what coi-serviceworker did). */
function withCoi(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(COI_HEADERS)) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Safari: only-if-cached requests must stay same-origin
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // never touch cross-origin

  if (req.mode === 'navigate') {
    // network-first for the document: a deploy wins over the cache
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put('./index.html', fresh.clone());
          return withCoi(fresh);
        } catch {
          const cached =
            (await caches.match(req)) ||
            (await caches.match('./index.html')) ||
            (await caches.match('./'));
          return cached ? withCoi(cached) : Response.error();
        }
      })(),
    );
    return;
  }

  // assets: cache-first over the hashed precache (fall back to network
  // for dev-mode or missed files, then cache the result)
  event.respondWith(
    (async () => {
      const exact = await caches.match(req);
      if (exact) return withCoi(exact);
      // asset requests arrive without the ?v= revision query when issued
      // by module loaders — also match by basename in the versioned cache
      const cache = await caches.open(CACHE);
      const stripped = url.pathname.split('/').pop();
      for (const key of await cache.keys()) {
        if (key.pathname.split('/').pop() === stripped) {
          return withCoi(await cache.match(key));
        }
      }
      try {
        const fresh = await fetch(req);
        if (fresh.ok) cache.put(req, fresh.clone());
        return withCoi(fresh);
      } catch {
        return Response.error();
      }
    })(),
  );
});
