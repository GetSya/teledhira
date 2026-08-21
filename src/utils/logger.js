// ─────────────────────────────────────────────
// Simple Logger
// ─────────────────────────────────────────────

function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

const logger = {
  info(...args) {
    console.log(`[${timestamp()}] [INFO]`, ...args);
  },
  warn(...args) {
    console.warn(`[${timestamp()}] [WARN]`, ...args);
  },
  error(...args) {
    console.error(`[${timestamp()}] [ERROR]`, ...args);
  },
};

module.exports = logger;
