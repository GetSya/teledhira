// ─────────────────────────────────────────────
// Account Handler
// User profile
// ─────────────────────────────────────────────
const { Markup } = require('telegraf');
const userService = require('../services/userService');
const { escapeHtml, formatDate } = require('../utils/format');
const { navRow, safeEditOrReply } = require('../utils/keyboard');

/**
 * Show user account
 */
async function showAccount(ctx) {
  const user = userService.findByTelegramId(ctx.from.id);
  if (!user) return;

  const roleLabels = {
    buyer: '👤 Buyer',
    seller: '👨‍💼 Seller',
    admin: '⚙️ Admin',
  };

  const text =
    `👤 <b>AKUN SAYA</b>\n\n` +
    `<b>ID:</b> ${user.id}\n` +
    `<b>Nama:</b> ${escapeHtml(user.firstName || '-')}\n` +
    `<b>Username:</b> ${user.username ? '@' + escapeHtml(user.username) : '-'}\n` +
    `<b>Role:</b> ${roleLabels[user.role] || user.role}\n` +
    `<b>Status:</b> ${user.status === 'active' ? '✅ Aktif' : '⛔ Nonaktif'}\n` +
    `<b>Bergabung:</b> ${formatDate(user.createdAt)}\n`;

  const buttons = [navRow('menu_main')];

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

function register(bot) {
  bot.action('my_account', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showAccount(ctx);
  });
}

module.exports = { register };
