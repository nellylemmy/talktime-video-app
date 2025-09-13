/**
 * TalkTime Theme Manager
 * Handles dark/light mode, font sizes, and zoom levels
 * Integrates with volunteer settings API
 */

class ThemeManager {
    constructor() {
        this.currentTheme = this.getStoredTheme();
        this.fontSize = this.getStoredFontSize();
        this.zoomLevel = this.getStoredZoom();
        
        // Theme configurations
        this.themes = {
            light: {
                name: 'light',
                colors: {
                    '--bg-primary': '#ffffff',
                    '--bg-secondary': '#f8fafc',
                    '--bg-accent': '#f1f5f9',
                    '--text-primary': '#1e293b',
                    '--text-secondary': '#64748b',
                    '--text-muted': '#94a3b8',
                    '--border-color': '#e2e8f0',
                    '--nav-bg': 'rgba(255, 255, 255, 0.6)',
                    '--nav-bg-scrolled': 'rgba(255, 255, 255, 0.8)',
                    '--card-bg': '#ffffff',
                    '--shadow': '0 1px 3px 0 rgb(0 0 0 / 0.1)'
                }
            },
            dark: {
                name: 'dark',
                colors: {
                    '--bg-primary': '#0f172a',
                    '--bg-secondary': '#1e293b',
                    '--bg-accent': '#334155',
                    '--text-primary': '#f8fafc',
                    '--text-secondary': '#cbd5e1',
                    '--text-muted': '#94a3b8',
                    '--border-color': '#475569',
                    '--nav-bg': 'rgba(15, 23, 42, 0.6)',
                    '--nav-bg-scrolled': 'rgba(15, 23, 42, 0.8)',
                    '--card-bg': '#1e293b',
                    '--shadow': '0 1px 3px 0 rgb(0 0 0 / 0.3)'
                }
            }
        };
        
        this.fontSizes = {
            small: { base: '14px', scale: 0.875 },
            medium: { base: '16px', scale: 1 },
            large: { base: '18px', scale: 1.125 },
            xl: { base: '20px', scale: 1.25 }
        };
        
        this.zoomLevels = [75, 100, 125, 150];
        
        this.init();
    }
    
    init() {
        this.createStyleElement();
        this.applyTheme();
        this.applyFontSize();
        this.applyZoom();
        this.setupSystemThemeListener();
        this.setupStorageListener();
    }
    
    createStyleElement() {
        // Create or get existing theme style element
        this.styleElement = document.getElementById('theme-styles') || document.createElement('style');
        this.styleElement.id = 'theme-styles';
        if (!document.getElementById('theme-styles')) {
            document.head.appendChild(this.styleElement);
        }
    }
    
    getStoredTheme() {
        return localStorage.getItem('talktime_theme') || 'light';
    }
    
    getStoredFontSize() {
        return localStorage.getItem('talktime_font_size') || 'medium';
    }
    
    getStoredZoom() {
        return parseInt(localStorage.getItem('talktime_zoom_level')) || 100;
    }
    
    setTheme(theme) {
        if (!this.themes[theme] && theme !== 'auto') {
            console.warn(`Unknown theme: ${theme}`);
            return false;
        }
        
        this.currentTheme = theme;
        localStorage.setItem('talktime_theme', theme);
        this.applyTheme();
        this.syncWithServer();
        this.dispatchThemeChange();
        return true;
    }
    
    setFontSize(size) {
        if (!this.fontSizes[size]) {
            console.warn(`Unknown font size: ${size}`);
            return false;
        }
        
        this.fontSize = size;
        localStorage.setItem('talktime_font_size', size);
        this.applyFontSize();
        this.syncWithServer();
        this.dispatchFontSizeChange();
        return true;
    }
    
    setZoom(level) {
        level = parseInt(level);
        if (!this.zoomLevels.includes(level)) {
            console.warn(`Invalid zoom level: ${level}`);
            return false;
        }
        
        this.zoomLevel = level;
        localStorage.setItem('talktime_zoom_level', level.toString());
        this.applyZoom();
        this.syncWithServer();
        this.dispatchZoomChange();
        return true;
    }
    
    applyTheme() {
        let effectiveTheme = this.currentTheme;
        
        // Handle auto theme
        if (this.currentTheme === 'auto') {
            effectiveTheme = this.getSystemTheme();
        }
        
        const theme = this.themes[effectiveTheme];
        if (!theme) return;
        
        // Apply CSS custom properties
        let css = ':root {\n';
        for (const [property, value] of Object.entries(theme.colors)) {
            css += `  ${property}: ${value};\n`;
        }
        css += '}\n';
        
        // Add theme-specific styles
        css += this.getThemeSpecificCSS(effectiveTheme);
        
        this.styleElement.textContent = css;
        document.documentElement.setAttribute('data-theme', effectiveTheme);
    }
    
    applyFontSize() {
        const sizeConfig = this.fontSizes[this.fontSize];
        if (!sizeConfig) return;
        
        document.documentElement.style.fontSize = sizeConfig.base;
        document.documentElement.setAttribute('data-font-size', this.fontSize);
        
        // Dispatch custom event for components that need to react
        this.dispatchFontSizeChange();
    }
    
    applyZoom() {
        document.documentElement.style.zoom = `${this.zoomLevel}%`;
        document.documentElement.setAttribute('data-zoom-level', this.zoomLevel.toString());
        
        // Dispatch custom event
        this.dispatchZoomChange();
    }
    
    getThemeSpecificCSS(theme) {
        const baseCSS = `
            body {
                background-color: var(--bg-primary);
                color: var(--text-primary);
                transition: background-color 0.3s ease, color 0.3s ease;
            }
            
            .card, .glass-card {
                background-color: var(--card-bg);
                border-color: var(--border-color);
            }
            
            #main-header {
                background: var(--nav-bg);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
            }
            
            #main-header.scrolled {
                background: var(--nav-bg-scrolled);
            }
            
            .text-gray-800 { color: var(--text-primary) !important; }
            .text-gray-600 { color: var(--text-secondary) !important; }
            .text-gray-500 { color: var(--text-muted) !important; }
            
            .bg-white { background-color: var(--card-bg) !important; }
            .border-gray-200 { border-color: var(--border-color) !important; }
        `;
        
        if (theme === 'dark') {
            return baseCSS + `
                .gradient-bg {
                    background: linear-gradient(135deg, #1e293b 0%, #334155 100%) !important;
                }
                
                .blob {
                    opacity: 0.1 !important;
                }
                
                input, textarea, select {
                    background-color: var(--bg-accent);
                    color: var(--text-primary);
                    border-color: var(--border-color);
                }
                
                input:focus, textarea:focus, select:focus {
                    background-color: var(--bg-secondary);
                }
            `;
        }
        
        return baseCSS;
    }
    
    getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    
    setupSystemThemeListener() {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', () => {
            if (this.currentTheme === 'auto') {
                this.applyTheme();
            }
        });
    }
    
    setupStorageListener() {
        window.addEventListener('storage', (e) => {
            if (e.key === 'talktime_theme') {
                this.currentTheme = e.newValue || 'light';
                this.applyTheme();
            } else if (e.key === 'talktime_font_size') {
                this.fontSize = e.newValue || 'medium';
                this.applyFontSize();
            } else if (e.key === 'talktime_zoom_level') {
                this.zoomLevel = parseInt(e.newValue) || 100;
                this.applyZoom();
            }
        });
    }
    
    async syncWithServer() {
        // Sync with backend API if user is logged in
        if (window.TalkTimeAuth && window.TalkTimeAuth.isAuthenticated()) {
            try {
                const response = await fetch('/api/v1/volunteer/settings', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.TalkTimeAuth.getToken()}`
                    },
                    body: JSON.stringify({
                        theme_mode: this.currentTheme,
                        font_size: this.fontSize,
                        zoom_level: this.zoomLevel
                    })
                });
                
                if (!response.ok) {
                    console.warn('Failed to sync theme settings with server');
                }
            } catch (error) {
                console.warn('Error syncing theme settings:', error);
            }
        }
    }
    
    async loadFromServer() {
        // Load settings from server if user is logged in
        if (window.TalkTimeAuth && window.TalkTimeAuth.isAuthenticated()) {
            try {
                const response = await fetch('/api/v1/volunteer/settings', {
                    headers: {
                        'Authorization': `Bearer ${window.TalkTimeAuth.getToken()}`
                    }
                });
                
                if (response.ok) {
                    const settings = await response.json();
                    
                    // Apply server settings if they exist
                    if (settings.theme_mode) {
                        this.setTheme(settings.theme_mode);
                    }
                    if (settings.font_size) {
                        this.setFontSize(settings.font_size);
                    }
                    if (settings.zoom_level) {
                        this.setZoom(settings.zoom_level);
                    }
                }
            } catch (error) {
                console.warn('Error loading theme settings from server:', error);
            }
        }
    }
    
    // Event dispatchers for other components to listen
    dispatchThemeChange() {
        window.dispatchEvent(new CustomEvent('themeChanged', {
            detail: { theme: this.currentTheme }
        }));
    }
    
    dispatchFontSizeChange() {
        window.dispatchEvent(new CustomEvent('fontSizeChanged', {
            detail: { fontSize: this.fontSize }
        }));
    }
    
    dispatchZoomChange() {
        window.dispatchEvent(new CustomEvent('zoomChanged', {
            detail: { zoomLevel: this.zoomLevel }
        }));
    }
    
    // Utility methods for components
    getCurrentTheme() {
        return this.currentTheme === 'auto' ? this.getSystemTheme() : this.currentTheme;
    }
    
    getCurrentFontSize() {
        return this.fontSize;
    }
    
    getCurrentZoom() {
        return this.zoomLevel;
    }
    
    getAvailableThemes() {
        return ['light', 'dark', 'auto'];
    }
    
    getAvailableFontSizes() {
        return Object.keys(this.fontSizes);
    }
    
    getAvailableZoomLevels() {
        return [...this.zoomLevels];
    }
}

// Auto-initialize theme manager
document.addEventListener('DOMContentLoaded', () => {
    if (!window.TalkTimeTheme) {
        window.TalkTimeTheme = new ThemeManager();
        
        // Load server settings after authentication is ready
        setTimeout(() => {
            if (window.TalkTimeAuth && window.TalkTimeAuth.isAuthenticated()) {
                window.TalkTimeTheme.loadFromServer();
            }
        }, 1000);
    }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThemeManager;
}
