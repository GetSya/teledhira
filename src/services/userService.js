// ─────────────────────────────────────────────
// User Service
// ─────────────────────────────────────────────
const database = require('../database');
const { generateId } = require('../utils/id');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Register or get user from Telegram context
 * Auto-registers on first interaction
 * @param {object} telegramUser - ctx.from
 * @returns {Promise<object>} user record
 */
async function registerUser(telegramUser) {
  if (!telegramUser || !telegramUser.id) return null;

  // Check if user already exists
  let user = database.findOne('users', { telegramId: telegramUser.id });
  if (user) {
    // Update username/firstName if changed
    if (user.username !== telegramUser.username || user.firstName !== telegramUser.first_name) {
      user = await database.update('users', { telegramId: telegramUser.id }, {
        username: telegramUser.username || '',
        firstName: telegramUser.first_name || '',
      });
    }
    return user;
  }

  // Determine role
  let role = 'buyer';
  if (config.ADMIN_IDS.includes(telegramUser.id)) {
    role = 'admin';
  }

  // Create new user
  const newUser = await database.insert('users', (db) => ({
    id: generateId(db, 'USR'),
    telegramId: telegramUser.id,
    username: telegramUser.username || '',
    firstName: telegramUser.first_name || '',
    role,
    balance: 0,
    status: 'active',
    createdAt: new Date().toISOString(),
  }));

  logger.info(`New user registered: ${newUser.id} (${telegramUser.id}) role=${role}`);
  return newUser;
}

/**
 * Find user by Telegram ID
 * @param {number} telegramId
 * @returns {object|null}
 */
function findByTelegramId(telegramId) {
  return database.findOne('users', { telegramId });
}

/**
 * Get user by internal ID
 * @param {string} id
 * @returns {object|null}
 */
function getUserById(id) {
  return database.findById('users', id);
}

/**
 * Get all users
 * @returns {Array}
 */
function getAllUsers() {
  return database.find('users');
}

/**
 * Update user role
 * @param {string} userId - internal user ID
 * @param {string} newRole - buyer, seller, admin
 * @returns {Promise<object|null>}
 */
async function updateRole(userId, newRole) {
  const validRoles = ['buyer', 'seller', 'admin'];
  if (!validRoles.includes(newRole)) return null;

  const updated = await database.update('users', { id: userId }, { role: newRole });
  if (updated) {
    logger.info(`User ${userId} role changed to ${newRole}`);
  }
  return updated;
}

/**
 * Get all sellers
 * @returns {Array}
 */
function getAllSellers() {
  return database.find('users', { role: 'seller' });
}

/**
 * Check if a telegramId is admin
 * Checks both ADMIN_IDS from .env AND role in database
 * @param {number} telegramId
 * @returns {boolean}
 */
function isAdmin(telegramId) {
  if (config.ADMIN_IDS.includes(telegramId)) return true;
  const user = findByTelegramId(telegramId);
  return user && user.role === 'admin';
}

/**
 * Check if a telegramId is seller
 * @param {number} telegramId
 * @returns {boolean}
 */
function isSeller(telegramId) {
  const user = findByTelegramId(telegramId);
  return user && (user.role === 'seller' || user.role === 'admin');
}

/**
 * Get all admins
 * @returns {Array}
 */
function getAllAdmins() {
  return database.find('users', { role: 'admin' });
}

/**
 * Promote user to admin
 * @param {number} telegramId
 * @returns {Promise<object|null>}
 */
async function setAdmin(telegramId) {
  const user = findByTelegramId(telegramId);
  if (!user) return null;
  return await updateRole(user.id, 'admin');
}

/**
 * Demote admin to buyer
 * @param {number} telegramId
 * @returns {Promise<object|null>}
 */
async function removeAdmin(telegramId) {
  const user = findByTelegramId(telegramId);
  if (!user) return null;
  return await updateRole(user.id, 'buyer');
}

module.exports = {
  registerUser,
  findByTelegramId,
  getUserById,
  getAllUsers,
  updateRole,
  getAllSellers,
  getAllAdmins,
  isAdmin,
  isSeller,
  setAdmin,
  removeAdmin,
};

