
        // Initialize authentication and load profile data
        let currentUser = null;
        let profileData = null;

        async function initializePage() {
            console.log('Initializing profile page...');
            
            // Wait for TalkTimeAuth to be available
            let attempts = 0;
            while (!window.TalkTimeAuth && attempts < 50) {
                await new Promise(resolve => setTimeout(resolve, 100));
                attempts++;
            }
            
            if (!window.TalkTimeAuth) {
                console.error('TalkTimeAuth not available');
                window.location.href = '/volunteer/login';
                return;
            }
            
            // Check authentication
            if (!window.TalkTimeAuth.isAuthenticated()) {
                window.location.href = '/volunteer/login';
                return;
            }
            
            try {
                // No separate verifyToken round-trip: the profile request itself
                // returns 401 (and redirects) if the token is invalid
                currentUser = window.TalkTimeAuth.getUser();
                await loadProfileData();

            } catch (error) {
                console.error('Authentication error:', error);
                window.location.href = '/volunteer/login';
            }
        }

        async function loadProfileData() {
            try {
                // Load basic profile data
                const response = await window.TalkTimeAuth.authenticatedRequest('/api/v1/volunteers/profile', {
                    method: 'GET'
                });

                if (!response.ok) {
                    throw new Error('Failed to load profile data');
                }

                const responseData = await response.json();

                // Extract profile from response - backend returns { success: true, profile: {...} }
                profileData = responseData.profile || responseData;

                // Fix field name mismatch - backend returns profileImage, frontend expects profile_image
                profileData.profile_image = profileData.profileImage;

                console.log('Profile data loaded:', profileData);
                console.log('Profile image URL:', profileData.profile_image);

                renderProfile();

                // Credits, completion, and performance are independent - load in parallel
                const wantsCredits = !!profileData.isStudentVolunteer;
                await Promise.all([
                    wantsCredits ? loadCreditData() : Promise.resolve(),
                    loadProfileCompletion(),
                    loadPerformanceData()
                ]);
                if (wantsCredits) {
                    // Re-render now that profileData.credits is populated
                    renderProfile();
                }

            } catch (error) {
                console.error('Error loading profile data:', error);
                showErrorMessage('Failed to load profile data');
            }
        }

        async function loadCreditData() {
            try {
                const response = await window.TalkTimeAuth.authenticatedRequest('/api/v1/volunteer/credits', {
                    method: 'GET'
                });

                if (response.ok) {
                    const creditData = await response.json();
                    profileData.credits = creditData;
                }
            } catch (error) {
                console.error('Error loading credit data:', error);
            }
        }

        async function loadPerformanceData() {
            try {
                const response = await window.TalkTimeAuth.authenticatedRequest('/api/v1/volunteers/performance', {
                    method: 'GET'
                });

                if (response.ok) {
                    const performanceData = await response.json();
                    profileData.performance = performanceData.performance;
                    renderPerformanceData();
                } else {
                    console.error('Failed to load performance data');
                    document.getElementById('performance-dashboard-loading').style.display = 'none';
                }
            } catch (error) {
                console.error('Error loading performance data:', error);
                document.getElementById('performance-dashboard-loading').style.display = 'none';
            }
        }

        function renderPerformanceData() {
            const performance = profileData.performance;
            if (!performance) return;

            document.getElementById('performance-dashboard-loading').classList.add('hidden');
            document.getElementById('performance-dashboard-content').classList.remove('hidden');

            // Score + success rate
            document.getElementById('reputation-score-large').textContent = performance.reputationScore;
            document.getElementById('success-rate-display').textContent = performance.successRate + '% success';
            document.getElementById('success-rate-bar').style.width = performance.successRate + '%';

            // All-time breakdown
            document.getElementById('completed-calls-detail').textContent = performance.completedCalls;
            document.getElementById('cancelled-calls-detail').textContent = performance.cancelledCalls;
            document.getElementById('missed-calls-detail').textContent = performance.missedCalls;

            const total = Math.max(performance.totalScheduled, 1);
            document.getElementById('completed-bar').style.width = (performance.completedCalls / total * 100) + '%';
            document.getElementById('cancelled-bar').style.width = (performance.cancelledCalls / total * 100) + '%';
            document.getElementById('missed-bar').style.width = (performance.missedCalls / total * 100) + '%';

            // Last 30 days
            document.getElementById('recent-completed').textContent = performance.recentCompleted;
            document.getElementById('recent-cancelled').textContent = performance.recentCancelled;
            document.getElementById('recent-missed').textContent = performance.recentMissed;

            // Trend
            const trendIcon = document.getElementById('trend-icon');
            const trendText = document.getElementById('trend-text');
            switch (performance.performanceTrend) {
                case 'improving':
                    trendIcon.className = 'fas fa-arrow-up text-green-500 text-sm';
                    trendText.textContent = 'Improving';
                    trendText.className = 'text-xs font-medium text-success';
                    break;
                case 'declining':
                    trendIcon.className = 'fas fa-arrow-down text-red-500 text-sm';
                    trendText.textContent = 'Declining';
                    trendText.className = 'text-xs font-medium text-error';
                    break;
                default:
                    trendIcon.className = 'fas fa-arrow-right text-gray-400 text-sm';
                    trendText.textContent = 'Stable';
                    trendText.className = 'text-xs font-medium text-gray-500';
            }

            // Warning
            if (performance.warningStatus !== 'none') {
                document.getElementById('warning-system').classList.remove('hidden');
                let cardClass;
                switch (performance.warningStatus) {
                    case 'critical':
                    case 'severe':
                        cardClass = 'bg-red-50 border border-red-200'; break;
                    case 'moderate':
                        cardClass = 'bg-yellow-50 border border-yellow-200'; break;
                    case 'minor':
                        cardClass = 'bg-blue-50 border border-blue-200'; break;
                }
                document.getElementById('warning-card').className = `rounded-lg p-3 ${cardClass}`;
                document.getElementById('warning-message-full').textContent = performance.warningMessage;
                if (performance.isRestricted) {
                    document.getElementById('restriction-notice').classList.remove('hidden');
                }
            }
        }

        function renderProfile() {
            // Hide loading spinner and show content
            document.getElementById('loading-spinner').classList.add('hidden');
            document.getElementById('profile-content').classList.remove('hidden');
            
            // Update profile header
            const fullName = profileData.fullName || profileData.full_name || currentUser.full_name || currentUser.fullName || 'Volunteer';
            const email = profileData.volunteer?.email || profileData.email || currentUser.email || '';
            const volunteer = profileData.volunteer || profileData;
            
            // Populate Basic Info tab fields with null checks
            const setElementValue = (id, value) => {
                const element = document.getElementById(id);
                if (element) {
                    element.value = value || '';
                } else {
                    console.warn(`Element with ID '${id}' not found`);
                }
            };
            
            setElementValue('edit-username', profileData.username || volunteer.username);
            setElementValue('edit-name', fullName);
            setElementValue('edit-email', email);
            setElementValue('edit-age', volunteer.age);
            setElementValue('edit-gender', volunteer.gender);
            setElementValue('edit-phone', volunteer.phone);
            // Timezone: if the saved zone is not in the curated list, inject it
            // so setting the select never silently wipes a valid timezone
            const tzSelect = document.getElementById('edit-timezone');
            if (tzSelect && volunteer.timezone && !Array.from(tzSelect.options).some(o => o.value === volunteer.timezone)) {
                const opt = document.createElement('option');
                opt.value = volunteer.timezone;
                opt.textContent = volunteer.timezone.replace(/_/g, ' ');
                tzSelect.appendChild(opt);
            }
            setElementValue('edit-timezone', volunteer.timezone);

            // Populate Security tab fields (questions only, not answers)
            setElementValue('edit-security-question-1', volunteer.securityQuestion1);
            setElementValue('edit-security-question-2', volunteer.securityQuestion2);
            setElementValue('edit-security-question-3', volunteer.securityQuestion3);
            
            // Clear password fields
            setElementValue('edit-current-password', '');
            setElementValue('edit-new-password', '');
            setElementValue('edit-confirm-password', '');
            
            // Show placeholder for security answers if they exist (for privacy)
            const answer1Field = document.getElementById('edit-security-answer-1');
            const answer2Field = document.getElementById('edit-security-answer-2');
            const answer3Field = document.getElementById('edit-security-answer-3');
            
            if (answer1Field) {
                if (profileData.hasSecurityAnswer1) {
                    answer1Field.placeholder = "Answer saved (hidden for security)";
                    answer1Field.value = "";
                } else {
                    answer1Field.placeholder = "Your answer";
                    answer1Field.value = "";
                }
            }
            
            if (answer2Field) {
                if (profileData.hasSecurityAnswer2) {
                    answer2Field.placeholder = "Answer saved (hidden for security)";
                    answer2Field.value = "";
                } else {
                    answer2Field.placeholder = "Your answer";
                    answer2Field.value = "";
                }
            }
            
            if (answer3Field) {
                if (profileData.hasSecurityAnswer3) {
                    answer3Field.placeholder = "Answer saved (hidden for security)";
                    answer3Field.value = "";
                } else {
                    answer3Field.placeholder = "Your answer";
                    answer3Field.value = "";
                }
            }
            
            // Update avatar display
            updateAvatarDisplay();
            
            console.log('Profile loaded - Avatar display updated with image:', profileData.profile_image);
            
            // Show/hide student volunteer tab and populate fields if applicable
            const studentTab = document.getElementById('tab-student');
            if (volunteer.schoolName || volunteer.parentEmail || volunteer.parentPhone) {
                if (studentTab) studentTab.classList.remove('hidden');
                setElementValue('edit-school-name', volunteer.schoolName);
                setElementValue('edit-parent-email', volunteer.parentEmail);
                setElementValue('edit-parent-phone', volunteer.parentPhone);
            } else {
                if (studentTab) studentTab.classList.add('hidden');
            }
            
            // Update profile header display
            const profileNameEl = document.getElementById('profile-name');
            const profileEmailEl = document.getElementById('profile-email');
            
            if (profileNameEl) {
                profileNameEl.firstChild.textContent = fullName;
            }
            if (profileEmailEl) {
                profileEmailEl.textContent = email;
            }
            
            // Update navigation greeting
            const volunteerGreeting = document.getElementById('volunteer-greeting');
            if (volunteerGreeting) {
                const displayName = currentUser.username || fullName.split(' ')[0] || 'Volunteer';
                volunteerGreeting.textContent = `Welcome, ${displayName}!`;
            }
            
            
            // Show/hide student volunteer section
            if (profileData?.isStudentVolunteer || profileData?.credits) {
                const studentSection = document.getElementById('student-volunteer-section');
                if (studentSection) {
                    studentSection.classList.remove('hidden');
                }
                const volunteerTypeText = document.getElementById('volunteer-type-text');
                if (volunteerTypeText) {
                    volunteerTypeText.textContent = 'Student Volunteer';
                }
                const volunteerTypeBadge = document.getElementById('volunteer-type-badge');
                if (volunteerTypeBadge) {
                    volunteerTypeBadge.className = 'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-warning-light text-yellow-800';
                }
                
                // Render credits data if available
                renderCredits();
            }
        }

        function renderCredits() {
            if (!profileData.credits) return;
            
            const credits = profileData.credits;
            document.getElementById('total-credits').textContent = Math.floor(credits.totalMinutes / 60) || 0;
            
            // Only update elements that still exist after UI changes
            const totalMinutesEl = document.getElementById('total-minutes');
            const impactScoreEl = document.getElementById('impact-score');
            
            if (totalMinutesEl) {
                totalMinutesEl.textContent = credits.totalMinutes || 0;
            }
            if (impactScoreEl) {
                impactScoreEl.textContent = credits.impactScore || 0;
            }
            
            // Enable certificate download if user has credits
            const downloadBtn = document.getElementById('download-certificate-btn');
            if (downloadBtn) {
                if (credits.completedCalls > 0) {
                    downloadBtn.disabled = false;
                } else {
                    downloadBtn.disabled = true;
                    downloadBtn.innerHTML = '<i class="fas fa-lock mr-2"></i>Complete calls to unlock';
                }
            }
        }

        function renderRecentActivity() {
            const activityList = document.getElementById('recent-activity-list');
            
            // Placeholder activity data
            const activities = [
                {
                    type: 'call_completed',
                    description: 'Completed call with student',
                    time: '2 hours ago',
                    icon: 'fas fa-phone text-green-500'
                },
                {
                    type: 'profile_updated',
                    description: 'Updated profile information',
                    time: '1 day ago',
                    icon: 'fas fa-user-edit text-brand-primary'
                }
            ];
            
            activityList.innerHTML = activities.map(activity => `
                <div class="flex items-center space-x-4 p-4 bg-white bg-opacity-50 rounded-lg">
                    <div class="flex-shrink-0">
                        <i class="${activity.icon}"></i>
                    </div>
                    <div class="flex-1">
                        <p class="text-gray-800 font-medium">${activity.description}</p>
                        <p class="text-gray-600 text-sm">${activity.time}</p>
                    </div>
                </div>
            `).join('');
        }

        // Certificate functionality
        document.getElementById('preview-certificate-btn').addEventListener('click', async () => {
            await showCertificatePreview();
        });

        document.getElementById('download-certificate-btn').addEventListener('click', async () => {
            await downloadCertificate();
        });

        async function showCertificatePreview() {
            try {
                const response = await window.TalkTimeAuth.authenticatedRequest('/api/v1/volunteer/certificate/preview', {
                    method: 'GET'
                });

                if (!response.ok) {
                    throw new Error('Failed to generate certificate preview');
                }

                const certificateHtml = await response.text();
                document.getElementById('certificate-preview').innerHTML = certificateHtml;
                document.getElementById('certificate-modal').classList.remove('hidden');
                
            } catch (error) {
                console.error('Error previewing certificate:', error);
                showErrorMessage('Failed to preview certificate');
            }
        }

        async function downloadCertificate() {
            try {
                const response = await window.TalkTimeAuth.authenticatedRequest('/api/v1/volunteer/certificate/download', {
                    method: 'GET'
                });

                if (!response.ok) {
                    throw new Error('Failed to download certificate');
                }

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `TalkTime_Certificate_${currentUser.full_name || 'Volunteer'}_${new Date().getFullYear()}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                
            } catch (error) {
                console.error('Error downloading certificate:', error);
                showErrorMessage('Failed to download certificate');
            }
        }

        // Modal controls
        document.getElementById('close-modal-btn').addEventListener('click', () => {
            document.getElementById('certificate-modal').classList.add('hidden');
        });

        // Profile management
        document.getElementById('save-profile-btn').addEventListener('click', async () => {
            // Collect all form data
            const formData = {
                username: document.getElementById('edit-username').value.trim(),
                fullName: document.getElementById('edit-name').value.trim(),
                age: document.getElementById('edit-age').value,
                gender: document.getElementById('edit-gender').value,
                phone: document.getElementById('edit-phone').value.trim()
            };
            // Never send an empty timezone - that would wipe a valid saved zone
            const tzValue = document.getElementById('edit-timezone').value;
            if (tzValue) formData.timezone = tzValue;
            
            // Add student volunteer fields if visible
            const studentVolunteerFields = document.getElementById('content-student');
            if (studentVolunteerFields && !studentVolunteerFields.classList.contains('hidden')) {
                const schoolNameField = document.getElementById('edit-school-name');
                const parentEmailField = document.getElementById('edit-parent-email');
                const parentPhoneField = document.getElementById('edit-parent-phone');
                
                if (schoolNameField) formData.schoolName = schoolNameField.value.trim();
                if (parentEmailField) formData.parentEmail = parentEmailField.value.trim();
                if (parentPhoneField) formData.parentPhone = parentPhoneField.value.trim();
            }
            
            // Add security questions and answers
            const securityQ1Element = document.getElementById('edit-security-question-1');
            const securityA1Element = document.getElementById('edit-security-answer-1');
            const securityQ2Element = document.getElementById('edit-security-question-2');
            const securityA2Element = document.getElementById('edit-security-answer-2');
            const securityQ3Element = document.getElementById('edit-security-question-3');
            const securityA3Element = document.getElementById('edit-security-answer-3');
            
            const securityQ1 = securityQ1Element ? securityQ1Element.value : '';
            const securityA1 = securityA1Element ? securityA1Element.value.trim() : '';
            const securityQ2 = securityQ2Element ? securityQ2Element.value : '';
            const securityA2 = securityA2Element ? securityA2Element.value.trim() : '';
            const securityQ3 = securityQ3Element ? securityQ3Element.value : '';
            const securityA3 = securityA3Element ? securityA3Element.value.trim() : '';
            
            if (securityQ1) {
                formData.securityQuestion1 = securityQ1;
                if (securityA1) formData.securityAnswer1 = securityA1;
            }
            if (securityQ2) {
                formData.securityQuestion2 = securityQ2;
                if (securityA2) formData.securityAnswer2 = securityA2;
            }
            if (securityQ3) {
                formData.securityQuestion3 = securityQ3;
                if (securityA3) formData.securityAnswer3 = securityA3;
            }
            
            // Handle password change validation
            const currentPassword = document.getElementById('edit-current-password').value;
            const newPassword = document.getElementById('edit-new-password').value;
            const confirmPassword = document.getElementById('edit-confirm-password').value;
            
            if (newPassword || currentPassword || confirmPassword) {
                if (!currentPassword) {
                    showErrorMessage('Current password is required to change password');
                    return;
                }
                if (!newPassword) {
                    showErrorMessage('New password is required');
                    return;
                }
                if (newPassword !== confirmPassword) {
                    showErrorMessage('New passwords do not match');
                    return;
                }
                if (newPassword.length < 8) {
                    showErrorMessage('New password must be at least 8 characters long');
                    return;
                }
                
                formData.currentPassword = currentPassword;
                formData.newPassword = newPassword;
            }
            
            // Validate required fields (compulsory fields that cannot be blank)
            const requiredFields = [
                { field: 'fullName', name: 'Full name' },
                { field: 'age', name: 'Age' },
                { field: 'gender', name: 'Gender' }
            ];
            
            for (const { field, name } of requiredFields) {
                if (!formData[field] || formData[field].toString().trim() === '') {
                    showErrorMessage(`${name} is required and cannot be left blank`);
                    return;
                }
            }
            
            // Validate age is a number and within reasonable range
            const age = parseInt(formData.age);
            if (isNaN(age) || age < 13 || age > 100) {
                showErrorMessage('Please enter a valid age between 13 and 100');
                return;
            }
            
            // Validate email format if provided (optional field but must be valid if filled)
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (formData.parentEmail && !emailRegex.test(formData.parentEmail)) {
                showErrorMessage('Please enter a valid parent email address');
                return;
            }
            
            // Validate phone format if provided (optional but must be valid if filled)
            const phoneRegex = /^[\d\s\+\-\(\)]+$/;
            if (formData.phone && formData.phone.length > 0 && !phoneRegex.test(formData.phone)) {
                showErrorMessage('Please enter a valid phone number');
                return;
            }
            if (formData.parentPhone && formData.parentPhone.length > 0 && !phoneRegex.test(formData.parentPhone)) {
                showErrorMessage('Please enter a valid parent phone number');
                return;
            }
            
            try {
                const response = await window.TalkTimeAuth.authenticatedRequest('/api/v1/volunteers/profile', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(formData)
                });

                if (response.ok) {
                    const updatedProfile = await response.json();
                    console.log('Profile update successful, exiting edit mode...');
                    
                    showSuccessMessage('Profile updated successfully');
                    
                    // Update local data
                    Object.assign(profileData, updatedProfile.volunteer);
                    currentUser.full_name = formData.fullName;
                    
                    // Reload profile completion to reflect changes
                    await loadProfileCompletion();
                    
                    // Exit edit mode
                    const editBtn = document.getElementById('edit-profile-btn');
                    const container = document.getElementById('save-cancel-buttons');

                    if (editBtn && container) {
                        editBtn.classList.remove('hidden');
                        container.classList.add('hidden');
                        container.classList.remove('flex');
                        setFormEditable(false);
                    }
                    
                    // Update the display name (preserve the check icon child)
                    const profileNameElement = document.getElementById('profile-name');
                    if (profileNameElement) {
                        profileNameElement.firstChild.textContent = formData.fullName;
                    }
                    
                    // Update navigation greeting if it exists
                    const volunteerGreeting = document.getElementById('volunteer-greeting');
                    if (volunteerGreeting) {
                        const displayName = formData.fullName.split(' ')[0] || 'Volunteer';
                        volunteerGreeting.textContent = `Welcome, ${displayName}!`;
                    }
                } else {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to update profile');
                }
                
            } catch (error) {
                console.error('Error updating profile:', error);
                showErrorMessage(error.message || 'Failed to update profile');
            }
        });

        // Toggle all form fields enabled/disabled
        function setFormEditable(enabled) {
            document.querySelectorAll('.profile-field').forEach(field => {
                field.disabled = !enabled;
            });
        }

        // Edit Profile button functionality
        document.getElementById('edit-profile-btn').addEventListener('click', () => {
            const editBtn = document.getElementById('edit-profile-btn');
            const container = document.getElementById('save-cancel-buttons');

            if (editBtn && container) {
                editBtn.classList.add('hidden');
                container.classList.remove('hidden');
                container.classList.add('flex');
                setFormEditable(true);
            }
        });

        // Cancel button functionality
        document.getElementById('cancel-profile-btn').addEventListener('click', () => {
            const editBtn = document.getElementById('edit-profile-btn');
            const container = document.getElementById('save-cancel-buttons');

            if (editBtn && container) {
                editBtn.classList.remove('hidden');
                container.classList.add('hidden');
                container.classList.remove('flex');
                setFormEditable(false);
            }

            // Reset form to original values
            renderProfile();
            showSuccessMessage('Changes cancelled');
        });

        function showErrorMessage(message) {
            // Simple toast notification
            const toast = document.createElement('div');
            toast.className = 'fixed top-4 right-4 bg-error text-white px-6 py-3 rounded-lg shadow-lg z-50';
            toast.textContent = message;
            document.body.appendChild(toast);
            
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 3000);
        }

        function showSuccessMessage(message) {
            const toast = document.createElement('div');
            toast.className = 'fixed top-4 right-4 bg-success text-white px-6 py-3 rounded-lg shadow-lg z-50';
            toast.textContent = message;
            document.body.appendChild(toast);
            
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 3000);
        }

        // Profile Completion Functionality
        async function loadProfileCompletion() {
            try {
                const response = await window.TalkTimeAuth.authenticatedRequest('/api/v1/volunteers/profile/completion', {
                    method: 'GET'
                });

                if (response.ok) {
                    const completionData = await response.json();
                    renderProfileCompletion(completionData);
                } else {
                    console.error('Failed to load profile completion');
                }
            } catch (error) {
                console.error('Error loading profile completion:', error);
            }
        }

        function renderProfileCompletion(data) {
            const percentage = data.completionPercentage || 0;
            const completionSection = document.getElementById('completion-section');
            const checkIcon = document.getElementById('profile-complete-check');

            if (percentage === 100) {
                // 100% — hide entire completion section, show green check next to name
                if (completionSection) completionSection.style.display = 'none';
                if (checkIcon) checkIcon.classList.remove('hidden');
            } else {
                // < 100% — show progress bar, hide check icon
                if (completionSection) completionSection.style.display = '';
                if (checkIcon) checkIcon.classList.add('hidden');

                const percentageEl = document.getElementById('completion-percentage');
                if (percentageEl) {
                    percentageEl.textContent = `${percentage}%`;
                    percentageEl.className = percentage >= 75
                        ? 'text-sm font-bold text-brand-primary whitespace-nowrap'
                        : percentage >= 50
                            ? 'text-sm font-bold text-warning whitespace-nowrap'
                            : 'text-sm font-bold text-gray-600 whitespace-nowrap';
                }

                const progressBar = document.getElementById('completion-progress-bar');
                if (progressBar) {
                    progressBar.style.width = `${percentage}%`;
                    if (percentage >= 75) {
                        progressBar.style.background = '#D10100';
                    } else if (percentage >= 50) {
                        progressBar.style.background = '#eab308';
                    } else {
                        progressBar.style.background = '#9ca3af';
                    }
                }

                const fieldsCompleted = document.getElementById('fields-completed');
                if (fieldsCompleted) {
                    const labels = {
                        full_name: 'Full name', email: 'Email', age: 'Age', gender: 'Gender',
                        phone: 'Phone number', timezone: 'Timezone', profile_image: 'Profile photo'
                    };
                    const missing = (data.incompleteFields || []).map(f => labels[f] || f.replace(/_/g, ' '));
                    fieldsCompleted.textContent = missing.length
                        ? `${data.completedFields || 0} of ${data.totalFields || 0} done. Missing: ${missing.join(', ')}`
                        : `${data.completedFields || 0} of ${data.totalFields || 0} fields completed`;
                }
            }
        }

        function getCategoryColor(category) {
            const colors = {
                'required': 'red',
                'basic': 'blue', 
                'profile': 'purple',
                'security': 'green',
                'student': 'yellow'
            };
            return colors[category] || 'gray';
        }

        // Modal Image Upload Functionality
        function initializeImageUploadModal() {
            const avatarTrigger = document.getElementById('avatar-upload-trigger');
            const modal = document.getElementById('imageUploadModal');
            const modalContent = document.getElementById('imageUploadModalContent');
            const closeBtn = document.getElementById('closeImageModal');
            const cancelBtn = document.getElementById('modalCancelBtn');
            const dropZone = document.getElementById('modalImageDropZone');
            const fileInput = document.getElementById('modalProfileImageInput');
            const removeBtn = document.getElementById('modalRemoveImageBtn');
            
            // Open modal when avatar is clicked
            avatarTrigger.addEventListener('click', (e) => {
                e.preventDefault();
                openImageUploadModal();
            });
            
            // Close modal handlers
            closeBtn.addEventListener('click', closeImageUploadModal);
            cancelBtn.addEventListener('click', closeImageUploadModal);
            
            // Close modal when clicking outside
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeImageUploadModal();
                }
            });
            
            // Prevent modal content click from closing modal
            modalContent.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            
            // Drop zone click to browse
            dropZone.addEventListener('click', () => {
                fileInput.click();
            });
            
            // Drag and drop handlers
            dropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropZone.classList.add('border-brand', 'bg-brand-primary');
            });
            
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('border-brand', 'bg-brand-primary');
            });
            
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('border-brand', 'bg-brand-primary');
                
                const files = e.dataTransfer.files;
                if (files.length > 0) {
                    handleModalImageUpload(files[0]);
                }
            });
            
            // File input change
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    handleModalImageUpload(e.target.files[0]);
                }
            });
            
            // Remove image
            removeBtn.addEventListener('click', () => {
                removeProfileImageModal();
            });
        }
        
        function openImageUploadModal() {
            const modal = document.getElementById('imageUploadModal');
            const modalContent = document.getElementById('imageUploadModalContent');
            
            // Update modal avatar to match current profile
            updateModalAvatar();
            
            // Show modal
            modal.classList.remove('hidden');
            setTimeout(() => {
                modalContent.style.transform = 'scale(1)';
            }, 10);
        }
        
        function closeImageUploadModal() {
            const modal = document.getElementById('imageUploadModal');
            const modalContent = document.getElementById('imageUploadModalContent');
            
            modalContent.style.transform = 'scale(0.95)';
            setTimeout(() => {
                modal.classList.add('hidden');
            }, 200);
        }
        
        function updateModalAvatar() {
            const modalCurrentAvatar = document.getElementById('modalCurrentAvatar');
            const modalProfileImage = document.getElementById('modalProfileImage');
            const removeBtn = document.getElementById('modalRemoveImageBtn');

            if (profileData && profileData.profile_image) {
                // Use the full path returned by backend
                // Backend returns: /uploads/profiles/filename.jpg
                modalProfileImage.src = profileData.profile_image;
                modalProfileImage.classList.remove('hidden');
                modalCurrentAvatar.classList.add('hidden');
                removeBtn.classList.remove('hidden');
            } else {
                modalProfileImage.classList.add('hidden');
                modalCurrentAvatar.classList.remove('hidden');
                removeBtn.classList.add('hidden');
                
                // Get avatar letter from current user data
                const userName = profileData?.fullName || profileData?.full_name || currentUser?.full_name || 'V';
                const avatarLetter = userName.charAt(0).toUpperCase();
                modalCurrentAvatar.textContent = avatarLetter;
            }
        }
        
        async function handleModalImageUpload(file) {
            // Validate file
            if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/)) {
                showModalError('Please upload a valid image file (JPEG, PNG, or WebP)');
                return;
            }
            
            if (file.size > 5 * 1024 * 1024) { // 5MB
                showModalError('Image size must be less than 5MB');
                return;
            }
            
            try {
                // Show upload progress
                document.getElementById('modalDropZoneContent').classList.add('hidden');
                document.getElementById('modalUploadProgress').classList.remove('hidden');
                
                // Create FormData
                const formData = new FormData();
                formData.append('profileImage', file);
                
                // Upload image - don't set Content-Type for FormData
                const token = window.TalkTimeAuth.getAccessToken();
                const response = await fetch('/api/v1/volunteers/profile/image', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                        // Don't set Content-Type - let browser set it with boundary for FormData
                    },
                    body: formData
                });
                
                if (response.ok) {
                    const result = await response.json();
                    showModalSuccess('Profile image uploaded successfully!');
                    
                    // Update profile data
                    profileData.profile_image = result.profileImage;
                    
                    // Update main avatar displays
                    updateAvatarDisplay();
                    
                    // Update modal avatar
                    updateModalAvatar();
                    
                    // Reload profile completion to update percentage
                    await loadProfileCompletion();
                    
                    // Auto-close modal after success
                    setTimeout(() => {
                        closeImageUploadModal();
                    }, 1500);
                    
                } else {
                    throw new Error('Upload failed');
                }
                
            } catch (error) {
                console.error('Upload error:', error);
                showModalError(error.message || 'Failed to upload image');
            } finally {
                // Reset upload UI
                document.getElementById('modalDropZoneContent').classList.remove('hidden');
                document.getElementById('modalUploadProgress').classList.add('hidden');
            }
        }
        
        async function removeProfileImageModal() {
            const confirmed = window.showConfirmation
                ? await window.showConfirmation('Are you sure you want to remove your profile photo?', { title: 'Remove Photo', confirmText: 'Remove', cancelText: 'Keep Photo', type: 'warning' })
                : confirm('Are you sure you want to remove your profile photo?');

            if (confirmed) {
                try {
                    showModalLoading('Removing photo...');
                    
                    const response = await window.TalkTimeAuth.authenticatedRequest('/api/v1/volunteers/profile/image', {
                        method: 'DELETE'
                    });
                    
                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Failed to delete image');
                    }
                    
                    // Update local data and UI
                    profileData.profile_image = null;
                    profileData.profileImage = null; // Also clear backend field
                    updateAvatarDisplay();
                    updateModalAvatar();
                    showModalSuccess('Profile photo removed successfully');
                    
                    // Reload profile completion to update percentage
                    await loadProfileCompletion();
                    
                    console.log('✅ Profile image deleted from server and database');
                    
                    // Auto-close modal after removal
                    setTimeout(() => {
                        closeImageUploadModal();
                    }, 1000);
                    
                } catch (error) {
                    console.error('Error removing profile image:', error);
                    showModalError('Failed to remove profile photo: ' + error.message);
                }
            }
        }
        
        function showModalLoading(message) {
            const statusDiv = document.getElementById('modalUploadStatus');
            statusDiv.textContent = message;
            statusDiv.className = 'text-sm mt-3 text-center text-brand-primary';
        }
        
        function showModalSuccess(message) {
            const statusDiv = document.getElementById('modalUploadStatus');
            statusDiv.textContent = message;
            statusDiv.className = 'text-sm mt-3 text-center text-success';
        }
        
        function showModalError(message) {
            const statusDiv = document.getElementById('modalUploadStatus');
            statusDiv.textContent = message;
            statusDiv.className = 'text-sm mt-3 text-center text-error';
        }
        
        
        function updateAvatarDisplay() {
            const profilePicture = document.getElementById('profile-picture');
            const profileImage = document.getElementById('profile-image');

            console.log('updateAvatarDisplay called with profileData:', profileData);
            console.log('profile_image value:', profileData?.profile_image);

            if (profileData && profileData.profile_image) {
                // Show profile image - use the full path returned by backend
                // Backend returns: /uploads/profiles/filename.jpg
                console.log('Setting image src to:', profileData.profile_image);
                profileImage.src = profileData.profile_image;
                profileImage.onerror = function() {
                    console.error('Failed to load image from:', profileData.profile_image);
                    // Fallback to letter avatar on error
                    profileImage.classList.add('hidden');
                    profilePicture.classList.remove('hidden');
                };
                profileImage.onload = function() {
                    console.log('Image loaded successfully from:', profileData.profile_image);
                };
                profileImage.classList.remove('hidden');
                profilePicture.classList.add('hidden');
            } else {
                // Show avatar letter
                profileImage.classList.add('hidden');
                profilePicture.classList.remove('hidden');
                
                // Get avatar letter from nickname/username or full name
                const userName = profileData?.fullName || profileData?.full_name || currentUser?.full_name || 'V';
                const avatarLetter = userName.charAt(0).toUpperCase();
                profilePicture.textContent = avatarLetter;
            }
        }

        // Header scroll behavior - uses mobile-header from dashboard-nav
        const header = document.querySelector('.mobile-header');
        if (header) {
            const handleScroll = () => {
                if (window.scrollY > 50) {
                    header.classList.add('scrolled');
                } else {
                    header.classList.remove('scrolled');
                }
            };
            window.addEventListener('scroll', handleScroll);
        }

        // Navigation dropdown and logout are handled by dashboard-nav.js

        // Initialize tabs functionality
        function initializeTabs() {
            const tabs = document.querySelectorAll('.profile-tab');
            const panels = document.querySelectorAll('.tab-panel');

            console.log('initializeTabs called, found tabs:', tabs.length, 'panels:', panels.length);

            tabs.forEach(tab => {
                tab.addEventListener('click', function() {
                    console.log('Tab clicked:', this.id);
                    // Remove active from all tabs
                    tabs.forEach(t => {
                        t.classList.remove('active', 'border-brand-secondary', 'text-brand-secondary');
                        t.classList.add('border-transparent', 'text-gray-500');
                    });
                    
                    // Hide all panels
                    panels.forEach(p => {
                        p.classList.add('hidden');
                        p.classList.remove('active');
                        p.style.display = 'none';
                    });
                    
                    // Activate clicked tab
                    this.classList.add('active');
                    this.classList.remove('border-transparent', 'text-gray-500');
                    this.classList.add('border-brand-secondary', 'text-brand-secondary');
                    
                    // Show corresponding panel
                    const tabId = this.id.replace('tab-', 'content-');
                    const panel = document.getElementById(tabId);
                    console.log('Looking for panel:', tabId, 'Found:', !!panel);
                    if (panel) {
                        panel.classList.remove('hidden');
                        panel.classList.add('active');
                        panel.style.display = 'block';
                        console.log('Panel classes after show:', panel.className);
                    }
                });
            });
        }

        // Initialize page when DOM is ready
        document.addEventListener('DOMContentLoaded', function() {
            document.body.classList.add('page-ready');
            initializePage();
            initializeTabs();
            initializeImageUploadModal();
        });
    