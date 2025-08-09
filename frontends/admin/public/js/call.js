document.addEventListener('DOMContentLoaded', () => {
    // --- Resume AudioContext on first user gesture ---
    document.body.addEventListener('click', async () => {
        if (window.Tone && Tone.context && Tone.context.state !== 'running') {
            await Tone.start();
            console.log('AudioContext resumed');
        }
    }, { once: true });

    // --- Inject custom styles for waiting participant ---
    const style = document.createElement('style');
    style.innerHTML = `
      .waiting-participant {
        background-color: #2d3748;
        border: 2px dashed #4a5568;
      }
      .waiting-participant .flex {
        text-align: center;
      }
    `;
    document.head.appendChild(style);

    // --- Parse URL & Role Setup ---
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    const userRole = window.TalkTimeAuth ? window.TalkTimeAuth.getUser()?.role : null || params.get('role') || 'guest';

    if (!room) {
        alert('No room specified. Redirecting to home.');
        window.location.href = '/';
        return;
    }

    // --- DOM References ---
    const grid = document.getElementById('video-grid');
    const toastEl = document.getElementById('action-toast');
    const micBtn = document.getElementById('mic-btn');
    const cameraBtn = document.getElementById('camera-btn');
    const endBtn = document.getElementById('end-btn');
    const copyMeetingLinkBtn = document.getElementById('copy-meeting-link-btn');

    // --- Signaling & WebRTC Setup ---
    const socket = io();
    socket.on('connect', () => console.log('Socket.IO connected as', socket.id));

    const pcConfig = {
        iceServers: [
            { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
        ]
    };
    const webrtc = new Webrtc(socket, pcConfig, { log: true, warn: false, error: true });
    window.webrtc = webrtc;

    // --- Helper: Toast ---
    function toast(msg, type = 'info') {
        if (!toastEl) return;
        toastEl.textContent = msg;
        toastEl.className = `show ${type}`;
        setTimeout(() => toastEl.classList.remove('show'), 3000);
    }

    // --- Dynamic Grid Layout ---
    function updateGridLayout() {
        const count = grid.children.length;
        const layout = getOptimalLayout(count);
        grid.style.gridTemplateColumns = `repeat(${layout.cols}, 1fr)`;
        grid.style.gridTemplateRows = `repeat(${layout.rows}, 1fr)`;
    }

    function getOptimalLayout(n) {
        if (n <= 1) return { cols: 1, rows: 1 };
        if (n === 2) return { cols: 2, rows: 1 };
        const ar = window.innerWidth / window.innerHeight;
        let bestLayout = { cols: 1, rows: n, area: 0 };

        for (let cols = 1; cols <= n; cols++) {
            const rows = Math.ceil(n / cols);
            const cellWidth = window.innerWidth / cols;
            const cellHeight = window.innerHeight / rows;
            const cellAr = cellWidth / cellHeight;
            const distortion = Math.abs(Math.log(ar) - Math.log(cellAr));
            const area = cellWidth * cellHeight;

            if (distortion < 0.5 && area > bestLayout.area) {
                bestLayout = { cols, rows, area };
            }
        }
        if(bestLayout.area > 0) return bestLayout;
        return {cols: Math.ceil(Math.sqrt(n)), rows: Math.ceil(n/Math.ceil(Math.sqrt(n)))};
    }

    // --- Sound Effects ---
    function playConnectionSound() {
        const audioContext = new(window.AudioContext || window.webkitAudioContext)();
        const notes = [392.00, 493.88, 587.33];
        const noteDuration = 0.1;
        const startTime = audioContext.currentTime;
        const reverb = audioContext.createConvolver();
        const reverbTime = 0.3;
        const reverbBuffer = audioContext.createBuffer(2, audioContext.sampleRate * reverbTime, audioContext.sampleRate);
        for (let i = 0; i < 2; i++) {
            const channel = reverbBuffer.getChannelData(i);
            for (let j = 0; j < channel.length; j++) {
                channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / channel.length, 2);
            }
        }
        reverb.buffer = reverbBuffer;
        const masterGain = audioContext.createGain();
        masterGain.gain.value = 0.3;
        masterGain.connect(reverb);
        reverb.connect(audioContext.destination);
        masterGain.connect(audioContext.destination);
        notes.forEach((frequency, index) => {
            const osc = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            osc.type = 'sine';
            osc.frequency.value = frequency;
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(1, startTime + (index * noteDuration) + 0.01);
            gainNode.gain.linearRampToValueAtTime(0, startTime + (index * noteDuration) + noteDuration);
            osc.connect(gainNode);
            gainNode.connect(masterGain);
            osc.start(startTime + (index * noteDuration));
            osc.stop(startTime + (index * noteDuration) + noteDuration);
        });
    }

    function playEndCallSound() {
        const audioContext = new(window.AudioContext || window.webkitAudioContext)();
        const notes = [587.33, 493.88, 392.00];
        const noteDuration = 0.1;
        const startTime = audioContext.currentTime;
        const reverb = audioContext.createConvolver();
        const reverbTime = 0.3;
        const reverbBuffer = audioContext.createBuffer(2, audioContext.sampleRate * reverbTime, audioContext.sampleRate);
        for (let i = 0; i < 2; i++) {
            const channel = reverbBuffer.getChannelData(i);
            for (let j = 0; j < channel.length; j++) {
                channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / channel.length, 2);
            }
        }
        reverb.buffer = reverbBuffer;
        const masterGain = audioContext.createGain();
        masterGain.gain.value = 0.3;
        masterGain.connect(reverb);
        reverb.connect(audioContext.destination);
        masterGain.connect(audioContext.destination);
        notes.forEach((frequency, index) => {
            const osc = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            osc.type = 'sine';
            osc.frequency.value = frequency;
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(1, startTime + (index * noteDuration) + 0.01);
            gainNode.gain.linearRampToValueAtTime(0, startTime + (index * noteDuration) + noteDuration);
            osc.connect(gainNode);
            gainNode.connect(masterGain);
            osc.start(startTime + (index * noteDuration));
            osc.stop(startTime + (index * noteDuration) + noteDuration);
        });
    }

    function playVolunteerStartSound() {
        const audioContext = new(window.AudioContext || window.webkitAudioContext)();
        const masterGain = audioContext.createGain();
        masterGain.gain.value = 0.4;
        const delay = audioContext.createDelay(1.0);
        const feedback = audioContext.createGain();
        feedback.gain.value = 0.4;
        const panner = audioContext.createStereoPanner();
        panner.pan.value = -0.7;
        delay.connect(panner);
        panner.connect(feedback);
        feedback.connect(delay);
        const reverb = audioContext.createConvolver();
        const reverbTime = 2.0;
        const reverbBuffer = audioContext.createBuffer(2, audioContext.sampleRate * reverbTime, audioContext.sampleRate);
        for (let i = 0; i < 2; i++) {
            const channel = reverbBuffer.getChannelData(i);
            for (let j = 0; j < channel.length; j++) {
                channel[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / channel.length, 3);
            }
        }
        reverb.buffer = reverbBuffer;
        masterGain.connect(reverb);
        masterGain.connect(delay);
        reverb.connect(audioContext.destination);
        delay.connect(audioContext.destination);
        masterGain.connect(audioContext.destination);
        const now = audioContext.currentTime;
        const bloomOsc = audioContext.createOscillator();
        const bloomGain = audioContext.createGain();
        bloomOsc.type = 'sine';
        bloomOsc.frequency.value = 130.81;
        bloomGain.gain.setValueAtTime(0, now);
        bloomGain.gain.linearRampToValueAtTime(0.8, now + 0.2);
        bloomGain.gain.linearRampToValueAtTime(0, now + 0.7);
        bloomOsc.connect(bloomGain);
        bloomGain.connect(masterGain);
        bloomOsc.start(now);
        bloomOsc.stop(now + 1);
        const chordNotes = [261.63, 329.63, 392.00, 493.88];
        const strumDelay = 0.03;
        chordNotes.forEach((freq, index) => {
            const chordOsc = audioContext.createOscillator();
            const chordGain = audioContext.createGain();
            const startTime = now + 0.3 + (index * strumDelay);
            chordOsc.type = 'sine';
            chordOsc.frequency.value = freq;
            chordGain.gain.setValueAtTime(0, startTime);
            chordGain.gain.linearRampToValueAtTime(0.7, startTime + 0.05);
            chordGain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.5);
            chordOsc.connect(chordGain);
            chordGain.connect(masterGain);
            chordOsc.start(startTime);
            chordOsc.stop(startTime + 2);
        });
    }

    // --- Participant Management ---
    function addParticipant(id, name, stream, isLocal = false) {
        const waitingTile = grid.querySelector('.waiting-participant');
        if (waitingTile && !isLocal) {
            waitingTile.remove();
        }

        if (grid.querySelector(`[data-id="${id}"]`)) return;

        const tile = document.createElement('div');
        tile.className = 'video-participant';
        tile.dataset.id = id;

        const video = document.createElement('video');
        video.srcObject = stream;
        video.autoplay = true;
        video.playsinline = true;
        if (isLocal) video.muted = true;

        const nameTag = document.createElement('div');
        nameTag.className = 'participant-name';
        nameTag.textContent = name;

        tile.append(video, nameTag);
        grid.appendChild(tile);
        updateGridLayout();
    }

    function removeParticipant(id) {
        const tile = grid.querySelector(`[data-id="${id}"]`);
        if (tile) {
            tile.remove();
            updateGridLayout();
            toast('Participant left');
        }
    }

        // Get student name from URL and display status
        const urlParams = new URLSearchParams(window.location.search);
        const studentName = urlParams.get('studentName');

    function addWaitingTile() {
        const waitingId = 'waiting-for-student';
        if (grid.querySelector(`[data-id="${waitingId}"]`)) return;
    if (studentName) {
        const tile = document.createElement('div');
        tile.className = 'video-participant waiting-participant';
        tile.dataset.id = waitingId;
        tile.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-white p-4">
                <i class="fas fa-hourglass-half text-4xl mb-4 animate-spin"></i>
                <p class="font-semibold text-center">Waiting for ${studentName} to join...</p>
            </div>
            <div class="participant-name">${studentName}</div>
        `;
        grid.appendChild(tile);
        updateGridLayout();
    }

        
    }

    // --- Local Stream & Join Room ---
    webrtc.getLocalStream(true, true)
        .then(stream => {
            addParticipant(webrtc.myId || socket.id, 'You', stream, true);
            webrtc.joinRoom(room);

            if (userRole === 'volunteer') {
                playVolunteerStartSound();
                addWaitingTile();
            }
        })
        .catch(err => {
            console.error('Media error:', err);
            toast(`Media error: ${err.message}`, 'error');
        });

    // --- Remote Peer Events ---
    webrtc.addEventListener('newUser', e => {
        let name = 'Student';
        if (userRole === 'volunteer') {
            name = sessionStorage.getItem('studentToCall') || studentName || 'Student';
        } else if (userRole === 'student') {
            name = 'Volunteer';
        }
        addParticipant(e.detail.socketId, name, e.detail.stream);
        toast(`${name} joined`);
        playConnectionSound();
    });

    webrtc.addEventListener('removeUser', e => {
        removeParticipant(e.detail.socketId);
        playEndCallSound();
    });

    // --- Control Handlers ---
    if (micBtn) micBtn.addEventListener('click', () => {
        const track = webrtc.localStream.getAudioTracks()[0];
        track.enabled = !track.enabled;
        micBtn.classList.toggle('active', track.enabled);
        toast(track.enabled ? 'Unmuted' : 'Muted');
    });

    if (cameraBtn) cameraBtn.addEventListener('click', () => {
        const track = webrtc.localStream.getVideoTracks()[0];
        track.enabled = !track.enabled;
        cameraBtn.classList.toggle('active', track.enabled);
        toast(track.enabled ? 'Camera on' : 'Camera off');
    });

    if (copyMeetingLinkBtn) copyMeetingLinkBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.href)
            .then(() => toast('Meeting link copied!'))
            .catch(() => toast('Failed to copy link.', 'error'));
    });

    if (endBtn) endBtn.addEventListener('click', () => {
        playEndCallSound();
        webrtc.leaveRoom();
        sessionStorage.clear();
        window.location.href = '/';
    });

    // --- Debug Events ---
    webrtc.addEventListener('createdRoom', e => console.log('Created room', e.detail.roomId));
    webrtc.addEventListener('joinedRoom', e => console.log('Joined room', e.detail.roomId));
    webrtc.addEventListener('error', e => console.error('WebRTC error:', e.detail.error));
});