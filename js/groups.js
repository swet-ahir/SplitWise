// ===== GROUPS VIEWS =====

async function renderGroupsList() {
  document.getElementById('page-title').textContent = 'Groups';
  document.getElementById('page-content').innerHTML = spinnerHTML();

  try {
    const groups = await api.getGroups();
    const me = api.currentUser;

    // Update groups cache
    _groups = groups;

    document.getElementById('page-content').innerHTML = `
      <div class="d-flex justify-between align-center mb-24">
        <div>
          <p class="text-muted">Manage your expense-sharing groups</p>
        </div>
        <button class="btn btn-primary" onclick="openCreateGroupModal()">➕ New Group</button>
      </div>

      ${groups.length === 0
        ? emptyStateHTML('👥', 'No groups yet', 'Create a group to start splitting expenses with friends, family, or roommates.', '<button class="btn btn-primary" onclick="openCreateGroupModal()">Create Your First Group</button>')
        : `<div class="groups-grid">${groups.map(g => renderGroupCard(g, me)).join('')}</div>`
      }
    `;
  } catch (err) {
    document.getElementById('page-content').innerHTML = `
      <div class="card"><div class="card-body">
        ${emptyStateHTML('⚠️', 'Failed to load groups', err.message, '<button class="btn btn-primary" onclick="navigate(\'groups\')">Retry</button>')}
      </div></div>`;
  }
}

function renderGroupCard(g, me) {
  const members = g.members || [];
  const bal = g.userBalance || 0;
  const expenseCount = g.expenseCount || 0;

  // Calculate total spent in USD using expense data from balance info
  const balHTML = Math.abs(bal) < 0.01
    ? `<span class="badge badge-gray">settled up</span>`
    : bal > 0
    ? `<div><div class="group-balance-label">Owed to you</div><div class="group-balance-value text-success">+${formatAmountUSD(bal)}</div></div>`
    : `<div><div class="group-balance-label">You owe</div><div class="group-balance-value text-danger">${formatAmountUSD(Math.abs(bal))}</div></div>`;

  return `
    <div class="group-card" onclick="navigate('group:${g.id}')">
      <div class="group-card-header">
        <div class="group-icon" style="background:${g.color}20;font-size:22px">${g.icon}</div>
        <div style="flex:1;min-width:0">
          <div class="group-name">${g.name}</div>
          <div class="group-members">${members.length} member${members.length !== 1 ? 's' : ''} · ${expenseCount} expense${expenseCount !== 1 ? 's' : ''}</div>
        </div>
      </div>
      <div class="d-flex" style="gap:8px;flex-wrap:wrap;margin-bottom:12px">
        ${members.slice(0, 5).map(u => `<span title="${u.name}">${renderAvatar(u, 'avatar-sm')}</span>`).join('')}
        ${members.length > 5 ? `<div class="avatar avatar-sm" style="background:var(--border);color:var(--text-secondary)">+${members.length - 5}</div>` : ''}
      </div>
      <div class="group-balances">
        <div>
          <div class="group-balance-label">Members</div>
          <div class="group-balance-value">${members.length}</div>
        </div>
        ${balHTML}
      </div>
    </div>`;
}

// ===== GROUP DETAIL =====
async function renderGroupDetail(groupId) {
  document.getElementById('page-title').textContent = 'Loading...';
  document.getElementById('page-content').innerHTML = spinnerHTML();

  try {
    const me = api.currentUser;

    const [group, expenses, balancesData] = await Promise.all([
      api.getGroup(groupId),
      api.getGroupExpenses(groupId),
      api.getGroupBalances(groupId),
    ]);

    const { net, simplified: debts, members: balanceMembers } = balancesData;
    const members = group.members || [];
    const bal = net[me.id] || 0;

    document.getElementById('page-title').textContent = group.name;
    document.getElementById('page-content').innerHTML = `
      <div class="back-btn" onclick="navigate('groups')">← Back to Groups</div>
      <div class="detail-header">
        <div class="detail-icon" style="background:${group.color}20">${group.icon}</div>
        <div>
          <div class="detail-title">${group.name}</div>
          <div class="detail-sub">${members.length} members · Created ${formatDate(group.createdAt)}</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn btn-primary" onclick="openAddExpenseModal('${groupId}')">➕ Add Expense</button>
          <button class="btn btn-secondary" onclick="openGroupSettingsModal('${groupId}')">⚙️</button>
        </div>
      </div>

      <div class="two-col">
        <div>
          <!-- Expenses -->
          <div class="card">
            <div class="card-header">
              <h3>Expenses</h3>
              <span class="badge badge-gray">${expenses.length}</span>
            </div>
            <div class="card-body" style="padding:0">
              ${expenses.length === 0
                ? emptyStateHTML('💸', 'No expenses yet', 'Add your first expense to start tracking.', `<button class="btn btn-primary" onclick="openAddExpenseModal('${groupId}')">Add First Expense</button>`)
                : expenses.map(e => renderExpenseItem(e, me, group)).join('')
              }
            </div>
          </div>
        </div>

        <div>
          <!-- Your Balance -->
          <div class="card mb-16">
            <div class="card-header"><h3>Your Balance</h3></div>
            <div class="card-body">
              <div class="text-center" style="padding:8px 0">
                <div style="font-size:2rem;font-weight:800" class="${Math.abs(bal) < 0.01 ? '' : bal > 0 ? 'text-success' : 'text-danger'}">
                  ${Math.abs(bal) < 0.01 ? '✓' : (bal > 0 ? '+' : '-') + formatAmountUSD(Math.abs(bal))}
                </div>
                <div class="text-muted text-small mt-8">
                  ${Math.abs(bal) < 0.01 ? 'All settled up!' : bal > 0 ? 'others owe you' : 'you owe others'}
                </div>
              </div>
            </div>
          </div>

          <!-- Settle Up -->
          <div class="card mb-16">
            <div class="card-header">
              <h3>Settle Up</h3>
              <button class="btn btn-sm btn-primary" onclick="openSettleModal('${groupId}')">Record Payment</button>
            </div>
            <div class="card-body">
              ${debts.length === 0
                ? `<div class="text-center text-muted text-small" style="padding:12px 0">🎉 No outstanding debts!</div>`
                : debts.map(d => renderDebtRow(d, groupId, balanceMembers, me)).join('')
              }
            </div>
          </div>

          <!-- Members -->
          <div class="card">
            <div class="card-header">
              <h3>Members</h3>
              <button class="btn btn-sm btn-secondary" onclick="openAddMemberModal('${groupId}')">+ Add</button>
            </div>
            <div class="card-body" style="padding:0 24px">
              ${members.map(u => renderMemberRow(u, groupId, group, me, net)).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    document.getElementById('page-content').innerHTML = `
      <div class="back-btn" onclick="navigate('groups')">← Back to Groups</div>
      <div class="card"><div class="card-body">
        ${emptyStateHTML('⚠️', 'Failed to load group', err.message, '<button class="btn btn-primary" onclick="navigate(\'groups\')">Back to Groups</button>')}
      </div></div>`;
  }
}

function renderExpenseItem(e, me, g) {
  // paidBy is now an object {id, name, color}
  const payer = e.paidBy;
  const cat = getCategoryInfo(e.category);
  const myShare = e.splits ? (e.splits[me.id] || 0) : 0;
  const isMyExpense = payer && payer.id === me.id;
  const othersShare = e.splits
    ? Object.entries(e.splits).filter(([k]) => payer && k !== payer.id).reduce((s, [, v]) => s + v, 0)
    : 0;

  let shareText, shareClass;
  if (isMyExpense) {
    if (othersShare > 0.01) {
      shareText = `you lent ${formatAmount(othersShare, e.currency)}`;
      shareClass = 'lent';
    } else {
      shareText = 'you paid (not split)';
      shareClass = 'settled';
    }
  } else if (myShare > 0.01) {
    shareText = `you borrowed ${formatAmount(myShare, e.currency)}`;
    shareClass = 'owed';
  } else {
    shareText = 'not involved';
    shareClass = 'settled';
  }

  return `
    <div class="expense-item" onclick="openExpenseDetail('${e.id}', '${g.id}')">
      <div class="expense-icon" style="background:${cat.color}20">${cat.icon}</div>
      <div class="expense-info">
        <div class="expense-name">${e.description}</div>
        <div class="expense-meta">${payer ? (isMyExpense ? 'You' : payer.name) + ' paid' : 'Unknown'} · ${formatDate(e.date)}</div>
      </div>
      <div class="expense-amount">
        <div class="expense-total">${formatAmount(e.amount, e.currency)}</div>
        <div class="expense-share ${shareClass}">${shareText}</div>
      </div>
    </div>`;
}

function renderDebtRow(d, groupId, members, me) {
  const from = members ? members.find(m => m.id === d.from) : null;
  const to = members ? members.find(m => m.id === d.to) : null;

  return `
    <div class="settle-item">
      ${renderAvatar(from, 'avatar-sm')}
      <div class="settle-info">
        <div class="settle-text">
          <strong>${d.from === me.id ? 'You' : (from?.name || 'Unknown')}</strong> → <strong>${d.to === me.id ? 'You' : (to?.name || 'Unknown')}</strong>
        </div>
        <div class="settle-amount">${formatAmountUSD(d.amount)}</div>
      </div>
      ${(d.from === me.id || d.to === me.id) ? `<button class="btn btn-sm btn-primary" onclick="quickSettle('${groupId}','${d.from}','${d.to}',${d.amount})">Settle</button>` : ''}
    </div>`;
}

function renderMemberRow(u, groupId, g, me, net) {
  const bal = net ? (net[u.id] || 0) : 0;
  const balStr = Math.abs(bal) < 0.01
    ? `<span class="badge badge-gray">settled</span>`
    : bal > 0
    ? `<span class="text-success fw-bold text-small">+${formatAmountUSD(bal)}</span>`
    : `<span class="text-danger fw-bold text-small">${formatAmountUSD(bal)}</span>`;

  const canRemove = me.id === g.createdBy && u.id !== me.id && u.id !== g.createdBy;

  return `
    <div class="list-item">
      ${renderAvatar(u)}
      <div class="list-item-main">
        <div class="list-item-title">${u.name} ${u.id === me.id ? '(you)' : ''} ${u.id === g.createdBy ? '<span class="badge badge-blue" style="margin-left:4px">Admin</span>' : ''}</div>
        <div class="list-item-sub">${u.email}</div>
      </div>
      <div class="d-flex align-center gap-8">
        ${balStr}
        ${canRemove ? `<button class="btn btn-ghost btn-sm btn-icon" onclick="handleRemoveMember('${groupId}','${u.id}')" title="Remove">✕</button>` : ''}
      </div>
    </div>`;
}

// ===== MODALS =====
function openCreateGroupModal() {
  openModal(`
    <div class="modal-header">
      <h3>Create New Group</h3>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div id="group-modal-error" class="alert alert-danger hidden"></div>
      <div class="form-group">
        <label class="form-label">Group Name</label>
        <input class="form-control" id="group-name" type="text" placeholder="e.g. Apartment, Trip to Paris..." maxlength="50">
      </div>
      <div class="form-group">
        <label class="form-label">Icon</label>
        <div style="display:flex;flex-wrap:wrap;gap:4px" id="icon-picker">
          ${GROUP_ICONS.map(icon =>
            `<span class="icon-opt" data-icon="${icon}" onclick="selectGroupIcon('${icon}')" style="font-size:22px;cursor:pointer;padding:6px 8px;border-radius:8px;border:2px solid ${icon === '🏠' ? 'var(--primary)' : 'transparent'};transition:border-color 0.15s">${icon}</span>`
          ).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Color</label>
        <div class="color-picker" id="color-picker">
          ${GROUP_COLORS.map((c, i) =>
            `<div class="color-swatch ${i === 0 ? 'selected' : ''}" data-color="${c}" onclick="selectGroupColor('${c}')" style="background:${c}"></div>`
          ).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Add Members (by email)</label>
        <div class="member-input-group">
          <input class="form-control" id="member-email-input" type="email" placeholder="friend@example.com">
          <button class="btn btn-secondary" onclick="addMemberEmail()">Add</button>
        </div>
        <div class="form-hint">Members must have a Splitwise account</div>
        <div id="member-tags" class="member-tags mt-8"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="handleCreateGroup()">Create Group</button>
    </div>
  `);

  window._groupModal = { icon: '🏠', color: GROUP_COLORS[0], emails: [] };

  document.getElementById('member-email-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addMemberEmail();
  });
}

window.selectGroupIcon = function(icon) {
  window._groupModal.icon = icon;
  document.querySelectorAll('.icon-opt').forEach(el => {
    el.style.borderColor = el.dataset.icon === icon ? 'var(--primary)' : 'transparent';
  });
};

window.selectGroupColor = function(color) {
  window._groupModal.color = color;
  document.querySelectorAll('.color-swatch').forEach(el => {
    el.classList.toggle('selected', el.dataset.color === color);
  });
};

window.addMemberEmail = function() {
  const input = document.getElementById('member-email-input');
  const email = input.value.trim().toLowerCase();
  if (!email || !/\S+@\S+\.\S+/.test(email)) { showToast('Enter a valid email', 'error'); return; }
  if (email === api.currentUser.email) { showToast("That's your own email!", 'info'); return; }
  if (window._groupModal.emails.includes(email)) { showToast('Already added', 'info'); return; }
  window._groupModal.emails.push(email);
  input.value = '';
  refreshMemberTags();
};

function refreshMemberTags() {
  const container = document.getElementById('member-tags');
  if (!container) return;
  container.innerHTML = window._groupModal.emails.map((email, i) => `
    <div class="member-tag">
      ${email}
      <span class="remove" onclick="removeMemberEmail(${i})">✕</span>
    </div>`).join('');
}

window.removeMemberEmail = function(idx) {
  window._groupModal.emails.splice(idx, 1);
  refreshMemberTags();
};

window.handleCreateGroup = async function() {
  const name = document.getElementById('group-name').value.trim();
  const err = document.getElementById('group-modal-error');
  const btn = document.querySelector('.modal-footer .btn-primary');

  if (!name) { err.textContent = 'Please enter a group name'; err.classList.remove('hidden'); return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Creating...'; }

  try {
    const { group, notFound } = await api.createGroup(name, window._groupModal.icon, window._groupModal.color, window._groupModal.emails);
    // Update groups cache
    _groups = await api.getGroups().catch(() => _groups);
    closeModal();
    if (notFound && notFound.length > 0) {
      showToast(`Group created! ${notFound.length} email(s) not found: ${notFound.join(', ')}`, 'info');
    } else {
      showToast('Group created!', 'success');
    }
    renderSidebar();
    navigate('group:' + group.id);
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove('hidden');
    if (btn) { btn.disabled = false; btn.textContent = 'Create Group'; }
  }
};

async function openGroupSettingsModal(groupId) {
  try {
    const g = await api.getGroup(groupId);
    const me = api.currentUser;
    const isAdmin = me.id === g.createdBy;

    openModal(`
      <div class="modal-header">
        <h3>Group Settings</h3>
        <button class="close-btn" onclick="closeModal()">✕</button>
      </div>
      <div class="modal-body">
        ${isAdmin ? `
          <div class="form-group">
            <label class="form-label">Group Name</label>
            <input class="form-control" id="edit-group-name" type="text" value="${g.name}" maxlength="50">
          </div>
          <div class="form-group">
            <label class="form-label">Icon</label>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${GROUP_ICONS.map(icon =>
                `<span class="icon-opt" data-icon="${icon}" onclick="selectGroupIcon('${icon}')" style="font-size:22px;cursor:pointer;padding:6px 8px;border-radius:8px;border:2px solid ${icon === g.icon ? 'var(--primary)' : 'transparent'};transition:border-color 0.15s">${icon}</span>`
              ).join('')}
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Color</label>
            <div class="color-picker">
              ${GROUP_COLORS.map(c =>
                `<div class="color-swatch ${c === g.color ? 'selected' : ''}" data-color="${c}" onclick="selectGroupColor('${c}')" style="background:${c}"></div>`
              ).join('')}
            </div>
          </div>
          <div class="divider"></div>
        ` : ''}
        <button class="btn btn-secondary btn-block" onclick="handleLeaveGroup('${groupId}')">
          ${isAdmin ? '🗑️ Delete Group' : '👋 Leave Group'}
        </button>
      </div>
      ${isAdmin ? `
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="handleUpdateGroup('${groupId}')">Save Changes</button>
        </div>
      ` : ''}
    `);

    window._groupModal = { icon: g.icon, color: g.color, emails: [] };
  } catch (e) {
    showToast('Failed to load group settings', 'error');
  }
}

window.handleUpdateGroup = async function(groupId) {
  const name = document.getElementById('edit-group-name')?.value.trim();
  if (!name) { showToast('Group name required', 'error'); return; }

  const btn = document.querySelector('.modal-footer .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  try {
    await api.updateGroup(groupId, { name, icon: window._groupModal.icon, color: window._groupModal.color });
    _groups = await api.getGroups().catch(() => _groups);
    closeModal();
    showToast('Group updated!', 'success');
    renderSidebar();
    navigate('group:' + groupId);
  } catch (e) {
    showToast(e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
  }
};

window.handleLeaveGroup = async function(groupId) {
  let g;
  try { g = await api.getGroup(groupId); } catch (e) { showToast('Failed to load group', 'error'); return; }
  const me = api.currentUser;
  const isAdmin = me.id === g.createdBy;
  const action = isAdmin ? 'delete this group and all its expenses' : 'leave this group';

  confirmDialog(`Are you sure you want to ${action}? This cannot be undone.`, async () => {
    try {
      if (isAdmin) {
        await api.deleteGroup(groupId);
        showToast('Group deleted', 'info');
      } else {
        await api.removeGroupMember(groupId, me.id);
        showToast('Left group', 'info');
      }
      _groups = await api.getGroups().catch(() => _groups);
      closeModal();
      renderSidebar();
      navigate('groups');
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
};

async function openAddMemberModal(groupId) {
  let g;
  try { g = await api.getGroup(groupId); } catch (e) { showToast('Failed to load group', 'error'); return; }

  openModal(`
    <div class="modal-header">
      <h3>Add Member to ${g.name}</h3>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div id="add-member-error" class="alert alert-danger hidden"></div>
      <div class="form-group">
        <label class="form-label">Email Address</label>
        <input class="form-control" id="add-member-email" type="email" placeholder="friend@example.com">
        <div class="form-hint">They must have a Splitwise account to be added.</div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="handleAddMember('${groupId}')">Add Member</button>
    </div>
  `);
}

window.handleAddMember = async function(groupId) {
  const email = document.getElementById('add-member-email').value.trim();
  const err = document.getElementById('add-member-error');
  const btn = document.querySelector('.modal-footer .btn-primary');

  if (!email) { err.textContent = 'Enter an email'; err.classList.remove('hidden'); return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Adding...'; }

  try {
    const user = await api.addGroupMember(groupId, email);
    closeModal();
    showToast(`${user.name} added to group!`, 'success');
    navigate('group:' + groupId);
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove('hidden');
    if (btn) { btn.disabled = false; btn.textContent = 'Add Member'; }
  }
};

window.handleRemoveMember = async function(groupId, userId) {
  confirmDialog(`Remove this member from the group?`, async () => {
    try {
      await api.removeGroupMember(groupId, userId);
      showToast('Member removed', 'info');
      navigate('group:' + groupId);
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
};

window.openGroupSettingsModal = openGroupSettingsModal;
window.openAddMemberModal = openAddMemberModal;
window.openCreateGroupModal = openCreateGroupModal;
window.renderGroupsList = renderGroupsList;
window.renderGroupDetail = renderGroupDetail;
