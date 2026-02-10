document.addEventListener('DOMContentLoaded', () => {
    // Header element - check for both authenticated nav (main-header) and unauthenticated nav (home-unauthenticated-nav)
    // The authenticated nav is loaded dynamically by nav-loader.js, so we need to handle cases where it's not yet available
    let header = document.getElementById('main-header') || document.getElementById('home-unauthenticated-nav');

    const modal = document.getElementById('coming-soon-modal');
    const modalContent = modal ? modal.querySelector('.modal-content') : null;
    const closeModalBtn = document.getElementById('close-modal-btn');
    const openModalTriggers = document.querySelectorAll('.coming-soon-trigger');

    // Authentication-related elements (these are now managed by nav-loader.js for authenticated users)
    const navAuthButtons = document.getElementById('nav-auth-buttons');
    const navProfileSection = document.getElementById('nav-profile-section');
    const mobileAuthButtons = document.getElementById('mobile-auth-buttons');
    const mobileDashboardLink = document.getElementById('mobile-dashboard-link');
    const loginCta = document.getElementById('login-cta');
    const dashboardCta = document.getElementById('dashboard-cta');
    const getStartedBtn = document.getElementById('get-started-btn');
    const profileBtn = document.getElementById('profile-btn');
    const profileDropdown = document.getElementById('profile-dropdown');
    const volunteerGreeting = document.getElementById('volunteer-greeting');
    const profileAvatar = document.getElementById('profile-avatar');
    const logoutBtn = document.getElementById('logout-btn');

    // Get all signup/login related elements throughout the page
    const volunteerSignupBtn = document.querySelector('a[href="/volunteer/signup"]');
    const studentLoginBtn = document.querySelector('a[href="/student/login"]');
    const signupSection = document.getElementById('signup-options-section');

    // --- Header Scroll Logic ---
    const handleScroll = () => {
        // Re-check for header in case it was loaded dynamically by nav-loader
        const currentHeader = header || document.getElementById('main-header') || document.getElementById('home-unauthenticated-nav');
        if (!currentHeader) return; // Header not available yet

        if (window.scrollY > 50) {
            currentHeader.classList.add('scrolled');
        } else {
            currentHeader.classList.remove('scrolled');
        }
    };
    window.addEventListener('scroll', handleScroll);

    // --- Modal Logic ---
    const openModal = (e) => {
        e.preventDefault();
        modal.classList.remove('hidden');
        setTimeout(() => { // Allow display property to apply before starting transition
            modal.classList.add('opacity-100');
            modalContent.classList.add('scale-100');
            modalContent.classList.remove('scale-95');
        }, 10);
    };

    const closeModal = () => {
        modal.classList.remove('opacity-100');
        modalContent.classList.remove('scale-100');
        modalContent.classList.add('scale-95');
        setTimeout(() => { // Wait for transition to finish before hiding
            modal.classList.add('hidden');
        }, 300); 
    };
    
    // Only attach modal logic if modal elements exist
    if (modal && modalContent) {
        openModalTriggers.forEach(trigger => {
            trigger.addEventListener('click', openModal);
        });

        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', closeModal);
        }

        // Close modal by clicking on the overlay
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
    }
    
    // Profile dropdown toggle
    if (profileBtn && profileDropdown) {
        profileBtn.addEventListener('click', () => {
            profileDropdown.classList.toggle('hidden');
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!profileBtn.contains(e.target) && !profileDropdown.contains(e.target)) {
                profileDropdown.classList.add('hidden');
            }
        });
    }
    
    // Logout functionality
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            // Initialize TalkTime Auth for volunteers if not already done
            if (!window.TalkTimeAuth) {
                window.TalkTimeAuth = new TalkTimeJWTAuth('volunteer');
            }
            
            // Call JWT logout API and clear volunteer tokens
            if (window.TalkTimeAuth.isAuthenticated()) {
                window.TalkTimeAuth.logout('/api/v1/jwt-auth/logout')
                .catch(error => {
                    console.error('Volunteer logout API error:', error);
                });
            }
            
            // Reload page to reset authentication state
            window.location.reload();
        });
    }
    
    // Handle unauthenticated state - show login elements, hide profile elements
    function handleUnauthenticatedState() {
        // Ensure auth buttons are visible
        if (navAuthButtons) navAuthButtons.classList.remove('hidden');
        if (navProfileSection) {
            navProfileSection.classList.add('hidden');
            navProfileSection.classList.remove('flex');
        }
        
        // Update mobile menu
        if (mobileAuthButtons) mobileAuthButtons.classList.remove('hidden');
        if (mobileDashboardLink) mobileDashboardLink.classList.add('hidden');
        
        // Update CTAs
        if (loginCta) loginCta.classList.remove('hidden');
        if (dashboardCta) dashboardCta.classList.add('hidden');
        
        // Ensure Get Started button points to login
        if (getStartedBtn) getStartedBtn.href = '/volunteer/login';
        
        // Show all signup/login related elements
        if (volunteerSignupBtn) volunteerSignupBtn.style.display = '';
        if (studentLoginBtn) studentLoginBtn.style.display = '';
        if (signupSection) signupSection.style.display = '';
        
        // Show any other login/signup buttons that might be hidden
        document.querySelectorAll('a[href*="login"], a[href*="signup"]').forEach(el => {
            if (el !== logoutBtn) { // Don't show logout button
                el.style.display = '';
            }
        });
    }
    
    // Check authentication status and update UI accordingly
    function checkAuthStatus() {
        // Initialize TalkTime Auth for volunteers if not already done
        if (!window.TalkTimeAuth) {
            window.TalkTimeAuth = new TalkTimeJWTAuth('volunteer');
        }
        
        // Check if volunteer JWT token exists and is valid
        if (!window.TalkTimeAuth.isAuthenticated()) {
            handleUnauthenticatedState();
            return;
        }

        // Verify token with backend
        window.TalkTimeAuth.authenticatedRequest('/api/v1/jwt-auth/verify', {
            method: 'GET'
        })
        .then(response => {
            if (response.ok) {
                return response.json();
            } else {
                throw new Error('Token verification failed');
            }
        })
        .then(data => {
            const isAuthenticated = data.success && data.user;
            
            if (isAuthenticated) {
                // User is logged in
                // Update navbar
                if (navAuthButtons) navAuthButtons.classList.add('hidden');
                if (navProfileSection) {
                    navProfileSection.classList.remove('hidden');
                    navProfileSection.classList.add('flex');
                }
                
                // Update mobile menu
                if (mobileAuthButtons) mobileAuthButtons.classList.add('hidden');
                if (mobileDashboardLink) mobileDashboardLink.classList.remove('hidden');
                
                // Update CTAs
                if (loginCta) loginCta.classList.add('hidden');
                if (dashboardCta) dashboardCta.classList.remove('hidden');
                
                // Hide all signup/login related elements throughout the page
                if (volunteerSignupBtn) volunteerSignupBtn.style.display = 'none';
                if (studentLoginBtn) studentLoginBtn.style.display = 'none';
                if (signupSection) signupSection.style.display = 'none';
                
                // Hide any other login/signup buttons that might be present
                document.querySelectorAll('a[href*="login"], a[href*="signup"]').forEach(el => {
                    if (el !== getStartedBtn && el !== logoutBtn) { // Don't hide these specific buttons
                        el.style.display = 'none';
                    }
                });
                
                // Update Get Started button to point to dashboard
                if (getStartedBtn) getStartedBtn.href = '/volunteer/dashboard/students.html';
                
                // User data is already available from the JWT verification
                return data;
            } else {
                handleUnauthenticatedState();
                return Promise.resolve({});
            }
        })
        .catch(error => {
            console.log('JWT verification failed:', error);
            // Clear invalid tokens
            window.TalkTimeAuth?.logout();
            // Token cleanup handled by JWT auth;
            // User cleanup handled by JWT auth;
            handleUnauthenticatedState();
        })
        .then(data => {
            // Update user info if available
            if (data && data.user) {
                const { fullName, profile_image } = data.user;
                
                // Update greeting with user's full name
                if (volunteerGreeting && fullName) {
                    volunteerGreeting.textContent = `Welcome, ${fullName}!`;
                    volunteerGreeting.classList.remove('hidden');
                    volunteerGreeting.classList.add('sm:inline');
                } else if (volunteerGreeting) {
                    // Fallback if no name is provided
                    volunteerGreeting.textContent = 'Welcome, Volunteer!';
                    volunteerGreeting.classList.remove('hidden');
                    volunteerGreeting.classList.add('sm:inline');
                }
                
                // Get references to avatar elements
                const letterAvatar = document.getElementById('letter-avatar');
                const profileAvatar = document.getElementById('profile-avatar');
                
                // Handle profile image or create letter avatar
                if (profile_image) {
                    // If user has a profile image, use it
                    profileAvatar.src = profile_image;
                    profileAvatar.classList.remove('hidden');
                    
                    // Hide letter avatar
                    if (letterAvatar) {
                        letterAvatar.classList.add('hidden');
                    }
                } else {
                    // Hide profile image avatar
                    if (profileAvatar) {
                        profileAvatar.classList.add('hidden');
                    }
                    
                    // Create letter avatar if no profile image
                    if (letterAvatar && fullName) {
                        const firstLetter = fullName.charAt(0).toUpperCase();
                        
                        // Use white background for all avatars
                        const bgColor = 'white';

                        // Update and show letter avatar
                        letterAvatar.textContent = firstLetter;
                        letterAvatar.style.backgroundColor = bgColor;
                        letterAvatar.classList.remove('hidden');
                    } else if (letterAvatar) {
                        // Fallback avatar if no name
                        letterAvatar.textContent = 'V';
                        letterAvatar.style.backgroundColor = 'white';
                        letterAvatar.classList.remove('hidden');
                    }
                }
            }
        })
        .catch(error => {
            console.error('Auth status check error:', error);
            // In case of error, default to logged-out state
            if (navAuthButtons) navAuthButtons.classList.remove('hidden');
            if (navProfileSection) {
                navProfileSection.classList.add('hidden');
                navProfileSection.classList.remove('flex');
            }
            
            // Update mobile menu
            if (mobileAuthButtons) mobileAuthButtons.classList.remove('hidden');
            if (mobileDashboardLink) mobileDashboardLink.classList.add('hidden');
            
            // Update CTAs
            if (loginCta) loginCta.classList.remove('hidden');
            if (dashboardCta) dashboardCta.classList.add('hidden');
            
            // Ensure Get Started button points to login
            if (getStartedBtn) getStartedBtn.href = '/volunteer/login';
        });
    }
    
    // Check auth status when page loads
    checkAuthStatus();
});
