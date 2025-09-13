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
     */
    async ensureNotificationSoundSystem() {
        const requiredScripts = [
            { src: '/shared/js/notification-permission-modal.js', check: 'NotificationPermissionModal' },
            { src: '/shared/js/notification-sound-manager.js', check: 'TalkTimeNotificationSoundManager' },
            { src: '/shared/js/notification-enforcer.js', check: 'TalkTimeNotificationEnforcer' },
            { src: '/shared/js/realtime-notifications.js', check: 'RealtimeNotifications' },
            { src: '/shared/js/notification-sound-integration.js', check: 'TalkTimeNotificationSoundIntegration' }
        ];

        console.log('🔊 Loading notification sound system...');

        for (const scriptInfo of requiredScripts) {
            if (!window[scriptInfo.check]) {
                try {
                    await this.loadScript(scriptInfo.src);
                    console.log(`✅ Loaded ${scriptInfo.src}`);
                } catch (error) {
                    console.warn(`⚠️ Failed to load ${scriptInfo.src}:`, error);
                }
            } else {
                console.log(`✅ ${scriptInfo.src} already loaded`);
            }
        }

        // Wait for sound system to initialize
        if (window.TalkTimeNotificationSoundManager) {
            console.log('🔊 Notification sound system ready');
        }
    }

    /**
     * Load script dynamically
     */
    loadScript(src) {
        return new Promise((resolve, reject) => {
            // Check if script already exists
            const existingScript = document.querySelector(`script[src="${src}"]`);
            if (existingScript) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = src;
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
        
        const navContainer = document.getElementById('nav-container');
        if (!navContainer) {
            console.error('Nav container not found');
            return;
        }

        try {
            let navPath;
            if (this.isAuthenticated) {
                navPath = '/volunteer/partials/nav-authenticated.html';
            } else {
                navPath = '/volunteer/partials/nav-unauthenticated.html';
            }

            const response = await fetch(navPath);
            if (response.ok) {
                const navHtml = await response.text();
                navContainer.innerHTML = navHtml;
                
                // Add a small delay to ensure DOM elements are fully inserted
                setTimeout(() => {
                    // Execute any scripts in the loaded navigation
                    this.executeScripts(navContainer);
                    
                    // Initialize dropdown functionality if authenticated
                    if (this.isAuthenticated) {
                        this.initializeDropdown();
                    }
                    
                    // Update user info if authenticated (after scripts are executed)
                    if (this.isAuthenticated && this.userInfo) {
                        // Use setTimeout to ensure DOM elements are ready
                        setTimeout(() => {
                            this.updateUserInfo();
                            this.loadNotificationCount();
                            this.setupRealtimeNotifications();
                        }, 100);
                    }
                }, 50);
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
            greetingElement.classList.remove('hidden'); // Ensure it's visible
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
            // Use username or name for initial letter
            const nameForInitial = this.userInfo.username || 
                                  this.userInfo.name || 
                                  this.userInfo.full_name || 
                                  this.userInfo.fullName || 
                                  'V';
            const firstLetter = nameForInitial.charAt(0).toUpperCase();
            initialElement.textContent = firstLetter;
            initialElement.classList.remove('hidden');
            if (navProfileImage) {
                navProfileImage.classList.add('hidden');
            }
            console.log('Updated initial to:', firstLetter, 'from name:', nameForInitial);
        }

        // Also update any other name displays in mobile menu or dropdowns
        const mobileGreeting = document.querySelector('#mobile-menu .volunteer-name');
        if (mobileGreeting) {
            const displayName = this.userInfo.username || this.userInfo.name || 'Volunteer';
            mobileGreeting.textContent = displayName;
        }
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
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        const mobileMenu = document.getElementById('mobile-menu');
        const logoutLink = document.getElementById('logout-link');

        console.log('Elements found:', {
            profileBtn: !!profileBtn,
            profileDropdown: !!profileDropdown,
            mobileMenuToggle: !!mobileMenuToggle,
            mobileMenu: !!mobileMenu,
            logoutLink: !!logoutLink
        });

        // Profile dropdown toggle
        if (profileBtn && profileDropdown) {
            profileBtn.addEventListener('click', (e) => {
                console.log('Profile button clicked');
                e.stopPropagation();
                
                const isHidden = profileDropdown.classList.contains('hidden');
                console.log('Dropdown is currently hidden:', isHidden);
                
                if (isHidden) {
                    // Show dropdown
                    profileDropdown.classList.remove('hidden');
                    profileDropdown.classList.remove('opacity-0');
                    profileDropdown.classList.remove('-translate-y-2');
                    console.log('Showing dropdown');
                } else {
                    // Hide dropdown
                    profileDropdown.classList.add('hidden');
                    profileDropdown.classList.add('opacity-0');
                    profileDropdown.classList.add('-translate-y-2');
                    console.log('Hiding dropdown');
                }
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (profileDropdown && !profileDropdown.classList.contains('hidden') && 
                    !profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
                    console.log('Clicking outside, closing dropdown');
                    profileDropdown.classList.add('hidden');
                    profileDropdown.classList.add('opacity-0');
                    profileDropdown.classList.add('-translate-y-2');
                }
            });
            
            console.log('Profile dropdown event listeners attached successfully');
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

        // Mobile menu toggle
        if (mobileMenuToggle && mobileMenu) {
            mobileMenuToggle.addEventListener('click', () => {
                console.log('Mobile menu toggle clicked');
                mobileMenu.classList.toggle('hidden');
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
     */
    static async init(requireAuth = false) {
        const loader = new VolunteerNavLoader();
        await loader.loadNavigation();
        
        if (requireAuth) {
            return loader.requireAuthentication();
        }
        
        return true;
    }
}

// Export for use in other scripts
window.VolunteerNavLoader = VolunteerNavLoader;
