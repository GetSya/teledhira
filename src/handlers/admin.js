// ─────────────────────────────────────────────
// Admin Handler
// Admin Panel, Shop Settings, Category CRUD, Product Photo Upload
// ─────────────────────────────────────────────
const { Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const userService = require('../services/userService');
const productService = require('../services/productService');
const orderService = require('../services/orderService');
const ticketService = require('../services/ticketService');
const messageService = require('../services/messageService');
const donationService = require('../services/donationService');
const { formatCurrency, formatDate, formatOrderStatus, formatTicketStatus, formatProductStatus, escapeHtml, truncate } = require('../utils/format');
const { adminPanelMenu, navRow, paginationRow, safeEditOrReply } = require('../utils/keyboard');
const config = require('../config');
const database = require('../database');
const logger = require('../utils/logger');

// Admin session state
const adminSessions = new Map();

function requireAdmin(ctx) {
  if (!userService.isAdmin(ctx.from.id)) {
    return false;
  }
  return true;
}

/**
 * Show Admin Panel
 */
async function showAdminPanel(ctx) {
  if (!requireAdmin(ctx)) {
    if (ctx.callbackQuery) await ctx.answerCbQuery('Akses ditolak.');
    return;
  }

  const text =
    `⚙️ <b>ADMIN PANEL</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `Silakan pilih menu kelola di bawah ini:`;

  const keyboard = adminPanelMenu();
  return safeEditOrReply(ctx, text, keyboard);
}

// ── Products Management ──

async function showAdminProducts(ctx, page = 0) {
  if (!requireAdmin(ctx)) return;

  const products = productService.getAllProducts();
  const perPage = config.ITEMS_PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(products.length / perPage));
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * perPage;
  const pageProducts = products.slice(start, start + perPage);

  let text = `📦 <b>KELOLA PRODUK</b> (${products.length})\n\n`;

  if (products.length === 0) {
    text += 'Belum ada produk.';
  } else {
    pageProducts.forEach((p, i) => {
      const num = start + i + 1;
      const imgLabel = p.image ? '🖼️ Ada Foto' : '📷 Tanpa Foto';
      text += `<b>${num}.</b> ${escapeHtml(p.name)}\n`;
      text += `    ${formatCurrency(p.price)} | Stok: ${p.stock} | ${imgLabel} | ${formatProductStatus(p.status)}\n\n`;
    });
  }

  const buttons = [];

  pageProducts.forEach((p) => {
    buttons.push([
      Markup.button.callback(`✏️ ${truncate(p.name, 16)}`, `adm_prod_edit_${p.id}`),
      Markup.button.callback('🖼️ Foto', `adm_prod_photo_${p.id}`),
      Markup.button.callback('🗑️', `adm_prod_del_${p.id}`),
    ]);
  });

  buttons.push([Markup.button.callback('➕ Tambah Produk Baru', 'adm_prod_add')]);

  if (totalPages > 1) {
    buttons.push(paginationRow('adm_prod_page', currentPage, totalPages));
  }

  buttons.push(navRow('admin_panel'));

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

// ── Categories Management & CRUD ──

async function showAdminCategories(ctx) {
  if (!requireAdmin(ctx)) return;

  const categories = productService.getAllCategoriesRaw();

  let text = `🏷 <b>KELOLA KATEGORI</b> (${categories.length})\n\n`;

  categories.forEach((c, i) => {
    const statusLabel = c.status === 'active' ? '✅ Aktif' : '⛔ Nonaktif';
    text += `<b>${i + 1}.</b> ${c.emoji} <b>${escapeHtml(c.name)}</b> (${statusLabel})\n`;
    text += `    ID: <code>${c.id}</code>\n\n`;
  });

  const buttons = [];

  categories.forEach((c) => {
    buttons.push([
      Markup.button.callback(`✏️ ${c.emoji} ${c.name}`, `adm_cat_edit_${c.id}`),
      Markup.button.callback(c.status === 'active' ? '⛔ Nonaktif' : '✅ Aktif', `adm_cat_toggle_${c.id}`),
    ]);
  });

  buttons.push([Markup.button.callback('➕ Tambah Kategori Baru', 'adm_cat_add')]);
  buttons.push(navRow('admin_panel'));

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

// ── Orders Management ──

async function showAdminOrders(ctx, page = 0) {
  if (!requireAdmin(ctx)) return;

  const orders = orderService.getAllOrders();
  const perPage = config.ITEMS_PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(orders.length / perPage));
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * perPage;
  const pageOrders = orders.slice(start, start + perPage);

  let text = `🛒 <b>SEMUA ORDER</b> (${orders.length})\n\n`;

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
    Markup.button.callback(`📋 #${o.id}`, `adm_order_${o.id}`),
  ]);

  if (totalPages > 1) {
    buttons.push(paginationRow('adm_orders_page', currentPage, totalPages));
  }

  buttons.push(navRow('admin_panel'));

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

/**
 * Admin Order Detail View
 */
async function showAdminOrderDetail(ctx, orderId) {
  if (!requireAdmin(ctx)) return;

  const order = orderService.getOrderById(orderId);
  if (!order) {
    await ctx.answerCbQuery('Order tidak ditemukan.');
    return;
  }

  const buyer = userService.getUserById(order.buyerId);

  const text =
    `🛒 <b>ADMIN - ORDER #${order.id}</b>\n\n` +
    `<b>Produk:</b> ${escapeHtml(order.productName)}\n` +
    `<b>Total:</b> ${formatCurrency(order.total)}\n` +
    `<b>Buyer:</b> ${buyer ? escapeHtml(buyer.firstName || buyer.username) : '-'}\n` +
    `<b>Status:</b> ${formatOrderStatus(order.status)}\n` +
    `<b>Ticket:</b> ${order.ticketId ? '#' + order.ticketId : '-'}\n` +
    `<b>Dibuat:</b> ${formatDate(order.createdAt)}\n`;

  const buttons = [
    [
      Markup.button.callback('✅ Payment Berhasil', `adm_quick_pay_${order.id}_paid`),
      Markup.button.callback('❌ Payment Gagal', `adm_quick_pay_${order.id}_cancelled`),
    ],
  ];

  const nextStatuses = orderService.getNextStatuses(order.status);
  if (nextStatuses.length > 0) {
    nextStatuses.forEach((ns) => {
      buttons.push([
        Markup.button.callback(`→ Transisi Ke: ${formatOrderStatus(ns)}`, `adm_order_status_${order.id}_${ns}`),
      ]);
    });
  }

  if (order.ticketId) {
    buttons.push([Markup.button.callback('🎫 Buka Ticket', `ticket_open_${order.ticketId}`)]);
  }

  buttons.push(navRow('admin_orders'));

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

// ── Tickets Management ──

async function showAdminTickets(ctx, page = 0) {
  if (!requireAdmin(ctx)) return;

  const tickets = ticketService.getAllTickets();
  const perPage = config.ITEMS_PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(tickets.length / perPage));
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * perPage;
  const pageTickets = tickets.slice(start, start + perPage);

  let text = `🎫 <b>SEMUA TICKET</b> (${tickets.length})\n\n`;

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
    buttons.push(paginationRow('adm_tickets_page', currentPage, totalPages));
  }

  buttons.push(navRow('admin_panel'));

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

// ── Users Management ──

async function showAdminUsers(ctx, page = 0) {
  if (!requireAdmin(ctx)) return;

  const users = userService.getAllUsers();
  const perPage = config.ITEMS_PER_PAGE;
  const totalPages = Math.max(1, Math.ceil(users.length / perPage));
  const currentPage = Math.min(page, totalPages - 1);
  const start = currentPage * perPage;
  const pageUsers = users.slice(start, start + perPage);

  const roleEmoji = { admin: '⚙️', seller: '👨‍💼', buyer: '👤' };

  let text = `👥 <b>USERS</b> (${users.length})\n\n`;

  if (users.length === 0) {
    text += 'Belum ada user.';
  } else {
    pageUsers.forEach((u, i) => {
      const num = start + i + 1;
      const name = u.firstName || u.username || '-';
      const rEmoji = roleEmoji[u.role] || '👤';
      text += `<b>${num}.</b> ${escapeHtml(name)} ${rEmoji}\n`;
      text += `    ID: ${u.id} | Role: ${u.role}\n`;
      text += `    TG: <code>${u.telegramId}</code>\n\n`;
    });
  }

  const buttons = [];

  // Per-user action button
  pageUsers.forEach((u) => {
    buttons.push([
      Markup.button.callback(`👤 ${truncate(u.firstName || u.username || u.id, 14)} (${u.role})`, `adm_user_detail_${u.id}`),
    ]);
  });

  if (totalPages > 1) {
    buttons.push(paginationRow('adm_users_page', currentPage, totalPages));
  }
  buttons.push([Markup.button.callback('⚙️ Kelola Admin', 'adm_manage_admins')]);
  buttons.push(navRow('admin_panel'));

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

/**
 * Show Admin Management page — list all DB-role admins
 */
async function showAdminManagement(ctx) {
  if (!requireAdmin(ctx)) return;

  const admins = userService.getAllAdmins();
  const superAdminIds = config.ADMIN_IDS;

  let text =
    `⚙️ <b>KELOLA ADMIN</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `<b>Admin dari .env (Super Admin):</b>\n`;

  if (superAdminIds.length === 0) {
    text += `  <i>Tidak ada</i>\n`;
  } else {
    superAdminIds.forEach((id) => {
      const u = userService.findByTelegramId(id);
      const name = u ? escapeHtml(u.firstName || u.username || String(id)) : String(id);
      text += `  ⭐ ${name} (<code>${id}</code>)\n`;
    });
  }

  text += `\n<b>Admin dari Database (${admins.length}):</b>\n`;

  if (admins.length === 0) {
    text += `  <i>Belum ada.</i>\n`;
  } else {
    admins.forEach((a, i) => {
      const isSuperAdmin = superAdminIds.includes(a.telegramId);
      const name = escapeHtml(a.firstName || a.username || '-');
      text += `  <b>${i + 1}.</b> ${name} <code>${a.telegramId}</code>${isSuperAdmin ? ' ⭐' : ''}\n`;
    });
  }

  text += `\n<i>Gunakan tombol di bawah untuk menambah atau mencabut admin.</i>`;

  const buttons = [
    [Markup.button.callback('➕ Tambah Admin', 'adm_admin_add')],
  ];

  // Show revoke buttons for DB admins that are NOT super admins from .env
  admins
    .filter((a) => !superAdminIds.includes(a.telegramId))
    .forEach((a) => {
      const name = truncate(a.firstName || a.username || a.id, 16);
      buttons.push([
        Markup.button.callback(`❌ Cabut: ${name}`, `adm_admin_revoke_${a.telegramId}`),
      ]);
    });

  buttons.push(navRow('admin_users'));
  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

/**
 * Show a single user detail + role management buttons
 */
async function showUserDetail(ctx, userId) {
  if (!requireAdmin(ctx)) return;

  const user = userService.getUserById(userId);
  if (!user) {
    await ctx.answerCbQuery('User tidak ditemukan.').catch(() => {});
    return;
  }

  const roleLabels = { buyer: '👤 Buyer', seller: '👨‍💼 Seller', admin: '⚙️ Admin' };
  const isSuperAdmin = config.ADMIN_IDS.includes(user.telegramId);

  const text =
    `👤 <b>DETAIL USER</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `<b>ID:</b> ${user.id}\n` +
    `<b>Nama:</b> ${escapeHtml(user.firstName || '-')}\n` +
    `<b>Username:</b> ${user.username ? '@' + escapeHtml(user.username) : '-'}\n` +
    `<b>Telegram ID:</b> <code>${user.telegramId}</code>\n` +
    `<b>Role:</b> ${roleLabels[user.role] || user.role}${isSuperAdmin ? ' ⭐ Super Admin' : ''}\n` +
    `<b>Status:</b> ${user.status === 'active' ? '✅ Aktif' : '⛔ Nonaktif'}\n` +
    `<b>Bergabung:</b> ${formatDate(user.createdAt)}\n\n` +
    `<i>Pilih aksi di bawah:</i>`;

  const buttons = [];

  if (!isSuperAdmin) {
    // Role change buttons
    if (user.role !== 'admin') {
      buttons.push([Markup.button.callback('⚙️ Jadikan Admin', `adm_role_set_${user.id}_admin`)]);
    } else {
      buttons.push([Markup.button.callback('❌ Cabut Admin → Buyer', `adm_role_set_${user.id}_buyer`)]);
    }
    if (user.role !== 'seller') {
      buttons.push([Markup.button.callback('👨‍💼 Jadikan Seller', `adm_role_set_${user.id}_seller`)]);
    }
    if (user.role !== 'buyer' && user.role !== 'admin') {
      buttons.push([Markup.button.callback('👤 Jadikan Buyer', `adm_role_set_${user.id}_buyer`)]);
    }
  } else {
    buttons.push([Markup.button.callback('⭐ Super Admin (dari .env)', 'noop')]);
  }

  buttons.push(navRow('admin_users'));
  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

// ── Sellers Management ──

async function showAdminSellers(ctx) {
  if (!requireAdmin(ctx)) return;

  const sellers = userService.getAllSellers();

  let text = `👨‍💼 <b>SELLERS</b> (${sellers.length})\n\n`;

  if (sellers.length === 0) {
    text += 'Belum ada seller.\n\nGunakan menu di bawah untuk menambahkan seller.';
  } else {
    sellers.forEach((s, i) => {
      const name = s.firstName || s.username || '-';
      text += `<b>${i + 1}.</b> ${escapeHtml(name)}\n`;
      text += `    ID: ${s.id} | TG: <code>${s.telegramId}</code>\n\n`;
    });
  }

  const buttons = [
    [Markup.button.callback('➕ Tambah Seller', 'adm_seller_add')],
    navRow('admin_panel'),
  ];

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

// ── Shop Settings (Pengaturan Toko) ──

async function showShopSettings(ctx) {
  if (!requireAdmin(ctx)) return;

  const settings = productService.getShopSettings();
  const shopName = escapeHtml(settings.shopName || 'Marketplace Store');
  const shopDesc = escapeHtml(settings.shopDescription || '-');
  const logoStatus = settings.shopLogo ? '🖼️ Ada Logo' : '📷 Tanpa Logo';
  const qrisCode = donationService.getQrisCode();

  const text =
    `⚙️ <b>PENGATURAN TOKO</b>\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `🏪 <b>Nama Toko:</b>\n${shopName}\n\n` +
    `📝 <b>Deskripsi Toko:</b>\n${shopDesc}\n\n` +
    `🖼️ <b>Logo/Gambar Toko:</b>\n${logoStatus}\n\n` +
    `💳 <b>String Kode QRIS:</b>\n<code>${truncate(qrisCode, 35)}</code>\n`;

  const buttons = [
    [Markup.button.callback('✏️ Edit Nama Toko', 'adm_set_name')],
    [Markup.button.callback('✏️ Edit Deskripsi Toko', 'adm_set_desc')],
    [Markup.button.callback('🖼️ Upload Logo Toko', 'adm_set_logo')],
    [Markup.button.callback('💳 Edit QRIS Payload', 'adm_set_qris')],
    navRow('admin_panel'),
  ];

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

// ── Statistics ──

async function showAdminStats(ctx) {
  if (!requireAdmin(ctx)) return;

  const users = userService.getAllUsers();
  const products = productService.getAllProducts();
  const orders = orderService.getAllOrders();
  const tickets = ticketService.getAllTickets();
  const sellers = userService.getAllSellers();
  const donations = donationService.getAllDonations();

  const activeOrders = orders.filter((o) => !['completed', 'cancelled', 'refunded'].includes(o.status));
  const openTickets = tickets.filter((t) => t.status !== 'closed');
  const totalRevenue = orders
    .filter((o) => ['paid', 'processing', 'completed'].includes(o.status))
    .reduce((sum, o) => sum + o.total, 0);

  const totalDonationAmount = donations.reduce((sum, d) => sum + Number(d.nominal), 0);

  const text =
    `📊 <b>STATISTIK MARKETPLACE</b>\n\n` +
    `👥 <b>Total Users:</b> ${users.length}\n` +
    `👨‍💼 <b>Total Sellers:</b> ${sellers.length}\n` +
    `📦 <b>Total Produk:</b> ${products.length}\n` +
    `🛒 <b>Total Order:</b> ${orders.length}\n` +
    `🔄 <b>Order Aktif:</b> ${activeOrders.length}\n` +
    `🎫 <b>Total Ticket:</b> ${tickets.length}\n` +
    `🟢 <b>Ticket Open:</b> ${openTickets.length}\n` +
    `💰 <b>Total Pendapatan:</b> ${formatCurrency(totalRevenue)}\n` +
    `🎁 <b>Total Donasi:</b> ${formatCurrency(totalDonationAmount)} (${donations.length}x)\n`;

  const buttons = [navRow('admin_panel')];

  return safeEditOrReply(ctx, text, { reply_markup: { inline_keyboard: buttons } });
}

// ── Session Helpers ──

function getAdminSession(telegramId) {
  return adminSessions.get(telegramId) || null;
}

function setAdminSession(telegramId, session) {
  adminSessions.set(telegramId, session);
}

function clearAdminSession(telegramId) {
  adminSessions.delete(telegramId);
}

/**
 * Handle photo uploads for Shop Logo or Product Images
 */
async function handleAdminPhoto(ctx) {
  if (!userService.isAdmin(ctx.from.id)) return false;

  const session = getAdminSession(ctx.from.id);
  if (!session) return false;

  if (session.step === 'upload_shop_logo') {
    const photos = ctx.message.photo;
    if (!photos || photos.length === 0) return false;

    const highestRes = photos[photos.length - 1];
    const fileId = highestRes.file_id;

    try {
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const fetch = (await import('node-fetch')).default || globalThis.fetch;
      const res = await fetch(fileLink.href);
      const buffer = Buffer.from(await res.arrayBuffer());

      const logoPath = path.join(database.MEDIA_DIR, 'logo.jpg');
      fs.writeFileSync(logoPath, buffer);

      await productService.updateShopSettings({ shopLogo: 'media/logo.jpg' });
      clearAdminSession(ctx.from.id);

      await ctx.reply('✅ Logo toko berhasil diperbarui!');
      await showShopSettings(ctx);
      return true;
    } catch (err) {
      logger.error('Failed to download shop logo:', err.message);
      await ctx.reply('❌ Gagal mengunggah logo toko.');
      return true;
    }
  }

  if (session.step === 'upload_product_photo') {
    const photos = ctx.message.photo;
    if (!photos || photos.length === 0) return false;

    const productId = session.data.productId;
    const highestRes = photos[photos.length - 1];
    const fileId = highestRes.file_id;

    try {
      const fileLink = await ctx.telegram.getFileLink(fileId);
      const fetch = (await import('node-fetch')).default || globalThis.fetch;
      const res = await fetch(fileLink.href);
      const buffer = Buffer.from(await res.arrayBuffer());

      const fileName = `${productId}.jpg`;
      const itemPath = path.join(database.ITEM_MEDIA_DIR, fileName);
      fs.writeFileSync(itemPath, buffer);

      const relPath = `media/item/${fileName}`;
      await productService.updateProduct(productId, { image: relPath });
      clearAdminSession(ctx.from.id);

      await ctx.reply(`✅ Foto produk <b>${productId}</b> berhasil diunggah!`, { parse_mode: 'HTML' });
      return true;
    } catch (err) {
      logger.error('Failed to download product photo:', err.message);
      await ctx.reply('❌ Gagal mengunggah foto produk.');
      return true;
    }
  }

  return false;
}

/**
 * Handle admin text input
 */
async function handleAdminInput(ctx) {
  if (!userService.isAdmin(ctx.from.id)) return false;

  const session = getAdminSession(ctx.from.id);
  if (!session) return false;

  const text = ctx.message.text;

  // ── Shop Settings Text Inputs ──
  if (session.step === 'edit_shop_name') {
    await productService.updateShopSettings({ shopName: text });
    clearAdminSession(ctx.from.id);
    await ctx.reply('✅ Nama toko berhasil diupdate!');
    await showShopSettings(ctx);
    return true;
  }

  if (session.step === 'edit_shop_desc') {
    await productService.updateShopSettings({ shopDescription: text });
    clearAdminSession(ctx.from.id);
    await ctx.reply('✅ Deskripsi toko berhasil diupdate!');
    await showShopSettings(ctx);
    return true;
  }

  if (session.step === 'set_qris_code') {
    try {
      await donationService.setQrisCode(text);
      clearAdminSession(ctx.from.id);
      await ctx.reply('✅ Kode QRIS Payload berhasil diupdate!');
      await showShopSettings(ctx);
    } catch (err) {
      await ctx.reply(`❌ ${escapeHtml(err.message)}`);
    }
    return true;
  }

  // ── Add Product Flow ──
  if (session.step === 'add_product_name') {
    setAdminSession(ctx.from.id, {
      step: 'add_product_category',
      data: { ...session.data, name: text },
    });

    const categories = productService.getAllCategories();
    const catButtons = categories.map((c) => [
      Markup.button.callback(`${c.emoji} ${c.name}`, `adm_prod_sel_cat_${c.id}`),
    ]);

    await ctx.reply('📦 Pilih <b>kategori produk</b> di bawah ini:', {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: catButtons },
    });
    return true;
  }

  if (session.step === 'add_product_desc') {
    setAdminSession(ctx.from.id, {
      ...session,
      step: 'add_product_price',
      data: { ...session.data, description: text },
    });
    await ctx.reply('💰 Masukkan <b>harga</b> (angka saja):', { parse_mode: 'HTML' });
    return true;
  }

  if (session.step === 'add_product_price') {
    const price = parseInt(text.replace(/\D/g, ''), 10);
    if (isNaN(price) || price <= 0) {
      await ctx.reply('❌ Harga harus berupa angka positif.', { parse_mode: 'HTML' });
      return true;
    }
    setAdminSession(ctx.from.id, {
      ...session,
      step: 'add_product_stock',
      data: { ...session.data, price },
    });
    await ctx.reply('📦 Masukkan <b>stok awal</b> (angka):', { parse_mode: 'HTML' });
    return true;
  }

  if (session.step === 'add_product_stock') {
    const stock = parseInt(text, 10);
    if (isNaN(stock) || stock < 0) {
      await ctx.reply('❌ Stok harus berupa angka >= 0.', { parse_mode: 'HTML' });
      return true;
    }

    const { name, categoryId, description, price } = session.data;
    clearAdminSession(ctx.from.id);

    const product = await productService.createProduct({
      name,
      categoryId,
      description,
      price,
      stock,
      sellerId: null,
    });

    const buttons = [
      [Markup.button.callback('🖼️ Upload Foto Produk Sekarang', `adm_prod_photo_${product.id}`)],
      [Markup.button.callback('📦 Lihat Semua Produk', 'admin_products')],
    ];

    await ctx.reply(
      `✅ <b>Produk berhasil ditambahkan!</b>\n\n` +
      `<b>ID:</b> ${product.id}\n` +
      `<b>Nama:</b> ${escapeHtml(product.name)}\n` +
      `<b>Harga:</b> ${formatCurrency(product.price)}\n` +
      `<b>Stok:</b> ${product.stock}`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } }
    );
    return true;
  }

  // ── Category CRUD Text Inputs ──
  if (session.step === 'add_cat_name') {
    setAdminSession(ctx.from.id, { ...session, step: 'add_cat_emoji', data: { name: text } });
    await ctx.reply('🎨 Masukkan <b>emoji</b> untuk kategori:', { parse_mode: 'HTML' });
    return true;
  }

  if (session.step === 'add_cat_emoji') {
    const { name } = session.data;
    clearAdminSession(ctx.from.id);

    const category = await productService.createCategory({
      name,
      emoji: text.trim(),
      description: '',
    });

    await ctx.reply(
      `✅ <b>Kategori berhasil ditambahkan!</b>\n\n` +
      `<b>ID:</b> ${category.id}\n` +
      `<b>Nama:</b> ${category.emoji} ${escapeHtml(category.name)}`,
      { parse_mode: 'HTML' }
    );
    return true;
  }

  if (session.step === 'edit_cat_name') {
    await productService.updateCategory(session.data.catId, { name: text });
    clearAdminSession(ctx.from.id);
    await ctx.reply('✅ Nama kategori berhasil diupdate!');
    await showAdminCategories(ctx);
    return true;
  }

  if (session.step === 'edit_cat_emoji') {
    await productService.updateCategory(session.data.catId, { emoji: text.trim() });
    clearAdminSession(ctx.from.id);
    await ctx.reply('✅ Emoji kategori berhasil diupdate!');
    await showAdminCategories(ctx);
    return true;
  }

  // ── Add Seller Flow ──
  if (session.step === 'add_seller_tgid') {
    const telegramId = parseInt(text.trim(), 10);
    if (isNaN(telegramId)) {
      await ctx.reply('❌ Masukkan Telegram ID yang valid (angka).', { parse_mode: 'HTML' });
      return true;
    }

    clearAdminSession(ctx.from.id);

    const user = userService.findByTelegramId(telegramId);
    if (!user) {
      await ctx.reply(
        `❌ User dengan Telegram ID <code>${telegramId}</code> belum terdaftar.\n` +
        `User harus mengirim /start ke bot terlebih dahulu.`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    await userService.updateRole(user.id, 'seller');
    await ctx.reply(
      `✅ <b>Seller berhasil ditambahkan!</b>\n\n` +
      `<b>User:</b> ${escapeHtml(user.firstName || user.username)}\n` +
      `<b>ID:</b> ${user.id}\n` +
      `<b>TG ID:</b> <code>${user.telegramId}</code>`,
      { parse_mode: 'HTML' }
    );
    return true;
  }

  // ── Add Admin Flow ──
  if (session.step === 'add_admin_tgid') {
    const telegramId = parseInt(text.trim(), 10);
    if (isNaN(telegramId)) {
      await ctx.reply('❌ Masukkan Telegram ID yang valid (angka).', { parse_mode: 'HTML' });
      return true;
    }

    clearAdminSession(ctx.from.id);

    if (config.ADMIN_IDS.includes(telegramId)) {
      await ctx.reply(
        `ℹ️ User <code>${telegramId}</code> sudah menjadi Super Admin (dari .env).`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    const user = userService.findByTelegramId(telegramId);
    if (!user) {
      await ctx.reply(
        `❌ User dengan Telegram ID <code>${telegramId}</code> belum terdaftar.\n` +
        `User harus mengirim /start ke bot terlebih dahulu.`,
        { parse_mode: 'HTML' }
      );
      return true;
    }

    await userService.updateRole(user.id, 'admin');
    logger.info(`Admin ${ctx.from.id} promoted TG ${telegramId} to admin via UI`);
    await ctx.reply(
      `✅ <b>Admin berhasil ditambahkan!</b>\n\n` +
      `<b>User:</b> ${escapeHtml(user.firstName || user.username || '-')}\n` +
      `<b>ID:</b> ${user.id}\n` +
      `<b>TG ID:</b> <code>${user.telegramId}</code>\n` +
      `<b>Role:</b> ⚙️ Admin`,
      { parse_mode: 'HTML' }
    );
    return true;
  }

  // ── Edit Product Text Inputs ──
  if (session.step === 'edit_product_field') {
    const product = productService.getProductById(session.data.productId);
    if (!product) {
      clearAdminSession(ctx.from.id);
      await ctx.reply('❌ Produk tidak ditemukan.', { parse_mode: 'HTML' });
      return true;
    }

    const field = session.data.field;
    let value = text;

    if (field === 'price') {
      value = parseInt(text.replace(/\D/g, ''), 10);
    } else if (field === 'stock') {
      value = parseInt(text, 10);
    }

    clearAdminSession(ctx.from.id);
    await productService.updateProduct(session.data.productId, { [field]: value });
    await ctx.reply(`✅ Produk <b>${escapeHtml(product.name)}</b> field <b>${field}</b> berhasil diupdate.`, { parse_mode: 'HTML' });
    return true;
  }

  return false;
}

function register(bot) {
  bot.command('admin', async (ctx) => {
    await showAdminPanel(ctx);
  });

  bot.action('admin_panel', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showAdminPanel(ctx);
  });

  // ── Shop Settings Actions ──
  bot.action('admin_settings', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showShopSettings(ctx);
  });

  bot.action('adm_set_name', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!requireAdmin(ctx)) return;
    setAdminSession(ctx.from.id, { step: 'edit_shop_name' });
    await ctx.reply('🏪 Masukkan <b>Nama Toko Baru</b>:', { parse_mode: 'HTML' });
  });

  bot.action('adm_set_desc', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!requireAdmin(ctx)) return;
    setAdminSession(ctx.from.id, { step: 'edit_shop_desc' });
    await ctx.reply('📝 Masukkan <b>Deskripsi Toko Baru</b>:', { parse_mode: 'HTML' });
  });

  bot.action('adm_set_logo', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!requireAdmin(ctx)) return;
    setAdminSession(ctx.from.id, { step: 'upload_shop_logo' });
    await ctx.reply('🖼️ Silakan <b>kirim gambar/foto logo toko</b> di chat ini:', { parse_mode: 'HTML' });
  });

  bot.action('adm_set_qris', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!requireAdmin(ctx)) return;
    setAdminSession(ctx.from.id, { step: 'set_qris_code' });
    await ctx.reply(
      '💳 Masukkan <b>QRIS Payload String</b> baru:\n\n' +
      `Current QRIS: <code>${escapeHtml(donationService.getQrisCode())}</code>`,
      { parse_mode: 'HTML' }
    );
  });

  bot.command('setqris', async (ctx) => {
    if (!requireAdmin(ctx)) return;
    setAdminSession(ctx.from.id, { step: 'set_qris_code' });
    await ctx.reply(
      '💳 Masukkan <b>QRIS Payload String</b> baru:\n\n' +
      `Current QRIS: <code>${escapeHtml(donationService.getQrisCode())}</code>`,
      { parse_mode: 'HTML' }
    );
  });

  // ── Product Image Upload Action ──
  bot.action(/^adm_prod_photo_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!requireAdmin(ctx)) return;
    const productId = ctx.match[1];
    setAdminSession(ctx.from.id, { step: 'upload_product_photo', data: { productId } });
    await ctx.reply(`🖼️ Silakan <b>kirim gambar/foto produk</b> untuk ${productId} di chat ini:`, { parse_mode: 'HTML' });
  });

  // ── Products Actions ──
  bot.action('admin_products', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showAdminProducts(ctx, 0);
  });

  bot.action(/^adm_prod_page_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showAdminProducts(ctx, parseInt(ctx.match[1], 10));
  });

  bot.action('adm_prod_add', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!requireAdmin(ctx)) return;
    setAdminSession(ctx.from.id, { step: 'add_product_name', data: {} });
    await ctx.reply('📦 Masukkan <b>nama produk</b>:', { parse_mode: 'HTML' });
  });

  // Button Category Selection when adding product
  bot.action(/^adm_prod_sel_cat_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!requireAdmin(ctx)) return;
    const catId = ctx.match[1];
    const session = getAdminSession(ctx.from.id);
    if (!session || session.step !== 'add_product_category') return;

    setAdminSession(ctx.from.id, {
      ...session,
      step: 'add_product_desc',
      data: { ...session.data, categoryId: catId },
    });
    await ctx.reply('📝 Masukkan <b>deskripsi</b> produk:', { parse_mode: 'HTML' });
  });

  bot.action(/^adm_prod_edit_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!requireAdmin(ctx)) return;
    const productId = ctx.match[1];
    const product = productService.getProductById(productId);
    if (!product) return;

    const text =
      `✏️ <b>EDIT PRODUK ${product.id}</b>\n\n` +
      `<b>Nama:</b> ${escapeHtml(product.name)}\n` +
      `<b>Harga:</b> ${formatCurrency(product.price)}\n` +
      `<b>Stok:</b> ${product.stock}\n` +
      `<b>Status:</b> ${formatProductStatus(product.status)}\n\n` +
      `Pilih field yang ingin diedit:`;

    const buttons = [
      [Markup.button.callback('📝 Nama', `adm_prod_ef_${productId}_name`)],
      [Markup.button.callback('💰 Harga', `adm_prod_ef_${productId}_price`)],
      [Markup.button.callback('📦 Stok', `adm_prod_ef_${productId}_stock`)],
      [Markup.button.callback('📋 Deskripsi', `adm_prod_ef_${productId}_description`)],
      [
        Markup.button.callback('✅ Aktif', `adm_prod_st_${productId}_active`),
        Markup.button.callback('⛔ Nonaktif', `adm_prod_st_${productId}_inactive`),
      ],
      [Markup.button.callback('🖼️ Upload/Ubah Foto', `adm_prod_photo_${productId}`)],
      navRow('admin_products'),
    ];

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    });
  });

  bot.action(/^adm_prod_ef_(.+)_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!requireAdmin(ctx)) return;
    const productId = ctx.match[1];
    const field = ctx.match[2];
    setAdminSession(ctx.from.id, { step: 'edit_product_field', data: { productId, field } });
    await ctx.reply(`✏️ Masukkan <b>${field}</b> baru:`, { parse_mode: 'HTML' });
  });

  bot.action(/^adm_prod_st_(.+)_(active|inactive)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const productId = ctx.match[1];
    const status = ctx.match[2];
    await productService.updateProduct(productId, { status });
    await ctx.answerCbQuery(`Status diubah ke ${status}`);
    await showAdminProducts(ctx, 0);
  });

  bot.action(/^adm_prod_del_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!requireAdmin(ctx)) return;
    await productService.deleteProduct(ctx.match[1]);
    await showAdminProducts(ctx, 0);
  });

  // ── Category Actions & CRUD ──
  bot.action('admin_categories', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showAdminCategories(ctx);
  });

  bot.action('adm_cat_add', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!requireAdmin(ctx)) return;
    setAdminSession(ctx.from.id, { step: 'add_cat_name', data: {} });
    await ctx.reply('🏷 Masukkan <b>nama kategori baru</b>:', { parse_mode: 'HTML' });
  });

  bot.action(/^adm_cat_edit_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!requireAdmin(ctx)) return;
    const catId = ctx.match[1];
    const category = productService.getCategoryById(catId);
    if (!category) return;

    const text =
      `✏️ <b>EDIT KATEGORI</b>\n\n` +
      `<b>ID:</b> ${category.id}\n` +
      `<b>Nama:</b> ${category.emoji} ${escapeHtml(category.name)}\n\n` +
      `Pilih field yang ingin diubah:`;

    const buttons = [
      [Markup.button.callback('📝 Nama Kategori', `adm_cat_ef_${catId}_name`)],
      [Markup.button.callback('🎨 Emoji Kategori', `adm_cat_ef_${catId}_emoji`)],
      navRow('admin_categories'),
    ];

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    });
  });

  bot.action(/^adm_cat_ef_(.+)_(name|emoji)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!requireAdmin(ctx)) return;
    const catId = ctx.match[1];
    const field = ctx.match[2];
    setAdminSession(ctx.from.id, { step: `edit_cat_${field}`, data: { catId } });
    await ctx.reply(`✏️ Masukkan <b>${field}</b> baru kategori:`, { parse_mode: 'HTML' });
  });

  bot.action(/^adm_cat_toggle_(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const catId = ctx.match[1];
    const category = productService.getCategoryById(catId);
    if (category) {
      const newStatus = category.status === 'active' ? 'inactive' : 'active';
      await productService.updateCategory(catId, { status: newStatus });
      await ctx.answerCbQuery(`Kategori diubah ke ${newStatus}`);
      await showAdminCategories(ctx);
    }
  });

  // ── Orders Actions & Quick Payment Status ──
  bot.action('admin_orders', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showAdminOrders(ctx, 0);
  });

  bot.action(/^adm_orders_page_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showAdminOrders(ctx, parseInt(ctx.match[1], 10));
  });

  bot.action(/^adm_order_(ORD-\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showAdminOrderDetail(ctx, ctx.match[1]);
  });

  // Quick Payment status action
  bot.action(/^adm_quick_pay_(ORD-\d+)_(paid|cancelled)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const orderId = ctx.match[1];
    const targetStatus = ctx.match[2];

    const result = await orderService.updateOrderStatus(orderId, targetStatus);
    if (!result.success) {
      await ctx.answerCbQuery(result.error);
      return;
    }

    const label = targetStatus === 'paid' ? '✅ Payment Berhasil' : '❌ Payment Gagal / Dibatalkan';
    await ctx.answerCbQuery(`Status payment: ${label}`);

    const order = orderService.getOrderById(orderId);
    if (order) {
      const notifText =
        `🔔 <b>STATUS PAYMENT DIUPDATE</b>\n\n` +
        `Order #${orderId}\n` +
        `Status: ${formatOrderStatus(targetStatus)}`;
      await messageService.notifyBuyer({ telegram: ctx.telegram }, order.buyerId, notifText);
    }

    await showAdminOrderDetail(ctx, orderId);
  });

  bot.action(/^adm_order_status_(ORD-\d+)_(.+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const orderId = ctx.match[1];
    const newStatus = ctx.match[2];

    const result = await orderService.updateOrderStatus(orderId, newStatus);
    if (!result.success) {
      await ctx.answerCbQuery(result.error);
      return;
    }

    await ctx.answerCbQuery(`Status diubah ke ${newStatus}`);
    await showAdminOrderDetail(ctx, orderId);
  });

  // ── Tickets ──
  bot.action('admin_tickets', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showAdminTickets(ctx, 0);
  });

  bot.action(/^adm_tickets_page_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showAdminTickets(ctx, parseInt(ctx.match[1], 10));
  });

  // ── Users ──
  bot.action('admin_users', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showAdminUsers(ctx, 0);
  });

  bot.action(/^adm_users_page_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showAdminUsers(ctx, parseInt(ctx.match[1], 10));
  });

  // ── Sellers ──
  bot.action('admin_sellers', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showAdminSellers(ctx);
  });

  bot.action('adm_seller_add', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!requireAdmin(ctx)) return;
    setAdminSession(ctx.from.id, { step: 'add_seller_tgid', data: {} });
    await ctx.reply(
      '👨‍💼 Masukkan <b>Telegram ID</b> user yang ingin dijadikan seller:\n\n' +
      '<i>User harus sudah mengirim /start ke bot.</i>',
      { parse_mode: 'HTML' }
    );
  });

  // ── Statistics ──
  bot.action('admin_stats', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showAdminStats(ctx);
  });

  // ── Admin Management ──

  // Kelola Admin page
  bot.action('adm_manage_admins', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showAdminManagement(ctx);
  });

  // User detail page
  bot.action(/^adm_user_detail_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    await showUserDetail(ctx, ctx.match[1]);
  });

  // Role set: promote/demote by user ID
  bot.action(/^adm_role_set_(.+)_(admin|seller|buyer)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const userId = ctx.match[1];
    const newRole = ctx.match[2];

    const user = userService.getUserById(userId);
    if (!user) {
      await ctx.answerCbQuery('User tidak ditemukan.');
      return;
    }

    // Protect super admin from demotion via bot
    if (config.ADMIN_IDS.includes(user.telegramId) && newRole !== 'admin') {
      await ctx.answerCbQuery('⚠️ Super Admin (.env) tidak bisa diubah via bot.');
      return;
    }

    await userService.updateRole(userId, newRole);
    const roleLabel = { admin: '⚙️ Admin', seller: '👨‍💼 Seller', buyer: '👤 Buyer' }[newRole];
    await ctx.answerCbQuery(`✅ Role diubah ke ${roleLabel}`);
    logger.info(`Admin ${ctx.from.id} set user ${userId} role to ${newRole}`);
    await showUserDetail(ctx, userId);
  });

  // Revoke admin by TG ID (from manage admins page)
  bot.action(/^adm_admin_revoke_(\d+)$/, async (ctx) => {
    if (!requireAdmin(ctx)) return;
    const telegramId = parseInt(ctx.match[1], 10);

    if (config.ADMIN_IDS.includes(telegramId)) {
      await ctx.answerCbQuery('⚠️ Super Admin (.env) tidak bisa dicabut.');
      return;
    }

    const user = userService.findByTelegramId(telegramId);
    if (!user) {
      await ctx.answerCbQuery('User tidak ditemukan.');
      return;
    }

    await userService.updateRole(user.id, 'buyer');
    await ctx.answerCbQuery(`✅ Admin ${user.firstName || user.username} berhasil dicabut.`);
    logger.info(`Admin ${ctx.from.id} revoked admin from TG ${telegramId}`);
    await showAdminManagement(ctx);
  });

  // Add admin prompt
  bot.action('adm_admin_add', async (ctx) => {
    await ctx.answerCbQuery().catch(() => {});
    if (!requireAdmin(ctx)) return;
    setAdminSession(ctx.from.id, { step: 'add_admin_tgid' });
    await ctx.reply(
      '⚙️ Masukkan <b>Telegram ID</b> user yang ingin dijadikan admin:\n\n' +
      '<i>User harus sudah mengirim /start ke bot terlebih dahulu.</i>',
      { parse_mode: 'HTML' }
    );
  });

  // /setadmin command (admin only)
  bot.command('setadmin', async (ctx) => {
    if (!requireAdmin(ctx)) {
      await ctx.reply('⛔ Akses ditolak.');
      return;
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      await ctx.reply(
        '⚙️ <b>Set Admin</b>\n\n' +
        'Cara penggunaan:\n' +
        '<code>/setadmin &lt;telegram_id&gt;</code>\n\n' +
        'Contoh: <code>/setadmin 123456789</code>\n\n' +
        'Untuk mencabut admin:\n' +
        '<code>/removeadmin &lt;telegram_id&gt;</code>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const telegramId = parseInt(args[0], 10);
    if (isNaN(telegramId)) {
      await ctx.reply('❌ Telegram ID harus berupa angka.', { parse_mode: 'HTML' });
      return;
    }

    const user = userService.findByTelegramId(telegramId);
    if (!user) {
      await ctx.reply(
        `❌ User dengan Telegram ID <code>${telegramId}</code> belum terdaftar.\n` +
        `User harus mengirim /start ke bot terlebih dahulu.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    await userService.updateRole(user.id, 'admin');
    logger.info(`/setadmin: ${ctx.from.id} promoted TG ${telegramId} to admin`);
    await ctx.reply(
      `✅ <b>Admin berhasil ditambahkan!</b>\n\n` +
      `<b>User:</b> ${escapeHtml(user.firstName || user.username || '-')}\n` +
      `<b>ID:</b> ${user.id}\n` +
      `<b>TG ID:</b> <code>${user.telegramId}</code>\n` +
      `<b>Role:</b> ⚙️ Admin`,
      { parse_mode: 'HTML' }
    );
  });

  // /removeadmin command
  bot.command('removeadmin', async (ctx) => {
    if (!requireAdmin(ctx)) {
      await ctx.reply('⛔ Akses ditolak.');
      return;
    }

    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      await ctx.reply(
        '⚙️ Cara penggunaan: <code>/removeadmin &lt;telegram_id&gt;</code>',
        { parse_mode: 'HTML' }
      );
      return;
    }

    const telegramId = parseInt(args[0], 10);
    if (isNaN(telegramId)) {
      await ctx.reply('❌ Telegram ID harus berupa angka.', { parse_mode: 'HTML' });
      return;
    }

    if (config.ADMIN_IDS.includes(telegramId)) {
      await ctx.reply('⚠️ <b>Super Admin (dari .env) tidak bisa dicabut via bot.</b>', { parse_mode: 'HTML' });
      return;
    }

    const user = userService.findByTelegramId(telegramId);
    if (!user) {
      await ctx.reply(
        `❌ User dengan Telegram ID <code>${telegramId}</code> tidak ditemukan.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    if (user.role !== 'admin') {
      await ctx.reply(
        `⚠️ User <b>${escapeHtml(user.firstName || user.username)}</b> bukan admin.`,
        { parse_mode: 'HTML' }
      );
      return;
    }

    await userService.updateRole(user.id, 'buyer');
    logger.info(`/removeadmin: ${ctx.from.id} revoked admin from TG ${telegramId}`);
    await ctx.reply(
      `✅ <b>Admin berhasil dicabut!</b>\n\n` +
      `<b>User:</b> ${escapeHtml(user.firstName || user.username || '-')}\n` +
      `<b>ID:</b> ${user.id}\n` +
      `<b>TG ID:</b> <code>${user.telegramId}</code>\n` +
      `<b>Role sekarang:</b> 👤 Buyer`,
      { parse_mode: 'HTML' }
    );
  });
}

module.exports = {
  register,
  handleAdminInput,
  handleAdminPhoto,
  getAdminSession,
  clearAdminSession,
};
