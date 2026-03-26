// ===== CONSTANTS & PURE HELPERS =====
// Extracted from store.js for use without the data store

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

function formatAmount(amount, currency) {
  currency = currency || 'USD';
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
  return parseFloat(amount) / rate;
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
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getCategoryInfo(id) {
  return EXPENSE_CATEGORIES.find(c => c.id === id) || EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];
}

function uid() {
  return '_' + Math.random().toString(36).slice(2, 11);
}

// Expose all as window globals
window.EXCHANGE_RATES = EXCHANGE_RATES;
window.CURRENCIES = CURRENCIES;
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
