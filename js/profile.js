// ===== PROFILE & SETTINGS =====

function renderProfilePage() {
  const me = store.currentUser;
  const groups = store.getUserGroups();
  const myExpenses = store.data.expenses.filter(e => e.paidBy === me.id && groups.some(g => g.id === e.groupId));
  const totalPaid = myExpenses.reduce((s, e) => s + convertToUSD(e.amount, e.currency), 0);
  const { totalOwed, totalOwe, net } = store.getOverallBalances();

  document.getElementById('page-title').textContent = 'Profile & Settings';
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
                <div style="font-size:1.5rem;font-weight:800">${myExpenses.length}</div>
                <div class="text-muted text-small">Expenses paid</div>
              </div>
              <div style="text-align:center;padding:16px;background:var(--surface-2);border-radius:var(--radius)">
                <div style="font-size:1.25rem;font-weight:800 text-success" class="text-success">${formatAmountUSD(totalOwed)}</div>
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
        <!-- Currency Settings -->
        <div class="card mb-16">
          <div class="card-header"><h3>Preferences</h3></div>
          <div class="card-body">
            <div class="form-group">
              <label class="form-label">Default Currency</label>
              <select class="form-control" id="pref-currency" onchange="savePreferences()">
                ${currencyOptions(store.data.baseCurrency || 'USD')}
              </select>
              <div class="form-hint">Used as the base currency for balance calculations</div>
            </div>
          </div>
        </div>

        <!-- App Info -->
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
                <div class="list-item-sub">Local browser storage</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

window.savePreferences = function() {
  const currency = document.getElementById('pref-currency')?.value || 'USD';
  store.data.baseCurrency = currency;
  localStorage.setItem('splitwise_data', JSON.stringify(store.data));
  showToast('Preferences saved!', 'success');
};

window.showEditProfile = function() {
  const me = store.currentUser;
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

window.handleEditProfile = function() {
  const name = document.getElementById('edit-name')?.value.trim();
  if (!name) { document.getElementById('profile-error').textContent = 'Name required'; document.getElementById('profile-error').classList.remove('hidden'); return; }
  store.updateUser(store.currentUser.id, { name, color: window._profileColor });
  closeModal();
  showToast('Profile updated!', 'success');
  renderProfilePage();
  // Update sidebar
  renderSidebarUser();
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

window.handleChangePassword = function() {
  const current = document.getElementById('pw-current')?.value;
  const newPw = document.getElementById('pw-new')?.value;
  const confirm = document.getElementById('pw-confirm')?.value;
  const err = document.getElementById('pw-error');
  const me = store.currentUser;

  if (me.password !== current) { err.textContent = 'Current password is incorrect'; err.classList.remove('hidden'); return; }
  if (newPw.length < 6) { err.textContent = 'Password must be at least 6 characters'; err.classList.remove('hidden'); return; }
  if (newPw !== confirm) { err.textContent = 'Passwords do not match'; err.classList.remove('hidden'); return; }

  store.updateUser(me.id, { password: newPw });
  closeModal();
  showToast('Password updated!', 'success');
};

window.handleLogout = function() {
  confirmDialog('Are you sure you want to sign out?', () => {
    store.logout();
    closeModal();
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    renderAuth();
  });
};

window.renderProfilePage = renderProfilePage;
