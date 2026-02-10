/**
 * Volunteer Dashboard Navigation Component
 * Provides mobile-first bottom nav + desktop tabs pattern
 * Matches student dashboard UX exactly
 */

class VolunteerDashboardNav {
    constructor() {
        this.currentPage = this.detectCurrentPage();
        this.user = null;
    }

    detectCurrentPage() {
        const path = window.location.pathname;
        if (path.includes('notifications')) return 'notifications';
        if (path.includes('messages')) return 'messages';
        if (path.includes('students')) return 'students';
        if (path.includes('upcoming')) return 'upcoming';
        if (path.includes('history')) return 'history';
        return 'students'; // default
    }

    /**
     * Initialize the dashboard navigation
     * @param {string} containerId - ID of the container to inject nav into
     */
    init(containerId = 'dashboard-nav-container') {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn('Dashboard nav container not found:', containerId);
            return;
        }

        // Load user data
        this.loadUserData();

        // Inject both mobile bottom nav and desktop tabs
        container.innerHTML = this.renderMobileHeader() + this.renderDesktopTabs() + this.renderBottomNav();

        // Add body class for proper padding
        document.body.classList.add('dashboard-page');

        // Setup dropdown event listeners
        this.setupDropdownListeners();
    }

    loadUserData() {
        try {
            // Try multiple localStorage keys where user data might be stored
            const possibleKeys = [
                'volunteer_talktime_user',
                'volunteer_user',
                'talktime_volunteer_user',
                'user'
            ];

            for (const key of possibleKeys) {
                const userData = localStorage.getItem(key);
                if (userData) {
                    const parsed = JSON.parse(userData);
                    // Validate it looks like user data (has name or email)
                    if (parsed && (parsed.first_name || parsed.firstName || parsed.name || parsed.email || parsed.full_name)) {
                        this.user = parsed;
                        console.log('User data loaded from:', key, this.user);
                        return;
                    }
                }
            }

            // If still no user data, try to get from TalkTimeAuth
            if (!this.user && window.TalkTimeAuth) {
                const authUser = window.TalkTimeAuth.getUser?.() || window.TalkTimeAuth.user;
                if (authUser) {
                    this.user = authUser;
                    console.log('User data loaded from TalkTimeAuth:', this.user);
                }
            }

            if (!this.user) {
                console.warn('No user data found in localStorage or TalkTimeAuth');
            }
        } catch (e) {
            console.warn('Failed to load user data:', e);
        }
    }

    getInitials() {
        if (!this.user) return 'V';

        // Try to get first and last name from various field names
        const firstName = this.user.first_name || this.user.firstName || this.user.firstname || '';
        const lastName = this.user.last_name || this.user.lastName || this.user.lastname || '';

        // If we have both first and last name
        if (firstName && lastName) {
            return (firstName.charAt(0) + lastName.charAt(0)).toUpperCase();
        }

        // Try full_name or name field and split it
        const fullName = this.user.full_name || this.user.fullName || this.user.name || '';
        if (fullName) {
            const parts = fullName.trim().split(/\s+/);
            if (parts.length >= 2) {
                return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
            }
            if (parts.length === 1 && parts[0]) {
                return parts[0].charAt(0).toUpperCase();
            }
        }

        // Try username
        if (this.user.username) {
            return this.user.username.charAt(0).toUpperCase();
        }

        // Fallback
        if (firstName) return firstName.charAt(0).toUpperCase();
        return 'V';
    }

    getFullName() {
        if (!this.user) return 'Volunteer';

        // Try first + last name
        const firstName = this.user.first_name || this.user.firstName || this.user.firstname || '';
        const lastName = this.user.last_name || this.user.lastName || this.user.lastname || '';
        if (firstName && lastName) {
            return `${firstName} ${lastName}`;
        }

        // Try full_name or name field
        const fullName = this.user.full_name || this.user.fullName || this.user.name || '';
        if (fullName) return fullName;

        // Try username
        if (this.user.username) return this.user.username;

        // Fallback
        return firstName || 'Volunteer';
    }

    getEmail() {
        if (!this.user) return '';
        return this.user.email || '';
    }

    getProfileImage() {
        if (!this.user) return null;
        return this.user.profile_image || this.user.profileImage || null;
    }

    renderMobileHeader() {
        const initials = this.getInitials();
        const fullName = this.getFullName();
        const email = this.getEmail();
        const profileImage = this.getProfileImage();

        // Avatar HTML - show image if available, otherwise initials
        const avatarHtml = profileImage
            ? `<img id="nav-profile-image" src="${profileImage}" alt="Profile" class="w-9 h-9 md:w-10 md:h-10 rounded-full object-cover border-2 border-gray-200">
               <div id="volunteer-initial" class="hidden w-9 h-9 md:w-10 md:h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm md:text-base">${initials}</div>`
            : `<img id="nav-profile-image" src="" alt="Profile" class="hidden w-9 h-9 md:w-10 md:h-10 rounded-full object-cover border-2 border-gray-200">
               <div id="volunteer-initial" class="w-9 h-9 md:w-10 md:h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm md:text-base">${initials}</div>`;

        return `
        <header class="mobile-header fixed top-0 left-0 right-0 z-40">
            <div class="header-inner">
                <!-- Logo - Black, no gradient -->
                <a href="/volunteer" class="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 md:h-7 md:w-7" viewBox="0 0 24 24" fill="none">
                        <path stroke="#111827" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 3h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2z"></path>
                    </svg>
                    <span class="logo-text font-bold text-gray-900 tracking-tight">TALKTIME</span>
                </a>

                <!-- Notification Bell & Profile Section -->
                <div class="flex items-center gap-2">
                    <!-- Notification Bell -->
                    <a href="/volunteer/notifications" id="notification-bell-btn" class="relative p-2 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors">
                        <i class="fas fa-bell text-gray-600 text-lg"></i>
                        <span id="notification-badge" class="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1 hidden">0</span>
                    </a>

                    <!-- Profile Section -->
                    <div class="relative">
                        <button id="profile-btn" class="flex items-center gap-2 md:gap-3 p-2 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors">
                            <span class="text-sm font-medium text-gray-700 hidden sm:inline" id="volunteerName">${fullName}</span>
                            <div class="relative">
                                ${avatarHtml}
                            </div>
                        </button>

                        <!-- Dropdown -->
                        <div id="profile-dropdown" class="absolute right-0 top-full mt-2 w-56 md:w-64 bg-white rounded-xl shadow-lg py-2 hidden opacity-0 transform -translate-y-2 transition-all z-50 border border-gray-100">
                            <!-- User Info -->
                            <div class="px-4 py-3 border-b border-gray-100">
                                <div class="font-semibold text-gray-900" id="dropdown-volunteer-name">${fullName}</div>
                                <div class="text-sm text-gray-500 mt-1 truncate" id="dropdown-volunteer-email">${email}</div>
                            </div>

                            <!-- Profile & Settings -->
                            <div class="py-1 border-b border-gray-100">
                                <a href="/volunteer/profile" class="flex items-center gap-3 px-4 py-2.5 text-gray-700 hover:bg-gray-50 transition-colors">
                                    <i class="fas fa-user-circle text-gray-400 w-5 text-center"></i>
                                    <span>My Profile</span>
                                </a>
                                <a href="/volunteer/settings" class="flex items-center gap-3 px-4 py-2.5 text-gray-700 hover:bg-gray-50 transition-colors">
                                    <i class="fas fa-cog text-gray-400 w-5 text-center"></i>
                                    <span>Settings</span>
                                </a>
                            </div>

                            <!-- Navigation Links -->
                            <div class="py-1 border-b border-gray-100">
                                <a href="/volunteer" class="flex items-center gap-3 px-4 py-2.5 text-gray-700 hover:bg-gray-50 transition-colors">
                                    <i class="fas fa-home text-gray-400 w-5 text-center"></i>
                                    <span>Home</span>
                                </a>
                                <a href="/volunteer/who-we-are" class="flex items-center gap-3 px-4 py-2.5 text-gray-700 hover:bg-gray-50 transition-colors">
                                    <i class="fas fa-info-circle text-gray-400 w-5 text-center"></i>
                                    <span>Who We Are</span>
                                </a>
                            </div>

                            <!-- Logout -->
                            <div class="py-1">
                                <a href="#" id="logout-link" class="flex items-center gap-3 px-4 py-2.5 text-red-600 hover:bg-red-50 transition-colors">
                                    <i class="fas fa-sign-out-alt w-5 text-center"></i>
                                    <span>Logout</span>
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </header>
        `;
    }

    setupDropdownListeners() {
        const profileBtn = document.getElementById('profile-btn');
        const profileDropdown = document.getElementById('profile-dropdown');
        const logoutLink = document.getElementById('logout-link');

        if (profileBtn && profileDropdown) {
            profileBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                profileDropdown.classList.toggle('hidden');
                profileDropdown.classList.toggle('show');
            });

            document.addEventListener('click', () => {
                profileDropdown.classList.add('hidden');
                profileDropdown.classList.remove('show');
            });

            // Prevent dropdown from closing when clicking inside it
            profileDropdown.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        if (logoutLink) {
            logoutLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogout();
            });
        }
    }

    handleLogout() {
        // Clear all volunteer-related localStorage items
        localStorage.removeItem('volunteer_talktime_access_token');
        localStorage.removeItem('volunteer_talktime_refresh_token');
        localStorage.removeItem('volunteer_talktime_user');
        localStorage.removeItem('volunteer_user');

        // Redirect to login
        window.location.href = '/volunteer/login';
    }

    renderDesktopTabs() {
        const tabs = [
            { id: 'students', label: 'Students', icon: 'fa-users', href: '/volunteer/dashboard/students' },
            { id: 'upcoming', label: 'Upcoming', icon: 'fa-calendar-alt', href: '/volunteer/dashboard/upcoming' },
            { id: 'history', label: 'History', icon: 'fa-history', href: '/volunteer/dashboard/history' },
            { id: 'messages', label: 'Messages', icon: 'fa-envelope', href: '/volunteer/dashboard/messages' },
            { id: 'notifications', label: 'Notifications', icon: 'fa-bell', href: '/volunteer/notifications' }
        ];

        const tabsHtml = tabs.map(tab => {
            const isActive = this.currentPage === tab.id;
            const activeClass = isActive ? 'active text-brand-primary border-brand' : 'text-gray-600 border-transparent hover:text-gray-800';

            // Badge HTML based on tab type
            let badgeHtml = '';
            if (tab.id === 'upcoming') {
                badgeHtml = '<span id="upcoming-badge-desktop" class="hidden ml-1 w-5 h-5 bg-green-500 text-white text-xs rounded-full flex items-center justify-center">0</span>';
            } else if (tab.id === 'notifications') {
                badgeHtml = '<span id="notifications-tab-badge" class="hidden ml-1 min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">0</span>';
            }

            // Dot indicator for notifications and messages
            let dotHtml = '';
            if (tab.id === 'notifications') {
                dotHtml = '<span id="notifications-tab-dot" class="hidden absolute -top-1 -left-0.5 w-2 h-2 bg-red-500 rounded-full"></span>';
            } else if (tab.id === 'messages') {
                dotHtml = '<span id="messages-tab-dot" class="hidden absolute -top-1 -left-0.5 w-2 h-2 bg-brand-primary rounded-full"></span>';
            }

            return `
                <a href="${tab.href}" class="tab-btn ${activeClass} border-b-2 flex items-center gap-2">
                    <span class="relative inline-block">
                        <i class="fas ${tab.icon}"></i>
                        ${dotHtml}
                    </span>
                    <span>${tab.label}</span>
                    ${badgeHtml}
                </a>
            `;
        }).join('');

        return `
        <div class="desktop-tabs">
            <nav>
                ${tabsHtml}
            </nav>
        </div>
        `;
    }

    renderBottomNav() {
        const navItems = [
            { id: 'students', label: 'Students', icon: 'fa-users', href: '/volunteer/dashboard/students' },
            { id: 'upcoming', label: 'Upcoming', icon: 'fa-calendar-alt', href: '/volunteer/dashboard/upcoming' },
            { id: 'history', label: 'History', icon: 'fa-history', href: '/volunteer/dashboard/history' },
            { id: 'messages', label: 'Messages', icon: 'fa-envelope', href: '/volunteer/dashboard/messages' },
            { id: 'notifications', label: 'Alerts', icon: 'fa-bell', href: '/volunteer/notifications' }
        ];

        const navHtml = navItems.map(item => {
            const isActive = this.currentPage === item.id;
            const activeClass = isActive ? 'active' : '';

            // Badge/dot HTML based on item type
            let badgeHtml = '';
            if (item.id === 'upcoming') {
                badgeHtml = '<span id="upcoming-badge-mobile" class="hidden absolute -top-1 right-1/4 w-5 h-5 bg-green-500 text-white text-xs rounded-full flex items-center justify-center animate-pulse">0</span>';
            } else if (item.id === 'notifications') {
                badgeHtml = '<span id="notifications-tab-dot-mobile" class="hidden absolute -top-0.5 -left-0.5 w-2 h-2 bg-red-500 rounded-full"></span>';
            } else if (item.id === 'messages') {
                badgeHtml = '<span id="messages-tab-dot-mobile" class="hidden absolute -top-0.5 -left-0.5 w-2 h-2 bg-brand-primary rounded-full"></span>';
            }

            return `
                <a href="${item.href}" class="bottom-nav-item ${activeClass}">
                    <span class="relative inline-block">
                        <i class="fas ${item.icon}"></i>
                        ${badgeHtml}
                    </span>
                    <span>${item.label}</span>
                </a>
            `;
        }).join('');

        return `
        <nav class="bottom-nav">
            ${navHtml}
        </nav>
        `;
    }

    /**
     * Update the upcoming meetings badge count
     * @param {number} count - Number of upcoming meetings
     */
    updateUpcomingBadge(count) {
        const desktopBadge = document.getElementById('upcoming-badge-desktop');
        const mobileBadge = document.getElementById('upcoming-badge-mobile');

        if (count > 0) {
            if (desktopBadge) {
                desktopBadge.textContent = count;
                desktopBadge.classList.remove('hidden');
            }
            if (mobileBadge) {
                mobileBadge.textContent = count;
                mobileBadge.classList.remove('hidden');
            }
        } else {
            if (desktopBadge) desktopBadge.classList.add('hidden');
            if (mobileBadge) mobileBadge.classList.add('hidden');
        }
    }

    /**
     * Update message badge dot - shows/hides message indicators
     * @param {number} count - Number of unread messages
     */
    updateMessageBadge(count) {
        // Desktop tab dot indicator
        const tabDot = document.getElementById('messages-tab-dot');
        if (tabDot) {
            tabDot.classList.toggle('hidden', count === 0);
        }

        // Mobile tab dot indicator
        const tabDotMobile = document.getElementById('messages-tab-dot-mobile');
        if (tabDotMobile) {
            tabDotMobile.classList.toggle('hidden', count === 0);
        }
    }

    /**
     * Update notification badge count - updates ALL notification indicators
     * @param {number} count - Number of unread notifications
     */
    updateNotificationBadge(count) {
        // Header bell badge (numeric count)
        const headerBadge = document.getElementById('notification-badge');
        if (headerBadge) {
            if (count > 0) {
                headerBadge.textContent = count > 99 ? '99+' : count;
                headerBadge.classList.remove('hidden');
            } else {
                headerBadge.classList.add('hidden');
            }
        }

        // Desktop tab badge (numeric count)
        const tabBadge = document.getElementById('notifications-tab-badge');
        if (tabBadge) {
            if (count > 0) {
                tabBadge.textContent = count > 99 ? '99+' : count;
                tabBadge.classList.remove('hidden');
            } else {
                tabBadge.classList.add('hidden');
            }
        }

        // Desktop tab dot indicator
        const tabDot = document.getElementById('notifications-tab-dot');
        if (tabDot) {
            tabDot.classList.toggle('hidden', count === 0);
        }

        // Mobile tab dot indicator
        const tabDotMobile = document.getElementById('notifications-tab-dot-mobile');
        if (tabDotMobile) {
            tabDotMobile.classList.toggle('hidden', count === 0);
        }
    }

    /**
     * Update user info in header and dropdown
     * @param {Object} user - User object with name, email, profile_image
     */
    updateUserInfo(user) {
        this.user = user;

        const initials = this.getInitials();
        const fullName = this.getFullName();
        const email = this.getEmail();
        const profileImage = this.getProfileImage();

        // Update name displays
        const volunteerName = document.getElementById('volunteerName');
        const dropdownName = document.getElementById('dropdown-volunteer-name');
        const dropdownEmail = document.getElementById('dropdown-volunteer-email');
        const initialEl = document.getElementById('volunteer-initial');
        const imageEl = document.getElementById('nav-profile-image');

        if (volunteerName) volunteerName.textContent = fullName;
        if (dropdownName) dropdownName.textContent = fullName;
        if (dropdownEmail) dropdownEmail.textContent = email;
        if (initialEl) initialEl.textContent = initials;

        // Handle profile image
        if (profileImage && imageEl) {
            imageEl.src = profileImage;
            imageEl.classList.remove('hidden');
            if (initialEl) initialEl.classList.add('hidden');
        } else if (initialEl) {
            initialEl.classList.remove('hidden');
            if (imageEl) imageEl.classList.add('hidden');
        }
    }

    /**
     * Set user avatar initial (legacy method)
     * @param {string} name - User's name
     */
    setUserAvatar(name) {
        const avatar = document.getElementById('volunteer-initial');
        if (avatar && name) {
            avatar.textContent = name.charAt(0).toUpperCase();
        }
    }
}

// Create global instance
window.VolunteerDashboardNav = new VolunteerDashboardNav();

// Auto-initialize if container exists
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('dashboard-nav-container');
    if (container) {
        window.VolunteerDashboardNav.init();

        // Delayed refresh - in case user data is loaded asynchronously by other scripts
        setTimeout(() => {
            window.VolunteerDashboardNav.loadUserData();
            if (window.VolunteerDashboardNav.user) {
                window.VolunteerDashboardNav.updateUserInfo(window.VolunteerDashboardNav.user);
            }

            // Fetch and display unread notification count
            window.VolunteerDashboardNav.fetchUnreadNotificationCount();

            // Fetch and display unread message count
            window.VolunteerDashboardNav.fetchUnreadMessageCount();
        }, 500);
    }
});

/**
 * Fetch unread notification count from API and update badge
 * Added as a method to the class prototype for global access
 */
VolunteerDashboardNav.prototype.fetchUnreadNotificationCount = async function() {
    try {
        // Check if TalkTimeAuth is available
        if (!window.TalkTimeAuth || !window.TalkTimeAuth.isAuthenticated()) {
            return;
        }

        const response = await window.TalkTimeAuth.authenticatedRequest('/api/v1/notifications/unread-count');
        if (response.ok) {
            const data = await response.json();
            // Handle both field names
            const count = data.unread_count || data.count || 0;
            this.updateNotificationBadge(count);
        }
    } catch (error) {
        console.error('Error fetching notification count:', error);
    }
};

/**
 * Fetch unread message count from API and update badge
 * Added as a method to the class prototype for global access
 */
VolunteerDashboardNav.prototype.fetchUnreadMessageCount = async function() {
    try {
        // Check if TalkTimeAuth is available
        if (!window.TalkTimeAuth || !window.TalkTimeAuth.isAuthenticated()) {
            return;
        }

        const response = await window.TalkTimeAuth.authenticatedRequest('/api/v1/volunteers/me/messages/unread-count');
        if (response.ok) {
            const data = await response.json();
            const count = data.unreadCount || 0;
            this.updateMessageBadge(count);
        }
    } catch (error) {
        console.error('Error fetching unread message count:', error);
    }
};
