// ─────────────────────────────────────────────
// Cart Handler
// Shopping Cart management & Checkout
// ─────────────────────────────────────────────
const { Markup } = require('telegraf');
const cartService = require('../services/cartService');
const productService = require('../services/productService');
const orderService = require('../services/orderService');
const ticketService = require('../services/ticketService');
const userService = require('../services/userService');
const messageService = require('../services/messageService');
const { formatCurrency, escapeHtml } = require('../utils/format');
const { navRow, safeEditOrReply } = require('../utils/keyboard');
const logger = require('../utils/logger');

/**
 * Show Cart view
 */
async function showCart(ctx) {
  const user = userService.findByTelegramId(ctx.from.id);
  if (!user) return;

  const cart = cartService.getCart(user.id);

  if (!cart || cart.length === 0) {
    const text = `🛒 <b>KERANJANG BELANJA</b>\n\nKeranjang Anda masih kosong.`;
    const buttons = [
      [Markup.button.callback('🛍 Browse Marketplace', 'menu_marketplace')],
      navRow('menu_main'),
    ];

    return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
  }

  let text = `🛒 <b>KERANJANG BELANJA</b> (${cart.length} item)\n\n`;
  let grandTotal = 0;
  const buttons = [];

  cart.forEach((item, i) => {
    const product = productService.getProductById(item.productId);
    if (product) {
      const itemTotal = product.price * item.quantity;
      grandTotal += itemTotal;
      const displayLabel = productService.getProductDisplayLabel(product);
      text += `<b>${i + 1}. ${escapeHtml(displayLabel)}</b>\n`;
      text += `    Jumlah: ${item.quantity} x ${formatCurrency(product.price)} = <b>${formatCurrency(itemTotal)}</b>\n\n`;

      buttons.push([
        Markup.button.callback(`➖`, `cart_qty_${product.id}_${item.quantity - 1}`),
        Markup.button.callback(`${item.quantity}`, 'noop'),
        Markup.button.callback(`➕`, `cart_qty_${product.id}_${item.quantity + 1}`),
        Markup.button.callback(`🗑️ Hapus`, `cart_del_${product.id}`),
      ]);
    }
  });

  text += `<b>Total Keseluruhan:</b> 💰 ${formatCurrency(grandTotal)}`;

  buttons.push([Markup.button.callback('💳 Checkout Sekarang', 'cart_checkout')]);
  buttons.push([Markup.button.callback('🗑️ Kosongkan Keranjang', 'cart_clear')]);
  buttons.push(navRow('menu_main'));

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

/**
 * Add item to cart callback handler
 */
async function handleAddToCart(ctx, productId) {
  const user = userService.findByTelegramId(ctx.from.id);
  if (!user) return;

  const product = productService.getProductById(productId);
  if (!product || product.stock <= 0) {
    await ctx.answerCbQuery('Stok produk tidak mencukupi atau produk habis.');
    return;
  }

  await cartService.addToCart(user.id, productId, 1);
  const displayLabel = productService.getProductDisplayLabel(product);
  await ctx.answerCbQuery(`✅ ${displayLabel} telah ditambahkan ke keranjang!`);
}

/**
 * Checkout all items in cart
 */
async function checkoutCart(ctx) {
  const user = userService.findByTelegramId(ctx.from.id);
  if (!user) return;

  const cart = cartService.getCart(user.id);
  if (!cart || cart.length === 0) {
    await ctx.answerCbQuery('Keranjang Anda kosong.');
    return;
  }

  try {
    const createdOrders = [];
    const createdTickets = [];

    for (const item of cart) {
      const product = productService.getProductById(item.productId);
      if (!product || product.stock < item.quantity || product.status !== 'active') {
        continue;
      }

      const displayLabel = productService.getProductDisplayLabel(product);
      // Create order
      const order = await orderService.createOrder({
        buyerId: user.id,
        sellerId: product.sellerId,
        productId: product.id,
        productName: displayLabel,
        quantity: item.quantity,
        price: product.price,
      });


      await orderService.updateOrderStatus(order.id, 'waiting_payment');
      await productService.decreaseStock(product.id, item.quantity);

      // Create ticket
      const ticket = await ticketService.createTicket({
        orderId: order.id,
        buyerId: user.id,
        sellerId: product.sellerId,
      });

      await orderService.setTicketId(order.id, ticket.id);

      createdOrders.push(order);
      createdTickets.push(ticket);

      // Notify seller/admin
      const notifText =
        `🔔 <b>ORDER BARU (CHECKOUT KERANJANG)</b>\n\n` +
        `<b>Order:</b> #${order.id}\n` +
        `<b>Produk:</b> ${escapeHtml(product.name)} (x${item.quantity})\n` +
        `<b>Total:</b> ${formatCurrency(order.total)}\n` +
        `<b>Buyer:</b> ${escapeHtml(user.firstName || user.username)}\n` +
        `<b>Ticket:</b> #${ticket.id}`;

      await messageService.notifyTicketHandler({ telegram: ctx.telegram }, ticket, notifText);
    }

    // Clear cart after checkout
    await cartService.clearCart(user.id);

    let text =
      `✅ <b>CHECKOUT BERHASIL!</b>\n\n` +
      `Berhasil membuat <b>${createdOrders.length} order</b>:\n\n`;

    createdOrders.forEach((o, i) => {
      text += `<b>${i + 1}. Order #${o.id}</b> - ${escapeHtml(o.productName)} (x${o.quantity})\n`;
      text += `    Total: ${formatCurrency(o.total)} | Ticket: #${o.ticketId}\n\n`;
    });

    text += `Silakan buka menu <b>Pesanan Saya</b> atau <b>Ticket Saya</b> untuk memproses pembayaran & berkonsultasi.`;

    const buttons = [
      [Markup.button.callback('📦 Lihat Pesanan Saya', 'my_orders')],
      [Markup.button.callback('🎫 Lihat Ticket Saya', 'my_tickets')],
      [Markup.button.callback('🏠 Menu Utama', 'menu_main')],
    ];

    return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });

    logger.info(`Cart checked out by user ${user.id}: ${createdOrders.length} orders created.`);
  } catch (err) {
    logger.error(`Cart checkout error: ${err.message}`);
    await ctx.answerCbQuery('Terjadi kesalahan saat checkout.');
  }
}

function register(bot) {
  // Menu cart callback
  bot.action('menu_cart', async (ctx) => {
    await ctx.answerCbQuery();
    await showCart(ctx);
  });

  // Add to cart action
  bot.action(/^cart_add_(.+)$/, async (ctx) => {
    const productId = ctx.match[1];
    await handleAddToCart(ctx, productId);
  });

  // Update Qty action
  bot.action(/^cart_qty_(.+)_(\d+)$/, async (ctx) => {
    const productId = ctx.match[1];
    const qty = parseInt(ctx.match[2], 10);
    const user = userService.findByTelegramId(ctx.from.id);
    if (user) {
      await cartService.updateCartItem(user.id, productId, qty);
      await ctx.answerCbQuery();
      await showCart(ctx);
    }
  });

  // Delete item from cart
  bot.action(/^cart_del_(.+)$/, async (ctx) => {
    const productId = ctx.match[1];
    const user = userService.findByTelegramId(ctx.from.id);
    if (user) {
      await cartService.removeFromCart(user.id, productId);
      await ctx.answerCbQuery('Item dihapus dari keranjang.');
      await showCart(ctx);
    }
  });

  // Clear cart
  bot.action('cart_clear', async (ctx) => {
    const user = userService.findByTelegramId(ctx.from.id);
    if (user) {
      await cartService.clearCart(user.id);
      await ctx.answerCbQuery('Keranjang dikosongkan.');
      await showCart(ctx);
    }
  });

  // Checkout cart
  bot.action('cart_checkout', async (ctx) => {
    await ctx.answerCbQuery();
    await checkoutCart(ctx);
  });
}

module.exports = { register, showCart };
