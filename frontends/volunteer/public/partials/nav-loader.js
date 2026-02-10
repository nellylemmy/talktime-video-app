/**
 * Navigation Loader for Volunteer Pages
 * Dynamically loads the appropriate navigation component based on authentication status
 */

class VolunteerNavLoader {
    constructor() {
        this.isAuthenticated = false;
        this.userInfo = null;
        this.modalUtilsLoaded = false;
    }

    /**
     * Ensure modal utilities and notification system are loaded
     */
    async ensureModalUtils() {
        if (window.showConfirmation && window.showNotification) {
            this.modalUtilsLoaded = true;
            // Also ensure notification sound system is loaded
            await this.ensureNotificationSoundSystem();
            return true;
        }

        try {
            // Dynamically load modal utilities if not available
            const script = document.createElement('script');
            script.src = '/js/modal-utils.js';
            script.async = true;
            
            return new Promise((resolve) => {
                script.onload = async () => {
                    this.modalUtilsLoaded = true;
                    // Load notification sound system after modal utils
                    await this.ensureNotificationSoundSystem();
                    resolve(true);
                };
                script.onerror = () => {
                    console.warn('Failed to load modal utilities, falling back to browser dialogs');
                    this.modalUtilsLoaded = false;
                    resolve(false);
                };
                document.head.appendChild(script);
            });
        } catch (error) {
            console.warn('Error loading modal utilities:', error);
            this.modalUtilsLoaded = false;
            return false;
        }
    }

    /**
     * Ensure notification sound system is loaded
     * Uses parallel loading for better performance
     */
    async ensureNotificationSoundSystem() {
        const requiredScripts = [
            { src: '/shared/js/notification-permission-modal.js', check: 'NotificationPermissionModal' },
            { src: '/shared/js/notification-sound-manager.js', check: 'TalkTimeNotificationSoundManager' },
            { src: '/shared/js/notification-enforcer.js', check: 'TalkTimeNotificationEnforcer' },
            { src: '/shared/js/realtime-notifications.js', check: 'RealtimeNotifications' },
            { src: '/shared/js/notification-sound-integration.js', check: 'TalkTimeNotificationSoundIntegration' }
        ];

        console.log('Loading notification sound system (parallel)...');

        // Filter scripts that need loading and load them in parallel
        const scriptsToLoad = requiredScripts.filter(s => !window[s.check]);

        if (scriptsToLoad.length > 0) {
            const loadPromises = scriptsToLoad.map(scriptInfo =>
                this.loadScript(scriptInfo.src)
                    .then(() => console.log(`Loaded ${scriptInfo.src}`))
                    .catch(err => console.warn(`Failed to load ${scriptInfo.src}:`, err))
            );

            await Promise.all(loadPromises);
        }

        if (window.TalkTimeNotificationSoundManager) {
            console.log('Notification sound system ready');
        }
    }

    /**
     * Load script dynamically
     */
    loadScript(src) {
        return new Promise((resolve, reject) => {
            // Check if script already exists (without cache-bust param)
            const baseSrc = src.split('?')[0];
            const existingScript = document.querySelector(`script[src^="${baseSrc}"]`);
            if (existingScript) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            // Add cache-busting timestamp
            script.src = `${src}${src.includes('?') ? '&' : '?'}t=${Date.now()}`;
            script.async = true;
            
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
            
            document.head.appendChild(script);
        });
    }

    /**
     * Check authentication status via JWT
     */
    async checkAuthentication() {
        try {
            // Initialize TalkTime Auth for volunteers if not already done
            if (!window.TalkTimeAuth) {
                window.TalkTimeAuth = new TalkTimeJWTAuth('volunteer');
            }
            
            // Check if volunteer JWT token exists and is valid
            if (!window.TalkTimeAuth.isAuthenticated()) {
                this.isAuthenticated = false;
                this.userInfo = null;
                return;
            }

            // Verify token with backend
            const response = await window.TalkTimeAuth.authenticatedRequest('/api/v1/jwt-auth/verify', {
                method: 'GET'
            });

            if (response.ok) {
                const data = await response.json();
                this.isAuthenticated = data.success;
                this.userInfo = data.user; // User info from JWT verification
                return true;
            } else {
                // 401 on login/signup pages is expected, don't log as error
                const isLoginPage = window.location.pathname.includes('/login') || 
                                  window.location.pathname.includes('/signup');
                
                if (!isLoginPage && response.status === 401) {
                    console.warn('User session expired or unauthorized access');
                } else if (!isLoginPage && response.status !== 401) {
                    console.error('Authentication check failed with status:', response.status);
                }
                
                this.isAuthenticated = false;
                this.userInfo = null;
                return false;
            }
        } catch (error) {
            // Only log network errors, not expected authentication failures
            const isLoginPage = window.location.pathname.includes('/login') || 
                              window.location.pathname.includes('/signup');
            
            if (!isLoginPage) {
                console.error('Authentication check failed:', error);
            }
            
            this.isAuthenticated = false;
            this.userInfo = null;
            return false;
        }
    }

    /**
     * Load the appropriate navigation component
     */
    async loadNavigation() {
        await this.checkAuthentication();

        // Confirm auth state for Anti-FOUC system
        if (this.isAuthenticated) {
            if (typeof window.confirmAuthenticated === 'function') {
                window.confirmAuthenticated('volunteer');
            }
        } else {
            if (typeof window.confirmUnauthenticated === 'function') {
                window.confirmUnauthenticated();
            }
        }

        const navContainer = document.getElementById('nav-container');
        if (!navContainer) {
            // Dashboard pages use dashboard-nav-container instead - this is expected
            const dashboardNavContainer = document.getElementById('dashboard-nav-container');
            if (dashboardNavContainer) {
                console.log('Dashboard page detected, nav-loader skipping (dashboard-nav.js handles navigation)');
            } else {
                console.warn('No nav container found (neither nav-container nor dashboard-nav-container)');
            }
            return;
        }

        // Show/hide appropriate navigation based on auth state
        const unauthNav = document.getElementById('home-unauthenticated-nav');
        if (this.isAuthenticated) {
            // Show authenticated nav container, hide unauthenticated
            navContainer.classList.remove('hidden');
            if (unauthNav) {
                unauthNav.style.display = 'none';
            }
        } else {
            // Keep authenticated nav hidden, show unauthenticated
            navContainer.classList.add('hidden');
            if (unauthNav) {
                unauthNav.style.display = '';
            }
        }

        try {
            let navPath;
            if (this.isAuthenticated) {
                navPath = '/shared/partials/nav-authenticated.html';
            } else {
                navPath = '/volunteer/partials/nav-unauthenticated.html';
            }

            const response = await fetch(navPath, {
                cache: 'no-store',
                headers: {
                    'Cache-Control': 'no-cache'
                }
            });
            if (response.ok) {
                const navHtml = await response.text();
                navContainer.innerHTML = navHtml;

                // Execute scripts and initialize after DOM is ready
                requestAnimationFrame(() => {
                    // Execute any scripts in the loaded navigation
                    this.executeScripts(navContainer);

                    // Initialize dropdown functionality if authenticated
                    if (this.isAuthenticated) {
                        this.initializeDropdown();
                    }

                    // Initialize scroll handler for nav transparency
                    this.initializeScrollHandler();

                    // Update user info if authenticated
                    if (this.isAuthenticated && this.userInfo) {
                        requestAnimationFrame(() => {
                            this.updateUserInfo();
                            this.loadNotificationCount();
                            this.setupRealtimeNotifications();
                        });
                    }
                });
            } else {
                console.error('Failed to load navigation:', response.statusText);
            }
        } catch (error) {
            console.error('Error loading navigation:', error);
        }
    }

    /**
     * Update user information in the navigation
     */
    updateUserInfo() {
        if (!this.userInfo) {
            console.log('No user info available for navigation update');
            return;
        }

        const greetingElement = document.getElementById('volunteer-greeting');
        const initialElement = document.getElementById('volunteer-initial');
        const navProfileImage = document.getElementById('nav-profile-image');

        console.log('Updating navigation with user info:', this.userInfo);

        // Update greeting text with prioritized field selection
        if (greetingElement) {
            // Prioritize username, then name, then other fields
            let displayName = this.userInfo.username || 
                             this.userInfo.name || 
                             this.userInfo.full_name || 
                             this.userInfo.fullName || 
                             this.userInfo.firstName || 
                             'Volunteer';
            
            // If using full name and it has spaces, use just the first name
            if (!this.userInfo.username && displayName.includes(' ')) {
                displayName = displayName.split(' ')[0]; // Use first name only
            } else if (displayName.includes('@')) {
                // If it's an email, use the part before @
                displayName = displayName.split('@')[0];
            }
            
            greetingElement.textContent = `Welcome, ${displayName}!`;
            // Removed: greetingElement.classList.remove('hidden'); // Let CSS handle visibility
            console.log('Updated greeting to:', `Welcome, ${displayName}!`);
        } else {
            console.log('Greeting element not found');
        }

        // Update profile image or initial with correct API path
        if ((this.userInfo.profile_image || this.userInfo.profileImage) && navProfileImage) {
            const profileImagePath = this.userInfo.profile_image || this.userInfo.profileImage;
            navProfileImage.src = `/api/v1/volunteer/profile/image/${profileImagePath}`;
            navProfileImage.classList.remove('hidden');
            if (initialElement) {
                initialElement.classList.add('hidden');
            }
            console.log('Updated profile image to:', profileImagePath);
        } else if (initialElement) {
            // Generate initials from first and last name
            const fullName = this.userInfo.full_name ||
                            this.userInfo.fullName ||
                            this.userInfo.name ||
                            this.userInfo.username ||
                            'V';

            // Split name and get initials
            const nameParts = fullName.trim().split(/\s+/);
            let initials = '';

            if (nameParts.length >= 2) {
                // First letter of first name + first letter of last name
                initials = (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase();
            } else {
                // Single name - just use first letter
                initials = nameParts[0].charAt(0).toUpperCase();
            }

            initialElement.textContent = initials;
            initialElement.classList.remove('hidden');
            if (navProfileImage) {
                navProfileImage.classList.add('hidden');
            }
            console.log('Updated initials to:', initials, 'from name:', fullName);
        }

        // Also update any other name displays in mobile menu or dropdowns
        // Mobile menu removed - all navigation now in profile dropdown
    }

    /**
     * Load notification count and update badge
     */
    async loadNotificationCount() {
        try {
            if (!window.TalkTimeAuth || !window.TalkTimeAuth.isAuthenticated()) {
                return;
            }

            // Check if the page already has its own notification loading
            if (window.loadNotificationCount || window.updateNotificationBadge) {
                console.log('Page already has notification loading, skipping nav-loader notification setup');
                return;
            }

            const response = await window.TalkTimeAuth.authenticatedRequest('/api/v1/notifications/unread-count');
            if (response.ok) {
                const data = await response.json();
                this.updateNotificationBadge(data.unread_count);
                console.log('Notification count loaded by nav-loader:', data.unread_count);
            } else {
                console.error('Failed to load notification count:', response.status);
            }
        } catch (error) {
            console.error('Error loading notification count:', error);
        }
    }

    /**
     * Update notification badge with count
     */
    updateNotificationBadge(count) {
        // Try to find the notification badge (volunteer pages use 'notification-badge')
        const badge = document.getElementById('notification-badge');
        // Also try to find student notification count (student pages use 'notificationCount') 
        const studentBadge = document.getElementById('notificationCount');
        
        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count.toString();
                badge.classList.remove('hidden');
                console.log('Notification badge updated to:', count);
            } else {
                badge.classList.add('hidden');
                console.log('Notification badge hidden (no unread notifications)');
            }
        }
        
        if (studentBadge) {
            if (count > 0) {
                studentBadge.textContent = count > 99 ? '99+' : count.toString();
                studentBadge.classList.remove('hidden');
                console.log('Student notification count updated to:', count);
            } else {
                studentBadge.classList.add('hidden');
                console.log('Student notification count hidden (no unread notifications)');
            }
        }
        
        if (!badge && !studentBadge) {
            console.log('No notification badge elements found');
        }
    }

    /**
     * Setup real-time notification updates
     */
    setupRealtimeNotifications() {
        // Only set up real-time updates if user is authenticated
        if (!this.isAuthenticated || !this.userInfo) {
            return;
        }

        try {
            // Initialize real-time notifications if available
            if (window.realtimeNotifications) {
                console.log('Setting up real-time notification updates for nav badge');
                
                // Listen for new notifications
                window.realtimeNotifications.on('new-notification', (data) => {
                    console.log('New notification received, refreshing badge count');
                    this.loadNotificationCount();
                });

                // Listen for notification read status changes
                window.realtimeNotifications.on('notification-read', (data) => {
                    console.log('Notification read status changed, refreshing badge count');
                    this.loadNotificationCount();
                });

                // Listen for badge updates
                window.realtimeNotifications.on('notification-badge-update', (data) => {
                    console.log('Badge update received:', data);
                    if (data.unread_count !== undefined) {
                        this.updateNotificationBadge(data.unread_count);
                    } else {
                        this.loadNotificationCount();
                    }
                });
            } else {
                console.log('Real-time notifications not available, badge will update on page refresh');
            }
        } catch (error) {
            console.error('Error setting up real-time notifications:', error);
        }
    }

    /**
     * Initialize dropdown functionality for authenticated navigation
     */
    initializeDropdown() {
        console.log('Initializing navigation dropdown...');
        
        const profileBtn = document.getElementById('profile-btn');
        const profileDropdown = document.getElementById('profile-dropdown');
        const logoutLink = document.getElementById('logout-link');

        console.log('Elements found:', {
            profileBtn: !!profileBtn,
            profileDropdown: !!profileDropdown,
            logoutLink: !!logoutLink
        });

        // Profile dropdown toggle - use inline style for reliable visibility
        if (profileBtn && profileDropdown) {
            // Prevent duplicate listeners
            if (!profileBtn.hasAttribute('data-dropdown-initialized')) {
                profileBtn.setAttribute('data-dropdown-initialized', 'true');

                profileBtn.addEventListener('click', (e) => {
                    console.log('Profile button clicked');
                    e.preventDefault();
                    e.stopPropagation();

                    const isHidden = profileDropdown.style.display === 'none' || profileDropdown.style.display === '';
                    console.log('Dropdown is currently hidden:', isHidden);

                    if (isHidden) {
                        // Show dropdown
                        profileDropdown.style.display = 'block';
                        console.log('Showing dropdown');
                    } else {
                        // Hide dropdown
                        profileDropdown.style.display = 'none';
                        console.log('Hiding dropdown');
                    }
                });

                // Close dropdown when clicking outside
                document.addEventListener('click', (e) => {
                    if (profileDropdown && profileDropdown.style.display === 'block' &&
                        !profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
                        console.log('Clicking outside, closing dropdown');
                        profileDropdown.style.display = 'none';
                    }
                });

                console.log('Profile dropdown event listeners attached successfully');
            } else {
                console.log('Profile dropdown already initialized, skipping');
            }
        } else {
            console.error('Profile button or dropdown not found!');
        }

        // Handle logout
        if (logoutLink) {
            logoutLink.addEventListener('click', async (e) => {
                e.preventDefault();
                console.log('Logout clicked');
                
                // Ensure modal utilities are available
                await this.ensureModalUtils();
                
                let confirmed = false;
                
                // Try to use professional modal, fallback to browser confirm
                if (this.modalUtilsLoaded && window.showConfirmation) {
                    confirmed = await window.showConfirmation(
                        'You will be logged out of your TalkTime account and redirected to the home page.',
                        {
                            title: 'Confirm Logout',
                            confirmText: 'Logout',
                            cancelText: 'Stay Logged In',
                            type: 'warning'
                        }
                    );
                } else {
                    // Fallback to browser confirm
                    confirmed = confirm('Are you sure you want to logout?');
                }
                
                if (confirmed) {
                    // Clear JWT tokens for immediate logout
                    window.TalkTimeAuth?.logout();
                    // Token cleanup handled by JWT auth;
                    // User cleanup handled by JWT auth;
                    
                    // Perform logout via JWT API
                    if (window.TalkTimeAuth && window.TalkTimeAuth.isAuthenticated()) {
                        window.TalkTimeAuth.logout('/api/v1/jwt-auth/logout')
                        .catch(error => {
                            console.error('Volunteer logout API error:', error);
                        });
                    }
                    
                    // Show logout success message
                    if (this.modalUtilsLoaded && window.showNotification) {
                        window.showNotification(
                            'You have been successfully logged out. Redirecting to home page...',
                            'success',
                            {
                                title: 'Logged Out',
                                duration: 2000
                            }
                        );
                        
                        // Redirect after a short delay
                        setTimeout(() => {
                            window.location.href = '/volunteer/';
                        }, 1500);
                    } else {
                        // Immediate redirect if no modal utilities
                        window.location.href = '/volunteer/';
                    }
                }
            });
        }

        // Highlight current page in navigation
        const currentPath = window.location.pathname;
        const navLinks = document.querySelectorAll('nav a[href]');
        
        navLinks.forEach(link => {
            if (link.getAttribute('href') === currentPath) {
                link.classList.add('text-indigo-600', 'font-bold');
                link.classList.remove('text-gray-700');
            }
        });
        
        console.log('Navigation initialization complete');
    }

    /**
     * Initialize scroll handler for nav transparency
     * Nav should be transparent at top, gain background when scrolled
     */
    initializeScrollHandler() {
        const header = document.getElementById('main-header');
        console.log('[Nav-Loader] initializeScrollHandler called, header found:', !!header);

        if (!header) {
            console.warn('[Nav-Loader] No main-header found for scroll handler');
            return;
        }

        // Prevent duplicate scroll handlers
        if (header.hasAttribute('data-scroll-initialized')) {
            console.log('[Nav-Loader] Scroll handler already initialized, skipping');
            return;
        }
        header.setAttribute('data-scroll-initialized', 'true');

        const handleScroll = () => {
            const scrolled = window.scrollY > 50;
            if (scrolled) {
                header.classList.add('scrolled');
            } else {
                header.classList.remove('scrolled');
            }
        };

        // Run once on init to set initial state
        handleScroll();
        console.log('[Nav-Loader] Initial scroll state set, scrollY:', window.scrollY);

        // Listen for scroll events
        window.addEventListener('scroll', handleScroll, { passive: true });
        console.log('[Nav-Loader] Scroll handler initialized for nav transparency');
    }

    /**
     * Execute scripts from loaded navigation components
     */
    executeScripts(container) {
        const scripts = container.querySelectorAll('script');
        scripts.forEach(script => {
            try {
                console.log('Executing navigation script...');
                // Create a new script element and append it to the document
                const newScript = document.createElement('script');
                newScript.textContent = script.textContent;
                newScript.type = 'text/javascript';
                
                // Append to head instead of body for better execution context
                document.head.appendChild(newScript);
                
                console.log('Navigation script executed successfully');
            } catch (error) {
                console.error('Error executing navigation script:', error);
            }
        });
    }

    /**
     * Redirect to login if not authenticated (for protected pages)
     */
    requireAuthentication() {
        if (!this.isAuthenticated) {
            // Store current URL for redirect after login
            sessionStorage.setItem('redirectUrl', window.location.href);
            window.location.href = '/volunteer/login';
            return false;
        }
        return true;
    }

    /**
     * Initialize navigation loader
     * @param {boolean} requireAuth - If true, redirect to login if not authenticated
     * @param {Object} options - Additional options
     * @param {boolean} options.skipUnauthenticated - If true, don't load nav when user is not authenticated (allows page to show its own unauthenticated nav)
     * @param {Function} options.onAuthenticated - Callback when user is authenticated, receives userInfo
     * @returns {boolean|Object} - Returns true/false for backward compatibility, or {authenticated, loader} when options are provided
     */
    static async init(requireAuth = false, options = {}) {
        const loader = new VolunteerNavLoader();
        const hasOptions = Object.keys(options).length > 0;

        // Check auth first if skipUnauthenticated is true
        if (options.skipUnauthenticated) {
            await loader.checkAuthentication();

            if (!loader.isAuthenticated) {
                // User is not authenticated, skip loading nav
                // Page will show its own unauthenticated navigation
                console.log('Nav-loader: User not authenticated, skipping nav load (skipUnauthenticated=true)');
                return { authenticated: false, loader };
            }
        }

        await loader.loadNavigation();

        // Call onAuthenticated callback if provided and user is authenticated
        // Note: Call callback even if userInfo is null - let the callback handle that case
        if (options.onAuthenticated && loader.isAuthenticated) {
            console.log('Nav-loader: Calling onAuthenticated callback, userInfo:', loader.userInfo);
            options.onAuthenticated(loader.userInfo);
        }

        if (requireAuth) {
            return loader.requireAuthentication();
        }

        // Return object with details when options are provided, otherwise maintain backward compatibility
        if (hasOptions) {
            return { authenticated: loader.isAuthenticated, loader };
        }

        return true; // Backward compatible return value
    }
}

// Export for use in other scripts
window.VolunteerNavLoader = VolunteerNavLoader;
