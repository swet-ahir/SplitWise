// ===== MAIN APP CONTROLLER =====

let currentRoute = 'dashboard';
let _groups = [];       // Groups cache — updated on navigate
let _unreadCount = 0;   // Notification badge cache

function initApp() {
  if (!api.isLoggedIn()) {
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    renderAuth();
    return;
  }

  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');

  // Load groups for sidebar, then render
  api.getGroups().then(async groups => {
    _groups = groups;

    // Accept pending invitation from email link
    const pendingToken = sessionStorage.getItem('pendingInvitation');
    if (pendingToken) {
      sessionStorage.removeItem('pendingInvitation');
      try {
        const result = await api.acceptInvitation(pendingToken);
        showToast(`Joined "${result.groupName}"!`, 'success');
        _groups = await api.getGroups().catch(() => _groups);
        renderSidebar();
        navigate('group:' + result.groupId);
        loadUnreadCount();
        return;
      } catch (e) {
        // Ignore — already accepted or expired, fall through to normal load
      }
    }

    renderSidebar();
    navigate(currentRoute || 'dashboard');
    loadUnreadCount();
  }).catch(() => {
    renderSidebar();
    navigate(currentRoute || 'dashboard');
  });
}

// ===== SIDEBAR =====
function renderSidebar() {
  const me = api.currentUser;
  if (!me) return;

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
        <span id="notif-badge" class="badge ${_unreadCount === 0 ? 'hidden' : ''}">${_unreadCount > 99 ? '99+' : _unreadCount}</span>
      </div>
    </div>

    ${_groups.length > 0 ? `
      <div class="sidebar-section">
        <div class="sidebar-section-title">Your Groups</div>
        ${_groups.slice(0, 8).map(g => `
          <div class="nav-item ${currentRoute === 'group:' + g.id ? 'active' : ''}" onclick="navigate('group:${g.id}')">
            <span class="icon">${g.icon}</span>
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${g.name}</span>
          </div>
        `).join('')}
        ${_groups.length > 8 ? `<div class="nav-item" onclick="navigate('groups')"><span class="icon">+</span> ${_groups.length - 8} more...</div>` : ''}
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
  const me = api.currentUser;
  if (!me) return;
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

  // Re-render sidebar to reflect current route
  renderSidebar();

  // Update topbar badge
  const topBadge = document.getElementById('topbar-badge');
  if (topBadge) topBadge.classList.toggle('hidden', _unreadCount === 0);

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
    content.innerHTML = emptyStateHTML('🔍', 'Page not found', "The page you're looking for doesn't exist.", '<button class="btn btn-primary" onclick="navigate(\'dashboard\')">Go Home</button>');
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
        <span id="topbar-badge" class="${_unreadCount === 0 ? 'hidden' : ''}" style="position:absolute;top:2px;right:2px;width:8px;height:8px;background:var(--danger);border-radius:50%"></span>
      </button>
      <button class="btn btn-secondary btn-sm" onclick="navigate('profile')">
        ${renderAvatar(api.currentUser, 'avatar-sm')}
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

window.navigate = navigate;
window.renderSidebar = renderSidebar;
window.renderSidebarUser = renderSidebarUser;
window.initApp = initApp;
