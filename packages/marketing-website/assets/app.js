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
