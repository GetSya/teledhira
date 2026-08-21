// ─────────────────────────────────────────────
// Donation Service
// Dynamic QRIS generation & Donation management
// ─────────────────────────────────────────────
const fetch = require('node-fetch');
const database = require('../database');
const { generateId } = require('../utils/id');
const logger = require('../utils/logger');

const API_URL = 'https://api-mininxd.vercel.app/qris';
const DEFAULT_QRIS_CODE = '00020101021126570011ID.DANA.WWW011893600915390930088102099093008810303UMI51440014ID.CO.QRIS.WWW0215ID10254040171760303UMI5204737253033605802ID5910Jojo Store6010Kota Bogor61051634163046B01';

/**
 * Get current configured QRIS payload string
 * @returns {string}
 */
function getQrisCode() {
  const db = database.get();
  return (db.settings && db.settings.qrisCode) || DEFAULT_QRIS_CODE;
}

/**
 * Update configured QRIS payload string
 * @param {string} newQrisCode
 * @returns {Promise<object>}
 */
async function setQrisCode(newQrisCode) {
  const trimmed = (newQrisCode || '').trim();
  if (!trimmed) {
    throw new Error('QRIS code string tidak boleh kosong.');
  }

  await database.mutate((db) => {
    if (!db.settings) db.settings = {};
    db.settings.qrisCode = trimmed;
  });

  logger.info('QRIS code updated successfully.');
  return { qrisCode: trimmed };
}

/**
 * Fetch dynamic QRIS PNG buffer for given nominal
 * @param {number} nominal
 * @returns {Promise<Buffer>}
 */
async function generateQrisImage(nominal) {
  const qris = getQrisCode();
  const url = `${API_URL}?qris=${encodeURIComponent(qris)}&nominal=${nominal}&type=images`;

  logger.info(`Generating QRIS image for nominal: ${nominal}...`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
  });

  if (!response.ok) {
    throw new Error(`Gagal mengambil QRIS dari API (Status ${response.status})`);
  }

  const buffer = await response.buffer();
  return buffer;
}

/**
 * Fetch QRIS metadata JSON (merchant, updated QR payload string, price)
 * @param {number} nominal
 * @returns {Promise<object>}
 */
async function getQrisMetadata(nominal) {
  const qris = getQrisCode();
  const url = `${API_URL}?qris=${encodeURIComponent(qris)}&nominal=${nominal}`;

  try {
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      return data;
    }
  } catch (err) {
    logger.warn('Failed to fetch QRIS metadata JSON:', err.message);
  }

  return { merchant: 'Toko Marketplace', harga: nominal };
}

/**
 * Create a new donation record
 * @param {object} param0 { telegramId, username, name, nominal }
 * @returns {Promise<object>}
 */
async function createDonationRecord({ telegramId, username, name, nominal }) {
  const donation = await database.insert('donations', (db) => ({
    id: generateId(db, 'DON'),
    telegramId,
    username: username || null,
    name: name || 'Anonim',
    nominal: Number(nominal),
    status: 'completed', // Recorded donation
    createdAt: new Date().toISOString(),
  }));

  logger.info(`Donation recorded: ${donation.id} - ${donation.name} - Rp ${donation.nominal}`);
  return donation;
}

/**
 * Get all donations made by a user
 * @param {number} telegramId
 * @returns {Array}
 */
function getUserDonations(telegramId) {
  const donations = database.find('donations', { telegramId });
  return donations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Get all recorded donations
 * @returns {Array}
 */
function getAllDonations() {
  const donations = database.find('donations');
  return donations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = {
  getQrisCode,
  setQrisCode,
  generateQrisImage,
  getQrisMetadata,
  createDonationRecord,
  getUserDonations,
  getAllDonations,
};
