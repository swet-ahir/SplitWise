// ===== NOTIFICATIONS VIEW =====

async function renderNotificationsPage() {
  document.getElementById('page-title').textContent = 'Notifications';
  document.getElementById('page-content').innerHTML = spinnerHTML();

  try {
    const notifications = await api.getNotifications();

    // Mark all as read
    await api.markAllRead().catch(() => {});

    // Update badge
    _unreadCount = 0;
    updateNotificationBadge();

    document.getElementById('page-content').innerHTML = `
      <div class="d-flex justify-between align-center mb-24">
        <p class="text-muted">${notifications.length} notification${notifications.length !== 1 ? 's' : ''}</p>
        ${notifications.length > 0 ? `<button class="btn btn-ghost btn-sm" onclick="clearAllNotifications()">Clear All</button>` : ''}
      </div>
      <div class="card">
        <div class="card-body" style="padding:0">
          ${notifications.length === 0
            ? emptyStateHTML('🔔', 'No notifications', "You're all caught up! Notifications will appear here when group members add expenses or settle up.")
            : notifications.map(n => renderNotificationItem(n)).join('')
          }
        </div>
      </div>
    `;
  } catch (err) {
    document.getElementById('page-content').innerHTML = `
      <div class="card"><div class="card-body">
        ${emptyStateHTML('⚠️', 'Failed to load notifications', err.message, '<button class="btn btn-primary" onclick="navigate(\'notifications\')">Retry</button>')}
      </div></div>`;
  }
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
  const groupId = n.meta?.groupId || '';

  return `
    <div class="notification-item ${n.read ? '' : 'unread'}" onclick="handleNotificationClick('${groupId}')">
      <div style="width:36px;height:36px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${icon}</div>
      <div class="notification-content flex-1">
        <div class="title">${n.message}</div>
        <div class="time">${timeAgo(n.createdAt)}</div>
      </div>
      ${!n.read ? '<div class="notification-dot"></div>' : ''}
    </div>`;
}

window.handleNotificationClick = function(groupId) {
  if (groupId) navigate('group:' + groupId);
};

window.clearAllNotifications = async function() {
  try {
    await api.clearNotifications();
    _unreadCount = 0;
    updateNotificationBadge();
    showToast('Notifications cleared', 'info');
    renderNotificationsPage();
  } catch (e) {
    showToast('Failed to clear notifications', 'error');
  }
};

function updateNotificationBadge() {
  const badge = document.getElementById('notif-badge');
  if (badge) {
    if (_unreadCount > 0) {
      badge.textContent = _unreadCount > 99 ? '99+' : _unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }
  // Also update topbar badge if present
  const topBadge = document.getElementById('topbar-badge');
  if (topBadge) topBadge.classList.toggle('hidden', _unreadCount === 0);
}

async function loadUnreadCount() {
  try {
    const notifications = await api.getNotifications();
    _unreadCount = notifications.filter(n => !n.read).length;
    updateNotificationBadge();
  } catch (e) {
    // Silently fail — badge just won't update
  }
}

window.renderNotificationsPage = renderNotificationsPage;
window.updateNotificationBadge = updateNotificationBadge;
window.loadUnreadCount = loadUnreadCount;
