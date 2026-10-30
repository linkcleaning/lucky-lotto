/* 행운로또 생성기 - Service Worker
 * 코드를 수정해서 다시 배포할 때는 CACHE_VERSION 숫자를 올려 주세요.
 * 그래야 사용자 폰에 저장된 옛날 캐시가 새 버전으로 교체됩니다.
 */
const CACHE_VERSION = 'v38';
const CACHE_NAME = `lucky-lotto-${CACHE_VERSION}`;

const JSQR_URL = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';

const APP_SHELL = [
  './',
  './index.html',
  './icons/mascot.png',
  './sounds/first.mp3',
  './vendor/jsQR.js'
];

// 설치: 앱 화면 구성 파일을 미리 저장
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// 활성화: 이전 버전 캐시 삭제
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('lucky-lotto-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// 요청 처리
// - 페이지(HTML): 네트워크 우선 → 실패하면 캐시 (최신 코드 반영 + 오프라인 동작)
// - 그 외 파일: 캐시 우선 → 없으면 네트워크
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 홈 화면 아이콘·매니페스트·파비콘은 서비스워커가 건드리지 않음
  // (iOS/안드로이드가 아이콘을 직접 받아야 '행' 글자 아이콘이 안 생김)
  if (url.origin === self.location.origin &&
      (/\/icons\/lotto-/.test(url.pathname) || /\.webmanifest$/.test(url.pathname) || /favicon\.ico$/.test(url.pathname))) return;

  // QR 읽기 도구(jsQR): 한 번 받으면 오프라인에서도 쓰도록 저장
  if (url.href === JSQR_URL) {
    event.respondWith(
      caches.match(JSQR_URL).then((cached) => cached || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(JSQR_URL, copy)); }
        return res;
      }))
    );
    return;
  }
  if (url.origin !== self.location.origin) return;

  // 당첨번호 데이터: 항상 최신 먼저, 오프라인이면 마지막으로 받은 것
  if (url.pathname.endsWith('/data/draws.json')) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(url.pathname, copy));
          }
          return res;
        })
        .catch(() => caches.match(url.pathname))
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
