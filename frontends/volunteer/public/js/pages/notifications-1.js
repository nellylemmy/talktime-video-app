
        let currentPage = 1;
        let totalPages = 1;
        let currentFilters = {
            status: 'all',
            priority: 'all',
            type: 'all'
        };

        // Initialize page
        document.addEventListener('DOMContentLoaded', async () => {
            document.body.classList.add('page-ready');
            // Initialize TalkTimeAuth if not already done
            if (!window.TalkTimeAuth && typeof TalkTimeJWTAuth !== 'undefined') {
                window.TalkTimeAuth = new TalkTimeJWTAuth('volunteer');
            }

            // Short delay to ensure auth is ready
            setTimeout(async () => {
                if (window.TalkTimeAuth && window.TalkTimeAuth.isAuthenticated()) {
                    await loadNotifications();
                    setupEventListeners();
                } else {
                    console.error('User not authenticated');
                    window.location.href = '/volunteer/login';
                }
            }, 500);
        });

        async function loadNotifications() {
            try {
                showLoading(true);
                
                const queryParams = new URLSearchParams({
                    page: currentPage,
                    limit: 20,
                    ...currentFilters
                });

                // Handle both field names (unreadCount from notification-service, unread_count from backend)
                const renderNotifData = (data) => {
                    displayNotifications(data.notifications);
                    updatePagination(data.pagination);
                    updateUnreadCount(data.unreadCount || data.unread_count || 0);
                };

                if (window.swrFetch) {
                    await window.swrFetch({
                        key: 'notifications:' + queryParams.toString(),
                        url: `/api/v1/notifications?${queryParams}`,
                        container: '#notifications-list',
                        render: renderNotifData
                    });
                } else {
                    const response = await window.TalkTimeAuth.authenticatedRequest(`/api/v1/notifications?${queryParams}`);
                    if (!response.ok) {
                        throw new Error('Failed to load notifications');
                    }
                    renderNotifData(await response.json());
                }

            } catch (error) {
                console.error('Error loading notifications:', error);
                showToast('Failed to load notifications', 'error');
            } finally {
                showLoading(false);
            }
        }

        // Store all notifications for client-side filtering
        let allNotifications = [];

        function displayNotifications(notifications) {
            const container = document.getElementById('notifications-list');
            const emptyState = document.getElementById('empty-state');
            const loadingState = document.getElementById('loading-state');

            // Hide loading state immediately when displaying
            if (loadingState) loadingState.classList.add('hidden');

            // Store for filtering
            allNotifications = notifications || [];

            // Update filter counts
            updateFilterCounts(allNotifications);

            if (!notifications || notifications.length === 0) {
                container.innerHTML = '';
                emptyState.classList.remove('hidden');
                return;
            }

            emptyState.classList.add('hidden');

            // Group by date
            const grouped = groupByDate(notifications);
            let html = '';

            const groupOrder = ['Today', 'Yesterday', 'This Week', 'Older'];
            groupOrder.forEach(groupName => {
                if (!grouped[groupName] || grouped[groupName].length === 0) return;

                html += `<div class="notif-date-group">${groupName}</div>`;

                grouped[groupName].forEach(notification => {
                    const typeIcon = getTypeIcon(notification.type);
                    const isUnread = !notification.is_read;
                    const stateClass = isUnread ? 'unread' : 'read';

                    const actionUrl = (notification.action_url && notification.action_url.startsWith('/')) ? notification.action_url : '';
                    html += `
                        <div class="notification-item ${stateClass}" data-id="${notification.id}" data-action-url="${escapeHtml(actionUrl)}" ${actionUrl ? 'style="cursor:pointer;"' : ''}>
                            <div class="notif-type-icon ${typeIcon.class}">
                                <i class="fas ${typeIcon.icon}"></i>
                                ${isUnread ? '<span class="notif-unread-indicator"></span>' : ''}
                            </div>
                            <div class="notif-content">
                                <div class="notif-title-row">
                                    <div class="notif-title">${escapeHtml(notification.title || 'Notification')}</div>
                                    ${isUnread ? '<span class="notif-new-badge">New</span>' : ''}
                                </div>
                                <div class="notif-message">${escapeHtml(notification.message || '')}</div>
                                <div class="notif-time">
                                    <i class="fas fa-clock"></i>
                                    ${formatDate(notification.created_at)}
                                </div>
                            </div>
                            <div class="notif-actions">
                                <button class="notif-action-btn delete delete-btn" data-id="${notification.id}" title="Delete">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    `;
                });
            });

            container.innerHTML = html;
        }

        function groupByDate(notifications) {
            const groups = { 'Today': [], 'Yesterday': [], 'This Week': [], 'Older': [] };
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const yesterday = new Date(today - 86400000);
            const weekAgo = new Date(today - 7 * 86400000);

            notifications.forEach(n => {
                const date = new Date(n.created_at);
                if (date >= today) {
                    groups['Today'].push(n);
                } else if (date >= yesterday) {
                    groups['Yesterday'].push(n);
                } else if (date >= weekAgo) {
                    groups['This Week'].push(n);
                } else {
                    groups['Older'].push(n);
                }
            });

            return groups;
        }

        function getTypeIcon(type) {
            if (!type) return { icon: 'fa-bell', class: 'system' };
            type = type.toLowerCase();

            // Canceled meetings - red
            if (type.includes('cancel')) {
                return { icon: 'fa-calendar-times', class: 'canceled' };
            }
            // Rescheduled meetings - orange
            if (type.includes('reschedul')) {
                return { icon: 'fa-calendar-alt', class: 'rescheduled' };
            }
            // Messages - blue
            if (type.includes('message')) {
                return { icon: 'fa-comment-dots', class: 'message' };
            }
            // Missed calls - amber (check before generic 'call')
            if (type.includes('missed')) {
                return { icon: 'fa-phone-slash', class: 'rescheduled' }; // Use orange/amber style
            }
            // Scheduled meetings - green
            if (type.includes('scheduled') || type.includes('meeting')) {
                return { icon: 'fa-calendar-check', class: 'meeting' };
            }
            // Instant calls - green
            if (type.includes('call') || type.includes('instant')) {
                return { icon: 'fa-phone-alt', class: 'call' };
            }
            // Reminders - blue
            if (type.includes('reminder')) {
                return { icon: 'fa-clock', class: 'reminder' };
            }
            // System/default - purple
            return { icon: 'fa-bullhorn', class: 'system' };
        }

        function getNotifCategory(type) {
            if (!type) return 'system';
            type = type.toLowerCase();
            if (type.includes('message')) return 'message';
            if (type.includes('meeting') || type.includes('call') || type.includes('scheduled')) return 'meeting';
            if (type.includes('reminder')) return 'reminder';
            return 'system';
        }

        function updateFilterCounts(notifications) {
            const counts = {
                all: notifications.length,
                unread: notifications.filter(n => !n.is_read).length,
                meeting: notifications.filter(n => getNotifCategory(n.type) === 'meeting').length,
                reminder: notifications.filter(n => getNotifCategory(n.type) === 'reminder').length,
                system: notifications.filter(n => getNotifCategory(n.type) === 'system').length
            };

            document.getElementById('count-all').textContent = counts.all;
            document.getElementById('count-unread').textContent = counts.unread;
            document.getElementById('count-meeting').textContent = counts.meeting;
            document.getElementById('count-reminder').textContent = counts.reminder;
            document.getElementById('count-system').textContent = counts.system;

            // Also update the nav badge to keep it in sync
            updateUnreadCount(counts.unread);
        }

        function escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function updatePagination(pagination) {
            const container = document.getElementById('pagination-container');
            const info = document.getElementById('pagination-info');
            const prevBtn = document.getElementById('prev-page-btn');
            const nextBtn = document.getElementById('next-page-btn');

            // Handle missing or invalid pagination data
            if (!pagination || !pagination.total_pages || pagination.total_pages <= 1) {
                container.classList.add('hidden');
                return;
            }

            container.classList.remove('hidden');
            totalPages = pagination.total_pages || 1;

            const currentPage = pagination.current_page || 1;
            const perPage = pagination.per_page || 20;
            const totalCount = pagination.total_count || 0;

            const start = ((currentPage - 1) * perPage) + 1;
            const end = Math.min(start + perPage - 1, totalCount);

            info.textContent = `${start}-${end} of ${totalCount} notifications`;

            prevBtn.disabled = !pagination.has_prev_page;
            nextBtn.disabled = !pagination.has_next_page;
        }

        function updateUnreadCount(count) {
            // Update all notification badges via the dashboard nav component
            if (window.VolunteerDashboardNav) {
                window.VolunteerDashboardNav.updateNotificationBadge(count);
            } else {
                // Fallback: Update header badge directly
                const badge = document.getElementById('notification-badge');
                if (badge) {
                    if (count > 0) {
                        badge.textContent = count > 99 ? '99+' : count;
                        badge.classList.remove('hidden');
                    } else {
                        badge.classList.add('hidden');
                    }
                }
            }
        }

        let currentPillFilter = 'all';

        function setupEventListeners() {
            // Pill filter clicks
            document.querySelectorAll('.filter-pill').forEach(pill => {
                pill.addEventListener('click', () => {
                    // Update active state
                    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');

                    // Apply filter
                    currentPillFilter = pill.dataset.filter;
                    applyClientSideFilter();
                });
            });

            function applyClientSideFilter() {
                let filtered = allNotifications;

                if (currentPillFilter === 'unread') {
                    filtered = allNotifications.filter(n => !n.is_read);
                } else if (currentPillFilter === 'meeting') {
                    filtered = allNotifications.filter(n => getNotifCategory(n.type) === 'meeting');
                } else if (currentPillFilter === 'reminder') {
                    filtered = allNotifications.filter(n => getNotifCategory(n.type) === 'reminder');
                } else if (currentPillFilter === 'system') {
                    filtered = allNotifications.filter(n => getNotifCategory(n.type) === 'system');
                }

                // Re-render with filtered data
                const container = document.getElementById('notifications-list');
                const emptyState = document.getElementById('empty-state');

                if (filtered.length === 0) {
                    container.innerHTML = '';
                    emptyState.classList.remove('hidden');
                    return;
                }

                emptyState.classList.add('hidden');

                // Group and render
                const grouped = groupByDate(filtered);
                let html = '';

                const groupOrder = ['Today', 'Yesterday', 'This Week', 'Older'];
                groupOrder.forEach(groupName => {
                    if (!grouped[groupName] || grouped[groupName].length === 0) return;

                    html += `<div class="notif-date-group">${groupName}</div>`;

                    grouped[groupName].forEach(notification => {
                        const typeIcon = getTypeIcon(notification.type);
                        const isUnread = !notification.is_read;
                        const stateClass = isUnread ? 'unread' : 'read';

                        html += `
                            <div class="notification-item ${stateClass}" data-id="${notification.id}">
                                <div class="notif-type-icon ${typeIcon.class}">
                                    <i class="fas ${typeIcon.icon}"></i>
                                    ${isUnread ? '<span class="notif-unread-indicator"></span>' : ''}
                                </div>
                                <div class="notif-content">
                                    <div class="notif-title-row">
                                        <div class="notif-title">${escapeHtml(notification.title || 'Notification')}</div>
                                        ${isUnread ? '<span class="notif-new-badge">New</span>' : ''}
                                    </div>
                                    <div class="notif-message">${escapeHtml(notification.message || '')}</div>
                                    <div class="notif-time">
                                        <i class="fas fa-clock"></i>
                                        ${formatDate(notification.created_at)}
                                    </div>
                                </div>
                                <div class="notif-actions">
                                    <button class="notif-action-btn delete delete-btn" data-id="${notification.id}" title="Delete">
                                        <i class="fas fa-times"></i>
                                    </button>
                                </div>
                            </div>
                        `;
                    });
                });

                container.innerHTML = html;
            }

            // Pagination
            document.getElementById('prev-page-btn').addEventListener('click', () => {
                if (currentPage > 1) {
                    currentPage--;
                    loadNotifications();
                }
            });

            document.getElementById('next-page-btn').addEventListener('click', () => {
                if (currentPage < totalPages) {
                    currentPage++;
                    loadNotifications();
                }
            });

            // Mark all as read
            document.getElementById('mark-all-read-btn').addEventListener('click', async () => {
                try {
                    const response = await window.TalkTimeAuth.authenticatedRequest('/api/v1/notifications/read-all', {
                        method: 'PUT'
                    });

                    if (response.ok) {
                        showToast('All notifications marked as read', 'success');
                        if (window.swrInvalidate) window.swrInvalidate('notifications');
                        loadNotifications();
                    }
                } catch (error) {
                    console.error('Error marking all as read:', error);
                    showToast('Failed to mark notifications as read', 'error');
                }
            });

            // Refresh
            document.getElementById('refresh-btn').addEventListener('click', () => {
                const icon = document.getElementById('refresh-icon');
                icon.classList.add('loading');
                
                loadNotifications().finally(() => {
                    setTimeout(() => icon.classList.remove('loading'), 500);
                });
            });

            // Individual notification actions (delegated)
            document.addEventListener('click', async (e) => {
                const markReadBtn = e.target.closest('.mark-read-btn');
                const deleteBtn = e.target.closest('.delete-btn');
                const notifItem = e.target.closest('.notification-item');

                if (markReadBtn) {
                    e.stopPropagation();
                    await markAsRead(markReadBtn.dataset.id);
                } else if (deleteBtn) {
                    e.stopPropagation();
                    await deleteNotification(deleteBtn.dataset.id);
                } else if (notifItem) {
                    // Mark unread items read, then take the user to the notification's subject
                    const id = notifItem.dataset.id;
                    const actionUrl = notifItem.dataset.actionUrl;
                    if (id && notifItem.classList.contains('unread')) await markAsRead(id);
                    if (actionUrl) window.location.href = actionUrl;
                }
            });
        }

        async function markAsRead(id) {
            try {
                const response = await window.TalkTimeAuth.authenticatedRequest(`/api/v1/notifications/${id}/read`, {
                    method: 'PUT'
                });

                if (response.ok) {
                    showToast('Notification marked as read', 'success');
                    if (window.swrInvalidate) window.swrInvalidate('notifications');
                    loadNotifications();
                }
            } catch (error) {
                console.error('Error marking as read:', error);
                showToast('Failed to mark notification as read', 'error');
            }
        }

        async function deleteNotification(id) {
            const confirmed = window.showConfirmation
                ? await window.showConfirmation('Are you sure you want to delete this notification?', { title: 'Delete Notification', confirmText: 'Delete', cancelText: 'Cancel', type: 'warning' })
                : confirm('Are you sure you want to delete this notification?');

            if (!confirmed) {
                return;
            }

            try {
                const response = await window.TalkTimeAuth.authenticatedRequest(`/api/v1/notifications/${id}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    showToast('Notification deleted', 'success');
                    if (window.swrInvalidate) window.swrInvalidate('notifications');
                    loadNotifications();
                }
            } catch (error) {
                console.error('Error deleting notification:', error);
                showToast('Failed to delete notification', 'error');
            }
        }

        function showLoading(show) {
            const loadingState = document.getElementById('loading-state');
            const notificationsList = document.getElementById('notifications-list');
            const emptyState = document.getElementById('empty-state');

            if (show) {
                // Show skeleton, hide content
                loadingState.classList.remove('hidden');
                if (notificationsList) notificationsList.innerHTML = '';
                if (emptyState) emptyState.classList.add('hidden');
            } else {
                // Hide skeleton
                loadingState.classList.add('hidden');
            }
        }

        function showToast(message, type = 'info') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            const bgColor = type === 'error' ? 'bg-red-500' : type === 'success' ? 'bg-green-500' : 'bg-blue-500';
            
            toast.className = `${bgColor} text-white px-6 py-3 rounded-lg shadow-lg mb-2 transform translate-x-full transition-transform duration-300`;
            toast.textContent = message;
            
            container.appendChild(toast);
            
            setTimeout(() => toast.classList.remove('translate-x-full'), 100);
            setTimeout(() => {
                toast.classList.add('translate-x-full');
                setTimeout(() => container.removeChild(toast), 300);
            }, 3000);
        }

        function formatDate(dateString) {
            // Compare local calendar days (matches the date group headers),
            // not elapsed-time buckets - "yesterday 23:30 at 00:30" is Yesterday
            const date = new Date(dateString);
            const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
            const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / (1000 * 60 * 60 * 24));

            if (dayDiff === 0) {
                return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            } else if (dayDiff === 1) {
                return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
            } else if (dayDiff > 1 && dayDiff <= 7) {
                return `${dayDiff} days ago`;
            } else {
                return date.toLocaleDateString();
            }
        }
    