// ─────────────────────────────────────────────
// Product & Category Service
// ─────────────────────────────────────────────
const database = require('../database');
const { generateId } = require('../utils/id');
const logger = require('../utils/logger');

/**
 * Create a new product
 * @param {object} data - { name, categoryId, description, price, stock, sellerId, image }
 * @returns {Promise<object>}
 */
async function createProduct(data) {
  const product = await database.insert('products', (db) => ({
    id: generateId(db, 'PRD'),
    categoryId: data.categoryId,
    name: data.name,
    description: data.description || '',
    price: Number(data.price) || 0,
    stock: Number(data.stock) || 0,
    status: 'active',
    sellerId: data.sellerId || null,
    image: data.image || null,
    createdAt: new Date().toISOString(),
  }));

  logger.info(`Product created: ${product.id} - ${product.name}`);
  return product;
}

/**
 * Get product by ID
 * @param {string} id
 * @returns {object|null}
 */
function getProductById(id) {
  return database.findById('products', id);
}

/**
 * Get all active products by category
 * @param {string} categoryId
 * @returns {Array}
 */
function getProductsByCategory(categoryId) {
  return database.find('products', { categoryId, status: 'active' });
}

/**
 * Get all products by seller
 * @param {string} sellerId
 * @returns {Array}
 */
function getProductsBySeller(sellerId) {
  return database.find('products', { sellerId });
}

/**
 * Get all products
 * @returns {Array}
 */
function getAllProducts() {
  return database.find('products');
}

/**
 * Update a product
 * @param {string} id
 * @param {object} updates
 * @returns {Promise<object|null>}
 */
async function updateProduct(id, updates) {
  const allowedFields = ['name', 'categoryId', 'description', 'price', 'stock', 'status', 'sellerId', 'image'];
  const sanitized = {};
  for (const [key, val] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      sanitized[key] = val;
    }
  }

  if (sanitized.stock !== undefined && Number(sanitized.stock) <= 0) {
    sanitized.status = 'out_of_stock';
    sanitized.stock = 0;
  }

  const updated = await database.update('products', { id }, sanitized);
  if (updated) {
    logger.info(`Product updated: ${id}`);
  }
  return updated;
}

/**
 * Delete (deactivate) a product
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function deleteProduct(id) {
  const updated = await database.update('products', { id }, { status: 'inactive' });
  if (updated) {
    logger.info(`Product deactivated: ${id}`);
  }
  return updated;
}

/**
 * Decrease stock
 * @param {string} id
 * @param {number} quantity
 * @returns {Promise<object|null>}
 */
async function decreaseStock(id, quantity = 1) {
  const product = getProductById(id);
  if (!product) return null;

  const newStock = Math.max(0, product.stock - quantity);
  const updates = { stock: newStock };
  if (newStock <= 0) {
    updates.status = 'out_of_stock';
  }

  return database.update('products', { id }, updates);
}

// ── Categories CRUD ──

/**
 * Get all active categories
 * @returns {Array}
 */
function getAllCategories() {
  return database.find('categories', { status: 'active' });
}

/**
 * Get all categories (including inactive)
 * @returns {Array}
 */
function getAllCategoriesRaw() {
  return database.find('categories');
}

/**
 * Get category by ID
 * @param {string} id
 * @returns {object|null}
 */
function getCategoryById(id) {
  return database.findById('categories', id);
}

/**
 * Create a new category
 * @param {object} data - { name, emoji, description }
 * @returns {Promise<object>}
 */
async function createCategory(data) {
  const category = await database.insert('categories', (db) => ({
    id: generateId(db, 'CAT', 5),
    name: data.name,
    emoji: data.emoji || '📦',
    description: data.description || '',
    status: 'active',
    createdAt: new Date().toISOString(),
  }));

  logger.info(`Category created: ${category.id} - ${category.name}`);
  return category;
}

/**
 * Update a category
 * @param {string} id
 * @param {object} updates - { name, emoji, description, status }
 * @returns {Promise<object|null>}
 */
async function updateCategory(id, updates) {
  const allowed = ['name', 'emoji', 'description', 'status'];
  const sanitized = {};
  for (const [k, v] of Object.entries(updates)) {
    if (allowed.includes(k)) sanitized[k] = v;
  }
  const updated = await database.update('categories', { id }, sanitized);
  if (updated) logger.info(`Category updated: ${id}`);
  return updated;
}

/**
 * Delete / deactivate a category
 * @param {string} id
 * @returns {Promise<object|null>}
 */
async function deleteCategory(id) {
  const updated = await database.update('categories', { id }, { status: 'inactive' });
  if (updated) logger.info(`Category deactivated: ${id}`);
  return updated;
}

// ── Shop Settings ──

/**
 * Get shop settings
 * @returns {object}
 */
function getShopSettings() {
  const db = database.get();
  return (
    db.settings || {
      currency: 'IDR',
      shopName: 'Marketplace Store',
      shopDescription: 'Selamat datang di Toko Marketplace Telegram!',
      shopLogo: null,
    }
  );
}

/**
 * Update shop settings
 * @param {object} updates - { shopName, shopDescription, shopLogo }
 * @returns {Promise<object>}
 */
async function updateShopSettings(updates) {
  await database.mutate((db) => {
    if (!db.settings) db.settings = {};
    if (updates.shopName !== undefined) db.settings.shopName = updates.shopName;
    if (updates.shopDescription !== undefined) db.settings.shopDescription = updates.shopDescription;
    if (updates.shopLogo !== undefined) db.settings.shopLogo = updates.shopLogo;
  });
  return getShopSettings();
}

module.exports = {
  createProduct,
  getProductById,
  getProductsByCategory,
  getProductsBySeller,
  getAllProducts,
  updateProduct,
  deleteProduct,
  decreaseStock,
  getAllCategories,
  getAllCategoriesRaw,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getShopSettings,
  updateShopSettings,
};
