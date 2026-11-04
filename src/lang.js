// 첫 화면이 그려지기 전에 언어를 정해요: 예전에 고른 언어 → 브라우저 언어 → 그 밖은 영어.
(function () {
  var L = ["ko", "en", "ja"], s = null;
  try { s = localStorage.getItem("aek-lang"); } catch (e) {}
  var n = (navigator.language || "").slice(0, 2).toLowerCase();
  var l = L.indexOf(s) >= 0 ? s : L.indexOf(n) >= 0 ? n : "en";
  document.documentElement.setAttribute("data-lang", l);
  document.documentElement.lang = l;
})();
