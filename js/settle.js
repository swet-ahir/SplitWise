// ===== SETTLE UP PAGE =====

async function renderSettlePage() {
  document.getElementById('page-title').textContent = 'Settle Up';
  document.getElementById('page-content').innerHTML = spinnerHTML();

  try {
    const me = api.currentUser;
    const groups = await api.getGroups();

    // Fetch balances for all groups in parallel
    const balanceResults = await Promise.allSettled(
      groups.map(g => api.getGroupBalances(g.id).then(b => ({ ...b, group: g })))
    );

    const allDebts = [];
    balanceResults.forEach(result => {
      if (result.status !== 'fulfilled') return;
      const { simplified, members: balanceMembers, group } = result.value;
      simplified.forEach(d => {
        allDebts.push({
          ...d,
          groupId: group.id,
          groupName: group.name,
          groupIcon: group.icon,
          groupColor: group.color,
          members: balanceMembers,
        });
      });
    });

    const myDebts = allDebts.filter(d => d.from === me.id);
    const owedToMe = allDebts.filter(d => d.to === me.id);
    const otherDebts = allDebts.filter(d => d.from !== me.id && d.to !== me.id);

    const totalOwe = myDebts.reduce((s, d) => s + d.amount, 0);
    const totalOwed = owedToMe.reduce((s, d) => s + d.amount, 0);

    document.getElementById('page-content').innerHTML = `
      <div class="stats-grid mb-24" style="grid-template-columns:repeat(2,1fr)">
        <div class="stat-card red">
          <div class="stat-label">You Owe</div>
          <div class="stat-value negative">${formatAmountUSD(totalOwe)}</div>
          <div class="stat-sub">${myDebts.length} payment${myDebts.length !== 1 ? 's' : ''} to make</div>
        </div>
        <div class="stat-card green">
          <div class="stat-label">You Are Owed</div>
          <div class="stat-value positive">${formatAmountUSD(totalOwed)}</div>
          <div class="stat-sub">${owedToMe.length} payment${owedToMe.length !== 1 ? 's' : ''} to receive</div>
        </div>
      </div>

      ${myDebts.length === 0 && owedToMe.length === 0 ? `
        <div class="card">
          <div class="card-body">
            ${emptyStateHTML('🎉', 'All settled up!', 'You have no outstanding balances. Great job!')}
          </div>
        </div>
      ` : ''}

      ${myDebts.length > 0 ? `
        <div class="card mb-24">
          <div class="card-header">
            <h3>💸 You Owe</h3>
            <span class="badge badge-red">${myDebts.length}</span>
          </div>
          <div class="card-body">
            ${myDebts.map(d => renderSettleRow(d, me, true)).join('')}
          </div>
        </div>
      ` : ''}

      ${owedToMe.length > 0 ? `
        <div class="card mb-24">
          <div class="card-header">
            <h3>💰 Owed to You</h3>
            <span class="badge badge-green">${owedToMe.length}</span>
          </div>
          <div class="card-body">
            ${owedToMe.map(d => renderSettleRow(d, me, false)).join('')}
          </div>
        </div>
      ` : ''}

      ${otherDebts.length > 0 ? `
        <div class="card">
          <div class="card-header">
            <h3>Other Balances in Your Groups</h3>
          </div>
          <div class="card-body">
            ${otherDebts.map(d => renderOtherDebt(d)).join('')}
          </div>
        </div>
      ` : ''}
    `;
  } catch (err) {
    document.getElementById('page-content').innerHTML = `
      <div class="card"><div class="card-body">
        ${emptyStateHTML('⚠️', 'Failed to load balances', err.message, '<button class="btn btn-primary" onclick="navigate(\'settle\')">Retry</button>')}
      </div></div>`;
  }
}

function renderSettleRow(d, me, iDebtor) {
  const members = d.members || [];
  const other = iDebtor
    ? members.find(m => m.id === d.to)
    : members.find(m => m.id === d.from);
  const fromMember = members.find(m => m.id === d.from);

  return `
    <div class="settle-item">
      ${renderAvatar(other)}
      <div class="settle-info" style="flex:1">
        <div class="settle-text">
          ${iDebtor
            ? `You owe <strong>${other?.name || 'Unknown'}</strong>`
            : `<strong>${fromMember?.name || 'Unknown'}</strong> owes you`
          }
        </div>
        <div class="text-muted text-small">
          <span style="background:${d.groupColor}20;padding:2px 8px;border-radius:10px;font-size:0.75rem">${d.groupIcon} ${d.groupName}</span>
        </div>
      </div>
      <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <div class="settle-amount">${formatAmountUSD(d.amount)}</div>
        <button class="btn btn-sm ${iDebtor ? 'btn-primary' : 'btn-secondary'}"
          onclick="openSettleModal('${d.groupId}').then(()=>setTimeout(()=>prefillSettle('${d.from}','${d.to}',${d.amount}),50))">
          ${iDebtor ? '💳 Pay Now' : '✓ Record Receipt'}
        </button>
      </div>
    </div>`;
}

function renderOtherDebt(d) {
  const members = d.members || [];
  const from = members.find(m => m.id === d.from);
  const to = members.find(m => m.id === d.to);

  return `
    <div class="settle-item" style="opacity:0.8">
      ${renderAvatar(from, 'avatar-sm')}
      <div style="flex:1">
        <div class="settle-text text-small">
          <strong>${from?.name || 'Unknown'}</strong> → <strong>${to?.name || 'Unknown'}</strong>
        </div>
        <div class="text-muted text-small">${d.groupIcon} ${d.groupName}</div>
      </div>
      <div class="text-muted fw-bold text-small">${formatAmountUSD(d.amount)}</div>
    </div>`;
}

window.renderSettlePage = renderSettlePage;
