// ─────────────────────────────────────────────
// Message Service
// Telegram message sending helpers
// ─────────────────────────────────────────────
const logger = require('../utils/logger');
const config = require('../config');
const userService = require('./userService');

/**
 * Safely send a message to a user by Telegram ID
 * @param {object} bot - Telegraf bot instance
 * @param {number} telegramId
 * @param {string} text
 * @param {object} [extra] - extra options (parse_mode, reply_markup, etc.)
 * @returns {Promise<object|null>} sent message or null
 */
async function sendToUser(bot, telegramId, text, extra = {}) {
  try {
    return await bot.telegram.sendMessage(telegramId, text, {
      parse_mode: 'HTML',
      ...extra,
    });
  } catch (err) {
    logger.error(`Failed to send message to ${telegramId}: ${err.message}`);
    return null;
  }
}

/**
 * Notify buyer about an event
 * @param {object} bot
 * @param {string} buyerId - internal user ID
 * @param {string} text
 * @param {object} [extra]
 */
async function notifyBuyer(bot, buyerId, text, extra = {}) {
  const user = userService.getUserById(buyerId);
  if (!user) return null;
  return sendToUser(bot, user.telegramId, text, extra);
}

/**
 * Notify seller about an event
 * @param {object} bot
 * @param {string} sellerId - internal user ID
 * @param {string} text
 * @param {object} [extra]
 */
async function notifySeller(bot, sellerId, text, extra = {}) {
  const user = userService.getUserById(sellerId);
  if (!user) return null;
  return sendToUser(bot, user.telegramId, text, extra);
}

/**
 * Notify all admins
 * @param {object} bot
 * @param {string} text
 * @param {object} [extra]
 */
async function notifyAdmins(bot, text, extra = {}) {
  const results = [];
  for (const adminTelegramId of config.ADMIN_IDS) {
    const result = await sendToUser(bot, adminTelegramId, text, extra);
    results.push(result);
  }
  return results;
}

/**
 * Notify the handler of a ticket (seller or admin)
 * @param {object} bot
 * @param {object} ticket
 * @param {string} text
 * @param {object} [extra]
 * @returns {Promise<object|null>}
 */
async function notifyTicketHandler(bot, ticket, text, extra = {}) {
  // If ticket has a seller, notify seller
  if (ticket.sellerId) {
    const result = await notifySeller(bot, ticket.sellerId, text, extra);
    if (result) return result;
  }

  // If ticket has assigned admin, notify them
  if (ticket.assignedAdminId) {
    const result = await notifySeller(bot, ticket.assignedAdminId, text, extra);
    if (result) return result;
  }

  // Otherwise notify all admins
  const results = await notifyAdmins(bot, text, extra);
  return results.find((r) => r !== null) || null;
}

module.exports = {
  sendToUser,
  notifyBuyer,
  notifySeller,
  notifyAdmins,
  notifyTicketHandler,
};
