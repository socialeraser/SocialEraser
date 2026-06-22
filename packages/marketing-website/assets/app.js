// Hover-based dropdown for the Platforms nav item
// Converts <details>/<summary> to hover-to-open on desktop, click-to-open on touch
(function () {
  const dropdowns = document.querySelectorAll('.site-nav__platforms');
  if (!dropdowns.length) return;

  dropdowns.forEach((el) => {
    let closeTimer = null;

    const open = () => {
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      el.setAttribute('open', '');
    };

    const scheduleClose = () => {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        el.removeAttribute('open');
        closeTimer = null;
      }, 180);
    };

    el.addEventListener('mouseenter', open);
    el.addEventListener('mouseleave', scheduleClose);

    // Touch / click: tap trigger to toggle
    const trigger = el.querySelector('.site-nav__platforms-trigger');
    if (trigger) {
      trigger.addEventListener('click', (e) => {
        if (el.hasAttribute('open')) {
          el.removeAttribute('open');
        } else {
          open();
        }
        e.preventDefault();
      });
    }

    // Click outside closes
    document.addEventListener('click', (e) => {
      if (!el.contains(e.target)) el.removeAttribute('open');
    });
  });
})();

// Generic hover/click dropdown (for .lang-switcher and other [data-dropdown] elements)
(function () {
  const dropdowns = document.querySelectorAll('[data-dropdown]');
  if (!dropdowns.length) return;

  dropdowns.forEach((el) => {
    const trigger = el.querySelector('button, [data-dropdown-trigger]') || el.firstElementChild;
    let closeTimer = null;

    const open = () => {
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      el.setAttribute('data-open', '');
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
    };

    const scheduleClose = () => {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(() => {
        el.removeAttribute('data-open');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        closeTimer = null;
      }, 180);
    };

    el.addEventListener('mouseenter', open);
    el.addEventListener('mouseleave', scheduleClose);

    if (trigger) {
      trigger.addEventListener('click', (e) => {
        if (el.hasAttribute('data-open')) {
          scheduleClose();
          if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
          el.removeAttribute('data-open');
          trigger.setAttribute('aria-expanded', 'false');
        } else {
          open();
        }
        e.preventDefault();
        e.stopPropagation();
      });
    }
  });

  // Click outside closes all
  document.addEventListener('click', (e) => {
    dropdowns.forEach(el => {
      if (!el.contains(e.target)) {
        el.removeAttribute('data-open');
        const t = el.querySelector('button, [data-dropdown-trigger]');
        if (t) t.setAttribute('aria-expanded', 'false');
      }
    });
  });
})();

// Back-to-top button
(function () {
  const btn = document.createElement('button');
  btn.className = 'back-to-top';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Back to top');
  btn.innerHTML = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>';
  document.body.appendChild(btn);

  const onScroll = () => {
    if (window.scrollY > 400) {
      btn.classList.add('back-to-top--visible');
    } else {
      btn.classList.remove('back-to-top--visible');
    }
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();

// Time estimator: progressive enhancement. HTML pre-fills values; JS only updates on input change.
(function () {
  const fmt = (s) => {
    if (s <= 0) return '—';
    if (s < 60) return Math.round(s) + 's';
    if (s < 600) return (s / 60).toFixed(1).replace(/\.0$/, '') + 'm';
    if (s < 3600) return Math.round(s / 60) + 'm';
    const h = Math.floor(s / 3600);
    const m = Math.round((s - h * 3600) / 60);
    if (m === 0) return h + 'h';
    if (m === 60) return (h + 1) + 'h';
    return h + 'h ' + m + 'm';
  };
  const anim = (el) => {
    el.classList.remove('is-changing');
    void el.offsetWidth; // force reflow to restart animation
    el.classList.add('is-changing');
  };
  document.querySelectorAll('[data-estimator]').forEach((root) => {
    const input = root.querySelector('[data-estimator-input]');
    const manual = root.querySelector('[data-estimator-manual]');
    const auto = root.querySelector('[data-estimator-auto]');
    const saved = root.querySelector('[data-estimator-saved]');
    if (!input || !manual || !auto || !saved) return;
    const compute = () => {
      const n = Math.max(0, Math.min(100000, parseInt(input.value, 10) || 0));
      const sAuto = n * 0.9;  // X benchmark (real test: 0.9s/item)
      const sMan = n * 10;    // manual: ~10s per click+confirm
      manual.textContent = fmt(sMan);
      auto.textContent = fmt(sAuto);
      saved.textContent = fmt(sMan - sAuto);
      [manual, auto, saved].forEach(anim);
    };
    input.addEventListener('input', compute);
    root.querySelectorAll('[data-estimator-quick]').forEach((b) => {
      b.addEventListener('click', () => { input.value = b.dataset.value; compute(); });
    });
  });
})();

// Mobile back button: shown on subpages (anything other than the homepage).
// Uses history.back() when the user came from within the site, otherwise
// falls back to the home page.
(function () {
  const path = location.pathname.replace(/\/index\.html$/, '/');
  if (path === '/' || path === '') return; // home page — no back button

  const inner = document.querySelector('.site-header__inner');
  const logo = inner && inner.querySelector('.site-logo');
  if (!inner || !logo) return;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'site-header__back';
  btn.setAttribute('aria-label', 'Back');
  btn.innerHTML = '<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';

  btn.addEventListener('click', () => {
    let cameFromSite = false;
    try {
      cameFromSite = !!document.referrer && new URL(document.referrer).origin === location.origin;
    } catch (_) { /* ignore */ }
    if (cameFromSite && history.length > 1) {
      history.back();
    } else {
      location.href = '/';
    }
  });

  inner.insertBefore(btn, logo);
})();

// Mobile menu: close the hamburger dropdown and the nested language picker
// when the user clicks anywhere outside of them. The native <details>
// element only closes on toggle of its own summary, so without this a
// tap on the page behind the menu would leave it hanging open.
(function () {
  const targets = document.querySelectorAll('.site-nav--mobile, .site-nav--mobile-lang');
  if (!targets.length) return;
  document.addEventListener('click', (e) => {
    targets.forEach((el) => {
      if (el.open && !el.contains(e.target)) el.removeAttribute('open');
    });
  });
  // Esc closes whichever dropdown is open.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    targets.forEach((el) => el.removeAttribute('open'));
  });
})();
