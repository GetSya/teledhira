// ─────────────────────────────────────────────
// Order Service
// Status state machine + CRUD
// ─────────────────────────────────────────────
const database = require('../database');
const { generateId } = require('../utils/id');
const logger = require('../utils/logger');

// ── Valid status transitions ──
const VALID_TRANSITIONS = {
  pending: ['waiting_payment', 'paid', 'cancelled'],
  waiting_payment: ['payment_review', 'paid', 'cancelled'],
  payment_review: ['paid', 'waiting_payment', 'cancelled'],
  paid: ['processing', 'completed', 'refunded'],
  processing: ['completed', 'refunded'],
  completed: [],
  cancelled: [],
  refunded: [],
};


/**
 * Check if a status transition is valid
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
function isValidTransition(from, to) {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

/**
 * Create a new order
 * @param {object} data - { buyerId, sellerId, productId, productName, quantity, price }
 * @returns {Promise<object>}
 */
async function createOrder(data) {
  const total = (Number(data.price) || 0) * (Number(data.quantity) || 1);

  const order = await database.insert('orders', (db) => ({
    id: generateId(db, 'ORD'),
    buyerId: data.buyerId,
    sellerId: data.sellerId || null,
    productId: data.productId,
    productName: data.productName || '',
    quantity: Number(data.quantity) || 1,
    price: Number(data.price) || 0,
    total,
    status: 'pending',
    ticketId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  logger.info(`Order created: ${order.id} by ${data.buyerId}`);
  return order;
}

/**
 * Update order status with state machine validation
 * @param {string} orderId
 * @param {string} newStatus
 * @returns {Promise<{success: boolean, order?: object, error?: string}>}
 */
async function updateOrderStatus(orderId, newStatus) {
  const order = database.findById('orders', orderId);
  if (!order) {
    return { success: false, error: 'Order tidak ditemukan.' };
  }

  if (!isValidTransition(order.status, newStatus)) {
    return {
      success: false,
      error: `Tidak dapat mengubah status dari "${order.status}" ke "${newStatus}".`,
    };
  }

  const updated = await database.update('orders', { id: orderId }, {
    status: newStatus,
    updatedAt: new Date().toISOString(),
  });

  logger.info(`Order ${orderId} status: ${order.status} → ${newStatus}`);
  return { success: true, order: updated };
}

/**
 * Set ticket ID on an order
 * @param {string} orderId
 * @param {string} ticketId
 * @returns {Promise<object|null>}
 */
async function setTicketId(orderId, ticketId) {
  return database.update('orders', { id: orderId }, { ticketId });
}

/**
 * Get order by ID
 * @param {string} id
 * @returns {object|null}
 */
function getOrderById(id) {
  return database.findById('orders', id);
}

/**
 * Get orders by buyer
 * @param {string} buyerId
 * @returns {Array}
 */
function getOrdersByBuyer(buyerId) {
  return database.find('orders', { buyerId }).sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/**
 * Get orders by seller
 * @param {string} sellerId
 * @returns {Array}
 */
function getOrdersBySeller(sellerId) {
  return database.find('orders', { sellerId }).sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/**
 * Get all orders
 * @returns {Array}
 */
function getAllOrders() {
  return database.find('orders').sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/**
 * Get valid next statuses for an order
 * @param {string} currentStatus
 * @returns {Array<string>}
 */
function getNextStatuses(currentStatus) {
  return VALID_TRANSITIONS[currentStatus] || [];
}

module.exports = {
  createOrder,
  updateOrderStatus,
  setTicketId,
  getOrderById,
  getOrdersByBuyer,
  getOrdersBySeller,
  getAllOrders,
  getNextStatuses,
  isValidTransition,
};
