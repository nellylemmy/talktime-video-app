'use strict';

class Webrtc extends EventTarget {
    constructor(
        socket,
        pcConfig = null,
        logging = { log: true, warn: true, error: true }
    ) {
        super();
        this.socket = socket;
        this.pcConfig = pcConfig || {
            iceServers: [
                {
                    urls: [
                        'stun:stun.l.google.com:19302',
                        'stun:stun1.l.google.com:19302',
                        'stun:stun2.l.google.com:19302'
                    ]
                }
            ]
        };
        this.log = logging.log ? console.log.bind(console) : () => {};
        this.warn = logging.warn ? console.warn.bind(console) : () => {};
        this.error = logging.error ? console.error.bind(console) : () => {};

        this._myId = null;
        this._localStream = null;
        this.pcs = {};
        this.streams = {};
        this.room = null;
        this.isInitiator = false;
        this._isAdmin = false;
        this.isReady = false;

        this._onSocketListeners();
    }

    get localStream() { return this._localStream; }
    get myId() { return this._myId; }
    get isAdmin() { return this._isAdmin; }
    get roomId() { return this.room; }
    get participants() { return Object.keys(this.pcs); }

    joinRoom(roomId) {
        if (this.room) {
            this.warn('Leave current room before joining a new one');
            this._emit('notification', { notification: 'Leave current room before joining a new one' });
            return;
        }
        if (!roomId) {
            this.warn('Room ID not provided');
            this._emit('notification', { notification: 'Room ID not provided' });
            return;
        }
        this.room = roomId;
        this.socket.emit('join', roomId); // FIX: Was 'create or join'
    }

    leaveRoom() {
        if (!this.room) {
            this.warn('You are currently not in a room');
            this._emit('notification', { notification: 'You are currently not in a room' });
            return;
        }
        this.socket.disconnect(); // Disconnect will trigger 'disconnecting' on server
        this._removeUser(); // Clean up locally
        this.room = null;
    }

    getLocalStream(audioConstraints, videoConstraints) {
        return navigator.mediaDevices.getUserMedia({ audio: audioConstraints, video: videoConstraints })
            .then(stream => {
                this.log('Got local stream.');
                this._localStream = stream;
                return stream;
            })
            .catch(error => {
                this.error("Can't get user media", error);
                this._emit('error', { error });
                throw error;
            });
    }

    _onSocketListeners() {
        this.socket.on('connect', () => {
            this._myId = this.socket.id;
        });

        // Room creation acknowledgment from server
        this.socket.on('createdRoom', () => {
            this.isInitiator = true;
            this._isAdmin = true;
            this.isReady = true; // Ready to connect
            this._emit('createdRoom', { roomId: this.room });
        });

        // Room join acknowledgment from server
        this.socket.on('joinedRoom', () => {
            this.isReady = true;
            this._emit('joinedRoom', { roomId: this.room });
        });

        // A new user has joined the room
        this.socket.on('newUser', socketId => {
            this.log('New user joined:', socketId);
            // Use deterministic initiator role to prevent glare
            const amInitiator = this.myId < socketId;
            this._connect(socketId, amInitiator);
        });

        // Received an offer from a peer
        this.socket.on('offer', (offer, fromId) => {
            this.log('Received offer from', fromId);
            if (!this.isReady) {
                this.warn('Not ready to process offer yet.');
                return;
            }
            // Receiving an offer means we are not the initiator for this pair.
            this._connect(fromId, false); // Ensure PC exists, but do not make an offer.
            this.pcs[fromId].setRemoteDescription(new RTCSessionDescription(offer))
                .then(() => this._answer(fromId))
                .catch(err => this._emit('error', { error: err }));
        });

        // Received an answer from a peer
        this.socket.on('answer', (answer, fromId) => {
            this.log('Received answer from', fromId);
            this.pcs[fromId].setRemoteDescription(new RTCSessionDescription(answer))
                .catch(err => this._emit('error', { error: err }));
        });

        // Received an ICE candidate from a peer
        this.socket.on('iceCandidate', (candidate, fromId) => {
            this.log('Received ICE candidate from', fromId);
            if (!this.pcs[fromId]) {
                this.error('PeerConnection not found for', fromId);
                return;
            }
            const iceCandidate = new RTCIceCandidate(candidate);
            this.pcs[fromId].addIceCandidate(iceCandidate)
                .catch(err => this._emit('error', { error: err, context: 'addIceCandidate' }));
        });

        // A user has left the room
        this.socket.on('removeUser', socketId => {
            this.log('User left:', socketId);
            this._removeUser(socketId);
        });

        // Log messages from server
        this.socket.on('log', message => {
            this.log('SERVER LOG:', message);
        });
    }

    _connect(socketId, amInitiator) {
        if (!this._localStream) {
            this.warn('Local stream not available yet.');
            return;
        }
        if (this.pcs[socketId]) {
            this.warn('Connection with', socketId, 'already exists');
            return;
        }

        this.log('Creating peer connection to', socketId);
        this._createPeerConnection(socketId);
        this._localStream.getTracks().forEach(track => {
            this.pcs[socketId].addTrack(track, this._localStream);
        });

        if (amInitiator) {
            this.log('Sending offer to', socketId, '(I am initiator)');
            this._makeOffer(socketId);
        }
    }

    _createPeerConnection(socketId) {
        try {
            const pc = new RTCPeerConnection(this.pcConfig);
            pc.onicecandidate = event => this._handleIceCandidate(socketId, event);
            pc.ontrack = event => this._handleOnTrack(socketId, event);
            this.pcs[socketId] = pc;
            this.log('Created RTCPeerConnection for', socketId);
        } catch (err) {
            this.error('RTCPeerConnection failed:', err);
            this._emit('error', { error: new Error(`RTCPeerConnection failed: ${err.message}`) });
        }
    }

    _handleIceCandidate(socketId, event) {
        if (event.candidate) {
            this.socket.emit('iceCandidate', event.candidate, socketId);
        }
    }

    _makeOffer(socketId) {
        this.pcs[socketId].createOffer()
            .then(desc => this._setSendLocalDescription(socketId, desc))
            .catch(() => this._emit('error', { error: new Error('Error creating offer') }));
    }

    _answer(socketId) {
        this.pcs[socketId].createAnswer()
            .then(desc => this._setSendLocalDescription(socketId, desc))
            .catch(err => this._emit('error', { error: err }));
    }

    _setSendLocalDescription(socketId, desc) {
        this.pcs[socketId].setLocalDescription(desc)
            .then(() => {
                this.socket.emit(desc.type, desc, socketId);
            })
            .catch(err => this._emit('error', { error: err }));
    }

    _handleOnTrack(socketId, event) {
        if (this.streams[socketId]?.id !== event.streams[0].id) {
            this.streams[socketId] = event.streams[0];
            this._emit('newUser', { socketId, stream: event.streams[0] });
        }
    }

    _removeUser(socketId = null) {
        if (socketId === null) {
            for (const id in this.pcs) {
                if (this.pcs[id]) {
                    this.pcs[id].close();
                    delete this.pcs[id];
                }
            }
            this.streams = {};
        } else if (this.pcs[socketId]) {
            this.pcs[socketId].close();
            delete this.pcs[socketId];
            delete this.streams[socketId];
        }
        this._emit('removeUser', { socketId });
    }

    _emit(name, detail) {
        this.dispatchEvent(new CustomEvent(name, { detail }));
    }

    kickUser(socketId) {
        if (!this.isAdmin) {
            this._emit('notification', { notification: 'You are not an admin' });
            return;
        }
        this.socket.emit('kickUser', socketId);
    }
}

window.Webrtc = Webrtc;
