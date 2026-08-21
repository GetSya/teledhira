// ─────────────────────────────────────────────
// Ticket Handler
// Ticket management + direct chat relay system
// ─────────────────────────────────────────────
const { Markup } = require('telegraf');
const ticketService = require('../services/ticketService');
const orderService = require('../services/orderService');
const userService = require('../services/userService');
const messageService = require('../services/messageService');
const { formatTicketStatus, formatOrderStatus, formatCurrency, escapeHtml, formatDate } = require('../utils/format');
const { navRow, paginationRow, safeEditOrReply } = require('../utils/keyboard');
const config = require('../config');
const logger = require('../utils/logger');

// In-memory mappings
const activeTickets = new Map();
const replyMapping = new Map();

function getActiveTicket(telegramId) {
  return activeTickets.get(telegramId) || null;
}

function setActiveTicket(telegramId, ticketId) {
  activeTickets.set(telegramId, ticketId);
}

function clearActiveTicket(telegramId) {
  activeTickets.delete(telegramId);
}

/**
 * Show user's tickets list
 */
async function showMyTickets(ctx, page = 0) {
  const user = userService.findByTelegramId(ctx.from.id);
  if (!user) return;

  let tickets;
  if (user.role === 'seller') {
    tickets = ticketService.getTicketsBySeller(user.id);
  } else {
    tickets = ticketService.getTicketsByBuyer(user.id);
  }

  const perPage = config.ITEMS_PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(tickets.length / perPage));
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * perPage;
  const pageTickets = tickets.slice(start, start + perPage);

  if (tickets.length === 0) {
    const text = `🎫 <b>TICKET SAYA</b>\n\nBelum ada ticket.`;
    const buttons = [navRow('menu_main')];
    return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
  }

  let text = `🎫 <b>TICKET SAYA</b> (${tickets.length})\n\n`;

  pageTickets.forEach((t, i) => {
    const num = start + i + 1;
    text += `<b>${num}.</b> #${t.id}\n`;
    if (t.orderId) text += `    Order: #${t.orderId}\n`;
    if (t.type === 'support') text += `    📞 Support (${t.category})\n`;
    text += `    ${formatTicketStatus(t.status)}\n\n`;
  });

  const buttons = pageTickets.map((t) => {
    const label = t.status === 'closed' ? `🔴 #${t.id}` : `🟢 #${t.id}`;
    return [Markup.button.callback(label, `ticket_${t.id}`)];
  });

  if (totalPages > 1) {
    buttons.push(paginationRow('tickets_page', currentPage, totalPages));
  }

  buttons.push(navRow('menu_main'));

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

/**
 * Show ticket detail
 */
async function showTicketDetail(ctx, ticketId) {
  const user = userService.findByTelegramId(ctx.from.id);
  if (!user) return;

  const ticket = ticketService.getTicketById(ticketId);
  if (!ticket) {
    if (ctx.callbackQuery) await ctx.answerCbQuery('Ticket tidak ditemukan.');
    return;
  }

  const isAdmin = userService.isAdmin(ctx.from.id);
  if (ticket.buyerId !== user.id && ticket.sellerId !== user.id && !isAdmin) {
    if (ctx.callbackQuery) await ctx.answerCbQuery('Anda tidak memiliki akses.');
    return;
  }

  let text = `🎫 <b>TICKET #${ticket.id}</b>\n\n`;

  if (ticket.orderId) {
    const order = orderService.getOrderById(ticket.orderId);
    if (order) {
      text += `<b>Order:</b> #${order.id}\n`;
      text += `<b>Produk:</b> ${escapeHtml(order.productName)}\n`;
      text += `<b>Total:</b> ${formatCurrency(order.total)}\n`;
      text += `<b>Status Order:</b> ${formatOrderStatus(order.status)}\n\n`;
    }
  }

  if (ticket.type === 'support') {
    text += `<b>Tipe:</b> 📞 Support\n`;
    text += `<b>Kategori:</b> ${escapeHtml(ticket.category)}\n\n`;
  }

  text += `<b>Status Ticket:</b> ${formatTicketStatus(ticket.status)}\n`;
  text += `<b>Dibuat:</b> ${formatDate(ticket.createdAt)}\n`;

  if (ticket.status !== 'closed') {
    text += `\nSesi percakapan aktif. Pesan yang Anda kirim akan langsung diteruskan.`;
  }

  const buttons = [];

  if (ticket.status !== 'closed') {
    buttons.push([Markup.button.callback('💬 Sesi Chat Aktif', `ticket_open_${ticket.id}`)]);
    buttons.push([Markup.button.callback('❌ Tutup Ticket', `ticket_close_${ticket.id}`)]);
  }

  if (ticket.orderId) {
    buttons.push([Markup.button.callback('📦 Lihat Order', `order_${ticket.orderId}`)]);

    if (isAdmin || (user.role === 'seller' && ticket.sellerId === user.id)) {
      buttons.push([
        Markup.button.callback('✅ Payment Berhasil', `adm_quick_pay_${ticket.orderId}_paid`),
        Markup.button.callback('❌ Payment Gagal', `adm_quick_pay_${ticket.orderId}_cancelled`),
      ]);
    }
  }

  buttons.push(navRow('my_tickets'));

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

/**
 * Open/activate ticket for chat relay
 */
async function openTicketChat(ctx, ticketId) {
  const user = userService.findByTelegramId(ctx.from.id);
  if (!user) return;

  const ticket = ticketService.getTicketById(ticketId);
  if (!ticket) {
    await ctx.answerCbQuery('Ticket tidak ditemukan.');
    return;
  }

  if (ticket.status === 'closed') {
    await ctx.answerCbQuery('Ticket sudah ditutup.');
    return;
  }

  const isAdmin = userService.isAdmin(ctx.from.id);
  if (ticket.buyerId !== user.id && ticket.sellerId !== user.id && !isAdmin) {
    await ctx.answerCbQuery('Anda tidak memiliki akses.');
    return;
  }

  setActiveTicket(ctx.from.id, ticketId);

  const text =
    `💬 <b>SESI CHAT TICKET #${ticket.id} AKTIF</b>\n\n` +
    `Anda dapat langsung mengetik pesan di sini.\n` +
    `Pesan Anda diteruskan secara langsung tanpa header tambahan.`;

  const buttons = [
    [Markup.button.callback('❌ Tutup Ticket', `ticket_close_${ticket.id}`)],
    [Markup.button.callback('🔚 Keluar Chat', `ticket_deactivate_${ticket.id}`)],
    [Markup.button.callback('🏠 Menu Utama', 'menu_main')],
  ];

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

/**
 * Wait for ticket
 */
async function waitTicketChat(ctx, ticketId) {
  await ctx.answerCbQuery('Tiket disimpan. Anda bisa memulai sesi chat kapan saja nanti.');
  const text =
    `⏳ <b>TIKET #${ticketId} (STATUS: MENUNGGU)</b>\n\n` +
    `Anda memilih untuk menunggu terlebih dahulu.\n` +
    `Anda dapat membuka sesi chat kapan saja dengan menekan tombol di bawah.`;

  const buttons = [
    [Markup.button.callback('💬 Langsung Sesi Chat', `ticket_open_${ticketId}`)],
    [Markup.button.callback('🏠 Menu Utama', 'menu_main')],
  ];

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

/**
 * Close a ticket
 */
async function closeTicket(ctx, ticketId) {
  const user = userService.findByTelegramId(ctx.from.id);
  if (!user) return;

  const ticket = ticketService.getTicketById(ticketId);
  if (!ticket) {
    await ctx.answerCbQuery('Ticket tidak ditemukan.');
    return;
  }

  const isAdmin = userService.isAdmin(ctx.from.id);
  if (ticket.buyerId !== user.id && ticket.sellerId !== user.id && !isAdmin) {
    await ctx.answerCbQuery('Anda tidak memiliki akses.');
    return;
  }

  await ticketService.closeTicket(ticketId);
  clearActiveTicket(ctx.from.id);

  const closerRole = ticket.buyerId === user.id ? 'Buyer' : 'Seller/Admin';
  const notifText =
    `🔔 <b>TICKET DITUTUP</b>\n\n` +
    `Ticket #${ticketId} telah ditutup oleh ${closerRole}.`;

  if (ticket.buyerId === user.id) {
    await messageService.notifyTicketHandler({ telegram: ctx.telegram }, ticket, notifText);
  } else {
    await messageService.notifyBuyer({ telegram: ctx.telegram }, ticket.buyerId, notifText);
  }

  await ctx.answerCbQuery('Ticket ditutup.');
  await showTicketDetail(ctx, ticketId);
  logger.info(`Ticket ${ticketId} closed by ${user.id}`);
}

async function deactivateTicket(ctx, ticketId) {
  clearActiveTicket(ctx.from.id);
  await ctx.answerCbQuery('Keluar dari mode chat ticket.');
  await showTicketDetail(ctx, ticketId);
}

/**
 * Handle incoming message relay - Direct clean conversation without headers
 */
async function handleTicketMessage(ctx, bot) {
  const telegramId = ctx.from.id;
  const text = ctx.message.text;

  if (ctx.message.reply_to_message) {
    const replyToId = ctx.message.reply_to_message.message_id;
    const mapping = replyMapping.get(replyToId);
    if (mapping) {
      return await relayReplyMessage(ctx, bot, mapping, text);
    }
  }

  const activeTicketId = getActiveTicket(telegramId);
  if (!activeTicketId) {
    return false;
  }

  const ticket = ticketService.getTicketById(activeTicketId);
  if (!ticket || ticket.status === 'closed') {
    clearActiveTicket(telegramId);
    return false;
  }

  const user = userService.findByTelegramId(telegramId);
  if (!user) return false;

  await ticketService.addMessage({
    ticketId: activeTicketId,
    senderId: user.id,
    senderRole: user.role,
    message: text,
    messageType: 'text',
  });

  const isBuyer = ticket.buyerId === user.id;

  // Direct clean message relay (no headers/details as requested)
  const cleanMessage = escapeHtml(text);

  if (isBuyer) {
    const sentMsg = await messageService.notifyTicketHandler(
      { telegram: ctx.telegram },
      ticket,
      cleanMessage
    );

    if (sentMsg && sentMsg.message_id) {
      replyMapping.set(sentMsg.message_id, {
        ticketId: activeTicketId,
        senderUserId: user.id,
        senderTelegramId: telegramId,
        targetRole: 'buyer',
      });
    }
  } else {
    const buyerUser = userService.getUserById(ticket.buyerId);
    if (buyerUser) {
      const sentMsg = await messageService.sendToUser(
        { telegram: ctx.telegram },
        buyerUser.telegramId,
        cleanMessage
      );

      if (sentMsg && sentMsg.message_id) {
        replyMapping.set(sentMsg.message_id, {
          ticketId: activeTicketId,
          senderUserId: user.id,
          senderTelegramId: telegramId,
          targetRole: 'seller',
        });
      }
    }
  }

  logger.info(`Message relayed directly in ticket ${activeTicketId} from ${user.id}`);
  return true;
}

async function relayReplyMessage(ctx, bot, mapping, text) {
  const telegramId = ctx.from.id;
  const user = userService.findByTelegramId(telegramId);
  if (!user) return false;

  const ticket = ticketService.getTicketById(mapping.ticketId);
  if (!ticket || ticket.status === 'closed') {
    await ctx.reply('❌ Ticket sudah ditutup.', { parse_mode: 'HTML' });
    return true;
  }

  await ticketService.addMessage({
    ticketId: mapping.ticketId,
    senderId: user.id,
    senderRole: user.role,
    message: text,
    messageType: 'text',
  });

  const isBuyer = ticket.buyerId === user.id;
  const cleanMessage = escapeHtml(text);

  if (isBuyer) {
    const sentMsg = await messageService.notifyTicketHandler(
      { telegram: ctx.telegram },
      ticket,
      cleanMessage
    );

    if (sentMsg && sentMsg.message_id) {
      replyMapping.set(sentMsg.message_id, {
        ticketId: mapping.ticketId,
        senderUserId: user.id,
        senderTelegramId: telegramId,
        targetRole: 'buyer',
      });
    }
  } else {
    const buyerUser = userService.getUserById(ticket.buyerId);
    if (buyerUser) {
      const sentMsg = await messageService.sendToUser(
        { telegram: ctx.telegram },
        buyerUser.telegramId,
        cleanMessage
      );

      if (sentMsg && sentMsg.message_id) {
        replyMapping.set(sentMsg.message_id, {
          ticketId: mapping.ticketId,
          senderUserId: user.id,
          senderTelegramId: telegramId,
          targetRole: 'seller',
        });
      }
    }
  }

  setActiveTicket(telegramId, mapping.ticketId);
  logger.info(`Reply relayed directly in ticket ${mapping.ticketId} from ${user.id}`);
  return true;
}

function register(bot) {
  bot.action('my_tickets', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showMyTickets(ctx, 0);
  });

  bot.command('tickets', async (ctx) => {
    await showMyTickets(ctx, 0);
  });

  bot.action(/^tickets_page_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const page = parseInt(ctx.match[1], 10);
    await showMyTickets(ctx, page);
  });

  bot.action(/^ticket_(TKT-\d+|TKT-SUP-\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const ticketId = ctx.match[1];
    await showTicketDetail(ctx, ticketId);
  });

  bot.action(/^ticket_open_(TKT-\d+|TKT-SUP-\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const ticketId = ctx.match[1];
    await openTicketChat(ctx, ticketId);
  });

  bot.action(/^ticket_wait_(TKT-\d+|TKT-SUP-\d+)$/, async (ctx) => {
    const ticketId = ctx.match[1];
    await waitTicketChat(ctx, ticketId);
  });

  bot.action(/^ticket_close_(TKT-\d+|TKT-SUP-\d+)$/, async (ctx) => {
    const ticketId = ctx.match[1];
    await closeTicket(ctx, ticketId);
  });

  bot.action(/^ticket_deactivate_(TKT-\d+|TKT-SUP-\d+)$/, async (ctx) => {
    const ticketId = ctx.match[1];
    await deactivateTicket(ctx, ticketId);
  });
}

module.exports = {
  register,
  handleTicketMessage,
  getActiveTicket,
  setActiveTicket,
  clearActiveTicket,
  replyMapping,
  showMyTickets,
  showTicketDetail,
};
