'use strict';

// Prevent re-initialization
if (window.appInitialized) {
    console.warn('App already initialized');
} else {
    window.appInitialized = true;

    // --- DOM Elements ---
    const elements = {
        landingPage: document.getElementById('landing-page'),
        mainHeader: document.getElementById('main-header'),
        userSelection: document.getElementById('user-selection'),
        volunteerBtn: document.getElementById('volunteer-btn'),
        studentBtn: document.getElementById('student-btn'),
        backBtns: document.querySelectorAll('.back-btn'),
        volunteerActions: document.getElementById('volunteer-actions'),
        studentNameInput: document.getElementById('student-name-input'),
        startInstantMeetingBtn: document.getElementById('start-instant-meeting-btn'),
        studentActions: document.getElementById('student-actions'),
        meetingLinkInput: document.getElementById('meeting-link-input'),
        volunteerNameInput: document.getElementById('volunteer-name-input'),
        joinMeetingBtn: document.getElementById('join-meeting-btn'),
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
        confirmModal: document.getElementById('confirm-modal'),
        confirmMessage: document.getElementById('confirm-message'),
        confirmOkBtn: document.getElementById('confirm-ok-btn'),
        confirmCancelBtn: document.getElementById('confirm-cancel-btn')
    };

    // Add grid class for CSS layout
    elements.remoteVideoContainer.classList.add('video-grid');

    // --- Debugging: Check if all elements are found ---
    for (const key in elements) {
        if (!elements[key] || (elements[key] instanceof NodeList && elements[key].length === 0)) {
            console.error(`[Debug] Missing element: ${key}`);
        }
    }

    // --- Global State ---
    let userRole;
    let appData;
    let meetingTimer;
    let webrtc;
    let isDataLoading = false;
    let isDataLoaded = false;
    let notificationTimer;
    let confirmCallback = null;

    // --- Helpers ---
    function showNotification(message, type = 'info', duration = 4000) {
        elements.notification.innerHTML = `<i class="fas ${{
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            info: 'fa-info-circle'
        }[type]}"></i><span>${message}</span>`;
        elements.notification.className = type + ' show';
        clearTimeout(notificationTimer);
        notificationTimer = setTimeout(() => elements.notification.classList.remove('show'), duration);
    }

    function showConfirmation(message, onConfirm) {
        elements.confirmMessage.textContent = message;
        elements.confirmModal.classList.add('show');
        confirmCallback = onConfirm;
    }

    function hideConfirmation() {
        elements.confirmModal.classList.remove('show');
        confirmCallback = null;
    }

    function toggleMaximize(el) {
        if (!el) return;
        const isMax = el.classList.contains('maximized');
        document.querySelectorAll('.video-participant').forEach(p => {
            p.classList.remove('maximized', 'hidden-by-max');
        });
        if (!isMax) {
            el.classList.add('maximized');
            document.querySelectorAll('.video-participant').forEach(p => {
                if (p !== el) p.classList.add('hidden-by-max');
            });
        }
        const icon = el.querySelector('.maximize-btn i');
        if (icon) icon.className = isMax ? 'fas fa-expand' : 'fas fa-compress';
    }

    // --- Data Loading ---
    async function loadData() {
        if (isDataLoading || isDataLoaded) return;
        isDataLoading = true;
        try {
            const res = await fetch('/data.json');
            if (!res.ok) throw new Error(res.statusText);
            appData = await res.json();
            isDataLoaded = true;
        } catch (err) {
            showNotification('Error loading data.', 'error');
        } finally {
            isDataLoading = false;
        }
    }

    // --- UI Pages ---
    function showLandingPage() {
        elements.landingPage.classList.remove('hidden');
        elements.callScreen.classList.add('hidden');
        elements.mainHeader.style.display = 'none';
        elements.remoteVideoContainer.innerHTML = '';
    }

    function showCallPage() {
        elements.landingPage.classList.add('hidden');
        elements.callScreen.classList.remove('hidden');
        elements.mainHeader.style.display = 'flex';
    }

    // --- Call Logic ---
    async function startCall(roomId) {
        if (!webrtc) return showNotification('WebRTC not ready.', 'error');
        if (!isDataLoaded) await loadData();
        showCallPage();

        try {
            const stream = await webrtc.getLocalStream(true, true);
            const videoItem = document.createElement('div');
            videoItem.className = 'video-participant';
            videoItem.dataset.socketId = 'local'; // For event delegation

            const localVideo = document.createElement('video');
            localVideo.srcObject = stream;
            localVideo.autoplay = true;
            localVideo.muted = true;
            localVideo.playsinline = true;
            videoItem.appendChild(localVideo);
            
            videoItem.appendChild(createUserInfoOverlay(userRole, 'local'));
            
            elements.localVideoContainer.innerHTML = '';
            elements.localVideoContainer.appendChild(videoItem);

            webrtc.joinRoom(roomId);
        } catch (e) {
            showNotification(`Media error: ${e.message}`, 'error');
            console.error(e);
        }
    }

    function createUserInfoOverlay(localUserRole, remoteSocketId) {
        const overlay = document.createElement('div');
        overlay.className = 'participant-overlay';
    
        const participantName = document.createElement('div');
        participantName.className = 'participant-name';
    
        if (remoteSocketId === 'local') {
            participantName.textContent = localUserRole === 'volunteer' ? 'Volunteer (You)' : 'Student (You)';
        } else {
            const name = sessionStorage.getItem('studentToCall') || 'Participant';
            participantName.textContent = localUserRole === 'volunteer' ? name : 'Volunteer';
        }
    
        overlay.appendChild(participantName);
    
        const maximizeBtn = document.createElement('button');
        maximizeBtn.className = 'action-icon-btn maximize-btn';
        maximizeBtn.title = 'Maximize / Minimize';
        maximizeBtn.innerHTML = '<i class="fas fa-expand"></i>';
        overlay.appendChild(maximizeBtn);
    
        if (localUserRole === 'volunteer' && remoteSocketId !== 'local') {
            const kickBtn = document.createElement('button');
            kickBtn.className = 'action-icon-btn kick-btn';
            kickBtn.title = 'Remove User';
            kickBtn.innerHTML = '<i class="fas fa-user-slash"></i>';
            overlay.appendChild(kickBtn);
        }
    
        return overlay;
    }

    function startTimer() {
        if (meetingTimer) return;
        let seconds = 0;
        elements.timerEl.textContent = '00:00';
        meetingTimer = setInterval(() => {
            seconds++;
            const m = Math.floor(seconds / 60).toString().padStart(2, '0');
            const s = (seconds % 60).toString().padStart(2, '0');
            elements.timerEl.textContent = `${m}:${s}`;
        }, 1000);
    }

    // --- Event Listeners ---
    function setupLandingPageEventListeners() {
        elements.volunteerBtn.onclick = () => { window.userRole = 'volunteer'; userRole = 'volunteer'; elements.userSelection.classList.add('hidden'); elements.volunteerActions.classList.remove('hidden'); };
        elements.studentBtn.onclick = () => { window.userRole = 'student'; userRole = 'student'; elements.userSelection.classList.add('hidden'); elements.studentActions.classList.remove('hidden'); };
        elements.backBtns.forEach(btn => {
            btn.onclick = () => {
                elements.volunteerActions.classList.add('hidden');
                elements.studentActions.classList.add('hidden');
                elements.userSelection.classList.remove('hidden');
            };
        });
    }

    function setupMeetingPageEventListeners() {
        elements.micBtn.onclick = () => webrtc.toggleMic();
        elements.cameraBtn.onclick = () => webrtc.toggleCamera();
        elements.copyLinkBtn.onclick = () => navigator.clipboard.writeText(window.location.href).then(() => showNotification('Link copied!', 'success'));
        elements.chatBtn.onclick = () => elements.chatPanel.classList.toggle('open');
        elements.closeChatBtn.onclick = () => elements.chatPanel.classList.remove('open');
        elements.endCallBtn.onclick = () => {
            showConfirmation('Are you sure you want to end the call?', () => {
                webrtc.leaveRoom();
            });
        };

        elements.startInstantMeetingBtn.onclick = async () => {
            if (!isDataLoaded) await loadData();
            const roomName = `Room_${new Date().getTime()}`;
            const roomId = btoa(roomName);
            window.history.pushState({}, '', `#${roomId}`);
            startCall(roomId);
        };

        elements.joinMeetingBtn.onclick = () => {
            const url = elements.meetingLinkInput.value;
            if (!url.includes('#')) return showNotification('Invalid meeting link.', 'error');
            const roomId = url.split('#')[1];
            startCall(roomId);
        };

        const gridContainer = document.getElementById('video-grid-container');
        gridContainer.addEventListener('click', e => {
            const participant = e.target.closest('.video-participant');
            if (!participant) return;

            if (e.target.closest('.maximize-btn')) {
                toggleMaximize(participant);
            } else if (e.target.closest('.kick-btn')) {
                const socketId = participant.dataset.socketId;
                if (socketId && socketId !== 'local') {
                    showConfirmation('Are you sure you want to remove this participant?', () => {
                        webrtc.kick(socketId);
                    });
                }
            }
        });
    }

    function setupWebRTCEvents() {
        webrtc.addEventListener('localStream', e => {
            // This is handled in startCall now
        });
        webrtc.addEventListener('joinedRoom', e => { showNotification(`Joined ${e.detail.roomId}`, 'info'); });
        webrtc.addEventListener('leftRoom', e => { showNotification(`Left ${e.detail.roomId}`, 'info'); showLandingPage(); });
        webrtc.addEventListener('newUser', e => {
            showNotification('Participant joined', 'info');
            const { socketId, stream } = e.detail;

            const videoItem = document.createElement('div');
            videoItem.className = 'video-participant';
            videoItem.dataset.socketId = socketId;

            const vid = document.createElement('video');
            vid.srcObject = stream;
            vid.autoplay = true;
            vid.playsinline = true;
            videoItem.appendChild(vid);

            videoItem.appendChild(createUserInfoOverlay(userRole, socketId));

            elements.remoteVideoContainer.appendChild(videoItem);
            if (!meetingTimer) startTimer();
        });
        webrtc.addEventListener('removeUser', e => {
            const videoItem = document.querySelector(`[data-socket-id="${e.detail.socketId}"]`);
            if (videoItem) videoItem.remove();
            showNotification('Participant left', 'info');
            if (elements.remoteVideoContainer.childElementCount === 0) {
                clearInterval(meetingTimer);
                meetingTimer = null;
            }
        });
        webrtc.addEventListener('kicked', () => { showNotification('You have been removed from the call.', 'error'); webrtc.leaveRoom(); });
        webrtc.addEventListener('error', e => { showNotification(`Error: ${e.detail.error.message}`, 'error'); console.error(e.detail.error); });
        webrtc.addEventListener('notification', e => showNotification(e.detail.notification, 'info'));
    }

    function setupSocketAndWebRTC() {
        if (typeof io === 'undefined' || typeof Webrtc === 'undefined') {
            showNotification('Socket.IO or Webrtc missing','error');
            return;
        }
        const socket = io.connect();
        // Hook server-side logs
        socket.on('log', msgs => console.log('%c[Server]', 'color:#27ae60;font-weight:bold;', ...msgs));

        const pcConfig = {
            iceServers: [
                { urls: [
                    'stun:stun.l.google.com:19302',
                    'stun:stun1.l.google.com:19302',
                    'stun:stun2.l.google.com:19302'
                ]},
                { urls: ['turn:YOUR_TURN_SERVER:3478?transport=udp'], username: 'USERNAME', credential: 'CREDENTIAL' }
            ]
        };

        webrtc = new Webrtc(socket, pcConfig, { log: true, warn: false, error: true });
        window.webrtc = webrtc;
        setupWebRTCEvents();
    }

    // --- Initialization ---
    setupLandingPageEventListeners();
    setupMeetingPageEventListeners();
    elements.confirmOkBtn.onclick = () => { if(confirmCallback) confirmCallback(); hideConfirmation(); };
    elements.confirmCancelBtn.onclick = hideConfirmation;
    setupSocketAndWebRTC();
}
