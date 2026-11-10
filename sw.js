// REAIR service worker: makes the app work offline once it has been opened.
// The lists below are filled in by the build (see vite.config.ts).
const BUILD = "5200c2c08a7b";
const SHELL = ["./","./assets/index-CSVQ590D.js","./assets/index-DrDn_Vir.css","./brand/enso.svg","./brand/headphones.svg","./brand/nose.svg","./brand/symbol.svg","./brand/wordmark.svg","./fonts/Alcubierre.otf","./icons/apple-touch-icon.png","./icons/favicon.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/maskable-512.png","./index.html","./manifest.webmanifest"];
const MEDIA = ["./audio/reactivate/01.mp3","./audio/reactivate/02.mp3","./audio/reactivate/03.mp3","./audio/reactivate/04.mp3","./audio/reactivate/05.mp3","./audio/reactivate/06.mp3","./audio/reactivate/07.mp3","./audio/reactivate/08.mp3","./audio/rebalance/intro.mp3","./audio/rebalance/main.mp3","./audio/rebalance/outro.mp3","./audio/recontrol/intro.mp3","./audio/recontrol/main.mp3","./audio/recontrol/outro.mp3","./audio/recover/intro.mp3","./audio/recover/main.mp3","./audio/recover/outro.mp3","./audio/reward.mp3"];

const SHELL_CACHE = `reair-shell-${BUILD}`;
// Music never changes, so it lives in its own cache and survives updates.
const MEDIA_CACHE = 'reair-media-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('reair-shell-') && key !== SHELL_CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

// The page asks for the music to be stored once it has settled.
let warming = false;
self.addEventListener('message', (event) => {
  if (event.data !== 'warm' || warming) return;
  warming = true;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(MEDIA_CACHE);
      for (const url of MEDIA) {
        try {
          if (await cache.match(url)) continue;
          const res = await fetch(url);
          if (res.ok && res.status === 200) await cache.put(url, res);
        } catch {
          /* offline or interrupted: try again next time */
        }
      }
      warming = false;
    })(),
  );
});

// Audio elements ask for byte ranges; answer them from the stored file.
async function ranged(res, header) {
  const blob = await res.blob();
  const m = /bytes=(\d*)-(\d*)/.exec(header) || [];
  const size = blob.size;
  let start = m[1] ? parseInt(m[1], 10) : 0;
  let end = m[2] ? parseInt(m[2], 10) : size - 1;
  if (!m[1] && m[2]) {
    start = Math.max(0, size - parseInt(m[2], 10));
    end = size - 1;
  }
  end = Math.min(end, size - 1);
  if (start > end || start >= size) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

async function respond(event) {
  const req = event.request;
  const url = new URL(req.url);
  const key = url.origin + url.pathname;
  const range = req.headers.get('range');

  const cached = (await caches.match(key)) || (req.mode === 'navigate' ? await caches.match(new URL('./index.html', self.registration.scope).href) : undefined);
  if (cached) return range ? ranged(cached, range) : cached;

  const res = await fetch(req);
  if (/\/audio\//.test(url.pathname)) {
    if (res.status === 200) {
      const copy = res.clone();
      event.waitUntil(caches.open(MEDIA_CACHE).then((c) => c.put(key, copy)));
    } else if (res.status === 206) {
      // Only a slice came through: fetch the whole file once for next time.
      event.waitUntil(
        caches.open(MEDIA_CACHE).then(async (c) => {
          if (await c.match(key)) return;
          const full = await fetch(key);
          if (full.ok && full.status === 200) await c.put(key, full);
        }),
      );
    }
  }
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(respond(event));
});
