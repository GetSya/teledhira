// ─────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────
require('dotenv').config();
const logger = require('./utils/logger');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  logger.error('BOT_TOKEN tidak ditemukan di file .env!');
  process.exit(1);
}

const ADMIN_IDS_RAW = process.env.ADMIN_IDS || '';
const ADMIN_IDS = ADMIN_IDS_RAW
  .split(',')
  .map((id) => id.trim())
  .filter((id) => id.length > 0)
  .map(Number)
  .filter((id) => !isNaN(id));

if (ADMIN_IDS.length === 0) {
  logger.warn('ADMIN_IDS tidak ditemukan atau kosong di .env. Admin panel tidak akan tersedia.');
}

const config = {
  BOT_TOKEN,
  ADMIN_IDS,
  ITEMS_PER_PAGE: 10, // 2x5 Grid layout (10 items per page)
  DB_PATH: require('path').join(__dirname, '..', 'db.json'),
};

module.exports = config;
