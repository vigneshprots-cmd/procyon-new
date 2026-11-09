/* Procyon Technostructure | site behaviour v3 (no dependencies) */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  window.dataLayer = window.dataLayer || [];
  function track(event, data) { window.dataLayer.push(Object.assign({ event: event }, data || {})); }

  var markLoaded = function () { document.documentElement.classList.add('is-loaded'); };
  requestAnimationFrame(markLoaded); setTimeout(markLoaded, 120);

  /* ---------- Header: shadow, hide on scroll down, sticky CTA ---------- */
  var hdr = $('.hdr'), sticky = $('.sticky-cta'), audit = $('#audit'), lastY = 0;
  function onScroll() {
    var y = window.scrollY;
    hdr.classList.toggle('is-scrolled', y > 8);
    var anyOpen = $('.dd.is-open') || !$('#mnav').hidden;
    hdr.classList.toggle('is-hidden', y > 400 && y > lastY && !anyOpen);
    lastY = y;
    if (sticky && audit) sticky.classList.toggle('is-on', y > 700 && audit.getBoundingClientRect().top > window.innerHeight);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Dropdowns ---------- */
  var dds = $$('.dd');
  function closeAll(except) {
    dds.forEach(function (d) { if (d !== except) { d.classList.remove('is-open'); $('.nav__btn', d).setAttribute('aria-expanded', 'false'); } });
  }
  function openDd(d) { closeAll(d); d.classList.add('is-open'); $('.nav__btn', d).setAttribute('aria-expanded', 'true'); }
  var hoverable = window.matchMedia('(hover: hover)').matches;
  dds.forEach(function (d) {
    var btn = $('.nav__btn', d), t;
    btn.addEventListener('click', function () { d.classList.contains('is-open') ? closeAll() : openDd(d); });
    if (hoverable) {
      d.addEventListener('mouseenter', function () { clearTimeout(t); t = setTimeout(function () { openDd(d); }, 80); });
      d.addEventListener('mouseleave', function () { clearTimeout(t); t = setTimeout(function () { d.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }, 180); });
    }
    d.addEventListener('focusout', function (e) { if (!d.contains(e.relatedTarget)) { d.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); } });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var o = $('.dd.is-open'); closeAll(); if (o) $('.nav__btn', o).focus();
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.dd')) closeAll(); });

  /* ---------- Mobile menu ---------- */
  var burger = $('.burger'), mnav = $('#mnav');
  burger.addEventListener('click', function () {
    var open = burger.getAttribute('aria-expanded') === 'true';
    burger.setAttribute('aria-expanded', String(!open));
    burger.setAttribute('aria-label', open ? 'Open menu' : 'Close menu');
    mnav.hidden = open;
    document.body.style.overflow = open ? '' : 'hidden';
  });
  mnav.addEventListener('click', function (e) {
    if (e.target.closest('a')) { burger.setAttribute('aria-expanded', 'false'); mnav.hidden = true; document.body.style.overflow = ''; }
  });

  /* ---------- Count-up ---------- */
  function countUp(el) {
    var end = parseFloat(el.getAttribute('data-count'));
    if (reduce || isNaN(end)) { el.textContent = end; return; }
    var start = performance.now(), dur = 1400;
    (function step(now) {
      var p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(end * e);
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }

  /* ---------- Reveal on scroll ---------- */
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var el = en.target;
      el.classList.add('in');
      if (el.matches('[data-meter]')) $$('[data-count]', el).forEach(countUp);
      if (el.matches('.facts')) $$('[data-count]', el).forEach(countUp);
      if (el.matches('[data-case]')) runCase(el);
      io.unobserve(el);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' }) : null;
  $$('.rv, [data-gantt], [data-sun], [data-meter], .leak').forEach(function (el) {
    if (io && !reduce) io.observe(el); else el.classList.add('in');
  });
  if (!io || reduce) { $$('[data-count]').forEach(function (el) { el.textContent = el.getAttribute('data-count'); }); }

  /* ---------- Stack (five layers) ---------- */
  var stack = $('[data-stack]');
  if (stack) {
    var plates = $$('.plate', stack), userTouched = false, cycle;
    function show(p, byUser) {
      plates.forEach(function (x) {
        var on = x === p;
        x.classList.toggle('is-active', on);
        x.setAttribute('aria-expanded', String(on));
        document.getElementById(x.getAttribute('aria-controls')).classList.toggle('is-active', on);
      });
      if (byUser) { userTouched = true; clearInterval(cycle); track('layer_view', { layer: $('.plate__t', p).textContent }); }
    }
    plates.forEach(function (p) {
      p.addEventListener('click', function () { show(p, true); });
      if (hoverable) p.addEventListener('mouseenter', function () { if (window.innerWidth > 1080) show(p, true); });
    });
    // Gentle auto-advance until the visitor interacts, only while visible and on desktop
    if (!reduce && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        clearInterval(cycle);
        if (en[0].isIntersecting && !userTouched && window.innerWidth > 1080) {
          cycle = setInterval(function () {
            var i = plates.findIndex(function (x) { return x.classList.contains('is-active'); });
            show(plates[(i + 1) % plates.length]);
          }, 5200);
        }
      }, { threshold: 0.4 }).observe(stack);
    }
  }

  /* ---------- Case study before / after ---------- */
  var caseEl = $('[data-case]');
  function setCase(state, byUser) {
    if (!caseEl) return;
    var btns = $$('.toggle button', caseEl), thumb = $('.toggle__thumb', caseEl);
    btns.forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-state') === state)); });
    var active = btns.filter(function (b) { return b.getAttribute('data-state') === state; })[0];
    thumb.style.setProperty('--tw', active.offsetWidth + 'px');
    thumb.style.setProperty('--tx', (active.offsetLeft - 4) + 'px');
    var wasAfter = caseEl.classList.contains('is-after');
    caseEl.classList.toggle('is-after', state === 'after');
    if (state === 'after' && !wasAfter) $$('.case__nums--after [data-count]', caseEl).forEach(countUp);
    if (byUser) track('case_toggle', { state: state });
  }
  function runCase() { if (!reduce) setTimeout(function () { if (!caseEl.dataset.touched) setCase('after'); }, 1600); else setCase('after'); }
  if (caseEl) {
    $$('.toggle button', caseEl).forEach(function (b) {
      b.addEventListener('click', function () { caseEl.dataset.touched = '1'; setCase(b.getAttribute('data-state'), true); });
    });
    setCase('before');
    window.addEventListener('resize', function () { setCase(caseEl.classList.contains('is-after') ? 'after' : 'before'); });
  }

  /* ---------- Follow-the-sun hubs ---------- */
  var sun = $('[data-sun]');
  function tzOffsetHours(tz, date) {
    var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(date);
    var o = {}; parts.forEach(function (p) { o[p.type] = p.value; });
    var asUTC = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute);
    return (asUTC - Math.floor(date.getTime() / 60000) * 60000) / 3600000;
  }
  function renderSun() {
    if (!sun) return;
    var now = new Date();
    $$('.hub', sun).forEach(function (h) {
      var tz = h.getAttribute('data-tz');
      var t = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
      var parts = t.split(':'), hr = (+parts[0]) % 24;
      var day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
      var weekend = day === 'Sat' || day === 'Sun';
      var on = !weekend && hr >= 9 && hr < 18;
      $('.hub__time', h).textContent = (hr < 10 ? '0' : '') + hr + ':' + parts[1];
      $('.hub__state', h).textContent = weekend ? 'Weekend' : (on ? 'Working now' : 'Off hours');
      h.classList.toggle('is-on', on);
    });
    $$('.sun__lane', sun).forEach(function (lane) {
      var off = tzOffsetHours(lane.getAttribute('data-lane'), now);
      var startUTC = ((9 - off) % 24 + 24) % 24; // 09:00 local in UTC hours
      $$('.sun__seg', lane).forEach(function (s) { s.remove(); });
      var segs = startUTC + 9 > 24 ? [[startUTC, 24], [0, startUTC + 9 - 24]] : [[startUTC, startUTC + 9]];
      segs.forEach(function (sg) {
        var s = document.createElement('span');
        s.className = 'sun__seg';
        s.style.left = (sg[0] / 24 * 100) + '%';
        s.style.width = ((sg[1] - sg[0]) / 24 * 100) + '%';
        lane.appendChild(s);
      });
    });
    var utcH = now.getUTCHours() + now.getUTCMinutes() / 60;
    $('.sun__now', sun).style.left = (utcH / 24 * 100) + '%';
  }
  renderSun();
  setInterval(renderSun, 30000);

  /* ---------- Marquee duplication ---------- */
  var row = $('.marquee__row');
  if (row && !reduce) $$('img', row).forEach(function (img) { var c = img.cloneNode(true); c.alt = ''; c.removeAttribute('role'); c.setAttribute('aria-hidden', 'true'); row.appendChild(c); });

  /* ---------- Magnetic primary CTA ---------- */
  if (hoverable && !reduce) $$('.magnetic').forEach(function (b) {
    b.addEventListener('mousemove', function (e) {
      var r = b.getBoundingClientRect();
      b.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * .18) + 'px,' + ((e.clientY - r.top - r.height / 2) * .28) + 'px)';
    });
    b.addEventListener('mouseleave', function () { b.style.transform = ''; });
  });

  /* ---------- Multi-step lead form ---------- */
  var form = $('#lead-form');
  if (form) {
    var steps = $$('.qf__step', form), bar = $('.qf__progress span', form), count = $('.qf__count b', form), status = $('.qf__status', form);
    var cur = 1;
    function go(n) {
      cur = n;
      steps.forEach(function (s) { s.classList.toggle('is-on', +s.getAttribute('data-step') === n); });
      bar.style.width = (n / 3 * 100) + '%';
      count.textContent = n;
      status.textContent = '';
      track('form_step', { step: n });
      if (n === 3) setTimeout(function () { var f = form.querySelector('input[name="firstName"]'); if (f) f.focus({ preventScroll: true }); }, 350);
    }
    form.addEventListener('change', function (e) {
      if (e.target.name === 'interest' && cur === 1) setTimeout(function () { go(2); }, 220);
      if (e.target.name === 'timeline' && cur === 2) setTimeout(function () { go(3); }, 220);
    });
    $$('.qf__back', form).forEach(function (b) { b.addEventListener('click', function () { go(Math.max(1, cur - 1)); }); });

    // Intent links preselect the first step
    document.addEventListener('click', function (e) {
      var a = e.target.closest('[data-interest]');
      if (a) {
        var v = a.getAttribute('data-interest');
        var r = $$('input[name="interest"]', form).filter(function (x) { return x.value === v; })[0];
        if (r) { r.checked = true; go(2); }
      }
      var t = e.target.closest('[data-track]');
      if (t) track('cta_click', { cta: t.getAttribute('data-track'), interest: t.getAttribute('data-interest') || '' });
    });

    // UTM capture
    try {
      var qs = new URLSearchParams(location.search), stored = JSON.parse(sessionStorage.getItem('pts_utm') || '{}');
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'li_fat_id'].forEach(function (k) { if (qs.get(k)) stored[k] = qs.get(k); });
      if (!stored.referrer && document.referrer) stored.referrer = document.referrer;
      sessionStorage.setItem('pts_utm', JSON.stringify(stored));
      form.querySelector('input[name="utm"]').value = JSON.stringify(stored);
    } catch (err) { /* storage unavailable */ }

    var emailOk = function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = [];
      $$('.qf__step[data-step="3"] [required]', form).forEach(function (f) {
        var ok = f.value.trim() !== '' && (f.type !== 'email' || emailOk(f.value.trim()));
        f.classList.toggle('is-invalid', !ok); f.setAttribute('aria-invalid', String(!ok));
        if (!ok) bad.push(f);
      });
      if (!form.querySelector('input[name="interest"]:checked')) { go(1); status.className = 'qf__status err'; status.textContent = 'Pick where the pain is first.'; return; }
      if (bad.length) { status.className = 'qf__status err'; status.textContent = 'Please complete the highlighted fields.'; bad[0].focus(); return; }
      var btn = form.querySelector('button[type="submit"]'); btn.disabled = true;
      status.className = 'qf__status'; status.textContent = 'Sending...';
      var data = {}; new FormData(form).forEach(function (v, k) { data[k] = v; });
      if (data.timeline) data.message = '[Timeline: ' + data.timeline + '] ' + (data.message || '');
      fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { if (!r.ok) throw new Error('status ' + r.status); return r.json(); })
        .then(function () {
          track('generate_lead', { interest: data.interest, timeline: data.timeline });
          form.classList.add('is-done');
          status.className = 'qf__status';
          status.textContent = 'Got it, ' + data.firstName + '. A senior architect will reply within one business day.';
        })
        .catch(function () {
          btn.disabled = false; status.className = 'qf__status err';
          status.textContent = 'Something went wrong. Email sales@procyonts.com and we will reply the same day.';
        });
    });
    form.addEventListener('input', function (e) { if (e.target.classList.contains('is-invalid') && e.target.value.trim()) { e.target.classList.remove('is-invalid'); e.target.removeAttribute('aria-invalid'); } });
  }

  /* ---------- Hero: scattered systems converge into the Procyon sphere ---------- */
  var hero = $('.hero'), canvas = $('.hero__canvas');
  if (canvas && canvas.getContext) {
    var ctx = canvas.getContext('2d');
    var stops = [[40, 168, 222], [57, 179, 74], [188, 30, 45]];
    var grey = [92, 100, 110];
    function brand(t) {
      t = Math.max(0, Math.min(1, t));
      var i = t < .5 ? 0 : 1, l = t < .5 ? t * 2 : (t - .5) * 2, a = stops[i], b = stops[i + 1];
      return [a[0] + (b[0] - a[0]) * l, a[1] + (b[1] - a[1]) * l, a[2] + (b[2] - a[2]) * l];
    }
    function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; }
    var clusters = [[.42, .17], [.66, .09], [.9, .3], [.42, .7], [.66, .9], [.9, .72]];
    var W, H, dpr, pts = [], mouse = { x: -1e4, y: -1e4 };
    function build() {
      pts = [];
      var LAT = window.innerWidth < 720 ? 18 : 26, LON = window.innerWidth < 720 ? 36 : 52;
      var k = 0;
      for (var i = 1; i < LAT; i++) for (var j = 0; j < LON; j++) {
        var c = clusters[k % clusters.length];
        pts.push({
          phi: Math.PI * i / LAT, th: 2 * Math.PI * j / LON,
          cx: c[0] + gauss() * .09, cy: c[1] + gauss() * .08,
          ph: Math.random() * 6.28, d: Math.random() * .35, x: 0, y: 0
        });
        k++;
      }
    }
    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    var t0 = null, rot = .6, DELAY = 700, DUR = 2600, ordered = false;
    function ease(x) { return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
    function frame(now) {
      if (t0 === null) t0 = now;
      var el = reduce ? 1e9 : now - t0;
      var P = Math.max(0, Math.min(1, (el - DELAY) / DUR));
      if (P > .55 && !ordered) { ordered = true; hero.classList.add('is-ordered'); }
      ctx.clearRect(0, 0, W, H);
      var R = Math.min(W * .36, H * .42), scx = W * (W > 700 ? .62 : .5), scy = H * .5;
      var tilt = -.42, ct = Math.cos(tilt), st = Math.sin(tilt), cr = Math.cos(.5), sr = Math.sin(.5);
      var time = now / 1000;
      for (var n = 0; n < pts.length; n++) {
        var p = pts[n];
        var pp = ease(Math.max(0, Math.min(1, (P - p.d * .6) / (1 - p.d * .6))));
        var th = p.th + rot;
        var x = Math.sin(p.phi) * Math.cos(th), y = Math.cos(p.phi), z = Math.sin(p.phi) * Math.sin(th);
        var y2 = y * ct - z * st, z2 = y * st + z * ct;
        var x2 = x * cr - y2 * sr, y3 = x * sr + y2 * cr;
        var lit = x2 * .85 + z2 * .55;
        var vis = (z2 > .05 && lit > .18) ? Math.min(1, .25 + z2 * .9) : 0;
        var tx = scx + x2 * R, ty = scy - y3 * R;
        var hx = p.cx * W + Math.sin(time * .7 + p.ph) * 6, hy = p.cy * H + Math.cos(time * .6 + p.ph) * 6;
        var px = hx + (tx - hx) * pp, py = hy + (ty - hy) * pp;
        var dx = px - mouse.x, dy = py - mouse.y, dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 110) { var f = (110 - dist) / 110 * 22; px += dx / (dist || 1) * f; py += dy / (dist || 1) * f; }
        var alpha = .5 * (1 - pp) + vis * pp;
        if (alpha < .02) continue;
        var bc = brand((y3 + 1) / 2);
        var r = Math.round(grey[0] + (bc[0] - grey[0]) * pp), g = Math.round(grey[1] + (bc[1] - grey[1]) * pp), b = Math.round(grey[2] + (bc[2] - grey[2]) * pp);
        var size = (1.4 * (1 - pp)) + pp * (.7 + z2 * 2.6) * (R / 300) * 1.7 * Math.min(1, Math.max(.25, (lit - .18) * 3 + .25));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
        ctx.beginPath();
        ctx.ellipse(px, py, Math.max(.6, size * (pp ? (.55 + Math.max(0, z2) * .45) : 1)), Math.max(.6, size), 0, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (P >= 1) rot += .0022;
    }
    var visible = true;
    function loop(now) { if (visible) frame(now); if (!reduce) requestAnimationFrame(loop); }
    build(); resize();
    window.addEventListener('resize', function () { resize(); });
    canvas.parentElement.addEventListener('mousemove', function (e) { var r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
    canvas.parentElement.addEventListener('mouseleave', function () { mouse.x = mouse.y = -1e4; });
    hero.addEventListener('mousemove', function (e) { var r = canvas.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
    hero.addEventListener('mouseleave', function () { mouse.x = mouse.y = -1e4; });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(hero);
    document.addEventListener('visibilitychange', function () { visible = !document.hidden; });
    if (reduce) { hero.classList.add('is-ordered'); frame(performance.now()); } else requestAnimationFrame(loop);
  }
})();
