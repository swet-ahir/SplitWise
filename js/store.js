// ===== DATA STORE =====
// All state lives here; persisted to localStorage

const STORAGE_KEY = 'splitwise_data';

const DEFAULT_DATA = {
  users: [],           // { id, name, email, password, color, avatar }
  currentUserId: null,
  groups: [],          // { id, name, icon, color, createdBy, members: [userId], createdAt }
  expenses: [],        // { id, groupId, description, amount, currency, paidBy, splits, category, date, createdAt }
  settlements: [],     // { id, groupId, from, to, amount, currency, date }
  notifications: [],   // { id, userId, type, message, read, createdAt, meta }
  baseCurrency: 'USD',
};

// Exchange rates relative to USD (simplified static rates)
const EXCHANGE_RATES = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  INR: 83.2,
  CAD: 1.36,
  AUD: 1.54,
  JPY: 149.5,
  CHF: 0.88,
  CNY: 7.24,
  SGD: 1.35,
  MXN: 17.1,
  BRL: 4.97,
  KRW: 1323,
  SEK: 10.4,
  NOK: 10.6,
};

const CURRENCIES = {
  USD: { symbol: '$', name: 'US Dollar', flag: '🇺🇸' },
  EUR: { symbol: '€', name: 'Euro', flag: '🇪🇺' },
  GBP: { symbol: '£', name: 'British Pound', flag: '🇬🇧' },
  INR: { symbol: '₹', name: 'Indian Rupee', flag: '🇮🇳' },
  CAD: { symbol: 'C$', name: 'Canadian Dollar', flag: '🇨🇦' },
  AUD: { symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺' },
  JPY: { symbol: '¥', name: 'Japanese Yen', flag: '🇯🇵' },
  CHF: { symbol: 'Fr', name: 'Swiss Franc', flag: '🇨🇭' },
  CNY: { symbol: '¥', name: 'Chinese Yuan', flag: '🇨🇳' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar', flag: '🇸🇬' },
  MXN: { symbol: '$', name: 'Mexican Peso', flag: '🇲🇽' },
  BRL: { symbol: 'R$', name: 'Brazilian Real', flag: '🇧🇷' },
  KRW: { symbol: '₩', name: 'South Korean Won', flag: '🇰🇷' },
  SEK: { symbol: 'kr', name: 'Swedish Krona', flag: '🇸🇪' },
  NOK: { symbol: 'kr', name: 'Norwegian Krone', flag: '🇳🇴' },
};

const EXPENSE_CATEGORIES = [
  { id: 'food', label: 'Food & Drink', icon: '🍽️', color: '#FF6B6B' },
  { id: 'transport', label: 'Transport', icon: '🚗', color: '#4ECDC4' },
  { id: 'accommodation', label: 'Accommodation', icon: '🏠', color: '#45B7D1' },
  { id: 'entertainment', label: 'Entertainment', icon: '🎬', color: '#96CEB4' },
  { id: 'shopping', label: 'Shopping', icon: '🛍️', color: '#FFEAA7' },
  { id: 'utilities', label: 'Utilities', icon: '⚡', color: '#DDA0DD' },
  { id: 'healthcare', label: 'Healthcare', icon: '🏥', color: '#98D8C8' },
  { id: 'travel', label: 'Travel', icon: '✈️', color: '#F7DC6F' },
  { id: 'groceries', label: 'Groceries', icon: '🛒', color: '#A8E6CF' },
  { id: 'other', label: 'Other', icon: '📦', color: '#B0B0B0' },
];

const GROUP_ICONS = ['🏠', '✈️', '🏖️', '🎓', '💼', '🎉', '🚗', '⛺', '🍕', '👫', '🏋️', '🎮'];
const GROUP_COLORS = ['#5bc5a7', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16'];
const AVATAR_COLORS = ['#5bc5a7', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#14b8a6'];

// ===== STORE CLASS =====
class Store {
  constructor() {
    this._data = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...DEFAULT_DATA, ...JSON.parse(raw) };
    } catch (e) {}
    return { ...DEFAULT_DATA };
  }

  _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
  }

  get data() { return this._data; }

  // ===== AUTH =====
  register(name, email, password) {
    const existing = this._data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existing) throw new Error('Email already registered');
    const id = 'u_' + Date.now();
    const colorIdx = this._data.users.length % AVATAR_COLORS.length;
    const user = { id, name, email, password, color: AVATAR_COLORS[colorIdx], createdAt: new Date().toISOString() };
    this._data.users.push(user);
    this._data.currentUserId = id;
    this._save();
    return user;
  }

  login(email, password) {
    const user = this._data.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!user) throw new Error('Invalid email or password');
    this._data.currentUserId = user.id;
    this._save();
    return user;
  }

  logout() {
    this._data.currentUserId = null;
    this._save();
  }

  get currentUser() {
    return this._data.users.find(u => u.id === this._data.currentUserId) || null;
  }

  getUser(id) { return this._data.users.find(u => u.id === id); }

  updateUser(id, updates) {
    const idx = this._data.users.findIndex(u => u.id === id);
    if (idx === -1) throw new Error('User not found');
    this._data.users[idx] = { ...this._data.users[idx], ...updates };
    this._save();
    return this._data.users[idx];
  }

  // ===== GROUPS =====
  createGroup(name, icon, color, memberEmails) {
    const me = this.currentUser;
    if (!me) throw new Error('Not logged in');
    // Resolve member IDs from emails
    const memberIds = [me.id];
    const notFound = [];
    for (const email of memberEmails) {
      if (!email.trim()) continue;
      const u = this._data.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
      if (!u) { notFound.push(email); continue; }
      if (!memberIds.includes(u.id)) memberIds.push(u.id);
    }
    const id = 'g_' + Date.now();
    const group = { id, name, icon, color, createdBy: me.id, members: memberIds, createdAt: new Date().toISOString() };
    this._data.groups.push(group);
    // Notify members
    memberIds.filter(mid => mid !== me.id).forEach(mid => {
      this.addNotification(mid, 'group_added', `${me.name} added you to the group "${name}"`, { groupId: id });
    });
    this._save();
    return { group, notFound };
  }

  getGroup(id) { return this._data.groups.find(g => g.id === id); }

  getUserGroups() {
    const me = this.currentUser;
    if (!me) return [];
    return this._data.groups.filter(g => g.members.includes(me.id));
  }

  updateGroup(id, updates) {
    const idx = this._data.groups.findIndex(g => g.id === id);
    if (idx === -1) throw new Error('Group not found');
    this._data.groups[idx] = { ...this._data.groups[idx], ...updates };
    this._save();
    return this._data.groups[idx];
  }

  deleteGroup(id) {
    this._data.groups = this._data.groups.filter(g => g.id !== id);
    // Clean up expenses and settlements
    this._data.expenses = this._data.expenses.filter(e => e.groupId !== id);
    this._data.settlements = this._data.settlements.filter(s => s.groupId !== id);
    this._save();
  }

  addGroupMember(groupId, email) {
    const group = this.getGroup(groupId);
    if (!group) throw new Error('Group not found');
    const user = this._data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) throw new Error('User not found with that email');
    if (group.members.includes(user.id)) throw new Error('User is already a member');
    group.members.push(user.id);
    this.addNotification(user.id, 'group_added', `You were added to the group "${group.name}"`, { groupId });
    this._save();
    return user;
  }

  removeGroupMember(groupId, userId) {
    const group = this.getGroup(groupId);
    if (!group) throw new Error('Group not found');
    if (group.createdBy === userId) throw new Error('Cannot remove group creator');
    group.members = group.members.filter(id => id !== userId);
    this._save();
  }

  // ===== EXPENSES =====
  addExpense(groupId, description, amount, currency, paidBy, splitType, customSplits, category, date) {
    const me = this.currentUser;
    const group = this.getGroup(groupId);
    if (!group) throw new Error('Group not found');
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) throw new Error('Invalid amount');

    // Build splits
    let splits = {};
    if (splitType === 'equal') {
      const share = amt / group.members.length;
      group.members.forEach(mid => { splits[mid] = parseFloat(share.toFixed(2)); });
      // Fix rounding
      const total = Object.values(splits).reduce((a, b) => a + b, 0);
      const diff = parseFloat((amt - total).toFixed(2));
      if (diff !== 0) splits[paidBy] = parseFloat((splits[paidBy] + diff).toFixed(2));
    } else if (splitType === 'percentage') {
      let totalPct = 0;
      group.members.forEach(mid => { totalPct += parseFloat(customSplits[mid] || 0); });
      if (Math.abs(totalPct - 100) > 0.01) throw new Error('Percentages must add up to 100%');
      group.members.forEach(mid => {
        splits[mid] = parseFloat(((parseFloat(customSplits[mid] || 0) / 100) * amt).toFixed(2));
      });
    } else { // exact
      let totalExact = 0;
      group.members.forEach(mid => { totalExact += parseFloat(customSplits[mid] || 0); });
      if (Math.abs(totalExact - amt) > 0.01) throw new Error(`Amounts must add up to ${formatAmount(amt, currency)}`);
      group.members.forEach(mid => { splits[mid] = parseFloat(parseFloat(customSplits[mid] || 0).toFixed(2)); });
    }

    const id = 'e_' + Date.now();
    const expense = {
      id, groupId, description, amount: amt, currency: currency || 'USD',
      paidBy, splits, category: category || 'other',
      date: date || new Date().toISOString().split('T')[0],
      createdBy: me.id, createdAt: new Date().toISOString(),
    };
    this._data.expenses.push(expense);

    // Notify members (except payer)
    group.members.filter(mid => mid !== paidBy).forEach(mid => {
      const share = splits[mid] || 0;
      if (share > 0) {
        const payer = this.getUser(paidBy);
        this.addNotification(mid, 'expense_added',
          `${payer ? payer.name : 'Someone'} paid for "${description}" — you owe ${formatAmount(share, currency)}`,
          { groupId, expenseId: id });
      }
    });
    this._save();
    return expense;
  }

  getGroupExpenses(groupId) {
    return this._data.expenses.filter(e => e.groupId === groupId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  deleteExpense(id) {
    this._data.expenses = this._data.expenses.filter(e => e.id !== id);
    this._save();
  }

  // ===== SETTLEMENTS =====
  addSettlement(groupId, from, to, amount, currency) {
    const me = this.currentUser;
    const group = this.getGroup(groupId);
    const fromUser = this.getUser(from);
    const toUser = this.getUser(to);
    const id = 's_' + Date.now();
    const settlement = { id, groupId, from, to, amount: parseFloat(amount), currency, createdBy: me.id, date: new Date().toISOString().split('T')[0], createdAt: new Date().toISOString() };
    this._data.settlements.push(settlement);
    // Notify
    if (to !== me.id) {
      this.addNotification(to, 'settled', `${fromUser ? fromUser.name : 'Someone'} paid you ${formatAmount(amount, currency)}`, { groupId, settlementId: id });
    }
    if (from !== me.id) {
      this.addNotification(from, 'settled', `Your payment of ${formatAmount(amount, currency)} to ${toUser ? toUser.name : 'Someone'} was recorded`, { groupId, settlementId: id });
    }
    this._save();
    return settlement;
  }

  getGroupSettlements(groupId) {
    return this._data.settlements.filter(s => s.groupId === groupId);
  }

  // ===== BALANCE CALCULATIONS =====
  getGroupBalances(groupId) {
    const group = this.getGroup(groupId);
    if (!group) return {};
    const expenses = this.getGroupExpenses(groupId);
    const settlements = this.getGroupSettlements(groupId);

    // Net balance for each member (positive = owed money, negative = owes money)
    const net = {};
    group.members.forEach(mid => { net[mid] = 0; });

    expenses.forEach(e => {
      const rateFrom = EXCHANGE_RATES[e.currency] || 1;
      const rateBase = EXCHANGE_RATES['USD'];
      const toUSD = (amt) => (amt / rateFrom); // simplified: use USD as base
      // paidBy gets credit for what others owe
      group.members.forEach(mid => {
        if (mid === e.paidBy) {
          // They paid, so they "lent" everyone else's share
          const othersShare = Object.entries(e.splits)
            .filter(([k]) => k !== e.paidBy)
            .reduce((s, [, v]) => s + v, 0);
          net[mid] = (net[mid] || 0) + toUSD(othersShare);
        } else {
          // They owe their share
          net[mid] = (net[mid] || 0) - toUSD(e.splits[mid] || 0);
        }
      });
    });

    settlements.forEach(s => {
      const rateFrom = EXCHANGE_RATES[s.currency] || 1;
      const toUSD = (amt) => amt / rateFrom;
      net[s.from] = (net[s.from] || 0) + toUSD(s.amount);
      net[s.to] = (net[s.to] || 0) - toUSD(s.amount);
    });

    return net;
  }

  // Debt simplification: minimize transactions
  getSimplifiedDebts(groupId) {
    const net = this.getGroupBalances(groupId);
    const creditors = []; // people owed money (net > 0)
    const debtors = [];   // people who owe money (net < 0)

    Object.entries(net).forEach(([id, amount]) => {
      if (amount > 0.01) creditors.push({ id, amount });
      else if (amount < -0.01) debtors.push({ id, amount: -amount });
    });

    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    const transactions = [];
    let ci = 0, di = 0;

    while (ci < creditors.length && di < debtors.length) {
      const credit = creditors[ci];
      const debt = debtors[di];
      const amount = Math.min(credit.amount, debt.amount);
      if (amount > 0.01) {
        transactions.push({ from: debt.id, to: credit.id, amount: parseFloat(amount.toFixed(2)) });
      }
      credit.amount -= amount;
      debt.amount -= amount;
      if (credit.amount < 0.01) ci++;
      if (debt.amount < 0.01) di++;
    }
    return transactions;
  }

  getUserBalance(userId, groupId) {
    const net = this.getGroupBalances(groupId);
    return net[userId] || 0;
  }

  // Overall balance across all groups
  getOverallBalances() {
    const me = this.currentUser;
    if (!me) return { totalOwed: 0, totalOwe: 0, net: 0 };
    const groups = this.getUserGroups();
    let totalOwed = 0, totalOwe = 0;
    groups.forEach(g => {
      const bal = this.getUserBalance(me.id, g.id);
      if (bal > 0.01) totalOwed += bal;
      else if (bal < -0.01) totalOwe += Math.abs(bal);
    });
    return { totalOwed: parseFloat(totalOwed.toFixed(2)), totalOwe: parseFloat(totalOwe.toFixed(2)), net: parseFloat((totalOwed - totalOwe).toFixed(2)) };
  }

  // ===== NOTIFICATIONS =====
  addNotification(userId, type, message, meta = {}) {
    const id = 'n_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    this._data.notifications.push({ id, userId, type, message, read: false, createdAt: new Date().toISOString(), meta });
  }

  getUserNotifications() {
    const me = this.currentUser;
    if (!me) return [];
    return this._data.notifications.filter(n => n.userId === me.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getUnreadCount() {
    return this.getUserNotifications().filter(n => !n.read).length;
  }

  markNotificationsRead() {
    const me = this.currentUser;
    if (!me) return;
    this._data.notifications.forEach(n => { if (n.userId === me.id) n.read = true; });
    this._save();
  }

  markNotificationRead(id) {
    const n = this._data.notifications.find(n => n.id === id);
    if (n) { n.read = true; this._save(); }
  }

  // ===== RECENT ACTIVITY =====
  getRecentActivity(groupId, limit = 20) {
    const expenses = this.getGroupExpenses(groupId).map(e => ({ ...e, _type: 'expense' }));
    const settlements = this.getGroupSettlements(groupId).map(s => ({ ...s, _type: 'settlement' }));
    return [...expenses, ...settlements]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }
}

// ===== HELPERS =====
function formatAmount(amount, currency = 'USD') {
  const c = CURRENCIES[currency] || CURRENCIES['USD'];
  const num = parseFloat(amount);
  if (currency === 'JPY' || currency === 'KRW') return c.symbol + Math.round(num).toLocaleString();
  return c.symbol + num.toFixed(2);
}

function formatAmountUSD(amount) {
  return '$' + parseFloat(amount).toFixed(2);
}

function convertToUSD(amount, currency) {
  const rate = EXCHANGE_RATES[currency] || 1;
  return amount / rate;
}

function convertFromUSD(amount, currency) {
  const rate = EXCHANGE_RATES[currency] || 1;
  return amount * rate;
}

function timeAgo(dateStr) {
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getCategoryInfo(id) {
  return EXPENSE_CATEGORIES.find(c => c.id === id) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}

function uid() {
  return '_' + Math.random().toString(36).slice(2, 11);
}

// Export globals
window.store = new Store();
window.CURRENCIES = CURRENCIES;
window.EXCHANGE_RATES = EXCHANGE_RATES;
window.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;
window.GROUP_ICONS = GROUP_ICONS;
window.GROUP_COLORS = GROUP_COLORS;
window.AVATAR_COLORS = AVATAR_COLORS;
window.formatAmount = formatAmount;
window.formatAmountUSD = formatAmountUSD;
window.convertToUSD = convertToUSD;
window.timeAgo = timeAgo;
window.formatDate = formatDate;
window.getInitials = getInitials;
window.getCategoryInfo = getCategoryInfo;
window.uid = uid;
