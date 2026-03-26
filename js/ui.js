// ===== UI UTILITIES =====

// Toast notifications
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Modal management
function openModal(html) {
  closeModal();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'modal-backdrop';
  backdrop.innerHTML = `<div class="modal">${html}</div>`;
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal();
  });
  document.body.appendChild(backdrop);
  // Focus first input
  setTimeout(() => {
    const first = backdrop.querySelector('input:not([type=hidden])');
    if (first) first.focus();
  }, 50);
}

function closeModal() {
  const existing = document.getElementById('modal-backdrop');
  if (existing) existing.remove();
}

// Render avatar
function renderAvatar(user, sizeClass = '') {
  if (!user) return `<div class="avatar ${sizeClass}" style="background:#ccc">?</div>`;
  const initials = getInitials(user.name);
  const color = user.color || '#5bc5a7';
  return `<div class="avatar ${sizeClass}" style="background:${color};color:white">${initials}</div>`;
}

// Currency options HTML
function currencyOptions(selected = 'USD') {
  return Object.entries(CURRENCIES).map(([code, c]) =>
    `<option value="${code}" ${code === selected ? 'selected' : ''}>${c.flag} ${code} — ${c.name}</option>`
  ).join('');
}

// Category options HTML
function categoryOptions(selected = 'other') {
  return EXPENSE_CATEGORIES.map(c =>
    `<option value="${c.id}" ${c.id === selected ? 'selected' : ''}>${c.icon} ${c.label}</option>`
  ).join('');
}

// Group icon picker HTML
function iconPicker(selected = '🏠') {
  return GROUP_ICONS.map(icon =>
    `<span class="icon-option ${icon === selected ? 'selected' : ''}" data-icon="${icon}" style="font-size:22px;cursor:pointer;padding:6px;border-radius:8px;border:2px solid ${icon === selected ? 'var(--primary)' : 'transparent'}">${icon}</span>`
  ).join('');
}

// Color swatches HTML
function colorSwatches(selected, prefix = 'color') {
  return GROUP_COLORS.map(c =>
    `<div class="color-swatch ${c === selected ? 'selected' : ''}" data-color="${c}" style="background:${c}" data-prefix="${prefix}"></div>`
  ).join('');
}

// Render member list for splits
function renderSplitRows(members, splitType, customSplits = {}, amount = 0, currency = 'USD') {
  return members.map(u => {
    let inputHTML = '';
    if (splitType === 'equal') {
      const share = members.length > 0 ? amount / members.length : 0;
      inputHTML = `<span class="text-muted text-small">${formatAmount(share, currency)}</span>`;
    } else if (splitType === 'percentage') {
      const val = customSplits[u.id] !== undefined ? customSplits[u.id] : (100 / members.length).toFixed(1);
      inputHTML = `<input class="form-control" type="number" min="0" max="100" step="0.1" value="${val}" data-member="${u.id}" data-split="percentage" placeholder="0" style="width:90px;text-align:right"> <span class="text-muted">%</span>`;
    } else { // exact
      const share = amount / members.length;
      const val = customSplits[u.id] !== undefined ? customSplits[u.id] : share.toFixed(2);
      inputHTML = `<span class="currency-display">${CURRENCIES[currency]?.symbol || '$'}</span><input class="form-control" type="number" min="0" step="0.01" value="${val}" data-member="${u.id}" data-split="exact" placeholder="0.00" style="width:90px;text-align:right">`;
    }
    return `
      <div class="member-split-row">
        ${renderAvatar(u, 'avatar-sm')}
        <span class="name">${u.name}${u.id === store.currentUser?.id ? ' (you)' : ''}</span>
        <div class="d-flex align-center gap-8">${inputHTML}</div>
      </div>`;
  }).join('');
}

// Confirm dialog
function confirmDialog(message, onConfirm) {
  openModal(`
    <div class="modal-header">
      <h3>Confirm</h3>
      <button class="close-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <p>${message}</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" id="confirm-btn">Confirm</button>
    </div>
  `);
  document.getElementById('confirm-btn').onclick = () => { closeModal(); onConfirm(); };
}

// Loading spinner
function spinnerHTML() {
  return `<div class="loading"><span class="spin">⟳</span>&nbsp;Loading...</div>`;
}

// Empty state
function emptyStateHTML(icon, title, message, actionHTML = '') {
  return `
    <div class="empty-state">
      <div class="icon">${icon}</div>
      <h3>${title}</h3>
      <p>${message}</p>
      ${actionHTML}
    </div>`;
}

// Format balance with color
function balanceHTML(amount, currency = 'USD') {
  const cls = amount > 0.01 ? 'positive' : amount < -0.01 ? 'negative' : '';
  const label = amount > 0.01 ? '+' : '';
  return `<span class="${cls}">${label}${formatAmount(Math.abs(amount), currency)}</span>`;
}

window.showToast = showToast;
window.openModal = openModal;
window.closeModal = closeModal;
window.renderAvatar = renderAvatar;
window.currencyOptions = currencyOptions;
window.categoryOptions = categoryOptions;
window.iconPicker = iconPicker;
window.colorSwatches = colorSwatches;
window.renderSplitRows = renderSplitRows;
window.confirmDialog = confirmDialog;
window.spinnerHTML = spinnerHTML;
window.emptyStateHTML = emptyStateHTML;
window.balanceHTML = balanceHTML;
