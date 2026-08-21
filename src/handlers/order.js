// ─────────────────────────────────────────────
// Order Handler (Buyer side)
// ─────────────────────────────────────────────
const { Markup } = require('telegraf');
const orderService = require('../services/orderService');
const productService = require('../services/productService');
const userService = require('../services/userService');
const messageService = require('../services/messageService');
const ticketService = require('../services/ticketService');
const { formatCurrency, formatDate, formatOrderStatus, escapeHtml } = require('../utils/format');
const { navRow, paginationRow, safeEditOrReply } = require('../utils/keyboard');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Show buyer's orders list
 */
async function showMyOrders(ctx, page = 0) {
  const user = userService.findByTelegramId(ctx.from.id);
  if (!user) return;

  const orders = orderService.getOrdersByBuyer(user.id);
  const perPage = config.ITEMS_PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(orders.length / perPage));
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * perPage;
  const pageOrders = orders.slice(start, start + perPage);

  if (orders.length === 0) {
    const text = `📦 <b>PESANAN SAYA</b>\n\nBelum ada pesanan.`;
    const buttons = [navRow('menu_main')];
    return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
  }

  let text = `📦 <b>PESANAN SAYA</b> (${orders.length})\n\n`;

  pageOrders.forEach((o, i) => {
    const num = start + i + 1;
    text += `<b>${num}.</b> #${o.id}\n`;
    text += `    ${escapeHtml(o.productName)} | ${formatCurrency(o.total)}\n`;
    text += `    ${formatOrderStatus(o.status)}\n\n`;
  });

  const buttons = pageOrders.map((o) => [
    Markup.button.callback(`📋 #${o.id}`, `order_${o.id}`),
  ]);

  if (totalPages > 1) {
    buttons.push(paginationRow('orders_page', currentPage, totalPages));
  }

  buttons.push(navRow('menu_main'));

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

/**
 * Show order detail
 */
async function showOrderDetail(ctx, orderId) {
  const user = userService.findByTelegramId(ctx.from.id);
  if (!user) return;

  const order = orderService.getOrderById(orderId);
  if (!order) {
    if (ctx.callbackQuery) await ctx.answerCbQuery('Order tidak ditemukan.');
    return;
  }

  const isAdmin = userService.isAdmin(ctx.from.id);
  const isSeller = user.role === 'seller' && order.sellerId === user.id;
  if (order.buyerId !== user.id && !isAdmin && !isSeller) {
    if (ctx.callbackQuery) await ctx.answerCbQuery('Anda tidak memiliki akses ke order ini.');
    return;
  }

  const product = productService.getProductById(order.productId);

  const text =
    `🛒 <b>DETAIL ORDER</b>\n\n` +
    `<b>Order:</b> #${order.id}\n` +
    `<b>Produk:</b> ${escapeHtml(order.productName)}\n` +
    `<b>Harga:</b> ${formatCurrency(order.price)}\n` +
    `<b>Jumlah:</b> ${order.quantity}\n` +
    `<b>Total:</b> ${formatCurrency(order.total)}\n` +
    `<b>Status:</b> ${formatOrderStatus(order.status)}\n` +
    (order.ticketId ? `<b>Ticket:</b> #${order.ticketId}\n\n` : '\n') +
    `<b>Dibuat:</b> ${formatDate(order.createdAt)}\n`;

  const buttons = [];

  if (['pending', 'waiting_payment'].includes(order.status)) {
    buttons.push([Markup.button.callback('💳 Saya Sudah Bayar', `order_pay_${order.id}`)]);
  }

  if (order.ticketId) {
    buttons.push([Markup.button.callback('🎫 Buka Ticket', `ticket_open_${order.ticketId}`)]);
  }

  if (['pending', 'waiting_payment'].includes(order.status)) {
    buttons.push([Markup.button.callback('❌ Batalkan Order', `order_cancel_${order.id}`)]);
  }

  buttons.push(navRow('my_orders'));

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

/**
 * Mark payment as done
 */
async function markPaid(ctx, orderId) {
  const user = userService.findByTelegramId(ctx.from.id);
  if (!user) return;

  const order = orderService.getOrderById(orderId);
  if (!order || order.buyerId !== user.id) {
    await ctx.answerCbQuery('Order tidak ditemukan.');
    return;
  }

  const result = await orderService.updateOrderStatus(orderId, 'payment_review');
  if (!result.success) {
    await ctx.answerCbQuery(result.error);
    return;
  }

  await ctx.answerCbQuery('Pembayaran sedang diverifikasi.');

  const notifText =
    `🔔 <b>PEMBAYARAN DILAPORKAN</b>\n\n` +
    `<b>Order:</b> #${orderId}\n` +
    `<b>Produk:</b> ${escapeHtml(order.productName)}\n` +
    `<b>Total:</b> ${formatCurrency(order.total)}\n` +
    `<b>Buyer:</b> ${escapeHtml(user.firstName || user.username)}\n\n` +
    `Silakan verifikasi pembayaran.`;

  const notifButtons = [
    [
      Markup.button.callback('✅ Payment Berhasil', `adm_quick_pay_${orderId}_paid`),
      Markup.button.callback('❌ Payment Gagal', `adm_quick_pay_${orderId}_cancelled`),
    ],
  ];

  const ticket = order.ticketId ? ticketService.getTicketById(order.ticketId) : null;
  if (ticket) {
    await messageService.notifyTicketHandler(
      { telegram: ctx.telegram },
      ticket,
      notifText,
      { reply_markup: { inline_keyboard: notifButtons } }
    );
  } else {
    await messageService.notifyAdmins(
      { telegram: ctx.telegram },
      notifText,
      { reply_markup: { inline_keyboard: notifButtons } }
    );
  }

  await showOrderDetail(ctx, orderId);
}

/**
 * Cancel order
 */
async function cancelOrder(ctx, orderId) {
  const user = userService.findByTelegramId(ctx.from.id);
  if (!user) return;

  const order = orderService.getOrderById(orderId);
  if (!order || order.buyerId !== user.id) {
    await ctx.answerCbQuery('Order tidak ditemukan.');
    return;
  }

  const result = await orderService.updateOrderStatus(orderId, 'cancelled');
  if (!result.success) {
    await ctx.answerCbQuery(result.error);
    return;
  }

  await productService.updateProduct(order.productId, {
    stock: (productService.getProductById(order.productId)?.stock || 0) + order.quantity,
    status: 'active',
  });

  if (order.ticketId) {
    await ticketService.closeTicket(order.ticketId);
  }

  await ctx.answerCbQuery('Order dibatalkan.');
  await showOrderDetail(ctx, orderId);

  logger.info(`Order ${orderId} cancelled by buyer ${user.id}`);
}

function register(bot) {
  bot.action('my_orders', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showMyOrders(ctx, 0);
  });

  bot.command('orders', async (ctx) => {
    await showMyOrders(ctx, 0);
  });

  bot.action(/^orders_page_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const page = parseInt(ctx.match[1], 10);
    await showMyOrders(ctx, page);
  });

  bot.action(/^order_(ORD-\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const orderId = ctx.match[1];
    await showOrderDetail(ctx, orderId);
  });

  bot.action(/^order_pay_(ORD-\d+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    await markPaid(ctx, orderId);
  });

  bot.action(/^order_cancel_(ORD-\d+)$/, async (ctx) => {
    const orderId = ctx.match[1];
    await cancelOrder(ctx, orderId);
  });
}

module.exports = { register, showMyOrders, showOrderDetail };
