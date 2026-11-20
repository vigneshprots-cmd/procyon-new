/* Live-theme previews: desktop dropdowns, mobile menu, FAQ accordion (stands in for the React behaviour) */
(function () {
  'use strict';
  var wraps = [].slice.call(document.querySelectorAll('[data-dd-wrap]'));
  function setDd(w, open) {
    var b = w.querySelector('[data-dd]'), p = w.querySelector('[data-dd-panel]');
    if (!b || !p) return;
    p.hidden = !open; b.setAttribute('aria-expanded', String(open));
  }
  function closeAll(except) { wraps.forEach(function (w) { if (w !== except) setDd(w, false); }); }
  wraps.forEach(function (w) {
    var t, btn = w.querySelector('[data-dd]');
    w.addEventListener('mouseenter', function () { clearTimeout(t); closeAll(w); setDd(w, true); });
    w.addEventListener('mouseleave', function () { t = setTimeout(function () { setDd(w, false); }, 140); });
    btn.addEventListener('click', function (e) { e.preventDefault(); var open = btn.getAttribute('aria-expanded') !== 'true'; closeAll(w); setDd(w, open); });
    w.addEventListener('focusout', function (e) { if (!w.contains(e.relatedTarget)) setDd(w, false); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
  document.addEventListener('click', function (e) { if (!e.target.closest('[data-dd-wrap]')) closeAll(); });

  var tog = document.querySelector('[data-mnav-toggle]'), mnav = document.getElementById('lt-mnav');
  if (tog && mnav) tog.addEventListener('click', function () {
    var open = mnav.hidden; mnav.hidden = !open; tog.setAttribute('aria-expanded', String(open));
  });
  [].slice.call(document.querySelectorAll('[data-msub]')).forEach(function (b) {
    b.addEventListener('click', function () {
      var list = b.nextElementSibling, open = b.getAttribute('aria-expanded') !== 'true';
      if (list) list.hidden = !open; b.setAttribute('aria-expanded', String(open));
    });
  });
  [].slice.call(document.querySelectorAll('[data-faq]')).forEach(function (b) {
    b.addEventListener('click', function () {
      var a = b.nextElementSibling, open = b.getAttribute('aria-expanded') !== 'true', ic = b.querySelector('svg');
      if (a) a.hidden = !open; b.setAttribute('aria-expanded', String(open));
      if (ic) ic.classList.toggle('rotate-180', open);
    });
  });
})();
