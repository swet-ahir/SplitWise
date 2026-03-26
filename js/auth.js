// ===== AUTH VIEWS =====

function renderAuth() {
  const screen = document.getElementById('auth-screen');
  screen.innerHTML = `
    <div class="auth-card">
      <div class="auth-logo">
        <div class="logo-icon">💸</div>
        <h1>Splitwise</h1>
        <p>Split expenses, not friendships</p>
      </div>
      <div class="auth-tabs">
        <div class="auth-tab active" id="tab-login" onclick="switchAuthTab('login')">Sign In</div>
        <div class="auth-tab" id="tab-register" onclick="switchAuthTab('register')">Create Account</div>
      </div>
      <div id="auth-form-container">
        ${renderLoginForm()}
      </div>
    </div>
  `;
}

function switchAuthTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('auth-form-container').innerHTML = tab === 'login' ? renderLoginForm() : renderRegisterForm();
}

function renderLoginForm() {
  return `
    <div id="auth-error" class="alert alert-danger hidden"></div>
    <div class="form-group">
      <label class="form-label">Email</label>
      <input class="form-control" type="email" id="login-email" placeholder="you@example.com" autocomplete="email">
    </div>
    <div class="form-group">
      <label class="form-label">Password</label>
      <input class="form-control" type="password" id="login-password" placeholder="••••••••" autocomplete="current-password">
    </div>
    <button class="btn btn-primary btn-block btn-lg" onclick="handleLogin()">Sign In</button>
    <div class="text-center mt-16">
      <button class="btn btn-ghost btn-sm" onclick="fillDemoAccount()">Use demo account</button>
    </div>
  `;
}

function renderRegisterForm() {
  return `
    <div id="auth-error" class="alert alert-danger hidden"></div>
    <div class="form-group">
      <label class="form-label">Full Name</label>
      <input class="form-control" type="text" id="reg-name" placeholder="Alex Johnson" autocomplete="name">
    </div>
    <div class="form-group">
      <label class="form-label">Email</label>
      <input class="form-control" type="email" id="reg-email" placeholder="you@example.com" autocomplete="email">
    </div>
    <div class="form-group">
      <label class="form-label">Password</label>
      <input class="form-control" type="password" id="reg-password" placeholder="At least 6 characters" autocomplete="new-password">
    </div>
    <button class="btn btn-primary btn-block btn-lg" onclick="handleRegister()">Create Account</button>
  `;
}

function fillDemoAccount() {
  // Create demo data if not exists
  try {
    store.register('Alex Johnson', 'alex@demo.com', 'demo123');
  } catch (e) {}
  try {
    store.register('Jamie Smith', 'jamie@demo.com', 'demo123');
  } catch (e) {}
  try {
    store.register('Casey Lee', 'casey@demo.com', 'demo123');
  } catch (e) {}
  try {
    store.register('Morgan Brown', 'morgan@demo.com', 'demo123');
  } catch (e) {}

  // Login as Alex and create sample groups + expenses
  store.login('alex@demo.com', 'demo123');

  if (store.getUserGroups().length === 0) {
    seedDemoData();
  }

  document.getElementById('login-email').value = 'alex@demo.com';
  document.getElementById('login-password').value = 'demo123';
  showToast('Demo credentials filled! Click Sign In.', 'info');
}

function seedDemoData() {
  const me = store.currentUser;
  const jamie = store.data.users.find(u => u.email === 'jamie@demo.com');
  const casey = store.data.users.find(u => u.email === 'casey@demo.com');
  const morgan = store.data.users.find(u => u.email === 'morgan@demo.com');

  if (!jamie || !casey || !morgan) return;

  // Group 1: Apartment
  const { group: apt } = store.createGroup('Apartment', '🏠', '#5bc5a7', ['jamie@demo.com', 'casey@demo.com']);
  store.addExpense(apt.id, 'Monthly Rent', 2400, 'USD', me.id, 'equal', {}, 'utilities', '2026-03-01');
  store.addExpense(apt.id, 'Electricity Bill', 120, 'USD', jamie.id, 'equal', {}, 'utilities', '2026-03-05');
  store.addExpense(apt.id, 'Internet', 80, 'USD', casey.id, 'equal', {}, 'utilities', '2026-03-08');
  store.addExpense(apt.id, 'Groceries', 245.50, 'USD', me.id, 'equal', {}, 'groceries', '2026-03-12');
  store.addSettlement(apt.id, jamie.id, me.id, 150, 'USD');

  // Group 2: Europe Trip
  const { group: trip } = store.createGroup('Europe Trip', '✈️', '#3b82f6', ['jamie@demo.com', 'morgan@demo.com']);
  store.addExpense(trip.id, 'Flight tickets', 1800, 'EUR', me.id, 'equal', {}, 'travel', '2026-02-15');
  store.addExpense(trip.id, 'Hotel Paris', 650, 'EUR', morgan.id, 'equal', {}, 'accommodation', '2026-02-20');
  store.addExpense(trip.id, 'Dinner at Le Jules Verne', 320, 'EUR', jamie.id, 'equal', {}, 'food', '2026-02-22');
  store.addExpense(trip.id, 'Museum passes', 85, 'EUR', me.id, 'equal', {}, 'entertainment', '2026-02-23');

  // Group 3: Weekend Cabin
  const { group: cabin } = store.createGroup('Weekend Cabin', '⛺', '#f59e0b', ['casey@demo.com', 'morgan@demo.com']);
  store.addExpense(cabin.id, 'Cabin rental', 450, 'USD', casey.id, 'equal', {}, 'accommodation', '2026-03-15');
  store.addExpense(cabin.id, 'Groceries & supplies', 180, 'USD', me.id, 'equal', {}, 'groceries', '2026-03-15');
  store.addExpense(cabin.id, 'Gas', 65, 'USD', morgan.id, 'equal', {}, 'transport', '2026-03-15');

  store.logout();
}

function handleLogin() {
  const email = document.getElementById('login-email')?.value?.trim();
  const password = document.getElementById('login-password')?.value;
  const errorEl = document.getElementById('auth-error');

  if (!email || !password) {
    errorEl.textContent = 'Please fill in all fields';
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    store.login(email, password);
    errorEl.classList.add('hidden');
    initApp();
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.classList.remove('hidden');
  }
}

function handleRegister() {
  const name = document.getElementById('reg-name')?.value?.trim();
  const email = document.getElementById('reg-email')?.value?.trim();
  const password = document.getElementById('reg-password')?.value;
  const errorEl = document.getElementById('auth-error');

  if (!name || !email || !password) {
    errorEl.textContent = 'Please fill in all fields';
    errorEl.classList.remove('hidden');
    return;
  }
  if (password.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters';
    errorEl.classList.remove('hidden');
    return;
  }
  if (!/\S+@\S+\.\S+/.test(email)) {
    errorEl.textContent = 'Please enter a valid email address';
    errorEl.classList.remove('hidden');
    return;
  }

  try {
    store.register(name, email, password);
    errorEl.classList.add('hidden');
    showToast('Account created! Welcome to Splitwise', 'success');
    initApp();
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.classList.remove('hidden');
  }
}

// Enter key support
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const loginBtn = document.querySelector('#auth-form-container .btn-primary');
    if (loginBtn) loginBtn.click();
  }
});

window.renderAuth = renderAuth;
window.switchAuthTab = switchAuthTab;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.fillDemoAccount = fillDemoAccount;
