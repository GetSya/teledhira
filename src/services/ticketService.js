// ─────────────────────────────────────────────
// Ticket Service
// Ticket CRUD + message management
// ─────────────────────────────────────────────
const database = require('../database');
const { generateId, generateSupportTicketId } = require('../utils/id');
const logger = require('../utils/logger');

/**
 * Create a ticket for an order
 * @param {object} data - { orderId, buyerId, sellerId }
 * @returns {Promise<object>}
 */
async function createTicket(data) {
  const ticket = await database.insert('tickets', (db) => ({
    id: generateId(db, 'TKT'),
    orderId: data.orderId,
    type: 'order',
    buyerId: data.buyerId,
    sellerId: data.sellerId || null,
    assignedAdminId: null,
    category: null,
    status: 'open',
    createdAt: new Date().toISOString(),
    closedAt: null,
  }));

  logger.info(`Ticket created: ${ticket.id} for order ${data.orderId}`);
  return ticket;
}

/**
 * Create a support ticket (not tied to an order)
 * @param {object} data - { buyerId, category }
 * @returns {Promise<object>}
 */
async function createSupportTicket(data) {
  const ticket = await database.insert('tickets', (db) => ({
    id: generateSupportTicketId(db),
    orderId: null,
    type: 'support',
    buyerId: data.buyerId,
    sellerId: null,
    assignedAdminId: null,
    category: data.category || 'other',
    status: 'open',
    createdAt: new Date().toISOString(),
    closedAt: null,
  }));

  logger.info(`Support ticket created: ${ticket.id} by ${data.buyerId}`);
  return ticket;
}

/**
 * Close a ticket
 * @param {string} ticketId
 * @returns {Promise<object|null>}
 */
async function closeTicket(ticketId) {
  const updated = await database.update('tickets', { id: ticketId }, {
    status: 'closed',
    closedAt: new Date().toISOString(),
  });
  if (updated) {
    logger.info(`Ticket closed: ${ticketId}`);
  }
  return updated;
}

/**
 * Update ticket status
 * @param {string} ticketId
 * @param {string} status
 * @returns {Promise<object|null>}
 */
async function updateTicketStatus(ticketId, status) {
  const updates = { status };
  if (status === 'closed') {
    updates.closedAt = new Date().toISOString();
  }
  return database.update('tickets', { id: ticketId }, updates);
}

/**
 * Assign admin to ticket
 * @param {string} ticketId
 * @param {string} adminId
 * @returns {Promise<object|null>}
 */
async function assignAdmin(ticketId, adminId) {
  return database.update('tickets', { id: ticketId }, { assignedAdminId: adminId });
}

/**
 * Assign seller to ticket
 * @param {string} ticketId
 * @param {string} sellerId
 * @returns {Promise<object|null>}
 */
async function assignSeller(ticketId, sellerId) {
  return database.update('tickets', { id: ticketId }, { sellerId });
}

/**
 * Add a message to a ticket
 * @param {object} data - { ticketId, senderId, senderRole, message, messageType }
 * @returns {Promise<object>}
 */
async function addMessage(data) {
  const msg = await database.insert('messages', (db) => ({
    id: generateId(db, 'MSG'),
    ticketId: data.ticketId,
    senderId: data.senderId,
    senderRole: data.senderRole || 'buyer',
    messageType: data.messageType || 'text',
    message: data.message || '',
    createdAt: new Date().toISOString(),
  }));

  // Update ticket status to processing if it was open/waiting
  const ticket = database.findById('tickets', data.ticketId);
  if (ticket && (ticket.status === 'open' || ticket.status === 'waiting')) {
    await database.update('tickets', { id: data.ticketId }, { status: 'processing' });
  }

  return msg;
}

/**
 * Get ticket by ID
 * @param {string} id
 * @returns {object|null}
 */
function getTicketById(id) {
  return database.findById('tickets', id);
}

/**
 * Get tickets by buyer
 * @param {string} buyerId
 * @returns {Array}
 */
function getTicketsByBuyer(buyerId) {
  return database.find('tickets', { buyerId }).sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/**
 * Get tickets by seller
 * @param {string} sellerId
 * @returns {Array}
 */
function getTicketsBySeller(sellerId) {
  return database.find('tickets', { sellerId }).sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/**
 * Get all tickets
 * @returns {Array}
 */
function getAllTickets() {
  return database.find('tickets').sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/**
 * Get open tickets
 * @returns {Array}
 */
function getOpenTickets() {
  return database.find('tickets').filter((t) => t.status !== 'closed');
}

/**
 * Get messages for a ticket
 * @param {string} ticketId
 * @returns {Array}
 */
function getMessages(ticketId) {
  return database.find('messages', { ticketId }).sort((a, b) =>
    new Date(a.createdAt) - new Date(b.createdAt)
  );
}

module.exports = {
  createTicket,
  createSupportTicket,
  closeTicket,
  updateTicketStatus,
  assignAdmin,
  assignSeller,
  addMessage,
  getTicketById,
  getTicketsByBuyer,
  getTicketsBySeller,
  getAllTickets,
  getOpenTickets,
  getMessages,
};
