/**
 * TalkTime Brand Configuration
 * =============================
 * JavaScript-based brand configuration for dynamic theming
 * This file works in conjunction with brand-theme.css
 */

window.TalkTimeBrand = {
  // Current brand configuration
  config: {
    name: 'TalkTime',
    tagline: 'Connecting Volunteers with Students',

    // Typography configuration
    typography: {
      fontFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      headingFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      bodyFamily: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"
    },

    // Primary brand colors - MUST MATCH brand-theme.css
    colors: {
      primary: '#D10100',        // Red
      secondary: '#3867FF',      // Blue
      primaryDark: '#7d0000',    // Dark Red
      secondaryDark: '#001d7d',  // Dark Blue
      primaryLight: '#ff3d3d',   // Light Red
      secondaryLight: '#7d9cff', // Light Blue

      // Semantic colors
      success: '#116C00',
      warning: '#FFE006',
      error: '#7d0000',
      info: '#D10100'
    },

    // Logo configuration
    logo: {
      gradient: 'logo-gradient',
      primaryColor: '#D10100',
      secondaryColor: '#3867FF'
    }
  },

  /**
   * Initialize the brand theme
   */
  init() {
    this.applyTheme();
    this.setupThemeListeners();
    console.log('🎨 TalkTime Brand System initialized');
  },

  /**
   * Apply the current theme to the document
   */
  applyTheme() {
    const root = document.documentElement;
    const config = this.config.colors;
    const typography = this.config.typography;

    // Apply typography custom properties
    root.style.setProperty('--brand-font-family', typography.fontFamily);
    root.style.setProperty('--brand-heading-family', typography.headingFamily);
    root.style.setProperty('--brand-body-family', typography.bodyFamily);

    // Apply CSS custom properties
    root.style.setProperty('--brand-primary', config.primary);
    root.style.setProperty('--brand-secondary', config.secondary);
    root.style.setProperty('--brand-primary-dark', config.primaryDark);
    root.style.setProperty('--brand-secondary-dark', config.secondaryDark);
    root.style.setProperty('--brand-primary-light', config.primaryLight);
    root.style.setProperty('--brand-secondary-light', config.secondaryLight);

    // Update gradients
    root.style.setProperty('--brand-gradient-primary',
      `linear-gradient(135deg, ${config.primary}, ${config.secondary})`);
    root.style.setProperty('--brand-gradient-secondary',
      `linear-gradient(135deg, ${config.primaryLight}, ${config.secondaryLight})`);

    // Update logo gradients if they exist
    this.updateLogoGradients();
  },

  /**
   * Update all logo SVG gradients on the page
   */
  updateLogoGradients() {
    const gradients = document.querySelectorAll('#logo-gradient stop');
    if (gradients.length >= 2) {
      gradients[0].style.stopColor = this.config.colors.primary;
      gradients[1].style.stopColor = this.config.colors.secondary;
    }
  },

  /**
   * Change the brand colors dynamically
   * @param {Object} newColors - Object containing new color values
   * @example
   * TalkTimeBrand.rebrand({
   *   primary: '#059669',      // Green
   *   secondary: '#f59e0b'     // Amber
   * });
   */
  rebrand(newColors) {
    // Merge new colors with existing config
    Object.assign(this.config.colors, newColors);

    // Recalculate derived colors if not provided
    if (!newColors.primaryDark && newColors.primary) {
      this.config.colors.primaryDark = this.darkenColor(newColors.primary, 20);
    }
    if (!newColors.secondaryDark && newColors.secondary) {
      this.config.colors.secondaryDark = this.darkenColor(newColors.secondary, 20);
    }
    if (!newColors.primaryLight && newColors.primary) {
      this.config.colors.primaryLight = this.lightenColor(newColors.primary, 20);
    }
    if (!newColors.secondaryLight && newColors.secondary) {
      this.config.colors.secondaryLight = this.lightenColor(newColors.secondary, 20);
    }

    // Apply the new theme
    this.applyTheme();

    // Save to localStorage for persistence
    this.saveTheme();

    // Dispatch custom event for components to react
    window.dispatchEvent(new CustomEvent('brandChanged', {
      detail: this.config.colors
    }));

    console.log('🎨 Brand colors updated:', this.config.colors);
  },

  /**
   * Save the current theme to localStorage
   */
  saveTheme() {
    localStorage.setItem('talktime-brand-colors', JSON.stringify(this.config.colors));
  },

  /**
   * Load saved theme from localStorage
   */
  loadSavedTheme() {
    const saved = localStorage.getItem('talktime-brand-colors');
    if (saved) {
      try {
        const colors = JSON.parse(saved);
        this.config.colors = colors;
        this.applyTheme();
        console.log('🎨 Loaded saved brand colors');
      } catch (e) {
        console.error('Failed to load saved theme:', e);
      }
    }
  },

  /**
   * Reset to default brand colors
   */
  resetToDefault() {
    this.config.colors = {
      primary: '#4f46e5',
      secondary: '#a855f7',
      primaryDark: '#3730a3',
      secondaryDark: '#9333ea',
      primaryLight: '#667eea',
      secondaryLight: '#764ba2',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444',
      info: '#3b82f6'
    };
    this.applyTheme();
    localStorage.removeItem('talktime-brand-colors');
    console.log('🎨 Reset to default TalkTime brand');
  },

  /**
   * Setup event listeners for theme changes
   */
  setupThemeListeners() {
    // Listen for system dark mode changes
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        console.log('🌓 System theme changed:', e.matches ? 'dark' : 'light');
        // You can adjust colors for dark mode here if needed
      });
    }
  },

  /**
   * Utility: Darken a hex color
   */
  darkenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) - amt;
    const G = (num >> 8 & 0x00FF) - amt;
    const B = (num & 0x0000FF) - amt;
    return '#' + (0x1000000 + (R < 0 ? 0 : R) * 0x10000 +
                  (G < 0 ? 0 : G) * 0x100 +
                  (B < 0 ? 0 : B)).toString(16).slice(1);
  },

  /**
   * Utility: Lighten a hex color
   */
  lightenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + (R > 255 ? 255 : R) * 0x10000 +
                  (G > 255 ? 255 : G) * 0x100 +
                  (B > 255 ? 255 : B)).toString(16).slice(1);
  },

  /**
   * Get preset brand themes
   */
  presets: {
    default: {
      name: 'TalkTime Purple',
      primary: '#4f46e5',
      secondary: '#a855f7'
    },
    ocean: {
      name: 'Ocean Blue',
      primary: '#0891b2',
      secondary: '#06b6d4'
    },
    forest: {
      name: 'Forest Green',
      primary: '#059669',
      secondary: '#10b981'
    },
    sunset: {
      name: 'Sunset Orange',
      primary: '#ea580c',
      secondary: '#f59e0b'
    },
    midnight: {
      name: 'Midnight Blue',
      primary: '#1e3a8a',
      secondary: '#3b82f6'
    },
    rose: {
      name: 'Rose Pink',
      primary: '#e11d48',
      secondary: '#ec4899'
    },
    corporate: {
      name: 'Corporate Gray',
      primary: '#475569',
      secondary: '#64748b'
    }
  },

  /**
   * Apply a preset theme
   */
  applyPreset(presetName) {
    const preset = this.presets[presetName];
    if (preset) {
      this.rebrand({
        primary: preset.primary,
        secondary: preset.secondary
      });
      console.log(`🎨 Applied ${preset.name} theme`);
      return true;
    }
    console.error(`Theme preset '${presetName}' not found`);
    return false;
  }
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    TalkTimeBrand.init();
    TalkTimeBrand.loadSavedTheme();
  });
} else {
  TalkTimeBrand.init();
  TalkTimeBrand.loadSavedTheme();
}