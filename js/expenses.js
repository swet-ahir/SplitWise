// ===== EXPENSE VIEWS =====

async function openAddExpenseModal(groupId) {
  let g;
  try {
    g = await api.getGroup(groupId);
  } catch (e) {
    showToast('Failed to load group', 'error');
    return;
  }

  const me = api.currentUser;
  const members = g.members || [];

  window._expModal = { splitType: 'equal', customSplits: {}, currency: 'USD', paidBy: me.id, members };

  openModal(`
    <div class="modal-header">
      <h3>Add Expense to ${g.name}</h3>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div id="exp-error" class="alert alert-danger hidden"></div>

      <div class="form-group">
        <label class="form-label">Description</label>
        <input class="form-control" id="exp-desc" type="text" placeholder="What was this expense for?" maxlength="100" autofocus>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group mb-0">
          <label class="form-label">Amount</label>
          <div class="amount-input-group">
            <span class="amount-currency" id="exp-currency-symbol">$</span>
            <input type="number" id="exp-amount" min="0.01" step="0.01" placeholder="0.00" oninput="refreshSplitRows('${groupId}')">
          </div>
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Currency</label>
          <select class="form-control" id="exp-currency" onchange="onExpCurrencyChange('${groupId}')">
            ${currencyOptions('USD')}
          </select>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
        <div class="form-group mb-0">
          <label class="form-label">Paid by</label>
          <select class="form-control" id="exp-paid-by">
            ${members.map(u => `<option value="${u.id}" ${u.id === me.id ? 'selected' : ''}>${u.id === me.id ? 'You' : u.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Category</label>
          <select class="form-control" id="exp-category">
            ${categoryOptions()}
          </select>
        </div>
      </div>

      <div class="form-group" style="margin-top:16px">
        <label class="form-label">Date</label>
        <input class="form-control" type="date" id="exp-date" value="${new Date().toISOString().split('T')[0]}">
      </div>

      <div class="form-group">
        <label class="form-label">Split</label>
        <div class="split-tabs">
          <div class="split-tab active" id="split-equal" onclick="setSplitType('equal','${groupId}')">Equally</div>
          <div class="split-tab" id="split-percentage" onclick="setSplitType('percentage','${groupId}')">By %</div>
          <div class="split-tab" id="split-exact" onclick="setSplitType('exact','${groupId}')">By Amount</div>
        </div>
        <div id="split-rows">
          ${renderSplitRows(members, 'equal', {}, 0, 'USD')}
        </div>
        <div id="split-validation" class="form-hint" style="margin-top:8px"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="handleAddExpense('${groupId}')">Add Expense</button>
    </div>
  `);
}

window.onExpCurrencyChange = function(groupId) {
  const currency = document.getElementById('exp-currency')?.value || 'USD';
  window._expModal.currency = currency;
  const sym = CURRENCIES[currency]?.symbol || '$';
  const symEl = document.getElementById('exp-currency-symbol');
  if (symEl) symEl.textContent = sym;
  refreshSplitRows(groupId);
};

window.setSplitType = function(type, groupId) {
  window._expModal.splitType = type;
  collectSplitValues();
  document.querySelectorAll('.split-tab').forEach(el => el.classList.remove('active'));
  document.getElementById('split-' + type)?.classList.add('active');
  refreshSplitRows(groupId);
};

window.refreshSplitRows = function(groupId) {
  const members = window._expModal.members || [];
  const amount = parseFloat(document.getElementById('exp-amount')?.value || '0') || 0;
  const currency = window._expModal.currency || 'USD';
  collectSplitValues();
  const rows = document.getElementById('split-rows');
  if (rows) rows.innerHTML = renderSplitRows(members, window._expModal.splitType, window._expModal.customSplits, amount, currency);
  document.querySelectorAll('[data-split]').forEach(inp => {
    inp.addEventListener('input', () => validateSplits(amount, currency));
  });
  validateSplits(amount, currency);
};

function collectSplitValues() {
  document.querySelectorAll('[data-split]').forEach(inp => {
    const mid = inp.dataset.member;
    if (mid) window._expModal.customSplits[mid] = parseFloat(inp.value) || 0;
  });
}

function validateSplits(amount, currency) {
  const validation = document.getElementById('split-validation');
  if (!validation) return;
  if (!amount || window._expModal.splitType === 'equal') { validation.textContent = ''; validation.className = 'form-hint'; return; }
  collectSplitValues();
  if (window._expModal.splitType === 'percentage') {
    const total = Object.values(window._expModal.customSplits).reduce((a, b) => a + (parseFloat(b) || 0), 0);
    const diff = Math.abs(total - 100);
    validation.textContent = diff < 0.01 ? '✓ Adds up to 100%' : `${total.toFixed(1)}% (need 100%)`;
    validation.className = diff < 0.01 ? 'form-hint text-success' : 'form-hint text-danger';
  } else {
    const total = Object.values(window._expModal.customSplits).reduce((a, b) => a + (parseFloat(b) || 0), 0);
    const diff = Math.abs(total - amount);
    validation.textContent = diff < 0.01 ? `✓ Adds up to ${formatAmount(amount, currency)}` : `${formatAmount(total, currency)} of ${formatAmount(amount, currency)}`;
    validation.className = diff < 0.01 ? 'form-hint text-success' : 'form-hint text-danger';
  }
}

window.handleAddExpense = async function(groupId) {
  const desc = document.getElementById('exp-desc')?.value.trim();
  const amount = document.getElementById('exp-amount')?.value;
  const currency = document.getElementById('exp-currency')?.value || 'USD';
  const paidBy = document.getElementById('exp-paid-by')?.value;
  const category = document.getElementById('exp-category')?.value || 'other';
  const date = document.getElementById('exp-date')?.value;
  const err = document.getElementById('exp-error');
  const btn = document.querySelector('.modal-footer .btn-primary');

  if (!desc) { err.textContent = 'Enter a description'; err.classList.remove('hidden'); return; }
  if (!amount || parseFloat(amount) <= 0) { err.textContent = 'Enter a valid amount'; err.classList.remove('hidden'); return; }

  collectSplitValues();

  if (btn) { btn.disabled = true; btn.textContent = 'Adding...'; }

  try {
    await api.addExpense(groupId, {
      description: desc,
      amount: parseFloat(amount),
      currency,
      paidBy,
      splitType: window._expModal.splitType,
      customSplits: window._expModal.customSplits,
      category,
      date,
    });
    closeModal();
    showToast('Expense added!', 'success');
    navigate('group:' + groupId);
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove('hidden');
    if (btn) { btn.disabled = false; btn.textContent = 'Add Expense'; }
  }
};

// ===== EXPENSE DETAIL MODAL =====
async function openExpenseDetail(expenseId, groupId) {
  // Find the expense from the current page's rendered data
  // We need to fetch it fresh
  let expenses, group;
  try {
    [expenses, group] = await Promise.all([
      api.getGroupExpenses(groupId),
      api.getGroup(groupId),
    ]);
  } catch (e) {
    showToast('Failed to load expense details', 'error');
    return;
  }

  const e = expenses.find(ex => ex.id === expenseId);
  if (!e) { showToast('Expense not found', 'error'); return; }

  const me = api.currentUser;
  const payer = e.paidBy; // object {id, name, color}
  const cat = getCategoryInfo(e.category);
  const members = group.members || [];

  openModal(`
    <div class="modal-header">
      <h3>${e.description}</h3>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
        <div style="width:56px;height:56px;border-radius:14px;background:${cat.color}20;display:flex;align-items:center;justify-content:center;font-size:26px">${cat.icon}</div>
        <div>
          <div style="font-size:1.75rem;font-weight:800">${formatAmount(e.amount, e.currency)}</div>
          <div class="text-muted text-small">${cat.label} · ${formatDate(e.date)}</div>
        </div>
      </div>

      <div class="d-flex align-center gap-12 mb-16" style="padding:14px;background:var(--surface-2);border-radius:var(--radius)">
        ${renderAvatar(payer)}
        <div>
          <div style="font-size:0.875rem;font-weight:600">${payer?.id === me.id ? 'You paid' : (payer?.name || 'Unknown') + ' paid'}</div>
          <div class="text-muted text-small">${formatAmount(e.amount, e.currency)} total</div>
        </div>
      </div>

      <div style="font-size:0.875rem;font-weight:700;margin-bottom:10px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em">Split Details</div>
      ${members.map(u => {
        const share = e.splits ? (e.splits[u.id] || 0) : 0;
        const isPayer = payer && u.id === payer.id;
        const pct = e.amount > 0 ? ((share / e.amount) * 100).toFixed(1) : '0';
        return `
          <div class="list-item" style="padding:10px 0">
            ${renderAvatar(u, 'avatar-sm')}
            <div class="list-item-main">
              <div class="list-item-title">${u.name}${u.id === me.id ? ' (you)' : ''}${isPayer ? ' 💳' : ''}</div>
              <div class="list-item-sub">${pct}% of total${isPayer ? ' · paid' : ''}</div>
            </div>
            <div class="text-right">
              <div class="fw-bold">${formatAmount(share, e.currency)}</div>
              ${isPayer && share < e.amount ? `<div class="text-success text-small">lent ${formatAmount(e.amount - share, e.currency)}</div>` : ''}
              ${!isPayer && share > 0 ? `<div class="text-danger text-small">owes</div>` : ''}
            </div>
          </div>`;
      }).join('')}

      <div class="divider"></div>
      <div class="text-muted text-small">Added ${timeAgo(e.createdAt)}</div>
    </div>
    <div class="modal-footer">
      ${e.createdBy === me.id || group.createdBy === me.id ? `<button class="btn btn-danger btn-sm" onclick="handleDeleteExpense('${expenseId}','${groupId}')">Delete</button>` : ''}
      <button class="btn btn-secondary" onclick="closeModal()">Close</button>
    </div>
  `);
}

window.handleDeleteExpense = function(expenseId, groupId) {
  closeModal();
  confirmDialog('Delete this expense? This cannot be undone.', async () => {
    try {
      await api.deleteExpense(expenseId);
      showToast('Expense deleted', 'info');
      navigate('group:' + groupId);
    } catch (e) {
      showToast(e.message, 'error');
    }
  });
};

// ===== SETTLE MODAL =====
async function openSettleModal(groupId) {
  let group, balancesData;
  try {
    [group, balancesData] = await Promise.all([
      api.getGroup(groupId),
      api.getGroupBalances(groupId),
    ]);
  } catch (e) {
    showToast('Failed to load settlement data', 'error');
    return;
  }

  const me = api.currentUser;
  const members = group.members || [];
  const { simplified: debts, members: balanceMembers } = balancesData;

  const myDebt = debts.find(d => d.from === me.id) || debts.find(d => d.to === me.id) || debts[0] || null;
  const defaultFrom = myDebt?.from || me.id;
  const defaultTo = myDebt?.to || (members.find(u => u.id !== me.id)?.id || me.id);
  const defaultAmount = myDebt?.amount || '';

  openModal(`
    <div class="modal-header">
      <h3>Record Settlement</h3>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div id="settle-error" class="alert alert-danger hidden"></div>

      ${debts.length > 0 ? `
        <div style="margin-bottom:20px">
          <div style="font-size:0.8rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);margin-bottom:8px">Suggested Settlements</div>
          ${debts.slice(0, 3).map(d => {
            const from = balanceMembers ? balanceMembers.find(m => m.id === d.from) : null;
            const to = balanceMembers ? balanceMembers.find(m => m.id === d.to) : null;
            return `<div class="settle-item" style="cursor:pointer" onclick="prefillSettle('${d.from}','${d.to}',${d.amount})">
              ${renderAvatar(from, 'avatar-sm')}
              <div class="settle-info flex-1">
                <div class="settle-text text-small"><strong>${d.from === me.id ? 'You' : (from?.name || 'Unknown')}</strong> → <strong>${d.to === me.id ? 'You' : (to?.name || 'Unknown')}</strong></div>
              </div>
              <div class="settle-amount fw-bold text-danger text-small">${formatAmountUSD(d.amount)}</div>
            </div>`;
          }).join('')}
        </div>
        <div class="divider"></div>
      ` : ''}

      <div class="form-group">
        <label class="form-label">Who paid?</label>
        <select class="form-control" id="settle-from">
          ${members.map(u => `<option value="${u.id}" ${u.id === defaultFrom ? 'selected' : ''}>${u.id === me.id ? 'You' : u.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Paid to</label>
        <select class="form-control" id="settle-to">
          ${members.map(u => `<option value="${u.id}" ${u.id === defaultTo ? 'selected' : ''}>${u.id === me.id ? 'You' : u.name}</option>`).join('')}
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div class="form-group mb-0">
          <label class="form-label">Amount</label>
          <input class="form-control" id="settle-amount" type="number" min="0.01" step="0.01" placeholder="0.00" value="${defaultAmount}">
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Currency</label>
          <select class="form-control" id="settle-currency">
            ${currencyOptions('USD')}
          </select>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="handleSettle('${groupId}')">Record Payment</button>
    </div>
  `);
}

window.prefillSettle = function(from, to, amount) {
  const fromEl = document.getElementById('settle-from');
  const toEl = document.getElementById('settle-to');
  const amtEl = document.getElementById('settle-amount');
  if (fromEl) fromEl.value = from;
  if (toEl) toEl.value = to;
  if (amtEl) amtEl.value = amount;
};

window.handleSettle = async function(groupId) {
  const from = document.getElementById('settle-from')?.value;
  const to = document.getElementById('settle-to')?.value;
  const amount = document.getElementById('settle-amount')?.value;
  const currency = document.getElementById('settle-currency')?.value || 'USD';
  const err = document.getElementById('settle-error');
  const btn = document.querySelector('.modal-footer .btn-primary');

  if (from === to) { err.textContent = 'Payer and recipient must be different'; err.classList.remove('hidden'); return; }
  if (!amount || parseFloat(amount) <= 0) { err.textContent = 'Enter a valid amount'; err.classList.remove('hidden'); return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Recording...'; }

  try {
    await api.addSettlement(groupId, { from, to, amount: parseFloat(amount), currency });
    closeModal();
    showToast('Settlement recorded!', 'success');
    navigate('group:' + groupId);
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove('hidden');
    if (btn) { btn.disabled = false; btn.textContent = 'Record Payment'; }
  }
};

window.quickSettle = function(groupId, from, to, amount) {
  openSettleModal(groupId).then(() => {
    setTimeout(() => prefillSettle(from, to, amount), 50);
  });
};

window.openAddExpenseModal = openAddExpenseModal;
window.openExpenseDetail = openExpenseDetail;
window.openSettleModal = openSettleModal;
