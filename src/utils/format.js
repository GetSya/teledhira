// ─────────────────────────────────────────────
// Formatting Utilities
// ─────────────────────────────────────────────

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/**
 * Format number as IDR currency
 * @param {number} amount
 * @returns {string} e.g. "Rp50.000"
 */
function formatCurrency(amount) {
  const num = Math.abs(Number(amount) || 0);
  const formatted = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp${formatted}`;
}

/**
 * Format ISO date string to Indonesian date
 * @param {string} isoString
 * @returns {string} e.g. "21 Agustus 2026"
 */
function formatDate(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Format ISO date string to Indonesian date + time
 * @param {string} isoString
 * @returns {string} e.g. "21 Agustus 2026, 14:30"
 */
function formatDateTime(isoString) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}, ${time}`;
}

/**
 * Format order status with emoji
 * @param {string} status
 * @returns {string}
 */
function formatOrderStatus(status) {
  const map = {
    pending: '🟡 Pending',
    waiting_payment: '⏳ Menunggu Pembayaran',
    payment_review: '🔍 Verifikasi Pembayaran',
    paid: '✅ Dibayar',
    processing: '🔄 Diproses',
    completed: '✅ Selesai',
    cancelled: '❌ Dibatalkan',
    refunded: '💸 Refunded',
  };
  return map[status] || status;
}

/**
 * Format ticket status with emoji
 * @param {string} status
 * @returns {string}
 */
function formatTicketStatus(status) {
  const map = {
    open: '🟢 Open',
    waiting: '🟡 Waiting',
    processing: '🔄 Processing',
    closed: '🔴 Closed',
  };
  return map[status] || status;
}

/**
 * Format product status with emoji
 * @param {string} status
 * @returns {string}
 */
function formatProductStatus(status) {
  const map = {
    active: '✅ Active',
    inactive: '⛔ Inactive',
    out_of_stock: '❌ Habis',
  };
  return map[status] || status;
}

/**
 * Escape HTML special characters for Telegram HTML parse mode
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Truncate text to max length
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(text, maxLen = 50) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 3) + '...';
}

/**
 * Format number with dot separators without Rp prefix (e.g. 10.000)
 * @param {number} amount
 * @returns {string}
 */
function formatNumberCurrency(amount) {
  const num = Math.abs(Number(amount) || 0);
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Get current time string formatted as HH:mm:ss WIB
 * @returns {string} e.g. "21:23:32 WIB"
 */
function getWibTimestamp() {
  const d = new Date();
  // Adjust for WIB (UTC+7)
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const wibDate = new Date(utc + 7 * 3600000);
  const h = String(wibDate.getHours()).padStart(2, '0');
  const m = String(wibDate.getMinutes()).padStart(2, '0');
  const s = String(wibDate.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s} WIB`;
}

module.exports = {
  formatCurrency,
  formatNumberCurrency,
  getWibTimestamp,
  formatDate,
  formatDateTime,
  formatOrderStatus,
  formatTicketStatus,
  formatProductStatus,
  escapeHtml,
  truncate,
};

