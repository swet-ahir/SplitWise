// ===== PROFILE & SETTINGS =====

async function renderProfilePage() {
  document.getElementById('page-title').textContent = 'Profile & Settings';
  document.getElementById('page-content').innerHTML = spinnerHTML();

  try {
    const me = api.currentUser;
    const [groups, overallBalances] = await Promise.all([
      api.getGroups(),
      api.getOverallBalances(),
    ]);

    const { totalOwed, totalOwe } = overallBalances;

    document.getElementById('page-content').innerHTML = `
      <div class="two-col">
        <div>
          <!-- Profile Card -->
          <div class="card mb-24">
            <div class="card-body">
              <div class="d-flex align-center gap-16 mb-24">
                ${renderAvatar(me, 'avatar-lg')}
                <div>
                  <div style="font-size:1.25rem;font-weight:700">${me.name}</div>
                  <div class="text-muted">${me.email}</div>
                  <div class="text-muted text-small mt-8">Member since ${formatDate(me.createdAt)}</div>
                </div>
              </div>

              <div id="profile-edit-section">
                <div class="d-flex gap-8">
                  <button class="btn btn-secondary" onclick="showEditProfile()">✏️ Edit Profile</button>
                  <button class="btn btn-secondary" onclick="showChangePassword()">🔒 Change Password</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Stats -->
          <div class="card mb-24">
            <div class="card-header"><h3>Your Stats</h3></div>
            <div class="card-body">
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
                <div style="text-align:center;padding:16px;background:var(--surface-2);border-radius:var(--radius)">
                  <div style="font-size:1.5rem;font-weight:800">${groups.length}</div>
                  <div class="text-muted text-small">Groups</div>
                </div>
                <div style="text-align:center;padding:16px;background:var(--surface-2);border-radius:var(--radius)">
                  <div style="font-size:1.5rem;font-weight:800">${groups.reduce((s, g) => s + (g.expenseCount || 0), 0)}</div>
                  <div class="text-muted text-small">Total expenses</div>
                </div>
                <div style="text-align:center;padding:16px;background:var(--surface-2);border-radius:var(--radius)">
                  <div style="font-size:1.25rem;font-weight:800" class="text-success">${formatAmountUSD(totalOwed)}</div>
                  <div class="text-muted text-small">Owed to you</div>
                </div>
                <div style="text-align:center;padding:16px;background:var(--surface-2);border-radius:var(--radius)">
                  <div style="font-size:1.25rem;font-weight:800" class="text-danger">${formatAmountUSD(totalOwe)}</div>
                  <div class="text-muted text-small">You owe</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Danger Zone -->
          <div class="card">
            <div class="card-header"><h3>⚠️ Account</h3></div>
            <div class="card-body">
              <button class="btn btn-danger" onclick="handleLogout()">Sign Out</button>
              <p class="text-muted text-small mt-8">You'll need to sign in again to access your account.</p>
            </div>
          </div>
        </div>

        <div>
          <!-- App Info -->
          <div class="card mb-16">
            <div class="card-header"><h3>Preferences</h3></div>
            <div class="card-body">
              <div class="form-group">
                <label class="form-label">Default Currency</label>
                <select class="form-control" id="pref-currency">
                  ${currencyOptions('USD')}
                </select>
                <div class="form-hint">Used as the display currency for balance calculations</div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header"><h3>About</h3></div>
            <div class="card-body">
              <div class="list-item">
                <div class="list-item-main">
                  <div class="list-item-title">Splitwise Clone</div>
                  <div class="list-item-sub">Version 1.0.0</div>
                </div>
              </div>
              <div class="list-item">
                <div class="list-item-main">
                  <div class="list-item-title">Currencies Supported</div>
                  <div class="list-item-sub">${Object.keys(CURRENCIES).length} currencies</div>
                </div>
              </div>
              <div class="list-item">
                <div class="list-item-main">
                  <div class="list-item-title">Data Storage</div>
                  <div class="list-item-sub">PostgreSQL database</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    document.getElementById('page-content').innerHTML = `
      <div class="card"><div class="card-body">
        ${emptyStateHTML('⚠️', 'Failed to load profile', err.message, '<button class="btn btn-primary" onclick="navigate(\'profile\')">Retry</button>')}
      </div></div>`;
  }
}

window.showEditProfile = function() {
  const me = api.currentUser;
  openModal(`
    <div class="modal-header">
      <h3>Edit Profile</h3>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div id="profile-error" class="alert alert-danger hidden"></div>
      <div class="form-group">
        <label class="form-label">Full Name</label>
        <input class="form-control" id="edit-name" type="text" value="${me.name}">
      </div>
      <div class="form-group">
        <label class="form-label">Avatar Color</label>
        <div class="color-picker">
          ${AVATAR_COLORS.map(c =>
            `<div class="color-swatch ${c === me.color ? 'selected' : ''}" data-color="${c}" onclick="selectAvatarColor('${c}')" style="background:${c}"></div>`
          ).join('')}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="handleEditProfile()">Save</button>
    </div>
  `);
  window._profileColor = me.color;
};

window.selectAvatarColor = function(color) {
  window._profileColor = color;
  document.querySelectorAll('.color-swatch').forEach(el => el.classList.toggle('selected', el.dataset.color === color));
};

window.handleEditProfile = async function() {
  const name = document.getElementById('edit-name')?.value.trim();
  const errEl = document.getElementById('profile-error');
  const btn = document.querySelector('.modal-footer .btn-primary');

  if (!name) {
    errEl.textContent = 'Name required';
    errEl.classList.remove('hidden');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  try {
    await api.updateProfile({ name, color: window._profileColor });
    closeModal();
    showToast('Profile updated!', 'success');
    renderProfilePage();
    renderSidebarUser();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  }
};

window.showChangePassword = function() {
  openModal(`
    <div class="modal-header">
      <h3>Change Password</h3>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div id="pw-error" class="alert alert-danger hidden"></div>
      <div class="form-group">
        <label class="form-label">Current Password</label>
        <input class="form-control" id="pw-current" type="password" placeholder="Current password">
      </div>
      <div class="form-group">
        <label class="form-label">New Password</label>
        <input class="form-control" id="pw-new" type="password" placeholder="At least 6 characters">
      </div>
      <div class="form-group mb-0">
        <label class="form-label">Confirm New Password</label>
        <input class="form-control" id="pw-confirm" type="password" placeholder="Repeat new password">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="handleChangePassword()">Update Password</button>
    </div>
  `);
};

window.handleChangePassword = async function() {
  const current = document.getElementById('pw-current')?.value;
  const newPw = document.getElementById('pw-new')?.value;
  const confirm = document.getElementById('pw-confirm')?.value;
  const err = document.getElementById('pw-error');
  const btn = document.querySelector('.modal-footer .btn-primary');

  if (!current || !newPw || !confirm) {
    err.textContent = 'Please fill in all fields';
    err.classList.remove('hidden');
    return;
  }
  if (newPw.length < 6) {
    err.textContent = 'Password must be at least 6 characters';
    err.classList.remove('hidden');
    return;
  }
  if (newPw !== confirm) {
    err.textContent = 'Passwords do not match';
    err.classList.remove('hidden');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Updating...'; }

  try {
    await api.changePassword(current, newPw);
    closeModal();
    showToast('Password updated!', 'success');
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove('hidden');
    if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
  }
};

window.handleLogout = function() {
  confirmDialog('Are you sure you want to sign out?', () => {
    api.logout();
    closeModal();
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    renderAuth();
  });
};

window.renderProfilePage = renderProfilePage;
