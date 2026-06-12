
        document.addEventListener('DOMContentLoaded', () => {
            // Reveal page now that sync CSS is loaded (prevents FOUC)
            document.body.classList.add('page-ready');

            // --- DOM Elements ---
            const studentNameEl = document.getElementById('student-name');
            const studentMetaAgeGenderEl = document.getElementById('student-meta-age-gender');
            const studentMetaAdmissionEl = document.getElementById('student-meta-admission');
            const studentBioEl = document.getElementById('student-bio');
            const studentStoryEl = document.getElementById('student-story');
            const studentGalleryEl = document.getElementById('student-gallery');
            const scheduleButtonContainer = document.getElementById('schedule-button-container');
            const notificationEl = document.getElementById('notification');

            // Instant calls are admin-controlled platform-wide (off by default).
            // Flag fetched once; any rendered Instant Call button is removed when disabled.
            let instantCallsEnabled = false;
            const instantCallFlagReady = fetch('/api/v1/config')
                .then(r => r.json())
                .then(d => { instantCallsEnabled = !!(d.config && d.config['instant_call.enabled']); })
                .catch(() => {});
            function enforceInstantCallFlag() {
                instantCallFlagReady.then(() => {
                    if (!instantCallsEnabled) {
                        const btn = document.getElementById('instant-call-btn');
                        if (btn) btn.remove();
                    }
                });
            }

            // --- Utility Functions ---
            function showNotification(message, type = 'success') {
                notificationEl.textContent = message;
                notificationEl.className = `fixed bottom-5 right-5 px-6 py-3 rounded-lg shadow-lg ${type === 'success' ? 'bg-success text-white' : 'bg-error text-white'}`;
                notificationEl.classList.remove('hidden');

                setTimeout(() => {
                    notificationEl.classList.add('hidden');
                }, 5000);
            }

            // Function to get URL parameters
            function getUrlParams() {
                // Parse query parameters from the new URL structure
                // Format: /volunteer/dashboard/student-detail.html?id=1&admission=ADM0001&name=Test%20Student&meeting=123
                const urlParams = new URLSearchParams(window.location.search);

                const id = urlParams.get('id');
                const admission = urlParams.get('admission');
                const name = urlParams.get('name');
                const meeting = urlParams.get('meeting');

                // Validate that we have the required parameters
                if (id && admission && name) {
                    return {
                        studentId: id,
                        studentAdmission: admission,
                        studentName: decodeURIComponent(name),
                        meetingId: meeting,
                        action: urlParams.get('action')
                    };
                }

                // If query parameters are missing, return null
                console.error('Missing required URL parameters:', { id, admission, name });
                return null;
            }

            // --- Data Loading ---
            function loadStudentData() {
                const params = getUrlParams();

                if (!params) {
                    showNotification('Invalid student URL', 'error');
                    return;
                }

                // Update page title with student name
                document.title = `TalkTime - ${params.studentName} | Student Profile`;

                // Update canonical link
                const canonicalLink = document.getElementById('canonical-link');
                canonicalLink.href = window.location.href;

                // Use the full student ID for the API call - some students have the name in their admission number
                // This handles both formats: ADM1234 and ADM1234-name-name

                // Fetch student data from the backend API
                TalkTimeAuth.authenticatedRequest(`/api/v1/volunteers/students/${params.studentId}/profile`)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        return response.json();
                    })
                    .then(data => {
                        console.log('Student data received:', data);

                        // Update student profile data - API returns student data wrapped in 'student' property
                        renderStudentProfile(data.student);

                        // Check if there's an existing meeting and render the appropriate button
                        checkExistingMeeting(params.studentId);
                    })
                    .catch(error => {
                        console.error('Error loading student data:', error);
                        showNotification('Failed to load student data. Please try again.', 'error');
                    });
            }

            // Function to render student profile
            function renderStudentProfile(student) {
                // Store the numeric student ID in a data attribute for later use
                document.getElementById('student-profile').dataset.numericId = student.id;
                // Store the users-table ID for messaging (message API requires users.id, not students.id)
                document.getElementById('student-profile').dataset.userId = student.userId || student.id;

                // Name
                if (studentNameEl) {
                    studentNameEl.textContent = student.name || 'Student';
                }

                // Quick-action deep link from My Schedules: open the chat right away
                const urlAction = getUrlParams();
                if (urlAction && urlAction.action === 'message' && window.openMessageModal) {
                    window.openMessageModal(student.userId || student.id, student.name || 'Student');
                }

                // Profile photo — real image or initials fallback
                const photoWrapper = document.getElementById('student-photo-wrapper');
                const initialsEl = document.getElementById('student-initials');
                if (student.profileImage && !student.profileImage.includes('placeholder')) {
                    const img = document.createElement('img');
                    img.src = student.profileImage;
                    img.alt = student.name || 'Student';
                    photoWrapper.replaceChildren(img);
                } else if (initialsEl && student.name) {
                    const nameParts = student.name.trim().split(' ').filter(p => p);
                    const initials = nameParts.length >= 2
                        ? (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase()
                        : student.name.charAt(0).toUpperCase();
                    initialsEl.textContent = initials;
                }

                // Line 1: "24 years · Girl" — right under the name
                const ageGenderParts = [];
                if (student.age && student.age !== 'Age not specified') {
                    ageGenderParts.push(student.age + ' years');
                }
                if (student.gender && student.gender !== 'Not specified') {
                    const g = student.gender.toLowerCase();
                    const genderDisplay = (g === 'f' || g === 'female') ? 'Girl' :
                                         (g === 'm' || g === 'male') ? 'Boy' : student.gender;
                    ageGenderParts.push(genderDisplay);
                }
                if (studentMetaAgeGenderEl) {
                    if (ageGenderParts.length > 0) {
                        studentMetaAgeGenderEl.innerHTML = ageGenderParts.join(' <span style="color:#d1d5db;margin:0 3px;">&middot;</span> ');
                    } else {
                        studentMetaAgeGenderEl.style.display = 'none';
                    }
                }

                // Line 2: "ADM0001" (strip the -firstname-lastname suffix)
                if (studentMetaAdmissionEl) {
                    if (student.admissionNumber && student.admissionNumber !== 'Not available') {
                        // Extract just "ADM0001" from "ADM0001-firstname-lastname"
                        const admClean = student.admissionNumber.replace(/-.*$/, '');
                        studentMetaAdmissionEl.innerHTML = '<i class="fas fa-id-card" style="font-size:10px;margin-right:3px;"></i>' + admClean;
                    } else {
                        studentMetaAdmissionEl.style.display = 'none';
                    }
                }

                // Bio
                const bioSection = document.getElementById('bio-section');
                if (studentBioEl && student.bio && student.bio !== 'No biography available for this student.') {
                    studentBioEl.textContent = student.bio;
                    bioSection.style.display = '';
                }

                // Story
                if (studentStoryEl) {
                    studentStoryEl.textContent = student.story || 'No story available.';
                }

                // Gallery
                if (student.gallery && Array.isArray(student.gallery) && student.gallery.length > 0) {
                    const realImages = student.gallery.filter(img => img && !img.includes('placeholder'));
                    if (realImages.length > 0) {
                        studentGalleryEl.innerHTML = realImages.map(function(image, idx) {
                            return '<img src="' + image + '" alt="' + (student.name || 'Student') + '" class="gallery-img" loading="lazy" data-index="' + idx + '">';
                        }).join('');
                        // Attach lightbox click handlers
                        studentGalleryEl.querySelectorAll('.gallery-img').forEach(function(img) {
                            img.addEventListener('click', function() {
                                openLightbox(realImages, parseInt(this.dataset.index, 10));
                            });
                        });
                    } else {
                        studentGalleryEl.innerHTML = '<p class="col-span-2 text-center py-4 text-gray-400 text-sm">No photos available</p>';
                    }
                } else {
                    studentGalleryEl.innerHTML = '<p class="col-span-2 text-center py-4 text-gray-400 text-sm">No photos available</p>';
                }
            }

            // ── Gallery Lightbox ──
            let lightboxImages = [];
            let lightboxIndex = 0;

            function openLightbox(images, startIndex) {
                lightboxImages = images;
                lightboxIndex = startIndex || 0;

                // Remove existing lightbox if any
                const existing = document.getElementById('gallery-lightbox');
                if (existing) existing.remove();

                const overlay = document.createElement('div');
                overlay.id = 'gallery-lightbox';
                overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;';

                overlay.innerHTML =
                    '<button id="lb-close" style="position:absolute;top:16px;right:16px;background:none;border:none;color:#fff;font-size:28px;cursor:pointer;z-index:2;width:44px;height:44px;display:flex;align-items:center;justify-content:center;" aria-label="Close"><i class="fas fa-times"></i></button>' +
                    (images.length > 1 ? '<button id="lb-prev" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);border:none;color:#fff;font-size:22px;cursor:pointer;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;" aria-label="Previous"><i class="fas fa-chevron-left"></i></button>' : '') +
                    '<img id="lb-img" src="" alt="Gallery" style="max-width:92vw;max-height:88vh;object-fit:contain;border-radius:8px;user-select:none;">' +
                    (images.length > 1 ? '<button id="lb-next" style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:rgba(255,255,255,0.15);border:none;color:#fff;font-size:22px;cursor:pointer;width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;" aria-label="Next"><i class="fas fa-chevron-right"></i></button>' : '') +
                    (images.length > 1 ? '<div id="lb-counter" style="position:absolute;bottom:16px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,0.7);font-size:13px;"></div>' : '');

                document.body.appendChild(overlay);
                updateLightbox();

                // Event listeners
                document.getElementById('lb-close').addEventListener('click', closeLightbox);
                overlay.addEventListener('click', function(e) { if (e.target === overlay) closeLightbox(); });

                var prevBtn = document.getElementById('lb-prev');
                var nextBtn = document.getElementById('lb-next');
                if (prevBtn) prevBtn.addEventListener('click', function(e) { e.stopPropagation(); lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length; updateLightbox(); });
                if (nextBtn) nextBtn.addEventListener('click', function(e) { e.stopPropagation(); lightboxIndex = (lightboxIndex + 1) % lightboxImages.length; updateLightbox(); });

                document.addEventListener('keydown', lightboxKeyHandler);

                // Swipe support for mobile
                let touchStartX = 0;
                overlay.addEventListener('touchstart', function(e) { touchStartX = e.changedTouches[0].clientX; }, { passive: true });
                overlay.addEventListener('touchend', function(e) {
                    const dx = e.changedTouches[0].clientX - touchStartX;
                    if (Math.abs(dx) > 50 && lightboxImages.length > 1) {
                        if (dx < 0) { lightboxIndex = (lightboxIndex + 1) % lightboxImages.length; }
                        else { lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length; }
                        updateLightbox();
                    }
                }, { passive: true });
            }

            function updateLightbox() {
                var img = document.getElementById('lb-img');
                var counter = document.getElementById('lb-counter');
                if (img) img.src = lightboxImages[lightboxIndex];
                if (counter) counter.textContent = (lightboxIndex + 1) + ' / ' + lightboxImages.length;
            }

            function closeLightbox() {
                var el = document.getElementById('gallery-lightbox');
                if (el) el.remove();
                document.removeEventListener('keydown', lightboxKeyHandler);
            }

            function lightboxKeyHandler(e) {
                if (e.key === 'Escape') closeLightbox();
                if (e.key === 'ArrowLeft' && lightboxImages.length > 1) { lightboxIndex = (lightboxIndex - 1 + lightboxImages.length) % lightboxImages.length; updateLightbox(); }
                if (e.key === 'ArrowRight' && lightboxImages.length > 1) { lightboxIndex = (lightboxIndex + 1) % lightboxImages.length; updateLightbox(); }
            }

            // Function to check meetings with this student and render appropriate interface
            function checkExistingMeeting(studentId) {
                // Use the full student ID for the API call - some students have the name in their admission number

                TalkTimeAuth.authenticatedRequest(`/api/v1/meetings/student/${studentId}`)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        return response.json();
                    })
                    .then(data => {
                        console.log('Enhanced meeting data received:', data);

                        // Get meeting statistics and new data structure
                        const meetingStats = data.meetingStats || {};
                        const volunteerStudentMeetings = data.volunteerStudentMeetings || [];
                        const allVolunteerMeetings = data.allVolunteerMeetings || [];
                        const currentVolunteerId = data.currentVolunteerId;
                        const activeMeeting = data.activeMeeting || data.meeting; // Try new field first, fall back to old

                        console.log('Processing meeting data:', {
                            activeMeeting: activeMeeting ? 'Found' : 'None',
                            volunteerStudentMeetings: volunteerStudentMeetings.length,
                            allVolunteerMeetings: allVolunteerMeetings.length,
                            meetingStats
                        });

                        // Render the comprehensive meeting interface with correct data structure
                        renderMeetingInterface(studentId, {
                            activeMeeting,
                            volunteerStudentMeetings,
                            allVolunteerMeetings,
                            meetingStats,
                            currentVolunteerId
                        });
                    })
                    .catch(error => {
                        console.error('Error checking existing meeting:', error);
                        // Default to showing schedule button on error
                        renderScheduleButton(studentId);
                    });
            }

            // Function to render reschedule/message buttons (fallback)
            // Uses meetingId from URL param — same pattern as upcoming.html
            function renderScheduleButton(studentId) {
                const params = getUrlParams();
                if (!params) return;

                const numericId = document.getElementById('student-profile').dataset.numericId;
                const msgUserId = document.getElementById('student-profile').dataset.userId || numericId;
                const meetingId = params.meetingId;

                // Build schedule URL using users.id (msgUserId) — matches upcoming.html's pattern
                const scheduleUrl = `/volunteer/dashboard/schedule.html?id=${msgUserId}&admission=${params.studentAdmission}&name=${encodeURIComponent(params.studentName)}` + (meetingId ? `&meeting=${meetingId}` : '');
                const btnLabel = meetingId ? 'Reschedule' : 'Schedule';

                scheduleButtonContainer.innerHTML = `
                <div class="flex gap-2">
                    <a href="${scheduleUrl}"
                       class="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white py-2.5 px-4 rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                       data-numeric-id="${numericId}">
                        <i class="fas fa-calendar-alt"></i>
                        <span>${btnLabel}</span>
                    </a>
                    <button id="instant-call-btn"
                            class="flex-1 flex items-center justify-center gap-2 bg-green-600 text-white py-2.5 px-4 rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                            data-student-id="${numericId}"
                            data-student-name="${document.getElementById('student-name').textContent.trim()}">
                        <i class="fas fa-video"></i>
                        <span>Instant Call</span>
                    </button>
                    <button onclick="openMessageModal('${msgUserId}', '${document.getElementById('student-name').textContent.trim().replace(/'/g, "\\'")}')"
                            class="flex-1 flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 py-2.5 px-4 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                            title="Message">
                        <i class="far fa-comment-dots"></i>
                        <span>Message</span>
                    </button>
                </div>
            `;
                enforceInstantCallFlag();
            }

            // Function to render reschedule button
            function renderRescheduleButton(studentId, meeting) {
                const params = getUrlParams();
                if (!params) return;

                // Get the numeric ID from the data attribute
                const numericId = document.getElementById('student-profile').dataset.numericId;
                const msgUserId = document.getElementById('student-profile').dataset.userId || numericId;

                const meetingDate = new Date(meeting.scheduled_time);

                // Check if the current volunteer is the owner of this meeting
                const isOwner = meeting.isOwner === true || meeting.is_owner === true;

                if (isOwner) {
                    // If current volunteer is the owner, show existing meeting management AND new scheduling options
                    scheduleButtonContainer.innerHTML = `
                    <div class="space-y-4">
                        <!-- Existing Meeting Info -->
                        <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p class="text-xs text-gray-600">Scheduled meeting:</p>
                            <p class="font-semibold text-sm text-gray-900">${meetingDate.toLocaleDateString()} at ${meetingDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}</p>
                        </div>

                        <!-- Existing Meeting Management -->
                        <div class="flex flex-col gap-2">
                            <a href="/volunteer/dashboard/schedule.html?id=${msgUserId}&admission=${params.studentAdmission}&name=${encodeURIComponent(params.studentName)}&meeting=${meeting.id}"
                               class="w-full text-center bg-brand-primary text-white py-2.5 px-4 rounded-lg hover:bg-brand-primary-dark transition-colors font-medium text-sm">
                                <i class="far fa-calendar-alt mr-2"></i>Reschedule
                            </a>
                            <button id="cancel-meeting-btn" data-meeting-id="${meeting.id}" data-student-name="${studentName}"
                                    class="w-full bg-white border border-red-500 text-red-500 py-2.5 px-4 rounded-lg hover:bg-red-50 transition-colors font-medium text-sm">
                                <i class="far fa-calendar-times mr-2"></i>Cancel Meeting
                            </button>
                        </div>

                        <!-- Divider -->
                        <div class="border-t border-gray-200 pt-3">
                            <p class="text-xs text-gray-500 mb-3">Or schedule additional meetings:</p>
                        </div>

                        <!-- Additional Actions -->
                        <div class="flex gap-2">
                            <button id="instant-call-btn"
                                    class="flex-1 bg-brand-primary-dark text-white py-2.5 px-4 rounded-lg hover:bg-brand-primary transition-colors font-medium text-sm"
                                    data-student-id="${numericId}"
                                    data-student-name="${document.getElementById('student-name').textContent.trim()}">
                                <i class="fas fa-phone-alt mr-2"></i>Instant Call
                            </button>
                            <button onclick="openMessageModal('${msgUserId}', '${document.getElementById('student-name').textContent.trim().replace(/'/g, "\\'")}')"
                                    class="flex-1 flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 py-2.5 px-4 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                                    title="Message">
                                <i class="far fa-comment-dots"></i><span>Message</span>
                            </button>
                        </div>
                    </div>
                `;

                    // Add event listeners
                    const cancelBtn = document.getElementById('cancel-meeting-btn');
                    if (cancelBtn) {
                        cancelBtn.addEventListener('click', () => {
                            const meetingId = cancelBtn.dataset.meetingId;
                            const studentName = cancelBtn.dataset.studentName;
                            window.cancelMeeting(meetingId, studentName);
                        });
                    }
                    document.getElementById('instant-call-btn').addEventListener('click', initiateInstantCall);
                    enforceInstantCallFlag();
                } else {
                    // If another volunteer owns this meeting, show reschedule + message
                    scheduleButtonContainer.innerHTML = `
                    <div class="flex gap-2">
                        <a href="/volunteer/dashboard/schedule.html?id=${msgUserId}&admission=${params.studentAdmission}&name=${encodeURIComponent(params.studentName)}&meeting=${meeting.id}"
                           class="flex-1 flex items-center justify-center gap-2 text-center bg-brand-primary text-white py-3 px-4 rounded-lg hover:bg-brand-primary-dark transition-colors font-medium text-sm"
                           data-numeric-id="${numericId}">
                            <i class="fas fa-calendar-alt"></i><span>Reschedule</span>
                        </a>
                        <button onclick="openMessageModal('${msgUserId}', '${document.getElementById('student-name').textContent.trim().replace(/'/g, "\\'")}')"
                                class="flex-1 flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 py-3 px-4 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
                                title="Message">
                            <i class="far fa-comment-dots"></i><span>Message</span>
                        </button>
                        <button id="instant-call-btn"
                                class="w-full bg-success-dark text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors font-medium"
                                data-student-id="${numericId}"
                                data-student-name="${document.getElementById('student-name').textContent.trim()}">
                            <i class="fas fa-phone-alt mr-2"></i>Instant Call
                        </button>
                    </div>
                `;
                    enforceInstantCallFlag();
                }
            }

            // NEW: Function to render comprehensive meeting interface with tabs
            function renderMeetingInterface(studentId, data) {
                const { activeMeeting, volunteerStudentMeetings, allVolunteerMeetings, meetingStats, currentVolunteerId } = data;
                const params = getUrlParams();
                if (!params) return;

                const numericId = document.getElementById('student-profile').dataset.numericId;
                const msgUserId = document.getElementById('student-profile').dataset.userId || numericId;
                const studentName = document.getElementById('student-name').textContent.trim();

                const canScheduleMore = meetingStats.canScheduleMore;
                const meetingCount = meetingStats.volunteerStudentMeetingCount;
                const limit = meetingStats.meetingLimit;

                let interfaceHtml = '';

                // Tiny meeting limit indicator (inline text only)
                if (!canScheduleMore) {
                    interfaceHtml += `<p class="text-xs text-orange-600 mb-3"><i class="fas fa-info-circle mr-1"></i>${meetingCount}/${limit} meetings - limit reached</p>`;
                }

                // Meetings list (if any) — canceled ones hidden, they add clutter without useful info
                const visibleMeetings = (volunteerStudentMeetings || []).filter(m => {
                    const s = (m.realTimeStatus || m.status || '').toLowerCase();
                    return s !== 'canceled' && s !== 'cancelled';
                });
                if (visibleMeetings.length > 0) {
                    const sortedMeetings = [...visibleMeetings].sort((a, b) => {
                        const dateA = new Date(a.scheduled_time);
                        const dateB = new Date(b.scheduled_time);
                        const now = new Date();
                        const aIsUpcoming = dateA >= now;
                        const bIsUpcoming = dateB >= now;
                        if (aIsUpcoming && bIsUpcoming) return dateA - dateB;
                        if (!aIsUpcoming && !bIsUpcoming) return dateB - dateA;
                        return aIsUpcoming ? -1 : 1;
                    });

                    interfaceHtml += `<div class="mb-4"><p class="text-xs text-gray-500 mb-2">Meetings (${sortedMeetings.length})</p><div class="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">`;

                    sortedMeetings.forEach(meeting => {
                        const meetingDate = new Date(meeting.scheduled_time);
                        const now = new Date();
                        const realTimeStatus = meeting.realTimeStatus || meeting.status;
                        const isToday = meetingDate.toDateString() === now.toDateString();

                        let statusText = '';
                        let statusClass = 'text-gray-500';
                        let showJoin = false;

                        switch (realTimeStatus) {
                            case 'upcoming':
                                statusText = isToday ? 'Today' : 'Scheduled';
                                statusClass = 'text-blue-600';
                                break;
                            case 'in_progress':
                            case 'missed_start':
                                statusText = 'Join Now';
                                statusClass = 'text-green-600 font-semibold';
                                showJoin = true;
                                break;
                            case 'completed':
                                statusText = 'Completed';
                                statusClass = 'text-green-600';
                                break;
                            case 'missed':
                                statusText = 'Missed';
                                statusClass = 'text-orange-500';
                                break;
                            default:
                                statusText = meeting.status || '';
                        }

                        const dateStr = meetingDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                        const timeStr = meetingDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });

                        // Rows are info-only — all actions live in the single button bar below
                        const borderClass = showJoin ? 'border border-blue-200' : '';

                        interfaceHtml += `
                        <div class="py-2.5 px-3 bg-gray-50 rounded-lg text-sm ${borderClass}">
                            <div class="flex items-center justify-between">
                                <span class="text-gray-700 font-medium">${dateStr}, ${timeStr}</span>
                                <span class="${statusClass} text-xs">${statusText}</span>
                            </div>
                            ${showJoin ? `
                                <a href="/call/call.html?room=${meeting.roomId || meeting.id}&role=volunteer" class="block w-full text-center text-xs bg-green-600 text-white py-2 px-3 rounded-lg hover:bg-green-700 font-medium mt-2">Join Call</a>
                            ` : ''}
                        </div>`;
                    });

                    interfaceHtml += `</div></div>`;
                }

                // Single action bar — Reschedule/Cancel target the next upcoming meeting
                const nextUpcoming = visibleMeetings
                    .filter(m => (m.realTimeStatus || m.status) === 'upcoming')
                    .sort((a, b) => new Date(a.scheduled_time) - new Date(b.scheduled_time))[0] || null;
                const baseScheduleUrl = `/volunteer/dashboard/schedule.html?id=${msgUserId}&admission=${params.studentAdmission}&name=${encodeURIComponent(params.studentName)}`;
                const actionBtnClass = 'flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-colors';

                // Auto-start countdown for the next upcoming meeting
                if (nextUpcoming) {
                    interfaceHtml += `
                    <div data-countdown-band class="schedule-countdown-band">
                        <div class="scb-timer" id="detail-countdown-${nextUpcoming.id}" data-start-time="${nextUpcoming.scheduled_time}">--</div>
                        <div class="scb-sub">Meeting starts automatically. No action needed — your call opens by itself when the timer reaches zero. Just be ready.</div>
                    </div>`;
                }

                interfaceHtml += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px">`;
                if (nextUpcoming) {
                    interfaceHtml += `
                    <a href="${baseScheduleUrl}&meeting=${nextUpcoming.id}"
                       class="${actionBtnClass} bg-blue-600 text-white hover:bg-blue-700">
                        <i class="fas fa-calendar-alt"></i><span>Reschedule</span>
                    </a>`;
                } else if (canScheduleMore) {
                    interfaceHtml += `
                    <a href="${baseScheduleUrl}"
                       class="${actionBtnClass} bg-blue-600 text-white hover:bg-blue-700">
                        <i class="fas fa-calendar-alt"></i><span>Schedule</span>
                    </a>`;
                } else {
                    interfaceHtml += `
                    <button disabled class="${actionBtnClass} bg-gray-200 text-gray-400 cursor-not-allowed">
                        <i class="fas fa-calendar-alt"></i><span>Limit Reached</span>
                    </button>`;
                }
                interfaceHtml += `
                    <button id="instant-call-btn" class="${actionBtnClass} bg-green-600 text-white hover:bg-green-700"
                            data-student-id="${numericId}" data-student-name="${studentName}">
                        <i class="fas fa-video"></i><span>Instant Call</span>
                    </button>
                    <button onclick="openMessageModal('${msgUserId}', '${studentName.replace(/'/g, "\\'")}')"
                            class="${actionBtnClass} bg-gray-100 text-gray-800 hover:bg-gray-200"
                            title="Message ${studentName}">
                        <i class="far fa-comment-dots"></i><span>Message</span>
                    </button>`;
                if (nextUpcoming) {
                    interfaceHtml += `
                    <button class="cancel-meeting-btn ${actionBtnClass}" style="background:rgba(209,1,0,0.09);color:#991b1b;"
                            data-meeting-id="${nextUpcoming.id}" data-student-name="${studentName}">
                        <i class="far fa-calendar-times"></i><span>Cancel</span>
                    </button>`;
                }
                interfaceHtml += `</div>`;

                scheduleButtonContainer.innerHTML = interfaceHtml;

                // Start the live countdown (shared ticker from meeting-auto-launch.js)
                if (nextUpcoming && window.renderMeetingCountdown) {
                    const countdownEl = document.getElementById('detail-countdown-' + nextUpcoming.id);
                    if (countdownEl) window.renderMeetingCountdown(countdownEl, nextUpcoming.scheduled_time);
                }

                // Add event listener for instant call button
                const instantCallBtn = document.getElementById('instant-call-btn');
                if (instantCallBtn) {
                    instantCallBtn.addEventListener('click', initiateInstantCall);
                }
                enforceInstantCallFlag();

                // Add event listeners for all cancel meeting buttons
                const cancelButtons = scheduleButtonContainer.querySelectorAll('.cancel-meeting-btn');
                cancelButtons.forEach(button => {
                    button.addEventListener('click', () => {
                        const meetingId = button.dataset.meetingId;
                        const studentName = button.dataset.studentName;
                        window.cancelMeeting(meetingId, studentName);
                    });
                });
            }

            // Function to cancel a meeting (make it globally accessible)
            window.cancelMeeting = async function (meetingId, studentName) {
                const confirmed = await window.showConfirmation(
                    `Are you sure you want to cancel your meeting with ${studentName}?`,
                    {
                        title: 'Cancel Meeting',
                        confirmText: 'Cancel Meeting',
                        cancelText: 'Keep Meeting',
                        type: 'warning'
                    }
                );

                if (!confirmed) {
                    return;
                }

                // Send API request to cancel the meeting
                window.TalkTimeAuth.authenticatedRequest(`/api/v1/meetings/${meetingId}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                })
                    .then(response => {
                        if (!response.ok) {
                            throw new Error('Failed to cancel meeting');
                        }
                        return response.json();
                    })
                    .then(data => {
                        // Show success notification
                        showNotification('Meeting cancelled successfully');

                        // Refresh the meeting interface to show updated data
                        const params = getUrlParams();
                        if (params) {
                            checkExistingMeeting(params.studentId);
                        }
                    })
                    .catch(error => {
                        console.error('Error cancelling meeting:', error);
                        showNotification('Failed to cancel meeting. Please try again.', 'error');
                    });
            }

            // Function to initiate instant call
            async function initiateInstantCall(event) {
                console.log('🚀 initiateInstantCall called!');

                // Get button element - use event.currentTarget for reliability
                const button = event ? event.currentTarget : this;
                console.log('Button element:', button);
                console.log('Button dataset:', button?.dataset);

                const studentId = button?.dataset?.studentId;
                const studentName = button?.dataset?.studentName;

                console.log('Student ID:', studentId);
                console.log('Student Name:', studentName);

                if (!studentId) {
                    console.error('[TalkTime] No student ID found!');
                    if (window.showNotification) {
                        window.showNotification('Could not find student ID. Please refresh the page and try again.', 'error', { title: 'Error', autoClose: false });
                    }
                    return;
                }

                // Disable button to prevent double-clicks
                if (button) {
                    button.disabled = true;
                    button.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i><span>Connecting...</span>';
                }

                // Get volunteer data from localStorage or TalkTimeAuth
                let volunteerData = null;
                let volunteerName = 'Volunteer';
                let volunteerImage = '';

                try {
                    // First try to get from TalkTimeAuth
                    if (window.TalkTimeAuth && window.TalkTimeAuth.isAuthenticated()) {
                        const user = window.TalkTimeAuth.getUser();
                        if (user) {
                            volunteerData = user;
                            volunteerName = user.full_name || user.fullName || user.name || 'Volunteer';
                            volunteerImage = user.profile_image || user.profileImage || '';
                            console.log('Got volunteer from TalkTimeAuth:', volunteerName);
                        }
                    }

                    // Fallback to localStorage
                    if (!volunteerData) {
                        const userData = localStorage.getItem('volunteer_talktime_user');
                        if (userData) {
                            volunteerData = JSON.parse(userData);
                            volunteerName = volunteerData.full_name || volunteerData.fullName || volunteerData.name || 'Volunteer';
                            volunteerImage = volunteerData.profile_image || volunteerData.profileImage || '';
                            console.log('Got volunteer from localStorage:', volunteerName);
                        }
                    }

                    // Last fallback - try to decode from JWT token
                    if (!volunteerName || volunteerName === 'Volunteer') {
                        const token = localStorage.getItem('volunteer_talktime_access_token');
                        if (token) {
                            const payload = JSON.parse(atob(token.split('.')[1]));
                            volunteerName = payload.full_name || payload.fullName || payload.name || 'Volunteer';
                            console.log('Got volunteer from JWT:', volunteerName);
                        }
                    }
                } catch (error) {
                    console.error('Error getting volunteer data:', error);
                }

                // Extract volunteer user ID from JWT
                let volunteerId = '';
                try {
                    const token = localStorage.getItem('volunteer_talktime_access_token');
                    if (token) {
                        const payload = JSON.parse(atob(token.split('.')[1]));
                        volunteerId = payload.id || payload.userId || payload.sub || '';
                    }
                } catch (e) { /* ignore */ }

                console.log('Final volunteer name for URL:', volunteerName);

                // Generate a unique room ID for this instant call
                const roomId = `instant-${Date.now()}-${studentId}`;

                // Generate URLs with role-appropriate data
                const volunteerParams = `room=${roomId}&instant=true&studentId=${studentId}&studentName=${encodeURIComponent(studentName)}&volunteerName=${encodeURIComponent(volunteerName)}&volunteerImage=${encodeURIComponent(volunteerImage)}&role=volunteer`;
                const studentParams = `room=${roomId}&instant=true&studentId=${studentId}&role=student&volunteerId=${volunteerId}`;
                const volunteerUrl = `/call/call.html?${volunteerParams}`;
                const studentUrl = `/call/call.html?${studentParams}`;
                const fullStudentUrl = window.location.origin + studentUrl;

                console.log('📋 Generated URLs with volunteer info:');
                console.log('👨‍🏫 Volunteer URL:', window.location.origin + volunteerUrl);
                console.log('👨‍🎓 Student URL:', fullStudentUrl);

                // CRITICAL: Check if student is online BEFORE redirecting
                try {
                    const token = window.TalkTimeAuth.getToken();
                    if (!token) {
                        resetInstantCallButton(button);
                        showNotification('Authentication error. Please log in again.', 'error');
                        return;
                    }

                    const response = await fetch('/api/v1/volunteers/instant-call/notify', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            studentId: studentId,
                            studentName: studentName,
                            roomId: roomId,
                            callUrl: fullStudentUrl,
                            volunteerName: volunteerName,
                            volunteerImage: volunteerImage
                        })
                    });

                    const data = await response.json();
                    console.log('📞 Instant call API response:', data);
                    console.log('📞 Response status:', response.status);
                    console.log('📞 Student online status:', data.studentOnline);
                    console.log('📞 Success:', data.success);

                    // Handle different response scenarios
                    if (response.status === 400 && data.error === 'pending_call_exists') {
                        // Volunteer already has a pending call
                        resetInstantCallButton(button);
                        showInstantCallModal({
                            type: 'pending_call',
                            title: 'Call Already in Progress',
                            message: 'You already have a pending instant call. Please wait for the student to respond or wait for the call to expire before starting a new one.',
                            icon: 'fa-phone-slash'
                        });
                        return;
                    }

                    if (!data.success && data.studentOnline === false) {
                        // Student is NOT online - show modal and DON'T redirect
                        resetInstantCallButton(button);
                        // Get student photo from the already-rendered profile
                        const photoWrapper = document.getElementById('student-photo-wrapper');
                        const photoImg = photoWrapper ? photoWrapper.querySelector('img') : null;
                        const studentPhoto = photoImg ? photoImg.src : null;
                        const sName = data.studentName || studentName;
                        showInstantCallModal({
                            type: 'student_offline',
                            title: (sName || 'Student') + ' is not online',
                            message: "We've sent them a notification that you tried to call. They'll be notified when they come back online.",
                            studentName: sName,
                            studentPhoto: studentPhoto
                        });
                        return;
                    }

                    if (data.success && data.studentOnline === true) {
                        // Student IS online - proceed to call
                        showNotification('Student is online! Connecting to call...', 'success');
                        setTimeout(() => {
                            console.log('🚀 Redirecting volunteer to call page:', volunteerUrl);
                            window.location.href = volunteerUrl;
                        }, 1000);
                        return;
                    }

                    // Fallback for unexpected responses
                    resetInstantCallButton(button);
                    showNotification('Unable to start call. Please try again.', 'error');

                } catch (error) {
                    console.error('Error initiating instant call:', error);
                    resetInstantCallButton(button);
                    showNotification('Connection error. Please check your internet and try again.', 'error');
                }
            }

            // Helper function to reset the instant call button
            function resetInstantCallButton(button) {
                if (button) {
                    button.disabled = false;
                    button.innerHTML = '<i class="fas fa-phone-alt mr-2"></i><span>Instant Call</span>';
                }
            }

            // Show branded modal for instant call status
            function showInstantCallModal(options) {
                const { type, title, message, icon, studentName, studentPhoto } = options;

                // Remove any existing modal
                const existingModal = document.getElementById('instant-call-modal');
                if (existingModal) existingModal.remove();

                // Build avatar: photo or initials
                let avatarHtml = '';
                if (type === 'student_offline' && studentPhoto) {
                    avatarHtml = '<img src="' + studentPhoto + '" alt="' + (studentName || 'Student') + '" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:3px solid #fff;margin:0 auto 16px;display:block;">';
                } else if (type === 'student_offline' && studentName) {
                    const parts = studentName.trim().split(' ').filter(function(p) { return p; });
                    const initials = parts.length >= 2
                        ? (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
                        : studentName.charAt(0).toUpperCase();
                    avatarHtml = '<div style="width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,0.2);color:#fff;font-size:28px;font-weight:700;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;border:3px solid rgba(255,255,255,0.4);">' + initials + '</div>';
                } else {
                    avatarHtml = '<div style="width:80px;height:80px;border-radius:50%;background:#fee2e2;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;"><i class="fas ' + (icon || 'fa-phone-slash') + '" style="font-size:30px;color:#ef4444;"></i></div>';
                }

                const modalHtml = `
                    <div id="instant-call-modal" class="fixed inset-0 z-50 flex items-center justify-center p-4" style="background: rgba(0,0,0,0.5);">
                        <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all">
                            <!-- Header -->
                            <div style="background:#D10100;padding:24px;text-align:center;">
                                ${avatarHtml}
                                <h2 style="font-size:18px;font-weight:700;color:#fff;margin:0;">${title}</h2>
                            </div>

                            <!-- Body -->
                            <div class="p-6">
                                <p class="text-gray-600 text-center mb-6">${message}</p>

                                <button onclick="document.getElementById('instant-call-modal').remove()"
                                        style="width:100%;padding:12px 16px;background:#D10100;color:#fff;font-weight:600;border:none;border-radius:12px;cursor:pointer;font-size:16px;">
                                    Got it
                                </button>
                            </div>
                        </div>
                    </div>
                `;

                document.body.insertAdjacentHTML('beforeend', modalHtml);

                // Close on backdrop click
                document.getElementById('instant-call-modal').addEventListener('click', (e) => {
                    if (e.target.id === 'instant-call-modal') {
                        e.target.remove();
                    }
                });

                // Close on Escape key
                const handleEscape = (e) => {
                    if (e.key === 'Escape') {
                        const modal = document.getElementById('instant-call-modal');
                        if (modal) modal.remove();
                        document.removeEventListener('keydown', handleEscape);
                    }
                };
                document.addEventListener('keydown', handleEscape);
            }

            // ─── Conversation Modal ───────────────────────────────────
            const convModal = document.getElementById('conv-modal');
            const convMessages = document.getElementById('conv-messages');
            const convName = document.getElementById('conv-name');
            const convAvatar = document.getElementById('conv-avatar');
            const convInput = document.getElementById('conv-input');
            const convSendBtn = document.getElementById('conv-send-btn');
            const convCloseBtn = document.getElementById('conv-close-btn');
            let convRecipientId = null;
            let convCurrentUserId = null;

            function getConvUserId() {
                if (convCurrentUserId) return convCurrentUserId;
                try {
                    const user = window.TalkTimeAuth && window.TalkTimeAuth.getUser();
                    if (user) convCurrentUserId = user.id;
                } catch (e) { /* ignore */ }
                return convCurrentUserId;
            }

            function convEscapeHtml(text) {
                const d = document.createElement('div');
                d.textContent = text;
                return d.innerHTML;
            }

            function convFormatTime(dateStr) {
                return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            window.openMessageModal = async function(studentUserId, name) {
                convRecipientId = parseInt(studentUserId);
                convName.textContent = name || 'Student';
                convAvatar.textContent = (name || 'S').charAt(0).toUpperCase();
                convMessages.innerHTML = '<div class="text-center py-8 text-gray-400 text-sm"><i class="fas fa-spinner fa-spin mr-1"></i> Loading...</div>';
                convInput.value = '';
                updateConvSendBtn();

                convModal.classList.add('active');
                document.body.style.overflow = 'hidden';

                try {
                    const res = await TalkTimeAuth.authenticatedRequest(`/api/v1/messages/conversation/${convRecipientId}`);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = await res.json();
                    const myId = getConvUserId();

                    if (data.messages && data.messages.length > 0) {
                        convMessages.innerHTML = data.messages.map(msg => {
                            const isSent = msg.isSentByMe || msg.senderId === myId;
                            return `<div class="msg-bubble ${isSent ? 'sent' : 'received'}">
                                <p>${convEscapeHtml(msg.content)}</p>
                                <div class="msg-time">${convFormatTime(msg.createdAt)}</div>
                            </div>`;
                        }).join('');
                        setTimeout(() => { convMessages.scrollTop = convMessages.scrollHeight; }, 50);
                    } else {
                        convMessages.innerHTML = '<div class="text-center py-8 text-gray-500"><p>No messages yet. Start the conversation!</p></div>';
                    }
                } catch (err) {
                    convMessages.innerHTML = '<div class="text-center py-8 text-gray-500"><p>Could not load messages</p></div>';
                }

                setTimeout(() => convInput.focus(), 300);
            };

            function closeMessageModal() {
                convModal.classList.remove('active');
                document.body.style.overflow = '';
                convRecipientId = null;
            }

            async function sendConvMessage() {
                const content = convInput.value.trim();
                if (!content || !convRecipientId) return;

                convInput.value = '';
                updateConvSendBtn();

                const emptyState = convMessages.querySelector('.text-center');
                if (emptyState) emptyState.remove();

                const msgEl = document.createElement('div');
                msgEl.className = 'msg-bubble sent sending';
                msgEl.innerHTML = `<p>${convEscapeHtml(content)}</p><div class="msg-time">${convFormatTime(new Date().toISOString())}</div>`;
                convMessages.appendChild(msgEl);
                convMessages.scrollTop = convMessages.scrollHeight;

                try {
                    const res = await TalkTimeAuth.authenticatedRequest('/api/v1/messages/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ recipientId: convRecipientId, content })
                    });
                    if (res.ok) {
                        msgEl.classList.remove('sending');
                    } else {
                        throw new Error('Send failed');
                    }
                } catch (err) {
                    msgEl.classList.remove('sending');
                    msgEl.classList.add('failed');
                    showNotification('Failed to send message', 'error');
                }
            }

            function updateConvSendBtn() {
                convSendBtn.disabled = !convInput.value.trim();
            }

            convCloseBtn.addEventListener('click', closeMessageModal);
            convModal.addEventListener('click', (e) => { if (e.target === convModal) closeMessageModal(); });
            document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && convModal.classList.contains('active')) closeMessageModal(); });
            convInput.addEventListener('input', updateConvSendBtn);
            convInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (!convSendBtn.disabled) sendConvMessage();
                }
            });
            convSendBtn.addEventListener('click', sendConvMessage);

            // --- Event Listeners ---

            // --- Initialize Authentication ---
            window.TalkTimeAuth = new TalkTimeJWTAuth('volunteer');

            // --- Initialize Real-time Notifications ---
            if (typeof RealtimeNotifications !== 'undefined') {
                window.realtimeNotifications = new RealtimeNotifications('volunteer');
                window.realtimeNotifications.initialize().then(() => {
                    console.log('Real-time notifications initialized');

                    // Helper to refresh meeting data
                    const refreshMeetingData = () => {
                        const params = getUrlParams();
                        if (params && params.studentId) {
                            checkExistingMeeting(params.studentId);
                        }
                    };

                    // Listen for meeting schedule notifications
                    window.realtimeNotifications.on('meeting-scheduled', (data) => {
                        console.log('Meeting scheduled notification received:', data);
                        showNotification(data.message || 'Meeting scheduled successfully!', 'success');
                        refreshMeetingData();
                    });

                    // Listen for meeting reschedule notifications
                    window.realtimeNotifications.on('meeting-rescheduled', (data) => {
                        console.log('Meeting rescheduled notification received:', data);
                        showNotification(`Meeting rescheduled: ${data.message}`, 'success');
                        refreshMeetingData();
                    });

                    // Listen for meeting canceled notifications
                    window.realtimeNotifications.on('meeting-canceled', (data) => {
                        console.log('Meeting canceled notification received:', data);
                        showNotification(data.message || 'Meeting has been canceled', 'warning');
                        refreshMeetingData();
                    });

                    // Listen for meeting completed notifications
                    window.realtimeNotifications.on('meeting-completed', (data) => {
                        console.log('Meeting completed notification received:', data);
                        showNotification(data.message || 'Meeting completed!', 'success');
                        refreshMeetingData();
                    });

                    // Listen for general notifications
                    window.realtimeNotifications.on('newNotification', (notification) => {
                        if (notification.type === 'meeting_rescheduled' ||
                            notification.type === 'meeting_scheduled' ||
                            notification.type === 'meeting_canceled') {
                            console.log('Meeting notification:', notification);
                            showNotification(notification.message, 'success');
                            setTimeout(refreshMeetingData, 1000);
                        }
                    });
                }).catch(error => {
                    console.error('Failed to initialize real-time notifications:', error);
                });
            }

            // --- Initial Load ---
            loadStudentData();
        });

    