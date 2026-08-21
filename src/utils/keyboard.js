// ─────────────────────────────────────────────
// Reusable Inline Keyboard Builders
// ─────────────────────────────────────────────
const { Markup } = require('telegraf');

/**
 * User Main Menu Inline Keyboard (5 buttons, formation 2 - 1 - 2)
 * Row 1: [ 🛍 Marketplace ] [ 🛒 Keranjang ]
 * Row 2: [ 📦 Pesanan Saya ]
 * Row 3: [ 🎫 Ticket Saya ] [ 👤 Akun Saya ]
 */
function userMainMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🛍 Marketplace', 'menu_marketplace'),
      Markup.button.callback('🛒 Keranjang', 'menu_cart'),
    ],
    [
      Markup.button.callback('📦 Pesanan Saya', 'my_orders'),
    ],
    [
      Markup.button.callback('🎫 Ticket Saya', 'my_tickets'),
      Markup.button.callback('👤 Akun Saya', 'my_account'),
    ],
  ]);
}

/**
 * Admin Main Menu Inline Keyboard (6 buttons, formation 3 - 2 - 1)
 * Row 1: [ 🛍 Marketplace ] [ 🛒 Keranjang ] [ 📦 Pesanan ]
 * Row 2: [ 🎫 Ticket ] [ 👤 Akun ]
 * Row 3: [ ⚙️ Admin Panel ]
 */
function adminMainMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🛍 Marketplace', 'menu_marketplace'),
      Markup.button.callback('🛒 Keranjang', 'menu_cart'),
      Markup.button.callback('📦 Pesanan', 'my_orders'),
    ],
    [
      Markup.button.callback('🎫 Ticket', 'my_tickets'),
      Markup.button.callback('👤 Akun', 'my_account'),
    ],
    [
      Markup.button.callback('⚙️ Admin Panel', 'admin_panel'),
    ],
  ]);
}

/**
 * Admin Panel Inline Keyboard (8 buttons, formation 3 - 3 - 2)
 * Row 1: [ 📦 Produk ] [ 🏷 Kategori ] [ 🛒 Orders ]
 * Row 2: [ 🎫 Tickets ] [ 👥 Users ] [ 👨‍💼 Sellers ]
 * Row 3: [ 📊 Statistik ] [ ⚙️ Pengaturan Toko ]
 */
function adminPanelMenu() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('📦 Produk', 'admin_products'),
      Markup.button.callback('🏷 Kategori', 'admin_categories'),
      Markup.button.callback('🛒 Orders', 'admin_orders'),
    ],
    [
      Markup.button.callback('🎫 Tickets', 'admin_tickets'),
      Markup.button.callback('👥 Users', 'admin_users'),
      Markup.button.callback('👨‍💼 Sellers', 'admin_sellers'),
    ],
    [
      Markup.button.callback('📊 Statistik', 'admin_stats'),
      Markup.button.callback('⚙️ Pengaturan Toko', 'admin_settings'),
    ],
    [
      Markup.button.callback('🏠 Menu Utama', 'menu_main'),
    ],
  ]);
}

/**
 * Safely edit a message or fallback to delete + reply if message was a photo
 */
async function safeEditOrReply(ctx, text, extra = {}) {
  const options = { parse_mode: 'HTML', ...extra };
  if (ctx.callbackQuery) {
    try {
      if (ctx.callbackQuery.message && ctx.callbackQuery.message.photo) {
        await ctx.deleteMessage().catch(() => {});
        return await ctx.reply(text, options);
      }
      return await ctx.editMessageText(text, options);
    } catch (err) {
      if (
        err.message.includes('there is no text in the message to edit') ||
        err.message.includes('message to edit not found') ||
        err.message.includes('message is not modified')
      ) {
        if (err.message.includes('message is not modified')) return;
        await ctx.deleteMessage().catch(() => {});
        return await ctx.reply(text, options);
      }
      throw err;
    }
  } else {
    return await ctx.reply(text, options);
  }
}

function backButton(callbackData, label = '◀️ Kembali') {
  return [Markup.button.callback(label, callbackData)];
}

function homeButton() {
  return [Markup.button.callback('🏠 Menu Utama', 'menu_main')];
}

function navRow(backCb) {
  return [
    Markup.button.callback('◀️ Kembali', backCb),
    Markup.button.callback('🏠 Menu Utama', 'menu_main'),
  ];
}

function paginationRow(prefix, currentPage, totalPages) {
  const buttons = [];
  if (currentPage > 0) {
    buttons.push(Markup.button.callback('◀️', `${prefix}_${currentPage - 1}`));
  }
  buttons.push(Markup.button.callback(`${currentPage + 1}/${totalPages}`, 'noop'));
  if (currentPage < totalPages - 1) {
    buttons.push(Markup.button.callback('▶️', `${prefix}_${currentPage + 1}`));
  }
  return buttons;
}

function confirmCancel(confirmCb, cancelCb, confirmLabel = '✅ Ya', cancelLabel = '❌ Batal') {
  return [
    Markup.button.callback(confirmLabel, confirmCb),
    Markup.button.callback(cancelLabel, cancelCb),
  ];
}

module.exports = {
  safeEditOrReply,
  userMainMenu,
  adminMainMenu,
  adminPanelMenu,
  backButton,
  homeButton,
  navRow,
  paginationRow,
  confirmCancel,
};
