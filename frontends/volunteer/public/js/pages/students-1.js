
    document.addEventListener('DOMContentLoaded', function() {
        document.body.classList.add('page-ready');
        // ============================================
        // CHECK FOR INSTANT CALL MESSAGE FROM STUDENT
        // ============================================
        const storedMessage = sessionStorage.getItem('instantCallMessage');
        if (storedMessage) {
            try {
                const messageData = JSON.parse(storedMessage);
                console.log('💬 Found instant call message from student:', messageData);

                // Clear it immediately so it doesn't show again on refresh
                sessionStorage.removeItem('instantCallMessage');

                // Show the modal with a slight delay to ensure page is fully loaded
                setTimeout(() => {
                    showStudentMessageModal(messageData);
                }, 300);
            } catch (e) {
                console.error('Error parsing stored message:', e);
                sessionStorage.removeItem('instantCallMessage');
            }
        }

        // Handle Cultural Exchange Notice
        const culturalNotice = document.getElementById('cultural-exchange-notice');
        const dismissBtn = document.getElementById('dismiss-cultural-notice');

        // Check if notice has been dismissed before
        const isNoticeDismissed = localStorage.getItem('culturalExchangeNoticeDismissed') === 'true';

        if (culturalNotice && !isNoticeDismissed) {
            // Show the notice if it hasn't been dismissed
            culturalNotice.classList.remove('hidden');
        }

        // Handle dismiss button click
        if (dismissBtn) {
            dismissBtn.addEventListener('click', function() {
                // Add smooth fade out animation
                culturalNotice.style.transition = 'opacity 0.3s ease-out';
                culturalNotice.style.opacity = '0';

                setTimeout(() => {
                    culturalNotice.classList.add('hidden');
                    culturalNotice.style.opacity = '1'; // Reset for potential future use
                }, 300);

                // Save dismissal state to localStorage
                localStorage.setItem('culturalExchangeNoticeDismissed', 'true');

                console.log('Cultural exchange notice dismissed permanently');
            });
        }

        // ============================================
        // DUAL TIMEZONE DISPLAY (Kenya + Volunteer Local)
        // ============================================
        function updateTimezoneDisplay() {
            const kenyaTimeEl = document.getElementById('kenya-time');
            const localTimeEl = document.getElementById('local-time');
            const timeDiffEl = document.getElementById('time-difference');

            if (!kenyaTimeEl || !localTimeEl) return;

            const now = new Date();

            // Kenya time (always UTC+3, no DST)
            const kenyaTime = now.toLocaleTimeString('en-US', {
                timeZone: 'Africa/Nairobi',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });

            // Volunteer's local time (browser timezone)
            const localTime = now.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });

            // Get timezone names for display
            const kenyaTzName = 'EAT';
            const localTzName = Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop().replace(/_/g, ' ');

            // Calculate time difference
            const kenyaOffset = 3; // Kenya is always UTC+3
            const localOffset = -now.getTimezoneOffset() / 60; // Browser's offset in hours
            const diff = kenyaOffset - localOffset;
            let diffText = '';
            if (diff > 0) {
                diffText = `Kenya is ${Math.abs(diff)}h ahead`;
            } else if (diff < 0) {
                diffText = `Kenya is ${Math.abs(diff)}h behind`;
            } else {
                diffText = 'Same time';
            }

            // Update display
            kenyaTimeEl.textContent = `${kenyaTime} ${kenyaTzName}`;
            localTimeEl.textContent = `${localTime}`;
            if (timeDiffEl) {
                timeDiffEl.textContent = diffText;
            }

            // Volunteer already on Kenya time: a second identical clock is noise -
            // hide the "You" chip and the difference label
            if (diff === 0) {
                if (localTimeEl.parentElement) localTimeEl.parentElement.style.display = 'none';
                if (timeDiffEl) timeDiffEl.style.display = 'none';
            }
        }

        // Update immediately and then every minute
        updateTimezoneDisplay();
        setInterval(updateTimezoneDisplay, 60000);

        // Initialize Socket.IO connection only when logged in - the server
        // requires a JWT and rejects anonymous sockets (avoids console noise
        // while the login redirect is in flight)
        let socket = { on: function () {}, emit: function () {}, connected: false };
        try {
            if (localStorage.getItem('volunteer_talktime_access_token')) {
                socket = io();
            }
        } catch (e) { /* storage blocked */ }

        // Listen for instant call notifications
        socket.on('instant-call-notification', function(data) {
            console.log('Received instant call notification:', data);
            
            if (data.type === 'incoming') {
                // Show notification for incoming call
                showNotification(`Incoming call from ${data.senderName || 'a volunteer'}. Redirecting...`, 'info');
                
                // Store sender name if available
                if (data.senderName) {
                    sessionStorage.setItem('callerName', data.senderName);
                }

                // (Removed) runtime mount for date controls — controls are now in static HTML
                
                // Redirect volunteer to call page after a short delay
                // FIXED: Changed role=student to role=volunteer - this is the volunteer's redirect
                setTimeout(() => {
                    window.location.href = `/call/call.html?room=${data.meetingId}&role=volunteer&instant=true`;
                }, 2000);
            }
        });
        
        // Connect event - log when successfully connected to socket server
        socket.on('connect', function() {
            console.log('Connected to socket server with ID:', socket.id);
        });
        
        // Error handling: auth rejections are expected when the session just
        // expired (the page will redirect to login) - warn, don't error
        socket.on('connect_error', function(error) {
            if (error && /auth/i.test(error.message || '')) {
                console.warn('Socket auth failed - session may have expired:', error.message);
            } else {
                console.error('Socket connection error:', error);
            }
        });
        
        // --- DOM Elements ---
        const pageDashboard = document.getElementById('page-dashboard');
        const availableStudentsContainer = document.getElementById('student-list-available');
        const notificationEl = document.getElementById('notification');

        // --- Global Variables ---
        let students = [];

        // --- Notification Functions ---
        
        // Check if notifications are enabled for critical actions
        // Advisory only: never block navigation on notification permission.
        // Browsers without the Notification API (iOS Safari) and users who denied
        // can still use every feature; the page-load enforcer handles prompting.
        function checkNotificationPermissionForCriticalAction(actionName = 'critical action') {
            return true;
        }

        // Show notification permission modal when critical actions require notifications
        function showNotificationRequiredMessage() {
            // Remove any leftover toast
            const existingMessage = document.getElementById('notification-required-message');
            if (existingMessage) existingMessage.remove();

            // Trigger the browser-specific notification permission modal
            if (typeof NotificationPermissionModal !== 'undefined') {
                const modal = new NotificationPermissionModal({
                    title: 'Enable Notifications to Continue',
                    message: 'Notifications must be enabled to schedule meetings and access critical features.',
                    mandatory: false,
                    allowButtonText: 'Enable Notifications Now',
                    onAllow: function(permission) {
                        hideNotificationWarning();
                        setupNotificationEventListeners();
                    },
                    onDeny: function() {
                        // User dismissed — they can try again on next critical action
                    }
                });
                modal.show();
            }
        }
        let bookedSlots = {};
        let cardCountdownIntervals = [];

        // --- Event Listeners ---
        document.addEventListener('click', e => {
            // Quick-action pills handle themselves — don't treat as a card tap
            if (e.target.closest('[data-quick-actions]')) return;

            // Student card click
            if (e.target.closest('.student-card')) {
                const studentCard = e.target.closest('.student-card');

                const studentId = studentCard.dataset.studentId;
                const studentAdmission = studentCard.dataset.studentAdmission;
                const studentName = studentCard.dataset.studentName || 'Student';
                const meetingId = studentCard.dataset.meetingId;

                // CRITICAL ACTION ENFORCEMENT: Check notifications before scheduling
                if (!checkNotificationPermissionForCriticalAction('scheduling a meeting')) {
                    showNotificationRequiredMessage();
                    return;
                }

                // Navigate to student detail page with parameters (include meetingId for reschedule)
                let detailUrl = `/volunteer/dashboard/student-detail.html?id=${studentId}&admission=${studentAdmission}&name=${encodeURIComponent(studentName)}`;
                if (meetingId) detailUrl += `&meeting=${meetingId}`;
                window.location.href = detailUrl;
            }
        });

        // Quick-action: cancel meeting straight from the card
        document.addEventListener('click', async e => {
            const btn = e.target.closest('.sc-cancel-btn');
            if (!btn) return;
            const meetingId = btn.dataset.meetingId;
            const name = btn.dataset.studentName || 'this student';
            let confirmed = true;
            if (window.showConfirmation) {
                confirmed = await window.showConfirmation(
                    'Are you sure you want to cancel your meeting with ' + name + '?',
                    { title: 'Cancel Meeting', confirmText: 'Cancel Meeting', cancelText: 'Keep Meeting' }
                );
            }
            if (!confirmed) return;
            btn.disabled = true;
            try {
                const res = await window.TalkTimeAuth.authenticatedRequest('/api/v1/meetings/' + meetingId, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                });
                if (!res.ok) throw new Error('Failed to cancel meeting');
                showNotification('Meeting cancelled successfully');
                if (window.swrInvalidate) { window.swrInvalidate('my-students'); window.swrInvalidate('dashboard-data'); }
                loadDashboardData();
            } catch (err) {
                console.error('Error cancelling meeting:', err);
                showNotification('Failed to cancel meeting', 'error');
                btn.disabled = false;
            }
        });

        // --- Utility Functions ---
        function showNotification(message, type = 'success') {
            notificationEl.textContent = message;
            notificationEl.className = `fixed bottom-5 right-5 px-6 py-3 rounded-lg shadow-lg ${type === 'success' ? 'bg-success text-white' : 'bg-error text-white'}`;
            notificationEl.classList.remove('hidden');
            
            setTimeout(() => {
                notificationEl.classList.add('hidden');
            }, 5000);
        }

        // --- Data Loading ---
        // Add recursion prevention with timeout fallback
        let isLoadingDashboard = false;
        let loadingTimeout = null;

        window.loadDashboardData = function() { return loadDashboardData(); };
        function loadDashboardData() {
            // Prevent recursive calls
            if (isLoadingDashboard) {
                console.warn('loadDashboardData already in progress, skipping duplicate call');
                return Promise.resolve();
            }

            isLoadingDashboard = true;

            // Safety timeout in case the finally block doesn't execute
            if (loadingTimeout) clearTimeout(loadingTimeout);
            loadingTimeout = setTimeout(() => {
                isLoadingDashboard = false;
            }, 10000);

            const token = window.TalkTimeAuth.getAccessToken();
            const user = window.TalkTimeAuth.getUser();
            // Update dashboard header to "Welcome, [Volunteer Name]" using available auth data
            try {
                const headerEl = document.querySelector('#page-dashboard h1');

                // Meeting scheduling tips rotation state
                const schedulingTips = [
                    'Schedule a meeting and a student will be automatically assigned to you',
                    'Each student can only have one meeting per day to ensure quality time',
                    'Meetings are automatically set to 30 minutes for optimal learning',
                    'All times sync to Kenya timezone to match students\' local schedule',
                    'You\'ll receive reminders here and as push notifications before your meetings',
                    'Students get notified immediately when you schedule a meeting with them',
                    'You can reschedule or cancel a meeting any time before it starts',
                    'All meetings include a secure video room that\'s ready when you are',
                    'Consider the student\'s school hours when picking meeting times',
                    'Your impact grows with each conversation - every meeting matters!',
                    'Tap a student to view their profile and meeting history'
                ];
                let tipIndex = 0;
                let tipInterval = null;

                function ensureTipAnimationSetup(tipElement) {
                    if (!tipElement) return;
                    tipElement.classList.add('greeting-fade', 'show');
                    // Remove previous styling that was applied to h1
                    tipElement.style.fontSize = '';
                    tipElement.style.lineHeight = '';
                    tipElement.style.fontWeight = '';
                }

                function animateTipChange(tipElement, nextText) {
                    if (!tipElement) return;
                    tipElement.classList.remove('show');
                    tipElement.classList.add('enter');
                    setTimeout(() => {
                        // Just use text content since we have a separate icon in the header
                        tipElement.textContent = nextText;
                        tipElement.classList.remove('enter');
                        tipElement.classList.add('show');
                    }, 400);
                }

                function startTipRotation(name) {
                    // Prevent multiple intervals
                    if (tipInterval) return;
                    const tipElement = document.getElementById('rotating-tip');
                    if (!tipElement) return;
                    
                    // Set initial tip and styling
                    ensureTipAnimationSetup(tipElement);
                    tipElement.textContent = schedulingTips[0];
                    
                    tipInterval = setInterval(() => {
                        tipIndex = (tipIndex + 1) % schedulingTips.length;
                        const nextTip = schedulingTips[tipIndex];
                        animateTipChange(tipElement, nextTip);
                    }, 8000); // Show each tip for 8 seconds - more time to read
                    
                    // Clear on unload
                    window.addEventListener('beforeunload', () => {
                        if (tipInterval) clearInterval(tipInterval);
                    });
                }

                function setWelcomeHeader(fromUser) {
                    // Since we removed the welcome header, just start the tips rotation
                    if (!fromUser) return false;
                    let volunteerName = fromUser.fullName || fromUser.full_name || fromUser.name || fromUser.firstName || fromUser.given_name || fromUser.username || fromUser.email || null;
                    if (!volunteerName || typeof volunteerName !== 'string') return false;
                    let displayName = volunteerName;
                    if (displayName.includes(' ')) displayName = displayName.split(' ')[0];
                    else if (displayName.includes('@')) displayName = displayName.split('@')[0];
                    
                    console.log('[Dashboard] Starting tips rotation for:', displayName);
                    
                    // Start showing tips immediately
                    startTipRotation(displayName);
                    
                    return true;
                }

                // 1) Try immediate JWT user
                if (!setWelcomeHeader(user)) {
                    // 2) Try nav loader user (may be set shortly)
                    const navUser = (window.VolunteerNavLoader && window.VolunteerNavLoader.userInfo) || null;
                    if (!setWelcomeHeader(navUser)) {
                        // 3) Verify via API to fetch canonical user
                        window.TalkTimeAuth.authenticatedRequest('/api/v1/jwt-auth/verify', { method: 'GET' })
                          .then(r => r.ok ? r.json() : null)
                          .then(v => {
                              if (v && v.user) setWelcomeHeader(v.user);
                          })
                          .catch(() => {});

                        // 4) Retry after nav initialization (timing-safe)
                        // Single deferred retry. getUser() is a synchronous
                        // localStorage read, so a 500ms polling loop adds nothing
                        // beyond this one late attempt after nav initialization.
                        setTimeout(() => {
                            const lateUser = window.TalkTimeAuth.getUser() ||
                                (window.VolunteerNavLoader && window.VolunteerNavLoader.userInfo) || null;
                            setWelcomeHeader(lateUser);
                        }, 600);
                    }
                }
            } catch (e) {
                console.warn('Failed to personalize dashboard header:', e);
            }
            
            // Show loading state
            if (availableStudentsContainer) {
                availableStudentsContainer.innerHTML = '<div class="text-center py-4"><p class="text-gray-500">Loading available students...</p></div>';
            }
            if (document.getElementById('student-list-unavailable')) {
                document.getElementById('student-list-unavailable').innerHTML = '<div class="text-center py-4"><p class="text-gray-500">Loading unavailable students...</p></div>';
            }
            
            // Render functions consumed by the SWR layer: instant paint from the
            // last snapshot, shimmer while revalidating, re-render only on change.
            function renderDashboardData(data) {

                // Update badge counts in the dashboard nav
                if (window.VolunteerDashboardNav && data.meetings && data.meetings.upcoming) {
                    window.VolunteerDashboardNav.updateUpcomingBadge(data.meetings.upcoming.length);
                }
                
                // Sidebar removed - using FAB widget only for upcoming sessions

                // Floating mini-widget (FAB) for Upcoming
                // Create container once
                let fabRoot = document.getElementById('upcoming-fab');
                if (!fabRoot && data.meetings && data.meetings.upcoming && data.meetings.upcoming.length > 0) {
                    const upcoming = data.meetings.upcoming.slice(0, 3);
                    fabRoot = document.createElement('div');
                    fabRoot.id = 'upcoming-fab';
                    fabRoot.className = 'fixed bottom-6 right-6 z-40';
                    fabRoot.innerHTML = `
                              <div class="relative">
                                <button id="upcoming-fab-btn" aria-label="Open upcoming meetings" aria-expanded="false"
                                  class="group flex items-center gap-2 rounded-full px-4 h-12 shadow-lg bg-brand-primary text-white hover:bg-brand-primary-dark focus:outline-none focus:ring-4 focus:ring-brand-primary transition">
                                  <i class="fas fa-calendar-check"></i>
                                  <span class="text-sm font-semibold">Upcoming</span>
                                  <span id="upcoming-fab-count" class="ml-1 inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/20 text-xs">0</span>
                                </button>
                                <div id="upcoming-fab-panel" role="dialog" aria-label="Upcoming meetings"
                                  class="absolute bottom-16 right-0 w-80 max-w-[90vw] rounded-xl border border-white/40 bg-white/70 backdrop-blur shadow-xl p-3 opacity-0 scale-95 pointer-events-none transition duration-200">
                                  <div class="flex items-center justify-between px-1 pb-2">
                                    <h4 class="text-sm font-semibold text-gray-800">Upcoming Meetings</h4>
                                    <button id="upcoming-fab-close" aria-label="Close" class="text-gray-500 hover:text-gray-700">
                                      <i class="fas fa-times"></i>
                                    </button>
                                  </div>
                                  <div id="upcoming-fab-list" class="space-y-2 max-h-72 overflow-auto pr-1"></div>
                                  <div class="pt-2 flex justify-end">
                                    <a href="/volunteer/dashboard/upcoming" class="text-xs font-medium text-brand-primary hover:text-brand-primary">View all</a>
                                  </div>
                                </div>
                              </div>`;
                    document.body.appendChild(fabRoot);

                    // Toggle logic
                    const btn = document.getElementById('upcoming-fab-btn');
                    const panel = document.getElementById('upcoming-fab-panel');
                    const closeBtn = document.getElementById('upcoming-fab-close');
                    function openPanel() {
                        panel.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
                        btn.setAttribute('aria-expanded', 'true');
                    }
                    function closePanel() {
                        panel.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
                        btn.setAttribute('aria-expanded', 'false');
                    }
                    btn.addEventListener('click', () => {
                        const expanded = btn.getAttribute('aria-expanded') === 'true';
                        if (expanded) closePanel(); else openPanel();
                    });
                    closeBtn.addEventListener('click', closePanel);
                    document.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape') closePanel();
                    });
                    document.addEventListener('click', (e) => {
                        const within = fabRoot.contains(e.target);
                        const panelEl = document.getElementById('upcoming-fab-panel');
                        if (!within && panelEl && !panelEl.classList.contains('pointer-events-none')) closePanel();
                    });

                    // Render list into FAB
                    const fabCount = document.getElementById('upcoming-fab-count');
                    if (fabCount) fabCount.textContent = String(upcoming.length);
                    const fabList = document.getElementById('upcoming-fab-list');
                    if (fabList) {
                        const fabItems = upcoming.map(item => {
                            const when = new Date(item.time || item.start_time || item.scheduled_for || item.meeting_time || Date.now());
                            const localTime = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            const localDate = when.toLocaleDateString();
                            const studentName = (item.student && (item.student.full_name || item.student.name)) || item.student_name || 'Student';
                            const avatar = (item.student && item.student.photo_url) || item.student_photo_url || '';
                            return `
                              <a href="/volunteer/dashboard/upcoming" class="flex items-center gap-3 p-2 rounded-lg border border-white/40 bg-white/60 hover:bg-white/80 transition" aria-label="Upcoming session with ${studentName} on ${localDate} at ${localTime}">
                                <div class="w-9 h-9 rounded-full overflow-hidden bg-gray-100 ring-2 ring-brand flex items-center justify-center">
                                  <img src="${avatar || '/images/default-profile.svg'}" alt="${studentName}" loading="lazy" class="w-full h-full object-cover upc-avatar-img" />
                                  <svg class="w-5 h-5 text-brand-primary ${avatar ? 'hidden' : ''} upc-avatar-fallback" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                                    <path d="M10 10a4 4 0 100-8 4 4 0 000 8zM2 16a8 8 0 1116 0v1H2v-1z" />
                                  </svg>
                                </div>
                                <div class="flex-1 min-w-0">
                                  <p class="text-sm font-semibold text-gray-800 truncate">${studentName}</p>
                                  <p class="text-xs text-gray-500">${localDate} • ${localTime}</p>
                                </div>
                                <div class="shrink-0 text-gray-400"><i class="fas fa-video"></i></div>
                              </a>`;
                        }).join('');
                        fabList.innerHTML = fabItems || '<p class="text-xs text-gray-500 px-1">No upcoming sessions.</p>';
                        // Attach avatar fallback handlers (FAB)
                        fabList.querySelectorAll('.upc-avatar-img').forEach(img => {
                            img.addEventListener('error', function () {
                                this.classList.add('hidden');
                                const fallback = this.parentElement.querySelector('.upc-avatar-fallback');
                                if (fallback) fallback.classList.remove('hidden');
                            }, { once: true });
                        });
                    }
                }

            }

            function renderMyStudents(data) {
                const myStudents = data.data || [];
                // Soonest meeting first; students with no upcoming meeting sink to the bottom
                myStudents.sort((a, b) => {
                    const ta = a.nextMeeting ? new Date(a.nextMeeting.scheduledTime).getTime() : Infinity;
                    const tb = b.nextMeeting ? new Date(b.nextMeeting.scheduledTime).getTime() : Infinity;
                    return ta - tb;
                });
                students = myStudents;

                if (availableStudentsContainer) {
                    if (myStudents.length === 0) {
                        // Empty state
                        availableStudentsContainer.innerHTML = `
                            <div class="text-center py-10">
                                <div class="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style="background: linear-gradient(135deg, rgba(209,1,0,0.1), rgba(56,103,255,0.1));">
                                    <i class="fas fa-calendar-plus text-2xl" style="color: var(--brand-primary);"></i>
                                </div>
                                <h3 class="text-lg font-semibold text-gray-800 mb-2">No Students Yet</h3>
                                <p class="text-sm text-gray-500 mb-4 max-w-sm mx-auto">Schedule your first meeting and a student will be automatically assigned to you.</p>
                                <a href="/volunteer/dashboard/schedule.html" class="inline-flex items-center justify-center gap-2 text-white px-6 py-3 rounded-xl font-semibold transition-all hover:shadow-lg text-sm" style="background: var(--brand-primary);">
                                    <i class="fas fa-calendar-plus"></i>
                                    Schedule a Meeting
                                </a>
                            </div>`;
                        const scheduleCta = document.getElementById('schedule-new-cta');
                        if (scheduleCta) scheduleCta.classList.add('hidden');
                    } else {
                        const cardsHtml = myStudents.map((student, index) => {
                            const rawName = student.fullName || 'Student';
                            const studentName = rawName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
                            const nameParts = studentName.trim().split(' ').filter(p => p);
                            const initials = nameParts.length >= 2
                                ? (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase()
                                : studentName.charAt(0).toUpperCase();

                            const hasValidPhoto = student.photoUrl &&
                                student.photoUrl !== '/images/default-profile.svg' &&
                                student.photoUrl.trim() !== '';

                            const agePart = student.age ? student.age + ' years' : '';
                            const genderRaw = student.gender ? student.gender.toLowerCase() : '';
                            const genderPart = genderRaw === 'm' || genderRaw === 'male' ? 'Boy' : genderRaw === 'f' || genderRaw === 'female' ? 'Girl' : student.gender || '';
                            const ageGenderLine = [agePart, genderPart].filter(Boolean).join(' \u00B7 ');

                            // Format next meeting time
                            const nextTime = student.nextMeeting ? new Date(student.nextMeeting.scheduledTime) : null;
                            let meetingInfo = '';
                            if (nextTime) {
                                const dateStr = nextTime.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                const timeStr = nextTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                meetingInfo = dateStr + ' ' + timeStr;
                            }

                            const meetingCount = student.activeMeetingCount || 0;
                            const isLast = index === myStudents.length - 1;

                            // Auto-start countdown band — shown only when this student has an upcoming meeting
                            const mid = student.nextMeeting && student.nextMeeting.id ? student.nextMeeting.id : '';
                            const countdownBand = nextTime
                                ? '<div data-countdown-band class="schedule-countdown-band">' +
                                      '<div class="scb-timer" id="schedule-countdown-' + mid + '" data-start-time="' + student.nextMeeting.scheduledTime + '">--</div>' +
                                      '<div class="scb-sub">Meeting starts automatically. No action needed — your call opens by itself when the timer reaches zero. Just be ready.</div>' +
                                  '</div>'
                                : '';

                            // Thin quick-action pills — full actions live on the detail page.
                            // Instant Call is deliberately never offered here.
                            const admission = student.admissionNumber || student.id;
                            const schedParams = 'id=' + (student.userId || student.id) + '&admission=' + admission + '&name=' + encodeURIComponent(studentName);
                            const detailParams = 'id=' + student.id + '&admission=' + admission + '&name=' + encodeURIComponent(studentName);
                            const quickActions = '<div class="sc-quick" data-quick-actions>' +
                                (nextTime
                                    ? '<a href="/volunteer/dashboard/schedule.html?' + schedParams + '&meeting=' + mid + '" class="sc-qbtn sc-qbtn-green"><i class="fas fa-calendar-alt"></i>Reschedule</a>'
                                    : '<a href="/volunteer/dashboard/schedule.html?' + schedParams + '" class="sc-qbtn sc-qbtn-green"><i class="fas fa-calendar-plus"></i>Schedule</a>') +
                                '<a href="/volunteer/dashboard/student-detail.html?' + detailParams + (mid ? '&meeting=' + mid : '') + '&action=message" class="sc-qbtn"><i class="far fa-comment-dots"></i>Message</a>' +
                                (nextTime
                                    ? '<button type="button" class="sc-qbtn sc-qbtn-red sc-cancel-btn" data-meeting-id="' + mid + '" data-student-name="' + studentName + '"><i class="far fa-calendar-times"></i>Cancel</button>'
                                    : '') +
                            '</div>';

                            return '<div class="student-card cursor-pointer" data-student-id="' + student.id + '" data-student-admission="' + (student.admissionNumber || student.id) + '" data-student-name="' + studentName + '" data-meeting-id="' + (student.nextMeeting && student.nextMeeting.id ? student.nextMeeting.id : '') + '" style="padding:12px 16px;border:1px solid rgba(22,163,74,0.15);transition:border-color 0.15s ease" onmouseenter="this.style.borderColor=\'rgba(22,163,74,0.4)\'" onmouseleave="this.style.borderColor=\'rgba(22,163,74,0.15)\'">' +
                                '<div style="display:flex;align-items:center;gap:16px">' +
                                    '<div style="width:70px;height:70px;border-radius:50%;background:rgba(22,163,74,0.1);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0">' +
                                        (hasValidPhoto
                                            ? '<img src="' + student.photoUrl + '" alt="' + studentName + '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'flex\'" style="width:100%;height:100%;object-fit:cover;border-radius:50%"><span style="display:none;font-size:26px;font-weight:700;color:#16a34a">' + initials + '</span>'
                                            : '<span style="font-size:26px;font-weight:700;color:#16a34a">' + initials + '</span>') +
                                    '</div>' +
                                    '<div style="flex:1;min-width:0">' +
                                        '<div style="font-weight:600;font-size:22px;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2">' + studentName + '</div>' +
                                        '<div style="font-size:18px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2">' + (ageGenderLine || 'Student') + '</div>' +
                                    '</div>' +
                                    '<div style="flex-shrink:0;text-align:right;">' +
                                        (meetingInfo ? '<div style="font-size:14px;color:#16a34a;font-weight:500">' + meetingInfo + '</div>' : '') +
                                        '<div style="font-size:12px;color:#9ca3af;margin-top:2px;">' + meetingCount + ' meeting' + (meetingCount !== 1 ? 's' : '') + '</div>' +
                                    '</div>' +
                                    '<div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:1px;color:#16a34a">' +
                                        '<svg style="width:24px;height:24px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>' +
                                        '<span style="font-size:10.5px;font-weight:600;letter-spacing:.02em;white-space:nowrap">Details</span>' +
                                    '</div>' +
                                '</div>' +
                                countdownBand +
                                quickActions +
                            '</div>' +
                            (!isLast ? '<div style="height:1px;background:#f3f4f6;margin-left:102px"></div>' : '');
                        }).join('');
                        availableStudentsContainer.innerHTML = cardsHtml;

                        // Start the live countdowns — clear previous tickers first so
                        // the cached-paint + fresh-paint double render can't leak intervals
                        cardCountdownIntervals.forEach(clearInterval);
                        cardCountdownIntervals = [];
                        myStudents.forEach(s => {
                            if (s.nextMeeting && s.nextMeeting.id && window.renderMeetingCountdown) {
                                const el = document.getElementById('schedule-countdown-' + s.nextMeeting.id);
                                if (el) {
                                    const iid = window.renderMeetingCountdown(el, s.nextMeeting.scheduledTime);
                                    if (iid) cardCountdownIntervals.push(iid);
                                }
                            }
                        });

                        const scheduleCta = document.getElementById('schedule-new-cta');
                        if (scheduleCta) scheduleCta.classList.remove('hidden');
                    }
                }
            }

            // SWR when available (instant cached paint + shimmer revalidate); plain fetch otherwise
            const fetchDashboard = window.swrFetch
                ? window.swrFetch({ key: 'dashboard-data', url: '/api/v1/volunteers/dashboard-data', render: renderDashboardData })
                : window.TalkTimeAuth.authenticatedRequest('/api/v1/volunteers/dashboard-data', { method: 'GET' })
                    .then(r => { if (!r.ok) throw new Error('Failed to load dashboard data: ' + r.status); return r.json(); })
                    .then(d => { renderDashboardData(d); return d; });
            fetchDashboard.catch(error => console.error('Error loading dashboard data:', error));

            const fetchStudents = window.swrFetch
                ? window.swrFetch({ key: 'my-students', url: '/api/v1/volunteers/my-students', container: availableStudentsContainer, render: renderMyStudents })
                : window.TalkTimeAuth.authenticatedRequest('/api/v1/volunteers/my-students', { method: 'GET' })
                    .then(r => { if (!r.ok) throw new Error('Failed to load students: ' + r.status); return r.json(); })
                    .then(d => { renderMyStudents(d); return d; });
            fetchStudents
            .catch(error => {
                console.error('Error loading my students:', error);
                showNotification('Failed to load student data: ' + error.message, 'error');
                if (availableStudentsContainer) {
                    availableStudentsContainer.innerHTML = '<div class="text-center py-8"><div class="bg-yellow-50 border border-yellow-200 rounded-lg p-6"><h3 class="text-lg font-semibold text-yellow-900 mb-2">Unable to Load Students</h3><p class="text-yellow-700 mb-4">There might be a connection issue.</p><button onclick="loadDashboardData()" class="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition-colors">Try Again</button></div></div>';
                }
            })
            .finally(() => {
                // Reset the loading flag and clear timeout
                if (loadingTimeout) clearTimeout(loadingTimeout);
                isLoadingDashboard = false;
                console.log('loadDashboardData completed, flag reset');
            });
        }

        
        

        
        // Initialize TalkTime Auth for volunteers FIRST
        window.TalkTimeAuth = new TalkTimeJWTAuth('volunteer');

        // Always-on auto-launch: opens the call at meeting time on any open dashboard tab
        if (window.MeetingAutoLauncher) window.MeetingAutoLauncher.start();

        // --- Initial Load ---
        loadDashboardData();

        // --- Floating Widget Stack ---
        // Prevents newsletter pill and upcoming FAB from overlapping.
        // Newsletter sits on top, upcoming FAB below. If only one exists it occupies the bottom position.
        (function initFloatingStack() {
            const stack = document.createElement('div');
            stack.id = 'floating-widgets-stack';
            document.body.appendChild(stack);

            function adoptWidget(el) {
                if (el && el.parentNode !== stack) {
                    stack.appendChild(el);
                }
            }

            function gather() {
                const newsletter = document.getElementById('newsletter-widget');
                const fab = document.getElementById('upcoming-fab');
                // Newsletter first (top), FAB second (bottom)
                adoptWidget(newsletter);
                adoptWidget(fab);
            }

            // Both widgets are created asynchronously - one initial sweep for
            // anything already in the DOM, then the observer catches the rest
            gather();
            const observer = new MutationObserver(() => {
                gather();
                if (stack.children.length >= 2) observer.disconnect();
            });
            observer.observe(document.body, { childList: true });
            setTimeout(() => observer.disconnect(), 10000);
        })();

        // --- Notification Permission Functions ---
        
        // Notification permission check is handled by the shared notification-enforcer.js on page load

        // Notification permission request — delegates to the shared modal
        function requestNotificationPermission() {
            showNotificationRequiredMessage();
        }

        // Send an enhanced test notification with action buttons
        function sendEnhancedTestNotification() {
            if (Notification.permission === 'granted') {
                console.log('🔔 Sending enhanced test notification...');
                
                const notification = new Notification('TalkTime Notifications Enabled', {
                    body: 'You will receive meeting reminders, instant call alerts, and important updates.',
                    icon: '/talktime.ico',
                    badge: '/talktime.ico',
                    tag: 'talktime-enhanced-test',
                    requireInteraction: false
                });

                notification.onclick = function(event) {
                    console.log('✅ Enhanced test notification clicked');
                    window.focus();
                    window.location.href = '/volunteer/dashboard/students.html';
                    notification.close();
                };

                // Auto-close after 8 seconds for test
                setTimeout(() => {
                    notification.close();
                }, 8000);
            }
        }

        // Function removed - now defined inside DOMContentLoaded handler

        // Function removed - now defined inside DOMContentLoaded handler

        // Function removed - now defined inside DOMContentLoaded handler

        // Function removed - now defined inside DOMContentLoaded handler

        // Function removed - now defined inside DOMContentLoaded handler

        // Function removed - now defined inside DOMContentLoaded handler

        // Function removed - now defined inside DOMContentLoaded handler

        // Notification info is now shown within the shared NotificationPermissionModal
        function showNotificationInfo() { showNotificationRequiredMessage(); }
        function closeNotificationInfo() {}

        // Banner removed — notification permission handled by the shared modal
        function updateWarningForDeniedPermission() {}
        function showBrowserNotificationGuide() { showNotificationRequiredMessage(); }

        // Function removed - now defined inside DOMContentLoaded handler

        // Function removed - now defined inside DOMContentLoaded handler

        // Notification initialization moved to main DOMContentLoaded handler

        // Global functions now defined inside DOMContentLoaded handlers

        // ============================================
        // SHOW STUDENT MESSAGE MODAL
        // Called when student sends a message in response to instant call
        // ============================================
        function showStudentMessageModal(data) {
            const senderName = data.senderName || 'Student';
            const senderId = data.senderId;
            const messageContent = data.message || '';

            // Remove any existing modal
            const existingModal = document.getElementById('student-message-modal');
            if (existingModal) existingModal.remove();

            const modalHtml = `
                <div id="student-message-modal" class="fixed inset-0 z-[9999] flex items-center justify-center p-4" style="background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);">
                    <div class="bg-white rounded-2xl max-w-md w-full overflow-hidden transform transition-all animate-modal-in" style="box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);">
                        <!-- Header - Primary Red Background -->
                        <div class="p-6 text-center" style="background: #D10100;">
                            <div class="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3" style="box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                                <svg class="w-8 h-8" style="color: #D10100;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
                                </svg>
                            </div>
                            <h2 class="text-xl font-bold" style="color: #ffffff; font-family: 'Poppins', sans-serif;">Message from ${senderName}</h2>
                            <p class="text-sm mt-1" style="color: rgba(255,255,255,0.9);">The student replied to your call</p>
                        </div>

                        <!-- Message Content - White Background -->
                        <div class="p-6" style="background: #ffffff;">
                            <div class="rounded-xl p-4 mb-5" style="background: #f9fafb; border: 1px solid #e5e7eb;">
                                <p class="text-center text-lg" style="color: #111827; font-family: 'Poppins', sans-serif;">"${messageContent}"</p>
                            </div>

                            <div class="rounded-lg p-3 mb-5" style="background: rgba(209,1,0,0.05); border: 1px solid rgba(209,1,0,0.2);">
                                <div class="flex items-start gap-2">
                                    <svg class="w-5 h-5 mt-0.5 flex-shrink-0" style="color: #D10100;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                    <p class="text-sm" style="color: #374151;">You can continue this conversation in the Messages section.</p>
                                </div>
                            </div>

                            <div class="flex flex-col gap-3">
                                <a href="/volunteer/dashboard/messages.html${senderId ? '?openConversation=' + senderId : ''}"
                                   class="w-full py-3.5 px-4 font-semibold rounded-xl transition-all text-center flex items-center justify-center gap-2"
                                   style="background: #D10100; color: #ffffff; font-family: 'Poppins', sans-serif; box-shadow: 0 4px 6px -1px rgba(209, 1, 0, 0.2);"
                                   onmouseover="this.style.background='#7d0000'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 10px 15px -3px rgba(209, 1, 0, 0.3)';"
                                   onmouseout="this.style.background='#D10100'; this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 6px -1px rgba(209, 1, 0, 0.2)';">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                                    </svg>
                                    Open Full Chat
                                </a>
                                <button id="close-student-message-modal"
                                        class="w-full py-3.5 px-4 font-semibold rounded-xl transition-all"
                                        style="background: #f9fafb; color: #374151; border: 1px solid #e5e7eb; font-family: 'Poppins', sans-serif;"
                                        onmouseover="this.style.background='#e5e7eb';"
                                        onmouseout="this.style.background='#f9fafb';">
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Add close button handler
            document.getElementById('close-student-message-modal').addEventListener('click', () => {
                const modal = document.getElementById('student-message-modal');
                if (modal) modal.remove();
            });

            // Close on backdrop click
            document.getElementById('student-message-modal').addEventListener('click', (e) => {
                if (e.target.id === 'student-message-modal') {
                    e.target.remove();
                }
            });

            // Add animation styles if not already present
            if (!document.getElementById('modal-animation-styles')) {
                const styleEl = document.createElement('style');
                styleEl.id = 'modal-animation-styles';
                styleEl.textContent = `
                    @keyframes modal-in {
                        from { opacity: 0; transform: scale(0.95) translateY(-10px); }
                        to { opacity: 1; transform: scale(1) translateY(0); }
                    }
                    .animate-modal-in {
                        animation: modal-in 0.3s ease-out forwards;
                    }
                `;
                document.head.appendChild(styleEl);
            }
        }

        async function initializeApprovalStatus() {
            try {
                // Use the new JWT authentication utility
                if (!window.TalkTimeAuth.isAuthenticated()) {
                    console.log('Volunteer not authenticated');
                    return;
                }

                // Get user info using JWT auth utility
                const response = await window.TalkTimeAuth.authenticatedRequest('/api/v1/jwt-auth/verify');
                
                if (response.ok) {
                    const userInfo = await response.json();
                    

                }
            } catch (error) {
                console.error('Error initializing volunteer approval status:', error);
            }
        }
        initializeApprovalStatus();
    });
    