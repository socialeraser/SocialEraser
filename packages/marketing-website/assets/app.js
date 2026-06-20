/* SocialEraser Time Estimator — vanilla JS (no deps) */
(function () {
  const MANUAL = 12, AUTO = 1.6;       // seconds per item
  const FREE_LIMIT = 50;                // free tier per day
  const init = () => document.querySelectorAll('[data-estimator]').forEach(bind);
  const fmt = s => s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${(s/60).toFixed(1)}m` : `${(s/3600).toFixed(1)}h`;
  const bind = root => {
    const input = root.querySelector('[data-estimator-input]');
    const manual = root.querySelector('[data-estimator-manual]');
    const auto = root.querySelector('[data-estimator-auto]');
    const saved = root.querySelector('[data-estimator-saved]');
    const update = () => {
      const n = Math.max(1, Math.min(100000, +input.value || 0));
      const m = n * MANUAL, a = n * AUTO;
      manual.textContent = fmt(m);
      auto.textContent = fmt(a);
      saved.textContent = fmt(m - a);
    };
    input.addEventListener('input', update);
    root.addEventListener('click', e => {
      if (e.target.matches('[data-estimator-quick]')) { input.value = e.target.dataset.value; update(); }
    });
    update();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  /* Tabs (per-platform features) */
  const tabInit = () => document.querySelectorAll('[data-tabs]').forEach(t => {
    const trigs = t.querySelectorAll('[data-tab-trigger]');
    const panels = t.querySelectorAll('[data-tab-panel]');
    trigs.forEach((tr, i) => tr.addEventListener('click', () => {
      trigs.forEach(x => x.setAttribute('aria-selected', 'false'));
      panels.forEach(x => x.classList.remove('is-active'));
      tr.setAttribute('aria-selected', 'true');
      panels[i].classList.add('is-active');
    }));
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tabInit); else tabInit();
})();
