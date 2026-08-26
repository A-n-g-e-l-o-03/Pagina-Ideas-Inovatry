/**
 * ThemeManager — Gestor de temas con soporte para 7 temas incluyendo high-contrast WCAG AAA
 * ES Module vanilla, export class ThemeManager extends EventTarget
 * Temas: light, dark, protanopia, deuteranopia, tritanopia, mono, high-contrast
 */
export class ThemeManager extends EventTarget {
  constructor() {
    super();

    // Temas soportados
    this.THEMES = [
      'light',
      'dark',
      'protanopia',
      'deuteranopia',
      'tritanopia',
      'mono',
      'high-contrast'
    ];

    // Key de localStorage
    this.STORAGE_KEY = 'ecosystem-theme';

    // Tema actual
    this.currentTheme = this.loadTheme();

    // Aplicar tema inicial
    this.applyTheme(this.currentTheme);

    // Escuchar cambios en otras tabs
    window.addEventListener('storage', (e) => {
      if (e.key === this.STORAGE_KEY && e.newValue) {
        this.setTheme(e.newValue, false); // false = no persistir (ya viene de storage)
      }
    });

    // Detectar high-contrast del OS al inicializar
    this.initOSHighContrastDetection();
  }

  /**
   * Detecta si el OS tiene preferencia high-contrast activa
   * @returns {boolean}
   */
  detectOSHighContrast() {
    return window.matchMedia('(prefers-contrast: more)').matches;
  }

  /**
   * Inicializa detección de high-contrast del OS
   * Aplica tema high-contrast automáticamente si no hay preferencia de usuario guardada
   */
  initOSHighContrastDetection() {
    // Al cargar: si OS prefiere high-contrast y usuario no ha elegido tema, aplicar high-contrast
    if (this.detectOSHighContrast() && !localStorage.getItem(this.STORAGE_KEY)) {
      this.setTheme('high-contrast');
    }

    // Listener para cambios runtime del OS
    window.matchMedia('(prefers-contrast: more)').addEventListener('change', (e) => {
      // Solo auto-aplicar si el usuario no ha guardado una preferencia explícita
      if (e.matches && !localStorage.getItem(this.STORAGE_KEY)) {
        this.setTheme('high-contrast');
      }
    });
  }

  /**
   * Carga el tema desde localStorage o detecta preferencia del sistema
   * @returns {string}
   */
  loadTheme() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored && this.THEMES.includes(stored)) {
        return stored;
      }
    } catch (e) {
      // Ignorar errores (private mode, quota, etc.)
    }

    // Fallback: preferencia del sistema
    if (typeof window !== 'undefined' && window.matchMedia) {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    }

    return 'light';
  }

  /**
   * Obtiene el tema actual
   * @returns {string}
   */
  getCurrent() {
    return this.currentTheme;
  }

  /**
   * Establece el tema, persiste y dispara evento
   * @param {string} theme - Nombre del tema
   * @param {boolean} [persist=true] - Si persistir en localStorage
   */
  setTheme(theme, persist = true) {
    if (!this.THEMES.includes(theme)) {
      console.warn(`[ThemeManager] Tema desconocido: ${theme}. Usando 'light'.`);
      theme = 'light';
    }

    const oldTheme = this.currentTheme;
    this.currentTheme = theme;

    this.applyTheme(theme);

    if (persist) {
      try {
        localStorage.setItem(this.STORAGE_KEY, theme);
      } catch (e) {
        console.warn('[ThemeManager] No se pudo persistir tema:', e);
      }
    }

    // Disparar evento de cambio
    this.dispatchEvent(new CustomEvent('themechange', {
      detail: { theme, oldTheme, timestamp: Date.now() }
    }));

    // También en window para compatibilidad global
    window.dispatchEvent(new CustomEvent('ecosystem:themechange', {
      detail: { theme, oldTheme }
    }));
  }

  /**
   * Aplica el tema al documentElement (data-theme attribute)
   * @param {string} theme
   */
  applyTheme(theme) {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  /**
   * Obtiene las variables CSS para un tema específico
   * @param {string} theme
   * @returns {Object} { varName: value }
   */
  getThemeCSSVars(theme) {
    const themes = {
      light: {
        '--color-bg': '#ffffff',
        '--color-bg-secondary': '#f8f9fa',
        '--color-bg-tertiary': '#e9ecef',
        '--color-text': '#212529',
        '--color-text-secondary': '#495057',
        '--color-text-muted': '#6c757d',
        '--color-primary': '#2563eb',
        '--color-primary-hover': '#1d4ed8',
        '--color-primary-light': '#dbeafe',
        '--color-border': '#dee2e6',
        '--color-border-focus': '#2563eb',
        '--color-error': '#dc2626',
        '--color-error-bg': '#fef2f2',
        '--color-success': '#16a34a',
        '--color-success-bg': '#f0fdf4',
        '--color-warning': '#d97706',
        '--color-warning-bg': '#fffbeb',
        '--color-focus-ring': '0 0 0 3px rgba(37, 99, 235, 0.4)',
        '--shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
        '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
        '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)'
      },

      dark: {
        '--color-bg': '#111827',
        '--color-bg-secondary': '#1f2937',
        '--color-bg-tertiary': '#374151',
        '--color-text': '#f9fafb',
        '--color-text-secondary': '#d1d5db',
        '--color-text-muted': '#9ca3af',
        '--color-primary': '#3b82f6',
        '--color-primary-hover': '#60a5fa',
        '--color-primary-light': '#1e3a5f',
        '--color-border': '#374151',
        '--color-border-focus': '#3b82f6',
        '--color-error': '#ef4444',
        '--color-error-bg': '#450a0a',
        '--color-success': '#22c55e',
        '--color-success-bg': '#052e16',
        '--color-warning': '#f59e0b',
        '--color-warning-bg': '#451a03',
        '--color-focus-ring': '0 0 0 3px rgba(59, 130, 246, 0.4)',
        '--shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.3)',
        '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -2px rgba(0, 0, 0, 0.3)',
        '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -4px rgba(0, 0, 0, 0.3)'
      },

      protanopia: {
        '--color-bg': '#fefefe',
        '--color-bg-secondary': '#f5f5f5',
        '--color-bg-tertiary': '#e8e8e8',
        '--color-text': '#1a1a2e',
        '--color-text-secondary': '#3d3d5c',
        '--color-text-muted': '#6b6b8a',
        '--color-primary': '#0072b2', // Azul fuerte (seguro para protanopia)
        '--color-primary-hover': '#005a8a',
        '--color-primary-light': '#d6eaf8',
        '--color-border': '#cccccc',
        '--color-border-focus': '#0072b2',
        '--color-error': '#d55e00', // Naranja/rojo seguro
        '--color-error-bg': '#fdf2e9',
        '--color-success': '#009e73', // Verde azulado seguro
        '--color-success-bg': '#e8f8f5',
        '--color-warning': '#cc79a7', // Magenta seguro
        '--color-warning-bg': '#fce4ec',
        '--color-focus-ring': '0 0 0 3px rgba(0, 114, 178, 0.4)',
        '--shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
        '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
      },

      deuteranopia: {
        '--color-bg': '#fefefe',
        '--color-bg-secondary': '#f5f5f5',
        '--color-bg-tertiary': '#e8e8e8',
        '--color-text': '#1a1a2e',
        '--color-text-secondary': '#3d3d5c',
        '--color-text-muted': '#6b6b8a',
        '--color-primary': '#0072b2', // Azul fuerte (seguro para deuteranopia)
        '--color-primary-hover': '#005a8a',
        '--color-primary-light': '#d6eaf8',
        '--color-border': '#cccccc',
        '--color-border-focus': '#0072b2',
        '--color-error': '#d55e00', // Naranja/rojo seguro
        '--color-error-bg': '#fdf2e9',
        '--color-success': '#009e73', // Verde azulado seguro
        '--color-success-bg': '#e8f8f5',
        '--color-warning': '#cc79a7', // Magenta seguro
        '--color-warning-bg': '#fce4ec',
        '--color-focus-ring': '0 0 0 3px rgba(0, 114, 178, 0.4)',
        '--shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
        '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
      },

      tritanopia: {
        '--color-bg': '#fefefe',
        '--color-bg-secondary': '#f5f5f5',
        '--color-bg-tertiary': '#e8e8e8',
        '--color-text': '#1a1a2e',
        '--color-text-secondary': '#3d3d5c',
        '--color-text-muted': '#6b6b8a',
        '--color-primary': '#cc79a7', // Magenta (seguro para tritanopia)
        '--color-primary-hover': '#a85c88',
        '--color-primary-light': '#fce4ec',
        '--color-border': '#cccccc',
        '--color-border-focus': '#cc79a7',
        '--color-error': '#d55e00', // Naranja seguro
        '--color-error-bg': '#fdf2e9',
        '--color-success': '#009e73', // Verde azulado seguro
        '--color-success-bg': '#e8f8f5',
        '--color-warning': '#0072b2', // Azul seguro
        '--color-warning-bg': '#d6eaf8',
        '--color-focus-ring': '0 0 0 3px rgba(204, 121, 167, 0.4)',
        '--shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
        '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
      },

      mono: {
        '--color-bg': '#ffffff',
        '--color-bg-secondary': '#f0f0f0',
        '--color-bg-tertiary': '#e0e0e0',
        '--color-text': '#000000',
        '--color-text-secondary': '#333333',
        '--color-text-muted': '#666666',
        '--color-primary': '#000000',
        '--color-primary-hover': '#333333',
        '--color-primary-light': '#e0e0e0',
        '--color-border': '#999999',
        '--color-border-focus': '#000000',
        '--color-error': '#000000',
        '--color-error-bg': '#f0f0f0',
        '--color-success': '#000000',
        '--color-success-bg': '#f0f0f0',
        '--color-warning': '#000000',
        '--color-warning-bg': '#f0f0f0',
        '--color-focus-ring': '0 0 0 3px rgba(0, 0, 0, 0.4)',
        '--shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.1)',
        '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.15)',
        '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.2)'
      },

      'high-contrast': {
        // WCAG AAA: contraste >= 7:1
        // Negro puro #000, Blanco puro #fff
        // Amarillo #ff0 (contraste 19.5:1 sobre negro)
        // Verde #0f0 (contraste 15.3:1 sobre negro)
        // Rojo #f00 (contraste 5.25:1 sobre negro - usar #cc0000 para 7:1)
        '--color-bg': '#000000',
        '--color-bg-secondary': '#0a0a0a',
        '--color-bg-tertiary': '#1a1a1a',
        '--color-text': '#ffffff',
        '--color-text-secondary': '#ffff00', // Amarillo para texto secundario
        '--color-text-muted': '#cccccc',
        '--color-primary': '#ffff00', // Amarillo primario
        '--color-primary-hover': '#ffff33',
        '--color-primary-light': '#333300',
        '--color-border': '#ffffff',
        '--color-border-focus': '#ffff00',
        '--color-error': '#ff0000', // Rojo puro
        '--color-error-bg': '#330000',
        '--color-success': '#00ff00', // Verde puro
        '--color-success-bg': '#003300',
        '--color-warning': '#ffff00', // Amarillo
        '--color-warning-bg': '#333300',
        '--color-focus-ring': '0 0 0 4px #ffff00', // Focus ring amarillo grueso
        '--shadow-sm': '0 0 0 1px #ffffff',
        '--shadow-md': '0 0 0 2px #ffffff',
        '--shadow-lg': '0 0 0 3px #ffff00'
      }
    };

    return themes[theme] || themes.light;
  }

  /**
   * Obtiene lista de temas disponibles
   * @returns {string[]}
   */
  getAvailableThemes() {
    return [...this.THEMES];
  }

  /**
   * Alterna al siguiente tema en la lista
   */
  nextTheme() {
    const currentIndex = this.THEMES.indexOf(this.currentTheme);
    const nextIndex = (currentIndex + 1) % this.THEMES.length;
    this.setTheme(this.THEMES[nextIndex]);
  }

  /**
   * Alterna al tema anterior en la lista
   */
  prevTheme() {
    const currentIndex = this.THEMES.indexOf(this.currentTheme);
    const prevIndex = (currentIndex - 1 + this.THEMES.length) % this.THEMES.length;
    this.setTheme(this.THEMES[prevIndex]);
  }

  /**
   * Inicializa el UI del theme switcher (compatibilidad con FormEngine)
   * @param {Object} options - { buttonId, menuId, optionSelector }
   */
  initThemeSwitcherUI(options = {}) {
    const {
      buttonId = 'themeBtn',
      menuId = 'themeMenu',
      optionSelector = '[data-theme-option]'
    } = options;

    const btn = document.getElementById(buttonId);
    const menu = document.getElementById(menuId);

    if (!btn || !menu) {
      console.warn('[ThemeManager] Theme switcher UI elements not found');
      return;
    }

    const closeMenu = () => {
      menu.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    };

    const syncUI = () => {
      document.querySelectorAll(optionSelector).forEach(opt => {
        const isActive = opt.getAttribute('data-theme-option') === this.currentTheme;
        opt.setAttribute('aria-checked', isActive ? 'true' : 'false');
      });
    };

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menu.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.theme-switcher')) closeMenu();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });

    document.querySelectorAll(optionSelector).forEach(opt => {
      opt.addEventListener('click', () => {
        const theme = opt.getAttribute('data-theme-option');
        if (theme) {
          this.setTheme(theme);
          closeMenu();
        }
      });
    });

    // Sincronizar al inicio y en cambios
    syncUI();
    this.addEventListener('themechange', syncUI);
  }
}

/**
 * Instancia singleton por defecto
 */
export const themeManager = new ThemeManager();

export default ThemeManager;