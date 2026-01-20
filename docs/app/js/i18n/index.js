/**
 * DeepSeek Cowork - Internationalization (i18n) Manager
 * Provides multi-language support with English as default
 * 
 * This module is loaded as a global script (not ES module)
 * to maintain compatibility with the existing app.js structure
 */

// Language packs will be loaded synchronously
const I18nLocales = {};

const I18nManager = {
  STORAGE_KEY: 'bcm-locale',
  DEFAULT_LOCALE: 'en-US',
  SUPPORTED_LOCALES: ['en-US', 'zh-CN'],
  
  // Current locale
  currentLocale: 'en-US',
  
  // Language packs registry (populated after locale scripts load)
  locales: I18nLocales,
  
  /**
   * Initialize the i18n manager
   * Loads saved locale or detects from browser settings
   */
  init() {
    // Try to load saved preference
    const saved = localStorage.getItem(this.STORAGE_KEY);
    
    if (saved && this.SUPPORTED_LOCALES.includes(saved)) {
      this.currentLocale = saved;
    } else {
      // Detect from browser language
      const browserLang = navigator.language || navigator.userLanguage;
      
      if (browserLang.startsWith('zh')) {
        this.currentLocale = 'zh-CN';
      } else {
        this.currentLocale = this.DEFAULT_LOCALE;
      }
    }
    
    // Apply to DOM
    this.updateDOM();
    
    // Update HTML lang attribute
    document.documentElement.lang = this.currentLocale;
    
    // Update language selector if exists
    const selector = document.getElementById('language-select');
    if (selector) {
      selector.value = this.currentLocale;
    }
    
    console.log('[I18nManager] Initialized with locale:', this.currentLocale);
  },
  
  /**
   * Set the current locale
   * @param {string} locale - The locale code ('en-US' or 'zh-CN')
   */
  setLocale(locale) {
    if (!this.SUPPORTED_LOCALES.includes(locale)) {
      console.warn('[I18nManager] Unsupported locale:', locale);
      return;
    }
    
    if (this.currentLocale === locale) {
      return;
    }
    
    this.currentLocale = locale;
    localStorage.setItem(this.STORAGE_KEY, locale);
    
    // Update DOM
    this.updateDOM();
    
    // Update HTML lang attribute
    document.documentElement.lang = locale;
    
    // Update language selector if exists
    const selector = document.getElementById('language-select');
    if (selector) {
      selector.value = locale;
    }
    
    // Dispatch event for components that need to react
    window.dispatchEvent(new CustomEvent('localechange', {
      detail: { locale: locale }
    }));
    
    console.log('[I18nManager] Locale changed to:', locale);
  },
  
  /**
   * Get the current locale
   * @returns {string} Current locale code
   */
  getLocale() {
    return this.currentLocale;
  },
  
  /**
   * Get translation for a key
   * @param {string} key - Dot-notation key (e.g., 'common.save')
   * @param {Object} params - Optional parameters for interpolation
   * @returns {string} Translated text or key if not found
   */
  t(key, params = {}) {
    const pack = this.locales[this.currentLocale] || this.locales[this.DEFAULT_LOCALE];
    
    if (!pack) {
      console.warn('[I18nManager] No language pack loaded for:', this.currentLocale);
      return key;
    }
    
    // Navigate nested object using dot notation
    const keys = key.split('.');
    let value = pack;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Key not found, try fallback to English
        if (this.currentLocale !== this.DEFAULT_LOCALE) {
          return this.getFallback(key, params);
        }
        console.warn('[I18nManager] Missing translation key:', key);
        return key;
      }
    }
    
    if (typeof value !== 'string') {
      console.warn('[I18nManager] Translation value is not a string:', key);
      return key;
    }
    
    // Interpolate parameters
    return this.interpolate(value, params);
  },
  
  /**
   * Get fallback translation from default locale
   * @param {string} key - Translation key
   * @param {Object} params - Parameters for interpolation
   * @returns {string} Fallback text or key
   */
  getFallback(key, params) {
    const pack = this.locales[this.DEFAULT_LOCALE];
    if (!pack) return key;
    
    const keys = key.split('.');
    let value = pack;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        console.warn('[I18nManager] Missing translation key in fallback:', key);
        return key;
      }
    }
    
    if (typeof value !== 'string') {
      return key;
    }
    
    return this.interpolate(value, params);
  },
  
  /**
   * Interpolate parameters into a string
   * @param {string} str - String with {param} placeholders
   * @param {Object} params - Parameters to replace
   * @returns {string} Interpolated string
   */
  interpolate(str, params) {
    if (!params || Object.keys(params).length === 0) {
      return str;
    }
    
    return str.replace(/\{(\w+)\}/g, (match, key) => {
      return key in params ? params[key] : match;
    });
  },
  
  /**
   * Update all DOM elements with data-i18n attributes
   */
  updateDOM() {
    // Update textContent
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        el.textContent = this.t(key);
      }
    });
    
    // Update title attributes
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) {
        el.title = this.t(key);
      }
    });
    
    // Update placeholder attributes
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        el.placeholder = this.t(key);
      }
    });
    
    // Update aria-label attributes
    document.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      if (key) {
        el.setAttribute('aria-label', this.t(key));
      }
    });
  },
  
  /**
   * Check if a translation key exists
   * @param {string} key - Translation key
   * @returns {boolean} True if key exists
   */
  has(key) {
    const pack = this.locales[this.currentLocale];
    if (!pack) return false;
    
    const keys = key.split('.');
    let value = pack;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return false;
      }
    }
    
    return typeof value === 'string';
  }
};

// Make available globally
window.I18nManager = I18nManager;
window.I18nLocales = I18nLocales;
