// ─────────────────────────────────────────────
// Telegram Marketplace Bot
// Main bot initialization + middleware
// ─────────────────────────────────────────────
const { Telegraf } = require('telegraf');
const config = require('./config');
const logger = require('./utils/logger');
const userService = require('./services/userService');

// Handlers
const startHandler = require('./handlers/start');
const marketplaceHandler = require('./handlers/marketplace');
const productHandler = require('./handlers/product');
const cartHandler = require('./handlers/cart');
const orderHandler = require('./handlers/order');
const ticketHandler = require('./handlers/ticket');
const adminHandler = require('./handlers/admin');
const sellerHandler = require('./handlers/seller');
const supportHandler = require('./handlers/support');
const accountHandler = require('./handlers/account');
const donationHandler = require('./handlers/donation');

// Initialize bot
const bot = new Telegraf(config.BOT_TOKEN);

// ── Middleware: Auto-register users ──
bot.use(async (ctx, next) => {
  try {
    if (ctx.from) {
      await userService.registerUser(ctx.from);
    }
  } catch (err) {
    logger.error('User registration middleware error:', err.message);
  }
  return next();
});

// ── Middleware: Global error handler ──
bot.catch((err, ctx) => {
  logger.error(`Bot error for ${ctx.updateType}:`, err.message);
  try {
    if (ctx.callbackQuery) {
      ctx.answerCbQuery('❌ Terjadi kesalahan. Silakan coba lagi.').catch(() => {});
    } else if (ctx.message) {
      ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi atau hubungi admin.').catch(() => {});
    }
  } catch (e) {}
});

// ── Register all handlers ──
startHandler.register(bot);
marketplaceHandler.register(bot);
productHandler.register(bot);
cartHandler.register(bot);
orderHandler.register(bot);
ticketHandler.register(bot);
adminHandler.register(bot);
sellerHandler.register(bot);
supportHandler.register(bot);
accountHandler.register(bot);
donationHandler.register(bot);

// ── Photo message handler (shop logo / product image uploads) ──
bot.on('photo', async (ctx) => {
  try {
    const adminPhotoHandled = await adminHandler.handleAdminPhoto(ctx);
    if (adminPhotoHandled) return;
  } catch (err) {
    logger.error('Photo handler error:', err.message);
  }
});

// ── Document message handler (db.json backup restore) ──
bot.on('document', async (ctx) => {
  try {
    const adminDocHandled = await adminHandler.handleAdminDocument(ctx);
    if (adminDocHandled) return;
  } catch (err) {
    logger.error('Document handler error:', err.message);
  }
});


// ── Text message handler (ticket relay + admin input + buyer note input + donation custom input) ──
bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;

  try {
    // 1. Admin session input
    const adminHandled = await adminHandler.handleAdminInput(ctx);
    if (adminHandled) return;

    // 2. Buyer session input (e.g. order note required)
    const buyerHandled = await productHandler.handleBuyerInput(ctx);
    if (buyerHandled) return;

    // 3. Donation custom nominal input
    const donationHandled = await donationHandler.handleDonationInput(ctx);
    if (donationHandled) return;

    // 4. Ticket chat relay
    const ticketHandled = await ticketHandler.handleTicketMessage(ctx, bot);
    if (ticketHandled) return;
  } catch (err) {
    logger.error('Text handler error:', err.message);
    await ctx.reply('❌ Terjadi kesalahan. Silakan coba lagi.').catch(() => {});
  }
});

// ── Launch bot ──
async function start() {
  try {
    logger.info('Starting Telegram Marketplace Bot...');
    logger.info(`Admin IDs: ${config.ADMIN_IDS.join(', ') || 'none'}`);

    // Initialize database
    require('./database').get();
    logger.info('Database initialized.');

    await bot.launch({
      dropPendingUpdates: true,
    });

    logger.info('✅ Bot started successfully!');
    logger.info('Press Ctrl+C to stop.');
  } catch (err) {
    logger.error('Failed to start bot:', err.message);
    process.exit(1);
  }
}

process.once('SIGINT', () => {
  logger.info('Received SIGINT. Shutting down...');
  bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
  logger.info('Received SIGTERM. Shutting down...');
  bot.stop('SIGTERM');
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err.message || err);
});

module.exports = { start };
