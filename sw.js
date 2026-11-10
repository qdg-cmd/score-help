/* ═══════════════════════════════════════════════════════════════
   고교 성적 나침반 5.0 — 오프라인 Service Worker (sw.js)
   ───────────────────────────────────────────────────────────────
   학교 업무망/교무실 인터넷 연결이 불안정하거나 오프라인 환경에서도
   모든 기능(파싱, 통계, 차트, A4 인쇄, 엑셀 출력)이 100% 작동하도록
   필수 앱 셸을 캐싱합니다.
   ═══════════════════════════════════════════════════════════════ */

const CACHE_NAME = 'score-compass-v5-11';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg',
  './lib/chart.min.js',
  './lib/xlsx.full.min.js',
  './lib/exceljs.min.js'
];

// 설치 단계: 최신 리소스 사전 캐싱 및 즉시 활성화
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Caching app shell assets');
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('[ServiceWorker] Partial cache prefill:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 활성화 단계: 이전 버전 캐시 즉시 제거
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 네트워크 우선 전략 (Network-First with Cache Fallback)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200) {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
      }
      return networkResponse;
    }).catch(() => {
      return caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
