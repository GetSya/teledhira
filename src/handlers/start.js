// ─────────────────────────────────────────────
// Start Handler
// Homepage & Main Menu Navigation
// ─────────────────────────────────────────────
const { Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const { escapeHtml } = require('../utils/format');
const { userMainMenu, adminMainMenu, safeEditOrReply } = require('../utils/keyboard');
const userService = require('../services/userService');
const productService = require('../services/productService');

/**
 * Show main menu (Homepage)
 * Logo photo is displayed ONLY on the homepage!
 * @param {object} ctx
 */
async function showMainMenu(ctx) {
  const user = userService.findByTelegramId(ctx.from.id);
  const name = user ? escapeHtml(user.firstName || user.username) : 'Pelanggan';

  const settings = productService.getShopSettings();
  const shopName = escapeHtml(settings.shopName || 'Marketplace Store');
  const shopDescription = escapeHtml(settings.shopDescription || 'Selamat datang di Toko Marketplace Telegram!');

  const text =
    `🏪 <b>${shopName}</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `${shopDescription}\n\n` +
    `👋 Halo, <b>${name}</b>!\n` +
    `Silakan pilih menu layanan di bawah ini:`;

  const isAdmin = user && (user.role === 'admin' || userService.isAdmin(ctx.from.id));
  const keyboard = isAdmin ? adminMainMenu() : userMainMenu();

  const logoPath = settings.shopLogo ? path.join(__dirname, '..', '..', settings.shopLogo) : null;
  const hasLogo = logoPath && fs.existsSync(logoPath);

  try {
    if (hasLogo) {
      if (text.length <= 1000) {
        if (ctx.callbackQuery) {
          if (ctx.callbackQuery.message && ctx.callbackQuery.message.photo) {
            try {
              await ctx.editMessageCaption(text, {
                parse_mode: 'HTML',
                ...keyboard,
              });
              return;
            } catch (e) {}
          }
          await ctx.deleteMessage().catch(() => {});
        }
        await ctx.replyWithPhoto(
          { source: fs.createReadStream(logoPath) },
          {
            caption: text,
            parse_mode: 'HTML',
            ...keyboard,
          }
        );
      } else {
        // Teks > 1000 karakter: Kirim logo + caption singkat, lalu kirim teks lengkap
        const shortCaption = `🏪 <b>${shopName}</b>`;
        if (ctx.callbackQuery) {
          await ctx.deleteMessage().catch(() => {});
        }
        await ctx.replyWithPhoto(
          { source: fs.createReadStream(logoPath) },
          { caption: shortCaption, parse_mode: 'HTML' }
        );
        await ctx.reply(text, {
          parse_mode: 'HTML',
          ...keyboard,
        });
      }
    } else {
      await safeEditOrReply(ctx, text, keyboard);
    }
  } catch (err) {
    if (!err.message.includes('message is not modified')) {
      await safeEditOrReply(ctx, text, keyboard).catch(() => {});
    }
  }
}

function register(bot) {
  bot.start(async (ctx) => {
    await showMainMenu(ctx);
  });

  bot.action('menu_main', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showMainMenu(ctx);
  });

  bot.action('noop', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
  });
}

module.exports = { register, showMainMenu };
