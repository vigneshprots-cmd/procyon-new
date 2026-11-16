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
      if (!sel.length) { out.innerHTML = '<b>Pick at least one cloud</b><span>We will show the fastest fixed-scope starting point for it.</span>'; btn.disabled = true; return; }
      btn.disabled = false;
      var lines = sel.map(function (o) { return o.getAttribute('data-plan'); });
      out.innerHTML = '<b>' + (sel.length === 1 ? 'Your fastest starting point' : 'Your starting points') + '</b><span>' + lines.join('<br>') + '</span>';
      swap(out);
    });
    btn.addEventListener('click', function () {
      var names = chosen.map(function (o) { return o.getAttribute('data-name'); });
      track('planner_submit', { clouds: names.join(', ') });
      open('Salesforce consulting & implementation', {
        kicker: 'Implementation & rollout', title: 'Get my rollout plan',
        message: 'Clouds in scope: ' + names.join(', ') + '.\nCurrent CRM or system we are moving from: \nTarget go-live: '
      });
    });
  });

  /* ---------- Symptom checker (org audit page) ---------- */
  $$('[data-symp]').forEach(function (root) {
    var sev = $('.sev', root), btn = $('[data-symp-cta]', root), chosen = [];
    var LEVEL = [
      ['Pick what you see', '', 'Tick every symptom your team would recognise.'],
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
        kicker: 'Org audit & rescue', title: 'Send my symptoms to an architect',
        message: 'Self-assessed risk: ' + level + '\nSymptoms we see:\n' + list + '\n\nAnything else: '
      });
    });
  });

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
