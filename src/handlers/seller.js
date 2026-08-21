// ─────────────────────────────────────────────
// Seller Handler
// Seller Panel + Management
// ─────────────────────────────────────────────
const { Markup } = require('telegraf');
const userService = require('../services/userService');
const productService = require('../services/productService');
const orderService = require('../services/orderService');
const ticketService = require('../services/ticketService');
const { formatCurrency, formatDate, formatOrderStatus, formatTicketStatus, formatProductStatus, escapeHtml, truncate } = require('../utils/format');
const { navRow, paginationRow, safeEditOrReply } = require('../utils/keyboard');
const config = require('../config');

function requireSeller(ctx) {
  const user = userService.findByTelegramId(ctx.from.id);
  return user && (user.role === 'seller' || user.role === 'admin');
}

/**
 * Show Seller Panel
 */
async function showSellerPanel(ctx) {
  if (!requireSeller(ctx)) {
    if (ctx.callbackQuery) await ctx.answerCbQuery('Akses ditolak. Anda bukan seller.');
    return;
  }

  const text = `👨‍💼 <b>SELLER PANEL</b>\n\nPilih menu:`;

  const buttons = [
    [Markup.button.callback('📦 Produk Saya', 'seller_products')],
    [Markup.button.callback('🎫 Ticket Masuk', 'seller_tickets')],
    [Markup.button.callback('🛒 Order Masuk', 'seller_orders')],
    [Markup.button.callback('📊 Statistik', 'seller_stats')],
    [Markup.button.callback('🏠 Menu Utama', 'menu_main')],
  ];

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

// ── Seller Products ──

async function showSellerProducts(ctx, page = 0) {
  if (!requireSeller(ctx)) return;
  const user = userService.findByTelegramId(ctx.from.id);

  const products = productService.getProductsBySeller(user.id);
  const perPage = config.ITEMS_PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(products.length / perPage));
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * perPage;
  const pageProducts = products.slice(start, start + perPage);

  let text = `📦 <b>PRODUK SAYA</b> (${products.length})\n\n`;

  if (products.length === 0) {
    text += 'Anda belum memiliki produk.';
  } else {
    pageProducts.forEach((p, i) => {
      const num = start + i + 1;
      text += `<b>${num}.</b> ${escapeHtml(p.name)}\n`;
      text += `    ${formatCurrency(p.price)} | Stok: ${p.stock} | ${formatProductStatus(p.status)}\n\n`;
    });
  }

  const buttons = [];

  if (totalPages > 1) {
    buttons.push(paginationRow('seller_prod_page', currentPage, totalPages));
  }

  buttons.push(navRow('seller_panel'));

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

// ── Seller Orders ──

async function showSellerOrders(ctx, page = 0) {
  if (!requireSeller(ctx)) return;
  const user = userService.findByTelegramId(ctx.from.id);

  const orders = orderService.getOrdersBySeller(user.id);
  const perPage = config.ITEMS_PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(orders.length / perPage));
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * perPage;
  const pageOrders = orders.slice(start, start + perPage);

  let text = `🛒 <b>ORDER MASUK</b> (${orders.length})\n\n`;

  if (orders.length === 0) {
    text += 'Belum ada order.';
  } else {
    pageOrders.forEach((o, i) => {
      const num = start + i + 1;
      text += `<b>${num}.</b> #${o.id}\n`;
      text += `    ${escapeHtml(o.productName)} | ${formatCurrency(o.total)}\n`;
      text += `    ${formatOrderStatus(o.status)}\n\n`;
    });
  }

  const buttons = pageOrders.map((o) => [
    Markup.button.callback(`📋 #${o.id}`, `order_${o.id}`),
  ]);

  if (totalPages > 1) {
    buttons.push(paginationRow('seller_orders_page', currentPage, totalPages));
  }

  buttons.push(navRow('seller_panel'));

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

// ── Seller Tickets ──

async function showSellerTickets(ctx, page = 0) {
  if (!requireSeller(ctx)) return;
  const user = userService.findByTelegramId(ctx.from.id);

  const tickets = ticketService.getTicketsBySeller(user.id);
  const perPage = config.ITEMS_PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(tickets.length / perPage));
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * perPage;
  const pageTickets = tickets.slice(start, start + perPage);

  let text = `🎫 <b>TICKET MASUK</b> (${tickets.length})\n\n`;

  if (tickets.length === 0) {
    text += 'Belum ada ticket.';
  } else {
    pageTickets.forEach((t, i) => {
      const num = start + i + 1;
      text += `<b>${num}.</b> #${t.id}\n`;
      if (t.orderId) text += `    Order: #${t.orderId}\n`;
      text += `    ${formatTicketStatus(t.status)}\n\n`;
    });
  }

  const buttons = pageTickets.map((t) => [
    Markup.button.callback(`📋 #${t.id}`, `ticket_${t.id}`),
  ]);

  if (totalPages > 1) {
    buttons.push(paginationRow('seller_tickets_page', currentPage, totalPages));
  }

  buttons.push(navRow('seller_panel'));

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

// ── Seller Stats ──

async function showSellerStats(ctx) {
  if (!requireSeller(ctx)) return;
  const user = userService.findByTelegramId(ctx.from.id);

  const orders = orderService.getOrdersBySeller(user.id);
  const tickets = ticketService.getTicketsBySeller(user.id);
  const products = productService.getProductsBySeller(user.id);

  const activeOrders = orders.filter((o) => !['completed', 'cancelled', 'refunded'].includes(o.status));
  const openTickets = tickets.filter((t) => t.status !== 'closed');
  const totalRevenue = orders
    .filter((o) => ['paid', 'processing', 'completed'].includes(o.status))
    .reduce((sum, o) => sum + o.total, 0);

  const text =
    `📊 <b>STATISTIK SELLER</b>\n\n` +
    `📦 <b>Produk:</b> ${products.length}\n` +
    `🛒 <b>Total Order:</b> ${orders.length}\n` +
    `🔄 <b>Order Aktif:</b> ${activeOrders.length}\n` +
    `🎫 <b>Total Ticket:</b> ${tickets.length}\n` +
    `🟢 <b>Ticket Open:</b> ${openTickets.length}\n` +
    `💰 <b>Revenue:</b> ${formatCurrency(totalRevenue)}\n`;

  const buttons = [navRow('seller_panel')];

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

function register(bot) {
  bot.command('seller', async (ctx) => {
    await showSellerPanel(ctx);
  });

  bot.action('seller_panel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showSellerPanel(ctx);
  });

  bot.action('seller_products', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showSellerProducts(ctx, 0);
  });

  bot.action(/^seller_prod_page_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showSellerProducts(ctx, parseInt(ctx.match[1], 10));
  });

  bot.action('seller_orders', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showSellerOrders(ctx, 0);
  });

  bot.action(/^seller_orders_page_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showSellerOrders(ctx, parseInt(ctx.match[1], 10));
  });

  bot.action('seller_tickets', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showSellerTickets(ctx, 0);
  });

  bot.action(/^seller_tickets_page_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showSellerTickets(ctx, parseInt(ctx.match[1], 10));
  });

  bot.action('seller_stats', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showSellerStats(ctx);
  });
}

module.exports = { register };
