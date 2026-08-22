// ─────────────────────────────────────────────
// Support Handler
// Support ticket creation
// ─────────────────────────────────────────────
const { Markup } = require('telegraf');
const ticketService = require('../services/ticketService');
const userService = require('../services/userService');
const messageService = require('../services/messageService');
const { escapeHtml } = require('../utils/format');
const { navRow, safeEditOrReply } = require('../utils/keyboard');
const { setActiveTicket } = require('./ticket');
const logger = require('../utils/logger');

const SUPPORT_CATEGORIES = [
  { id: 'payment', label: '💳 Pembayaran', emoji: '💳' },
  { id: 'order', label: '📦 Order', emoji: '📦' },
  { id: 'product', label: '🛍 Produk', emoji: '🛍' },
  { id: 'account', label: '👤 Akun', emoji: '👤' },
  { id: 'other', label: '📋 Lainnya', emoji: '📋' },
];

/**
 * Show support menu
 */
async function showSupportMenu(ctx) {
  const text =
    `📞 <b>BANTUAN & SUPPORT</b>\n\n` +
    `Pilih kategori bantuan:`;

  const buttons = SUPPORT_CATEGORIES.map((cat) => [
    Markup.button.callback(cat.label, `support_cat_${cat.id}`),
  ]);

  buttons.push(navRow('menu_main'));

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

/**
 * Create support ticket
 */
async function createSupportTicket(ctx, category) {
  const user = userService.findByTelegramId(ctx.from.id);
  if (!user) return;

  const catInfo = SUPPORT_CATEGORIES.find((c) => c.id === category);
  const catLabel = catInfo ? catInfo.label : category;

  try {
    const ticket = await ticketService.createSupportTicket({
      buyerId: user.id,
      category,
    });

    const text =
      `🎫 <b>TICKET SUPPORT DIBUAT</b>\n\n` +
      `<b>Ticket:</b> #${ticket.id}\n` +
      `<b>Kategori:</b> ${catLabel}\n\n` +
      `⏳ <i>Tiket telah dikirim ke Admin/Owner. Sesi chat akan dimulai setelah Admin membuka percakapan.</i>`;

    const buttons = [
      [Markup.button.callback('❌ Tutup Ticket', `ticket_close_${ticket.id}`)],
      [Markup.button.callback('🏠 Menu Utama', 'menu_main')],
    ];

    await safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });

    const notifText =
      `🔔 <b>TICKET SUPPORT BARU!</b>\n\n` +
      `<b>Ticket:</b> #${ticket.id}\n` +
      `<b>Kategori:</b> ${catLabel}\n` +
      `<b>User:</b> ${escapeHtml(user.firstName || user.username)}\n\n` +
      `Pilih tindakan:`;

    const notifButtons = [
      [
        Markup.button.callback('👁️ Paham', `ticket_ack_${ticket.id}`),
        Markup.button.callback('💬 Mulai Chat', `ticket_start_chat_${ticket.id}`),
      ],
    ];

    await messageService.notifyAdmins({ telegram: ctx.telegram }, notifText, {
      reply_markup: { inline_keyboard: notifButtons },
    });

    logger.info(`Support ticket ${ticket.id} created by ${user.id}`);
  } catch (err) {
    logger.error(`Create support ticket error: ${err.message}`);
    await ctx.answerCbQuery('Terjadi kesalahan.');
  }
}

function register(bot) {
  bot.action('menu_support', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showSupportMenu(ctx);
  });

  bot.action(/^support_cat_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const category = ctx.match[1];
    await createSupportTicket(ctx, category);
  });
}

module.exports = { register };
