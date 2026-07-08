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

// Time estimator: runs compute() on init to fill values from the default
// input value, and re-runs on every input / quick-pick change.
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
    // Run once on init so the right column shows real values for the
    // default input value (HTML defaults are placeholders).
    compute();
  });
})();

// Mobile back button: shown on subpages (anything other than a language
// homepage). Uses history.back() when the user came from within the site,
// otherwise falls back to the home page.
(function () {
  // All 8 language homepages are conceptually "home" — switching language on
  // mobile should NOT surface a back button just because the URL path now
  // starts with /zh/, /ja/, etc. Keep this list in sync with LANGS in
  // assets/lang-switcher.js when a new locale ships.
  const HOME_PATHS = new Set(['/', '/zh/', '/ja/', '/es/', '/fr/', '/de/', '/pt/', '/ko/']);
  const path = location.pathname.replace(/\/index\.html$/, '/');
  if (HOME_PATHS.has(path)) return; // language homepage — no back button

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

// lite-youtube-embed: custom element that renders a YouTube poster (maxresdefault
// thumbnail) and only loads the iframe + player JS when the user clicks play.
// The `si` parameter is the share identifier YouTube generates when copying the
// embed code from the Share menu — it tells YouTube the embed came from a real
// share and avoids the "Sign in to confirm you're not a bot" wall on videos
// that otherwise fail with error 153.
const YOUTUBE_EMBED_SI = 'WumRKezaHB8o4Xiy';

class LiteYTEmbed extends HTMLElement {
  connectedCallback() {
    this.videoId = this.getAttribute('videoid');
    this.playLabel = this.getAttribute('playlabel') || 'Play video';
    if (!this.videoId) return;
    this.style.backgroundImage = `url("https://i.ytimg.com/vi/${this.videoId}/maxresdefault.jpg")`;
    this.style.backgroundSize = 'cover';
    this.style.backgroundPosition = 'center';
    this.style.position = 'relative';
    this.style.cursor = 'pointer';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', this.playLabel);
    btn.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:68px;height:48px;border:0;background:transparent;cursor:pointer;';
    btn.innerHTML = '<svg height="100%" version="1.1" viewBox="0 0 68 48" width="100%"><path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55C3.97 2.33 2.27 4.81 1.48 7.74.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="#f00" fill-opacity="0.8"/><path d="M45 24 27 14v20" fill="#fff"/></svg>';
    btn.addEventListener('click', () => this._activate());
    this.appendChild(btn);
    this.addEventListener('click', (e) => {
      if (e.target === this) this._activate();
    });
  }
  _activate() {
    if (this._activated) return;
    this._activated = true;
    this.style.backgroundImage = '';
    this.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube.com/embed/${this.videoId}?autoplay=1&rel=0&si=${YOUTUBE_EMBED_SI}&origin=${encodeURIComponent(location.origin)}`;
    iframe.title = this.playLabel;
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.setAttribute('allowfullscreen', '');
    this.appendChild(iframe);
  }
}
if (!customElements.get('lite-youtube')) {
  customElements.define('lite-youtube', LiteYTEmbed);
}

// Hero install: single CTA button + platform picker popover.
// Smart-default label: shows "Get Eraser for X" when only one platform
// is available, "Get SocialEraser" when multiple are, and falls back to a
// generic label otherwise. Click trigger toggles the popover; click outside
// or Esc closes it.
(function () {
  const install = document.querySelector('[data-install]');
  if (!install) return;

  const trigger = install.querySelector('[data-install-trigger]');
  const popover = install.querySelector('[data-install-popover]');
  const label = install.querySelector('[data-install-label]');
  if (!trigger || !popover) return;

  // Build smart-default label from the available options in the popover.
  // Always show "Get SocialEraser" — the popover communicates per-platform
  // availability, the trigger button itself stays platform-agnostic.
  if (label) {
    label.textContent = 'Get SocialEraser';
  }

  const setOpen = (open) => {
    if (open) {
      popover.setAttribute('data-open', '');
      trigger.setAttribute('aria-expanded', 'true');
    } else {
      popover.removeAttribute('data-open');
      trigger.setAttribute('aria-expanded', 'false');
    }
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!popover.hasAttribute('data-open'));
  });
  document.addEventListener('click', (e) => {
    if (!install.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
})();

// Header "Install Free" smart routing.
// On the homepage (no body data-platform): point to /#download (the Platform
// Hub). On platform subpages (data-platform="x" etc.): prefer the matching
// store URL when we have one and the user is on a matching OS, otherwise
// fall back to that platform's #download anchor (waitlist on the platform's
// own page when the platform isn't shipped yet).
(function () {
  const installBtn = document.querySelector('[data-install-cta]');
  if (!installBtn) return;

  // Hardcoded store URLs per (platform, endpoint). Add a new platform's URLs
  // here and update the [data-newly-released] config to show a red dot.
  const STORES = {
    x: {
      chrome: 'https://chromewebstore.google.com/detail/socialeraser-for-x/hmlbkkbflcdofngldhekoajeedgcjfch',
      edge:   'https://microsoftedge.microsoft.com/addons/',
    },
    tiktok: {
      chrome: 'https://chromewebstore.google.com/detail/socialeraser-for-tiktok/hbeccanmeoflhdgefmjifbolkhpmonni',
    },
    youtube:   {},
    instagram: {},
    facebook:  {},
  };

  const platform = document.body.dataset.platform;
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isIOS     = /iPhone|iPad|iPod/i.test(ua);

  // Pick the best available store for the user's device when on a platform
  // subpage. Falls back to that platform's own /platforms/{name}/#download
  // (waitlist anchor) when no store is ready.
  let href = '/#download';
  if (platform) {
    const stores = STORES[platform] || {};
    if (isAndroid && stores.android) href = stores.android;
    else if (isIOS && stores.ios) href = stores.ios;
    else if (stores.chrome) href = stores.chrome;
    else href = `/platforms/${platform}/#download`;
  }
  installBtn.setAttribute('href', href);
})();

// Install badge: red dot on Header Install Free for newly-released
// endpoints. Driven by an inline JSON config in <script data-newly-released>
// so the same page can declare "TikTok on Chrome shipped 3 days ago" and
// the red dot appears on every page for 7 days, then auto-disappears.
(function () {
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
  const config = document.querySelector('script[data-newly-released]');
  if (!config) return;
  let list;
  try { list = JSON.parse(config.textContent || '[]'); } catch { return; }
  if (!Array.isArray(list) || !list.length) return;

  const now = Date.now();
  const active = list.filter(item => now - item.releasedAt < SEVEN_DAYS);
  if (!active.length) return;

  const pagePlatform = document.body.dataset.platform || 'home';
  const matches = active.filter(item => {
    if (item.platform === pagePlatform) return true;
    if (pagePlatform === 'home' && item.showOnHome) return true;
    return false;
  });
  if (!matches.length) return;

  const installBtn = document.querySelector('[data-install-cta]');
  if (!installBtn) return;

  const badge = document.createElement('span');
  badge.className = 'install-badge';
  badge.setAttribute('aria-label', 'Newly released');
  badge.title = 'Newly available';
  installBtn.appendChild(badge);
})();
