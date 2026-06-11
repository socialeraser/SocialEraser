// X-Eraser Config Loader
// 从远程服务器加载配置

(function() {
  'use strict';

  const DEFAULT_CONFIG = {
    version: '1.0.0',
    updated: '2025-01-01',
    configUrl: 'https://storage.googleapis.com/social-tool-bucket/remote-example.json',
    selectors: {
      xWebsite: {
        patterns: ['x.com', 'twitter.com']
      },
      login: {
        checkElements: {
          'zh-CN': [
            { type: 'text', value: '继续' },
            { type: 'text', value: '创建您的账户' },
            { type: 'selector', value: "[data-testid='loginButton']" }
          ],
          'zh-TW': [
            { type: 'text', value: '繼續' },
            { type: 'text', value: '建立您的帳戶' },
            { type: 'selector', value: "[data-testid='loginButton']" }
          ],
          'en': [
            { type: 'text', value: 'Sign in' },
            { type: 'text', value: 'Create your account' },
            { type: 'selector', value: "[data-testid='loginButton']" }
          ],
          'ja': [
            { type: 'text', value: 'サインイン' },
            { type: 'text', value: 'アカウントを作成' },
            { type: 'selector', value: "[data-testid='loginButton']" }
          ],
          'ko': [
            { type: 'text', value: '로그인' },
            { type: 'text', value: '계정 만들기' },
            { type: 'selector', value: "[data-testid='loginButton']" }
          ],
          'es': [
            { type: 'text', value: 'Iniciar sesión' },
            { type: 'text', value: 'Crea tu cuenta' },
            { type: 'selector', value: "[data-testid='loginButton']" }
          ],
          'de': [
            { type: 'text', value: 'Anmelden' },
            { type: 'text', value: 'Konto erstellen' },
            { type: 'selector', value: "[data-testid='loginButton']" }
          ],
          'fr': [
            { type: 'text', value: 'Se connecter' },
            { type: 'text', value: 'Créer votre compte' },
            { type: 'selector', value: "[data-testid='loginButton']" }
          ]
        },
        loggedInElements: [
          { type: 'selector', value: "[data-testid='UserAvatar']" },
          { type: 'selector', value: "[data-testid='tweetTextarea_0']" }
        ]
      }
    }
  };

  let cachedConfig = null;
  let configLoadPromise = null;

  window.XEraserConfig = {
    async loadConfig(forceReload = false) {
      if (cachedConfig && !forceReload) {
        return cachedConfig;
      }

      if (configLoadPromise && !forceReload) {
        return configLoadPromise;
      }

      configLoadPromise = this._fetchConfig();
      return configLoadPromise;
    },

    async _fetchConfig() {
      try {
        console.log('[X-Eraser] Attempting to fetch config from:', DEFAULT_CONFIG.configUrl);
        
        const response = await fetch(DEFAULT_CONFIG.configUrl, {
          method: 'GET',
          mode: 'cors',
          credentials: 'omit'
        });
        
        console.log('[X-Eraser] Fetch response status:', response.status);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const remoteConfig = await response.json();
        cachedConfig = this._mergeConfig(DEFAULT_CONFIG, remoteConfig);
        console.log('[X-Eraser] Remote config loaded successfully:', cachedConfig);
        return cachedConfig;
      } catch (error) {
        console.error('[X-Eraser] Fetch config error:', error.message);
        console.error('[X-Eraser] Error type:', error.constructor.name);
        if (error.response) {
          console.error('[X-Eraser] Response:', error.response);
        }
        console.warn('[X-Eraser] Falling back to default config');
        cachedConfig = DEFAULT_CONFIG;
        return cachedConfig;
      }
    },

    _mergeConfig(defaultConfig, remoteConfig) {
      const merged = {
        ...defaultConfig,
        ...remoteConfig,
        selectors: {
          ...defaultConfig.selectors,
          ...remoteConfig.selectors
        }
      };
      
      if (remoteConfig.selectors?.login?.checkElements) {
        merged.selectors.login.checkElements = {
          ...defaultConfig.selectors.login.checkElements,
          ...remoteConfig.selectors.login.checkElements
        };
      }
      
      return merged;
    },

    getConfig() {
      return cachedConfig || DEFAULT_CONFIG;
    },

    getWebsitePatterns() {
      const config = this.getConfig();
      return config.selectors?.xWebsite?.patterns || ['x.com', 'twitter.com'];
    },

    getLoginConfig() {
      const config = this.getConfig();
      return config.selectors?.login || DEFAULT_CONFIG.selectors.login;
    },

    getWebsiteMatchPatterns() {
      const patterns = this.getWebsitePatterns();
      return patterns.map(domain => `*://${domain}/*`);
    }
  };
})();