// ===== MAIN APP CONTROLLER =====

let currentRoute = 'dashboard';

function initApp() {
  const user = store.currentUser;
  if (!user) {
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    renderAuth();
    return;
  }

  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');

  renderSidebar();
  navigate(currentRoute || 'dashboard');
}

// ===== SIDEBAR =====
function renderSidebar() {
  const me = store.currentUser;
  const groups = store.getUserGroups();
  const unread = store.getUnreadCount();

  document.getElementById('sidebar').innerHTML = `
    <div class="sidebar-logo">
      <div class="logo-icon">💸</div>
      <span>Splitwise</span>
    </div>

    <div class="sidebar-section">
      <div class="sidebar-section-title">Menu</div>
      <div class="nav-item ${currentRoute === 'dashboard' ? 'active' : ''}" onclick="navigate('dashboard')">
        <span class="icon">📊</span> Dashboard
      </div>
      <div class="nav-item ${currentRoute === 'groups' || currentRoute?.startsWith('group:') ? 'active' : ''}" onclick="navigate('groups')">
        <span class="icon">👥</span> Groups
      </div>
      <div class="nav-item ${currentRoute === 'settle' ? 'active' : ''}" onclick="navigate('settle')">
        <span class="icon">💰</span> Settle Up
      </div>
      <div class="nav-item ${currentRoute === 'notifications' ? 'active' : ''}" onclick="navigate('notifications')">
        <span class="icon">🔔</span> Notifications
        <span id="notif-badge" class="badge ${unread === 0 ? 'hidden' : ''}">${unread > 99 ? '99+' : unread}</span>
      </div>
    </div>

    ${groups.length > 0 ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">Your Groups</div>
        ${groups.slice(0, 8).map(g => `
          <div class="nav-item ${currentRoute === 'group:' + g.id ? 'active' : ''}" onclick="navigate('group:${g.id}')">
            <span class="icon">${g.icon}</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.name}</span>
          </div>
        `).join('')}
        ${groups.length > 8 ? `<div class="nav-item" onclick="navigate('groups')"><span class="icon">+</span> ${groups.length - 8} more...</div>` : ''}
        <div class="nav-item" onclick="openCreateGroupModal()" style="color:var(--primary)">
          <span class="icon">➕</span> New Group
        </div>
      </div>
    ` : ''}

    <div class="sidebar-bottom">
      <div class="nav-item ${currentRoute === 'profile' ? 'active' : ''}" onclick="navigate('profile')">
        <span class="icon">⚙️</span> Settings
      </div>
      <div class="user-info" onclick="navigate('profile')">
        ${renderAvatar(me)}
        <div class="user-details">
          <div class="user-name">${me.name}</div>
          <div class="user-email">${me.email}</div>
        </div>
      </div>
    </div>
  `;
}

function renderSidebarUser() {
  const me = store.currentUser;
  const nameEl = document.querySelector('.user-name');
  const emailEl = document.querySelector('.user-email');
  const avatarEl = document.querySelector('.user-info .avatar');
  if (nameEl) nameEl.textContent = me.name;
  if (emailEl) emailEl.textContent = me.email;
  if (avatarEl) {
    avatarEl.textContent = getInitials(me.name);
    avatarEl.style.background = me.color;
  }
}

// ===== ROUTER =====
function navigate(route) {
  currentRoute = route;

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');

  // Update active states in sidebar
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  // Update notification badge
  updateNotificationBadge();

  // Re-render sidebar to reflect current route + any updates
  renderSidebar();

  const content = document.getElementById('page-content');
  content.innerHTML = spinnerHTML();

  // Route dispatch
  if (route === 'dashboard') {
    renderDashboard();
  } else if (route === 'groups') {
    renderGroupsList();
  } else if (route.startsWith('group:')) {
    const groupId = route.split(':')[1];
    renderGroupDetail(groupId);
  } else if (route === 'settle') {
    renderSettlePage();
  } else if (route === 'notifications') {
    renderNotificationsPage();
  } else if (route === 'profile') {
    renderProfilePage();
  } else {
    document.getElementById('page-title').textContent = '404';
    content.innerHTML = emptyStateHTML('🔍', 'Page not found', 'The page you\'re looking for doesn\'t exist.', '<button class="btn btn-primary" onclick="navigate(\'dashboard\')">Go Home</button>');
  }
}

// ===== TOP BAR =====
function renderTopBar() {
  document.getElementById('top-bar').innerHTML = `
    <div class="d-flex align-center gap-12">
      <button class="btn btn-ghost btn-icon mobile-menu-btn" onclick="toggleMobileSidebar()">☰</button>
      <h2 id="page-title">Dashboard</h2>
    </div>
    <div class="d-flex align-center gap-8">
      <button class="btn btn-ghost btn-icon" onclick="navigate('notifications')" title="Notifications" style="position:relative">
        🔔
        <span id="topbar-badge" class="hidden" style="position:absolute;top:2px;right:2px;width:8px;height:8px;background:var(--danger);border-radius:50%"></span>
      </button>
      <button class="btn btn-secondary btn-sm" onclick="navigate('profile')">
        ${renderAvatar(store.currentUser, 'avatar-sm')}
        <span style="display:none" class="d-none">Profile</span>
      </button>
    </div>
  `;
}

window.toggleMobileSidebar = function() {
  document.getElementById('sidebar').classList.toggle('open');
};

// Close sidebar when clicking outside on mobile
document.addEventListener('click', (e) => {
  const sidebar = document.getElementById('sidebar');
  if (sidebar && !sidebar.contains(e.target) && !e.target.closest('.mobile-menu-btn')) {
    sidebar.classList.remove('open');
  }
});

// Override updateNotificationBadge to also update topbar
const _origUpdateBadge = window.updateNotificationBadge;
window.updateNotificationBadge = function() {
  if (_origUpdateBadge) _origUpdateBadge();
  const count = store.getUnreadCount();
  const topBadge = document.getElementById('topbar-badge');
  if (topBadge) topBadge.classList.toggle('hidden', count === 0);
};

window.navigate = navigate;
window.renderSidebarUser = renderSidebarUser;
window.initApp = initApp;
