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

async function fillDemoAccount() {
  const btn = document.querySelector('.btn-ghost.btn-sm');
  if (btn) { btn.disabled = true; btn.textContent = 'Loading demo...'; }

  try {
    await api.loginDemo();
    initApp();
  } catch (e) {
    showToast('Demo login failed: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Use demo account'; }
  }
}

async function handleLogin() {
  const email = document.getElementById('login-email')?.value?.trim();
  const password = document.getElementById('login-password')?.value;
  const errorEl = document.getElementById('auth-error');
  const btn = document.querySelector('#auth-form-container .btn-primary');

  if (!email || !password) {
    errorEl.textContent = 'Please fill in all fields';
    errorEl.classList.remove('hidden');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }

  try {
    await api.login(email, password);
    errorEl.classList.add('hidden');
    initApp();
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.classList.remove('hidden');
    if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
  }
}

async function handleRegister() {
  const name = document.getElementById('reg-name')?.value?.trim();
  const email = document.getElementById('reg-email')?.value?.trim();
  const password = document.getElementById('reg-password')?.value;
  const errorEl = document.getElementById('auth-error');
  const btn = document.querySelector('#auth-form-container .btn-primary');

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

  if (btn) { btn.disabled = true; btn.textContent = 'Creating account...'; }

  try {
    await api.register(name, email, password);
    errorEl.classList.add('hidden');
    showToast('Account created! Welcome to Splitwise', 'success');
    initApp();
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.classList.remove('hidden');
    if (btn) { btn.disabled = false; btn.textContent = 'Create Account'; }
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
