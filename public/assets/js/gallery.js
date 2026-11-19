/* Procyon | Post photo galleries: collapse long strips, open photos and videos in an accessible lightbox.
   Markup comes from scripts/build-insights.js (section.pgal[data-pg] > ul.pgal__grid > li > a.pgal__tile[data-pg-item]).
   Without this script every tile is a plain link to the full-size file. */
(function () {
  'use strict';
  var strips = document.querySelectorAll('[data-pg]');
  if (!strips.length) return;

  // Long strips show the first rows with a "Show all" button.
  Array.prototype.forEach.call(strips, function (strip) {
    var n = strip.querySelectorAll('[data-pg-item]').length;
    if (!strip.hasAttribute('data-pg-collapse') || n <= 6) return;
    strip.classList.add('pgal--collapsed');
    var more = document.createElement('button');
    more.type = 'button';
    more.className = 'pgal__more';
    more.textContent = 'Show all ' + n;
    more.setAttribute('aria-expanded', 'false');
    more.addEventListener('click', function () {
      var open = strip.classList.toggle('pgal--collapsed') === false;
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'Show fewer' : 'Show all ' + n;
      if (!open) strip.scrollIntoView({ block: 'nearest' });
    });
    strip.appendChild(more);
  });

  var box, stage, foot, count, btnPrev, btnNext, btnClose, items = [], index = 0, opener = null, lastFocus = null;

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; }
  function build() {
    box = el('div', 'pglb');
    box.hidden = true;
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', 'Photo viewer');
    var bar = el('div', 'pglb__bar');
    count = el('span', 'pglb__count');
    count.setAttribute('aria-live', 'polite');
    btnClose = el('button', 'pglb__close', '&times;');
    btnClose.type = 'button';
    btnClose.setAttribute('aria-label', 'Close');
    bar.appendChild(count); bar.appendChild(btnClose);
    stage = el('div', 'pglb__stage');
    btnPrev = el('button', 'pglb__prev', '&#8249;'); btnPrev.type = 'button'; btnPrev.setAttribute('aria-label', 'Previous');
    btnNext = el('button', 'pglb__next', '&#8250;'); btnNext.type = 'button'; btnNext.setAttribute('aria-label', 'Next');
    foot = el('div', 'pglb__foot');
    box.appendChild(bar); box.appendChild(stage); box.appendChild(foot);
    box.appendChild(btnPrev); box.appendChild(btnNext);
    // keep nav buttons inside the stage row for positioning
    stage.appendChild(btnPrev); stage.appendChild(btnNext);
    document.body.appendChild(box);

    btnClose.addEventListener('click', close);
    btnPrev.addEventListener('click', function () { go(-1); });
    btnNext.addEventListener('click', function () { go(1); });
    box.addEventListener('click', function (e) { if (e.target === box || e.target === stage) close(); });
    box.addEventListener('keydown', onKey);

    // Swipe: horizontal drag of 50px or more changes the item.
    var x0 = null, y0 = null;
    stage.addEventListener('touchstart', function (e) { if (e.touches.length === 1) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } }, { passive: true });
    stage.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.2) go(dx < 0 ? 1 : -1);
      else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) close();
    }, { passive: true });
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'Home') { e.preventDefault(); show(0); }
    else if (e.key === 'End') { e.preventDefault(); show(items.length - 1); }
    else if (e.key === 'Tab') {
      var f = Array.prototype.filter.call(box.querySelectorAll('button, video[controls]'), function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function data(a) {
    return {
      href: a.getAttribute('href'), video: a.hasAttribute('data-video'), poster: a.getAttribute('data-poster') || '',
      alt: a.getAttribute('data-alt') || '', caption: a.getAttribute('data-caption') || ''
    };
  }
  function preload(i) {
    var d = items[i];
    if (d && !d.video) { var im = new Image(); im.decoding = 'async'; im.src = d.href; }
  }
  function show(i) {
    if (!items.length) return;
    index = (i + items.length) % items.length;
    var d = items[index];
    stage.classList.remove('is-ready');
    Array.prototype.forEach.call(stage.querySelectorAll('img, video, .pglb__spin'), function (n) { n.remove(); });
    stage.insertBefore(el('span', 'pglb__spin'), btnPrev);
    var media;
    if (d.video) {
      media = document.createElement('video');
      media.controls = true; media.playsInline = true; media.preload = 'metadata';
      if (d.poster) media.poster = d.poster;
      media.src = d.href;
      media.setAttribute('aria-label', d.alt || 'Video');
      media.addEventListener('loadedmetadata', function () { stage.classList.add('is-ready'); });
      media.addEventListener('error', function () { stage.classList.add('is-ready'); });
    } else {
      media = new Image();
      media.alt = d.alt;
      media.decoding = 'async';
      media.onload = media.onerror = function () { stage.classList.add('is-ready'); };
      media.src = d.href;
    }
    media.draggable = false;
    stage.insertBefore(media, btnPrev);
    count.textContent = (index + 1) + ' / ' + items.length;
    foot.innerHTML = '';
    if (d.caption) foot.appendChild(document.createTextNode(d.caption));
    if (d.alt && d.alt !== d.caption) { var s = el('small'); s.textContent = d.alt; foot.appendChild(s); }
    var single = items.length < 2;
    btnPrev.hidden = single; btnNext.hidden = single;
    preload(index + 1); preload(index - 1);
  }
  function go(step) { show(index + step); }

  function open(strip, a) {
    if (!box) build();
    var links = strip.querySelectorAll('[data-pg-item]');
    items = Array.prototype.map.call(links, data);
    opener = a;
    lastFocus = document.activeElement;
    box.hidden = false;
    document.documentElement.classList.add('pglb-lock');
    show(Array.prototype.indexOf.call(links, a));
    void box.offsetWidth; // start the fade from opacity 0
    box.classList.add('is-open');
    btnClose.focus();
  }
  function close() {
    if (!box || box.hidden) return;
    var v = stage.querySelector('video'); if (v) v.pause();
    box.classList.remove('is-open');
    box.hidden = true;
    document.documentElement.classList.remove('pglb-lock');
    var back = opener || lastFocus;
    if (back && back.focus) back.focus();
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('[data-pg-item]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    var strip = a.closest('[data-pg]');
    if (!strip) return;
    e.preventDefault();
    open(strip, a);
  });
})();
