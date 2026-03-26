// ===== DASHBOARD VIEW =====

async function renderDashboard() {
  document.getElementById('page-title').textContent = 'Dashboard';
  document.getElementById('page-content').innerHTML = spinnerHTML();

  try {
    const me = api.currentUser;
    const [groups, overallBalances] = await Promise.all([
      api.getGroups(),
      api.getOverallBalances(),
    ]);

    const { totalOwed, totalOwe, net } = overallBalances;

    // Fetch recent expenses and settlements for all groups (up to 5 per group)
    let recentItems = [];
    const expenseFetches = groups.slice(0, 6).map(g =>
      api.getGroupExpenses(g.id).then(expenses => {
        expenses.slice(0, 5).forEach(e => {
          recentItems.push({ ...e, _type: 'expense', groupName: g.name, groupIcon: g.icon });
        });
      }).catch(() => {})
    );
    await Promise.all(expenseFetches);

    recentItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    recentItems = recentItems.slice(0, 10);

    const netColor = net > 0.01 ? 'positive' : net < -0.01 ? 'negative' : '';
    const netLabel = net > 0.01 ? 'you are owed' : net < -0.01 ? 'you owe' : 'all settled!';

    // Count groups with positive/negative balance
    const groupsOwed = groups.filter(g => (overallBalances.byGroup[g.id] || 0) > 0.01).length;
    const groupsOwe = groups.filter(g => (overallBalances.byGroup[g.id] || 0) < -0.01).length;

    document.getElementById('page-content').innerHTML = `
      <div class="stats-grid">
        <div class="stat-card green">
          <div class="stat-label">Total Owed to You</div>
          <div class="stat-value positive">${formatAmountUSD(totalOwed)}</div>
          <div class="stat-sub">across ${groupsOwed} group${groupsOwed !== 1 ? 's' : ''}</div>
        </div>
        <div class="stat-card red">
          <div class="stat-label">You Owe</div>
          <div class="stat-value negative">${formatAmountUSD(totalOwe)}</div>
          <div class="stat-sub">across ${groupsOwe} group${groupsOwe !== 1 ? 's' : ''}</div>
        </div>
        <div class="stat-card blue">
          <div class="stat-label">Net Balance</div>
          <div class="stat-value ${netColor}">${formatAmountUSD(Math.abs(net))}</div>
          <div class="stat-sub">${netLabel}</div>
        </div>
        <div class="stat-card orange">
          <div class="stat-label">Active Groups</div>
          <div class="stat-value">${groups.length}</div>
          <div class="stat-sub">${groups.reduce((s, g) => s + (g.expenseCount || 0), 0)} total expenses</div>
        </div>
      </div>

      <div class="two-col">
        <div>
          <!-- Groups Summary -->
          <div class="card mb-24">
            <div class="card-header">
              <h3>Your Groups</h3>
              <button class="btn btn-primary btn-sm" onclick="navigate('groups')">View All</button>
            </div>
            <div class="card-body" style="padding:0">
              ${groups.length === 0
                ? emptyStateHTML('👥', 'No groups yet', 'Create a group to start splitting expenses', '<button class="btn btn-primary" onclick="navigate(\'groups\')">Create Group</button>')
                : groups.slice(0, 5).map(g => renderGroupRow(g, me, overallBalances.byGroup)).join('')
              }
            </div>
          </div>

          <!-- Recent Activity -->
          <div class="card">
            <div class="card-header">
              <h3>Recent Activity</h3>
            </div>
            <div class="card-body" style="padding:0 24px">
              ${recentItems.length === 0
                ? emptyStateHTML('📋', 'No activity yet', 'Add expenses to see them here')
                : recentItems.map(item => renderActivityItem(item, me)).join('')
              }
            </div>
          </div>
        </div>

        <div>
          <!-- Outstanding Balances -->
          <div class="card mb-16">
            <div class="card-header">
              <h3>Outstanding Balances</h3>
            </div>
            <div class="card-body" id="outstanding-balances-section">
              <div class="loading text-small">Loading balances...</div>
            </div>
          </div>

          <!-- Quick Actions -->
          <div class="card">
            <div class="card-header"><h3>Quick Actions</h3></div>
            <div class="card-body">
              <div style="display:flex;flex-direction:column;gap:10px">
                <button class="btn btn-primary btn-block" onclick="openCreateGroupModal()">➕ New Group</button>
                ${groups.length > 0 ? `<button class="btn btn-secondary btn-block" onclick="openAddExpenseFromDashboard()">💸 Add Expense</button>` : ''}
                ${groups.length > 0 ? `<button class="btn btn-secondary btn-block" onclick="navigate('settle')">💰 Settle Up</button>` : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Load outstanding balances asynchronously
    loadOutstandingBalances(groups, me);
  } catch (err) {
    document.getElementById('page-content').innerHTML = `
      <div class="card"><div class="card-body">
        ${emptyStateHTML('⚠️', 'Failed to load dashboard', err.message || 'Something went wrong. Please try again.', '<button class="btn btn-primary" onclick="navigate(\'dashboard\')">Retry</button>')}
      </div></div>`;
  }
}

async function loadOutstandingBalances(groups, me) {
  const container = document.getElementById('outstanding-balances-section');
  if (!container) return;

  try {
    const allDebts = [];
    await Promise.all(groups.map(async g => {
      try {
        const { simplified } = await api.getGroupBalances(g.id);
        simplified.forEach(d => {
          if (d.from === me.id || d.to === me.id) {
            allDebts.push({ ...d, groupId: g.id, groupName: g.name });
          }
        });
      } catch (e) {}
    }));

    if (allDebts.length === 0) {
      container.innerHTML = `
        <div class="text-center" style="padding:20px">
          <div style="font-size:32px;margin-bottom:8px">🎉</div>
          <div class="fw-bold">All settled up!</div>
          <div class="text-muted text-small mt-8">No outstanding balances</div>
        </div>`;
      return;
    }

    // We need member name/color from balances response
    // Fetch balances with members for each relevant group
    const memberCache = {};
    for (const d of allDebts) {
      if (!memberCache[d.groupId]) {
        try {
          const { members } = await api.getGroupBalances(d.groupId);
          memberCache[d.groupId] = members;
        } catch (e) { memberCache[d.groupId] = []; }
      }
    }

    container.innerHTML = allDebts.slice(0, 6).map(d => {
      const members = memberCache[d.groupId] || [];
      const other = d.from === me.id
        ? members.find(m => m.id === d.to)
        : members.find(m => m.id === d.from);
      const youOwe = d.from === me.id;
      return `
        <div class="balance-item" style="margin-bottom:8px">
          ${renderAvatar(other, 'avatar-sm')}
          <div class="balance-info">
            <div class="balance-text">
              ${youOwe ? `You owe <strong>${other?.name || 'Unknown'}</strong>` : `<strong>${other?.name || 'Unknown'}</strong> owes you`}
            </div>
            <div class="text-muted text-small">${d.groupName}</div>
          </div>
          <div class="balance-amount ${youOwe ? 'owe' : 'owed'}">${formatAmountUSD(d.amount)}</div>
        </div>`;
    }).join('') + (allDebts.length > 6 ? `<div class="text-center mt-8"><button class="btn btn-ghost btn-sm" onclick="navigate('settle')">View all ${allDebts.length} balances</button></div>` : '');
  } catch (e) {
    if (container) container.innerHTML = '<div class="text-muted text-small">Could not load balances</div>';
  }
}

function renderGroupRow(g, me, byGroup) {
  const bal = byGroup ? (byGroup[g.id] || 0) : (g.userBalance || 0);
  const memberCount = g.memberCount || (g.members ? g.members.length : 0);
  const balStr = Math.abs(bal) < 0.01
    ? `<span class="badge badge-gray">settled up</span>`
    : bal > 0
    ? `<span class="text-success fw-bold">+${formatAmountUSD(bal)}</span>`
    : `<span class="text-danger fw-bold">-${formatAmountUSD(Math.abs(bal))}</span>`;

  return `
    <div class="list-item" style="padding:14px 24px;cursor:pointer" onclick="navigate('group:${g.id}')">
      <div class="group-icon" style="background:${g.color}20;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px">${g.icon}</div>
      <div class="list-item-main">
        <div class="list-item-title">${g.name}</div>
        <div class="list-item-sub">${memberCount} member${memberCount !== 1 ? 's' : ''}</div>
      </div>
      <div class="list-item-right">${balStr}</div>
    </div>`;
}

function renderActivityItem(item, me) {
  if (item._type === 'expense') {
    const payer = item.paidBy; // paidBy is now an object {id, name, color}
    const myShare = item.splits ? (item.splits[me.id] || 0) : 0;
    const isMyExpense = payer && payer.id === me.id;
    const cat = getCategoryInfo(item.category);
    return `
      <div class="activity-item">
        <div class="activity-icon" style="background:${cat.color}20">${cat.icon}</div>
        <div class="activity-text flex-1">
          <strong>${item.description}</strong> in <em>${item.groupName}</em><br>
          <span class="text-muted text-small">${isMyExpense ? 'You paid' : (payer?.name || 'Someone') + ' paid'} ${formatAmount(item.amount, item.currency)}</span>
          ${!isMyExpense && myShare > 0 ? `<span class="text-danger text-small"> · your share: ${formatAmount(myShare, item.currency)}</span>` : ''}
          ${isMyExpense ? `<span class="text-success text-small"> · you paid</span>` : ''}
          <div class="activity-time">${timeAgo(item.createdAt)} · ${item.groupName}</div>
        </div>
      </div>`;
  }
  return '';
}

async function openAddExpenseFromDashboard() {
  try {
    const groups = await api.getGroups();
    if (groups.length === 0) { showToast('Create a group first', 'info'); return; }
    navigate('group:' + groups[0].id);
    setTimeout(() => openAddExpenseModal(groups[0].id), 300);
  } catch (e) {
    showToast('Failed to load groups', 'error');
  }
}

window.renderDashboard = renderDashboard;
window.openAddExpenseFromDashboard = openAddExpenseFromDashboard;
