// ─────────────────────────────────────────────
// Marketplace Handler
// Category browsing (Grid 3x2) & Product listing (Grid 2x5 with pagination)
// ─────────────────────────────────────────────
const { Markup } = require('telegraf');
const productService = require('../services/productService');
const { formatCurrency, escapeHtml, truncate, getWibTimestamp } = require('../utils/format');
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
 * Show products / product groups in a category
 */
async function showCategoryProducts(ctx, categoryId, page = 0, isRefresh = false) {
  const category = productService.getCategoryById(categoryId);
  if (!category) {
    if (ctx.callbackQuery) await ctx.answerCbQuery('Kategori tidak ditemukan.');
    return;
  }

  const groups = productService.getProductGroupsByCategory(categoryId);
  const perPage = config.ITEMS_PER_PAGE; // 10 items per page (2x5 grid)
  const totalPages = Math.max(1, Math.ceil(groups.length / perPage));
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * perPage;
  const pageGroups = groups.slice(start, start + perPage);

  if (groups.length === 0) {
    const text =
      `${category.emoji} <b>${escapeHtml(category.name)}</b>\n\n` +
      `Belum ada produk di kategori ini.`;
    const buttons = [navRow('menu_marketplace')];
    return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
  }

  const text =
    `${category.emoji} <b>${escapeHtml(category.name)}</b> (${groups.length} item)\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `Pilih produk di bawah untuk melihat pilihan varian/detail item:`;

  const buttons = [];
  const groupButtons = pageGroups.map((g) => {
    if (g.hasVariants) {
      return Markup.button.callback(truncate(`📦 ${g.name}`, 24), `pgrp_${categoryId}_${encodeURIComponent(g.name)}`);
    } else {
      return Markup.button.callback(truncate(`📦 ${g.name}`, 24), `product_${g.sampleProduct.id}`);
    }
  });

  // Group buttons into 2 columns per row (2x5 grid formation max 10 items per page)
  const colsPerRow = 2;
  for (let i = 0; i < groupButtons.length; i += colsPerRow) {
    buttons.push(groupButtons.slice(i, i + colsPerRow));
  }

  // Add pagination controls if more than 1 page
  if (totalPages > 1) {
    buttons.push(paginationRow(`mp_page_${categoryId}`, currentPage, totalPages));
  }

  buttons.push([Markup.button.callback('← Sebelumnya', 'menu_marketplace')]);

  if (isRefresh && ctx.callbackQuery) {
    await ctx.answerCbQuery('🔄 Data diperbarui!').catch(() => {});
  }

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

/**
 * Show product duration variants in 2x5 grid formation matching requested screenshot
 */
async function showProductVariants(ctx, categoryId, productName, page = 0, isRefresh = false) {
  const category = productService.getCategoryById(categoryId);
  const variants = productService.getProductsByName(categoryId, productName);

  if (variants.length === 0) {
    if (ctx.callbackQuery) await ctx.answerCbQuery('Varian produk tidak ditemukan.');
    return showCategoryProducts(ctx, categoryId, 0);
  }

  const perPage = config.ITEMS_PER_PAGE; // 10 items per page (2x5 grid)
  const totalPages = Math.max(1, Math.ceil(variants.length / perPage));
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * perPage;
  const pageVariants = variants.slice(start, start + perPage);

  // Format list items according to screenshot:
  // "1 Bulan - 10.000 (Stok 90)"
  const listLines = pageVariants.map((v) => escapeHtml(productService.getVariantListLine(v)));
  const timestamp = getWibTimestamp();

  const text =
    listLines.join('\n') +
    `\n\n🔄 Diperbarui pada ${timestamp}`;

  const buttons = [];
  // Variant buttons (e.g. "1 Bulan", "2 Bulan", "3 Bulan", "12 Bulan")
  const varButtons = pageVariants.map((v) => {
    const label = productService.getVariantDisplayLabel(v);
    return Markup.button.callback(truncate(label, 24), `product_${v.id}`);
  });

  // Group variant buttons into 2 columns per row (2x5 grid formation)
  const colsPerRow = 2;
  for (let i = 0; i < varButtons.length; i += colsPerRow) {
    buttons.push(varButtons.slice(i, i + colsPerRow));
  }

  // Refresh button (🔄 Perbarui)
  const encName = encodeURIComponent(productName);
  buttons.push([Markup.button.callback('🔄 Perbarui', `pgrp_rf_${categoryId}_${encName}_${currentPage}`)]);

  // Add pagination controls if more than 1 page
  if (totalPages > 1) {
    buttons.push(paginationRow(`vp_page_${categoryId}_${encName}`, currentPage, totalPages));
  }

  // Back button (← Sebelumnya / Kembali ke Kategori)
  buttons.push([Markup.button.callback('← Sebelumnya', `category_${categoryId}`)]);

  if (isRefresh && ctx.callbackQuery) {
    await ctx.answerCbQuery('🔄 Data diperbarui!').catch(() => {});
  }

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

  bot.action(/^pgrp_(.+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const categoryId = ctx.match[1];
    const productName = decodeURIComponent(ctx.match[2]);
    await showProductVariants(ctx, categoryId, productName, 0);
  });

  bot.action(/^pgrp_rf_(.+)_(.+)_(\d+)$/, async (ctx) => {
    const categoryId = ctx.match[1];
    const productName = decodeURIComponent(ctx.match[2]);
    const page = parseInt(ctx.match[3], 10);
    await showProductVariants(ctx, categoryId, productName, page, true);
  });

  bot.action(/^vp_page_(.+)_(.+)_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const categoryId = ctx.match[1];
    const productName = decodeURIComponent(ctx.match[2]);
    const page = parseInt(ctx.match[3], 10);
    await showProductVariants(ctx, categoryId, productName, page);
  });

  bot.action(/^refresh_cat_(.+)_(\d+)$/, async (ctx) => {
    const categoryId = ctx.match[1];
    const page = parseInt(ctx.match[2], 10);
    await showCategoryProducts(ctx, categoryId, page, true);
  });

  bot.action(/^mp_page_(.+)_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    const categoryId = ctx.match[1];
    const page = parseInt(ctx.match[2], 10);
    await showCategoryProducts(ctx, categoryId, page);
  });
}

module.exports = { register, showCategories };


