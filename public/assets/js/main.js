/* Procyon Technostructure | site behaviour (no dependencies) */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.dataLayer = window.dataLayer || [];
  function track(event, data) { window.dataLayer.push(Object.assign({ event: event }, data || {})); }

  /* ---------- Header shadow on scroll + sticky mobile CTA ---------- */
  var header = document.querySelector('.site-header');
  var sticky = document.querySelector('.sticky-cta');
  var contact = document.getElementById('contact');
  var onScroll = function () {
    var y = window.scrollY;
    header.classList.toggle('is-scrolled', y > 8);
    if (sticky && contact) {
      var c = contact.getBoundingClientRect();
      sticky.classList.toggle('is-on', y > 600 && c.top > window.innerHeight);
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Mega menus ---------- */
  var items = Array.prototype.slice.call(document.querySelectorAll('.has-mega'));
  var closeAll = function (except) {
    items.forEach(function (li) {
      if (li === except) return;
      li.classList.remove('is-open');
      li.querySelector('.nav__trigger').setAttribute('aria-expanded', 'false');
    });
  };
  var open = function (li) {
    closeAll(li);
    li.classList.add('is-open');
    li.querySelector('.nav__trigger').setAttribute('aria-expanded', 'true');
  };
  var hoverable = window.matchMedia('(hover: hover)').matches;
  items.forEach(function (li) {
    var btn = li.querySelector('.nav__trigger');
    var timer;
    btn.addEventListener('click', function () {
      li.classList.contains('is-open') ? closeAll() : open(li);
    });
    if (hoverable) {
      li.addEventListener('mouseenter', function () { clearTimeout(timer); timer = setTimeout(function () { open(li); }, 90); });
      li.addEventListener('mouseleave', function () { clearTimeout(timer); timer = setTimeout(function () { li.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }, 160); });
    }
    li.addEventListener('focusout', function (e) { if (!li.contains(e.relatedTarget)) { li.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); } });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var openLi = document.querySelector('.has-mega.is-open');
      closeAll();
      if (openLi) openLi.querySelector('.nav__trigger').focus();
    }
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.has-mega')) closeAll(); });

  /* ---------- Mobile menu ---------- */
  var burger = document.querySelector('.burger');
  var mnav = document.getElementById('mnav');
  if (burger && mnav) {
    burger.addEventListener('click', function () {
      var isOpen = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!isOpen));
      burger.setAttribute('aria-label', isOpen ? 'Open menu' : 'Close menu');
      mnav.hidden = isOpen;
      document.body.style.overflow = isOpen ? '' : 'hidden';
    });
    mnav.addEventListener('click', function (e) {
      if (e.target.closest('a')) { burger.setAttribute('aria-expanded', 'false'); mnav.hidden = true; document.body.style.overflow = ''; }
    });
  }

  /* ---------- Tabs (WAI-ARIA pattern) ---------- */
  document.querySelectorAll('[data-tabs]').forEach(function (root) {
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var select = function (tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
      });
      if (focus) tab.focus();
      track('service_tab_view', { tab: tab.textContent.trim() });
    };
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab); });
      tab.addEventListener('keydown', function (e) {
        var n = null;
        if (e.key === 'ArrowRight') n = tabs[(i + 1) % tabs.length];
        if (e.key === 'ArrowLeft') n = tabs[(i - 1 + tabs.length) % tabs.length];
        if (e.key === 'Home') n = tabs[0];
        if (e.key === 'End') n = tabs[tabs.length - 1];
        if (n) { e.preventDefault(); select(n, true); }
      });
    });
  });

  /* ---------- Logo marquee: duplicate for a seamless loop ---------- */
  var row = document.querySelector('.logos__row');
  if (row && !reduce) {
    Array.prototype.slice.call(row.children).forEach(function (img) {
      var c = img.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      c.removeAttribute('role');
      c.alt = '';
      row.appendChild(c);
    });
  }

  /* ---------- Intent links prefill the form ---------- */
  var form = document.getElementById('lead-form');
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-interest]');
    if (a && form) {
      var sel = form.querySelector('select[name="interest"]');
      var v = a.getAttribute('data-interest');
      Array.prototype.forEach.call(sel.options, function (o) { if (o.text === v) sel.value = o.value || o.text; });
    }
    var t = e.target.closest('[data-track]');
    if (t) track('cta_click', { cta: t.getAttribute('data-track'), interest: t.getAttribute('data-interest') || '' });
  });

  /* ---------- Lead form ---------- */
  if (form) {
    var utm = form.querySelector('input[name="utm"]');
    try {
      var qs = new URLSearchParams(location.search);
      var keep = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'li_fat_id'];
      var stored = JSON.parse(sessionStorage.getItem('pts_utm') || '{}');
      keep.forEach(function (k) { if (qs.get(k)) stored[k] = qs.get(k); });
      if (!stored.referrer && document.referrer) stored.referrer = document.referrer;
      sessionStorage.setItem('pts_utm', JSON.stringify(stored));
      utm.value = JSON.stringify(stored);
    } catch (err) { /* storage unavailable: carry on */ }

    var status = form.querySelector('.form__status');
    var emailOk = function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = [];
      form.querySelectorAll('[required]').forEach(function (f) {
        var ok = f.value.trim() !== '' && (f.type !== 'email' || emailOk(f.value.trim()));
        f.classList.toggle('is-invalid', !ok);
        f.setAttribute('aria-invalid', String(!ok));
        if (!ok) bad.push(f);
      });
      if (bad.length) {
        status.className = 'form__status err';
        status.textContent = 'Please complete the highlighted fields.';
        bad[0].focus();
        return;
      }
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      status.className = 'form__status';
      status.textContent = 'Sending...';
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw new Error('bad status'); return r.json(); })
        .then(function () {
          track('generate_lead', { interest: data.interest });
          form.classList.add('is-done');
          status.className = 'form__status ok';
          status.textContent = 'Thanks, ' + data.firstName + '. A senior consultant will reply within one business day.';
        })
        .catch(function () {
          btn.disabled = false;
          status.className = 'form__status err';
          status.textContent = 'Something went wrong. Email sales@procyonts.com and we will reply the same day.';
        });
    });
    form.addEventListener('input', function (e) { if (e.target.classList.contains('is-invalid') && e.target.value.trim()) { e.target.classList.remove('is-invalid'); e.target.removeAttribute('aria-invalid'); } });
  }

  /* ---------- Hero dot sphere (echoes the logo mark) ---------- */
  var canvas = document.querySelector('.hero__sphere');
  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext('2d');
    var stops = [[40, 168, 222], [57, 179, 74], [188, 30, 45]]; // blue -> green -> red (bottom to top, as in the mark)
    var mix = function (t) {
      t = Math.max(0, Math.min(1, t));
      var seg = t < .5 ? 0 : 1, lt = t < .5 ? t * 2 : (t - .5) * 2;
      var a = stops[seg], b = stops[seg + 1];
      return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * lt) + ',' + Math.round(a[1] + (b[1] - a[1]) * lt) + ',' + Math.round(a[2] + (b[2] - a[2]) * lt) + ')';
    };
    var pts = [];
    var LAT = 26, LON = 52;
    for (var i = 1; i < LAT; i++) {
      var phi = Math.PI * i / LAT;
      for (var j = 0; j < LON; j++) pts.push([phi, 2 * Math.PI * j / LON]);
    }
    var size, dpr, running = true, rot = 0.6, visible = true;
    var resize = function () {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      size = canvas.clientWidth;
      canvas.width = size * dpr; canvas.height = size * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    var draw = function () {
      ctx.clearRect(0, 0, size, size);
      var R = size * 0.42, cx = size / 2, cy = size / 2;
      var tilt = -0.42, ct = Math.cos(tilt), st = Math.sin(tilt);
      for (var k = 0; k < pts.length; k++) {
        var phi = pts[k][0], th = pts[k][1] + rot;
        var x = Math.sin(phi) * Math.cos(th), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(th);
        var y2 = y * ct - z * st, z2 = y * st + z * ct; // tilt around X
        var x2 = x * Math.cos(.5) - y2 * Math.sin(.5), y3 = x * Math.sin(.5) + y2 * Math.cos(.5); // roll
        if (z2 < 0.05) continue;
        // crescent: only keep the lit side of the sphere, like the logo
        var lit = x2 * 0.85 + z2 * 0.55;
        if (lit < 0.18) continue;
        var r = (0.6 + z2 * 2.6) * (size / 760) * 1.6 * Math.min(1, (lit - 0.18) * 3 + 0.25);
        ctx.globalAlpha = Math.min(1, 0.25 + z2 * 0.9);
        ctx.fillStyle = mix((1 - (y3 + 1) / 2));
        ctx.beginPath();
        ctx.ellipse(cx + x2 * R, cy - y3 * R, r * (0.55 + z2 * 0.45), r, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    var loop = function () {
      if (!running) return;
      if (visible) { rot += 0.0016; draw(); }
      requestAnimationFrame(loop);
    };
    resize(); draw();
    window.addEventListener('resize', function () { resize(); draw(); });
    if (!reduce) {
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(canvas);
      }
      document.addEventListener('visibilitychange', function () { visible = !document.hidden; });
      requestAnimationFrame(loop);
    }
  }
})();
