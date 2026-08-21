// ─────────────────────────────────────────────
// Cart Service
// ─────────────────────────────────────────────
const database = require('../database');
const productService = require('./productService');

/**
 * Get cart for a user
 * @param {string} userId - internal user ID
 * @returns {Array<{productId: string, quantity: number}>}
 */
function getCart(userId) {
  const user = database.findById('users', userId);
  return (user && user.cart) || [];
}

/**
 * Add product to cart
 * @param {string} userId
 * @param {string} productId
 * @param {number} [quantity=1]
 * @returns {Promise<Array>} updated cart
 */
async function addToCart(userId, productId, quantity = 1) {
  const product = productService.getProductById(productId);
  if (!product || product.stock <= 0) return null;

  let userCart = getCart(userId);
  const index = userCart.findIndex((item) => item.productId === productId);

  if (index > -1) {
    userCart[index].quantity += quantity;
  } else {
    userCart.push({ productId, quantity });
  }

  await database.update('users', { id: userId }, { cart: userCart });
  return userCart;
}

/**
 * Update quantity of a product in cart
 * @param {string} userId
 * @param {string} productId
 * @param {number} quantity
 * @returns {Promise<Array>}
 */
async function updateCartItem(userId, productId, quantity) {
  let userCart = getCart(userId);
  if (quantity <= 0) {
    userCart = userCart.filter((item) => item.productId !== productId);
  } else {
    const item = userCart.find((i) => i.productId === productId);
    if (item) item.quantity = quantity;
  }

  await database.update('users', { id: userId }, { cart: userCart });
  return userCart;
}

/**
 * Remove item from cart
 * @param {string} userId
 * @param {string} productId
 * @returns {Promise<Array>}
 */
async function removeFromCart(userId, productId) {
  return updateCartItem(userId, productId, 0);
}

/**
 * Clear user cart
 * @param {string} userId
 * @returns {Promise<Array>} empty cart
 */
async function clearCart(userId) {
  await database.update('users', { id: userId }, { cart: [] });
  return [];
}

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
};
