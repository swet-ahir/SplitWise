// ===== DASHBOARD VIEW =====

function renderDashboard() {
  const me = store.currentUser;
  const { totalOwed, totalOwe, net } = store.getOverallBalances();
  const groups = store.getUserGroups();

  // Recent activity across all groups
  let recentItems = [];
  groups.forEach(g => {
    store.getGroupExpenses(g.id).slice(0, 5).forEach(e => {
      recentItems.push({ ...e, _type: 'expense', groupName: g.name, groupIcon: g.icon });
    });
    store.getGroupSettlements(g.id).slice(0, 3).forEach(s => {
      recentItems.push({ ...s, _type: 'settlement', groupName: g.name, groupIcon: g.icon });
    });
  });
  recentItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  recentItems = recentItems.slice(0, 10);

  const netColor = net > 0.01 ? 'positive' : net < -0.01 ? 'negative' : '';
  const netLabel = net > 0.01 ? 'you are owed' : net < -0.01 ? 'you owe' : 'all settled!';

  document.getElementById('page-title').textContent = 'Dashboard';
  document.getElementById('page-content').innerHTML = `
    <div class="stats-grid">
      <div class="stat-card green">
        <div class="stat-label">Total Owed to You</div>
        <div class="stat-value positive">${formatAmountUSD(totalOwed)}</div>
        <div class="stat-sub">across ${groups.filter(g => store.getUserBalance(me.id, g.id) > 0.01).length} groups</div>
      </div>
      <div class="stat-card red">
        <div class="stat-label">You Owe</div>
        <div class="stat-value negative">${formatAmountUSD(totalOwe)}</div>
        <div class="stat-sub">across ${groups.filter(g => store.getUserBalance(me.id, g.id) < -0.01).length} groups</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-label">Net Balance</div>
        <div class="stat-value ${netColor}">${formatAmountUSD(Math.abs(net))}</div>
        <div class="stat-sub">${netLabel}</div>
      </div>
      <div class="stat-card orange">
        <div class="stat-label">Active Groups</div>
        <div class="stat-value">${groups.length}</div>
        <div class="stat-sub">${store.data.expenses.filter(e => groups.some(g => g.id === e.groupId)).length} total expenses</div>
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
            ${groups.length === 0 ? emptyStateHTML('👥', 'No groups yet', 'Create a group to start splitting expenses', '<button class="btn btn-primary" onclick="navigate(\'groups\')">Create Group</button>') :
              groups.slice(0, 5).map(g => renderGroupRow(g, me)).join('')
            }
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="card">
          <div class="card-header">
            <h3>Recent Activity</h3>
          </div>
          <div class="card-body" style="padding:0 24px">
            ${recentItems.length === 0 ? emptyStateHTML('📋', 'No activity yet', 'Add expenses to see them here') :
              recentItems.map(item => renderActivityItem(item)).join('')
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
          <div class="card-body">
            ${renderOutstandingBalances(groups, me)}
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
}

function renderGroupRow(g, me) {
  const bal = store.getUserBalance(me.id, g.id);
  const members = g.members.map(id => store.getUser(id)).filter(Boolean);
  const balStr = Math.abs(bal) < 0.01 ? `<span class="badge badge-gray">settled up</span>` :
    bal > 0 ? `<span class="text-success fw-bold">+${formatAmountUSD(bal)}</span>` :
    `<span class="text-danger fw-bold">-${formatAmountUSD(Math.abs(bal))}</span>`;

  return `
    <div class="list-item" style="padding:14px 24px;cursor:pointer" onclick="navigate('group:${g.id}')">
      <div class="group-icon" style="background:${g.color}20;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px">${g.icon}</div>
      <div class="list-item-main">
        <div class="list-item-title">${g.name}</div>
        <div class="list-item-sub">${members.length} member${members.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="list-item-right">${balStr}</div>
    </div>`;
}

function renderActivityItem(item) {
  if (item._type === 'expense') {
    const payer = store.getUser(item.paidBy);
    const me = store.currentUser;
    const myShare = item.splits?.[me.id] || 0;
    const isMyExpense = item.paidBy === me.id;
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
  } else {
    const from = store.getUser(item.from);
    const to = store.getUser(item.to);
    const me = store.currentUser;
    const isFrom = item.from === me.id;
    const isTo = item.to === me.id;
    return `
      <div class="activity-item">
        <div class="activity-icon" style="background:var(--success-light)">💰</div>
        <div class="activity-text flex-1">
          <strong>${isFrom ? 'You' : from?.name || 'Someone'}</strong> paid <strong>${isTo ? 'you' : to?.name || 'someone'}</strong><br>
          <span class="text-success text-small">${formatAmount(item.amount, item.currency)} · settled up</span>
          <div class="activity-time">${timeAgo(item.createdAt)} · ${item.groupName}</div>
        </div>
      </div>`;
  }
}

function renderOutstandingBalances(groups, me) {
  const allDebts = [];
  groups.forEach(g => {
    const debts = store.getSimplifiedDebts(g.id);
    debts.forEach(d => {
      if (d.from === me.id || d.to === me.id) {
        allDebts.push({ ...d, groupId: g.id, groupName: g.name, currency: 'USD' });
      }
    });
  });

  if (allDebts.length === 0) {
    return `
      <div class="text-center" style="padding:20px">
        <div style="font-size:32px;margin-bottom:8px">🎉</div>
        <div class="fw-bold">All settled up!</div>
        <div class="text-muted text-small mt-8">No outstanding balances</div>
      </div>`;
  }

  return allDebts.slice(0, 6).map(d => {
    const other = d.from === me.id ? store.getUser(d.to) : store.getUser(d.from);
    const youOwe = d.from === me.id;
    return `
      <div class="balance-item" style="margin-bottom:8px">
        ${renderAvatar(other, 'avatar-sm')}
        <div class="balance-info">
          <div class="balance-text">
            ${youOwe ? `You owe <strong>${other?.name}</strong>` : `<strong>${other?.name}</strong> owes you`}
          </div>
          <div class="text-muted text-small">${d.groupName}</div>
        </div>
        <div class="balance-amount ${youOwe ? 'owe' : 'owed'}">${formatAmountUSD(d.amount)}</div>
      </div>`;
  }).join('') + (allDebts.length > 6 ? `<div class="text-center mt-8"><button class="btn btn-ghost btn-sm" onclick="navigate('settle')">View all ${allDebts.length} balances</button></div>` : '');
}

function openAddExpenseFromDashboard() {
  const groups = store.getUserGroups();
  if (groups.length === 0) { showToast('Create a group first', 'info'); return; }
  navigate('group:' + groups[0].id);
  setTimeout(() => openAddExpenseModal(groups[0].id), 200);
}

window.renderDashboard = renderDashboard;
window.openAddExpenseFromDashboard = openAddExpenseFromDashboard;
