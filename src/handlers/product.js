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
    (product.variant ? `🏷️ <b>Varian:</b> ${escapeHtml(product.variant)}\n` : '') +
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

  let backCb = product.categoryId ? `category_${product.categoryId}` : 'menu_marketplace';
  if (product.categoryId && product.name) {
    const groupVariants = productService.getProductsByName(product.categoryId, product.name);
    if (groupVariants.length > 1 || (groupVariants.length === 1 && groupVariants[0].variant)) {
      backCb = `pgrp_${product.categoryId}_${encodeURIComponent(product.name)}`;
    }
  }
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
        const shortCaption = `📦 <b>${escapeHtml(productService.getProductDisplayLabel(product))}</b>`;
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

// In-memory buyer session for order notes
const buyerSessions = new Map();

function getBuyerSession(telegramId) {
  return buyerSessions.get(telegramId) || null;
}

function setBuyerSession(telegramId, data) {
  buyerSessions.set(telegramId, data);
}

function clearBuyerSession(telegramId) {
  buyerSessions.delete(telegramId);
}

/**
 * Handle buyer text input (e.g. order note)
 */
async function handleBuyerInput(ctx) {
  const session = getBuyerSession(ctx.from.id);
  if (!session) return false;

  if (session.step === 'buyer_order_note') {
    const product = productService.getProductById(session.productId);
    if (!product) {
      clearBuyerSession(ctx.from.id);
      await ctx.reply('❌ Produk tidak ditemukan atau telah dihapus.');
      return true;
    }

    const note = ctx.message.text.trim();
    clearBuyerSession(ctx.from.id);
    await processOrderCreation(ctx, product, note);
    return true;
  }

  return false;
}

/**
 * Buy product directly → check if note is required or process directly
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

  // If product requires a note, prompt the buyer first
  if (product.requireNote) {
    setBuyerSession(ctx.from.id, {
      step: 'buyer_order_note',
      productId: product.id,
    });

    const displayLabel = productService.getProductDisplayLabel(product);
    const promptText = product.orderNotePrompt || 'Silahkan masukan Catatan nya:';

    const text =
      `📝 <b>CATATAN PESANAN DIPERLUKAN</b>\n\n` +
      `<b>Produk:</b> ${escapeHtml(displayLabel)}\n` +
      `<b>Harga:</b> ${formatCurrency(product.price)}\n\n` +
      `<i>${escapeHtml(promptText)}</i>\n\n` +
      `Silakan kirim pesan balasan catatan Anda di bawah ini:`;

    const buttons = [
      [Markup.button.callback('❌ Batal Pesan', `cancel_order_note_${product.id}`)],
    ];

    return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
  }

  // Otherwise proceed without note
  await processOrderCreation(ctx, product, null);
}

/**
 * Execute order creation and notify admins
 */
async function processOrderCreation(ctx, product, note = null) {
  const user = userService.findByTelegramId(ctx.from.id);
  if (!user) return;

  try {
    const displayLabel = productService.getProductDisplayLabel(product);

    // 1. Create order
    const order = await orderService.createOrder({
      buyerId: user.id,
      sellerId: product.sellerId,
      productId: product.id,
      productName: displayLabel,
      quantity: 1,
      price: product.price,
      note: note || null,
    });

    // 2. Update status to waiting_payment
    await orderService.updateOrderStatus(order.id, 'waiting_payment');

    // 3. Decrease stock
    await productService.decreaseStock(product.id, 1);

    // 4. Create ticket (starts with readStatus: unread, chatActive: false)
    const ticket = await ticketService.createTicket({
      orderId: order.id,
      buyerId: user.id,
      sellerId: product.sellerId,
    });

    // 5. Link ticket
    await orderService.setTicketId(order.id, ticket.id);

    // 6. Show confirmation to buyer
    const text =
      `✅ <b>ORDER BERHASIL DIBUAT</b>\n\n` +
      `<b>Order:</b> #${order.id}\n` +
      `<b>Produk:</b> ${escapeHtml(order.productName)}\n` +
      `<b>Total:</b> ${formatCurrency(order.total)}\n` +
      (note ? `<b>📝 Catatan Anda:</b> <code>${escapeHtml(note)}</code>\n` : '') +
      `<b>Status:</b> ⏳ Menunggu Pembayaran\n` +
      `<b>Ticket:</b> #${ticket.id}\n\n` +
      `⏳ <i>Tiket telah dibuat. Sesi chat akan dimulai setelah Admin/Owner merespon.</i>`;

    const buttons = [
      [Markup.button.callback('💳 Saya Sudah Bayar', `order_pay_${order.id}`)],
      [Markup.button.callback('📦 Lihat Detail Order', `order_${order.id}`)],
      [Markup.button.callback('🏠 Menu Utama', 'menu_main')],
    ];

    await safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });

    // 7. Notify seller/admin with Paham, Mulai Chat, & Quick Payment Buttons
    const notifText =
      `🔔 <b>ORDER BARU MASUK!</b>\n\n` +
      `<b>Order:</b> #${order.id}\n` +
      `<b>Produk:</b> ${escapeHtml(order.productName)}\n` +
      `<b>Total:</b> ${formatCurrency(order.total)}\n` +
      `<b>Buyer:</b> ${escapeHtml(user.firstName || user.username)}\n` +
      (note ? `<b>📝 Catatan Buyer:</b>\n<code>${escapeHtml(note)}</code>\n\n` : '\n') +
      `<b>Ticket:</b> #${ticket.id}\n\n` +
      `Pilih tindakan penanganan:`;

    const notifButtons = [
      [
        Markup.button.callback('👁️ Paham', `ticket_ack_${ticket.id}`),
        Markup.button.callback('💬 Mulai Chat', `ticket_start_chat_${ticket.id}`),
      ],
      [
        Markup.button.callback('✅ Payment Berhasil', `adm_quick_pay_${order.id}_paid`),
        Markup.button.callback('❌ Payment Gagal', `adm_quick_pay_${order.id}_cancelled`),
      ],
    ];

    const sentAdmins = await messageService.notifyAdmins(
      { telegram: ctx.telegram },
      notifText,
      { reply_markup: { inline_keyboard: notifButtons } }
    );

    if (Array.isArray(sentAdmins) && sentAdmins.length > 0) {
      await orderService.setAdminNotificationMessages(order.id, sentAdmins);
    }

    logger.info(`Order ${order.id} created by ${user.id}, ticket ${ticket.id}`);
  } catch (err) {
    logger.error(`Buy product error: ${err.message}`);
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery('Terjadi kesalahan. Silakan coba lagi.');
    } else {
      await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.');
    }
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

  bot.action(/^cancel_order_note_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery('Pemesanan dibatalkan.').catch(() => {});
    clearBuyerSession(ctx.from.id);
    const productId = ctx.match[1];
    await showProductDetail(ctx, productId);
  });
}

module.exports = { register, showProductDetail, buyProduct, handleBuyerInput, clearBuyerSession };
