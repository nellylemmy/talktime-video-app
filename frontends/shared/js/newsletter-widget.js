/**
 * TalkTime Newsletter Subscription Widget
 * Strategic lead capture component that adapts to user roles and context
 * Designed to match TalkTime's glassmorphism and gradient design system
 */

class NewsletterWidget {
    constructor(options = {}) {
        this.options = {
            role: options.role || 'visitor', // visitor, volunteer, student, admin
            placement: options.placement || 'floating', // floating, inline, footer
            delay: options.delay || 30000, // 30 seconds default
            scrollTrigger: options.scrollTrigger || 0.5, // 50% scroll
            autoShow: options.autoShow !== false, // true by default
            user: options.user || null, // User data for pre-filling
            ...options
        };

        this.isVisible = false;
        this.isMinimized = true;
        this.hasTriggered = false;
        this.widgetElement = null;
        this.isSubscribed = this.checkSubscriptionStatus();

        // Only initialize if user is logged in and not already subscribed
        if (this.shouldShowWidget()) {
            this.init();
        }
    }
    
    init() {
        this.createWidget();
        this.attachEventListeners();
        this.prefillUserData();

        if (this.options.autoShow && this.options.placement === 'floating') {
            // Show immediately instead of waiting for triggers
            setTimeout(() => this.show(), 1000); // Show after 1 second
        }
    }

    shouldShowWidget() {
        // Only show if user is authenticated
        if (!window.TalkTimeAuth || !window.TalkTimeAuth.isAuthenticated()) {
            return false;
        }

        // Don't show if already subscribed
        if (this.isSubscribed) {
            console.log('User already subscribed to newsletter');
            return false;
        }

        return true;
    }

    checkSubscriptionStatus() {
        // Check localStorage for subscription status
        const subscriptionKey = `newsletter_subscribed_${this.options.role}`;
        const isSubscribed = localStorage.getItem(subscriptionKey) === 'true';
        return isSubscribed;
    }

    prefillUserData() {
        // Pre-fill user data if available
        setTimeout(() => {
            const emailInput = document.getElementById('newsletter-email');
            const nameInput = document.getElementById('newsletter-name');

            if (this.options.user || window.TalkTimeAuth) {
                const user = this.options.user || window.TalkTimeAuth.getUser();

                if (user) {
                    // Pre-fill email
                    if (emailInput && user.email) {
                        emailInput.value = user.email;
                        emailInput.setAttribute('readonly', 'readonly');
                        emailInput.classList.add('bg-gray-100');
                    }

                    // Pre-fill name
                    if (nameInput) {
                        const fullName = user.full_name || user.name || user.username || '';
                        if (fullName) {
                            nameInput.value = fullName;
                        }
                    }
                }
            }
        }, 200);
    }
    
    createWidget() {
        const widgetHTML = this.getWidgetHTML();
        const widgetContainer = document.createElement('div');
        widgetContainer.innerHTML = widgetHTML;
        this.widgetElement = widgetContainer.firstElementChild;
        
        // Insert based on placement
        if (this.options.placement === 'floating') {
            document.body.appendChild(this.widgetElement);
        } else if (this.options.placement === 'footer') {
            const footer = document.querySelector('footer');
            if (footer) {
                footer.appendChild(this.widgetElement);
            } else {
                document.body.appendChild(this.widgetElement);
            }
        } else {
            // Inline placement - caller will handle positioning
            return this.widgetElement;
        }
    }
    
    getWidgetHTML() {
        const config = this.getRoleConfig();
        const baseClasses = this.options.placement === 'floating' 
            ? 'fixed bottom-4 right-4 max-w-[90vw] sm:max-w-xs z-30 pointer-events-none' 
            : 'relative w-full';
        
        return `
            <div id="newsletter-widget" class="${baseClasses} newsletter-widget transform transition-all duration-500 ease-in-out ${this.options.placement === 'floating' ? 'translate-y-full opacity-0' : ''}" 
                 style="display: none;">
                <!-- Minimized State -->
                <div id="newsletter-minimized" class="newsletter-minimized cursor-pointer pointer-events-auto">
                    <div class="pulse-zoom glass-card rounded-full p-4 shadow-xl hover:shadow-2xl transition-all transform hover:scale-105 bg-blue-600 hover:bg-blue-700 text-white" style="--pulse-color: rgb(59 130 246 / 0.4);">
                        <div class="flex items-center gap-3 text-white">
                            <i class="fas fa-paper-plane text-lg"></i>
                            <span class="font-semibold text-sm">Subscribe</span>
                            <i class="fas fa-chevron-up text-xs"></i>
                        </div>
                    </div>
                </div>
                
                <!-- Expanded State -->
                <div id="newsletter-expanded" class="newsletter-expanded hidden pointer-events-auto">
                    <div class="glass-card rounded-2xl p-6 shadow-2xl bg-white/95 backdrop-blur-lg border border-white/20">
                        <!-- Header -->
                        <div class="flex items-center justify-between mb-4">
                            <div class="flex items-center gap-2">
                                <div class="w-8 h-8 rounded-lg ${config.iconBgClass} flex items-center justify-center">
                                    <i class="fas ${config.icon} text-white text-sm"></i>
                                </div>
                                <h3 class="font-bold text-gray-900">${config.title}</h3>
                            </div>
                            <button id="newsletter-close" class="text-gray-400 hover:text-gray-600 transition-colors">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                        
                        <!-- Content -->
                        <p class="text-gray-700 text-sm mb-4 leading-relaxed">${config.description}</p>
                        
                        <!-- Form -->
                        <form id="newsletter-form" class="space-y-3">
                            <div class="relative">
                                <input type="text" id="newsletter-name" required
                                       class="w-full px-4 py-3 bg-white/80 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all text-sm"
                                       placeholder="Your full name">
                                <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                    <i class="fas fa-user text-gray-400 text-sm"></i>
                                </div>
                            </div>
                            <div class="relative">
                                <input type="email" id="newsletter-email" required
                                       class="w-full px-4 py-3 bg-white/80 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all text-sm"
                                       placeholder="Enter your email address">
                                <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                    <i class="fas fa-envelope text-gray-400 text-sm"></i>
                                </div>
                            </div>

                            ${config.showInterests ? this.getInterestsHTML() : ''}

                            <button type="submit" id="newsletter-submit"
                                    class="w-full ${config.buttonClass} text-white font-semibold py-3 rounded-lg hover:shadow-lg transition-all duration-300 transform hover:scale-[1.02] text-sm">
                                <i class="fas fa-paper-plane mr-2"></i>
                                ${config.ctaText}
                            </button>
                        </form>
                        
                        <!-- Success State -->
                        <div id="newsletter-success" class="hidden text-center py-4">
                            <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                                <i class="fas fa-check text-green-600 text-lg"></i>
                            </div>
                            <h4 class="font-bold text-gray-900 mb-2">Welcome to TalkTime!</h4>
                            <p class="text-gray-600 text-sm">${config.successMessage}</p>
                        </div>
                        
                        <!-- Footer -->
                        <div class="mt-4 pt-4 border-t border-gray-200">
                            <p class="text-xs text-gray-500 text-center">
                                <i class="fas fa-shield-alt mr-1"></i>
                                Your privacy matters. Unsubscribe anytime.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    getInterestsHTML() {
        const config = this.getRoleConfig();
        return `
            <div class="space-y-2">
                <label class="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                    Interests (Optional - leave empty to subscribe to all)
                </label>
                <div class="flex flex-wrap gap-2">
                    ${config.interests.map(interest => `
                        <label class="inline-flex items-center">
                            <input type="checkbox" name="interests" value="${interest.value}"
                                   class="hidden peer">
                            <span class="peer-checked:bg-orange-500 peer-checked:text-white bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all hover:bg-gray-200 peer-checked:hover:bg-orange-600">
                                ${interest.label}
                            </span>
                        </label>
                    `).join('')}
                </div>
                <p class="text-xs text-gray-500 italic">No selection = Subscribe to all categories</p>
            </div>
        `;
    }
    
    getRoleConfig() {
        const configs = {
            visitor: {
                icon: 'fa-heart',
                iconBgClass: 'bg-pink-500',
                buttonClass: 'bg-pink-500 hover:bg-pink-600',
                minimizedText: 'Join TalkTime',
                title: 'Stay Connected',
                description: 'Get updates on how volunteers are changing lives through English conversation practice with Maasai students.',
                ctaText: 'Join Our Community',
                successMessage: 'Thank you for joining our mission to empower through conversation!',
                showInterests: true,
                interests: [
                    { label: 'Volunteer Stories', value: 'volunteer_stories' },
                    { label: 'Student Progress', value: 'student_progress' },
                    { label: 'Program Updates', value: 'program_updates' },
                    { label: 'Impact Reports', value: 'impact_reports' }
                ]
            },
            volunteer: {
                icon: 'fa-users',
                iconBgClass: 'bg-blue-600',
                buttonClass: 'bg-blue-600 hover:bg-blue-700',
                minimizedText: 'Volunteer Updates',
                title: 'Volunteer Community',
                description: 'Stay updated with volunteer tips, success stories, and exclusive insights from the TalkTime community.',
                ctaText: 'Get Volunteer Updates',
                successMessage: 'You\'ll receive exclusive volunteer insights and community updates!',
                showInterests: true,
                interests: [
                    { label: 'Teaching Tips', value: 'teaching_tips' },
                    { label: 'Community Stories', value: 'community_stories' },
                    { label: 'New Features', value: 'new_features' },
                    { label: 'Recognition', value: 'recognition' }
                ]
            },
            student: {
                icon: 'fa-graduation-cap',
                iconBgClass: 'bg-green-600',
                buttonClass: 'bg-green-600 hover:bg-green-700',
                minimizedText: 'Learning Updates',
                title: 'Student Success',
                description: 'Receive motivational content, learning tips, and updates about the TalkTime program.',
                ctaText: 'Get Learning Updates',
                successMessage: 'You\'ll receive inspiring content to support your English learning journey!',
                showInterests: true,
                interests: [
                    { label: 'Learning Tips', value: 'learning_tips' },
                    { label: 'Success Stories', value: 'success_stories' },
                    { label: 'Program News', value: 'program_news' },
                    { label: 'Opportunities', value: 'opportunities' }
                ]
            },
            admin: {
                icon: 'fa-chart-line',
                iconBgClass: 'bg-purple-600',
                buttonClass: 'bg-purple-600 hover:bg-purple-700',
                minimizedText: 'System Updates',
                title: 'Admin Insights',
                description: 'Receive platform analytics, system updates, and program management insights.',
                ctaText: 'Get Admin Updates',
                successMessage: 'You\'ll receive platform insights and management updates!',
                showInterests: true,
                interests: [
                    { label: 'Analytics', value: 'analytics' },
                    { label: 'System Updates', value: 'system_updates' },
                    { label: 'User Feedback', value: 'user_feedback' },
                    { label: 'Performance', value: 'performance' }
                ]
            }
        };
        
        return configs[this.options.role] || configs.visitor;
    }
    
    setupTriggers() {
        // Time-based trigger
        setTimeout(() => {
            if (!this.hasTriggered) {
                this.show();
            }
        }, this.options.delay);
        
        // Scroll-based trigger
        const scrollHandler = () => {
            const scrollPercent = (window.scrollY / (document.documentElement.scrollHeight - window.innerHeight));
            if (scrollPercent >= this.options.scrollTrigger && !this.hasTriggered) {
                this.show();
                window.removeEventListener('scroll', scrollHandler);
            }
        };
        
        window.addEventListener('scroll', scrollHandler);
    }
    
    attachEventListeners() {
        // Wait for element to be in DOM
        setTimeout(() => {
            const widget = document.getElementById('newsletter-widget');
            const minimized = document.getElementById('newsletter-minimized');
            const expanded = document.getElementById('newsletter-expanded');
            const closeBtn = document.getElementById('newsletter-close');
            const form = document.getElementById('newsletter-form');
            
            if (!widget) return;
            
            // Toggle widget
            if (minimized) {
                minimized.addEventListener('click', () => this.expand());
            }
            
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.minimize());
            }
            
            // Form submission
            if (form) {
                form.addEventListener('submit', (e) => this.handleSubmit(e));
            }
            
            // Close on outside click for expanded state
            document.addEventListener('click', (e) => {
                if (widget && !widget.contains(e.target) && !this.isMinimized) {
                    this.minimize();
                }
            });
            
            // Prevent widget clicks from closing
            widget.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }, 100);
    }
    
    show() {
        if (!this.isVisible && this.widgetElement) {
            this.isVisible = true;
            this.hasTriggered = true;
            this.widgetElement.style.display = 'block';
            
            // Animate in
            setTimeout(() => {
                this.widgetElement.classList.remove('translate-y-full', 'opacity-0');
                this.widgetElement.classList.add('translate-y-0', 'opacity-100');
            }, 50);
        }
    }
    
    hide() {
        if (this.isVisible && this.widgetElement) {
            this.widgetElement.classList.add('translate-y-full', 'opacity-0');
            this.widgetElement.classList.remove('translate-y-0', 'opacity-100');
            
            setTimeout(() => {
                this.widgetElement.style.display = 'none';
                this.isVisible = false;
            }, 500);
        }
    }
    
    expand() {
        const minimized = document.getElementById('newsletter-minimized');
        const expanded = document.getElementById('newsletter-expanded');
        
        if (minimized && expanded) {
            minimized.classList.add('hidden');
            expanded.classList.remove('hidden');
            this.isMinimized = false;
        }
    }
    
    minimize() {
        const minimized = document.getElementById('newsletter-minimized');
        const expanded = document.getElementById('newsletter-expanded');
        
        if (minimized && expanded) {
            expanded.classList.add('hidden');
            minimized.classList.remove('hidden');
            this.isMinimized = true;
        }
    }
    
    async handleSubmit(e) {
        e.preventDefault();

        const email = document.getElementById('newsletter-email').value;
        const name = document.getElementById('newsletter-name').value;
        let interests = Array.from(document.querySelectorAll('input[name="interests"]:checked'))
            .map(cb => cb.value);

        // If no interests selected, subscribe to all
        const config = this.getRoleConfig();
        if (interests.length === 0 && config.interests) {
            interests = config.interests.map(i => i.value);
        }

        const submitBtn = document.getElementById('newsletter-submit');
        const form = document.getElementById('newsletter-form');
        const success = document.getElementById('newsletter-success');

        // Show loading state
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Subscribing...';
        submitBtn.disabled = true;

        try {
            // Add JWT token if available
            const headers = {
                'Content-Type': 'application/json',
            };

            if (window.TalkTimeAuth && window.TalkTimeAuth.isAuthenticated()) {
                const token = window.TalkTimeAuth.getToken();
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
            }

            const response = await fetch('/api/v1/newsletter/subscribe', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    email,
                    name,
                    interests,
                    role: this.options.role,
                    source: 'widget',
                    placement: this.options.placement,
                    page: window.location.pathname
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Mark as subscribed in localStorage ONLY after successful DB save
                const subscriptionKey = `newsletter_subscribed_${this.options.role}`;
                localStorage.setItem(subscriptionKey, 'true');
                localStorage.setItem(`newsletter_email_${this.options.role}`, email);
                localStorage.setItem(`newsletter_name_${this.options.role}`, name);
                localStorage.setItem(`newsletter_date_${this.options.role}`, new Date().toISOString());

                // Show success state
                form.classList.add('hidden');
                success.classList.remove('hidden');

                // Track the conversion
                this.trackConversion(email, interests);

                // Auto-hide widget permanently after success
                setTimeout(() => {
                    this.hide();
                    // Remove widget from DOM since user is now subscribed
                    setTimeout(() => {
                        this.destroy();
                    }, 1000);
                }, 3000);
            } else {
                throw new Error(data.message || 'Subscription failed');
            }
        } catch (error) {
            console.error('Newsletter subscription error:', error);
            
            // Show error state
            submitBtn.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i>Try Again';
            submitBtn.classList.add('bg-red-500');
            
            // Reset button after delay
            setTimeout(() => {
                submitBtn.innerHTML = `<i class="fas fa-paper-plane mr-2"></i>${this.getRoleConfig().ctaText}`;
                submitBtn.classList.remove('bg-red-500');
                submitBtn.disabled = false;
            }, 3000);
        }
    }
    
    trackConversion(email, interests) {
        // Track newsletter signup conversion
        if (typeof gtag !== 'undefined') {
            gtag('event', 'newsletter_signup', {
                'event_category': 'engagement',
                'event_label': this.options.role,
                'value': 1
            });
        }
        
        // Custom tracking for TalkTime analytics
        if (window.TalkTimeAnalytics) {
            window.TalkTimeAnalytics.track('newsletter_signup', {
                email,
                interests,
                role: this.options.role,
                placement: this.options.placement,
                page: window.location.pathname,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    // Public methods
    destroy() {
        if (this.widgetElement) {
            this.widgetElement.remove();
        }
    }
    
    updateRole(newRole) {
        this.options.role = newRole;
        // Recreate widget with new role config
        if (this.widgetElement) {
            const parent = this.widgetElement.parentNode;
            this.destroy();
            this.createWidget();
            this.attachEventListeners();
        }
    }
}

// Global initialization function
window.initNewsletterWidget = function(options) {
    return new NewsletterWidget(options);
};

// Auto-detect role and initialize if TalkTime auth is available
document.addEventListener('DOMContentLoaded', function() {
    // Don't auto-initialize on admin pages or call pages
    if (window.location.pathname.includes('/admin/') ||
        window.location.pathname.includes('/call.html')) {
        return;
    }

    // Wait a bit for auth to be ready
    setTimeout(() => {
        // Only show for authenticated users
        if (!window.TalkTimeAuth || !window.TalkTimeAuth.isAuthenticated()) {
            console.log('Newsletter widget: User not authenticated, not showing');
            return;
        }

        let role = 'visitor';
        let user = null;

        // Detect role from TalkTime auth
        if (window.TalkTimeAuth) {
            user = window.TalkTimeAuth.getUser();
            if (user && user.role) {
                role = user.role;
            }
        }

        // Check if user has already subscribed
        const subscriptionKey = `newsletter_subscribed_${role}`;
        const isSubscribed = localStorage.getItem(subscriptionKey) === 'true';

        if (isSubscribed) {
            console.log('Newsletter widget: User already subscribed, not showing');
            return;
        }

        // Initialize widget for authenticated, non-subscribed users
        window.newsletterWidget = new NewsletterWidget({
            role: role,
            user: user,
            placement: 'floating',
            delay: 5000, // Show after 5 seconds for logged-in users
            scrollTrigger: 0.3 // 30% scroll for logged-in users
        });
    }, 1000); // Wait 1 second for auth to initialize
});
