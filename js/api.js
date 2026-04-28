// ===== HTTP API CLIENT =====
// Replaces store.js — communicates with the Express/PostgreSQL backend

const API_BASE = '/api';

let _currentUser = null;
try { _currentUser = JSON.parse(localStorage.getItem('sw_user')); } catch (e) {}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('sw_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    api.logout();
    window.location.reload();
    return;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const api = {
  get currentUser() { return _currentUser; },

  isLoggedIn() {
    return !!localStorage.getItem('sw_token') && !!_currentUser;
  },

  async register(name, email, password) {
    const data = await request('POST', '/auth/register', { name, email, password });
    _currentUser = data.user;
    localStorage.setItem('sw_token', data.token);
    localStorage.setItem('sw_user', JSON.stringify(data.user));
    return data;
  },

  async login(email, password) {
    const data = await request('POST', '/auth/login', { email, password });
    _currentUser = data.user;
    localStorage.setItem('sw_token', data.token);
    localStorage.setItem('sw_user', JSON.stringify(data.user));
    return data;
  },

  async loginDemo() {
    const data = await request('POST', '/auth/demo', {});
    _currentUser = data.user;
    localStorage.setItem('sw_token', data.token);
    localStorage.setItem('sw_user', JSON.stringify(data.user));
    return data;
  },

  logout() {
    localStorage.removeItem('sw_token');
    localStorage.removeItem('sw_user');
    _currentUser = null;
  },

  // Groups
  async getGroups() { return request('GET', '/groups'); },
  async createGroup(name, icon, color, memberEmails) { return request('POST', '/groups', { name, icon, color, memberEmails }); },
  async getGroup(id) { return request('GET', `/groups/${id}`); },
  async updateGroup(id, updates) { return request('PUT', `/groups/${id}`, updates); },
  async deleteGroup(id) { return request('DELETE', `/groups/${id}`); },
  async addGroupMember(groupId, email) { return request('POST', `/groups/${groupId}/members`, { email }); },
  async getInvitation(token) { return request('GET', `/invitations/${token}`); },
  async acceptInvitation(token) { return request('POST', `/invitations/${token}/accept`, {}); },
  async removeGroupMember(groupId, userId) { return request('DELETE', `/groups/${groupId}/members/${userId}`); },
  async getGroupBalances(groupId) { return request('GET', `/groups/${groupId}/balances`); },

  // Expenses
  async getGroupExpenses(groupId) { return request('GET', `/expenses/groups/${groupId}/expenses`); },
  async getExpense(id) { return request('GET', `/expenses/expenses/${id}`); },
  async addExpense(groupId, data) { return request('POST', `/expenses/groups/${groupId}/expenses`, data); },
  async deleteExpense(id) { return request('DELETE', `/expenses/expenses/${id}`); },

  // Settlements
  async getGroupSettlements(groupId) { return request('GET', `/settlements/groups/${groupId}/settlements`); },
  async addSettlement(groupId, data) { return request('POST', `/settlements/groups/${groupId}/settlements`, data); },
  async deleteSettlement(id) { return request('DELETE', `/settlements/${id}`); },

  // Notifications
  async getNotifications({ limit, before } = {}) {
    const qs = [];
    if (limit) qs.push(`limit=${encodeURIComponent(limit)}`);
    if (before) qs.push(`before=${encodeURIComponent(before)}`);
    const suffix = qs.length ? `?${qs.join('&')}` : '';
    return request('GET', `/notifications${suffix}`);
  },
  async markNotificationRead(id) { return request('PUT', `/notifications/${id}`); },
  async markAllRead() { return request('PUT', '/notifications/read-all'); },
  async deleteNotification(id) { return request('DELETE', `/notifications/${id}`); },
  async clearNotifications() { return request('DELETE', '/notifications'); },

  // Users
  async getMe() { return request('GET', '/users/me'); },
  async updateProfile(updates) {
    const resp = await request('PUT', '/users/me', updates);
    // Server now returns a fresh token with the updated name embedded so
    // notifications and any name-derived fields stay in sync. Persist both.
    if (resp && resp.token) {
      localStorage.setItem('sw_token', resp.token);
      delete resp.token;
    }
    _currentUser = resp;
    localStorage.setItem('sw_user', JSON.stringify(resp));
    return resp;
  },
  async changePassword(currentPassword, newPassword) {
    const resp = await request('PUT', '/users/me/password', { currentPassword, newPassword });
    // Password change bumps token_version on the server, so the previously
    // stored token is now invalid. Replace it with the fresh one.
    if (resp && resp.token) {
      localStorage.setItem('sw_token', resp.token);
    }
    return resp;
  },
  async searchUser(email) {
    // Returns { user: {...} } on hit or { user: null } on miss (200 in both cases).
    const resp = await request('GET', `/users/search?email=${encodeURIComponent(email)}`);
    return resp && resp.user ? resp.user : null;
  },
  async getOverallBalances() { return request('GET', '/users/me/balances'); },
};

window.api = api;
