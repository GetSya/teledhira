// ─────────────────────────────────────────────
// Marketplace Handler
// Category browsing (Grid 3x2) & Product listing (Grid 2x5 with pagination)
// ─────────────────────────────────────────────
const { Markup } = require('telegraf');
const productService = require('../services/productService');
const { formatCurrency, escapeHtml, truncate } = require('../utils/format');
const { navRow, paginationRow, safeEditOrReply } = require('../utils/keyboard');
const config = require('../config');

/**
 * Show marketplace categories in a 3x2 grid formation
 */
async function showCategories(ctx) {
  const categories = productService.getAllCategories();

  if (categories.length === 0) {
    const text = `🛍 <b>MARKETPLACE</b>\n\nBelum ada kategori tersedia.`;
    const buttons = [navRow('menu_main')];
    return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
  }

  const text = `🛍 <b>MARKETPLACE</b>\n\nPilih kategori:`;

  const buttons = [];
  const catButtons = categories.map((cat) =>
    Markup.button.callback(`${cat.emoji} ${cat.name}`, `category_${cat.id}`)
  );

  // Group into rows of 3 buttons (3x2 grid formation)
  const itemsPerRow = 3;
  for (let i = 0; i < catButtons.length; i += itemsPerRow) {
    buttons.push(catButtons.slice(i, i + itemsPerRow));
  }

  buttons.push(navRow('menu_main'));

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

/**
 * Show products in a category in 2x5 grid formation (2 columns x 5 rows = 10 items per page)
 * Buttons display clean product names (without "Detail" or "🔍" emoji).
 */
async function showCategoryProducts(ctx, categoryId, page = 0) {
  const category = productService.getCategoryById(categoryId);
  if (!category) {
    if (ctx.callbackQuery) await ctx.answerCbQuery('Kategori tidak ditemukan.');
    return;
  }

  const products = productService.getProductsByCategory(categoryId);
  const perPage = config.ITEMS_PER_PAGE; // 10 items per page (2x5 grid)
  const totalPages = Math.max(1, Math.ceil(products.length / perPage));
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * perPage;
  const pageProducts = products.slice(start, start + perPage);

  if (products.length === 0) {
    const text =
      `${category.emoji} <b>${escapeHtml(category.name)}</b>\n\n` +
      `Belum ada produk di kategori ini.`;
    const buttons = [navRow('menu_marketplace')];
    return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
  }

  let text =
    `${category.emoji} <b>${escapeHtml(category.name)}</b> (${products.length} produk)\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `Pilih produk di bawah untuk melihat detail item:\n\n`;

  pageProducts.forEach((p, i) => {
    const num = start + i + 1;
    const stockLabel = p.stock > 0 ? `Stok: ${p.stock}` : '❌ Habis';
    const imgLabel = p.image ? '🖼️' : '📦';
    text += `<b>${num}. ${imgLabel} ${escapeHtml(p.name)}</b>\n`;
    text += `    💰 ${formatCurrency(p.price)} | ${stockLabel}\n\n`;
  });

  const buttons = [];
  // Clean product name buttons (no "Detail" word, no "🔍" emoji)
  const prodButtons = pageProducts.map((p) =>
    Markup.button.callback(truncate(p.name, 18), `product_${p.id}`)
  );

  // Group product buttons into 2 columns per row (2x5 grid formation)
  const colsPerRow = 2;
  for (let i = 0; i < prodButtons.length; i += colsPerRow) {
    buttons.push(prodButtons.slice(i, i + colsPerRow));
  }

  // Add pagination controls if more than 1 page
  if (totalPages > 1) {
    buttons.push(paginationRow(`mp_page_${categoryId}`, currentPage, totalPages));
  }

  buttons.push(navRow('menu_marketplace'));

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

function register(bot) {
  bot.action('menu_marketplace', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showCategories(ctx);
  });

  bot.action(/^category_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const categoryId = ctx.match[1];
    await showCategoryProducts(ctx, categoryId, 0);
  });

  bot.action(/^mp_page_(.+)_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const categoryId = ctx.match[1];
    const page = parseInt(ctx.match[2], 10);
    await showCategoryProducts(ctx, categoryId, page);
  });
}

module.exports = { register, showCategories };
