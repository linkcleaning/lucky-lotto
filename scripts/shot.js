// 앱스토어 스크린샷 자동 촬영 스크립트 (CI 시뮬레이터 전용, SHOTS=1 빌드에만 들어감)
// 장면마다 7초씩 보여주고, CI가 그 사이에 화면을 찍어요.
(function () {
  window.__LL_SHOT = true;
  var S = window.__LL_SEED;
  try {
    if (!localStorage.getItem('ll-shot-seeded')) {
      localStorage.clear();
      localStorage.setItem('lucky-lotto-input-v1', S.input);
      localStorage.setItem('lucky-lotto-birth-v1', JSON.stringify(S.birth));
      localStorage.setItem('lucky-lotto-tickets-v1', JSON.stringify(S.tickets));
      localStorage.setItem('ll-shot-seeded', '1');
    }
  } catch (e) {}
  var q = function (sel) { return document.querySelector(sel); };
  var top = function () { window.scrollTo(0, 0); };
  var to = function (sel, off) { var el = q(sel); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - (off || 70)); };
  var scenes = [
    function () { top(); },                                                    // 1 홈
    function () { var b = q('#drawBtn'); if (b) b.click(); setTimeout(function () { to('#results', 60); }, 4200); }, // 2 번호 뽑기
    function () { window.__ll.setCheckRound(S.round); window.__ll.showTab('check'); top(); },  // 3 내 번호 · 당첨 확인
    function () { to('#ticketList', 140); },                                   // 4 줄마다 결과
    function () { window.__ll.showTab('gen'); window.__ll.showQR(S.qr); },     // 5 QR 결과
    function () { window.__ll.closeScanner(); window.__ll.showTab('past'); top(); }, // 6 지난 번호
    function () { window.__ll.showTab('gen'); to('#luckCard', 60); }           // 7 재미로 보는 운
  ];
  window.addEventListener('load', function () {
    var bubble = q('#bubble'); if (bubble) bubble.style.display = 'none';
    scenes.forEach(function (fn, i) { setTimeout(function () { try { fn(); } catch (e) {} }, 4000 + i * 7000); });
  });
})();
