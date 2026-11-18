/* Procyon Technostructure | inner page widgets (no dependencies).
   Every widget ends in the same pop-up form as the home page, via window.ptsOpenModal (main.js). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var track = function (event, data) { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: event }, data || {})); };
  var open = function (interest, opts) { if (window.ptsOpenModal) window.ptsOpenModal('audit', interest, opts); };
  var swap = function (el) { if (!el) return; el.classList.remove('is-swap'); void el.offsetWidth; el.classList.add('is-swap'); };

  /* ---------- Single-choice picker: recommends a path and re-labels the CTA ---------- */
  $$('[data-picker]').forEach(function (root) {
    var opts = $$('.opt[role="radio"]', root), rec = $('.rec', root), cta = $('[data-rec-cta]', root);
    var pick = function (o, byUser) {
      opts.forEach(function (x) { x.setAttribute('aria-checked', String(x === o)); x.tabIndex = x === o ? 0 : -1; });
      if (rec) {
        $('[data-rec-b]', rec).textContent = o.getAttribute('data-b');
        $('[data-rec-s]', rec).textContent = o.getAttribute('data-s');
        var a = $('[data-rec-a]', rec);
        if (a) {
          if (o.getAttribute('data-href')) { a.hidden = false; a.href = o.getAttribute('data-href'); a.firstChild.textContent = o.getAttribute('data-link') + ' '; }
          else a.hidden = true;
        }
        swap(rec);
      }
      if (cta) {
        cta.firstChild.textContent = o.getAttribute('data-cta') + ' ';
        cta.setAttribute('data-interest', o.getAttribute('data-interest') || '');
        cta.setAttribute('data-title', o.getAttribute('data-title') || '');
        cta.setAttribute('data-kicker', o.getAttribute('data-kicker') || '');
        cta.setAttribute('data-message', o.getAttribute('data-message') || '');
      }
      if (byUser) track('picker_choice', { picker: root.getAttribute('data-picker'), choice: o.textContent.trim() });
    };
    opts.forEach(function (o, i) {
      o.addEventListener('click', function () { pick(o, true); });
      o.addEventListener('keydown', function (e) {
        var n = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
        if (n) { e.preventDefault(); var t = opts[(i + n + opts.length) % opts.length]; t.focus(); pick(t, true); }
      });
    });
    pick(opts.filter(function (o) { return o.getAttribute('aria-checked') === 'true'; })[0] || opts[0], false);
  });

  /* ---------- Tabs ---------- */
  $$('[data-tabs]').forEach(function (root) {
    var tabs = $$('[role="tab"]', root);
    var show = function (t, focus) {
      tabs.forEach(function (x) {
        var on = x === t;
        x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1;
        document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
      });
      if (focus) t.focus();
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { show(t); track('tab_view', { tab: t.textContent.trim() }); });
      t.addEventListener('keydown', function (e) {
        var n = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (n) { e.preventDefault(); show(tabs[(i + n + tabs.length) % tabs.length], true); }
      });
    });
  });

  /* ---------- Filter chips (agent use-case library) ---------- */
  $$('[data-filter]').forEach(function (root) {
    var chips = $$('.chipf', root), items = $$('[data-team]', document.getElementById(root.getAttribute('data-filter')));
    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        var f = c.getAttribute('data-f');
        chips.forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); });
        items.forEach(function (it) { it.hidden = !(f === 'all' || it.getAttribute('data-team') === f); });
        track('usecase_filter', { team: f });
      });
    });
  });

  /* ---------- Multi-select helper ---------- */
  var multi = function (root, onChange) {
    var opts = $$('.opt--check', root);
    opts.forEach(function (o) {
      o.addEventListener('click', function () {
        o.setAttribute('aria-pressed', String(o.getAttribute('aria-pressed') !== 'true'));
        onChange(opts.filter(function (x) { return x.getAttribute('aria-pressed') === 'true'; }));
      });
    });
    onChange(opts.filter(function (x) { return x.getAttribute('aria-pressed') === 'true'; }));
  };

  /* ---------- Rollout planner (implementation page) ---------- */
  $$('[data-planner]').forEach(function (root) {
    var out = $('[data-plan-out]', root), btn = $('[data-plan-cta]', root), chosen = [];
    multi(root, function (sel) {
      chosen = sel;
      if (!sel.length) { out.innerHTML = '<b>Pick at least one cloud</b><span>The fastest fixed-scope starting point appears here.</span>'; btn.disabled = true; return; }
      btn.disabled = false;
      var lines = sel.map(function (o) { return o.getAttribute('data-plan'); });
      out.innerHTML = '<b>' + (sel.length === 1 ? 'Fastest starting point' : 'Fastest starting points') + '</b><span>' + lines.join('<br>') + '</span>';
      swap(out);
    });
    btn.addEventListener('click', function () {
      var names = chosen.map(function (o) { return o.getAttribute('data-name'); });
      track('planner_submit', { clouds: names.join(', ') });
      open('Salesforce consulting & implementation', {
        kicker: 'Implementation & rollout', title: 'Rollout plan for the selected clouds',
        message: 'Clouds in scope: ' + names.join(', ') + '.\nCurrent CRM or system we are moving from: \nTarget go-live: '
      });
    });
  });

  /* ---------- Symptom checker (org audit page) ---------- */
  $$('[data-symp]').forEach(function (root) {
    var sev = $('.sev', root), btn = $('[data-symp-cta]', root), chosen = [];
    var LEVEL = [
      ['Tick the symptoms', '', 'Tick every symptom the team would recognise.'],
      ['Watch', 'Low risk', 'Early debt. A short health check and a cleanup backlog will keep it from compounding.'],
      ['Fix soon', 'Medium risk', 'Debt is already slowing the business. Plan a fixed-scope cleanup before adding new features or AI.'],
      ['Rescue', 'High risk', 'The org is working against your teams. Stabilize first, then rebuild what blocks adoption.']
    ];
    multi(root, function (sel) {
      chosen = sel;
      var score = sel.reduce(function (s, o) { return s + (+o.getAttribute('data-w') || 1); }, 0);
      var lvl = !sel.length ? 0 : score <= 3 ? 1 : score <= 7 ? 2 : 3;
      sev.setAttribute('data-level', lvl);
      $('b', sev).textContent = LEVEL[lvl][0];
      $('small', sev).textContent = LEVEL[lvl][1];
      $('p', sev).textContent = LEVEL[lvl][2];
      btn.disabled = !sel.length;
    });
    btn.addEventListener('click', function () {
      var list = chosen.map(function (o) { return '- ' + o.getAttribute('data-name'); }).join('\n');
      var level = $('b', sev).textContent;
      track('symptoms_submit', { count: chosen.length, level: level });
      open('Salesforce org audit & rescue', {
        kicker: 'Org audit & rescue', title: 'Symptoms to a Salesforce architect',
        message: 'Self-assessed risk: ' + level + '\nSymptoms we see:\n' + list + '\n\nAnything else: '
      });
    });
  });

  /* ---------- Document checklist (certifications page) ---------- */
  $$('[data-checklist]').forEach(function (root) {
    var btn = $('[data-check-cta]', root), count = $('[data-check-count]', root), chosen = [];
    multi(root, function (sel) {
      chosen = sel;
      if (count) count.textContent = sel.length ? sel.length + ' of ' + $$('.opt--check', root).length + ' selected' : 'Nothing selected yet';
      if (btn) btn.disabled = !sel.length;
    });
    if (btn) btn.addEventListener('click', function () {
      var list = chosen.map(function (o) { return '- ' + o.getAttribute('data-name'); }).join('\n');
      track('checklist_submit', { count: chosen.length });
      open(btn.getAttribute('data-interest') || 'Other', {
        kicker: btn.getAttribute('data-kicker') || '', title: btn.getAttribute('data-title') || '',
        message: (btn.getAttribute('data-prefix') || 'Requested:') + '\n' + list + '\n\nVendor portal or deadline: '
      });
    });
  });

  /* ---------- Careers: send a track choice into the application form ---------- */
  var applyForm = $('[data-apply]');
  $$('[data-apply-cta]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (!applyForm) return;
      e.preventDefault();
      var v = a.getAttribute('data-interest'), sel = applyForm.querySelector('[name="track"]');
      if (v && sel) sel.value = v;
      applyForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(function () { var n = applyForm.querySelector('[name="name"]'); if (n) n.focus({ preventScroll: true }); }, 600);
      track('apply_cta', { track: v || '' });
    });
  });

  /* ---------- Careers application form (POST /api/apply, bot-protected like the lead form) ---------- */
  if (applyForm) (function (form) {
    var tok = null, status = $('.qf__status', form), btn = $('[type="submit"]', form);
    var load = function () { return (window.ptsFreshToken ? window.ptsFreshToken() : Promise.resolve({ t: null, at: Date.now() })).then(function (x) { tok = x; return x; }); };
    var ripe = function () { var w = 3300 - (Date.now() - (tok ? tok.at : 0)); return new Promise(function (ok) { setTimeout(ok, Math.max(0, w)); }); };
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { io.disconnect(); load(); } }, { rootMargin: '700px' });
      io.observe(form);
    } else load();
    var say = function (cls, msg) { status.className = 'qf__status ' + cls; status.textContent = msg; };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = function (n) { return form.querySelector('[name="' + n + '"]'); };
      var bad = ['name', 'email', 'track'].map(f).filter(function (el) {
        var v = el.value.trim(), ok = v !== '' && (el.type !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v));
        el.classList.toggle('is-invalid', !ok); el.setAttribute('aria-invalid', String(!ok)); return !ok;
      });
      if (bad.length) { say('err', 'Please complete the highlighted fields.'); bad[0].focus(); return; }
      var data = { name: f('name').value, email: f('email').value, phone: f('phone').value, track: f('track').value, hub: f('hub').value,
        profile: f('profile').value, message: f('message').value, website: f('website').value, page: location.pathname };
      btn.disabled = true; say('', 'Sending...');
      var send = function (retry) {
        return (tok && tok.t ? Promise.resolve() : load()).then(ripe).then(function () {
          data.ft = tok && tok.t; data.cf = window.ptsCfToken ? window.ptsCfToken() : '';
          tok = null;
          return fetch('/api/apply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        }).then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (r.status === 409 && !retry) return load().then(function () { return send(true); });
            load(); // tokens are single-use: get the next one ready
            if (!r.ok) { var err = new Error(j.message || ''); err.code = j.error; throw err; }
            return j;
          });
        });
      };
      send(false).then(function () {
        track('application_submit', { track: data.track });
        form.classList.add('is-done');
        say('ok', 'Thank you, ' + data.name.trim().split(' ')[0] + '. The talent team reads every application and replies when there is a match.');
      }).catch(function (err) {
        btn.disabled = false;
        say('err', err.message || 'Something went wrong. Please try again in a minute.');
        var map = { email: 'email', disposable: 'email', 'no-mx': 'email', phone: 'phone', profile: 'profile' };
        if (map[err.code]) { var el = f(map[err.code]); el.classList.add('is-invalid'); el.focus(); }
      });
    });
  })(applyForm);

  /* ---------- Source map (Data Cloud page) ---------- */
  $$('[data-fmap]').forEach(function (root) {
    var srcs = $$('.src', root), core = $('.fmap__core', root), detail = $('.fmap__detail', root);
    var show = function (s, byUser) {
      srcs.forEach(function (x) { x.setAttribute('aria-pressed', String(x === s)); });
      $('[data-d="what"]', detail).textContent = s.getAttribute('data-what');
      $('[data-d="how"]', detail).textContent = s.getAttribute('data-how');
      $('[data-d="use"]', detail).textContent = s.getAttribute('data-use');
      detail.style.borderLeftColor = getComputedStyle(s.querySelector('i')).backgroundColor;
      swap(detail); core.classList.remove('is-pulse'); void core.offsetWidth; core.classList.add('is-pulse');
      if (byUser) track('source_map', { source: s.textContent.trim() });
    };
    srcs.forEach(function (s) { s.addEventListener('click', function () { show(s, true); }); });
    show(srcs[0], false);
  });
})();
