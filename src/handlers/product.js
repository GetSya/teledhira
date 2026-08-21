// ─────────────────────────────────────────────
// Product Handler
// Product Detail & Action Buttons
// ─────────────────────────────────────────────
const { Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const productService = require('../services/productService');
const orderService = require('../services/orderService');
const ticketService = require('../services/ticketService');
const userService = require('../services/userService');
const messageService = require('../services/messageService');
const ticketHandler = require('./ticket');
const { formatCurrency, escapeHtml } = require('../utils/format');
const { navRow, safeEditOrReply } = require('../utils/keyboard');
const logger = require('../utils/logger');

/**
 * Show product detail (supports image from ./media/item/)
 */
async function showProductDetail(ctx, productId) {
  const product = productService.getProductById(productId);
  if (!product) {
    if (ctx.callbackQuery) await ctx.answerCbQuery('Produk tidak ditemukan.');
    return;
  }

  const category = productService.getCategoryById(product.categoryId);
  const categoryName = category ? `${category.emoji} ${category.name}` : '-';
  const stockLabel = product.stock > 0 ? `${product.stock}` : '❌ Habis';

  const text =
    `🔍 <b>DETAIL ITEM</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `📦 <b>Nama Produk:</b> ${escapeHtml(product.name)}\n` +
    `📁 <b>Kategori:</b> ${categoryName}\n` +
    `💰 <b>Harga:</b> ${formatCurrency(product.price)}\n` +
    `📊 <b>Stok:</b> ${stockLabel}\n\n` +
    `📝 <b>Deskripsi Produk:</b>\n${escapeHtml(product.description)}\n`;

  const buttons = [];

  if (product.stock > 0 && product.status === 'active') {
    buttons.push([
      Markup.button.callback('🛒 Beli Sekarang', `buy_${product.id}`),
      Markup.button.callback('📥 + Keranjang', `cart_add_${product.id}`),
    ]);
  } else {
    buttons.push([Markup.button.callback('❌ Stok Habis', 'noop')]);
  }

  const backCb = product.categoryId ? `category_${product.categoryId}` : 'menu_marketplace';
  buttons.push(navRow(backCb));

  const imagePath = product.image ? path.join(__dirname, '..', '..', product.image) : null;
  const hasImage = imagePath && fs.existsSync(imagePath);

  try {
    if (hasImage) {
      if (text.length <= 1000) {
        if (ctx.callbackQuery) {
          if (ctx.callbackQuery.message && ctx.callbackQuery.message.photo) {
            try {
              await ctx.editMessageCaption(text, {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: buttons },
              });
              return;
            } catch (e) {}
          }
          await ctx.deleteMessage().catch(() => {});
        }
        await ctx.replyWithPhoto(
          { source: fs.createReadStream(imagePath) },
          {
            caption: text,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons },
          }
        );
      } else {
        // Teks > 1000 karakter: Kirim foto + caption singkat terlebih dahulu, lalu kirim teks detail lengkap
        const shortCaption = `📦 <b>${escapeHtml(product.name)}</b>`;
        if (ctx.callbackQuery) {
          await ctx.deleteMessage().catch(() => {});
        }
        await ctx.replyWithPhoto(
          { source: fs.createReadStream(imagePath) },
          { caption: shortCaption, parse_mode: 'HTML' }
        );
        await ctx.reply(text, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons },
        });
      }
    } else {
      await safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
    }
  } catch (err) {
    if (!err.message.includes('message is not modified')) {
      await safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } }).catch(() => {});
    }
  }
}

/**
 * Buy product directly → create order + ticket & auto-activate chat session
 */
async function buyProduct(ctx, productId) {
  const product = productService.getProductById(productId);
  if (!product) {
    await ctx.answerCbQuery('Produk tidak ditemukan.');
    return;
  }

  if (product.stock <= 0 || product.status !== 'active') {
    await ctx.answerCbQuery('Stok produk habis.');
    return;
  }

  const user = userService.findByTelegramId(ctx.from.id);
  if (!user) {
    await ctx.answerCbQuery('User tidak terdaftar.');
    return;
  }

  try {
    // 1. Create order
    const order = await orderService.createOrder({
      buyerId: user.id,
      sellerId: product.sellerId,
      productId: product.id,
      productName: product.name,
      quantity: 1,
      price: product.price,
    });

    // 2. Update status to waiting_payment
    await orderService.updateOrderStatus(order.id, 'waiting_payment');

    // 3. Decrease stock
    await productService.decreaseStock(product.id, 1);

    // 4. Create ticket
    const ticket = await ticketService.createTicket({
      orderId: order.id,
      buyerId: user.id,
      sellerId: product.sellerId,
    });

    // 5. Link ticket
    await orderService.setTicketId(order.id, ticket.id);

    // 6. Auto-activate ticket chat session for buyer
    ticketHandler.setActiveTicket(ctx.from.id, ticket.id);

    // 7. Show confirmation to buyer
    const text =
      `✅ <b>ORDER BERHASIL DIBUAT</b>\n\n` +
      `<b>Order:</b> #${order.id}\n` +
      `<b>Produk:</b> ${escapeHtml(product.name)}\n` +
      `<b>Total:</b> ${formatCurrency(order.total)}\n` +
      `<b>Status:</b> ⏳ Menunggu Pembayaran\n\n` +
      `💬 <b>Sesi Chat Tiket #${ticket.id} Otomatis Aktif!</b>\n` +
      `Anda dapat langsung mengetik pesan di sini untuk berbicara dengan penjual/admin.`;

    const buttons = [
      [Markup.button.callback('💳 Saya Sudah Bayar', `order_pay_${order.id}`)],
      [Markup.button.callback('📦 Lihat Detail Order', `order_${order.id}`)],
      [Markup.button.callback('🏠 Menu Utama', 'menu_main')],
    ];

    await safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });

    // 8. Notify seller/admin with Session Option & Quick Payment Buttons
    const notifText =
      `🔔 <b>ORDER BARU MASUK!</b>\n\n` +
      `<b>Order:</b> #${order.id}\n` +
      `<b>Produk:</b> ${escapeHtml(product.name)}\n` +
      `<b>Total:</b> ${formatCurrency(order.total)}\n` +
      `<b>Buyer:</b> ${escapeHtml(user.firstName || user.username)}\n` +
      `<b>Ticket:</b> #${ticket.id}\n\n` +
      `Pilih tindakan penanganan tiket:`;

    const notifButtons = [
      [
        Markup.button.callback('💬 Langsung Sesi Chat', `ticket_open_${ticket.id}`),
        Markup.button.callback('⏳ Tunggu Dulu', `ticket_wait_${ticket.id}`),
      ],
      [
        Markup.button.callback('✅ Payment Berhasil', `adm_quick_pay_${order.id}_paid`),
        Markup.button.callback('❌ Payment Gagal', `adm_quick_pay_${order.id}_cancelled`),
      ],
    ];

    await messageService.notifyTicketHandler(
      { telegram: ctx.telegram },
      ticket,
      notifText,
      { reply_markup: { inline_keyboard: notifButtons } }
    );

    logger.info(`Order ${order.id} created by ${user.id}, ticket ${ticket.id}`);
  } catch (err) {
    logger.error(`Buy product error: ${err.message}`);
    await ctx.answerCbQuery('Terjadi kesalahan. Silakan coba lagi.');
  }
}

function register(bot) {
  bot.action(/^product_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const productId = ctx.match[1];
    await showProductDetail(ctx, productId);
  });

  bot.action(/^buy_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const productId = ctx.match[1];
    await buyProduct(ctx, productId);
  });
}

module.exports = { register, showProductDetail };
