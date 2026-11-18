// 오프라인에서도 열리도록 앱 파일을 보관한다.
// 늘 새 버전을 먼저 받아 보고(네트워크 먼저), 안 되면 보관해 둔 것을 쓴다.
const CACHE = 'pm-v3'; // manifest 를 바꿨을 때도 올린다
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k); // 예전 보관본 지우기
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const font = /fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(url.host);
  if (!same && !font) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      // 우리 파일은 브라우저가 들고 있는 것도 믿지 않고 서버에 새 버전이 있는지 꼭 묻는다 (바뀐 게 없으면 금방 끝남)
      const res = await fetch(!same ? req : req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache' }) : new Request(req, { cache: 'no-cache' }));
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(() => {});
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
