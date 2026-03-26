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

/**
 * Convert an amount in a given currency to USD.
 */
function toUSD(amount, currency) {
  const rate = EXCHANGE_RATES[currency] || 1;
  return parseFloat(amount) / rate;
}

/**
 * Calculate net balances for all members across expenses and settlements.
 *
 * @param {string[]} memberIds - array of user IDs
 * @param {Array} expenses - each has { id, paidBy, splits: {userId: amount}, currency }
 * @param {Array} settlements - each has { fromUser, toUser, amount, currency }
 * @returns {Object} net - { userId: usdAmount } positive = owed money, negative = owes money
 */
function calculateBalances(memberIds, expenses, settlements) {
  const net = {};
  memberIds.forEach(id => { net[id] = 0; });

  expenses.forEach(e => {
    const splits = e.splits || {};
    const paidBy = e.paidBy;
    const currency = e.currency || 'USD';

    // Credit the payer for what others owe them
    Object.entries(splits).forEach(([userId, shareAmount]) => {
      if (userId === paidBy) return; // skip payer's own share
      const usdShare = toUSD(shareAmount, currency);
      if (net[paidBy] !== undefined) net[paidBy] += usdShare;
      if (net[userId] !== undefined) net[userId] -= usdShare;
    });
  });

  settlements.forEach(s => {
    const usdAmount = toUSD(s.amount, s.currency || 'USD');
    if (net[s.fromUser] !== undefined) net[s.fromUser] += usdAmount;
    if (net[s.toUser] !== undefined) net[s.toUser] -= usdAmount;
  });

  // Round to 2 decimal places
  Object.keys(net).forEach(id => {
    net[id] = parseFloat(net[id].toFixed(2));
  });

  return net;
}

/**
 * Greedy debt simplification algorithm.
 * Minimizes the number of transactions needed to settle all debts.
 *
 * @param {Object} net - { userId: usdAmount }
 * @returns {Array} [{from, to, amount}]
 */
function simplifyDebts(net) {
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
      transactions.push({
        from: debt.id,
        to: credit.id,
        amount: parseFloat(amount.toFixed(2)),
      });
    }

    credit.amount -= amount;
    debt.amount -= amount;

    if (credit.amount < 0.01) ci++;
    if (debt.amount < 0.01) di++;
  }

  return transactions;
}

module.exports = { EXCHANGE_RATES, toUSD, calculateBalances, simplifyDebts };
