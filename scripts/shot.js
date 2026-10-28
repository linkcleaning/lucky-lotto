// 앱스토어 스크린샷 자동 촬영 스크립트 (CI 시뮬레이터 전용, SHOTS=1 빌드에만 들어감)
// CI가 장면 번호를 정해 앱을 켤 때마다 그 장면 하나만 보여줘요.
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
  var scenes = {
    1: function () { top(); },                                                            // 홈
    2: function () { var b = q('#drawBtn'); if (b) b.click(); setTimeout(function () { to('#results', 60); }, 4500); }, // 번호 뽑기
    3: function () { window.__ll.setCheckRound(S.round); window.__ll.showTab('check'); top(); },  // 내 번호 · 당첨 확인
    4: function () { window.__ll.setCheckRound(S.round); window.__ll.showTab('check'); setTimeout(function () { to('#ticketList', 140); }, 300); }, // 줄마다 결과
    5: function () { window.__ll.showQR(S.qr); },                                         // QR 결과
    6: function () { window.__ll.showTab('past'); top(); },                                // 지난 번호
    7: function () { to('#luckCard', 60); }                                                // 재미로 보는 운
  };
  // CI가 장면 번호를 기기 저장소(UserDefaults: CapacitorStorage.shot)에 써 두고 앱을 다시 켜요
  function sceneNo() {
    var P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Preferences;
    if (!P) return Promise.resolve(Number((location.hash.match(/shot=(\d)/) || [])[1] || 1));
    return P.get({ key: 'shot' }).then(function (r) { return Number(r && r.value) || 1; }).catch(function () { return 1; });
  }
  window.addEventListener('load', function () {
    var bubble = q('#bubble'); if (bubble) bubble.style.display = 'none';
    sceneNo().then(function (n) {
      setTimeout(function () { try { (scenes[n] || scenes[1])(); } catch (e) {} }, 3500);
    });
  });
})();
