/* Procyon Technostructure | site behaviour v5 (no dependencies) */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hoverable = window.matchMedia('(hover: hover)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  window.dataLayer = window.dataLayer || [];
  function track(event, data) { window.dataLayer.push(Object.assign({ event: event }, data || {})); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, reduce ? 0 : ms); }); }

  var markLoaded = function () { document.documentElement.classList.add('is-loaded'); };
  requestAnimationFrame(markLoaded); setTimeout(markLoaded, 120);

  /* ---------- Header ---------- */
  var hdr = $('.hdr'), sticky = $('.sticky-cta'), closing = $('#audit'), lastY = 0, mnav = $('#mnav');
  function onScroll() {
    var y = window.scrollY;
    hdr.classList.toggle('is-scrolled', y > 8);
    var anyOpen = $('.dd.is-open') || !mnav.hidden;
    hdr.classList.toggle('is-hidden', y > 400 && y > lastY && !anyOpen);
    lastY = y;
    if (sticky && closing) sticky.classList.toggle('is-on', y > 700 && closing.getBoundingClientRect().top > window.innerHeight);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Dropdowns ---------- */
  var dds = $$('.dd');
  function closeAll(except) { dds.forEach(function (d) { if (d !== except) { d.classList.remove('is-open'); $('.nav__btn', d).setAttribute('aria-expanded', 'false'); } }); }
  function openDd(d) { closeAll(d); d.classList.add('is-open'); $('.nav__btn', d).setAttribute('aria-expanded', 'true'); }
  dds.forEach(function (d) {
    var btn = $('.nav__btn', d), t;
    btn.addEventListener('click', function () { d.classList.contains('is-open') ? closeAll() : openDd(d); });
    if (hoverable) {
      d.addEventListener('mouseenter', function () { clearTimeout(t); t = setTimeout(function () { openDd(d); }, 80); });
      d.addEventListener('mouseleave', function () { clearTimeout(t); t = setTimeout(function () { d.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); }, 180); });
    }
    d.addEventListener('focusout', function (e) { if (!d.contains(e.relatedTarget)) { d.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); } });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { var o = $('.dd.is-open'); closeAll(); if (o) $('.nav__btn', o).focus(); } });
  document.addEventListener('click', function (e) { if (!e.target.closest('.dd')) closeAll(); });

  /* ---------- Mobile menu ---------- */
  var burger = $('.burger');
  function setMenu(open) {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    mnav.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
  }
  burger.addEventListener('click', function () { setMenu(burger.getAttribute('aria-expanded') !== 'true'); });
  mnav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });

  /* ---------- Count-up ---------- */
  function countUp(el, end, dur) {
    end = end == null ? parseFloat(el.getAttribute('data-count')) : end;
    if (reduce || isNaN(end)) { el.textContent = end; return; }
    var start = performance.now(); dur = dur || 1400;
    (function step(now) {
      var p = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(end * e);
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }

  /* ---------- Reveal ---------- */
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      var el = en.target;
      el.classList.add('in');
      if (el.matches('[data-meter], .facts')) $$('[data-count]', el).forEach(function (c) { countUp(c); });
      if (el.matches('[data-case]')) runCase();
      io.unobserve(el);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' }) : null;
  $$('.rv, [data-gantt], [data-sun], [data-meter], .leak').forEach(function (el) { if (io && !reduce) io.observe(el); else el.classList.add('in'); });
  if (!io || reduce) $$('[data-count]').forEach(function (el) { el.textContent = el.getAttribute('data-count'); });

  /* ---------- Client ticker: one row, each logo once, recycled as it leaves ---------- */
  var ticker = $('[data-ticker]');
  if (ticker) {
    var tTrack = $('.ticker__track', ticker), offset = 0, speed = .45, paused = false, inView = true, last = 0;
    if (reduce) document.documentElement.classList.add('no-ticker');
    else {
      ticker.addEventListener('mouseenter', function () { paused = true; });
      ticker.addEventListener('mouseleave', function () { paused = false; });
      if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { inView = en[0].isIntersecting; }).observe(ticker);
      (function tick(now) {
        var dt = last ? Math.min(64, now - last) : 16; last = now;
        if (!paused && inView && !document.hidden) {
          offset -= speed * dt / 16;
          var first = tTrack.firstElementChild, w = first.getBoundingClientRect().width;
          if (-offset >= w) { tTrack.appendChild(first); offset += w; }
          tTrack.style.transform = 'translate3d(' + offset + 'px,0,0)';
        }
        requestAnimationFrame(tick);
      })(performance.now());
    }
  }

  /* ---------- Engine stack ---------- */
  var stack = $('[data-stack]');
  if (stack) {
    var plates = $$('.plate', stack), touched = false, cyc;
    var show = function (p, byUser) {
      plates.forEach(function (x) {
        var on = x === p;
        x.classList.toggle('is-active', on); x.setAttribute('aria-expanded', String(on));
        document.getElementById(x.getAttribute('aria-controls')).classList.toggle('is-active', on);
      });
      if (byUser) { touched = true; clearInterval(cyc); track('layer_view', { layer: $('.plate__t', p).textContent }); }
    };
    plates.forEach(function (p) {
      p.addEventListener('click', function () { show(p, true); });
      if (hoverable) p.addEventListener('mouseenter', function () { if (window.innerWidth > 1080) show(p, true); });
    });
    if (!reduce && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        clearInterval(cyc);
        if (en[0].isIntersecting && !touched && window.innerWidth > 1080) {
          cyc = setInterval(function () {
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
    var was = caseEl.classList.contains('is-after');
    caseEl.classList.toggle('is-after', state === 'after');
    if (state === 'after' && !was) $$('.case__nums--after [data-count]', caseEl).forEach(function (c) { countUp(c); });
    if (byUser) track('case_toggle', { state: state });
  }
  function runCase() { setTimeout(function () { if (!caseEl.dataset.touched) setCase('after'); }, reduce ? 0 : 1600); }
  if (caseEl) {
    $$('.toggle button', caseEl).forEach(function (b) { b.addEventListener('click', function () { caseEl.dataset.touched = '1'; setCase(b.getAttribute('data-state'), true); }); });
    setCase('before');
    window.addEventListener('resize', function () { setCase(caseEl.classList.contains('is-after') ? 'after' : 'before'); });
  }

  /* ---------- Follow-the-sun hubs ---------- */
  var sun = $('[data-sun]');
  function tzOffset(tz, date) {
    var o = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(date).forEach(function (p) { o[p.type] = p.value; });
    return (Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute) - Math.floor(date.getTime() / 60000) * 60000) / 3600000;
  }
  function renderSun() {
    if (!sun) return;
    var now = new Date();
    $$('.hub', sun).forEach(function (h) {
      var tz = h.getAttribute('data-tz');
      var parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(now).split(':');
      var hr = (+parts[0]) % 24, day = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
      var weekend = day === 'Sat' || day === 'Sun', on = !weekend && hr >= 9 && hr < 18;
      $('.hub__time', h).textContent = (hr < 10 ? '0' : '') + hr + ':' + parts[1];
      $('.hub__state', h).textContent = weekend ? 'Weekend' : (on ? 'Working now' : 'Off hours');
      h.classList.toggle('is-on', on);
    });
    $$('.sun__lane', sun).forEach(function (lane) {
      var start = ((9 - tzOffset(lane.getAttribute('data-lane'), now)) % 24 + 24) % 24;
      $$('.sun__seg', lane).forEach(function (s) { s.remove(); });
      (start + 9 > 24 ? [[start, 24], [0, start + 9 - 24]] : [[start, start + 9]]).forEach(function (sg) {
        var s = document.createElement('span'); s.className = 'sun__seg';
        s.style.left = (sg[0] / 24 * 100) + '%'; s.style.width = ((sg[1] - sg[0]) / 24 * 100) + '%';
        lane.appendChild(s);
      });
    });
    $('.sun__now', sun).style.left = ((now.getUTCHours() + now.getUTCMinutes() / 60) / 24 * 100) + '%';
  }
  renderSun(); setInterval(renderSun, 30000);

  /* ---------- Magnetic primary CTA ---------- */
  if (hoverable && !reduce) $$('.magnetic').forEach(function (b) {
    b.addEventListener('mousemove', function (e) { var r = b.getBoundingClientRect(); b.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * .16) + 'px,' + ((e.clientY - r.top - r.height / 2) * .26) + 'px)'; });
    b.addEventListener('mouseleave', function () { b.style.transform = ''; });
  });

  /* ---------- UTM capture ---------- */
  var utm = '';
  try {
    var qs = new URLSearchParams(location.search), stored = JSON.parse(sessionStorage.getItem('pts_utm') || '{}');
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'li_fat_id'].forEach(function (k) { if (qs.get(k)) stored[k] = qs.get(k); });
    if (!stored.referrer && document.referrer) stored.referrer = document.referrer;
    sessionStorage.setItem('pts_utm', JSON.stringify(stored));
    utm = JSON.stringify(stored);
  } catch (err) { /* storage unavailable */ }

  function postLead(data) {
    data.utm = utm; data.page = 'home';
    return fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { if (!r.ok) throw new Error('status ' + r.status); return r.json(); });
  }
  var emailOk = function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); };
  function validate(fields) {
    var bad = [];
    fields.forEach(function (f) {
      var ok = f.value.trim() !== '' && (f.type !== 'email' || emailOk(f.value.trim()));
      f.classList.toggle('is-invalid', !ok); f.setAttribute('aria-invalid', String(!ok));
      if (!ok) bad.push(f);
    });
    return bad;
  }
  document.addEventListener('input', function (e) { if (e.target.classList && e.target.classList.contains('is-invalid') && e.target.value.trim()) { e.target.classList.remove('is-invalid'); e.target.removeAttribute('aria-invalid'); } });

  /* ---------- Hero: outcome selector + client-result card (dot chart) ---------- */
  var OUT = [
    { pct: 60, cap: 'of patient requests resolved by AI agents', src: 'Regional health system · Agentforce + Data Cloud', cta: 'Get my AI agent plan', interest: 'AI agents',
      on: 'Resolved by AI agents', off: 'Still needs a person', unit: '1 dot = 1 in 100 requests' },
    { pct: 50, cap: 'faster patient response time', src: 'Regional health system · Health Cloud', cta: 'Get my service plan', interest: 'Faster customer service',
      on: 'Waiting time removed', off: 'Waiting time left', unit: '1 dot = 1% of the old wait' },
    { pct: 70, cap: 'of high-volume repetitive work automated', src: 'Typical result across Procyon programs', cta: 'Get my automation plan', interest: 'Automation',
      on: 'Automated', off: 'Still manual', unit: '1 dot = 1% of repetitive work' },
    { pct: 40, cap: 'faster time to value on pre-built accelerators', src: 'Typical range 30 to 50% · Procyon delivery', cta: 'Get my delivery plan', interest: 'Faster delivery',
      on: 'Time saved', off: 'Delivery time left', unit: '1 dot = 1% of the usual timeline' }
  ];
  var heroEl = $('[data-hero]'), outcome = 0;
  if (heroEl) {
    var optBtns = $$('.move__opts button', heroEl), rcard = $('.rcard', heroEl), waffle = $('[data-waffle]', heroEl);
    var numEl = $('[data-orb-num]', heroEl), capEl = $('[data-orb-cap]', heroEl), srcEl = $('[data-orb-src]', heroEl), ctaEl = $('[data-plan-cta]', heroEl);
    var legOn = $('[data-leg-on]', heroEl), legOff = $('[data-leg-off]', heroEl), legUnit = $('[data-leg-unit]', heroEl);
    var heroTouched = false, heroCycle;

    /* 100 dots, 20 columns x 5 rows, filled column by column from the bottom.
       Colour runs blue to green to red across the columns, as in the brand palette bar. */
    var STOPS = [[40, 168, 222], [57, 179, 74], [188, 30, 45]], dots = [];
    var brandAt = function (t) {
      var i = t < .5 ? 0 : 1, l = t < .5 ? t * 2 : (t - .5) * 2, a = STOPS[i], b = STOPS[i + 1];
      return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * l) + ',' + Math.round(a[1] + (b[1] - a[1]) * l) + ',' + Math.round(a[2] + (b[2] - a[2]) * l) + ')';
    };
    for (var k = 0; k < 100; k++) {
      var d = document.createElement('i'), col = Math.floor(k / 5);
      d.style.gridColumn = col + 1; d.style.gridRow = 5 - (k % 5);
      d.style.setProperty('--c', brandAt(col / 19));
      waffle.appendChild(d); dots.push(d);
    }
    var paint = function (pct) {
      dots.forEach(function (dot, n) {
        var on = n < pct;
        dot.style.transitionDelay = reduce ? '0s' : (on ? n * 9 : (99 - n) * 3) + 'ms';
        dot.classList.toggle('on', on);
      });
    };

    var setOutcome = function (i, byUser) {
      outcome = i;
      var o = OUT[i];
      optBtns.forEach(function (b, n) { b.setAttribute('aria-checked', String(n === i)); b.classList.remove('is-timing'); });
      rcard.classList.remove('is-swap'); void rcard.offsetWidth; rcard.classList.add('is-swap');
      capEl.textContent = o.cap; srcEl.textContent = o.src;
      legOn.textContent = o.on; legOff.textContent = o.off; legUnit.textContent = o.unit;
      waffle.setAttribute('aria-label', o.pct + '% ' + o.cap);
      countUp(numEl, o.pct, 900);
      paint(o.pct);
      ctaEl.textContent = o.cta;
      ctaEl.parentNode.setAttribute('data-interest', o.interest);
      if (byUser) { heroTouched = true; clearTimeout(heroCycle); track('hero_outcome', { outcome: o.interest }); }
      else if (!heroTouched && !reduce) {
        void optBtns[i].offsetWidth; optBtns[i].classList.add('is-timing');
        clearTimeout(heroCycle);
        heroCycle = setTimeout(function () { if (!heroTouched) setOutcome((i + 1) % OUT.length); }, 5500);
      }
    };
    optBtns.forEach(function (b, n) { b.addEventListener('click', function () { setOutcome(n, true); }); });
    setTimeout(function () { setOutcome(0); }, reduce ? 0 : 700);

    /* The hero CTA carries the chosen outcome into the pop-up form */
    var heroCta = $('[data-hero-cta]', heroEl);
    heroCta.addEventListener('mouseenter', function () { heroTouched = true; clearTimeout(heroCycle); optBtns.forEach(function (b) { b.classList.remove('is-timing'); }); });
  }

  /* ---------- Modal ---------- */
  var modal = $('#lead-modal'), auditF = $('#lead-form'), scoreF = $('#score-form');
  var SIDE = {
    audit: ['Talk to a senior architect', ['30 minutes, no sales script', 'A written plan within a week', 'Scope, timeline and a cost range', 'Yours to keep, zero obligation']],
    score: ['Your AI readiness check', ['Six questions about your platform', 'Instant result, no email needed', 'The three fixes that unlock AI agents', 'Benchmarked against real audits']],
    'Ranger Fusion ERP': ['Your Ranger Fusion demo', ['A walkthrough on your own use case', 'Sales to finance on one data model', 'A go-live plan in 2 to 4 weeks', 'Zero obligation']],
    'Certified talent': ['Vetted profiles, fast', ['Tell us the role and seniority', 'Certified Salesforce or ServiceNow people', 'US, Canada or India time zones', 'By the seat or as a pod']]
  };
  function setSide(key) {
    var s = SIDE[key] || SIDE.audit;
    $('[data-side-h]', modal).textContent = s[0];
    $('[data-side-list]', modal).innerHTML = s[1].map(function (t) { return '<li>' + t + '</li>'; }).join('');
  }
  function openModal(mode, interest, fromHero) {
    closeAll(); setMenu(false);
    var isScore = mode === 'score';
    auditF.hidden = isScore; scoreF.hidden = !isScore;
    setSide(isScore ? 'score' : (SIDE[interest] ? interest : 'audit'));
    if (isScore) quizStart(); else auditStart(interest, fromHero);
    if (typeof modal.showModal === 'function') { if (!modal.open) modal.showModal(); } else modal.setAttribute('open', '');
    document.body.style.overflow = 'hidden';
    track('modal_open', { mode: mode, interest: interest || '' });
  }
  function closeModal() { if (modal.open) modal.close(); }
  if (modal) {
    modal.addEventListener('close', function () { document.body.style.overflow = ''; });
    modal.addEventListener('click', function (e) { if (e.target === modal || e.target.closest('[data-close]')) closeModal(); });
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-open], a[href="#audit"]');
      if (t && !modal.contains(t)) {
        e.preventDefault();
        openModal(t.getAttribute('data-open') || 'audit', t.getAttribute('data-interest') || '', t.hasAttribute('data-hero-cta'));
      }
      var tr = e.target.closest('[data-track]');
      if (tr) track('cta_click', { cta: tr.getAttribute('data-track'), interest: tr.getAttribute('data-interest') || '' });
    });
    if (location.hash === '#audit') setTimeout(function () { openModal('audit'); }, 400);
  }

  /* Contact form (single step, B2B fields) */
  var SERVICE_FOR = {
    'AI agents': 'Agentforce & AI agents', 'Automation': 'Agentforce & AI agents',
    'Faster customer service': 'Salesforce consulting & implementation', 'Faster delivery': 'Salesforce consulting & implementation',
    'Salesforce': 'Salesforce consulting & implementation', 'ServiceNow': 'ServiceNow implementation',
    'Data & integration': 'Data, integration & MuleSoft', 'Product engineering': 'Product engineering & app support',
    'Certified talent': 'Staff augmentation', 'Ranger Fusion ERP': 'Ranger Fusion ERP'
  };
  var HEAD_FOR = {
    'AI agents': ['Free 90-day plan', 'Request your AI agent plan'],
    'Faster customer service': ['Free 90-day plan', 'Request your service plan'],
    'Automation': ['Free 90-day plan', 'Request your automation plan'],
    'Faster delivery': ['Free 90-day plan', 'Request your delivery plan'],
    'Ranger Fusion ERP': ['Ranger Fusion ERP', 'Book your Ranger Fusion demo'],
    'Certified talent': ['Certified talent', 'Tell us the role you need'],
    'Product engineering': ['Product engineering', 'Tell us what you are building']
  };
  var FREE_MAIL = /@(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|msn|aol|icloud|me|mac|proton|protonmail|gmx|mail|yandex|zoho|rediffmail)\./i;
  var lfK = auditF ? $('[data-lf-k]', auditF) : null, lfT = auditF ? $('[data-lf-t]', auditF) : null;
  function auditStart(interest, fromHero) {
    if (auditF.classList.contains('is-done')) { auditF.reset(); auditF.classList.remove('is-done'); $('button[type=submit]', auditF).disabled = false; }
    $$('.is-invalid', auditF).forEach(function (f) { f.classList.remove('is-invalid'); });
    $('.qf__status', auditF).textContent = '';
    var head = (fromHero || interest === 'Ranger Fusion ERP' || interest === 'Certified talent' || interest === 'Product engineering') && HEAD_FOR[interest];
    lfK.textContent = head ? head[0] : 'Talk to a senior architect';
    lfT.textContent = head ? head[1] : 'Tell us what you are working on';
    var svc = SERVICE_FOR[interest];
    var sel = $('select[name="interest"]', auditF);
    if (svc) sel.value = svc; else if (!sel.value) sel.value = '';
    $('input[name="context"]', auditF).value = fromHero ? lfT.textContent : (interest || '');
    setTimeout(function () { var f = $('input[name="name"]', auditF); if (f && window.innerWidth > 720) f.focus({ preventScroll: true }); }, 350);
  }
  if (auditF) {
    auditF.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = $('.qf__status', auditF);
      if ($('input[name="website"]', auditF).value) return;
      var bad = validate($$('[required]', auditF));
      var em = $('input[name="email"]', auditF), ph = $('input[name="phone"]', auditF);
      if (bad.indexOf(em) < 0 && FREE_MAIL.test(em.value)) { em.classList.add('is-invalid'); bad.push(em); status.className = 'qf__status err'; status.textContent = 'Please use your business email address.'; em.focus(); return; }
      var digits = ph.value.replace(/\D/g, '');
      if (bad.indexOf(ph) < 0 && (digits.length < 7 || digits.length > 15)) { ph.classList.add('is-invalid'); status.className = 'qf__status err'; status.textContent = 'Please enter a valid phone number.'; ph.focus(); return; }
      if (bad.length) { status.className = 'qf__status err'; status.textContent = 'Please complete the highlighted fields.'; bad[0].focus(); return; }
      var btn = $('button[type=submit]', auditF); btn.disabled = true;
      status.className = 'qf__status'; status.textContent = 'Sending...';
      var d = {}; new FormData(auditF).forEach(function (v, k) { d[k] = v; });
      var parts = d.name.trim().split(/\s+/);
      var lead = { firstName: parts.shift(), lastName: parts.join(' '), company: d.company, email: d.email, phone: d.phone, interest: d.interest,
        message: (d.context ? '[' + d.context + '] ' : '') + (d.message || '') };
      postLead(lead).then(function () {
        track('generate_lead', { flow: 'contact', interest: d.interest, context: d.context });
        auditF.classList.add('is-done');
        status.className = 'qf__status';
        status.textContent = 'Thank you, ' + lead.firstName + '. A senior architect will reply within one business day.';
      }).catch(function () {
        btn.disabled = false; status.className = 'qf__status err';
        status.textContent = 'Something went wrong. Email sales@procyonts.com and we will reply the same day.';
      });
    });
  }

  /* Health score quiz */
  var QUIZ = [
    { q: 'Which platform should we check?', key: 'platform', opts: [['Salesforce'], ['ServiceNow'], ['Both'], ['Something else']] },
    { q: 'Do your teams trust the data in it?', opts: [['Yes, completely', 20], ['Mostly', 12], ['Not really', 4]],
      fix: '<b>Clean the data first.</b> Deduplicate and set ownership rules before adding any AI.' },
    { q: 'How often do people work in spreadsheets alongside it?', opts: [['Rarely', 20], ['Every week', 10], ['Every day', 2]],
      fix: '<b>Bring shadow work back in.</b> Rebuild the top three spreadsheet workflows inside the platform.' },
    { q: 'What happens when the platform upgrades?', opts: [['Smooth, no drama', 20], ['Something usually breaks', 8], ['We avoid upgrading', 2]],
      fix: '<b>Pay down customization debt.</b> Retire scripts on the upgrade path so releases stop breaking things.' },
    { q: 'How do your core systems share data?', opts: [['Real-time APIs', 20], ['Nightly batch jobs', 10], ['Manual exports', 2]],
      fix: '<b>Move to real-time integration.</b> Replace batch jobs and exports with monitored APIs.' },
    { q: 'Where is AI today?', opts: [['Agents in production', 20], ['Pilots and proofs of concept', 10], ['Not started', 4]],
      fix: '<b>Ship one agent, not a strategy deck.</b> Pick a tier-1 use case and get it live in under four weeks.' }
  ];
  var qAns = [], qCur = 0, stage = scoreF ? $('.qz__stage', scoreF) : null;
  function qProgress(n, total) { $('.qf__progress span', scoreF).style.width = (n / total * 100) + '%'; }
  function quizStart() {
    qAns = []; qCur = 0; scoreF.classList.remove('is-done');
    $('.qf__status', scoreF).textContent = '';
    renderQ();
  }
  function renderQ() {
    var item = QUIZ[qCur];
    $('.qf__count', scoreF).innerHTML = 'Question <b>' + (qCur + 1) + '</b> of ' + QUIZ.length;
    qProgress(qCur, QUIZ.length + 1);
    stage.innerHTML = '<div><p class="qz__q">' + item.q + '</p><div class="chips chips--col">' + item.opts.map(function (o, i) {
      return '<label><input type="radio" name="q' + qCur + '" value="' + i + '"' + (qAns[qCur] === i ? ' checked' : '') + '><span>' + o[0] + '</span></label>';
    }).join('') + '</div></div>';
    $('.qz__back', scoreF).hidden = qCur === 0;
    track('quiz_step', { step: qCur + 1 });
  }
  function renderResult() {
    var total = 0, scored = [];
    QUIZ.forEach(function (item, i) { if (item.fix) { var pts = item.opts[qAns[i]][1]; total += pts; scored.push({ pts: pts, fix: item.fix, i: i }); } });
    var band = total < 45 ? ['Not ready for AI yet', 'var(--red)'] : total < 75 ? ['Partly ready', 'var(--blue-ink)'] : ['Ready to scale AI agents', 'var(--green-ink)'];
    var fixes = scored.slice().sort(function (a, b) { return a.pts - b.pts || a.i - b.i; }).slice(0, 3);
    var platform = QUIZ[0].opts[qAns[0]][0];
    $('.qf__count', scoreF).textContent = 'Your result';
    qProgress(1, 1);
    $('.qz__back', scoreF).hidden = true;
    stage.innerHTML =
      '<div><div class="qz__result"><div class="ring"><svg viewBox="0 0 120 120"><circle class="ring__track" cx="60" cy="60" r="50"/><circle class="ring__val" cx="60" cy="60" r="50"/></svg><b class="ring__num">0</b></div>' +
      '<div><span class="scan__k" style="color:var(--muted)">' + platform + ' AI readiness</span><p class="qz__band" style="color:' + band[1] + '">' + band[0] + '</p>' +
      '<p class="qz__bench">In our audits, typical platforms run at 30 to 40% of licensed capability.</p></div></div>' +
      '<ol class="qz__fixes">' + fixes.map(function (f) { return '<li><span>' + f.fix + '</span></li>'; }).join('') + '</ol>' +
      '<div class="qz__send"><p>Get the full readiness report and a free 30-minute review with an architect.</p>' +
      '<div class="qf__row"><label><span>First name</span><input name="firstName" autocomplete="given-name" required></label><label><span>Work email</span><input name="email" type="email" autocomplete="email" required></label></div>' +
      '<label><span>Company</span><input name="company" autocomplete="organization" required></label>' +
      '<label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>' +
      '<button class="btn btn--red btn--block" type="submit">Send me the full report <i aria-hidden="true">&rarr;</i></button></div></div>';
    var rv = $('.ring__val', stage), rn = $('.ring__num', stage);
    setTimeout(function () { rv.style.strokeDashoffset = 314.16 * (1 - total / 100); countUp(rn, total, 1300); }, 120);
    scoreF.dataset.score = total; scoreF.dataset.band = band[0]; scoreF.dataset.platform = platform;
    track('quiz_result', { score: total, platform: platform });
  }
  if (scoreF) {
    scoreF.addEventListener('change', function (e) {
      if (!/^q\d+$/.test(e.target.name)) return;
      qAns[qCur] = +e.target.value;
      setTimeout(function () { if (qCur < QUIZ.length - 1) { qCur++; renderQ(); } else renderResult(); }, 240);
    });
    $('.qz__back', scoreF).addEventListener('click', function () { if (qCur > 0) { qCur--; renderQ(); } });
    scoreF.addEventListener('submit', function (e) {
      e.preventDefault();
      var status = $('.qf__status', scoreF);
      var bad = validate($$('[required]', stage));
      if (bad.length) { status.className = 'qf__status err'; status.textContent = 'Please complete the highlighted fields.'; bad[0].focus(); return; }
      if ($('input[name="website"]', stage).value) return;
      var btn = $('button[type=submit]', stage); btn.disabled = true;
      status.className = 'qf__status'; status.textContent = 'Sending...';
      var answers = QUIZ.map(function (item, i) { return item.q + ' ' + item.opts[qAns[i]][0]; }).join(' | ');
      postLead({
        firstName: $('input[name="firstName"]', stage).value, email: $('input[name="email"]', stage).value, company: $('input[name="company"]', stage).value,
        interest: 'AI readiness ' + scoreF.dataset.score + '/100 (' + scoreF.dataset.platform + ')',
        message: '[' + scoreF.dataset.band + '] ' + answers
      }).then(function () {
        track('generate_lead', { flow: 'score', score: scoreF.dataset.score });
        scoreF.classList.add('is-done');
        status.className = 'qf__status';
        status.textContent = 'Report on its way. An architect will reach out within one business day to walk you through it.';
      }).catch(function () {
        btn.disabled = false; status.className = 'qf__status err';
        status.textContent = 'Something went wrong. Email sales@procyonts.com and we will reply the same day.';
      });
    });
  }
})();
