/**
 * TalkTime Universal Navigation Component
 * A self-contained web component with embedded HTML, CSS, and JS
 * Matches production nav from talktime.adeafoundation.org with mobile drawer enhancement
 */

class TalkTimeNav extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.isAuthenticated = false;
        this.userInfo = null;
        this.isOpen = false;
        this.notificationCount = 0;
    }

    connectedCallback() {
        this.render();
        this.checkAuthentication().then(() => {
            this.updateAuthUI();
            this.setupEventListeners();
        });
    }

    async checkAuthentication() {
        try {
            // Check for JWT token
            const token = localStorage.getItem('volunteer_jwt_token');
            if (!token) {
                this.isAuthenticated = false;
                return;
            }

            // Verify with backend
            const response = await fetch('/api/v1/jwt-auth/verify', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.isAuthenticated = data.success;
                this.userInfo = data.user;
            } else {
                this.isAuthenticated = false;
                localStorage.removeItem('volunteer_jwt_token');
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            this.isAuthenticated = false;
        }
    }

    render() {
        this.shadowRoot.innerHTML = `
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                :host {
                    display: block;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                    position: sticky;
                    top: 0;
                    z-index: 50;
                    width: 100%;
                }

                /* Main Header matching production */
                .nav-container {
                    background: rgba(255, 255, 255, 0.4);
                    backdrop-filter: blur(16px);
                    -webkit-backdrop-filter: blur(16px);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
                    padding: 1rem;
                }

                @media (min-width: 768px) {
                    .nav-container {
                        padding: 1.5rem;
                    }
                }

                .nav-wrapper {
                    max-width: 1280px;
                    margin: 0 auto;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }

                /* Logo Section */
                .nav-brand {
                    display: flex;
                    flex-direction: column;
                }

                .logo-link {
                    display: flex;
                    align-items: center;
                    text-decoration: none;
                    gap: 0.5rem;
                    font-size: 1.5rem;
                    font-weight: bold;
                    white-space: nowrap;
                }

                @media (max-width: 767px) {
                    .logo-link {
                        font-size: 1.25rem;
                    }

                    .logo-link svg {
                        width: 24px;
                        height: 24px;
                    }
                }

                .logo-text {
                    background: linear-gradient(135deg, #4f46e5 0%, #a855f7 100%);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }

                .powered-by {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    margin-top: 0.125rem;
                    font-size: 0.875rem;
                    line-height: 1;
                }

                @media (max-width: 767px) {
                    .powered-by {
                        font-size: 0.75rem;
                        gap: 0.25rem;
                    }

                    .powered-by img {
                        width: 16px !important;
                        height: 16px !important;
                    }
                }

                .powered-by img {
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    object-fit: cover;
                    border: 1px solid rgba(0, 0, 0, 0.1);
                    flex-shrink: 0;
                }

                .powered-by a {
                    color: #6b7280;
                    text-decoration: none;
                    transition: color 0.2s;
                    white-space: nowrap;
                }

                .powered-by a:hover {
                    color: #4f46e5;
                }

                /* Desktop Navigation */
                .desktop-nav {
                    display: none;
                    align-items: center;
                    gap: 1.5rem;
                }

                .nav-links {
                    display: flex;
                    gap: 1.5rem;
                    list-style: none;
                }

                .nav-link {
                    padding: 0.5rem 1rem;
                    color: #374151;
                    text-decoration: none;
                    border-radius: 0.5rem;
                    transition: all 0.2s;
                    font-weight: 500;
                }

                .nav-link:hover {
                    color: #4f46e5;
                }

                .nav-link i {
                    margin-right: 0.5rem;
                }

                /* User Section for Desktop */
                .user-section {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    flex-wrap: nowrap;
                }

                .notification-bell {
                    position: relative;
                    padding: 0.5rem;
                    color: #6b7280;
                    background: transparent;
                    border: none;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .notification-bell:hover {
                    background: rgba(0, 0, 0, 0.05);
                    color: #4f46e5;
                }

                .notification-badge {
                    position: absolute;
                    top: -0.25rem;
                    right: -0.25rem;
                    background: #ef4444;
                    color: white;
                    font-size: 0.75rem;
                    font-weight: bold;
                    padding: 0.125rem 0.375rem;
                    border-radius: 9999px;
                    min-width: 20px;
                    height: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3);
                }

                .notification-badge.hidden {
                    display: none;
                }

                .profile-button {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0;
                    background: transparent;
                    border: none;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    transition: all 0.2s;
                    position: relative;
                }

                .profile-button:focus {
                    outline: none;
                }

                .user-greeting {
                    font-weight: 600;
                    color: #1f2937;
                    display: none;
                }

                @media (min-width: 768px) {
                    .user-greeting {
                        display: inline;
                    }
                }

                .user-avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    background: #e0e7ff;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    color: #4f46e5;
                    overflow: hidden;
                    border: 2px solid #e5e7eb;
                }

                .user-avatar img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                }

                .dropdown-arrow {
                    display: none;
                    width: 16px;
                    height: 16px;
                    color: #6b7280;
                }

                @media (min-width: 640px) {
                    .dropdown-arrow {
                        display: block;
                    }
                }

                /* Dropdown Menu */
                .dropdown {
                    position: absolute;
                    top: calc(100% + 0.5rem);
                    right: 0;
                    background: white;
                    border-radius: 0.75rem;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
                    opacity: 0;
                    visibility: hidden;
                    transform: translateY(-10px);
                    transition: all 0.2s ease-in-out;
                    min-width: 200px;
                    z-index: 9999;
                    padding: 0.5rem;
                }

                .dropdown.active {
                    opacity: 1;
                    visibility: visible;
                    transform: translateY(0);
                }

                .dropdown-item {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.5rem 1rem;
                    color: #4b5563;
                    text-decoration: none;
                    transition: all 0.15s;
                    border: none;
                    background: none;
                    width: 100%;
                    text-align: left;
                    cursor: pointer;
                    font-size: 0.875rem;
                    border-radius: 0.5rem;
                    margin: 0.125rem 0;
                }

                .dropdown-item:hover {
                    background: #f3f4f6;
                    color: #4f46e5;
                }

                .dropdown-item i {
                    width: 16px;
                    text-align: center;
                }

                .dropdown-divider {
                    height: 1px;
                    background: #e5e7eb;
                    margin: 0.5rem 0;
                }

                .dropdown-item.danger {
                    color: #4b5563;
                }

                .dropdown-item.danger:hover {
                    background: #fef2f2;
                    color: #ef4444;
                }

                /* Auth Buttons */
                .auth-buttons {
                    display: flex;
                    gap: 0.75rem;
                    align-items: center;
                }

                .btn {
                    padding: 0.5rem 1rem;
                    border-radius: 0.5rem;
                    text-decoration: none;
                    font-weight: 500;
                    transition: all 0.2s;
                    border: none;
                    cursor: pointer;
                    white-space: nowrap;
                }

                .btn-login {
                    color: #f97316;
                    background: transparent;
                }

                .btn-login:hover {
                    color: #ea580c;
                }

                .btn-signup {
                    color: white;
                    background: #f97316;
                    padding: 0.5rem 1.5rem;
                }

                .btn-signup:hover {
                    background: #ea580c;
                    box-shadow: 0 4px 12px rgba(249, 115, 22, 0.25);
                }

                /* Mobile Controls Container */
                .mobile-controls {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                @media (min-width: 768px) {
                    .mobile-controls {
                        display: none;
                    }
                }

                /* Mobile Notification Bell */
                .mobile-notification {
                    position: relative;
                    padding: 0.5rem;
                    color: #6b7280;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                /* Mobile Menu Toggle */
                .mobile-toggle {
                    display: flex;
                    flex-direction: column;
                    justify-content: space-around;
                    width: 24px;
                    height: 24px;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    padding: 0;
                }

                .mobile-toggle span {
                    display: block;
                    height: 2px;
                    width: 100%;
                    background: #374151;
                    transition: all 0.3s;
                }

                .mobile-toggle.active span:nth-child(1) {
                    transform: rotate(45deg) translate(5px, 5px);
                }

                .mobile-toggle.active span:nth-child(2) {
                    opacity: 0;
                }

                .mobile-toggle.active span:nth-child(3) {
                    transform: rotate(-45deg) translate(7px, -6px);
                }

                /* Mobile Menu Drawer */
                .mobile-menu {
                    position: fixed;
                    top: 0;
                    left: -100%;
                    width: min(85%, 320px);
                    height: 100vh;
                    background: white;
                    box-shadow: 2px 0 20px rgba(0, 0, 0, 0.1);
                    transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    z-index: 1002;
                    overflow-y: auto;
                    display: flex;
                    flex-direction: column;
                }

                .mobile-menu.active {
                    left: 0;
                }

                .mobile-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(4px);
                    opacity: 0;
                    visibility: hidden;
                    transition: all 0.3s;
                    z-index: 1001;
                }

                .mobile-overlay.active {
                    opacity: 1;
                    visibility: visible;
                }

                .mobile-header {
                    padding: 1.5rem 1rem;
                    border-bottom: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: linear-gradient(135deg, #f3f4ff 0%, #f9f9ff 100%);
                }

                .mobile-brand {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                }

                .mobile-close {
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: transparent;
                    border: none;
                    cursor: pointer;
                    color: #6b7280;
                    border-radius: 0.5rem;
                    transition: all 0.2s;
                }

                .mobile-close:hover {
                    background: #f3f4f6;
                    color: #1f2937;
                }

                /* Mobile User Section */
                .mobile-user-section {
                    padding: 1rem;
                    background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
                    margin: 1rem;
                    border-radius: 0.75rem;
                }

                .mobile-user-profile {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }

                .mobile-user-avatar {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    background: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    font-size: 1.25rem;
                    color: #6366f1;
                }

                .mobile-user-info {
                    flex: 1;
                }

                .mobile-user-name {
                    font-weight: 600;
                    color: white;
                    font-size: 1rem;
                }

                .mobile-user-stats {
                    font-size: 0.875rem;
                    color: rgba(255, 255, 255, 0.9);
                    margin-top: 0.125rem;
                }

                .mobile-nav-items {
                    flex: 1;
                    padding: 1rem;
                }

                .mobile-nav-item {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    padding: 0.875rem 1rem;
                    color: #374151;
                    text-decoration: none;
                    border-radius: 0.5rem;
                    transition: all 0.2s;
                    margin-bottom: 0.25rem;
                    border: none;
                    background: none;
                    width: 100%;
                    text-align: left;
                    cursor: pointer;
                    font-size: 1rem;
                }

                .mobile-nav-item:hover {
                    background: #f3f4f6;
                    color: #4f46e5;
                    transform: translateX(4px);
                }

                .mobile-nav-item i {
                    width: 20px;
                    text-align: center;
                }

                .mobile-divider {
                    height: 1px;
                    background: #e5e7eb;
                    margin: 1rem 0;
                }

                .mobile-auth-section {
                    padding: 1rem;
                    border-top: 1px solid #e5e7eb;
                    margin-top: auto;
                }

                .mobile-auth-buttons {
                    display: flex;
                    flex-direction: column;
                    gap: 0.75rem;
                }

                .mobile-btn {
                    display: block;
                    padding: 0.875rem 1rem;
                    text-align: center;
                    border-radius: 0.5rem;
                    text-decoration: none;
                    font-weight: 500;
                    transition: all 0.2s;
                }

                .mobile-btn-login {
                    background: white;
                    color: #4f46e5;
                    border: 2px solid #4f46e5;
                }

                .mobile-btn-signup {
                    background: #f97316;
                    color: white;
                }

                /* Responsive Design */
                @media (min-width: 768px) {
                    .desktop-nav {
                        display: flex;
                    }

                    .mobile-toggle {
                        display: none;
                    }
                }

                /* Desktop only elements */
                .desktop-only {
                    display: none;
                }

                @media (min-width: 768px) {
                    .desktop-only {
                        display: flex;
                    }
                }

                /* Hide elements based on auth state */
                .auth-only,
                .guest-only {
                    display: none !important;
                }

                .auth-only.show,
                .guest-only.show {
                    display: flex !important;
                }

                .auth-only.show-block,
                .guest-only.show-block {
                    display: block !important;
                }

                /* Special case for desktop-only guest buttons */
                .guest-only.desktop-only.show {
                    display: none !important;
                }

                @media (min-width: 768px) {
                    .guest-only.desktop-only.show {
                        display: flex !important;
                    }
                }
            </style>

            <nav class="nav-container">
                <div class="nav-wrapper">
                    <!-- Logo Section -->
                    <div class="nav-brand">
                        <a href="/" class="logo-link">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                                <defs>
                                    <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                                        <stop offset="0%" style="stop-color:#4f46e5;"></stop>
                                        <stop offset="100%" style="stop-color:#a855f7;"></stop>
                                    </linearGradient>
                                </defs>
                                <path stroke="url(#logo-grad)" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2z"></path>
                            </svg>
                            <span class="logo-text">TALK TIME</span>
                        </a>
                        <div class="powered-by">
                            <img src="https://adeafoundation.org/wp-content/uploads/2018/02/ADEA_Logo_rev.jpg" alt="ADEA">
                            <a href="https://adeafoundation.org" target="_blank" rel="noopener">Powered by ADEA Foundation</a>
                        </div>
                    </div>

                    <!-- Desktop Navigation -->
                    <div class="desktop-nav">
                        <ul class="nav-links">
                            <li>
                                <a href="/" class="nav-link">
                                    <i class="fas fa-home"></i>Home
                                </a>
                            </li>
                            <li>
                                <a href="/volunteer/who-we-are.html" class="nav-link">
                                    <i class="fas fa-heart"></i>Who We Are
                                </a>
                            </li>
                            <li class="auth-only">
                                <a href="/volunteer/dashboard/students.html" class="nav-link">
                                    <i class="fas fa-tachometer-alt"></i>Dashboard
                                </a>
                            </li>
                        </ul>
                    </div>

                    <!-- User Section (Desktop Only) -->
                    <div class="user-section">
                        <!-- Authenticated User -->
                        <div class="auth-only">
                            <!-- Notification Bell -->
                            <button class="notification-bell">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M18 8C18 6.4087 17.3679 4.88258 16.2426 3.75736C15.1174 2.63214 13.5913 2 12 2C10.4087 2 8.88258 2.63214 7.75736 3.75736C6.63214 4.88258 6 6.4087 6 8C6 15 3 17 3 17H21C21 17 18 15 18 8Z"></path>
                                    <path d="M13.73 21C13.5542 21.3031 13.3019 21.5547 12.9982 21.7295C12.6946 21.9044 12.3504 21.9965 12 21.9965C11.6496 21.9965 11.3054 21.9044 11.0018 21.7295C10.6982 21.5547 10.4458 21.3031 10.27 21"></path>
                                </svg>
                                <span class="notification-badge hidden">0</span>
                            </button>

                            <!-- Profile Dropdown -->
                            <button class="profile-button">
                                <span class="user-greeting">Welcome</span>
                                <div class="user-avatar">
                                    <span class="avatar-text">V</span>
                                </div>
                                <svg class="dropdown-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                                </svg>
                            </button>

                            <div class="dropdown">
                                <a href="/" class="dropdown-item">
                                    <i class="fas fa-home"></i>Home
                                </a>
                                <a href="/volunteer/who-we-are.html" class="dropdown-item">
                                    <i class="fas fa-heart"></i>Who We Are
                                </a>
                                <a href="/volunteer/dashboard/students.html" class="dropdown-item">
                                    <i class="fas fa-tachometer-alt"></i>Dashboard
                                </a>
                                <a href="/volunteer/notifications.html" class="dropdown-item">
                                    <i class="fas fa-bell"></i>Notifications
                                </a>
                                <a href="/volunteer/profile.html" class="dropdown-item">
                                    <i class="fas fa-user"></i>My Profile
                                </a>
                                <a href="/volunteer/settings.html" class="dropdown-item">
                                    <i class="fas fa-cog"></i>Settings
                                </a>
                                <div class="dropdown-divider"></div>
                                <button class="dropdown-item danger logout-btn">
                                    <i class="fas fa-sign-out-alt"></i>Logout
                                </button>
                            </div>
                        </div>

                        <!-- Guest User - Desktop Only (Login/Signup) -->
                        <div class="guest-only auth-buttons desktop-only">
                            <a href="/volunteer/login.html" class="btn btn-login">Login</a>
                            <a href="/volunteer/signup.html" class="btn btn-signup">Sign Up</a>
                        </div>
                    </div>

                    <!-- Mobile Controls -->
                    <div class="mobile-controls">
                        <!-- Mobile Notification Bell (shows ONLY when authenticated) -->
                        <button class="mobile-notification auth-only">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 8C18 6.4087 17.3679 4.88258 16.2426 3.75736C15.1174 2.63214 13.5913 2 12 2C10.4087 2 8.88258 2.63214 7.75736 3.75736C6.63214 4.88258 6 6.4087 6 8C6 15 3 17 3 17H21C21 17 18 15 18 8Z"></path>
                                <path d="M13.73 21C13.5542 21.3031 13.3019 21.5547 12.9982 21.7295C12.6946 21.9044 12.3504 21.9965 12 21.9965C11.6496 21.9965 11.3054 21.9044 11.0018 21.7295C10.6982 21.5547 10.4458 21.3031 10.27 21"></path>
                            </svg>
                            <span class="notification-badge hidden">0</span>
                        </button>

                        <!-- Hamburger Menu (always visible on mobile) -->
                        <button class="mobile-toggle">
                            <span></span>
                            <span></span>
                            <span></span>
                        </button>
                    </div>
                </div>
            </nav>

            <!-- Mobile Menu Drawer -->
            <div class="mobile-overlay"></div>
            <div class="mobile-menu">
                <div class="mobile-header">
                    <div class="mobile-brand">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                            <defs>
                                <linearGradient id="mobile-logo-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" style="stop-color:#4f46e5;"></stop>
                                    <stop offset="100%" style="stop-color:#a855f7;"></stop>
                                </linearGradient>
                            </defs>
                            <path stroke="url(#mobile-logo-grad)" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2z"></path>
                        </svg>
                        <span class="logo-text">TALK TIME</span>
                    </div>
                    <button class="mobile-close">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 6L6 18M6 6l12 12"></path>
                        </svg>
                    </button>
                </div>

                <!-- User Profile Section (when authenticated) -->
                <div class="mobile-user-section auth-only">
                    <div class="mobile-user-profile">
                        <div class="mobile-user-avatar">
                            <span>V</span>
                        </div>
                        <div class="mobile-user-info">
                            <div class="mobile-user-name">Volunteer</div>
                            <div class="mobile-user-stats">0 hours volunteered</div>
                        </div>
                    </div>
                </div>

                <div class="mobile-nav-items">
                    <a href="/" class="mobile-nav-item">
                        <i class="fas fa-home"></i>Home
                    </a>
                    <a href="/volunteer/who-we-are.html" class="mobile-nav-item">
                        <i class="fas fa-heart"></i>Who We Are
                    </a>
                    <div class="auth-only">
                        <a href="/volunteer/dashboard/students.html" class="mobile-nav-item">
                            <i class="fas fa-tachometer-alt"></i>Dashboard
                        </a>
                        <a href="/volunteer/notifications.html" class="mobile-nav-item">
                            <i class="fas fa-bell"></i>Notifications
                        </a>
                        <a href="/volunteer/profile.html" class="mobile-nav-item">
                            <i class="fas fa-user"></i>My Profile
                        </a>
                        <a href="/volunteer/settings.html" class="mobile-nav-item">
                            <i class="fas fa-cog"></i>Settings
                        </a>
                        <div class="mobile-divider"></div>
                        <button class="mobile-nav-item logout-btn" style="color: #ef4444;">
                            <i class="fas fa-sign-out-alt"></i>Logout
                        </button>
                    </div>
                </div>

                <!-- Auth Section for guests -->
                <div class="mobile-auth-section guest-only">
                    <div class="mobile-auth-buttons">
                        <a href="/volunteer/login.html" class="mobile-btn mobile-btn-login">Login</a>
                        <a href="/volunteer/signup.html" class="mobile-btn mobile-btn-signup">Sign Up</a>
                    </div>
                </div>
            </div>
        `;
    }

    updateAuthUI() {
        const authElements = this.shadowRoot.querySelectorAll('.auth-only');
        const guestElements = this.shadowRoot.querySelectorAll('.guest-only');

        if (this.isAuthenticated) {
            authElements.forEach(el => {
                el.classList.add('show');
                if (el.classList.contains('mobile-user-section') ||
                    el.classList.contains('mobile-auth-section')) {
                    el.classList.add('show-block');
                }
            });
            guestElements.forEach(el => {
                el.classList.remove('show');
                el.classList.remove('show-block');
            });

            // Update user info
            if (this.userInfo) {
                const displayName = this.userInfo.name || this.userInfo.username || 'Volunteer';
                const firstName = displayName.split(' ')[0];

                // Desktop elements
                const userGreeting = this.shadowRoot.querySelector('.user-greeting');
                const avatarText = this.shadowRoot.querySelector('.avatar-text');

                // Mobile elements
                const mobileUserName = this.shadowRoot.querySelector('.mobile-user-name');
                const mobileUserAvatar = this.shadowRoot.querySelector('.mobile-user-avatar span');

                if (userGreeting) userGreeting.textContent = `Welcome, ${firstName}!`;
                if (avatarText) avatarText.textContent = displayName.charAt(0).toUpperCase();
                if (mobileUserName) mobileUserName.textContent = displayName;
                if (mobileUserAvatar) mobileUserAvatar.textContent = displayName.charAt(0).toUpperCase();

                // Load notification count
                this.loadNotificationCount();
            }
        } else {
            authElements.forEach(el => {
                el.classList.remove('show');
                el.classList.remove('show-block');
            });
            guestElements.forEach(el => {
                el.classList.add('show');
                if (el.classList.contains('mobile-auth-section')) {
                    el.classList.add('show-block');
                }
            });
        }
    }

    async loadNotificationCount() {
        try {
            const token = localStorage.getItem('volunteer_jwt_token');
            const response = await fetch('/api/v1/notifications/unread-count', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                const badges = this.shadowRoot.querySelectorAll('.notification-badge');

                if (data.unread_count > 0) {
                    badges.forEach(badge => {
                        badge.textContent = data.unread_count > 99 ? '99+' : data.unread_count;
                        badge.classList.remove('hidden');
                    });
                } else {
                    badges.forEach(badge => {
                        badge.classList.add('hidden');
                    });
                }
            }
        } catch (error) {
            console.error('Failed to load notification count:', error);
        }
    }

    setupEventListeners() {
        const root = this.shadowRoot;

        // Mobile menu toggle
        const mobileToggle = root.querySelector('.mobile-toggle');
        const mobileMenu = root.querySelector('.mobile-menu');
        const mobileOverlay = root.querySelector('.mobile-overlay');
        const mobileClose = root.querySelector('.mobile-close');

        mobileToggle?.addEventListener('click', () => {
            this.isOpen = !this.isOpen;
            mobileToggle.classList.toggle('active');
            mobileMenu.classList.toggle('active');
            mobileOverlay.classList.toggle('active');
            document.body.style.overflow = this.isOpen ? 'hidden' : '';
        });

        [mobileClose, mobileOverlay].forEach(el => {
            el?.addEventListener('click', () => {
                this.isOpen = false;
                mobileToggle.classList.remove('active');
                mobileMenu.classList.remove('active');
                mobileOverlay.classList.remove('active');
                document.body.style.overflow = '';
            });
        });

        // Profile dropdown
        const profileButton = root.querySelector('.profile-button');
        const dropdown = root.querySelector('.dropdown');

        profileButton?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('active');
        });

        // Close dropdown on outside click
        document.addEventListener('click', () => {
            dropdown?.classList.remove('active');
        });

        // Prevent dropdown from closing when clicking inside it
        dropdown?.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Logout functionality
        root.querySelectorAll('.logout-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const confirmed = window.showConfirmation
                    ? await window.showConfirmation('Are you sure you want to logout?', { title: 'Confirm Logout', confirmText: 'Logout', cancelText: 'Cancel', type: 'warning' })
                    : confirm('Are you sure you want to logout?');

                if (confirmed) {
                    const token = localStorage.getItem('volunteer_jwt_token');

                    try {
                        await fetch('/api/v1/jwt-auth/logout', {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });
                    } catch (error) {
                        console.error('Logout error:', error);
                    }

                    localStorage.removeItem('volunteer_jwt_token');
                    localStorage.removeItem('volunteer_user');
                    window.location.href = '/volunteer/';
                }
            });
        });

        // Notification bell clicks
        const notificationBells = root.querySelectorAll('.notification-bell, .mobile-notification');
        notificationBells.forEach(bell => {
            bell.addEventListener('click', () => {
                window.location.href = '/volunteer/notifications.html';
            });
        });
    }
}

// Register the component
customElements.define('talktime-nav', TalkTimeNav);