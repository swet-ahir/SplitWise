// ===== NOTIFICATIONS VIEW =====

function renderNotificationsPage() {
  const notifications = store.getUserNotifications();
  store.markNotificationsRead();
  updateNotificationBadge();

  document.getElementById('page-title').textContent = 'Notifications';
  document.getElementById('page-content').innerHTML = `
    <div class="d-flex justify-between align-center mb-24">
      <p class="text-muted">${notifications.length} notification${notifications.length !== 1 ? 's' : ''}</p>
      ${notifications.length > 0 ? `<button class="btn btn-ghost btn-sm" onclick="clearAllNotifications()">Clear All</button>` : ''}
    </div>
    <div class="card">
      <div class="card-body" style="padding:0">
        ${notifications.length === 0
          ? emptyStateHTML('🔔', 'No notifications', 'You\'re all caught up! Notifications will appear here when group members add expenses or settle up.')
          : notifications.map(n => renderNotificationItem(n)).join('')
        }
      </div>
    </div>
  `;
}

function renderNotificationItem(n) {
  const icons = {
    expense_added: '💸',
    group_added: '👥',
    settled: '💰',
    reminder: '⏰',
    default: '🔔',
  };
  const icon = icons[n.type] || icons.default;
  const bgColors = {
    expense_added: '#fef3c7',
    group_added: '#eff6ff',
    settled: '#f0fdf4',
    default: '#f9fafb',
  };
  const bg = bgColors[n.type] || bgColors.default;

  return `
    <div class="notification-item ${n.read ? '' : 'unread'}" onclick="handleNotificationClick('${n.id}','${n.meta?.groupId || ''}')">
      <div style="width:36px;height:36px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${icon}</div>
      <div class="notification-content flex-1">
        <div class="title">${n.message}</div>
        <div class="time">${timeAgo(n.createdAt)}</div>
      </div>
      ${!n.read ? '<div class="notification-dot"></div>' : ''}
    </div>`;
}

window.handleNotificationClick = function(id, groupId) {
  store.markNotificationRead(id);
  if (groupId) navigate('group:' + groupId);
};

window.clearAllNotifications = function() {
  const me = store.currentUser;
  store.data.notifications = store.data.notifications.filter(n => n.userId !== me.id);
  store.data.notifications; // trigger save via dirty check
  localStorage.setItem('splitwise_data', JSON.stringify(store.data));
  showToast('Notifications cleared', 'info');
  renderNotificationsPage();
};

function updateNotificationBadge() {
  const count = store.getUnreadCount();
  const badge = document.getElementById('notif-badge');
  if (badge) {
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
}

window.renderNotificationsPage = renderNotificationsPage;
window.updateNotificationBadge = updateNotificationBadge;
