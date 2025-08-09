document.addEventListener('DOMContentLoaded', () => {
    const header = document.getElementById('main-header');
    const modal = document.getElementById('coming-soon-modal');
    const modalContent = modal.querySelector('.modal-content');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const openModalTriggers = document.querySelectorAll('.coming-soon-trigger');
    
    // Authentication-related elements
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
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
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
    
    // Only attach modal logic to buttons that aren't for main app flow
    openModalTriggers.forEach(trigger => {
        trigger.addEventListener('click', openModal);
    });

    closeModalBtn.addEventListener('click', closeModal);
    // Close modal by clicking on the overlay
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // Profile dropdown toggle
    if (profileBtn) {
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
            // Call logout API
            fetch('/api/v1/auth/logout', {
                method: 'POST',
                credentials: 'include'
            })
            .then(response => {
                if (response.ok) {
                    // Redirect to home page after logout
                    window.location.href = '/';
                }
            })
            .catch(error => {
                console.error('Logout error:', error);
            });
        });
    }
    
    // Check authentication status and update UI accordingly
    function checkAuthStatus() {
        // Use the same auth check endpoint as the navigation loader
        fetch('/api/v1/auth/check', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        })
        .then(response => {
            // If response is 200 OK, user is authenticated
            // If response is 401 Unauthorized, user is not authenticated
            const isAuthenticated = response.status === 200;
            
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
                if (getStartedBtn) getStartedBtn.href = '/volunteer/dashboard';
                
                // Try to get user data for personalization
                return response.json().catch(() => {
                    // If JSON parsing fails, return empty object
                    return {};
                });
            } else {
                // User is not logged in
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
                
                // Return empty promise to avoid chaining errors
                return Promise.resolve({});
            }
        })
        .then(data => {
            // Update user info if available
            if (data && data.authenticated) {
                const { name, profile_image } = data;
                
                // Update greeting with user's full name
                if (volunteerGreeting && name) {
                    volunteerGreeting.textContent = `Welcome, ${name}!`;
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
                    if (letterAvatar && name) {
                        const firstLetter = name.charAt(0).toUpperCase();
                        
                        // Generate a consistent color based on the name
                        const colors = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#c026d3'];
                        const colorIndex = Math.abs(firstLetter.charCodeAt(0)) % colors.length;
                        const bgColor = colors[colorIndex];
                        
                        // Update and show letter avatar
                        letterAvatar.textContent = firstLetter;
                        letterAvatar.style.backgroundColor = bgColor;
                        letterAvatar.classList.remove('hidden');
                    } else if (letterAvatar) {
                        // Fallback avatar if no name
                        letterAvatar.textContent = 'V';
                        letterAvatar.style.backgroundColor = '#4f46e5';
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
