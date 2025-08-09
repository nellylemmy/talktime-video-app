/**
 * Approval Status Component
 * Displays parental approval status and volunteer privileges
 */

class ApprovalStatusComponent {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.userInfo = null;
    }

    /**
     * Initialize the component with user information
     * @param {Object} userInfo - User information from auth check
     */
    async init(userInfo) {
        this.userInfo = userInfo;
        await this.render();
        this.attachEventListeners();
    }

    /**
     * Fetch approval status from backend
     */
    async fetchApprovalStatus() {
        if (!this.userInfo || !this.userInfo.id) return null;

        try {
            const response = await fetch(`/api/v1/auth/approval-status/${this.userInfo.id}`, {
                credentials: 'include'
            });

            if (response.ok) {
                const data = await response.json();
                return data;
            }
        } catch (error) {
            console.error('Error fetching approval status:', error);
        }
        return null;
    }

    /**
     * Request parental approval resend
     */
    async resendApprovalRequest() {
        if (!this.userInfo || !this.userInfo.id) return;

        try {
            const response = await fetch('/api/v1/auth/request-parental-approval', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    userId: this.userInfo.id
                })
            });

            const data = await response.json();

            if (data.success) {
                // Show success notification
                if (window.showNotification) {
                    window.showNotification(
                        'Parental approval request sent successfully!',
                        'success',
                        {
                            title: 'Request Sent',
                            duration: 5000
                        }
                    );
                }
                
                // Re-render to update status
                await this.render();
            } else {
                throw new Error(data.error || 'Failed to send approval request');
            }
        } catch (error) {
            console.error('Error resending approval request:', error);
            if (window.showNotification) {
                window.showNotification(
                    error.message || 'Failed to send approval request',
                    'error',
                    {
                        title: 'Request Failed',
                        autoClose: false
                    }
                );
            }
        }
    }

    /**
     * Render the approval status component
     */
    async render() {
        if (!this.container || !this.userInfo) return;

        // Get approval status if user is under 18
        let approvalStatus = null;
        if (this.userInfo.is_under_18) {
            approvalStatus = await this.fetchApprovalStatus();
        }

        const isStudentVolunteer = this.userInfo.volunteer_type === 'student_volunteer';
        const isUnder18 = this.userInfo.is_under_18;
        const needsApproval = approvalStatus?.needsApproval || false;
        const isApproved = approvalStatus?.isApproved || false;
        const isPending = approvalStatus?.isPending || false;

        let statusHTML = '';

        // Student Volunteer Privileges Section
        if (isStudentVolunteer) {
            statusHTML += `
                <div class="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-4 mb-4">
                    <div class="flex items-center mb-3">
                        <div class="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center mr-3">
                            <i class="fas fa-graduation-cap text-white text-sm"></i>
                        </div>
                        <h3 class="text-lg font-semibold text-purple-800">Student Volunteer Program</h3>
                        <span class="ml-auto bg-purple-100 text-purple-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                            Enhanced Benefits
                        </span>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div class="flex items-center text-purple-700">
                            <i class="fas fa-check-circle text-green-500 mr-2"></i>
                            Community service documentation
                        </div>
                        <div class="flex items-center text-purple-700">
                            <i class="fas fa-check-circle text-green-500 mr-2"></i>
                            Official participation certificates
                        </div>
                        <div class="flex items-center text-purple-700">
                            <i class="fas fa-check-circle text-green-500 mr-2"></i>
                            Enhanced impact tracking
                        </div>
                        <div class="flex items-center text-purple-700">
                            <i class="fas fa-check-circle text-green-500 mr-2"></i>
                            School-recognized volunteer hours
                        </div>
                    </div>
                </div>
            `;
        }

        // Parental Approval Status Section
        if (isUnder18) {
            if (isApproved) {
                // Approved status
                statusHTML += `
                    <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                        <div class="flex items-center">
                            <div class="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center mr-3">
                                <i class="fas fa-check text-white text-sm"></i>
                            </div>
                            <div class="flex-1">
                                <h3 class="text-lg font-semibold text-green-800">Parental Approval Confirmed</h3>
                                <p class="text-green-600 text-sm mt-1">
                                    Your parent/guardian has approved your participation in TalkTime. 
                                    You have full access to all volunteer features!
                                </p>
                            </div>
                            <div class="text-green-500 text-2xl">
                                <i class="fas fa-check-circle"></i>
                            </div>
                        </div>
                    </div>
                `;
            } else if (isPending) {
                // Pending approval status
                statusHTML += `
                    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                        <div class="flex items-center">
                            <div class="w-8 h-8 bg-yellow-500 rounded-full flex items-center justify-center mr-3">
                                <i class="fas fa-clock text-white text-sm"></i>
                            </div>
                            <div class="flex-1">
                                <h3 class="text-lg font-semibold text-yellow-800">Parental Approval Pending</h3>
                                <p class="text-yellow-700 text-sm mt-1">
                                    We've sent an approval request to your parent/guardian. 
                                    You can use all features while waiting for approval.
                                </p>
                                ${approvalStatus?.parentContact?.email ? `
                                    <p class="text-yellow-600 text-xs mt-2">
                                        Sent to: ${approvalStatus.parentContact.email}
                                        ${approvalStatus?.sentAt ? ` on ${new Date(approvalStatus.sentAt).toLocaleDateString()}` : ''}
                                    </p>
                                ` : ''}
                            </div>
                            <div class="flex flex-col items-center">
                                <div class="text-yellow-500 text-xl mb-2">
                                    <i class="fas fa-hourglass-half"></i>
                                </div>
                                <button 
                                    id="resend-approval-btn" 
                                    class="text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-2 py-1 rounded transition-colors"
                                >
                                    Resend Request
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            } else if (needsApproval) {
                // Needs approval but not sent yet
                statusHTML += `
                    <div class="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
                        <div class="flex items-center">
                            <div class="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center mr-3">
                                <i class="fas fa-exclamation text-white text-sm"></i>
                            </div>
                            <div class="flex-1">
                                <h3 class="text-lg font-semibold text-orange-800">Parental Approval Required</h3>
                                <p class="text-orange-700 text-sm mt-1">
                                    Since you're under 18, we need your parent/guardian's approval. 
                                    You can still use all features while we process this.
                                </p>
                            </div>
                            <div class="flex flex-col items-center">
                                <div class="text-orange-500 text-xl mb-2">
                                    <i class="fas fa-user-shield"></i>
                                </div>
                                <button 
                                    id="request-approval-btn" 
                                    class="text-xs bg-orange-100 hover:bg-orange-200 text-orange-800 px-2 py-1 rounded transition-colors"
                                >
                                    Send Request
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        // Standard Volunteer Features (shown to all)
        if (!isStudentVolunteer) {
            statusHTML += `
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <div class="flex items-center mb-3">
                        <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-3">
                            <i class="fas fa-heart text-white text-sm"></i>
                        </div>
                        <h3 class="text-lg font-semibold text-blue-800">Volunteer Features</h3>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        <div class="flex items-center text-blue-700">
                            <i class="fas fa-check-circle text-green-500 mr-2"></i>
                            Schedule conversations with students
                        </div>
                        <div class="flex items-center text-blue-700">
                            <i class="fas fa-check-circle text-green-500 mr-2"></i>
                            Flexible meeting times
                        </div>
                        <div class="flex items-center text-blue-700">
                            <i class="fas fa-check-circle text-green-500 mr-2"></i>
                            Cultural exchange opportunities
                        </div>
                        <div class="flex items-center text-blue-700">
                            <i class="fas fa-check-circle text-green-500 mr-2"></i>
                            Make a positive impact
                        </div>
                    </div>
                </div>
            `;
        }

        this.container.innerHTML = statusHTML;
    }

    /**
     * Attach event listeners to interactive elements
     */
    attachEventListeners() {
        const resendBtn = document.getElementById('resend-approval-btn');
        const requestBtn = document.getElementById('request-approval-btn');

        if (resendBtn) {
            resendBtn.addEventListener('click', () => this.resendApprovalRequest());
        }

        if (requestBtn) {
            requestBtn.addEventListener('click', () => this.resendApprovalRequest());
        }
    }

    /**
     * Update the component with new user information
     * @param {Object} userInfo - Updated user information
     */
    async update(userInfo) {
        this.userInfo = userInfo;
        await this.render();
        this.attachEventListeners();
    }
}

// Export for use in other modules
window.ApprovalStatusComponent = ApprovalStatusComponent;
