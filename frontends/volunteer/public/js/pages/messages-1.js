
    (function() {
        // --- DOM Elements ---
        const messagesList = document.getElementById('messages-list');
        const notificationEl = document.getElementById('notification');
        const conversationModal = document.getElementById('conversation-modal');
        const conversationMessages = document.getElementById('conversation-messages');
        const conversationName = document.getElementById('conversation-name');
        const conversationRole = document.getElementById('conversation-role');
        const conversationAvatar = document.getElementById('conversation-avatar');
        const closeConversationBtn = document.getElementById('close-conversation');
        const messageInput = document.getElementById('message-input');
        const sendMessageBtn = document.getElementById('send-message-btn');

        // State
        let allMessages = [];
        let isInitialized = false;
        let isLoading = false;
        let currentConversationPersonId = null;
        let currentConversationPersonRole = null;
        let socket = null;
        let currentUserId = null;

        // --- Initialize TalkTime Auth ---
        function initializeApp() {
            if (typeof TalkTimeJWTAuth === 'undefined') {
                setTimeout(initializeApp, 50);
                return;
            }

            if (!window.TalkTimeAuth) {
                window.TalkTimeAuth = new TalkTimeJWTAuth('volunteer');
            }

            isInitialized = true;

            // Get current user ID
            const user = window.TalkTimeAuth.getUser();
            if (user) {
                currentUserId = user.id;
            }

            loadMessages();
            initializeSocket();
            updateMessageBadge();
        }

        // Update message badge in header
        async function updateMessageBadge() {
            try {
                const response = await window.TalkTimeAuth.authenticatedRequest('/api/v1/volunteers/me/messages/unread-count?_t=' + Date.now());
                if (response.ok) {
                    const data = await response.json();
                    const count = data.unreadCount || 0;
                    const badge = document.getElementById('message-badge');
                    if (badge) {
                        if (count > 0) {
                            badge.textContent = count > 99 ? '99+' : count.toString();
                            badge.classList.remove('hidden');
                        } else {
                            badge.classList.add('hidden');
                        }
                    }
                }
            } catch (error) {
                console.error('Error updating message badge:', error);
            }
        }

        // Update notification badge in header (for when message notifications are auto-read)
        async function updateNotificationBadge() {
            try {
                const response = await window.TalkTimeAuth.authenticatedRequest('/api/v1/notifications/unread-count');
                if (response.ok) {
                    const data = await response.json();
                    const count = data.unreadCount || 0;
                    const badge = document.getElementById('notification-badge');
                    if (badge) {
                        if (count > 0) {
                            badge.textContent = count > 99 ? '99+' : count.toString();
                            badge.classList.remove('hidden');
                        } else {
                            badge.classList.add('hidden');
                        }
                    }
                }
            } catch (error) {
                console.error('Error updating notification badge:', error);
            }
        }

        // --- Initialize Socket.IO ---
        function initializeSocket() {
            if (typeof io === 'undefined') {
                console.log('Socket.IO not loaded yet, retrying...');
                setTimeout(initializeSocket, 100);
                return;
            }

            socket = io({
                transports: ['websocket', 'polling'],
                upgrade: true
            });

            socket.on('connect', () => {
                console.log('[Chat] Socket connected:', socket.id);
                const user = window.TalkTimeAuth.getUser();
                if (user) {
                    socket.emit('join-user-room', {
                        userId: user.id,
                        role: 'volunteer',
                        rooms: [`volunteer_${user.id}`, `user_${user.id}`]
                    });
                }
            });

            // Listen for new chat messages
            socket.on('new-chat-message', (data) => {
                console.log('[Chat] New message received:', data);

                // Skip if this is our own message (we already added it when sending)
                if (data.senderId === currentUserId) {
                    console.log('[Chat] Skipping own message');
                    return;
                }

                // Add to allMessages
                const newMsg = {
                    id: data.id,
                    senderId: data.senderId,
                    recipientId: data.recipientId,
                    content: data.content,
                    createdAt: data.createdAt,
                    isRead: false,
                    isSentByMe: false,
                    otherPersonName: data.senderName,
                    otherPersonRole: data.senderRole
                };

                allMessages.unshift(newMsg);

                // If conversation is open with this person, add message to view
                if (currentConversationPersonId && data.senderId == currentConversationPersonId) {
                    appendMessageToConversation(newMsg);
                }

                // Re-render conversation list
                renderConversations(allMessages);

                // Show notification and play sound
                showNotification(`New message from ${data.senderName}`, 'success');

                // Sound is handled globally by realtime-notifications.js

                // Update message badge in header
                updateMessageBadge();
            });

            // Listen for sent confirmation
            socket.on('chat-message-sent', (data) => {
                console.log('[Chat] Message sent confirmed:', data);
                // Update the temporary message with real data
                const tempMsg = document.querySelector('.message-bubble.sending');
                if (tempMsg) {
                    tempMsg.classList.remove('sending');
                }
            });

            // Listen for errors
            socket.on('chat-message-error', (data) => {
                console.error('[Chat] Message error:', data);
                showNotification('Failed to send message', 'error');
                const tempMsg = document.querySelector('.message-bubble.sending');
                if (tempMsg) {
                    tempMsg.classList.remove('sending');
                    tempMsg.classList.add('failed');
                }
            });

            socket.on('disconnect', () => {
                console.log('[Chat] Socket disconnected');
            });
        }

        // Handle page show (including bfcache restoration)
        window.addEventListener('pageshow', function(event) {
            console.log('pageshow event, persisted:', event.persisted);
            if (event.persisted) {
                // Page was restored from bfcache - reload messages
                if (isInitialized && !isLoading) {
                    loadMessages();
                }
            }
        });

        // Handle visibility change (tab switching)
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'visible' && isInitialized && !isLoading) {
                // Tab became visible - reload messages
                loadMessages();
            }
        });

        // Start initialization immediately (DOM should be ready since script is at bottom)
        initializeApp();

        // --- Utility Functions ---
        function showNotification(message, type = 'success') {
            notificationEl.textContent = message;
            notificationEl.className = `fixed bottom-20 left-4 right-4 md:bottom-5 md:right-5 md:left-auto md:w-auto px-6 py-3 rounded-lg shadow-lg z-50 ${type === 'success' ? 'bg-success text-white' : 'bg-error text-white'}`;
            notificationEl.classList.remove('hidden');

            setTimeout(() => {
                notificationEl.classList.add('hidden');
            }, 5000);
        }

        function formatTime(dateStr) {
            const date = new Date(dateStr);
            const now = new Date();
            const diffMs = now - date;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffDays === 0) {
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else if (diffDays === 1) {
                return 'Yesterday';
            } else if (diffDays < 7) {
                return date.toLocaleDateString([], { weekday: 'short' });
            } else {
                return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
            }
        }

        function formatMessageTime(dateStr) {
            const date = new Date(dateStr);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        // --- Load Messages ---
        async function loadMessages() {
            if (isLoading) return;

            if (!window.TalkTimeAuth || !window.TalkTimeAuth.isAuthenticated()) {
                console.error('Volunteer not authenticated');
                showNotification('Please log in to view messages.', 'error');
                window.location.href = '/volunteer/login';
                return;
            }

            isLoading = true;
            console.log('Loading messages...');

            try {
                // Add timestamp to bust any cache
                const url = '/api/v1/volunteers/me/messages?_t=' + Date.now();
                const response = await window.TalkTimeAuth.authenticatedRequest(url, {
                    method: 'GET',
                    cache: 'no-store',
                    headers: {
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache'
                    }
                });

                if (response.ok) {
                    const data = await response.json();

                    if (data.success && data.data) {
                        allMessages = data.data;
                        renderConversations(data.data);

                        // Check for openConversation URL parameter (from message modal link)
                        handleOpenConversationParam();
                    } else {
                        renderConversations([]);
                    }
                } else {
                    console.error('Failed to fetch messages, status:', response.status);
                    renderConversations([]);
                }
            } catch (error) {
                console.error('Network error fetching messages:', error);
                renderConversations([]);
            } finally {
                isLoading = false;
            }
        }

        // --- Handle openConversation URL parameter ---
        let openConversationHandled = false;
        function handleOpenConversationParam() {
            // Only handle once per page load
            if (openConversationHandled) return;

            const urlParams = new URLSearchParams(window.location.search);
            const openConversationId = urlParams.get('openConversation');

            if (!openConversationId) return;

            openConversationHandled = true;
            console.log('[Messages] Auto-opening conversation with user:', openConversationId);

            // Find the person's info from messages
            let personName = 'Unknown';
            let personRole = 'student';

            // Look through messages to find this person's name
            for (const msg of allMessages) {
                if (msg.senderId == openConversationId) {
                    personName = msg.otherPersonName || 'Student';
                    personRole = msg.otherPersonRole || 'student';
                    break;
                }
                if (msg.recipientId == openConversationId && msg.isSentByMe) {
                    personName = msg.otherPersonName || 'Student';
                    personRole = msg.otherPersonRole || 'student';
                    break;
                }
            }

            // Clean up URL without reloading (remove the parameter)
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, '', cleanUrl);

            // Open the conversation
            setTimeout(() => {
                openConversation(openConversationId, personName, personRole);
            }, 100);
        }

        // --- Render Conversations List ---
        function renderConversations(messages) {
            if (!messages || messages.length === 0) {
                messagesList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">
                            <i class="fas fa-comments"></i>
                        </div>
                        <h3 class="text-lg font-semibold text-gray-800 mb-2">No messages yet</h3>
                        <p class="text-gray-500 mb-6">Start a conversation with students here.</p>
                        <a href="/volunteer/dashboard/students" class="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 bg-brand-primary text-white rounded-lg font-medium hover:opacity-90 transition-opacity">
                            <i class="fas fa-users"></i>
                            Browse Students
                        </a>
                    </div>
                `;
                return;
            }

            // Group messages by conversation partner
            const conversations = {};
            messages.forEach(message => {
                const otherPersonId = message.isSentByMe ? message.recipientId : message.senderId;
                const otherPersonName = message.otherPersonName || `User ${otherPersonId}`;

                if (!conversations[otherPersonId]) {
                    conversations[otherPersonId] = {
                        personId: otherPersonId,
                        personName: otherPersonName,
                        personRole: message.otherPersonRole || 'Student',
                        messages: []
                    };
                }
                conversations[otherPersonId].messages.push(message);
            });

            // Sort conversations by latest message
            const sortedConversations = Object.values(conversations).sort((a, b) => {
                const aLatest = new Date(a.messages[0].createdAt);
                const bLatest = new Date(b.messages[0].createdAt);
                return bLatest - aLatest;
            });

            const conversationsHtml = sortedConversations.map(conv => {
                const latestMessage = conv.messages[0];
                const unreadCount = conv.messages.filter(m => !m.isRead && !m.isSentByMe).length;
                const initial = conv.personName.charAt(0).toUpperCase();
                const previewText = latestMessage.isSentByMe ? `You: ${latestMessage.content}` : latestMessage.content;

                return `
                    <div class="message-card" data-person-id="${conv.personId}" data-person-name="${escapeHtml(conv.personName)}" data-person-role="${escapeHtml(conv.personRole)}">
                        <div class="flex items-start gap-3">
                            <div class="message-avatar flex-shrink-0">${escapeHtml(initial)}</div>
                            <div class="flex-1 min-w-0 overflow-hidden">
                                <div class="flex items-center justify-between gap-2 mb-1">
                                    <div class="flex items-center gap-2 min-w-0 flex-1">
                                        <h4 class="font-semibold text-gray-900 truncate">${escapeHtml(conv.personName)}</h4>
                                        <span class="role-badge flex-shrink-0">${escapeHtml(conv.personRole)}</span>
                                    </div>
                                    <span class="text-xs text-gray-400 whitespace-nowrap flex-shrink-0">${formatTime(latestMessage.createdAt)}</span>
                                </div>
                                <div class="flex items-center justify-between gap-2">
                                    <p class="message-preview flex-1 min-w-0">${escapeHtml(previewText)}</p>
                                    ${unreadCount > 0 ? `<span class="unread-badge flex-shrink-0">${unreadCount}</span>` : ''}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            messagesList.innerHTML = conversationsHtml;

            // Add click handlers
            document.querySelectorAll('.message-card').forEach(card => {
                card.addEventListener('click', () => {
                    const personId = card.dataset.personId;
                    const personName = card.dataset.personName;
                    const personRole = card.dataset.personRole;
                    openConversation(personId, personName, personRole);
                });
            });
        }

        // --- Open Conversation ---
        async function openConversation(personId, personName, personRole) {
            currentConversationPersonId = personId;
            currentConversationPersonRole = personRole;

            // Update header
            conversationName.textContent = personName;
            conversationRole.textContent = personRole;
            conversationAvatar.textContent = personName.charAt(0).toUpperCase();

            // Mark messages from this person as read
            try {
                await window.TalkTimeAuth.authenticatedRequest('/api/v1/volunteers/me/messages/read', {
                    method: 'PATCH',
                    cache: 'no-store',
                    headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache'
                    },
                    body: JSON.stringify({ senderId: parseInt(personId) })
                });

                // Update local state - mark messages as read
                allMessages.forEach(m => {
                    if (m.senderId == personId && !m.isSentByMe) {
                        m.isRead = true;
                    }
                });

                // Re-render the conversation list to update badge
                renderConversations(allMessages);

                // Update header badges - both message and notification
                updateMessageBadge();
                updateNotificationBadge();
            } catch (error) {
                console.error('Error marking messages as read:', error);
            }

            // Filter messages for this conversation
            const conversationMsgs = allMessages.filter(m =>
                m.senderId == personId || m.recipientId == personId
            ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

            // Render messages
            if (conversationMsgs.length === 0) {
                conversationMessages.innerHTML = `
                    <div class="text-center py-8 text-gray-500">
                        <p>No messages yet. Start the conversation!</p>
                    </div>
                `;
            } else {
                conversationMessages.innerHTML = conversationMsgs.map(msg => `
                    <div class="message-bubble ${msg.isSentByMe ? 'sent' : 'received'}" data-msg-id="${msg.id}">
                        <p>${escapeHtml(msg.content)}</p>
                        <div class="message-time">${formatMessageTime(msg.createdAt)}</div>
                    </div>
                `).join('');

                // Scroll to bottom
                setTimeout(() => {
                    conversationMessages.scrollTop = conversationMessages.scrollHeight;
                }, 50);
            }

            // Clear input
            messageInput.value = '';
            updateSendButton();

            // Show modal
            conversationModal.classList.add('active');
            document.body.style.overflow = 'hidden';

            // Focus input
            setTimeout(() => messageInput.focus(), 300);
        }

        // --- Append message to conversation view ---
        function appendMessageToConversation(msg) {
            const emptyState = conversationMessages.querySelector('.text-center');
            if (emptyState) {
                emptyState.remove();
            }

            const messageEl = document.createElement('div');
            messageEl.className = `message-bubble ${msg.isSentByMe ? 'sent' : 'received'}`;
            messageEl.dataset.msgId = msg.id;
            messageEl.innerHTML = `
                <p>${escapeHtml(msg.content)}</p>
                <div class="message-time">${formatMessageTime(msg.createdAt)}</div>
            `;

            conversationMessages.appendChild(messageEl);

            // Scroll to bottom
            conversationMessages.scrollTop = conversationMessages.scrollHeight;
        }

        // --- Send Message ---
        async function sendMessage() {
            const content = messageInput.value.trim();
            if (!content || !currentConversationPersonId) return;

            const recipientId = parseInt(currentConversationPersonId);

            // Clear input immediately
            messageInput.value = '';
            updateSendButton();

            // Create temporary message display
            const tempMsg = {
                id: 'temp-' + Date.now(),
                senderId: currentUserId,
                recipientId: recipientId,
                content: content,
                createdAt: new Date().toISOString(),
                isRead: false,
                isSentByMe: true
            };

            // Add to conversation view with sending state
            const messageEl = document.createElement('div');
            messageEl.className = 'message-bubble sent sending';
            messageEl.innerHTML = `
                <p>${escapeHtml(content)}</p>
                <div class="message-time">${formatMessageTime(tempMsg.createdAt)}</div>
            `;

            const emptyState = conversationMessages.querySelector('.text-center');
            if (emptyState) {
                emptyState.remove();
            }

            conversationMessages.appendChild(messageEl);
            conversationMessages.scrollTop = conversationMessages.scrollHeight;

            // Send via REST API (more reliable than Socket.IO for persistence)
            try {
                const response = await window.TalkTimeAuth.authenticatedRequest('/api/v1/messages/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        recipientId: recipientId,
                        content: content
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.success) {
                        // Update temp message with real data
                        messageEl.classList.remove('sending');
                        messageEl.dataset.msgId = data.message.id;

                        // Add to allMessages
                        const realMsg = {
                            id: data.message.id,
                            senderId: currentUserId,
                            recipientId: recipientId,
                            content: data.message.content,
                            createdAt: data.message.createdAt,
                            isRead: false,
                            isSentByMe: true,
                            otherPersonName: conversationName.textContent,
                            otherPersonRole: conversationRole.textContent
                        };
                        allMessages.unshift(realMsg);
                        renderConversations(allMessages);
                    } else {
                        throw new Error(data.message || 'Failed to send');
                    }
                } else {
                    throw new Error('Server error');
                }
            } catch (error) {
                console.error('Error sending message:', error);
                messageEl.classList.remove('sending');
                messageEl.classList.add('failed');
                showNotification('Failed to send message', 'error');
            }
        }

        // --- Update Send Button State ---
        function updateSendButton() {
            const hasContent = messageInput.value.trim().length > 0;
            sendMessageBtn.disabled = !hasContent;
        }

        // --- Escape HTML ---
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // --- Close Conversation ---
        function closeConversation() {
            conversationModal.classList.remove('active');
            document.body.style.overflow = '';
            currentConversationPersonId = null;
            currentConversationPersonRole = null;
        }

        // Keep the chat composer above the iOS keyboard: size the panel to the
        // visual viewport while the conversation is open (iOS Safari does not
        // resize fixed-position layouts when the keyboard appears)
        if (window.visualViewport) {
            const panel = document.querySelector('.conversation-panel');
            const sizeToViewport = () => {
                if (!conversationModal.classList.contains('active') || !panel) return;
                panel.style.height = Math.min(window.visualViewport.height * 0.98, window.innerHeight * 0.85) + 'px';
            };
            window.visualViewport.addEventListener('resize', sizeToViewport);
            window.visualViewport.addEventListener('scroll', sizeToViewport);
        }

        // --- Event Listeners ---
        closeConversationBtn.addEventListener('click', closeConversation);

        conversationModal.addEventListener('click', (e) => {
            if (e.target === conversationModal) {
                closeConversation();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && conversationModal.classList.contains('active')) {
                closeConversation();
            }
        });

        // Message input events
        messageInput.addEventListener('input', updateSendButton);

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!sendMessageBtn.disabled) {
                    sendMessage();
                }
            }
        });

        sendMessageBtn.addEventListener('click', sendMessage);

    })();
    