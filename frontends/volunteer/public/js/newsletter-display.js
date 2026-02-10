/**
 * Newsletter Display Component - Fetches and displays Mailchimp campaigns
 */

class NewsletterDisplay {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.currentIndex = 0;
        this.newsletters = [];
        this.isLoading = false;
    }

    async init() {
        await this.fetchNewsletters();
        this.renderNewsletters();
        this.setupCarousel();
    }

    async fetchNewsletters() {
        this.isLoading = true;
        try {
            // Check if user is authenticated
            let headers = {
                'Content-Type': 'application/json'
            };

            if (window.TalkTimeAuth && window.TalkTimeAuth.isAuthenticated()) {
                const token = window.TalkTimeAuth.getToken();
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
            }

            const response = await fetch('/api/v1/mailchimp/campaigns/recent?limit=10&status=sent', {
                method: 'GET',
                headers: headers
            });

            const data = await response.json();

            if (data.success && data.campaigns) {
                // Transform Mailchimp campaigns to newsletter format
                this.newsletters = await Promise.all(data.campaigns.map(async (campaign, index) => {
                    // Try to fetch campaign content for preview
                    let preview = campaign.subject || 'Newsletter Update';
                    let imageUrl = `/volunteer/kids-in-school.jpg`; // Default image

                    // Rotate through available images for visual variety
                    const images = [
                        '/volunteer/kids-in-school.jpg',
                        '/volunteer/shanga.png',
                        '/volunteer/black-maasai.png',
                        '/volunteer/kilimanjaro.jpg'
                    ];
                    imageUrl = images[index % images.length];

                    return {
                        id: campaign.id,
                        title: campaign.subject || 'Newsletter Update',
                        preview: this.extractPreview(campaign),
                        date: this.formatDate(campaign.sendTime),
                        imageUrl: imageUrl,
                        emailsSent: campaign.emailsSent,
                        openRate: campaign.openRate,
                        clickRate: campaign.clickRate
                    };
                }));
            } else {
                // Fallback to default newsletters if API fails
                this.newsletters = this.getDefaultNewsletters();
            }
        } catch (error) {
            console.error('Error fetching newsletters:', error);
            // Fallback to default newsletters
            this.newsletters = this.getDefaultNewsletters();
        } finally {
            this.isLoading = false;
        }
    }

    extractPreview(campaign) {
        // Extract a preview from campaign data
        // This could be enhanced by fetching actual content if needed
        const defaultPreview = `Stay connected with the latest updates from our community. This newsletter brings you stories of impact and progress.`;

        // You could enhance this by actually fetching campaign content:
        // const content = await this.fetchCampaignContent(campaign.id);

        return defaultPreview;
    }

    formatDate(dateString) {
        if (!dateString) return 'Recent';
        const date = new Date(dateString);
        const options = { month: 'short', day: 'numeric', year: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    }

    getDefaultNewsletters() {
        // Fallback newsletters when API is unavailable
        return [
            {
                id: '1',
                title: 'NOW IS THE TIME FOR PRACTICALS',
                preview: `Hello, and welcome to the Time of Maasai! We've been training 20 of the smartest kids but if the Maasai Issue is challenging to remember, you can call me Philip...`,
                date: 'Recent',
                imageUrl: '/volunteer/kids-in-school.jpg'
            },
            {
                id: '2',
                title: 'MEET OUR "BEADS FOR FEES" LEADERS AND TEACHERS',
                preview: `Hope from 10 women who lead our Beads for Fees program. Our maternal and grandmother mothers (and some fathers) at this postnatal Maasai Items to participate in supporting their children...`,
                date: 'Recent',
                imageUrl: '/volunteer/shanga.png'
            },
            {
                id: '3',
                title: 'IT IS TIME TO HEAD BACK TO ROMBO, KENYA',
                preview: `We are in Nairobi to Kenya, where I'll be spending the rest of March. Last week, I took the CREW of recreational students for lunch within Unga Community. Last year, everyone was looking for work in Rombo AREA!`,
                date: 'Recent',
                imageUrl: '/volunteer/black-maasai.png'
            }
        ];
    }

    renderNewsletters() {
        if (!this.container) return;

        if (this.isLoading) {
            this.container.innerHTML = this.getLoadingHTML();
            return;
        }

        const newsletterHTML = this.newsletters.map((newsletter, index) => `
            <div class="flex-none w-full md:w-1/3 newsletter-item" data-index="${index}">
                <div class="bg-white border border-gray-300 overflow-hidden h-[380px] flex flex-col hover:shadow-lg transition-shadow cursor-pointer" onclick="newsletterDisplay.viewNewsletter('${newsletter.id}')">
                    <div class="p-6 pb-0">
                        <img src="${newsletter.imageUrl}" alt="${newsletter.title}" class="w-full h-48 object-cover" onerror="this.src='/volunteer/kids-in-school.jpg'">
                    </div>
                    <div class="p-6 flex-1 flex flex-col">
                        <div class="flex justify-between items-start mb-2">
                            <h3 class="font-bold text-lg text-gray-900 line-clamp-2 flex-1">${newsletter.title}</h3>
                        </div>
                        <p class="text-gray-500 text-xs mb-2">${newsletter.date}</p>
                        <p class="text-gray-600 text-sm line-clamp-3 flex-1">${newsletter.preview}</p>
                        ${newsletter.openRate ? `
                            <div class="mt-3 pt-3 border-t border-gray-100 flex gap-4 text-xs text-gray-500">
                                <span><i class="fas fa-envelope-open mr-1"></i> ${Math.round(newsletter.openRate * 100)}% opened</span>
                                ${newsletter.clickRate ? `<span><i class="fas fa-mouse-pointer mr-1"></i> ${Math.round(newsletter.clickRate * 100)}% clicked</span>` : ''}
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `).join('');

        // Duplicate items for infinite scroll effect if we have less than 4 items
        let finalHTML = newsletterHTML;
        if (this.newsletters.length < 4) {
            finalHTML = newsletterHTML + newsletterHTML;
        }

        this.container.innerHTML = finalHTML;
    }

    getLoadingHTML() {
        return `
            <div class="flex-none w-full md:w-1/3">
                <div class="bg-white border border-gray-300 overflow-hidden h-[380px] flex flex-col animate-pulse">
                    <div class="p-6 pb-0">
                        <div class="w-full h-48 bg-gray-200"></div>
                    </div>
                    <div class="p-6 flex-1 flex flex-col">
                        <div class="h-6 bg-gray-200 rounded w-3/4 mb-3"></div>
                        <div class="h-4 bg-gray-200 rounded w-full mb-2"></div>
                        <div class="h-4 bg-gray-200 rounded w-5/6"></div>
                    </div>
                </div>
            </div>
            <div class="flex-none w-full md:w-1/3 hidden md:block">
                <div class="bg-white border border-gray-300 overflow-hidden h-[380px] flex flex-col animate-pulse">
                    <div class="p-6 pb-0">
                        <div class="w-full h-48 bg-gray-200"></div>
                    </div>
                    <div class="p-6 flex-1 flex flex-col">
                        <div class="h-6 bg-gray-200 rounded w-3/4 mb-3"></div>
                        <div class="h-4 bg-gray-200 rounded w-full mb-2"></div>
                        <div class="h-4 bg-gray-200 rounded w-5/6"></div>
                    </div>
                </div>
            </div>
            <div class="flex-none w-full md:w-1/3 hidden md:block">
                <div class="bg-white border border-gray-300 overflow-hidden h-[380px] flex flex-col animate-pulse">
                    <div class="p-6 pb-0">
                        <div class="w-full h-48 bg-gray-200"></div>
                    </div>
                    <div class="p-6 flex-1 flex flex-col">
                        <div class="h-6 bg-gray-200 rounded w-3/4 mb-3"></div>
                        <div class="h-4 bg-gray-200 rounded w-full mb-2"></div>
                        <div class="h-4 bg-gray-200 rounded w-5/6"></div>
                    </div>
                </div>
            </div>
        `;
    }

    setupCarousel() {
        const prevBtn = document.getElementById('newsletter-prev');
        const nextBtn = document.getElementById('newsletter-next');

        if (!prevBtn || !nextBtn) return;

        prevBtn.addEventListener('click', () => this.previousSlide());
        nextBtn.addEventListener('click', () => this.nextSlide());

        // Setup touch/swipe support for mobile
        let touchStartX = 0;
        let touchEndX = 0;

        this.container.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        });

        this.container.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            this.handleSwipe();
        });

        this.handleSwipe = () => {
            if (touchEndX < touchStartX - 50) {
                this.nextSlide();
            }
            if (touchEndX > touchStartX + 50) {
                this.previousSlide();
            }
        };

        // Auto-refresh newsletters every 5 minutes
        setInterval(() => this.fetchNewsletters().then(() => this.renderNewsletters()), 5 * 60 * 1000);
    }

    previousSlide() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.updateCarousel();
        }
    }

    nextSlide() {
        const maxIndex = window.innerWidth < 768 ? this.newsletters.length - 1 : Math.max(0, this.newsletters.length - 3);
        if (this.currentIndex < maxIndex) {
            this.currentIndex++;
            this.updateCarousel();
        }
    }

    updateCarousel() {
        const itemWidth = window.innerWidth < 768 ? 100 : 100 / 3;
        const offset = this.currentIndex * itemWidth;
        this.container.style.transform = `translateX(-${offset}%)`;
    }

    async viewNewsletter(campaignId) {
        // Optional: Implement newsletter viewing functionality
        console.log('Viewing newsletter:', campaignId);

        // You could open a modal or redirect to a dedicated view
        // For now, we'll just log it
        try {
            const headers = {
                'Content-Type': 'application/json'
            };

            if (window.TalkTimeAuth && window.TalkTimeAuth.isAuthenticated()) {
                const token = window.TalkTimeAuth.getToken();
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
            }

            const response = await fetch(`/api/v1/mailchimp/campaigns/${campaignId}/content`, {
                headers: headers
            });

            const data = await response.json();

            if (data.success && data.content) {
                // Could display in a modal
                console.log('Newsletter content loaded:', data.content);
            }
        } catch (error) {
            console.error('Error loading newsletter content:', error);
        }
    }

    // Method to manually refresh newsletters
    async refresh() {
        await this.fetchNewsletters();
        this.renderNewsletters();
        this.currentIndex = 0;
        this.updateCarousel();
    }
}

// Initialize on page load
let newsletterDisplay;
document.addEventListener('DOMContentLoaded', () => {
    const carousel = document.getElementById('newsletter-carousel');
    if (carousel) {
        newsletterDisplay = new NewsletterDisplay('newsletter-carousel');
        newsletterDisplay.init();
    }
});

// Export for global access
window.NewsletterDisplay = NewsletterDisplay;