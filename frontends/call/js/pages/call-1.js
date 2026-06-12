
        // WebRTC Configuration
        // Smart Environment Detection
        const isLocalDevelopment = window.location.hostname === 'localhost' || 
                                   window.location.hostname === '127.0.0.1' || 
                                   window.location.hostname.includes('dev') ||
                                   window.location.port === '3000' ||
                                   window.location.port === '8080';
        
        console.log('🌍 Environment detected:', isLocalDevelopment ? 'LOCAL DEVELOPMENT' : 'PRODUCTION');
        
        // DEV MODE indicator removed for cleaner UI
        
        // WebRTC Configuration — STUN-only default, TURN added dynamically from backend
        let pcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10,
            bundlePolicy: 'balanced',
            rtcpMuxPolicy: 'require',
            iceTransportPolicy: 'all'
        };

        // Fetch TURN credentials from backend so they stay out of client source
        async function fetchIceConfig() {
            try {
                const token = localStorage.getItem('volunteer_talktime_access_token')
                    || localStorage.getItem('student_talktime_access_token')
                    || localStorage.getItem('talktime_access_token');
                if (!token) {
                    console.warn('No auth token available — using STUN-only ICE config');
                    return;
                }
                const res = await fetch('/api/v1/webrtc/config', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                if (data.iceServers && data.iceServers.length) {
                    pcConfig.iceServers = data.iceServers;
                    console.log('ICE config fetched — TURN servers:', data.iceServers.length > 2 ? 'configured' : 'none');
                }
            } catch (err) {
                console.warn('Could not fetch ICE config, using STUN-only fallback:', err.message);
            }
        }

        // Extract URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const studentId = urlParams.get('studentId');
        const studentName = urlParams.get('studentName');
        const volunteerName = urlParams.get('volunteerName');
        const volunteerImage = urlParams.get('volunteerImage');
        const volunteerIdFromUrl = urlParams.get('volunteerId');
        const isInstantCall = urlParams.get('instant') === 'true';

        // SECURITY: Get role from URL - NO DEFAULT, must be explicit
        let userRole = urlParams.get('role');

        // SECURITY: Validate role against available auth tokens
        function detectAndValidateRole() {
            const volunteerToken = localStorage.getItem('volunteer_talktime_access_token');
            const studentToken = localStorage.getItem('student_talktime_access_token');

            // If URL has role=student, verify student token exists
            if (userRole === 'student') {
                if (studentToken) {
                    console.log('✅ Student role confirmed with valid token');
                    return 'student';
                }
                // Student token missing but role says student - still treat as student for security
                console.warn('⚠️ Student role but no student token - proceeding as student');
                return 'student';
            }

            // If URL has role=volunteer, verify volunteer token exists
            if (userRole === 'volunteer') {
                if (volunteerToken) {
                    console.log('✅ Volunteer role confirmed with valid token');
                    return 'volunteer';
                }
                console.warn('⚠️ Volunteer role but no volunteer token');
                return 'volunteer';
            }

            // No role in URL - detect from tokens
            if (studentToken && !volunteerToken) {
                console.log('🔄 Auto-detected role as STUDENT from token');
                return 'student';
            }
            if (volunteerToken && !studentToken) {
                console.log('🔄 Auto-detected role as VOLUNTEER from token');
                return 'volunteer';
            }

            // Both tokens or no tokens - use URL role or error
            console.error('❌ Cannot determine role - no clear token');
            return userRole || 'unknown';
        }

        userRole = detectAndValidateRole();
        console.log(`🎯 Final validated role: ${userRole}`);

        // CRITICAL: Store original role IMMEDIATELY after validation
        // This MUST happen BEFORE any socket handlers can corrupt the userRole variable
        // The stored value is used by redirectAfterCallEnd() to ensure proper navigation
        if (userRole && userRole !== 'unknown') {
            sessionStorage.setItem('call_page_role', userRole);
            sessionStorage.setItem('talktime_current_role', userRole);
            console.log('💾 Original role stored in sessionStorage:', userRole);
        }

        // SECURITY: Role-based UI control - hide end call button for students
        function applyRoleBasedUI() {
            const endCallBtn = document.getElementById('endCallBtn');
            if (userRole === 'student' && endCallBtn) {
                endCallBtn.style.display = 'none';
                console.log('🔒 End call button hidden for student');
            }
        }

        // Apply immediately and also after DOM load
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', applyRoleBasedUI);
        } else {
            applyRoleBasedUI();
        }
        // ─── In-call Chat ───────────────────────────────────────────
        const chatDrawer = document.getElementById('chatDrawer');
        const chatBackdrop = document.getElementById('chatBackdrop');
        const chatMessages = document.getElementById('chatMessages');
        const chatInput = document.getElementById('chatInput');
        const chatSendBtn = document.getElementById('chatSendBtn');
        const chatUnreadBadge = document.getElementById('chatUnreadBadge');
        const chatRecipientName = document.getElementById('chatRecipientName');
        let chatOpen = false;
        let chatRecipientId = null;
        let chatCurrentUserId = null;
        let chatUnreadCount = 0;
        let chatLoaded = false;

        // Resolve auth token (same pattern as fetchIceConfig)
        function getChatToken() {
            return localStorage.getItem('volunteer_talktime_access_token')
                || localStorage.getItem('student_talktime_access_token')
                || localStorage.getItem('talktime_access_token');
        }

        // Resolve current user ID from JWT
        function getChatUserId() {
            if (chatCurrentUserId) return chatCurrentUserId;
            try {
                const token = getChatToken();
                if (token) {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    chatCurrentUserId = payload.id || payload.userId || payload.sub;
                }
            } catch (e) { /* ignore */ }
            return chatCurrentUserId;
        }

        // Determine chat recipient ID
        // Volunteer → studentId from URL; Student → volunteerId from URL or meeting lookup
        function resolveChatRecipientId() {
            if (chatRecipientId) return chatRecipientId;
            if (userRole === 'volunteer' && studentId) {
                chatRecipientId = parseInt(studentId);
            } else if (userRole === 'student' && volunteerIdFromUrl) {
                chatRecipientId = parseInt(volunteerIdFromUrl);
            }
            return chatRecipientId;
        }

        // Set recipient name in header
        function updateChatRecipientName() {
            if (userRole === 'volunteer' && studentName) {
                chatRecipientName.textContent = decodeURIComponent(studentName);
            } else if (userRole === 'student' && volunteerName) {
                chatRecipientName.textContent = decodeURIComponent(volunteerName);
            } else {
                chatRecipientName.textContent = 'Chat';
            }
        }
        updateChatRecipientName();

        function toggleChatDrawer() {
            chatOpen = !chatOpen;
            chatDrawer.classList.toggle('active', chatOpen);
            chatBackdrop.classList.toggle('active', chatOpen);
            if (chatOpen) {
                if (!chatLoaded) loadChatConversation();
                chatUnreadCount = 0;
                chatUnreadBadge.classList.remove('visible');
                chatUnreadBadge.textContent = '';
                setTimeout(() => chatInput.focus(), 300);
            }
        }

        function escapeHtml(text) {
            const d = document.createElement('div');
            d.textContent = text;
            return d.innerHTML;
        }

        function formatChatTime(dateStr) {
            return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        async function loadChatConversation() {
            let recipientId = resolveChatRecipientId();
            const token = getChatToken();
            if (!recipientId || !token) {
                chatMessages.innerHTML = '<div class="chat-empty-state"><p>Send a message to start chatting</p></div>';
                chatLoaded = true;
                return;
            }

            try {
                const res = await fetch(`/api/v1/messages/conversation/${recipientId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                const myId = getChatUserId();

                if (data.messages && data.messages.length > 0) {
                    chatMessages.innerHTML = data.messages.map(msg => {
                        const isSent = msg.isSentByMe || msg.senderId === myId;
                        return `<div class="chat-bubble ${isSent ? 'sent' : 'received'}">
                            <p>${escapeHtml(msg.content)}</p>
                            <div class="chat-time">${formatChatTime(msg.createdAt)}</div>
                        </div>`;
                    }).join('');
                    setTimeout(() => { chatMessages.scrollTop = chatMessages.scrollHeight; }, 50);
                } else {
                    chatMessages.innerHTML = '<div class="chat-empty-state"><p>Send a message to start chatting</p></div>';
                }

                // If student, resolve volunteer ID from conversation partner
                if (userRole === 'student' && data.otherUser && data.otherUser.id) {
                    chatRecipientId = data.otherUser.id;
                }
            } catch (err) {
                chatMessages.innerHTML = '<div class="chat-empty-state"><p>Could not load messages</p></div>';
            }
            chatLoaded = true;
        }

        async function sendChatMessage() {
            const content = chatInput.value.trim();
            const recipientId = resolveChatRecipientId();
            const token = getChatToken();
            if (!content || !recipientId || !token) return;

            chatInput.value = '';
            updateChatSendBtn();

            // Remove empty state
            const empty = chatMessages.querySelector('.chat-empty-state');
            if (empty) empty.remove();

            // Optimistic UI
            const msgEl = document.createElement('div');
            msgEl.className = 'chat-bubble sent sending';
            msgEl.innerHTML = `<p>${escapeHtml(content)}</p><div class="chat-time">${formatChatTime(new Date().toISOString())}</div>`;
            chatMessages.appendChild(msgEl);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            try {
                const res = await fetch('/api/v1/messages/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ recipientId: parseInt(recipientId), content })
                });
                if (res.ok) {
                    msgEl.classList.remove('sending');
                } else {
                    throw new Error('Send failed');
                }
            } catch (err) {
                msgEl.classList.remove('sending');
                msgEl.classList.add('failed');
            }
        }

        function updateChatSendBtn() {
            chatSendBtn.disabled = !chatInput.value.trim();
        }

        chatInput.addEventListener('input', updateChatSendBtn);
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!chatSendBtn.disabled) sendChatMessage();
            }
        });

        // Inline notification chime — two-note ascending triangle wave
        let _chatAudioCtx = null;
        function playChatNotificationSound() {
            try {
                if (!_chatAudioCtx) _chatAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
                if (_chatAudioCtx.state === 'suspended') _chatAudioCtx.resume();
                const notes = [523, 659]; // C5 → E5
                const dur = 0.12, gap = 0.06, vol = 0.4;
                notes.forEach((freq, i) => {
                    const osc = _chatAudioCtx.createOscillator();
                    const gain = _chatAudioCtx.createGain();
                    osc.connect(gain);
                    gain.connect(_chatAudioCtx.destination);
                    osc.type = 'triangle';
                    osc.frequency.value = freq;
                    const t = _chatAudioCtx.currentTime + i * (dur + gap);
                    gain.gain.setValueAtTime(0, t);
                    gain.gain.linearRampToValueAtTime(vol * 0.8, t + dur * 0.3);
                    gain.gain.linearRampToValueAtTime(0, t + dur);
                    osc.start(t);
                    osc.stop(t + dur);
                });
            } catch (e) { /* silent fail */ }
        }

        // Listen for incoming chat messages on the existing socket
        function setupChatSocketListener() {
            if (typeof socket === 'undefined' || !socket) {
                setTimeout(setupChatSocketListener, 500);
                return;
            }
            socket.on('new-chat-message', (data) => {
                const myId = getChatUserId();
                if (data.senderId === myId) return;

                // Play notification chime for incoming message
                playChatNotificationSound();

                // Auto-resolve recipient for students
                if (userRole === 'student' && !chatRecipientId && data.senderId) {
                    chatRecipientId = data.senderId;
                }

                if (chatOpen) {
                    const empty = chatMessages.querySelector('.chat-empty-state');
                    if (empty) empty.remove();
                    const msgEl = document.createElement('div');
                    msgEl.className = 'chat-bubble received';
                    msgEl.innerHTML = `<p>${escapeHtml(data.content)}</p><div class="chat-time">${formatChatTime(data.createdAt || new Date().toISOString())}</div>`;
                    chatMessages.appendChild(msgEl);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                } else {
                    chatUnreadCount++;
                    chatUnreadBadge.textContent = chatUnreadCount > 9 ? '9+' : chatUnreadCount;
                    chatUnreadBadge.classList.add('visible');
                }
            });
        }
        // Start listening once socket is available (socket connects later in the script)
        setTimeout(setupChatSocketListener, 1000);

        console.log(`📋 Volunteer info from URL: ${volunteerName}, ${volunteerImage}`);

        // Store student data globally
        let studentData = null;

        // Get volunteer data from JWT and user data
        let volunteerData = null;
        
        // Debug: Log all localStorage keys to see what's available
        console.log('Available localStorage keys:', Object.keys(localStorage));
        console.log('localStorage contents:', {
            'talktime_user': localStorage.getItem('talktime_user'),
            'talktime_access_token': localStorage.getItem('talktime_access_token'),
            'talktime_refresh_token': localStorage.getItem('talktime_refresh_token'),
            'volunteerToken': localStorage.getItem('volunteerToken'),
            'token': localStorage.getItem('token')
        });
        
        try {
            // First try to get user data directly from localStorage (with volunteer prefix)
            const userData = localStorage.getItem('volunteer_talktime_user');
            if (userData) {
                volunteerData = JSON.parse(userData);
                console.log('Got volunteer data from volunteer_talktime_user:', volunteerData);
            } else {
                // Fallback to parsing JWT token (with volunteer prefix)
                const token = localStorage.getItem('volunteer_talktime_access_token');
                if (token) {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    volunteerData = payload;
                    console.log('Parsed volunteer data from volunteer_talktime_access_token JWT:', volunteerData);
                } else {
                    // Try without prefix as fallback
                    const fallbackUserData = localStorage.getItem('talktime_user');
                    const fallbackToken = localStorage.getItem('talktime_access_token');
                    
                    if (fallbackUserData) {
                        volunteerData = JSON.parse(fallbackUserData);
                        console.log('Got volunteer data from talktime_user (fallback):', volunteerData);
                    } else if (fallbackToken) {
                        const payload = JSON.parse(atob(fallbackToken.split('.')[1]));
                        volunteerData = payload;
                        console.log('Parsed volunteer data from talktime_access_token JWT (fallback):', volunteerData);
                    } else {
                        console.log('No volunteer token found in localStorage');
                        // Try all possible keys
                        const allKeys = Object.keys(localStorage);
                        const tokenKeys = allKeys.filter(key => key.toLowerCase().includes('token') || key.toLowerCase().includes('user') || key.toLowerCase().includes('volunteer'));
                        console.log('Found potential token/user keys:', tokenKeys);
                    }
                }
            }
        } catch (error) {
            console.error('Error getting volunteer data:', error);
            // Try alternative token keys as final fallback
            try {
                const altToken = localStorage.getItem('volunteerToken') || localStorage.getItem('token');
                if (altToken) {
                    const payload = JSON.parse(atob(altToken.split('.')[1]));
                    volunteerData = payload;
                    console.log('Parsed volunteer data from alternative token:', volunteerData);
                }
            } catch (altError) {
                console.error('Error parsing alternative token:', altError);
            }
        }

        // Function to fetch real student data
        async function fetchStudentData() {
            if (!studentId || userRole !== 'volunteer') return null;
            
            try {
                const token = localStorage.getItem('volunteer_talktime_access_token');
                if (!token) return null;
                
                const response = await fetch(`/api/v1/volunteers/students/${studentId}/profile`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    studentData = data.student;
                    console.log('Fetched real student data:', studentData);
                    return studentData;
                }
            } catch (error) {
                console.error('Error fetching student data:', error);
            }
            return null;
        }

        // Real participant data based on role (will be updated with real student data)
        // SECURITY FIX: For students, get volunteer info from sessionStorage (set by enhanced-instant-call-ui.js)
        // This prevents volunteer credentials from being leaked in URLs
        let sessionVolunteerInfo = null;
        if (userRole === 'student') {
            try {
                const storedInfo = sessionStorage.getItem('instantCallVolunteerInfo');
                if (storedInfo) {
                    sessionVolunteerInfo = JSON.parse(storedInfo);
                    console.log('📦 Retrieved volunteer info from sessionStorage:', sessionVolunteerInfo);
                    // Clear after reading to prevent stale data
                    sessionStorage.removeItem('instantCallVolunteerInfo');
                }
            } catch (e) {
                console.error('Error reading volunteer info from sessionStorage:', e);
            }
        }

        // Use volunteer info from sessionStorage (for students), URL (legacy), or localStorage (for volunteers)
        const effectiveVolunteerName = sessionVolunteerInfo?.name || volunteerName || volunteerData?.fullName || volunteerData?.full_name || volunteerData?.name || 'Volunteer';
        const effectiveVolunteerImage = sessionVolunteerInfo?.image || volunteerImage || volunteerData?.profileImage || volunteerData?.profile_image || '/images/default-profile.png';
        
        let localUserData = {
            name: userRole === 'volunteer' ? effectiveVolunteerName : (studentName || 'Student'),
            title: userRole === 'volunteer' ? 'Volunteer' : 'Student',
            company: userRole === 'volunteer' ? 'TalkTime Volunteer' : 'Maasai Student',
            bio: userRole === 'volunteer' ? 
                `Volunteer helping Maasai students practice English conversation through TalkTime.` :
                `Maasai student practicing English conversation with volunteers.`,
            avatar: userRole === 'volunteer' ? 
                effectiveVolunteerImage :
                'https://picsum.photos/seed/student/200/200'
        };

        let remoteUserData = {
            name: userRole === 'volunteer' ? (studentName || 'Student') : effectiveVolunteerName,
            title: userRole === 'volunteer' ? 'Student' : 'Volunteer',
            company: userRole === 'volunteer' ? 'Maasai Student' : 'TalkTime Volunteer',
            bio: userRole === 'volunteer' ? 
                `Maasai student practicing English conversation with volunteers.` :
                `Volunteer helping Maasai students practice English conversation through TalkTime.`,
            avatar: userRole === 'volunteer' ? 
                'https://picsum.photos/seed/student/200/200' :
                effectiveVolunteerImage
        };

        // Function to update participant data with real student info
        function updateParticipantDataWithStudent(student) {
            if (userRole === 'volunteer' && student) {
                // Update remote user data (student) with real profile image
                remoteUserData.avatar = student.profileImage || 'https://picsum.photos/seed/student/200/200';
                remoteUserData.name = student.name || studentName || 'Student';
                console.log('Updated student avatar to:', remoteUserData.avatar);
                
                // Store student data globally for redirect purposes
                window.currentStudentData = student;
            } else if (userRole === 'student' && student) {
                // Update local user data (student) with real profile image
                localUserData.avatar = student.profileImage || 'https://picsum.photos/seed/student/200/200';
                localUserData.name = student.name || studentName || 'Student';
                console.log('Updated student avatar to:', localUserData.avatar);
                
                // Store student data globally for redirect purposes
                window.currentStudentData = student;
            }
        }

        // Global Variables
        let localStream = null;
        let remoteStream = null;
        let peerConnection = null;
        let socket = null;
        let currentRoom = null;
        let isInitiator = false;
        let serverConnected = false;
        let useP2PMode = false;
        let remoteSocketId = null;
        let isRecording = false;
        let callStartTime = null;
        let timeInterval = null;
        let mediaRecorder = null;
        let recordedChunks = [];
        let isMicMuted = false;
        let isVideoOff = false;
        let isScreenSharing = false;
        let waitingLocalStream = null;
        
        // Meeting timer variables (fetched from config)
        let meetingTimerDuration = 30 * 60 * 1000; // Default: 30 minutes in milliseconds
        let meetingTimeRemaining = meetingTimerDuration;
        let meetingDurationMinutes = 30; // Default, will be updated from config
        let bothParticipantsJoined = false;
        let meetingWarningsShown = {
            fiveMinutes: false,
            twoMinutes: false,
            oneMinute: false
        };
        let meetingAutoEndScheduled = false;
        let appConfig = null;

        // Call sounds
        let outgoingSound = null;
        let joinRoomSound = null;

        // Initialize call sounds
        function initializeCallSounds() {
            try {
                // Outgoing call sound - plays when volunteer is waiting for student
                outgoingSound = new Audio('/shared/sounds/outgoing.mp3');
                outgoingSound.loop = true;
                outgoingSound.volume = 0.5;
                outgoingSound.load();

                // Join room sound - plays when participant joins
                joinRoomSound = new Audio('/shared/sounds/joinroom.mp3');
                joinRoomSound.volume = 0.6;
                joinRoomSound.load();

                console.log('🔊 Call sounds initialized');
            } catch (error) {
                console.error('❌ Error initializing call sounds:', error);
            }
        }

        // Play outgoing call sound (volunteer waiting for student)
        function playOutgoingSound() {
            if (outgoingSound) {
                outgoingSound.currentTime = 0;
                outgoingSound.play()
                    .then(() => console.log('🔊 Playing outgoing call sound'))
                    .catch(e => console.log('⚠️ Outgoing sound autoplay blocked:', e.message));
            }
        }

        // Stop outgoing call sound
        function stopOutgoingSound() {
            if (outgoingSound) {
                outgoingSound.pause();
                outgoingSound.currentTime = 0;
                console.log('🔇 Outgoing call sound stopped');
            }
        }

        // Play join room sound (participant joined)
        function playJoinRoomSound() {
            if (joinRoomSound) {
                joinRoomSound.currentTime = 0;
                joinRoomSound.play()
                    .then(() => console.log('🔊 Playing join room sound'))
                    .catch(e => console.log('⚠️ Join room sound autoplay blocked:', e.message));
            }
        }

        // Initialize sounds on page load
        initializeCallSounds();

        // Instant call waiting timeout (fallback - 90 seconds)
        // The actual timeout comes from socket event 'instant-call-timeout' when student's timer expires
        // This is just a fallback in case the socket event doesn't arrive
        let instantCallWaitingTimeout = null;
        const INSTANT_CALL_TIMEOUT_MS = 90000; // 90 seconds fallback

        // Fetch app configuration
        async function fetchAppConfig() {
            try {
                const response = await fetch('/api/v1/config');
                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.config) {
                        appConfig = data.config;
                        // Update timer duration from config
                        const durationMinutes = data.config['meeting.duration_minutes'] || 30;
                        meetingDurationMinutes = durationMinutes;
                        meetingTimerDuration = durationMinutes * 60 * 1000;
                        meetingTimeRemaining = meetingTimerDuration;
                        console.log(`[Config] Meeting duration set to ${durationMinutes} minutes`);
                    }
                }
            } catch (error) {
                console.warn('[Config] Failed to fetch config, using defaults:', error.message);
            }
        }

        // Fetch config immediately
        fetchAppConfig();

        // DOM Elements
        const waitingScreen = document.getElementById('waitingScreen');
        const loadingScreen = document.getElementById('loadingScreen');
        const videoContainer = document.getElementById('videoContainer');
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        const waitingLocalVideo = document.getElementById('waitingLocalVideo');
        const statusIndicator = document.getElementById('statusIndicator');
        const statusText = document.getElementById('statusText');
        const timeContainer = document.getElementById('timeContainer');
        const timeDisplay = document.getElementById('timeDisplay');
        const recordingIndicator = document.getElementById('recordingIndicator');
        const recordingNotification = document.getElementById('recordingNotification');
        const connectionError = document.getElementById('connectionError');
        const p2pMode = document.getElementById('p2pMode');
        const micButton = document.getElementById('micButton');
        const videoButton = document.getElementById('videoButton');
        const screenButton = document.getElementById('screenButton');
        const recordButton = document.getElementById('recordButton');
        const controlsContainer = document.getElementById('controlsContainer');
        const endCallModal = document.getElementById('endCallModal');

        // Auto-hide controls configuration
        let controlsHideTimer = null;
        const CONTROLS_HIDE_DELAY = 4000; // Hide after 4 seconds of inactivity
        let isVideoCallActive = false;

        function showControls() {
            if (controlsContainer) {
                controlsContainer.classList.remove('hidden');
                resetControlsHideTimer();
            }
        }

        function hideControls() {
            if (controlsContainer && isVideoCallActive) {
                controlsContainer.classList.add('hidden');
            }
        }

        function resetControlsHideTimer() {
            if (controlsHideTimer) {
                clearTimeout(controlsHideTimer);
            }
            if (isVideoCallActive) {
                controlsHideTimer = setTimeout(hideControls, CONTROLS_HIDE_DELAY);
            }
        }

        function startControlsAutoHide() {
            isVideoCallActive = true;
            showControls();
            resetControlsHideTimer();
        }

        function stopControlsAutoHide() {
            isVideoCallActive = false;
            if (controlsHideTimer) {
                clearTimeout(controlsHideTimer);
                controlsHideTimer = null;
            }
            if (controlsContainer) {
                controlsContainer.classList.remove('hidden');
            }
        }

        // Event listeners for showing controls on interaction
        function setupControlsInteractionListeners() {
            const videoContainer = document.getElementById('videoContainer');

            // Mouse movement
            if (videoContainer) {
                videoContainer.addEventListener('mousemove', showControls);
                videoContainer.addEventListener('click', showControls);
            }

            // Touch events for mobile
            document.addEventListener('touchstart', function(e) {
                if (isVideoCallActive) {
                    showControls();
                }
            }, { passive: true });

            // Keyboard interaction
            document.addEventListener('keydown', function(e) {
                if (isVideoCallActive) {
                    showControls();
                }
            });

            // Prevent hiding when interacting with controls
            if (controlsContainer) {
                controlsContainer.addEventListener('mouseenter', function() {
                    if (controlsHideTimer) {
                        clearTimeout(controlsHideTimer);
                    }
                });

                controlsContainer.addEventListener('mouseleave', function() {
                    if (isVideoCallActive) {
                        resetControlsHideTimer();
                    }
                });

                // Touch interaction on controls
                controlsContainer.addEventListener('touchstart', function() {
                    if (controlsHideTimer) {
                        clearTimeout(controlsHideTimer);
                    }
                }, { passive: true });

                controlsContainer.addEventListener('touchend', function() {
                    if (isVideoCallActive) {
                        resetControlsHideTimer();
                    }
                }, { passive: true });
            }
        }

        // Initialize controls interaction listeners
        setupControlsInteractionListeners();

        // Initialize Socket.IO connection to our TalkTime backend
        function initializeSocket() {
            // Prevent multiple socket initializations
            if (socket && socket.connected) {
                console.log('⚠️ Socket already initialized and connected, skipping...');
                return;
            }
            
            console.log('Initializing Socket.IO connection to TalkTime backend...');
            
            try {
                // Connect to our TalkTime backend Socket.IO server
                // Dynamic signaling server URL for ngrok compatibility
                const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                const signalingServerUrl = isLocalhost ? 'http://localhost:3001' : window.location.origin;
                
                console.log('🔗 Connecting to signaling server:', signalingServerUrl);
                console.log('🌐 Current hostname:', window.location.hostname);
                console.log('🌐 Is localhost:', isLocalhost);
                
                socket = io(signalingServerUrl, {
                    transports: ['websocket', 'polling'],
                    timeout: 10000,
                    forceNew: true
                });

                socket.on('connect', () => {
                    console.log('✅ Connected to TalkTime signaling server:', socket.id);
                    serverConnected = true;
                    setupSocketEvents();

                    // Join user-specific room to receive chat messages and call events
                    const myUserId = getChatUserId();
                    if (myUserId) {
                        socket.emit('join-room', `user_${myUserId}`);
                        console.log(`📞 Joined user room: user_${myUserId}`);
                    }

                    if (userRole === 'volunteer') {
                        // Try to get volunteer ID from token or localStorage
                        let volunteerId = null;
                        try {
                            const token = localStorage.getItem('volunteer_talktime_access_token');
                            if (token) {
                                const payload = JSON.parse(atob(token.split('.')[1]));
                                volunteerId = payload.id || payload.userId || payload.sub;
                            }
                        } catch (e) {
                            console.warn('Could not extract volunteer ID from token:', e);
                        }

                        if (volunteerId) {
                            // Join volunteer-specific rooms for receiving call responses
                            const volunteerRooms = [
                                `volunteer_${volunteerId}`,
                                `volunteer-${volunteerId}`
                            ];
                            volunteerRooms.forEach(room => {
                                socket.emit('join-room', room);
                                console.log(`📞 Joined volunteer room: ${room}`);
                            });
                        }
                    } else if (userRole === 'student') {
                        if (myUserId) {
                            socket.emit('join-room', `student_${myUserId}`);
                            console.log(`📞 Joined student room: student_${myUserId}`);
                        }
                    }

                    // Auto-join room immediately after connection
                    if (currentRoom) {
                        console.log('🏠 Auto-joining room:', currentRoom);
                        console.log('🔧 Current role from URL:', userRole);
                        console.log('🔧 Is instant call:', isInstantCall);
                        socket.emit('join', currentRoom);

                        // EMIT user-joined-call event to notify the other participant
                        // This triggers the "incoming call" notification on student's dashboard
                        const joinedCallData = {
                            roomId: currentRoom,
                            meetingId: currentRoom, // roomId is often the meetingId for scheduled calls
                            userId: socket.id,
                            userType: userRole,
                            studentId: studentId,
                            volunteerName: volunteerName || 'Volunteer'
                        };
                        socket.emit('user-joined-call', joinedCallData);
                        console.log('📞 Emitted user-joined-call:', joinedCallData);

                        // Connection status logged to console only
                        console.log('✅ Connected to signaling server, waiting for other participant...');
                    } else {
                        console.error('❌ No room ID available for auto-join');
                    }
                });

                socket.on('connect_error', (error) => {
                    console.error('❌ Connection error:', error);
                    serverConnected = false;
                    showConnectionError();
                });

                socket.on('disconnect', () => {
                    console.log('🔌 Disconnected from signaling server');
                    serverConnected = false;
                });

            } catch (error) {
                console.error('❌ Error creating socket:', error);
                showConnectionError();
            }
        }

        // Setup Socket.IO events for WebRTC signaling
        function setupSocketEvents() {
            // Handle room creation confirmation
            socket.on('createdRoom', () => {
                console.log('🏠 Room created, waiting for other participant...');
                console.log('🔧 Room ID:', currentRoom);
                console.log('🔧 Socket ID:', socket.id);
                // Room creator is always the volunteer (initiator)
                if (isInstantCall) {
                    userRole = 'volunteer';
                    console.log('🎯 Smart role assignment: Room creator = volunteer');

                    // Start instant call waiting timeout (3 minutes for student to respond)
                    startInstantCallWaitingTimeout();
                }
                isInitiator = (userRole === 'volunteer');
                console.log(`✅ Set initiator status: ${isInitiator} (role: ${userRole})`);

                // Room creation logged to console only
                console.log('🏠 Room created, waiting for student to join...');
            });

            // Handle room join confirmation
            socket.on('joinedRoom', () => {
                console.log('🏠 Joined existing room successfully');
                console.log('🔧 Room ID:', currentRoom);
                console.log('🔧 Socket ID:', socket.id);

                // FIX: Only set userRole to student if it wasn't already set from URL
                // This prevents corruption when volunteers reconnect after connection drops
                const storedOriginalRole = sessionStorage.getItem('call_page_role');
                if (isInstantCall && (!storedOriginalRole || storedOriginalRole === 'unknown')) {
                    // Only assume student role if we don't have a stored original role
                    userRole = 'student';
                    console.log('🎯 Smart role assignment: Room joiner = student (no original role stored)');
                } else if (storedOriginalRole) {
                    // Preserve the original role from URL
                    console.log('🔒 Preserving original role from URL:', storedOriginalRole);
                    userRole = storedOriginalRole;
                }

                isInitiator = (userRole === 'volunteer');
                console.log(`✅ Set initiator status: ${isInitiator} (role: ${userRole})`);

                // Room join logged to console only
                console.log('🏠 Joined room, waiting for volunteer to join...');
            });

            // Handle new user joining the room
            socket.on('newUser', async (socketId) => {
                console.log('👤 New user joined:', socketId);
                console.log('🔍 Current state:', { isInitiator, localStream, waitingLocalStream });
                remoteSocketId = socketId;

                // Clear instant call waiting timeout - student has joined!
                if (instantCallWaitingTimeout) {
                    console.log('✅ Clearing instant call waiting timeout - student joined!');
                    clearTimeout(instantCallWaitingTimeout);
                    instantCallWaitingTimeout = null;
                }

                // Stop outgoing sound and play join room sound
                stopOutgoingSound();
                playJoinRoomSound();

                // Handle participant joined for meeting timer
                handleParticipantJoined();
                
                // Emit participant joined event to server for meeting tracking
                socket.emit('participant-joined-room', {
                    roomId: currentRoom,
                    participantId: socket.id,
                    remoteParticipantId: socketId,
                    timestamp: Date.now()
                });
                
                // Both participants connected - logged to console only
                console.log('🎉 Both participants connected, starting video connection...');
                
                if (isInitiator) {
                    console.log('🚀 Initiator starting WebRTC connection...');
                    try {
                        // Initiator creates and sends offer
                        console.log('🔧 About to create peer connection...');
                        await createPeerConnection();
                        console.log('🔧 Peer connection created, now creating offer...');
                        await createOffer();
                        console.log('🔧 Offer creation completed successfully!');
                    } catch (error) {
                        console.error('❌ Error in initiator flow:', error);
                        console.error('❌ Error details:', error.message, error.stack);
                    }
                } else {
                    console.log('👂 Non-initiator waiting for offer...');
                }
            });

            // Handle WebRTC offer
            socket.on('offer', async (description, fromSocketId) => {
                console.log('📞 Received offer from:', fromSocketId);
                remoteSocketId = fromSocketId;
                
                try {
                    if (!peerConnection) {
                        await createPeerConnection();
                    }
                    
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(description));

                    // Process any pending ICE candidates after setting remote description
                    if (peerConnection.pendingCandidates && peerConnection.pendingCandidates.length > 0) {
                        console.log(`📦 Processing ${peerConnection.pendingCandidates.length} pending ICE candidates`);
                        for (const candidate of peerConnection.pendingCandidates) {
                            try {
                                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                                console.log('✅ Pending ICE candidate added');
                            } catch (err) {
                                console.error('❌ Error adding pending ICE candidate:', err);
                            }
                        }
                        peerConnection.pendingCandidates = [];
                    }

                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);

                    // Send answer back to the specific socket
                    socket.emit('answer', answer, fromSocketId);
                    console.log('📞 Sent answer to:', fromSocketId);
                } catch (err) {
                    console.error('❌ Error handling offer:', err);
                }
            });

            // Handle WebRTC answer
            socket.on('answer', async (description, fromSocketId) => {
                console.log('📞 Received answer from:', fromSocketId);
                
                try {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
                    console.log('✅ Remote description set successfully');

                    // Process any pending ICE candidates
                    if (peerConnection.pendingCandidates && peerConnection.pendingCandidates.length > 0) {
                        console.log(`📦 Processing ${peerConnection.pendingCandidates.length} pending ICE candidates`);
                        for (const candidate of peerConnection.pendingCandidates) {
                            try {
                                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                                console.log('✅ Pending ICE candidate added');
                            } catch (err) {
                                console.error('❌ Error adding pending ICE candidate:', err);
                            }
                        }
                        peerConnection.pendingCandidates = [];
                    }
                } catch (err) {
                    console.error('❌ Error handling answer:', err);
                }
            });

            // Handle ICE candidates
            socket.on('iceCandidate', async (candidate, fromSocketId) => {
                console.log('🧊 Received ICE candidate from:', fromSocketId);

                try {
                    if (peerConnection && candidate) {
                        // Check if remote description is set before adding ICE candidate
                        if (peerConnection.remoteDescription) {
                            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
                            console.log('✅ ICE candidate added successfully');
                        } else {
                            console.log('⏳ Queueing ICE candidate (remote description not set yet)');
                            // Queue the candidate to add it later
                            if (!peerConnection.pendingCandidates) {
                                peerConnection.pendingCandidates = [];
                            }
                            peerConnection.pendingCandidates.push(candidate);
                        }
                    }
                } catch (err) {
                    console.error('❌ Error adding ICE candidate:', err);
                }
            });

            // Handle being kicked from call
            socket.on('kicked', () => {
                console.log('❌ You have been kicked from the call');
                endCall();
            });
            
            // Handle meeting timer warning from other participants
            socket.on('meeting-timer-warning', (data) => {
                console.log('⚠️ Received meeting timer warning:', data);
                showMeetingTimeWarning(data.minutesRemaining);
            });
            
            // Handle meeting auto-end from server
            socket.on('meeting-auto-end', (data) => {
                console.log('🔚 Received meeting auto-end signal:', data);
                showFinalMeetingNotification();

                // End the call after a brief delay
                setTimeout(() => {
                    endCall();
                }, 3000);
            });

            // Handle call ended by volunteer - redirect student to dashboard
            socket.on('call-ended', (data) => {
                console.log('📞 Call ended by volunteer:', data);

                // Show notification to student
                if (userRole === 'student') {
                    // Clean up call resources first
                    endCall();

                    // Show beautiful modal with countdown
                    showCallEndedModal(
                        'Call Ended',
                        'The volunteer has ended the call. Thank you for your session!',
                        '/student/dashboard.html',
                        4
                    );
                }
            });

            // Handle instant call response (accept/decline from student)
            socket.on('instant-call-response', (data) => {
                console.log('📞 Instant call response received:', data);

                // Handle rejection - notify volunteer that student declined
                if (data.response === 'rejected' && userRole === 'volunteer') {
                    console.log('❌ Student declined the instant call');

                    // Clear fallback timeout
                    if (instantCallWaitingTimeout) {
                        clearTimeout(instantCallWaitingTimeout);
                        instantCallWaitingTimeout = null;
                    }

                    // Show message to volunteer
                    const waitingMessage = document.querySelector('.waiting-message');
                    if (waitingMessage) {
                        waitingMessage.innerHTML = `
                            <div style="text-align: center;">
                                <div style="color: #ef4444; font-size: 22px; margin-bottom: 15px;">
                                    <span style="font-size: 48px;">❌</span>
                                </div>
                                <div style="color: #ef4444; font-size: 18px; margin-bottom: 10px;">Call Declined</div>
                                <div style="margin-bottom: 10px;">${data.message || 'The student declined your call.'}</div>
                                <div style="margin-top: 20px; color: #9ca3af;">Redirecting to dashboard...</div>
                            </div>
                        `;
                    }

                    // Show notification and redirect
                    if (window.showNotification) {
                        window.showNotification(
                            'The student declined your instant call.' + (data.message ? ' Message: ' + data.message : ''),
                            'info',
                            { title: 'Call Declined', autoClose: true, duration: 3000 }
                        );
                    }

                    // Clean up and redirect
                    setTimeout(() => {
                        endCall();
                        window.location.href = '/volunteer/dashboard/students.html';
                    }, 2500);
                }
            });

            // Handle instant message received from student
            socket.on('instant-message-received', (data) => {
                console.log('💬 Instant message received:', data);

                // If volunteer receives a quick message from student
                if (userRole === 'volunteer' && data.senderRole === 'student') {
                    console.log('💬 Quick message from student:', data.message);

                    // Clear fallback timeout - student responded with message
                    if (instantCallWaitingTimeout) {
                        clearTimeout(instantCallWaitingTimeout);
                        instantCallWaitingTimeout = null;
                    }

                    // End the call resources
                    endCall();

                    // Store message data in sessionStorage so dashboard can show the modal
                    const messageForDashboard = {
                        senderName: data.sender?.name || data.senderName || studentName || 'Student',
                        senderId: data.sender?.id || data.senderId,
                        message: data.message || data.content || '',
                        timestamp: data.timestamp || new Date().toISOString()
                    };
                    sessionStorage.setItem('instantCallMessage', JSON.stringify(messageForDashboard));
                    console.log('💾 Stored message for dashboard:', messageForDashboard);

                    // Redirect to volunteer dashboard - the dashboard will show the modal
                    window.location.href = '/volunteer/dashboard.html';
                }
            });

            // Handle instant call timeout - student didn't respond within the time limit
            socket.on('instant-call-timeout', (data) => {
                console.log('⏰ Instant call timeout received:', data);

                // Only handle for volunteers waiting for a student
                if (userRole === 'volunteer' && isInstantCall) {
                    console.log('⏰ Student did not respond to instant call - auto-terminating call');

                    // Clear the fallback timeout since we got the actual timeout event
                    if (instantCallWaitingTimeout) {
                        clearTimeout(instantCallWaitingTimeout);
                        instantCallWaitingTimeout = null;
                    }

                    // CRITICAL FIX: Clean up WebRTC resources IMMEDIATELY
                    // This prevents the call from persisting on volunteer side
                    endCall();

                    // Show countdown modal and redirect - no user action required
                    const studentNameDisplay = studentName ? decodeURIComponent(studentName) : 'The student';
                    showCallEndedModal(
                        'No Response',
                        `${studentNameDisplay} didn't respond to your call. A missed call notification has been sent to them.`,
                        '/volunteer/dashboard/students.html',
                        5
                    );
                }
            });

            // Handle when the other participant leaves (volunteer or student)
            socket.on('removeUser', (socketId) => {
                console.log('👤 User left:', socketId);
                if (socketId === remoteSocketId) {
                    // Remote user left, clean up connection
                    if (peerConnection) {
                        peerConnection.close();
                        peerConnection = null;
                    }
                    remoteSocketId = null;

                    // Update UI to show waiting state
                    if (remoteVideo) {
                        remoteVideo.srcObject = null;
                    }

                    // If student and volunteer left, redirect to dashboard
                    if (userRole === 'student') {
                        console.log('🚪 Volunteer left - redirecting student to dashboard');

                        // Clean up call resources first
                        endCall();

                        // Show beautiful modal with countdown
                        showCallEndedModal(
                            'Volunteer Disconnected',
                            'The volunteer has left the call. You will be redirected to your dashboard.',
                            '/student/dashboard.html',
                            4
                        );
                    }
                }
            });
        }

        // Show connection error notification
        function showConnectionError() {
            connectionError.classList.add('show');
            setTimeout(() => {
                connectionError.classList.remove('show');
            }, 5000);
        }

        // Show P2P mode indicator
        function showP2PMode() {
            p2pMode.classList.add('show');
        }

        // Create WebRTC peer connection
        async function createPeerConnection() {
            console.log('🔗 Creating peer connection...');
            
            try {
                peerConnection = new RTCPeerConnection(pcConfig);
                
                // Ensure we have a local stream
                let streamToUse = localStream || waitingLocalStream;
                
                if (!streamToUse) {
                    console.log('📹 No local stream available, creating one...');
                    streamToUse = await startWaitingVideo();
                    if (!streamToUse) {
                        throw new Error('Failed to get local media stream');
                    }
                    localStream = streamToUse;
                }
                
                // Add local stream tracks to peer connection
                console.log('➕ Adding local stream tracks to peer connection...');
                streamToUse.getTracks().forEach(track => {
                    const sender = peerConnection.addTrack(track, streamToUse);
                    console.log(`✅ Added ${track.kind} track:`, track.label || 'unlabeled');
                });
                
                // Handle remote stream
                peerConnection.ontrack = (event) => {
                    console.log('📺 Received remote track:', event.track.kind, event.streams.length, 'streams');

                    if (event.streams && event.streams[0]) {
                        remoteStream = event.streams[0];
                        console.log('🎬 Setting remote stream with', remoteStream.getTracks().length, 'tracks');

                        // Check if remote has video track
                        const remoteVideoTracks = remoteStream.getVideoTracks();
                        const hasRemoteVideo = remoteVideoTracks.length > 0 && remoteVideoTracks[0].enabled;
                        console.log(`📹 Remote has video: ${hasRemoteVideo}`);

                        if (remoteVideo) {
                            // ontrack fires once per track (audio + video) with the same stream —
                            // reassigning srcObject aborts the pending play() with a spurious
                            // "interrupted by a new load request" warning. Only set when changed.
                            if (remoteVideo.srcObject !== remoteStream) {
                                remoteVideo.srcObject = remoteStream;
                                // Explicitly play to ensure audio works on mobile browsers
                                remoteVideo.play().catch(e => {
                                    console.warn('Remote video autoplay blocked, retrying on gesture:', e.message);
                                });
                            }
                            console.log('✅ Remote video stream set successfully');

                            // Switch to video call view when we receive remote stream
                            setTimeout(() => {
                                console.log('🎥 Switching to video call view...');
                                waitingScreen.classList.remove('active');
                                videoContainer.classList.add('active');
                                startControlsAutoHide();

                                // Show avatar if remote has no video
                                if (!hasRemoteVideo) {
                                    console.log('📷 Remote participant has no camera - showing avatar');
                                    updateRemoteVideoDisplay(false);
                                } else {
                                    updateRemoteVideoDisplay(true);
                                }

                                // Set local video stream for picture-in-picture display
                                if (waitingLocalStream || localStream) {
                                    const streamToShow = waitingLocalStream || localStream;
                                    localVideo.srcObject = streamToShow;
                                    console.log('📹 Local video set with', streamToShow.getTracks().length, 'tracks');

                                    // Show local avatar if no camera
                                    if (!hasLocalCamera) {
                                        updateLocalVideoDisplay(false);
                                    }
                                } else {
                                    console.warn('⚠️ No local stream available for local video display');
                                    updateLocalVideoDisplay(false);
                                }

                                startTimer();
                                updateConnectionStatus(true);
                            }, 500);
                        }
                    }

                    // Listen for track mute/unmute to update avatar display
                    event.track.onmute = () => {
                        console.log(`🔇 Remote ${event.track.kind} track muted`);
                        if (event.track.kind === 'video') {
                            updateRemoteVideoDisplay(false);
                        }
                    };

                    event.track.onunmute = () => {
                        console.log(`🔊 Remote ${event.track.kind} track unmuted`);
                        if (event.track.kind === 'video') {
                            updateRemoteVideoDisplay(true);
                        }
                    };
                };
                
                // Handle ICE candidates
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate && remoteSocketId) {
                        console.log('🧊 Sending ICE candidate to:', remoteSocketId);
                        socket.emit('iceCandidate', event.candidate, remoteSocketId);
                    } else if (!event.candidate) {
                        console.log('🧊 ICE gathering complete');
                    }
                };
                
                // Handle connection state changes
                peerConnection.onconnectionstatechange = () => {
                    console.log('🔗 Connection state changed to:', peerConnection.connectionState);
                    const isConnected = peerConnection.connectionState === 'connected';
                    updateConnectionStatus(isConnected);
                    
                    if (isConnected) {
                        console.log('🎉 WebRTC connection established successfully!');
                    }
                };
                
                // Handle ICE connection state changes with smart fallback
                peerConnection.oniceconnectionstatechange = () => {
                    console.log('🧊 ICE connection state:', peerConnection.iceConnectionState);
                    
                    // Smart local development fallback
                    if (isLocalDevelopment && peerConnection.iceConnectionState === 'failed') {
                        console.log('🔄 Local development detected: ICE failed, attempting fallback...');
                        
                        // Show local testing notification
                        showLocalTestingNotification();
                        
                        setTimeout(() => {
                            if (peerConnection.iceConnectionState === 'failed') {
                                console.log('🎯 Activating local testing mode - simulating successful connection');
                                // Force UI transition for local testing
                                if (remoteStream && remoteStream.getTracks().length > 0) {
                                    console.log('🎥 Local testing: Forcing video call view transition...');
                                    waitingScreen.classList.remove('active');
                                    videoContainer.classList.add('active');
                                    startControlsAutoHide();

                                    // Set local video stream for picture-in-picture display
                                    if (waitingLocalStream || localStream) {
                                        const streamToShow = waitingLocalStream || localStream;
                                        localVideo.srcObject = streamToShow;
                                        console.log('📹 Local testing: Local video set with', streamToShow.getTracks().length, 'tracks');
                                    }
                                    
                                    startTimer();
                                    updateConnectionStatus(true);
                                    
                                    // Show success notification for local testing
                                    showLocalTestingSuccessNotification();
                                }
                            }
                        }, 3000); // Give ICE 3 seconds to recover
                    }
                };
                
                console.log('✅ Peer connection created successfully with', streamToUse.getTracks().length, 'local tracks');
                return peerConnection;
                
            } catch (error) {
                console.error('❌ Error creating peer connection:', error);
                throw error;
            }
        }

        // Create and send WebRTC offer
        async function createOffer() {
            console.log('📞 Creating offer...');
            console.log('🔧 remoteSocketId:', remoteSocketId);
            console.log('🔧 peerConnection exists:', !!peerConnection);
            
            try {
                if (!peerConnection) {
                    console.log('🔧 No peer connection, creating one...');
                    await createPeerConnection();
                }
                
                console.log('🔧 About to create WebRTC offer...');
                const offer = await peerConnection.createOffer({
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true
                });
                console.log('🔧 WebRTC offer created:', offer.type);
                
                console.log('🔧 Setting local description...');
                await peerConnection.setLocalDescription(offer);
                console.log('🔧 Local description set successfully');
                
                // Send offer to remote peer
                if (remoteSocketId) {
                    console.log('🔧 About to emit offer to socket:', remoteSocketId);
                    socket.emit('offer', offer, remoteSocketId);
                    console.log('📞 Sent offer to:', remoteSocketId);
                } else {
                    console.error('❌ No remote socket ID to send offer to');
                }
                
            } catch (error) {
                console.error('❌ Error creating offer:', error);
            }
        }

        // Track if local user has camera
        let hasLocalCamera = true;
        let hasLocalMicrophone = true;

        // Acquire a microphone track: default device first, then each input
        // explicitly (old/external USB mics sometimes fail as "default").
        async function getAudioStreamWithFallback() {
            try {
                return await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch (error) {
                if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') throw error;
                console.warn('🎤 Default mic failed (' + error.name + '), trying each device...');
                let devices = [];
                try {
                    devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput' && d.deviceId);
                } catch (e) { /* enumeration unavailable */ }
                for (const d of devices) {
                    try {
                        return await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: d.deviceId } } });
                    } catch (e) { await new Promise(r => setTimeout(r, 300)); }
                }
                throw error;
            }
        }

        // Acquire a camera track via a fallback ladder. Old/external USB cameras
        // often reject the browser's default request but accept a low-res mode or
        // an explicit deviceId — so we walk from friendly to forceful:
        //   1. modest 640x480@15 (most compatible mode for old webcams)
        //   2. bare video:true (browser default)
        //   3. each video device explicitly, modest then bare
        //   4. last-ditch ultra-low (352x288@10)
        async function getVideoStreamWithFallback() {
            const attempts = [
                { video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } } },
                { video: true }
            ];
            try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                devices.filter(d => d.kind === 'videoinput' && d.deviceId).forEach(d => {
                    attempts.push({ video: { deviceId: { exact: d.deviceId }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } } });
                    attempts.push({ video: { deviceId: { exact: d.deviceId } } });
                });
            } catch (e) { /* enumeration unavailable — generic attempts still run */ }
            attempts.push({ video: { width: { max: 352 }, height: { max: 288 }, frameRate: { max: 10 } } });

            let lastError = null;
            for (const constraints of attempts) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia(constraints);
                    if (stream.getVideoTracks().length > 0) {
                        console.log('✅ Camera acquired with constraints:', JSON.stringify(constraints));
                        return { stream, error: null };
                    }
                    stream.getTracks().forEach(t => t.stop());
                } catch (error) {
                    lastError = error;
                    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') break;
                    console.warn('📷 Camera attempt failed (' + error.name + '), trying next...');
                    // Old USB cameras need a moment to release after a failed claim
                    await new Promise(r => setTimeout(r, 300));
                }
            }
            return { stream: null, error: lastError };
        }

        // Start Waiting Video
        async function startWaitingVideo() {
            console.log('🎥 Starting waiting media (audio first, then video ladder)...');

            // Audio FIRST and separately — voice must survive any camera failure.
            // The grant also exposes real device ids for the video ladder below.
            let audioStream = null;
            try {
                audioStream = await getAudioStreamWithFallback();
                hasLocalMicrophone = true;
            } catch (audioError) {
                console.error('❌ Could not access microphone:', audioError);
                hasLocalMicrophone = false;
            }

            const videoResult = await getVideoStreamWithFallback();

            if (videoResult.stream) {
                hasLocalCamera = true;
                waitingLocalStream = new MediaStream([
                    ...videoResult.stream.getVideoTracks(),
                    ...(audioStream ? audioStream.getAudioTracks() : [])
                ]);
                waitingLocalVideo.srcObject = waitingLocalStream;
                console.log('✅ Waiting stream ready with video' + (audioStream ? ' + audio' : ' (no mic)'));
                if (!audioStream) showMediaErrorBanner({ name: 'MicOnlyFailure' });
                return waitingLocalStream;
            }

            hasLocalCamera = false;
            showLocalAvatarOnWaitingScreen();

            if (audioStream) {
                waitingLocalStream = audioStream;
                console.log('✅ Audio-only stream - camera unavailable after all fallbacks');
                if (videoResult.error) showMediaErrorBanner(videoResult.error, true);
                return waitingLocalStream;
            }

            console.error('❌ No media at all');
            showMediaErrorBanner(videoResult.error || { name: 'Unknown' });
            return null;
        }

        // Explain media failures on the waiting screen instead of failing silently
        function showMediaErrorBanner(error, cameraOnly) {
            const banner = document.getElementById('mediaErrorBanner');
            const title = document.getElementById('mediaErrorTitle');
            const hint = document.getElementById('mediaErrorHint');
            if (!banner || !title || !hint) return;

            const name = error && error.name;
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                title.textContent = cameraOnly ? 'Your camera is blocked - the other person cannot see you' : 'Camera and microphone are blocked';
                hint.textContent = cameraOnly
                    ? 'Your microphone works, so you can still talk. To turn on video: tap the lock icon next to the address bar, open Site settings, allow Camera, then reload this page.'
                    : 'Tap the lock icon next to the address bar, open Site settings, and allow Camera and Microphone. Then reload this page.';
            } else if (name === 'NotReadableError' || name === 'TrackStartError') {
                title.textContent = 'Camera or microphone is in use by another app';
                hint.textContent = 'Close other apps that may be using the camera (such as WhatsApp or another browser tab), then reload this page.';
            } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
                title.textContent = 'No camera or microphone found';
                hint.textContent = 'Connect a camera or microphone, or join from a device that has one, then reload this page.';
            } else if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
                title.textContent = 'Your camera could not start - the other person cannot see you';
                hint.textContent = 'Your microphone works, so you can still talk. Try unplugging the camera, plugging it back in, and reloading this page.';
            } else if (name === 'MicOnlyFailure') {
                title.textContent = 'Your microphone could not start - the other person cannot hear you';
                hint.textContent = 'Your camera works. Check the microphone is plugged in and not used by another app, then reload this page.';
            } else {
                title.textContent = 'Could not access camera or microphone';
                hint.textContent = 'Check your browser permissions for this site, then reload this page.';
            }
            banner.style.display = 'flex';
        }

        // Show avatar on waiting screen when no camera
        function showLocalAvatarOnWaitingScreen() {
            const waitingVideoContainer = waitingLocalVideo?.parentNode;
            if (!waitingVideoContainer) return;

            // Hide the video element
            if (waitingLocalVideo) {
                waitingLocalVideo.style.display = 'none';
            }

            // Create avatar overlay
            const avatarOverlay = document.createElement('div');
            avatarOverlay.className = 'video-avatar-overlay';
            avatarOverlay.style.position = 'relative';
            avatarOverlay.style.width = '100%';
            avatarOverlay.style.height = '100%';
            avatarOverlay.innerHTML = `
                <img src="${localUserData.avatar || '/shared/images/default-avatar.png'}" alt="You" class="avatar-image">
                <span class="avatar-name">${localUserData.name || 'You'}</span>
                <span class="avatar-status" style="margin-top: 4px; font-size: 11px; color: #9ca3af;">
                    ${hasLocalMicrophone ? '🎤 Voice Only' : '⚠️ No Media'}
                </span>
            `;
            waitingVideoContainer.appendChild(avatarOverlay);

            // Disable video button if no camera
            if (videoButton && !hasLocalCamera) {
                videoButton.classList.add('active');
                videoButton.querySelector('.tooltip').textContent = 'No Camera';
                videoButton.style.opacity = '0.5';
                videoButton.style.pointerEvents = 'none';
            }
        }

        // Update remote video display (show avatar when remote has no video)
        function updateRemoteVideoDisplay(hasVideo, remoteData = null) {
            const videoContainer = document.getElementById('videoContainer');
            const remoteVideoEl = document.getElementById('remoteVideo');

            if (!videoContainer) return;

            // Remove existing remote avatar if any
            let remoteAvatar = videoContainer.querySelector('.remote-avatar-overlay');

            if (hasVideo) {
                // Show video, remove avatar
                if (remoteVideoEl) remoteVideoEl.style.opacity = '1';
                if (remoteAvatar) remoteAvatar.remove();
            } else {
                // No video - show avatar
                if (remoteVideoEl) remoteVideoEl.style.opacity = '0';

                if (!remoteAvatar) {
                    remoteAvatar = document.createElement('div');
                    remoteAvatar.className = 'remote-avatar-overlay';

                    const avatarUrl = remoteData?.avatar || remoteUserData?.avatar || '/shared/images/default-avatar.png';
                    const name = remoteData?.name || remoteUserData?.name || 'Participant';

                    remoteAvatar.innerHTML = `
                        <img src="${avatarUrl}" alt="${name}" class="avatar-image">
                        <span class="avatar-name">${name}</span>
                        <span class="avatar-status">
                            <span class="status-dot"></span>
                            Voice Connected
                        </span>
                    `;
                    videoContainer.appendChild(remoteAvatar);
                }
            }
        }

        // Update Bio Display
        function updateBioDisplay() {
            console.log('Updating bio display with real participant data:', {
                localUser: localUserData,
                remoteUser: remoteUserData,
                userRole: userRole,
                studentName: studentName,
                volunteerData: volunteerData
            });
            
            // Update waiting header message with real student name
            const waitingMessage = document.getElementById('waitingMessage');
            if (userRole === 'volunteer' && studentName) {
                waitingMessage.textContent = `Waiting for ${studentName} to join`;
            } else if (userRole === 'student' && volunteerData?.fullName) {
                waitingMessage.textContent = `Waiting for ${volunteerData.fullName} to join`;
            } else {
                waitingMessage.textContent = 'Waiting for the other person to join';
            }
            
            // Update local user data
            document.getElementById('localUserName').textContent = localUserData.name;
            document.getElementById('localUserTitle').textContent = localUserData.title;
            // Remove company display for cleaner UI
            
            // Update remote user data
            document.querySelector('.user-card.remote .user-avatar img').src = remoteUserData.avatar;
            document.getElementById('remoteUserName').textContent = remoteUserData.name;
            document.getElementById('remoteUserTitle').textContent = remoteUserData.title;
            // Remove company display for cleaner UI
            document.querySelector('.user-card.remote .user-status span').textContent = `Waiting for ${remoteUserData.name}`;
        }

        // Start Call
        async function startCall() {
            waitingScreen.classList.remove('active');
            loadingScreen.classList.add('active');

            try {
                // If we already have a stream from the waiting screen, use it
                if (waitingLocalStream) {
                    // Get audio track for the call
                    const audioStream = await navigator.mediaDevices.getUserMedia({
                        audio: true
                    });
                    
                    // Combine video from waiting stream with audio
                    localStream = new MediaStream([
                        ...waitingLocalStream.getVideoTracks(),
                        ...audioStream.getAudioTracks()
                    ]);
                } else {
                    // Same audio-first + video-ladder acquisition as the waiting screen
                    const audioStream = await getAudioStreamWithFallback().catch(() => null);
                    const videoResult = await getVideoStreamWithFallback();
                    const tracks = [
                        ...(videoResult.stream ? videoResult.stream.getVideoTracks() : []),
                        ...(audioStream ? audioStream.getAudioTracks() : [])
                    ];
                    if (tracks.length === 0) {
                        throw (videoResult.error || new Error('Could not access camera or microphone'));
                    }
                    localStream = new MediaStream(tracks);
                }

                localVideo.srcObject = localStream;

                // Create peer connection
                peerConnection = new RTCPeerConnection(configuration);

                // Add local stream to peer connection
                localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, localStream);
                });

                // Handle remote stream
                peerConnection.ontrack = (event) => {
                    remoteStream = event.streams[0];
                    remoteVideo.srcObject = remoteStream;
                    updateConnectionStatus(true);
                    startTimer();

                    // Check if remote has video
                    const remoteVideoTracks = remoteStream.getVideoTracks();
                    const hasRemoteVideo = remoteVideoTracks.length > 0 && remoteVideoTracks[0].enabled;
                    if (!hasRemoteVideo) {
                        updateRemoteVideoDisplay(false);
                    }

                    // Listen for track mute/unmute
                    event.track.onmute = () => {
                        if (event.track.kind === 'video') updateRemoteVideoDisplay(false);
                    };
                    event.track.onunmute = () => {
                        if (event.track.kind === 'video') updateRemoteVideoDisplay(true);
                    };
                };

                // ICE candidates
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        if (socket && serverConnected) {
                            socket.emit('candidate', currentRoom, event.candidate);
                        } else if (useP2PMode) {
                            // For P2P mode, we'll use a simple signaling mechanism
                            handleP2PSignaling('candidate', event.candidate);
                        }
                    }
                };

                // Connection state changes
                peerConnection.onconnectionstatechange = () => {
                    console.log('Connection state:', peerConnection.connectionState);
                    if (peerConnection.connectionState === 'connected') {
                        loadingScreen.classList.remove('active');
                        videoContainer.classList.add('active');
                        startControlsAutoHide();
                    }
                };

                // If we're using P2P mode, simulate the signaling process
                if (useP2PMode) {
                    simulateP2PConnection();
                }

            } catch (error) {
                console.error('Error accessing media devices:', error);
                if (window.showNotification) {
                    window.showNotification('Unable to access camera or microphone. Please check your browser permissions and try again.', 'error', {
                        title: 'Media Access Denied',
                        autoClose: false,
                        showCloseButton: true
                    });
                } else {
                    if (typeof showMediaErrorBanner === 'function') {
                        showMediaErrorBanner({ name: 'NotAllowedError' });
                    } else if (window.showNotification) {
                        window.showNotification('Unable to access camera or microphone. Please check permissions.', 'error', { title: 'Media Error', autoClose: false });
                    } else {
                        console.error('Unable to access camera or microphone.');
                    }
                }
                loadingScreen.classList.remove('active');
                waitingScreen.classList.add('active');
            }
        }

        // Simulate P2P connection for testing
        function simulateP2PConnection() {
            // This is a simplified version for testing without a signaling server
            // In a real application, you would need a proper signaling mechanism
            
            if (isInitiator) {
                setTimeout(() => {
                    createOffer();
                }, 1000);
            }
        }

        // Handle P2P signaling (simplified for demo)
        function handleP2PSignaling(type, data) {
            // In a real application, this would send the signaling data to the other peer
            // through some channel (WebSocket, HTTP, etc.)
            console.log('P2P signaling:', type, data);
        }



        // Copy Meeting Link
        function copyMeetingLink() {
            // Generate the correct student URL for sharing
            const urlParams = new URLSearchParams(window.location.search);
            const roomId = urlParams.get('room');
            const studentId = urlParams.get('studentId');
            const studentName = urlParams.get('studentName');
            const volunteerName = urlParams.get('volunteerName');
            const volunteerImage = urlParams.get('volunteerImage');
            const isInstant = urlParams.get('instant');
            
            // Create student URL with all necessary info (anyone joining should be a student)
            const baseParams = `room=${roomId}&role=student&instant=${isInstant}&studentId=${studentId}&studentName=${encodeURIComponent(studentName || '')}&volunteerName=${encodeURIComponent(volunteerName || '')}&volunteerImage=${encodeURIComponent(volunteerImage || '')}&volunteerId=${volunteerIdFromUrl || ''}`;
            const studentUrl = `${window.location.origin}/call.html?${baseParams}`;
            
            console.log('📋 Copying student URL with volunteer info for sharing:', studentUrl);
            
            // Use the Clipboard API if available
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(studentUrl).then(() => {
                    showCopySuccess();
                }).catch(err => {
                    console.error('Failed to copy link:', err);
                    fallbackCopyTextToClipboard(studentUrl);
                });
            } else {
                // Fallback for older browsers
                fallbackCopyTextToClipboard(studentUrl);
            }
        }

        // Fallback copy function for older browsers
        function fallbackCopyTextToClipboard(text) {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.top = "0";
            textArea.style.left = "0";
            textArea.style.position = "fixed";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    showCopySuccess();
                } else {
                    console.error('Fallback: Copying text command was unsuccessful');
                }
            } catch (err) {
                console.error('Fallback: Oops, unable to copy', err);
            }
            
            document.body.removeChild(textArea);
        }

        // Show copy success message
        function showCopySuccess() {
            const successMessage = document.getElementById('copySuccessMessage');
            successMessage.classList.add('show');
            
            setTimeout(() => {
                successMessage.classList.remove('show');
            }, 3000);
        }

        // Local Testing Notification Functions
        function showLocalTestingNotification() {
            if (!isLocalDevelopment) return;
            
            const notification = createNotification({
                title: '🧪 Local Testing Mode',
                message: 'Network connection failed. Activating local testing fallback...',
                type: 'warning',
                duration: 4000
            });
        }

        function showLocalTestingSuccessNotification() {
            if (!isLocalDevelopment) return;
            
            const notification = createNotification({
                title: '✅ Local Testing Active',
                message: 'Video call simulated for local development. For real testing, use different devices.',
                type: 'success',
                duration: 6000
            });
        }

        function createNotification({ title, message, type = 'info', duration = 3000 }) {
            const notification = document.createElement('div');
            const colors = {
                success: '#116C00',
                warning: '#D10100',
                error: '#D10100',
                info: '#5f6a2d'
            };

            notification.style.cssText = `
                position: fixed;
                top: 80px;
                left: 50%;
                transform: translateX(-50%);
                background: #ffffff;
                color: ${colors[type]};
                padding: 16px 24px;
                border-radius: 12px;
                font-size: 14px;
                font-weight: 500;
                z-index: 10001;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
                border: 2px solid ${colors[type]};
                max-width: 400px;
                text-align: center;
                opacity: 0;
                transition: all 0.3s ease;
            `;

            notification.innerHTML = `
                <div style="font-weight: 600; margin-bottom: 4px;">${title}</div>
                <div style="font-weight: 400; color: #374151;">${message}</div>
            `;
            
            document.body.appendChild(notification);
            
            // Animate in
            setTimeout(() => {
                notification.style.opacity = '1';
                notification.style.transform = 'translateX(-50%) translateY(0)';
            }, 100);
            
            // Remove after duration
            setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(-50%) translateY(-20px)';
                setTimeout(() => {
                    if (document.body.contains(notification)) {
                        document.body.removeChild(notification);
                    }
                }, 300);
            }, duration);
            
            return notification;
        }

        // Show leave confirmation modal
        function showLeaveConfirmation() {
            const leaveModal = document.getElementById('leaveModal');
            leaveModal.classList.add('show');
        }

        // Hide leave confirmation modal
        function hideLeaveConfirmation() {
            const leaveModal = document.getElementById('leaveModal');
            leaveModal.classList.remove('show');
        }

        // Confirm leave and redirect
        function confirmLeave() {
            // Clean up resources
            if (waitingLocalStream) {
                waitingLocalStream.getTracks().forEach(track => track.stop());
                waitingLocalStream = null;
            }

            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }

            if (socket && serverConnected) {
                socket.disconnect();
            }

            // SECURITY: Multi-layer role detection for safe redirects
            // PRIORITY: Stored original URL role > SessionStorage > LocalStorage tokens > Default
            // FIX: Use stored original role to prevent corruption from socket handlers

            // Get the ORIGINAL URL role that was stored at page load (before any socket handlers could corrupt it)
            const originalUrlRole = sessionStorage.getItem('call_page_role');
            const sessionRole = sessionStorage.getItem('talktime_current_role');
            const hasStudentToken = localStorage.getItem('student_talktime_access_token');
            const hasVolunteerToken = localStorage.getItem('volunteer_talktime_access_token');

            console.log('🔍 Role detection layers:');
            console.log('   - Current userRole:', userRole);
            console.log('   - Original URL role (stored):', originalUrlRole);
            console.log('   - Session role:', sessionRole);
            console.log('   - Has volunteer token:', !!hasVolunteerToken);
            console.log('   - Has student token:', !!hasStudentToken);

            let detectedRole = 'unknown';

            // Layer 1: Use the ORIGINAL URL role stored at page load (most reliable)
            if (originalUrlRole === 'student' || originalUrlRole === 'volunteer') {
                detectedRole = originalUrlRole;
                console.log('🔍 Role detected from original URL (stored):', detectedRole);
            }

            // Layer 2: SessionStorage fallback (set by login flow)
            if (detectedRole === 'unknown' && (sessionRole === 'student' || sessionRole === 'volunteer')) {
                detectedRole = sessionRole;
                console.log('🔍 Role detected from sessionStorage:', detectedRole);
            }

            // Layer 3: Check localStorage tokens - VOLUNTEER token takes priority if it exists
            // This prevents volunteers from being sent to student pages
            if (detectedRole === 'unknown') {
                if (hasVolunteerToken) {
                    detectedRole = 'volunteer';
                    console.log('🔍 Role detected from volunteer token');
                } else if (hasStudentToken) {
                    detectedRole = 'student';
                    console.log('🔍 Role detected from student token');
                }
            }

            // Layer 4: Validate detected role against tokens to prevent cross-role redirects
            // If detected as student but only has volunteer token, force volunteer
            // If detected as volunteer but only has student token, force student
            if (detectedRole === 'student' && hasVolunteerToken && !hasStudentToken) {
                console.log('⚠️ Role mismatch: detected student but only has volunteer token - forcing volunteer');
                detectedRole = 'volunteer';
            } else if (detectedRole === 'volunteer' && hasStudentToken && !hasVolunteerToken) {
                console.log('⚠️ Role mismatch: detected volunteer but only has student token - forcing student');
                detectedRole = 'student';
            }

            console.log('🚪 Final redirect role:', detectedRole);

            if (detectedRole === 'student') {
                // STUDENTS: Always redirect to student dashboard
                console.log('🔒 Student redirect: /student/dashboard.html');
                window.location.href = '/student/dashboard.html';
            } else if (detectedRole === 'volunteer') {
                // VOLUNTEERS: Redirect to volunteer pages
                if (studentId && studentName) {
                    const admission = window.currentStudentData?.admissionNumber || window.currentStudentData?.admission || `ADM${studentId}`;
                    console.log('🔒 Volunteer redirect: student detail page');
                    window.location.href = `/volunteer/dashboard/student-detail.html?id=${studentId}&admission=${encodeURIComponent(admission)}&name=${encodeURIComponent(studentName)}`;
                } else {
                    console.log('🔒 Volunteer redirect: dashboard');
                    window.location.href = '/volunteer/dashboard/';
                }
            } else {
                // Layer 5: TRULY unknown - last resort token check
                // VOLUNTEER token takes priority to prevent cross-role redirects
                if (hasVolunteerToken) {
                    console.log('🔒 Unknown role with volunteer token - redirecting to volunteer dashboard');
                    window.location.href = '/volunteer/dashboard/';
                } else if (hasStudentToken) {
                    console.log('🔒 Unknown role with student token - redirecting to student dashboard');
                    window.location.href = '/student/dashboard.html';
                } else {
                    // No tokens at all - redirect to home page
                    console.log('🔒 No tokens found - redirecting to home');
                    window.location.href = '/';
                }
            }
        }

        // Toggle Microphone
        function toggleMic() {
            // Use whichever stream is available
            const activeStream = localStream || waitingLocalStream;
            if (activeStream) {
                const audioTrack = activeStream.getAudioTracks()[0];
                if (audioTrack) {
                    audioTrack.enabled = !audioTrack.enabled;
                    isMicMuted = !audioTrack.enabled;
                    micButton.classList.toggle('active', isMicMuted);
                    micButton.querySelector('.tooltip').textContent = isMicMuted ? 'Unmute' : 'Mute';
                    console.log(`🎤 Microphone ${isMicMuted ? 'muted' : 'unmuted'}`);
                } else {
                    console.warn('⚠️ No audio track available');
                }
            } else {
                console.warn('⚠️ No active stream for mic toggle');
            }
        }

        // Toggle Video
        function toggleVideo() {
            // Use whichever stream is available
            const activeStream = localStream || waitingLocalStream;
            if (activeStream) {
                const videoTrack = activeStream.getVideoTracks()[0];
                if (videoTrack) {
                    videoTrack.enabled = !videoTrack.enabled;
                    isVideoOff = !videoTrack.enabled;
                    videoButton.classList.toggle('active', isVideoOff);
                    videoButton.querySelector('.tooltip').textContent = isVideoOff ? 'Video On' : 'Video Off';

                    // Show/hide local video avatar when video is off
                    updateLocalVideoDisplay(!isVideoOff);
                    console.log(`📹 Video ${isVideoOff ? 'off' : 'on'}`);
                } else {
                    console.warn('⚠️ No video track available - camera may not be connected');
                    // Show avatar if no video track
                    updateLocalVideoDisplay(false);
                }
            } else {
                console.warn('⚠️ No active stream for video toggle');
            }
        }

        // Update local video display (show video or avatar)
        function updateLocalVideoDisplay(showVideo) {
            const localVideoEl = document.getElementById('localVideo');
            const localVideoContainer = document.getElementById('localVideoContainer');

            if (!localVideoContainer) return;

            // Check if avatar already exists
            let avatarOverlay = localVideoContainer.querySelector('.video-avatar-overlay');

            if (showVideo) {
                // Show video, hide avatar
                if (localVideoEl) localVideoEl.style.opacity = '1';
                if (avatarOverlay) avatarOverlay.style.display = 'none';
            } else {
                // Hide video, show avatar
                if (localVideoEl) localVideoEl.style.opacity = '0';

                // Create avatar overlay if it doesn't exist
                if (!avatarOverlay) {
                    avatarOverlay = document.createElement('div');
                    avatarOverlay.className = 'video-avatar-overlay';
                    avatarOverlay.innerHTML = `
                        <img src="${localUserData.avatar || '/shared/images/default-avatar.png'}" alt="You" class="avatar-image">
                        <span class="avatar-name">${localUserData.name || 'You'}</span>
                    `;
                    localVideoContainer.appendChild(avatarOverlay);
                }
                avatarOverlay.style.display = 'flex';
            }
        }

        // Toggle Screen Share
        async function toggleScreenShare() {
            if (!isScreenSharing) {
                try {
                    const screenStream = await navigator.mediaDevices.getDisplayMedia({
                        video: true,
                        audio: false
                    });

                    // Replace video track
                    const videoTrack = screenStream.getVideoTracks()[0];
                    const sender = peerConnection.getSenders().find(s => 
                        s.track && s.track.kind === 'video'
                    );
                    
                    if (sender) {
                        sender.replaceTrack(videoTrack);
                    }

                    localVideo.srcObject = screenStream;
                    isScreenSharing = true;
                    screenButton.classList.add('active');
                    screenButton.querySelector('.tooltip').textContent = 'Stop Sharing';

                    // Handle screen share end
                    videoTrack.onended = () => {
                        stopScreenShare();
                    };

                } catch (error) {
                    console.error('Error sharing screen:', error);
                }
            } else {
                stopScreenShare();
            }
        }

        // Stop Screen Share
        function stopScreenShare() {
            const activeStream = localStream || waitingLocalStream;
            if (activeStream) {
                const videoTrack = activeStream.getVideoTracks()[0];
                const sender = peerConnection?.getSenders()?.find(s =>
                    s.track && s.track.kind === 'video'
                );

                if (sender && videoTrack) {
                    sender.replaceTrack(videoTrack);
                }

                localVideo.srcObject = activeStream;
                isScreenSharing = false;
                screenButton.classList.remove('active');
                screenButton.querySelector('.tooltip').textContent = 'Share Screen';

                // If no camera, show avatar
                if (!hasLocalCamera) {
                    updateLocalVideoDisplay(false);
                }
            }
        }

        // Toggle Recording
        function toggleRecording() {
            if (!isRecording) {
                startRecording();
            } else {
                stopRecording();
            }
        }

        // Start Recording
        function startRecording() {
            if (!remoteStream || !localStream) {
                if (window.showNotification) {
                    window.showNotification('Cannot start recording. Please wait for the call to be established first.', 'warning', {
                        title: 'Recording Unavailable',
                        autoClose: true,
                        duration: 4000
                    });
                } else {
                    if (window.showNotification) {
                        window.showNotification('Cannot start recording - the call is not connected yet.', 'warning', { autoClose: true, duration: 4000 });
                    } else {
                        console.warn('Cannot start recording. Call not established yet.');
                    }
                }
                return;
            }

            // Create a combined stream for recording
            const combinedStream = new MediaStream();
            
            // Add remote video track
            if (remoteStream.getVideoTracks().length > 0) {
                combinedStream.addTrack(remoteStream.getVideoTracks()[0]);
            }
            
            // Add local audio track
            if (localStream.getAudioTracks().length > 0) {
                combinedStream.addTrack(localStream.getAudioTracks()[0]);
            }
            
            // Add remote audio track
            if (remoteStream.getAudioTracks().length > 0) {
                combinedStream.addTrack(remoteStream.getAudioTracks()[0]);
            }

            // Initialize MediaRecorder
            try {
                mediaRecorder = new MediaRecorder(combinedStream, {
                    mimeType: 'video/webm;codecs=vp9,opus'
                });

                recordedChunks = [];

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        recordedChunks.push(event.data);
                    }
                };

                mediaRecorder.onstop = saveRecording;

                mediaRecorder.start();
                isRecording = true;
                if (recordButton) {
                    recordButton.classList.add('recording');
                    const tooltip = recordButton.querySelector('.tooltip');
                    if (tooltip) tooltip.textContent = 'Stop Recording';
                }
                recordingIndicator.classList.add('active');
                recordingNotification.classList.add('show');

                // Hide notification after 3 seconds
                setTimeout(() => {
                    recordingNotification.classList.remove('show');
                }, 3000);

            } catch (error) {
                console.error('Error starting recording:', error);
                if (window.showNotification) {
                    window.showNotification('Recording is not supported in this browser. Please try using Chrome, Firefox, or Safari.', 'error', {
                        title: 'Recording Not Supported',
                        autoClose: false,
                        showCloseButton: true
                    });
                } else {
                    if (window.showNotification) {
                        window.showNotification('Recording is not supported in this browser.', 'warning', { autoClose: true, duration: 4000 });
                    } else {
                        console.warn('Recording is not supported in this browser.');
                    }
                }
            }
        }

        // Stop Recording
        function stopRecording() {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
                isRecording = false;
                if (recordButton) {
                    recordButton.classList.remove('recording');
                    const tooltip = recordButton.querySelector('.tooltip');
                    if (tooltip) tooltip.textContent = 'Start Recording';
                }
                recordingIndicator.classList.remove('active');
            }
        }

        // Save Recording
        function saveRecording() {
            const blob = new Blob(recordedChunks, {
                type: 'video/webm'
            });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `talktime-recording-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            recordedChunks = [];
        }

        // Show End Call Modal
        function showEndCallModal() {
            endCallModal.classList.add('active');
        }

        // Hide End Call Modal
        function hideEndCallModal() {
            endCallModal.classList.remove('active');
        }

        // Get the volunteer redirect URL without navigating
        function getVolunteerRedirectUrl() {
            if (studentId && studentName) {
                const admission = window.currentStudentData?.admissionNumber || window.currentStudentData?.admission || `ADM${studentId}`;
                return `/volunteer/dashboard/student-detail.html?id=${studentId}&admission=${encodeURIComponent(admission)}&name=${encodeURIComponent(studentName)}`;
            }
            return '/volunteer/dashboard/';
        }

        // Show feedback prompt modal after call ends (volunteer only)
        function showFeedbackPromptModal(redirectUrl) {
            const overlay = document.createElement('div');
            overlay.className = 'feedback-prompt-modal';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10002;padding:16px;';
            overlay.innerHTML = `
                <div style="background:white;border-radius:16px;padding:32px 24px;max-width:380px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
                    <div style="width:56px;height:56px;border-radius:50%;background:#FEF2F2;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D10100" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </div>
                    <h3 style="font-size:20px;font-weight:600;color:#111827;margin-bottom:8px;">How was your session?</h3>
                    <p style="font-size:14px;color:#6b7280;margin-bottom:24px;">Your feedback helps us improve TalkTime for everyone.</p>
                    <button id="feedback-prompt-send" style="background:#D10100;color:white;border:none;border-radius:12px;height:48px;width:100%;font-size:16px;font-weight:600;cursor:pointer;">Send Feedback</button>
                    <button id="feedback-prompt-skip" style="background:transparent;border:none;color:#6b7280;font-size:14px;cursor:pointer;margin-top:12px;padding:8px;">Skip</button>
                </div>
            `;
            document.body.appendChild(overlay);

            document.getElementById('feedback-prompt-send').addEventListener('click', () => {
                window.location.href = '/volunteer/dashboard/feedback.html';
            });
            document.getElementById('feedback-prompt-skip').addEventListener('click', () => {
                window.location.href = redirectUrl;
            });
        }

        // Confirm End Call - ONLY volunteers can end calls
        async function confirmEndCall() {
            hideEndCallModal();

            // Stop recording if active
            if (isRecording) {
                stopRecording();
            }

            // CRITICAL: Mark meeting as completed in database BEFORE cleanup
            // This ensures the meeting status is updated even if socket cleanup fails
            if (currentRoom && userRole === 'volunteer') {
                try {
                    console.log('📝 Marking meeting as completed in database...');

                    // Get the auth token based on user role
                    const token = localStorage.getItem('volunteer_talktime_access_token') ||
                                  localStorage.getItem('talktime_access_token');

                    if (token) {
                        const response = await fetch(`/api/v1/meetings/${currentRoom}/end`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                reason: 'volunteer_ended_call'
                            })
                        });

                        if (response.ok) {
                            const result = await response.json();
                            console.log('✅ Meeting marked as completed:', result);
                        } else {
                            const error = await response.json().catch(() => ({}));
                            console.warn('⚠️ Failed to mark meeting as completed:', error.message || response.status);
                        }
                    } else {
                        console.warn('⚠️ No auth token found - meeting status may not be updated');
                    }
                } catch (apiError) {
                    console.error('❌ Error calling end meeting API:', apiError);
                    // Continue with cleanup even if API call fails
                }
            }

            // SECURITY: Only volunteers can end calls for everyone
            if (userRole === 'volunteer' && socket && socket.connected) {
                console.log('📢 Volunteer ending call - notifying student');
                // Emit call-ended event to notify the student
                socket.emit('call-ended', {
                    room: currentRoom,
                    endedBy: 'volunteer',
                    reason: 'Volunteer ended the call'
                });
            }

            endCall();

            // Redirect after cleanup
            setTimeout(() => {
                if (userRole === 'volunteer') {
                    showFeedbackPromptModal(getVolunteerRedirectUrl());
                } else {
                    confirmLeave();
                }
            }, 500);
        }

        /**
         * Show a beautiful modal when the call ends (for student)
         * @param {string} title - Modal title
         * @param {string} message - Modal message
         * @param {string} redirectUrl - Where to redirect after countdown
         * @param {number} countdownSeconds - Seconds before redirect (default 4)
         */
        function showCallEndedModal(title, message, redirectUrl, countdownSeconds = 4) {
            // Remove any existing modal
            const existingModal = document.getElementById('call-ended-modal');
            if (existingModal) existingModal.remove();

            // Create modal HTML
            const modal = document.createElement('div');
            modal.id = 'call-ended-modal';
            modal.className = 'call-ended-modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-icon">
                        <i class="fas fa-phone-slash"></i>
                    </div>
                    <h2 class="modal-title">${title}</h2>
                    <p class="modal-message">${message}</p>
                    <div class="modal-countdown">
                        <div class="spinner"></div>
                        <span>Redirecting in <span class="countdown-number">${countdownSeconds}</span> seconds...</span>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Trigger animation
            requestAnimationFrame(() => {
                modal.classList.add('active');
            });

            // Countdown and redirect
            let remaining = countdownSeconds;
            const countdownEl = modal.querySelector('.countdown-number');

            const countdownInterval = setInterval(() => {
                remaining--;
                if (countdownEl) countdownEl.textContent = remaining;

                if (remaining <= 0) {
                    clearInterval(countdownInterval);
                    // Redirect to dashboard
                    window.location.href = redirectUrl;
                }
            }, 1000);
        }

        // End Call
        function endCall() {
            // Stop any playing sounds
            stopOutgoingSound();

            // Clear instant call waiting timeout if active
            if (instantCallWaitingTimeout) {
                clearTimeout(instantCallWaitingTimeout);
                instantCallWaitingTimeout = null;
            }

            if (socket) {
                socket.emit('leave', currentRoom);
                socket.disconnect();
            }

            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }

            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }

            if (waitingLocalStream) {
                waitingLocalStream.getTracks().forEach(track => track.stop());
                waitingLocalStream = null;
            }

            if (remoteStream) {
                remoteStream.getTracks().forEach(track => track.stop());
                remoteStream = null;
            }

            clearInterval(timeInterval);
            stopControlsAutoHide();
            updateConnectionStatus(false);
            timeContainer.classList.remove('visible');
            videoContainer.classList.remove('active');
            p2pMode.classList.remove('show');

            // Reset UI
            localVideo.srcObject = null;
            remoteVideo.srcObject = null;
            waitingLocalVideo.srcObject = null;
            
            // Reset button states
            micButton.classList.remove('active');
            videoButton.classList.remove('active');
            screenButton.classList.remove('active');
            if (recordButton) recordButton.classList.remove('recording');
            isMicMuted = false;
            isVideoOff = false;
            isScreenSharing = false;
            isRecording = false;

            // Reset tooltips
            micButton.querySelector('.tooltip').textContent = 'Mute';
            videoButton.querySelector('.tooltip').textContent = 'Video Off';
            screenButton.querySelector('.tooltip').textContent = 'Share Screen';
            if (recordButton) {
                const tooltip = recordButton.querySelector('.tooltip');
                if (tooltip) tooltip.textContent = 'Start Recording';
            }
            
            // Reset variables
            currentRoom = null;
            isInitiator = false;
            serverConnected = false;
            useP2PMode = false;
        }

        // Update Connection Status
        function updateConnectionStatus(connected) {
            statusIndicator.classList.toggle('connected', connected);
            statusText.textContent = connected ? 'Connected' : 'Disconnected';
        }

        // Start Timer (Enhanced with 30-minute meeting limit)
        function startTimer() {
            callStartTime = Date.now();
            timeContainer.classList.add('visible');

            // Check if both participants have joined for meeting timer
            if (bothParticipantsJoined && !meetingAutoEndScheduled) {
                console.log('🕒 Starting 30-minute meeting timer for both participants');
                socket.emit('meeting-timer-start', { 
                    roomId: currentRoom,
                    duration: meetingTimerDuration,
                    timestamp: Date.now()
                });
                meetingAutoEndScheduled = true;
            }
            
            timeInterval = setInterval(() => {
                const elapsed = Date.now() - callStartTime;
                const minutes = Math.floor(elapsed / 60000);
                const seconds = Math.floor((elapsed % 60000) / 1000);
                
                // Update display
                timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                
                // Meeting timer logic (only if both participants joined)
                if (bothParticipantsJoined) {
                    meetingTimeRemaining = meetingTimerDuration - elapsed;
                    
                    // Check for warnings and auto-end
                    checkMeetingTimeWarnings(meetingTimeRemaining);
                    
                    // Auto-end if time is up
                    if (meetingTimeRemaining <= 0) {
                        console.log('⏰ Meeting time expired, auto-ending call');
                        autoEndMeeting();
                        return;
                    }
                    
                    // Change timer color based on remaining time
                    updateTimerColor(meetingTimeRemaining);
                }
            }, 1000);
        }
        
        // Check for meeting time warnings
        function checkMeetingTimeWarnings(timeRemaining) {
            const minutesRemaining = Math.floor(timeRemaining / 60000);
            
            // 5-minute warning
            if (minutesRemaining <= 5 && !meetingWarningsShown.fiveMinutes) {
                meetingWarningsShown.fiveMinutes = true;
                showMeetingTimeWarning(5);
                socket.emit('meeting-timer-warning', { 
                    roomId: currentRoom, 
                    minutesRemaining: 5 
                });
            }
            
            // 2-minute warning
            if (minutesRemaining <= 2 && !meetingWarningsShown.twoMinutes) {
                meetingWarningsShown.twoMinutes = true;
                showMeetingTimeWarning(2);
                socket.emit('meeting-timer-warning', { 
                    roomId: currentRoom, 
                    minutesRemaining: 2 
                });
            }
            
            // 1-minute warning
            if (minutesRemaining <= 1 && !meetingWarningsShown.oneMinute) {
                meetingWarningsShown.oneMinute = true;
                showMeetingTimeWarning(1);
                socket.emit('meeting-timer-warning', { 
                    roomId: currentRoom, 
                    minutesRemaining: 1 
                });
            }
        }
        
        // Show meeting time warning
        function showMeetingTimeWarning(minutes) {
            const warningMessage = `⏰ Meeting will end in ${minutes} minute${minutes > 1 ? 's' : ''}`;
            
            // Create warning notification
            const warning = document.createElement('div');
            warning.className = 'meeting-time-warning';
            warning.innerHTML = `
                <div class="warning-content">
                    <i class="fas fa-clock"></i>
                    <span>${warningMessage}</span>
                </div>
            `;
            warning.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #ffffff;
                color: #D10100;
                padding: 15px 20px;
                border-radius: 12px;
                z-index: 10000;
                font-weight: 600;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
                border: 2px solid #D10100;
                animation: slideIn 0.3s ease-out;
            `;
            
            document.body.appendChild(warning);
            
            // Remove warning after 5 seconds
            setTimeout(() => {
                warning.style.animation = 'slideOut 0.3s ease-in';
                setTimeout(() => warning.remove(), 300);
            }, 5000);
            
            console.log('⚠️ Meeting time warning:', warningMessage);
        }
        
        // Update timer color based on remaining time
        function updateTimerColor(timeRemaining) {
            const minutesRemaining = Math.floor(timeRemaining / 60000);
            
            if (minutesRemaining <= 1) {
                timeDisplay.style.color = '#ff4444'; // Red for last minute
                timeDisplay.style.fontWeight = 'bold';
            } else if (minutesRemaining <= 2) {
                timeDisplay.style.color = '#ff8800'; // Orange for last 2 minutes
            } else if (minutesRemaining <= 5) {
                timeDisplay.style.color = '#ffaa00'; // Yellow for last 5 minutes
            } else {
                timeDisplay.style.color = ''; // Default color
                timeDisplay.style.fontWeight = '';
            }
        }
        
        // Auto-end meeting when time expires
        async function autoEndMeeting() {
            console.log('🔚 Auto-ending meeting due to time limit');

            // Clear the timer
            if (timeInterval) {
                clearInterval(timeInterval);
                timeInterval = null;
            }

            // CRITICAL: Mark meeting as completed in database when timer expires
            // Only volunteers should update the meeting status to avoid race conditions
            if (currentRoom && userRole === 'volunteer') {
                try {
                    console.log('📝 Marking meeting as completed (timer expired)...');

                    const token = localStorage.getItem('volunteer_talktime_access_token') ||
                                  localStorage.getItem('talktime_access_token');

                    if (token) {
                        const response = await fetch(`/api/v1/meetings/${currentRoom}/end`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                reason: 'timer_expired'
                            })
                        });

                        if (response.ok) {
                            const result = await response.json();
                            console.log('✅ Meeting marked as completed (timer):', result);
                        } else {
                            console.warn('⚠️ Failed to mark meeting as completed on timer expiry');
                        }
                    }
                } catch (apiError) {
                    console.error('❌ Error calling end meeting API on timer:', apiError);
                }
            }

            // Emit auto-end event to server
            socket.emit('meeting-auto-end', {
                roomId: currentRoom,
                reason: 'time_limit',
                timestamp: Date.now()
            });

            // Show final notification
            showFinalMeetingNotification();

            // End the call after a brief delay
            setTimeout(() => {
                endCall();
                if (userRole === 'volunteer') {
                    const endedNotif = document.querySelector('.meeting-ended-notification');
                    if (endedNotif) endedNotif.remove();
                    showFeedbackPromptModal(getVolunteerRedirectUrl());
                } else {
                    confirmLeave();
                }
            }, 3000);
        }
        
        // Show final meeting notification
        function showFinalMeetingNotification() {
            const notification = document.createElement('div');
            notification.className = 'meeting-ended-notification';
            notification.innerHTML = `
                <div class="notification-content">
                    <i class="fas fa-clock"></i>
                    <h3>Meeting Time Ended</h3>
                    <p>Your ${meetingDurationMinutes}-minute meeting session has completed.</p>
                    <p>Redirecting you now...</p>
                </div>
            `;
            notification.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #ffffff;
                color: #111827;
                padding: 30px;
                border-radius: 16px;
                z-index: 10001;
                text-align: center;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
                border: 1px solid #e5e7eb;
                min-width: 320px;
            `;
            
            document.body.appendChild(notification);
        }
        
        // ===== Instant Call Message & Timeout Functions =====

        // Show modal when student sends a message in response to instant call
        function showStudentMessageModal(data) {
            const senderName = data.sender?.name || studentName || 'Student';
            const senderId = data.sender?.id || data.senderId;
            const messageContent = data.message || data.content || '';

            // Remove any existing modal
            const existingModal = document.getElementById('student-message-modal');
            if (existingModal) existingModal.remove();

            const modalHtml = `
                <div id="student-message-modal" class="fixed inset-0 z-[9999] flex items-center justify-center p-4" style="background: rgba(0,0,0,0.5);">
                    <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transform transition-all animate-modal-in">
                        <!-- Header -->
                        <div style="background: #D10100;" class="p-5 text-center">
                            <div class="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3">
                                <svg class="w-8 h-8" style="color: #D10100;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
                                </svg>
                            </div>
                            <h2 class="text-xl font-bold text-white">Message from ${senderName}</h2>
                            <p style="color: rgba(255,255,255,0.9);" class="text-sm mt-1">The student sent you a message</p>
                        </div>

                        <!-- Message Content -->
                        <div class="p-6">
                            <div class="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-200">
                                <p class="text-gray-700 text-center text-lg">"${messageContent}"</p>
                            </div>

                            <div style="background: #fef2f2; border-color: #fecaca;" class="border rounded-lg p-3 mb-6">
                                <div class="flex items-start gap-2">
                                    <svg class="w-5 h-5 mt-0.5 flex-shrink-0" style="color: #D10100;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                    <p class="text-sm" style="color: #7d0000;">You can continue this conversation in the Messages section.</p>
                                </div>
                            </div>

                            <div class="flex flex-col gap-3">
                                <a href="/volunteer/dashboard/messages.html${senderId ? '?openConversation=' + senderId : ''}"
                                   style="background: #D10100;" class="w-full py-3 px-4 hover:opacity-90 text-white font-semibold rounded-xl transition-colors text-center flex items-center justify-center gap-2">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                                    </svg>
                                    Open Full Chat
                                </a>
                                <button onclick="window.location.href='/volunteer/dashboard/students.html'"
                                        class="w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors">
                                    Return to Dashboard
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

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

        // End call and return to volunteer dashboard (for instant call timeout)
        function endCallAndReturn() {
            // Clear any pending timeouts
            if (instantCallWaitingTimeout) {
                clearTimeout(instantCallWaitingTimeout);
                instantCallWaitingTimeout = null;
            }

            // End the call
            endCall();

            // Redirect back to dashboard after brief delay
            setTimeout(() => {
                window.location.href = '/volunteer/dashboard/students.html';
            }, 500);
        }

        // Start timeout for instant calls - if student doesn't join within 3 minutes
        function startInstantCallWaitingTimeout() {
            if (!isInstantCall || userRole !== 'volunteer') {
                return; // Only apply timeout for volunteer in instant calls
            }

            console.log('⏰ Starting instant call waiting timeout (3 minutes)...');

            // Clear any existing timeout
            if (instantCallWaitingTimeout) {
                clearTimeout(instantCallWaitingTimeout);
            }

            instantCallWaitingTimeout = setTimeout(() => {
                console.log('⏰ Instant call waiting timeout expired (fallback)!');
                // Auto-terminate call when fallback timeout expires
                handleInstantCallTimeoutAutoTerminate();
            }, INSTANT_CALL_TIMEOUT_MS);
        }

        // Auto-terminate instant call when timeout occurs (fallback handler)
        function handleInstantCallTimeoutAutoTerminate() {
            console.log('⏰ Auto-terminating instant call due to timeout');

            // Clean up WebRTC resources immediately
            endCall();

            // Show countdown modal and redirect
            const studentNameDisplay = studentName ? decodeURIComponent(studentName) : 'The student';
            showCallEndedModal(
                'No Response',
                `${studentNameDisplay} didn't respond to your call. A missed call notification has been sent to them.`,
                '/volunteer/dashboard/students.html',
                5
            );
        }

        // Show modal when instant call waiting times out (LEGACY - kept for backwards compatibility)
        function showInstantCallTimeoutModal() {
            // NEW: Auto-terminate instead of showing interactive modal
            handleInstantCallTimeoutAutoTerminate();
            return;

            // LEGACY CODE BELOW - no longer used
            // Remove any existing modal
            const existingModal = document.getElementById('instant-call-timeout-modal');
            if (existingModal) existingModal.remove();

            const studentNameDisplay = studentName ? decodeURIComponent(studentName) : 'The student';

            const modalHtml = `
                <div id="instant-call-timeout-modal" class="fixed inset-0 z-[9999] flex items-center justify-center p-4" style="background: rgba(0,0,0,0.5);">
                    <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
                        <!-- Header -->
                        <div style="background: #5f6a2d;" class="p-6 text-center">
                            <div class="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg class="w-10 h-10" style="color: #5f6a2d;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                            </div>
                            <h2 class="text-xl font-bold text-white">No Response</h2>
                        </div>

                        <!-- Body -->
                        <div class="p-6">
                            <p class="text-gray-600 text-center mb-6">
                                ${studentNameDisplay} hasn't joined the call within 3 minutes. They may be busy or have missed the notification.
                            </p>

                            <div style="background: #f9fafb; border-color: #e5e7eb;" class="border rounded-lg p-4 mb-6">
                                <div class="flex items-start gap-3">
                                    <svg class="w-5 h-5 mt-0.5 flex-shrink-0" style="color: #5f6a2d;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                    <p class="text-sm" style="color: #374151;">
                                        A missed call notification has been sent to ${studentNameDisplay}. You can try calling again later or schedule a meeting.
                                    </p>
                                </div>
                            </div>

                            <div class="flex flex-col gap-3">
                                <button id="timeout-wait-more-btn"
                                        class="w-full py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors">
                                    Wait 2 more minutes
                                </button>
                                <button id="timeout-leave-btn"
                                        style="background: #D10100;" class="w-full py-3 px-4 hover:opacity-90 text-white font-semibold rounded-xl transition-colors">
                                    Leave Call
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Add event listeners
            document.getElementById('timeout-wait-more-btn').addEventListener('click', () => {
                console.log('⏰ User chose to wait 2 more minutes');
                document.getElementById('instant-call-timeout-modal').remove();

                // Extend timeout by 2 more minutes
                instantCallWaitingTimeout = setTimeout(() => {
                    console.log('⏰ Extended waiting timeout expired!');
                    showInstantCallFinalTimeoutModal();
                }, 120000); // 2 minutes
            });

            document.getElementById('timeout-leave-btn').addEventListener('click', () => {
                console.log('⏰ User chose to leave call');
                document.getElementById('instant-call-timeout-modal').remove();
                endCallAndReturn();
            });
        }

        // Show final timeout modal (no more waiting option)
        function showInstantCallFinalTimeoutModal() {
            const existingModal = document.getElementById('instant-call-timeout-modal');
            if (existingModal) existingModal.remove();

            const studentNameDisplay = studentName ? decodeURIComponent(studentName) : 'The student';

            const modalHtml = `
                <div id="instant-call-timeout-modal" class="fixed inset-0 z-[9999] flex items-center justify-center p-4" style="background: rgba(0,0,0,0.5);">
                    <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
                        <div style="background: #D10100;" class="p-6 text-center">
                            <div class="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg class="w-10 h-10" style="color: #D10100;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </div>
                            <h2 class="text-xl font-bold text-white">Call Timed Out</h2>
                        </div>
                        <div class="p-6">
                            <p class="text-gray-600 text-center mb-6">
                                ${studentNameDisplay} didn't respond to your call. Please try again later or schedule a meeting for a specific time.
                            </p>
                            <button id="timeout-final-leave-btn"
                                    style="background: #D10100;" class="w-full py-3 px-4 hover:opacity-90 text-white font-semibold rounded-xl transition-colors">
                                Return to Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);

            document.getElementById('timeout-final-leave-btn').addEventListener('click', () => {
                document.getElementById('instant-call-timeout-modal').remove();
                endCallAndReturn();
            });
        }

        // Handle participant joined event
        function handleParticipantJoined() {
            bothParticipantsJoined = true;
            console.log('👥 Both participants joined - meeting timer eligible to start');
            
            // If timer is already running, it will pick up the meeting timer logic
            if (timeInterval && !meetingAutoEndScheduled) {
                console.log('🕒 Enabling meeting timer for existing call');
                socket.emit('meeting-timer-start', { 
                    roomId: currentRoom,
                    duration: meetingTimerDuration,
                    timestamp: Date.now()
                });
                meetingAutoEndScheduled = true;
            }
        }

        // Toggle Fullscreen
        function toggleFullscreen() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
            } else {
                document.exitFullscreen();
            }
        }

        // Handle page unload
        window.addEventListener('beforeunload', () => {
            if (isRecording) {
                stopRecording();
            }
            endCall();
        });

        // Local video container click to swap
        document.getElementById('localVideoContainer').addEventListener('click', () => {
            const temp = localVideo.srcObject;
            localVideo.srcObject = remoteVideo.srcObject;
            remoteVideo.srcObject = temp;
        });

        // Close modal when clicking outside
        endCallModal.addEventListener('click', (e) => {
            if (e.target === endCallModal) {
                hideEndCallModal();
            }
        });

        // Check for room ID in URL hash or URL parameters
        window.addEventListener('load', async () => {
            const hash = window.location.hash.substr(1);
            const urlParams = new URLSearchParams(window.location.search);
            const roomFromParams = urlParams.get('room');
            
            // Fetch real student data if available
            if (studentId && userRole === 'volunteer') {
                const student = await fetchStudentData();
                if (student) {
                    updateParticipantDataWithStudent(student);
                    // Use users.id (not students.id) for chat messaging
                    if (student.userId) {
                        chatRecipientId = parseInt(student.userId);
                    }
                }
            }
            
            if (hash || roomFromParams) {
                currentRoom = hash || roomFromParams;
                isInitiator = true; // Set as initiator for instant calls

                // Show waiting screen directly
                waitingScreen.classList.add('active');
                updateBioDisplay();
                startWaitingVideo();

                // Play outgoing sound for volunteer waiting for student (instant calls)
                if (userRole === 'volunteer' && isInstantCall) {
                    playOutgoingSound();
                }

                // Fetch TURN credentials before connecting
                await fetchIceConfig();

                // Initialize socket and join room
                initializeSocket();

                // Room joining now happens immediately on socket connection
            } else {
                // No room specified - show waiting screen with message
                waitingScreen.classList.add('active');
                const waitingMessage = document.getElementById('waitingMessage');
                if (waitingMessage) {
                    waitingMessage.textContent = 'No room specified. Please join from your dashboard.';
                }
            }
        });

        // Room join handled in auto-join logic above
    