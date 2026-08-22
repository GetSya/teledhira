// ─────────────────────────────────────────────
// Product & Category Service
// ─────────────────────────────────────────────
const database = require('../database');
const { generateId } = require('../utils/id');
const { formatNumberCurrency } = require('../utils/format');
const logger = require('../utils/logger');


/**
 * Create a new product
 * @param {object} data - { name, categoryId, description, price, stock, sellerId, image, duration, variant }
 * @returns {Promise<object>}
 */
async function createProduct(data) {
  const product = await database.insert('products', (db) => ({
    id: generateId(db, 'PRD'),
    categoryId: data.categoryId,
    name: data.name,
    duration: data.duration || null,
    variant: data.variant || null,
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
  const allowedFields = ['name', 'categoryId', 'description', 'price', 'stock', 'status', 'sellerId', 'image', 'duration', 'variant'];
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

/**
 * Get display label for button or item header
 * Format options:
 * - with variant: "Canva Pro (1 Bulan)"
 * - without variant: "Pulsa 10.000"
 * @param {object} product
 * @returns {string}
 */
function getProductDisplayLabel(product) {
  if (!product) return '';
  const name = product.name ? String(product.name).trim() : '';
  const variant = product.variant ? String(product.variant).trim() : '';
  if (variant) {
    if (name.toLowerCase().includes(variant.toLowerCase())) return name;
    return `${name} (${variant})`;
  }
  return name;
}

/**
 * Get line text for catalog summary list
 * e.g. "Canva Pro (1 Bulan) - 10.000 (Stok 90)"
 * @param {object} product
 * @returns {string}
 */
function getProductListLine(product) {
  if (!product) return '';
  const label = getProductDisplayLabel(product);
  const priceFormatted = formatNumberCurrency(product.price);
  return `${label} - ${priceFormatted} (Stok ${product.stock})`;
}

/**
 * Get distinct product groups in a category.
 * If multiple items have the same name (e.g. Canva Pro), they are grouped under that name.
 * @param {string} categoryId
 * @returns {Array} [{ name, items, count, hasVariants, sampleProduct }]
 */
function getProductGroupsByCategory(categoryId) {
  const products = getProductsByCategory(categoryId);
  const groupsMap = new Map();

  products.forEach((p) => {
    const key = p.name ? p.name.trim() : 'Unassigned';
    if (!groupsMap.has(key)) {
      groupsMap.set(key, []);
    }
    groupsMap.get(key).push(p);
  });

  const result = [];
  groupsMap.forEach((items, name) => {
    const hasVariants = items.length > 1 || items.some((i) => Boolean(i.variant));
    result.push({
      name,
      items,
      count: items.length,
      hasVariants,
      sampleProduct: items[0],
    });
  });

  return result;
}

/**
 * Get all active products matching categoryId and productName
 * @param {string} categoryId
 * @param {string} productName
 * @returns {Array}
 */
function getProductsByName(categoryId, productName) {
  const products = getProductsByCategory(categoryId);
  return products.filter((p) => p.name && p.name.trim().toLowerCase() === productName.trim().toLowerCase());
}

/**
 * Get label for variant button (e.g. "1 Bulan" or "Canva Pro")
 * @param {object} product
 * @returns {string}
 */
function getVariantDisplayLabel(product) {
  if (!product) return '';
  if (product.variant) return product.variant;
  return product.name;
}

/**
 * Get list line for variant view: e.g. "1 Bulan - 10.000 (Stok 90)"
 * @param {object} product
 * @returns {string}
 */
function getVariantListLine(product) {
  if (!product) return '';
  const label = getVariantDisplayLabel(product);
  const priceFormatted = formatNumberCurrency(product.price);
  return `${label} - ${priceFormatted} (Stok ${product.stock})`;
}


/**
 * Get all product groups across all categories (for Admin management).
 * Includes active products.
 * @returns {Array} [{ name, items, count, hasVariants, sampleProduct }]
 */
function getAllProductGroups() {
  const allProducts = getAllProducts().filter((p) => p.status !== 'inactive');
  const groupsMap = new Map();

  allProducts.forEach((p) => {
    const key = p.name ? p.name.trim() : 'Unassigned';
    if (!groupsMap.has(key)) {
      groupsMap.set(key, []);
    }
    groupsMap.get(key).push(p);
  });

  const result = [];
  groupsMap.forEach((items, name) => {
    const hasVariants = items.length > 1 || items.some((i) => Boolean(i.variant));
    result.push({
      name,
      items,
      count: items.length,
      hasVariants,
      sampleProduct: items[0],
    });
  });

  return result;
}

/**
 * Get all products (active & inactive) matching a name
 * @param {string} productName
 * @returns {Array}
 */
function getProductsByNameAll(productName) {
  const allProducts = getAllProducts();
  return allProducts.filter(
    (p) => p.name && p.name.trim().toLowerCase() === productName.trim().toLowerCase()
  );
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
  getProductDisplayLabel,
  getProductListLine,
  getProductGroupsByCategory,
  getProductsByName,
  getVariantDisplayLabel,
  getVariantListLine,
  getAllProductGroups,
  getProductsByNameAll,
};



