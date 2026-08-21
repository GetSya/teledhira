// ─────────────────────────────────────────────
// ID Generator Utilities
// Counter-based IDs stored in db.json settings
// ─────────────────────────────────────────────

/**
 * Generate next ID for a given prefix
 * Uses counters stored in db settings
 * @param {object} db - database object (will be mutated)
 * @param {string} prefix - e.g. "USR", "PRD", "ORD", "TKT", "MSG", "CAT"
 * @param {number} [startFrom] - starting counter value
 * @returns {string} e.g. "USR-10001"
 */
function generateId(db, prefix, startFrom = 10001) {
  if (!db.settings) db.settings = {};
  if (!db.settings.counters) db.settings.counters = {};

  const counterKey = `${prefix.toLowerCase()}Counter`;

  if (!db.settings.counters[counterKey]) {
    db.settings.counters[counterKey] = startFrom;
  }

  const id = `${prefix}-${db.settings.counters[counterKey]}`;
  db.settings.counters[counterKey]++;

  return id;
}

/**
 * Generate support ticket ID
 * @param {object} db
 * @returns {string} e.g. "TKT-SUP-10001"
 */
function generateSupportTicketId(db) {
  if (!db.settings) db.settings = {};
  if (!db.settings.counters) db.settings.counters = {};

  const counterKey = 'tktSupCounter';

  if (!db.settings.counters[counterKey]) {
    db.settings.counters[counterKey] = 10001;
  }

  const id = `TKT-SUP-${db.settings.counters[counterKey]}`;
  db.settings.counters[counterKey]++;

  return id;
}

module.exports = { generateId, generateSupportTicketId };
