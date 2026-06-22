// Shared language switcher HTML — injected into all pages
// Uses circular flag SVGs (no emoji for cross-platform consistency)
(function () {
  // URL path prefix for each language (e.g. /zh/, /ja/). English stays at root.
  // Languages without a dedicated path (es, fr, de, pt, ko) fall back to root + query.
  const LANGS = [
    { code: 'en', label: 'English',     short: 'EN',  flag: 'us', path: '/' },
    { code: 'zh', label: '中文',         short: '中',  flag: 'cn', path: '/zh/' },
    { code: 'ja', label: '日本語',       short: '日',  flag: 'jp', path: '/ja/' },
    { code: 'es', label: 'Español',     short: 'ES',  flag: 'es', path: '/?lang=es' },
    { code: 'fr', label: 'Français',    short: 'FR',  flag: 'fr', path: '/?lang=fr' },
    { code: 'de', label: 'Deutsch',     short: 'DE',  flag: 'de', path: '/?lang=de' },
    { code: 'pt', label: 'Português',   short: 'PT',  flag: 'br', path: '/?lang=pt' },
    { code: 'ko', label: '한국어',        short: '한',  flag: 'kr', path: '/?lang=ko' }
  ];

  // Detect current language from <html lang> or default to 'en'
  const current = (document.documentElement.lang || 'en').toLowerCase().split('-')[0];
  const active = LANGS.find(l => l.code === current) || LANGS[0];

  // Circular flag SVG component (24px circle with country flag)
  // Uses a simple per-country SVG design — no external assets
  const FLAG_SVG = {
    us: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><clipPath id="us-c"><circle cx="12" cy="12" r="11"/></clipPath></defs>
      <g clip-path="url(#us-c)">
        <rect width="24" height="24" fill="#B22234"/>
        <path d="M0 3h24M0 6h24M0 9h24M0 12h24M0 15h24M0 18h24M0 21h24" stroke="#fff" stroke-width="1.5"/>
        <rect width="11" height="10" fill="#3C3B6E"/>
      </g>
      <circle cx="12" cy="12" r="11" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
    </svg>`,
    cn: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><clipPath id="cn-c"><circle cx="12" cy="12" r="11"/></clipPath></defs>
      <g clip-path="url(#cn-c)">
        <rect width="24" height="24" fill="#DE2910"/>
        <path d="M6 4l.8 2.4H9l-1.8 1.3.7 2.3L6 8.7l-1.9 1.3.7-2.3L3 6.4h2.2z" fill="#FFDE00"/>
        <circle cx="9.5" cy="3.2" r=".5" fill="#FFDE00"/>
        <circle cx="11" cy="5" r=".5" fill="#FFDE00"/>
        <circle cx="11" cy="7" r=".5" fill="#FFDE00"/>
        <circle cx="9.5" cy="8.8" r=".5" fill="#FFDE00"/>
      </g>
      <circle cx="12" cy="12" r="11" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
    </svg>`,
    jp: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><clipPath id="jp-c"><circle cx="12" cy="12" r="11"/></clipPath></defs>
      <g clip-path="url(#jp-c)">
        <rect width="24" height="24" fill="#fff"/>
        <circle cx="12" cy="12" r="5" fill="#BC002D"/>
      </g>
      <circle cx="12" cy="12" r="11" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
    </svg>`,
    es: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><clipPath id="es-c"><circle cx="12" cy="12" r="11"/></clipPath></defs>
      <g clip-path="url(#es-c)">
        <rect width="24" height="6" fill="#AA151B"/>
        <rect y="6" width="24" height="12" fill="#F1BF00"/>
        <rect y="18" width="24" height="6" fill="#AA151B"/>
      </g>
      <circle cx="12" cy="12" r="11" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
    </svg>`,
    fr: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><clipPath id="fr-c"><circle cx="12" cy="12" r="11"/></clipPath></defs>
      <g clip-path="url(#fr-c)">
        <rect width="8" height="24" fill="#0055A4"/>
        <rect x="8" width="8" height="24" fill="#fff"/>
        <rect x="16" width="8" height="24" fill="#EF4135"/>
      </g>
      <circle cx="12" cy="12" r="11" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
    </svg>`,
    de: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><clipPath id="de-c"><circle cx="12" cy="12" r="11"/></clipPath></defs>
      <g clip-path="url(#de-c)">
        <rect width="24" height="8" fill="#000"/>
        <rect y="8" width="24" height="8" fill="#DD0000"/>
        <rect y="16" width="24" height="8" fill="#FFCE00"/>
      </g>
      <circle cx="12" cy="12" r="11" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
    </svg>`,
    br: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><clipPath id="br-c"><circle cx="12" cy="12" r="11"/></clipPath></defs>
      <g clip-path="url(#br-c)">
        <rect width="24" height="24" fill="#009C3B"/>
        <path d="M12 3l9 9-9 9-9-9z" fill="#FFDF00"/>
        <circle cx="12" cy="12" r="3.2" fill="#002776"/>
      </g>
      <circle cx="12" cy="12" r="11" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
    </svg>`,
    kr: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><clipPath id="kr-c"><circle cx="12" cy="12" r="11"/></clipPath></defs>
      <g clip-path="url(#kr-c)">
        <rect width="24" height="24" fill="#fff"/>
        <path d="M12 6.5a5.5 5.5 0 010 11 2.5 2.5 0 010-5 3 3 0 000-6z" fill="#CD2E3A"/>
        <path d="M12 17.5a5.5 5.5 0 010-11 2.5 2.5 0 010 5 3 3 0 000 6z" fill="#0047A0"/>
      </g>
      <circle cx="12" cy="12" r="11" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1"/>
    </svg>`
  };

  const items = LANGS.map(l => `
    <a href="${l.path}" hreflang="${l.code}" data-lang="${l.code}" data-path="${l.path}" class="lang-switcher__item${l.code === active.code ? ' lang-switcher__item--active' : ''}">
      <span class="lang-switcher__flag">${FLAG_SVG[l.flag]}</span>
      <span class="lang-switcher__label">${l.label}</span>
    </a>
  `).join('');

  const html = `
    <div class="lang-switcher" data-dropdown>
      <button type="button" class="lang-switcher__trigger" aria-haspopup="true" aria-expanded="false">
        <span class="lang-switcher__flag">${FLAG_SVG[active.flag]}</span>
        <span class="lang-switcher__current">${active.short}</span>
        <svg class="lang-switcher__chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="lang-switcher__menu" role="menu">${items}</div>
    </div>
  `;

  // Insert before the "Install Free" button
  const installBtn = document.querySelector('.site-nav .btn--primary');
  if (installBtn) {
    installBtn.insertAdjacentHTML('beforebegin', html);
  } else {
    // Legal pages might not have nav — inject into header inner if exists
    const inner = document.querySelector('.site-header__inner');
    if (inner) inner.insertAdjacentHTML('beforeend', html);
  }

  // Mobile menu language picker: fill any [data-lang-list] placeholder.
  // A compact horizontal strip of short codes; the current language is
  // highlighted. Hidden on desktop (CSS), only shown when the mobile
  // hamburger menu is open.
  const mobileHtml = LANGS.map(l => `
    <a href="${l.path}" hreflang="${l.code}" data-lang="${l.code}" data-path="${l.path}" class="lang-mobile__item${l.code === active.code ? ' lang-mobile__item--active' : ''}" aria-label="${l.label}" aria-current="${l.code === active.code ? 'true' : 'false'}">${l.short}</a>
  `).join('');
  document.querySelectorAll('[data-lang-list]').forEach(host => {
    host.innerHTML = mobileHtml;
    host.querySelectorAll('.lang-mobile__item').forEach(a => {
      a.addEventListener('click', () => {
        try {
          localStorage.setItem('se_lang', a.dataset.lang);
          localStorage.setItem('se_lang_pref', a.dataset.lang);
        } catch (_) {}
      });
    });
  });

  // Persist language preference and let the default <a href> navigation happen
  document.querySelectorAll('.lang-switcher__item').forEach(a => {
    a.addEventListener('click', () => {
      try {
        localStorage.setItem('se_lang', a.dataset.lang);
        localStorage.setItem('se_lang_pref', a.dataset.lang);
      } catch (_) {}
    });
  });

  // Self-contained hover/click behavior (doesn't depend on app.js)
  const root = document.querySelector('.lang-switcher');
  const trigger = root.querySelector('.lang-switcher__trigger');
  let closeTimer = null;
  const open = () => {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    root.setAttribute('data-open', '');
    trigger.setAttribute('aria-expanded', 'true');
  };
  const scheduleClose = () => {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      root.removeAttribute('data-open');
      trigger.setAttribute('aria-expanded', 'false');
      closeTimer = null;
    }, 180);
  };
  root.addEventListener('mouseenter', open);
  root.addEventListener('mouseleave', scheduleClose);
  trigger.addEventListener('click', (e) => {
    if (root.hasAttribute('data-open')) {
      root.removeAttribute('data-open');
      trigger.setAttribute('aria-expanded', 'false');
    } else {
      open();
    }
    e.preventDefault();
    e.stopPropagation();
  });

  // Click outside closes
  document.addEventListener('click', (e) => {
    if (!root.contains(e.target)) {
      root.removeAttribute('data-open');
      trigger.setAttribute('aria-expanded', 'false');
    }
  });
})();

// =================== Browser language auto-detection ===================
// On first visit, detect the browser language. If it differs from the
// page language, show a non-intrusive banner offering to remember a
// preferred language. User can dismiss or accept.
(function () {
  const SUPPORTED = ['en', 'zh', 'ja', 'es', 'fr', 'de', 'pt', 'ko'];
  const STORAGE_KEY = 'se_lang_pref';
  const DISMISS_KEY = 'se_lang_dismissed';

  // Skip if user already chose or dismissed
  let saved;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch (_) {}
  if (saved) return;
  let dismissed;
  try { dismissed = sessionStorage.getItem(DISMISS_KEY); } catch (_) {}
  if (dismissed) return;

  // Detect browser language
  const browserLang = (navigator.language || navigator.userLanguage || 'en')
    .toLowerCase()
    .split('-')[0];
  if (!SUPPORTED.includes(browserLang) || browserLang === 'en') return;

  // Detect current page language
  const pageLang = (document.documentElement.lang || 'en').toLowerCase().split('-')[0];
  if (browserLang === pageLang) return;

  // Find the matching language entry
  const LANGS = [
    { code: 'zh', label: '中文',     short: '中' },
    { code: 'ja', label: '日本語',   short: '日' },
    { code: 'es', label: 'Español', short: 'ES' },
    { code: 'fr', label: 'Français', short: 'FR' },
    { code: 'de', label: 'Deutsch',  short: 'DE' },
    { code: 'pt', label: 'Português', short: 'PT' },
    { code: 'ko', label: '한국어',    short: '한' }
  ];
  const target = LANGS.find(l => l.code === browserLang);
  if (!target) return;

  // Render banner
  const banner = document.createElement('div');
  banner.className = 'lang-banner';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-label', 'Language suggestion');
  banner.innerHTML = `
    <div class="lang-banner__inner">
      <span class="lang-banner__text">
        <span class="lang-banner__emoji">🌐</span>
        <span>View this page in <strong>${target.label}</strong>?</span>
      </span>
      <div class="lang-banner__actions">
        <button type="button" class="lang-banner__btn lang-banner__btn--primary" data-lang-banner-accept>Yes, switch</button>
        <button type="button" class="lang-banner__btn" data-lang-banner-dismiss>Not now</button>
      </div>
    </div>
  `;
  document.body.appendChild(banner);

  // Trigger slide-in on next frame
  requestAnimationFrame(() => banner.classList.add('lang-banner--visible'));

  // Wire up actions
  banner.querySelector('[data-lang-banner-accept]').addEventListener('click', () => {
    try { localStorage.setItem(STORAGE_KEY, browserLang); } catch (_) {}
    // Navigate to the appropriate URL for the detected language
    const langItem = document.querySelector(`.lang-switcher__item[data-lang="${browserLang}"]`);
    if (langItem && langItem.dataset.path) {
      window.location.href = langItem.dataset.path;
    }
    hide();
  });
  banner.querySelector('[data-lang-banner-dismiss]').addEventListener('click', () => {
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch (_) {}
    hide();
  });

  function hide() {
    banner.classList.remove('lang-banner--visible');
    setTimeout(() => banner.remove(), 300);
  }
})();
