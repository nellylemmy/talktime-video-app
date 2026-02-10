/**
 * Enhanced Mobile Navigation for TalkTime
 * Implements a modern slide-out drawer with touch gestures
 */

class EnhancedMobileNav {
    constructor() {
        this.isOpen = false;
        this.touchStartX = 0;
        this.touchCurrentX = 0;
        this.isDragging = false;
        this.init();
    }

    init() {
        this.createNavigationStructure();
        this.setupEventListeners();
        this.checkAuthState();
    }

    createNavigationStructure() {
        // Remove existing basic mobile menu if present
        const existingMenu = document.getElementById('mobile-menu');
        if (existingMenu) existingMenu.remove();

        // Create enhanced navigation drawer
        const drawer = document.createElement('div');
        drawer.id = 'mobile-nav-drawer';
        drawer.className = 'mobile-nav-drawer';
        drawer.innerHTML = `
            <div class="drawer-header">
                <div class="drawer-brand">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 24 24" fill="none">
                        <defs>
                            <linearGradient id="drawer-logo-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" style="stop-color:#4f46e5;"></stop>
                                <stop offset="100%" style="stop-color:#a855f7;"></stop>
                            </linearGradient>
                        </defs>
                        <path stroke="url(#drawer-logo-gradient)" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2z"></path>
                    </svg>
                    <span class="gradient-text font-bold text-xl">TALK TIME</span>
                </div>
                <button id="drawer-close" class="drawer-close" aria-label="Close navigation">
                    <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            </div>

            <div class="drawer-content">
                <!-- User Section (shown when logged in) -->
                <div id="drawer-user-section" class="drawer-user-section hidden">
                    <div class="user-profile">
                        <div id="drawer-user-avatar" class="user-avatar">
                            <span id="drawer-user-initial">V</span>
                        </div>
                        <div class="user-info">
                            <div id="drawer-user-name" class="user-name">Volunteer</div>
                            <div id="drawer-user-stats" class="user-stats">0 hours volunteered</div>
                        </div>
                    </div>
                </div>

                <!-- Primary Navigation -->
                <nav class="drawer-nav primary-nav">
                    <a href="/" class="nav-item">
                        <i class="fas fa-home"></i>
                        <span>Home</span>
                    </a>
                    <a href="/volunteer/dashboard/students.html" class="nav-item auth-required hidden">
                        <i class="fas fa-tachometer-alt"></i>
                        <span>Dashboard</span>
                    </a>
                    <a href="/volunteer/dashboard/students.html" class="nav-item auth-required hidden">
                        <i class="fas fa-users"></i>
                        <span>Students</span>
                    </a>
                    <a href="/volunteer/dashboard/schedule.html" class="nav-item auth-required hidden">
                        <i class="fas fa-calendar-alt"></i>
                        <span>Schedule</span>
                    </a>
                    <a href="/volunteer/who-we-are.html" class="nav-item">
                        <i class="fas fa-heart"></i>
                        <span>Who We Are</span>
                    </a>
                </nav>

                <div class="drawer-divider"></div>

                <!-- Secondary Navigation (shown when logged in) -->
                <nav id="drawer-secondary-nav" class="drawer-nav secondary-nav hidden">
                    <a href="/volunteer/notifications.html" class="nav-item">
                        <i class="fas fa-bell"></i>
                        <span>Notifications</span>
                        <span id="drawer-notification-badge" class="notification-badge hidden">0</span>
                    </a>
                    <a href="/volunteer/profile.html" class="nav-item">
                        <i class="fas fa-user"></i>
                        <span>My Profile</span>
                    </a>
                    <a href="/volunteer/settings" class="nav-item">
                        <i class="fas fa-cog"></i>
                        <span>Settings</span>
                    </a>
                </nav>

                <!-- Auth Section -->
                <div class="drawer-auth-section">
                    <div id="drawer-auth-buttons" class="auth-buttons">
                        <a href="/volunteer/login" class="btn-auth btn-login">
                            <i class="fas fa-sign-in-alt"></i>
                            <span>Login</span>
                        </a>
                        <a href="/volunteer/signup" class="btn-auth btn-signup">
                            <i class="fas fa-user-plus"></i>
                            <span>Sign Up</span>
                        </a>
                    </div>
                    <button id="drawer-logout-btn" class="btn-auth btn-logout hidden">
                        <i class="fas fa-sign-out-alt"></i>
                        <span>Logout</span>
                    </button>
                </div>
            </div>

            <div class="drawer-footer">
                <a href="https://adeafoundation.org" target="_blank" rel="noopener" class="adea-link">
                    <img src="https://adeafoundation.org/wp-content/uploads/2018/02/ADEA_Logo_rev.jpg" alt="ADEA" class="adea-logo">
                    <span>Powered by ADEA Foundation</span>
                </a>
            </div>
        `;

        // Create overlay
        const overlay = document.createElement('div');
        overlay.id = 'mobile-nav-overlay';
        overlay.className = 'mobile-nav-overlay';

        // Add to body
        document.body.appendChild(drawer);
        document.body.appendChild(overlay);

        // Update hamburger button
        this.updateHamburgerButton();
    }

    updateHamburgerButton() {
        const existingToggle = document.getElementById('mobile-menu-toggle');
        if (existingToggle) {
            existingToggle.id = 'enhanced-menu-toggle';
            existingToggle.innerHTML = `
                <div class="hamburger-lines">
                    <span class="line line1"></span>
                    <span class="line line2"></span>
                    <span class="line line3"></span>
                </div>
            `;
            existingToggle.setAttribute('aria-expanded', 'false');
            existingToggle.setAttribute('aria-controls', 'mobile-nav-drawer');
        }
    }

    setupEventListeners() {
        const toggle = document.getElementById('enhanced-menu-toggle');
        const closeBtn = document.getElementById('drawer-close');
        const overlay = document.getElementById('mobile-nav-overlay');
        const drawer = document.getElementById('mobile-nav-drawer');
        const logoutBtn = document.getElementById('drawer-logout-btn');

        // Toggle button
        if (toggle) {
            toggle.addEventListener('click', () => this.toggleDrawer());
        }

        // Close button
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeDrawer());
        }

        // Overlay click
        if (overlay) {
            overlay.addEventListener('click', () => this.closeDrawer());
        }

        // Logout
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (window.logout) window.logout();
                this.closeDrawer();
            });
        }

        // Touch gestures
        this.setupTouchGestures(drawer);

        // Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.closeDrawer();
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            if (window.innerWidth >= 768 && this.isOpen) {
                this.closeDrawer();
            }
        });
    }

    setupTouchGestures(drawer) {
        if (!drawer) return;

        // Touch start
        drawer.addEventListener('touchstart', (e) => {
            this.touchStartX = e.touches[0].clientX;
            this.isDragging = true;
        }, { passive: true });

        // Touch move
        drawer.addEventListener('touchmove', (e) => {
            if (!this.isDragging) return;

            this.touchCurrentX = e.touches[0].clientX;
            const translateX = Math.min(0, this.touchCurrentX - this.touchStartX);

            if (translateX < 0) {
                drawer.style.transform = `translateX(${translateX}px)`;
            }
        }, { passive: true });

        // Touch end
        drawer.addEventListener('touchend', (e) => {
            if (!this.isDragging) return;

            const translateX = this.touchCurrentX - this.touchStartX;
            drawer.style.transform = '';

            // If swiped left more than 50px, close drawer
            if (translateX < -50) {
                this.closeDrawer();
            }

            this.isDragging = false;
        }, { passive: true });

        // Edge swipe to open
        document.addEventListener('touchstart', (e) => {
            if (this.isOpen) return;

            // Detect edge swipe (left 20px of screen)
            if (e.touches[0].clientX < 20) {
                this.touchStartX = e.touches[0].clientX;
                this.edgeSwipeActive = true;
            }
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!this.edgeSwipeActive || this.isOpen) return;

            const currentX = e.touches[0].clientX;
            if (currentX - this.touchStartX > 50) {
                this.openDrawer();
                this.edgeSwipeActive = false;
            }
        }, { passive: true });

        document.addEventListener('touchend', () => {
            this.edgeSwipeActive = false;
        }, { passive: true });
    }

    toggleDrawer() {
        if (this.isOpen) {
            this.closeDrawer();
        } else {
            this.openDrawer();
        }
    }

    openDrawer() {
        const drawer = document.getElementById('mobile-nav-drawer');
        const overlay = document.getElementById('mobile-nav-overlay');
        const toggle = document.getElementById('enhanced-menu-toggle');

        if (!drawer || !overlay) return;

        this.isOpen = true;
        drawer.classList.add('open');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        if (toggle) {
            toggle.classList.add('active');
            toggle.setAttribute('aria-expanded', 'true');
        }

        // Trap focus
        drawer.focus();
    }

    closeDrawer() {
        const drawer = document.getElementById('mobile-nav-drawer');
        const overlay = document.getElementById('mobile-nav-overlay');
        const toggle = document.getElementById('enhanced-menu-toggle');

        if (!drawer || !overlay) return;

        this.isOpen = false;
        drawer.classList.remove('open');
        overlay.classList.remove('active');
        document.body.style.overflow = '';

        if (toggle) {
            toggle.classList.remove('active');
            toggle.setAttribute('aria-expanded', 'false');
        }
    }

    checkAuthState() {
        // Check if user is authenticated
        const isAuth = localStorage.getItem('volunteer_token') ||
                      sessionStorage.getItem('volunteer_token');

        const userSection = document.getElementById('drawer-user-section');
        const secondaryNav = document.getElementById('drawer-secondary-nav');
        const authButtons = document.getElementById('drawer-auth-buttons');
        const logoutBtn = document.getElementById('drawer-logout-btn');
        const authRequired = document.querySelectorAll('.auth-required');

        if (isAuth) {
            // Show authenticated elements
            userSection?.classList.remove('hidden');
            secondaryNav?.classList.remove('hidden');
            authButtons?.classList.add('hidden');
            logoutBtn?.classList.remove('hidden');
            authRequired.forEach(el => el.classList.remove('hidden'));

            // Update user info if available
            this.updateUserInfo();
        } else {
            // Show unauthenticated elements
            userSection?.classList.add('hidden');
            secondaryNav?.classList.add('hidden');
            authButtons?.classList.remove('hidden');
            logoutBtn?.classList.add('hidden');
            authRequired.forEach(el => el.classList.add('hidden'));
        }
    }

    updateUserInfo() {
        // Update user information from stored data
        const userData = JSON.parse(localStorage.getItem('volunteer_data') || '{}');

        if (userData.name) {
            const nameEl = document.getElementById('drawer-user-name');
            const initialEl = document.getElementById('drawer-user-initial');

            if (nameEl) nameEl.textContent = userData.name;
            if (initialEl) initialEl.textContent = userData.name.charAt(0).toUpperCase();
        }

        if (userData.hoursVolunteered) {
            const statsEl = document.getElementById('drawer-user-stats');
            if (statsEl) statsEl.textContent = `${userData.hoursVolunteered} hours volunteered`;
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.enhancedMobileNav = new EnhancedMobileNav();
    });
} else {
    window.enhancedMobileNav = new EnhancedMobileNav();
}