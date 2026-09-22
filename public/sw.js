/* iAssetsPro CORE service worker — app-shell resilience only.
 *
 * Security boundary:
 * - never cache /api/* responses or authenticated business data;
 * - work-order data snapshots live in actor-bound IndexedDB via the app code;
 * - only the shell, manifest, logo and immutable Next static assets are cached.
 */

const CACHE_PREFIX = 'iassetspro-shell-';
const WORKER_BUILD_VERSION = new URL(self.location.href).searchParams.get('v') || 'legacy';
const CACHE_NAME = `${CACHE_PREFIX}${WORKER_BUILD_VERSION}`;
const APP_SHELL = ['/', '/logo.svg', '/manifest.webmanifest'];

function extractNextStaticAssets(html) {
  const urls = new Set();
  const pattern = /(?:src|href)=["']([^"']*\/_next\/static\/[^"']+)["']/g;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    try {
      const url = new URL(match[1], self.location.origin);
      if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
        urls.add(url.pathname + url.search);
      }
    } catch {
      // Ignore malformed asset references instead of failing installation.
    }
  }
  return Array.from(urls);
}

async function cacheRootAndStaticAssets(cache, response) {
  await cache.put('/', response.clone());

  try {
    const html = await response.clone().text();
    const assets = extractNextStaticAssets(html);
    await Promise.all(
      assets.map(async (asset) => {
        try {
          const assetResponse = await fetch(asset, { cache: 'reload' });
          if (assetResponse.ok) await cache.put(asset, assetResponse.clone());
        } catch {
          // One optional chunk must not block the rest of the shell install.
        }
      }),
    );
  } catch {
    // Root HTML is still useful as an offline fallback even if parsing fails.
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of APP_SHELL) {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (!response.ok) continue;
        if (url === '/') await cacheRootAndStaticAssets(cache, response);
        else await cache.put(url, response.clone());
      } catch {
        // A transient install-time network failure must not brick registration.
      }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API/auth/business responses are always network/app-managed. They must not
  // enter Cache Storage, where actor/plant boundaries cannot be guaranteed.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && url.pathname === '/') {
          const cache = await caches.open(CACHE_NAME);
          await cacheRootAndStaticAssets(cache, response);
        }
        return response;
      } catch {
        const cached = await caches.match('/');
        if (cached) return cached;
        return new Response(
          '<!doctype html><html><body><h1>iAssetsPro is offline</h1><p>Reconnect once to refresh the application shell.</p></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 },
        );
      }
    })());
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname === '/logo.svg' ||
    url.pathname === '/manifest.webmanifest';

  if (!isStaticAsset) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const network = fetch(request)
      .then(async (response) => {
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })
      .catch(() => null);

    if (cached) {
      void network;
      return cached;
    }

    const response = await network;
    return response || new Response('', { status: 504 });
  })());
});
