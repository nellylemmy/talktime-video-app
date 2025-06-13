'use strict';

// Prevent re-initialization
if (window.appInitialized) {
    console.log('App already initialized. Skipping re-initialization.');
} else {
    window.appInitialized = true;
    console.log('Initializing app...');

    // --- DOM Elements ---
    const elements = {
        // Splash Page
        splashPage: document.getElementById('splash-page'),
        getStartedBtn: document.getElementById('get-started-btn'),

        // Landing Page
        landingPage: document.getElementById('landing-page'),
        userSelection: document.getElementById('user-selection'),
        volunteerBtn: document.getElementById('volunteer-btn'),
        studentBtn: document.getElementById('student-btn'),
        volunteerActions: document.getElementById('volunteer-actions'),
        studentNameInput: document.getElementById('student-name-input'),
        startInstantMeetingBtn: document.getElementById('start-instant-meeting-btn'),
        studentActions: document.getElementById('student-actions'),
        meetingLinkInput: document.getElementById('meeting-link-input'),
        volunteerNameInput: document.getElementById('volunteer-name-input'),
        joinMeetingBtn: document.getElementById('join-meeting-btn'),

        // Call Screen
        callScreen: document.getElementById('call-screen'),
        localVideoContainer: document.getElementById('local-video-container'),
        remoteVideoContainer: document.getElementById('remote-video-container'),
        timerEl: document.getElementById('timer'),
        micBtn: document.getElementById('mic-btn'),
        cameraBtn: document.getElementById('camera-btn'),
        copyLinkBtn: document.getElementById('copy-link-btn'),
        chatBtn: document.getElementById('chat-btn'),
        endCallBtn: document.getElementById('end-call-btn'),
        chatPanel: document.getElementById('chat-panel'),
        closeChatBtn: document.getElementById('close-chat-btn'),
        notification: document.getElementById('notification'),
    };

    // --- Global State ---
    let userRole;
    let appData;
    let meetingTimer;
    let isDataLoading = false;
    let isDataLoaded = false;

    // --- WebRTC Initialization ---
    const socket = io.connect();
    const pcConfig = {
        'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }]
    };
    const webrtc = new Webrtc(socket, pcConfig);

    // --- Data Loading ---
    async function loadData() {
        if (isDataLoading || isDataLoaded) return Promise.resolve();
        isDataLoading = true;
        try {
            const response = await fetch('/data.json');
            if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
            appData = await response.json();
            isDataLoaded = true;
            console.log('Data loaded successfully:', appData);
        } catch (error) {
            console.error('Could not load data.json:', error);
            isDataLoaded = false;
            showNotification('Error: Could not load application data.');
        } finally {
            isDataLoading = false;
        }
    }

    // --- UI Management ---
    function showCallScreen() {
        elements.landingPage.classList.add('hidden');
        elements.callScreen.classList.remove('hidden');
    }

    function showLandingPage() {
        elements.callScreen.classList.add('hidden');
        elements.landingPage.classList.remove('hidden');
        if (elements.remoteVideoContainer) {
            elements.remoteVideoContainer.innerHTML = '';
        }
        // Reset landing page state
        elements.userSelection.classList.remove('hidden');
        elements.volunteerActions.classList.add('hidden');
        elements.studentActions.classList.add('hidden');
        elements.studentNameInput.value = '';
        elements.meetingLinkInput.value = '';
        elements.volunteerNameInput.value = '';
    }

    function showNotification(message) {
        elements.notification.textContent = message;
        elements.notification.classList.add('show');
        setTimeout(() => {
            elements.notification.classList.remove('show');
        }, 3000);
    }

    // --- Main Application Logic ---
    async function startCall(roomIdToJoin) {
        if (!isDataLoaded) {
            await loadData();
            if (!isDataLoaded) return; // Stop if data failed to load
        }

        try {
            const stream = await webrtc.getLocalStream(true, true);
            const localVideo = document.createElement('video');
            localVideo.srcObject = stream;
            localVideo.autoplay = true;
            localVideo.muted = true;
            localVideo.playsinline = true;
            elements.localVideoContainer.innerHTML = '';
            elements.localVideoContainer.appendChild(localVideo);
            elements.localVideoContainer.appendChild(createUserInfoOverlay(userRole));
            
            showCallScreen();
            setupMeetingPageEventListeners(); // Setup controls now that we have a stream
            webrtc.joinRoom(roomIdToJoin);

        } catch (e) {
            console.error('Error getting user media:', e);
            alert('Could not access camera and microphone. Please check permissions.');
        }
    }

    // --- UI Components & Event Handlers ---
    function createUserInfoOverlay(role, socketId = null) {
        const user = (role === 'volunteer') 
            ? (appData.users.volunteers[0] || {name: 'Volunteer', country: 'N/A'}) 
            : (appData.users.students[0] || {name: 'Student', country: 'N/A'});
        
        const userInfo = document.createElement('div');
        userInfo.className = 'user-info';
        const nameDiv = document.createElement('div');
        nameDiv.className = 'name';
        const roleLabel = role === 'volunteer' ? '(Admin)' : '(Student)';
        nameDiv.textContent = `${user.name} ${roleLabel}`;
        const countryDiv = document.createElement('div');
        countryDiv.className = 'country';
        countryDiv.textContent = user.country;
        userInfo.appendChild(nameDiv);
        userInfo.appendChild(countryDiv);

        if (userRole === 'volunteer' && role === 'student' && socketId) {
            const kickBtn = document.createElement('button');
            kickBtn.className = 'kick-btn';
            kickBtn.innerHTML = '<i class="fas fa-user-slash"></i> Kick';
            kickBtn.onclick = () => {
                if (confirm(`Are you sure you want to remove this user from the call?`)) {
                    webrtc.kickUser(socketId);
                }
            };
            userInfo.appendChild(kickBtn);
        }
        return userInfo;
    }

    function startTimer() {
        if (meetingTimer) clearInterval(meetingTimer);
        let duration = 40 * 60;
        let timer = duration, minutes, seconds;
        meetingTimer = setInterval(() => {
            minutes = parseInt(timer / 60, 10);
            seconds = parseInt(timer % 60, 10);
            minutes = minutes < 10 ? "0" + minutes : minutes;
            seconds = seconds < 10 ? "0" + seconds : seconds;
            elements.timerEl.textContent = minutes + ":" + seconds;
            if (--timer < 0) {
                stopTimer();
                alert('The meeting has reached its 40-minute limit and will now end.');
                webrtc.leaveRoom();
            }
        }, 1000);
    }

    function stopTimer() {
        clearInterval(meetingTimer);
        elements.timerEl.textContent = "40:00";
    }

    function setupVideoResizing() {
        [elements.localVideoContainer, elements.remoteVideoContainer].forEach(container => {
            container.addEventListener('click', () => {
                if (container.classList.contains('video-player-main')) return;
                const currentMain = document.querySelector('.video-player-main');
                const currentPip = document.querySelector('.video-player-pip');
                if (currentMain && currentPip) {
                    currentMain.classList.remove('video-player-main');
                    currentMain.classList.add('video-player-pip');
                    currentPip.classList.remove('video-player-pip');
                    currentPip.classList.add('video-player-main');
                }
            });
        });
    }

    function setupLandingPageEventListeners() {
        if (elements.getStartedBtn) {
            elements.getStartedBtn.addEventListener('click', () => {
                elements.splashPage.classList.add('hidden');
                elements.landingPage.classList.remove('hidden');
            });
        }

        elements.volunteerBtn.addEventListener('click', () => {
            userRole = 'volunteer';
            elements.userSelection.classList.add('hidden');
            elements.volunteerActions.classList.remove('hidden');
        });

        elements.studentBtn.addEventListener('click', () => {
            userRole = 'student';
            elements.userSelection.classList.add('hidden');
            elements.studentActions.classList.remove('hidden');
        });

        elements.startInstantMeetingBtn.addEventListener('click', async () => {
            if (!isDataLoaded) await loadData();
            const studentName = elements.studentNameInput.value.trim();
            if (!studentName) return alert("Please enter the student's name.");
            const isValidStudent = appData.users.students.some(s => s.name.toLowerCase() === studentName.toLowerCase());
            if (!isValidStudent) return alert('Student not found. Please enter a valid name.');
            
            const newRoomId = `room-${Math.random().toString(36).substr(2, 9)}`;
            const newUrl = `${window.location.origin}${window.location.pathname}?roomId=${newRoomId}`;
            window.history.pushState({ path: newUrl }, '', newUrl);
            startCall(newRoomId);
        });

        elements.joinMeetingBtn.addEventListener('click', async () => {
            if (!isDataLoaded) await loadData();
            const meetingLink = elements.meetingLinkInput.value.trim();
            const volunteerName = elements.volunteerNameInput.value.trim();
            if (!meetingLink || !volunteerName) return alert("Please provide the meeting link/ID and the volunteer's name.");
            const isValidVolunteer = appData.users.volunteers.some(v => v.name.toLowerCase() === volunteerName.toLowerCase());
            if (!isValidVolunteer) return alert('Volunteer not found. Please check the name.');

            let roomIdToJoin;
            try {
                const url = new URL(meetingLink);
                roomIdToJoin = url.searchParams.get('roomId');
            } catch (e) {
                roomIdToJoin = meetingLink.includes('roomId=') ? meetingLink.split('roomId=')[1] : meetingLink;
            }

            if (roomIdToJoin) {
                 const newUrl = `${window.location.origin}${window.location.pathname}?roomId=${roomIdToJoin}`;
                 window.history.pushState({ path: newUrl }, '', newUrl);
                 startCall(roomIdToJoin);
            } else {
                alert('Invalid meeting link or ID.');
            }
        });
    }

    function setupMeetingPageEventListeners() {
        elements.micBtn.addEventListener('click', () => {
            const audioTrack = webrtc.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                elements.micBtn.innerHTML = audioTrack.enabled ? '<i class="fas fa-microphone"></i>' : '<i class="fas fa-microphone-slash"></i>';
            }
        });

        elements.cameraBtn.addEventListener('click', () => {
            const videoTrack = webrtc.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                elements.cameraBtn.innerHTML = videoTrack.enabled ? '<i class="fas fa-video"></i>' : '<i class="fas fa-video-slash"></i>';
            }
        });

        elements.copyLinkBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(window.location.href).then(() => {
                showNotification('Meeting link copied to clipboard!');
            }, (err) => {
                console.error('Could not copy text: ', err);
                alert('Failed to copy link.');
            });
        });

        elements.endCallBtn.addEventListener('click', () => {
            webrtc.leaveRoom();
        });

        elements.chatBtn.addEventListener('click', () => elements.chatPanel.classList.toggle('hidden'));
        elements.closeChatBtn.addEventListener('click', () => elements.chatPanel.classList.add('hidden'));
        setupVideoResizing();
    }

    // --- WebRTC Event Listeners ---
    webrtc.addEventListener('createdRoom', (e) => {
        console.log(`Room ${e.detail.roomId} was created`);
        showNotification(`You created room: ${e.detail.roomId}. Share the link to invite someone.`);
    });

    webrtc.addEventListener('joinedRoom', (e) => {
        console.log(`Joined room ${e.detail.roomId}`);
        webrtc.gotStream(); // Notify others you are ready
    });

    webrtc.addEventListener('leftRoom', () => {
        stopTimer();
        showLandingPage();
        window.history.pushState({}, '', window.location.pathname);
    });

    webrtc.addEventListener('newUser', (e) => {
        const { socketId, stream } = e.detail;
        console.log(`New user connected: ${socketId}`);
        
        elements.remoteVideoContainer.innerHTML = '';
        const remoteVideo = document.createElement('video');
        remoteVideo.srcObject = stream;
        remoteVideo.autoplay = true;
        remoteVideo.playsinline = true;
        remoteVideo.id = `remote-video-${socketId}`;
        
        elements.remoteVideoContainer.appendChild(remoteVideo);
        const remoteUserRole = userRole === 'volunteer' ? 'student' : 'volunteer';
        elements.remoteVideoContainer.appendChild(createUserInfoOverlay(remoteUserRole, socketId));
        
        startTimer();
    });

    webrtc.addEventListener('removeUser', (e) => {
        console.log(`User disconnected: ${e.detail.socketId}`);
        elements.remoteVideoContainer.innerHTML = '';
        remoteVideoContainer.innerHTML = '';
        stopTimer();
        showNotification('The other participant has left the call.');
    });

    webrtc.addEventListener('kicked', () => {
        alert('You have been removed from the call by the volunteer.');
        webrtc.leaveRoom();
    });

    webrtc.addEventListener('error', (e) => {
        console.error('WebRTC Error:', e.detail.error);
        showNotification(`Error: ${e.detail.error.message}`);
    });

    // --- App Initialization ---
    async function init() {
        await loadData();
        const urlParams = new URLSearchParams(window.location.search);
        const roomIdFromUrl = urlParams.get('roomId');
        const roleFromUrl = urlParams.get('role');

        if (roomIdFromUrl && roleFromUrl) {
            userRole = roleFromUrl;
            startCall(roomIdFromUrl);
        } else {
            setupLandingPageEventListeners();
        }
    }

    init();
    window.appInitialized = true;
}
