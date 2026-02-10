/**
 * Mobile Navigation Handler
 * Implements a mobile-first responsive navigation with hamburger menu
 * Based on mobile-first responsive design principles
 */

class MobileNavigation {
    constructor() {
        this.init();
        this.setupEventListeners();
    }

    init() {
        // Get elements
        this.header = document.getElementById('main-header');
        this.mobileToggle = document.getElementById('mobile-menu-toggle');
        this.mobileMenu = document.getElementById('mobile-menu');
        this.mobileOverlay = document.getElementById('mobile-menu-overlay');
        this.desktopNav = document.getElementById('desktop-nav');

        // State
        this.isOpen = false;
        this.touchStartX = null;
        this.touchStartY = null;

        // Create mobile menu structure if it doesn't exist
        this.createMobileMenu();
    }

    createMobileMenu() {
        // Check if mobile menu elements already exist
        if (!this.mobileToggle) {
            // Create hamburger toggle button
            const toggleBtn = document.createElement('button');
            toggleBtn.id = 'mobile-menu-toggle';
            toggleBtn.className = 'mobile-menu-toggle md:hidden';
            toggleBtn.setAttribute('aria-label', 'Toggle navigation menu');
            toggleBtn.setAttribute('aria-expanded', 'false');
            toggleBtn.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path class="menu-icon-top" d="M4 6H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="transition: all 0.3s ease"/>
                    <path class="menu-icon-middle" d="M4 12H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="transition: all 0.3s ease"/>
                    <path class="menu-icon-bottom" d="M4 18H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="transition: all 0.3s ease"/>
                </svg>
            `;

            // Insert toggle button in header
            const nav = this.header?.querySelector('nav');
            if (nav) {
                // Find auth buttons or profile section
                const authButtons = nav.querySelector('#nav-auth-buttons');
                const profileSection = nav.querySelector('#nav-profile-section');
                const targetElement = authButtons || profileSection;

                if (targetElement) {
                    nav.insertBefore(toggleBtn, targetElement);
                } else {
                    nav.appendChild(toggleBtn);
                }
            }

            this.mobileToggle = toggleBtn;
        }

        if (!this.mobileMenu) {
            // Create mobile menu container
            const mobileMenu = document.createElement('div');
            mobileMenu.id = 'mobile-menu';
            mobileMenu.className = 'mobile-menu';
            mobileMenu.setAttribute('aria-hidden', 'true');

            // Clone desktop navigation items for mobile
            const desktopNavItems = document.querySelectorAll('.hidden.md\\:flex a, [class*="hidden"][class*="md:flex"] a');
            const navItemsHTML = Array.from(desktopNavItems).map(item => {
                const clone = item.cloneNode(true);
                clone.className = 'mobile-nav-item block px-4 py-3 text-gray-700 hover:bg-gray-100 hover:text-indigo-600 transition-colors';
                return clone.outerHTML;
            }).join('');

            // Get auth state
            const isAuthenticated = document.getElementById('nav-profile-section')?.classList.contains('flex');

            mobileMenu.innerHTML = `
                <div class="mobile-menu-header flex items-center justify-between mb-6">
                    <div class="flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mr-2" viewBox="0 0 24 24" fill="none">
                            <defs>
                                <linearGradient id="mobile-logo-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" style="stop-color:#4f46e5;"></stop>
                                    <stop offset="100%" style="stop-color:#a855f7;"></stop>
                                </linearGradient>
                            </defs>
                            <path stroke="url(#mobile-logo-gradient)" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2z"></path>
                        </svg>
                        <span class="gradient-text font-bold text-xl">TALK TIME</span>
                    </div>
                    <button id="mobile-menu-close" class="p-2 text-gray-600 hover:text-gray-900" aria-label="Close menu">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>

                <nav class="mobile-nav-items">
                    ${navItemsHTML}

                    ${!isAuthenticated ? `
                        <div class="border-t mt-4 pt-4">
                            <a href="/volunteer/login" class="block w-full px-4 py-3 text-center text-gray-700 hover:bg-gray-100 hover:text-orange-500 transition-colors">
                                Login
                            </a>
                            <a href="/volunteer/signup" class="block w-full px-4 py-3 mt-2 text-center bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors">
                                Sign Up
                            </a>
                        </div>
                    ` : `
                        <div class="border-t mt-4 pt-4">
                            <a href="/volunteer/profile.html" class="block px-4 py-3 text-gray-700 hover:bg-gray-100 hover:text-indigo-600 transition-colors">
                                <i class="fas fa-user mr-2"></i>My Profile
                            </a>
                            <a href="/volunteer/settings" class="block px-4 py-3 text-gray-700 hover:bg-gray-100 hover:text-indigo-600 transition-colors">
                                <i class="fas fa-cog mr-2"></i>Settings
                            </a>
                            <a href="/volunteer/dashboard.html" class="block px-4 py-3 text-gray-700 hover:bg-gray-100 hover:text-green-600 transition-colors">
                                <i class="fas fa-tachometer-alt mr-2"></i>Dashboard
                            </a>
                            <button id="mobile-logout-btn" class="block w-full text-left px-4 py-3 text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors">
                                <i class="fas fa-sign-out-alt mr-2"></i>Logout
                            </button>
                        </div>
                    `}
                </nav>
            `;

            document.body.appendChild(mobileMenu);
            this.mobileMenu = mobileMenu;
        }

        if (!this.mobileOverlay) {
            // Create overlay
            const overlay = document.createElement('div');
            overlay.id = 'mobile-menu-overlay';
            overlay.className = 'mobile-menu-overlay';
            overlay.setAttribute('aria-hidden', 'true');
            document.body.appendChild(overlay);
            this.mobileOverlay = overlay;
        }
    }

    setupEventListeners() {
        // Toggle button click
        if (this.mobileToggle) {
            this.mobileToggle.addEventListener('click', () => this.toggleMenu());
        }

        // Close button click
        const closeBtn = document.getElementById('mobile-menu-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.closeMenu());
        }

        // Overlay click
        if (this.mobileOverlay) {
            this.mobileOverlay.addEventListener('click', () => this.closeMenu());
        }

        // Logout button
        const logoutBtn = document.getElementById('mobile-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (window.logout) {
                    window.logout();
                }
                this.closeMenu();
            });
        }

        // Touch gestures for swipe to close
        this.setupTouchGestures();

        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.closeMenu();
            }
        });

        // Handle window resize
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (window.innerWidth >= 768 && this.isOpen) {
                    this.closeMenu();
                }
            }, 250);
        });
    }

    setupTouchGestures() {
        if (!this.mobileMenu) return;

        // Touch start
        this.mobileMenu.addEventListener('touchstart', (e) => {
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
        }, { passive: true });

        // Touch end - swipe left to close
        this.mobileMenu.addEventListener('touchend', (e) => {
            if (!this.touchStartX || !this.touchStartY) return;

            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;

            const deltaX = this.touchStartX - touchEndX;
            const deltaY = Math.abs(this.touchStartY - touchEndY);

            // Detect horizontal swipe (left)
            if (deltaX > 50 && deltaY < 100) {
                this.closeMenu();
            }

            // Reset
            this.touchStartX = null;
            this.touchStartY = null;
        }, { passive: true });
    }

    toggleMenu() {
        if (this.isOpen) {
            this.closeMenu();
        } else {
            this.openMenu();
        }
    }

    openMenu() {
        if (!this.mobileMenu || !this.mobileOverlay || !this.mobileToggle) return;

        this.isOpen = true;

        // Update menu state
        this.mobileMenu.classList.add('active');
        this.mobileOverlay.classList.add('active');
        this.mobileMenu.setAttribute('aria-hidden', 'false');
        this.mobileOverlay.setAttribute('aria-hidden', 'false');
        this.mobileToggle.setAttribute('aria-expanded', 'true');

        // Animate hamburger to X
        const topLine = this.mobileToggle.querySelector('.menu-icon-top');
        const middleLine = this.mobileToggle.querySelector('.menu-icon-middle');
        const bottomLine = this.mobileToggle.querySelector('.menu-icon-bottom');

        if (topLine) topLine.setAttribute('d', 'M6 6L18 18');
        if (middleLine) middleLine.style.opacity = '0';
        if (bottomLine) bottomLine.setAttribute('d', 'M6 18L18 6');

        // Prevent body scroll
        document.body.style.overflow = 'hidden';

        // Focus management
        this.mobileMenu.focus();
    }

    closeMenu() {
        if (!this.mobileMenu || !this.mobileOverlay || !this.mobileToggle) return;

        this.isOpen = false;

        // Update menu state
        this.mobileMenu.classList.remove('active');
        this.mobileOverlay.classList.remove('active');
        this.mobileMenu.setAttribute('aria-hidden', 'true');
        this.mobileOverlay.setAttribute('aria-hidden', 'true');
        this.mobileToggle.setAttribute('aria-expanded', 'false');

        // Animate X back to hamburger
        const topLine = this.mobileToggle.querySelector('.menu-icon-top');
        const middleLine = this.mobileToggle.querySelector('.menu-icon-middle');
        const bottomLine = this.mobileToggle.querySelector('.menu-icon-bottom');

        if (topLine) topLine.setAttribute('d', 'M4 6H20');
        if (middleLine) middleLine.style.opacity = '1';
        if (bottomLine) bottomLine.setAttribute('d', 'M4 18H20');

        // Restore body scroll
        document.body.style.overflow = '';

        // Return focus to toggle button
        this.mobileToggle.focus();
    }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.mobileNav = new MobileNavigation();
    });
} else {
    window.mobileNav = new MobileNavigation();
}