// ─────────────────────────────────────────────
// Database Abstraction Layer
// Thread-safe read/write for db.json
// ─────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const config = require('./config');
const logger = require('./utils/logger');

const DB_PATH = config.DB_PATH;
const MEDIA_DIR = path.join(__dirname, '..', 'media');
const ITEM_MEDIA_DIR = path.join(MEDIA_DIR, 'item');

// Ensure media directories exist
if (!fs.existsSync(MEDIA_DIR)) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}
if (!fs.existsSync(ITEM_MEDIA_DIR)) {
  fs.mkdirSync(ITEM_MEDIA_DIR, { recursive: true });
}

// ── Default database structure ──
const DEFAULT_DB = {
  users: [],
  products: [],
  categories: [
    {
      id: 'CAT-001',
      name: 'Premium',
      emoji: '⭐',
      description: 'Produk premium berkualitas tinggi',
      status: 'active',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'CAT-002',
      name: 'Software',
      emoji: '💻',
      description: 'Software dan lisensi digital',
      status: 'active',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'CAT-003',
      name: 'Jasa',
      emoji: '🎨',
      description: 'Jasa digital dan kreatif',
      status: 'active',
      createdAt: new Date().toISOString(),
    },
    {
      id: 'CAT-004',
      name: 'Digital',
      emoji: '📱',
      description: 'Produk digital lainnya',
      status: 'active',
      createdAt: new Date().toISOString(),
    },
  ],
  orders: [],
  tickets: [],
  messages: [],
  donations: [],
  settings: {
    currency: 'IDR',
    shopName: 'Marketplace Store',
    shopDescription: 'Selamat datang di Toko Marketplace Telegram Resmi!',
    shopLogo: null, // relative path e.g. "media/logo.jpg"
    qrisCode: '00020101021126570011ID.DANA.WWW011893600915390930088102099093008810303UMI51440014ID.CO.QRIS.WWW0215ID10254040171760303UMI5204737253033605802ID5910Jojo Store6010Kota Bogor61051634163046B01',
    maintenance: false,
    counters: {
      usrCounter: 10001,
      prdCounter: 10001,
      ordCounter: 10001,
      tktCounter: 10001,
      tktSupCounter: 10001,
      msgCounter: 10001,
      donCounter: 10001,
      catCounter: 5,
    },
  },
};

// ── Seed data ──
const SEED_PRODUCTS = [
  {
    id: 'PRD-10001',
    categoryId: 'CAT-001',
    name: 'Produk Premium',
    description: 'Produk premium dengan kualitas terbaik. Proses manual oleh seller berpengalaman.',
    price: 50000,
    stock: 10,
    status: 'active',
    sellerId: null,
    image: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'PRD-10002',
    categoryId: 'CAT-002',
    name: 'Software License',
    description: 'Lisensi software original. Aktivasi manual setelah pembayaran dikonfirmasi.',
    price: 150000,
    stock: 5,
    status: 'active',
    sellerId: null,
    image: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'PRD-10003',
    categoryId: 'CAT-003',
    name: 'Jasa Desain Grafis',
    description: 'Jasa desain grafis profesional. Konsultasi melalui ticket setelah order.',
    price: 100000,
    stock: 99,
    status: 'active',
    sellerId: null,
    image: null,
    createdAt: new Date().toISOString(),
  },
];

// ── Write Mutex ──
let writeChain = Promise.resolve();

/**
 * Read database from file
 * @returns {object}
 */
function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      logger.info('db.json not found, creating with default data...');
      const db = JSON.parse(JSON.stringify(DEFAULT_DB));
      db.products = SEED_PRODUCTS;
      db.settings.counters.prdCounter = 10004;
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
      return db;
    }
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    const db = JSON.parse(data);
    // Ensure all collections exist
    if (!db.users) db.users = [];
    if (!db.products) db.products = [];
    if (!db.categories) db.categories = [];
    if (!db.orders) db.orders = [];
    if (!db.tickets) db.tickets = [];
    if (!db.messages) db.messages = [];
    if (!db.donations) db.donations = [];
    if (!db.settings) db.settings = {};
    if (!db.settings.shopName) db.settings.shopName = 'Marketplace Store';
    if (!db.settings.shopDescription) db.settings.shopDescription = 'Selamat datang di Toko Marketplace Telegram!';
    if (db.settings.shopLogo === undefined) db.settings.shopLogo = null;
    if (!db.settings.qrisCode) {
      db.settings.qrisCode = '00020101021126570011ID.DANA.WWW011893600915390930088102099093008810303UMI51440014ID.CO.QRIS.WWW0215ID10254040171760303UMI5204737253033605802ID5910Jojo Store6010Kota Bogor61051634163046B01';
    }
    if (!db.settings.counters) db.settings.counters = {};
    if (!db.settings.counters.donCounter) db.settings.counters.donCounter = 10001;
    return db;
    return db;
  } catch (err) {
    logger.error('Failed to read db.json:', err.message);
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

/**
 * Write database to file (atomic via temp file + rename)
 * @param {object} db
 */
function writeDBSync(db) {
  try {
    const tmpPath = DB_PATH + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tmpPath, DB_PATH);
  } catch (err) {
    logger.error('Failed to write db.json:', err.message);
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
    } catch (e) {
      logger.error('Fallback write also failed:', e.message);
    }
  }
}

// ── Public API ──

const database = {
  get() {
    return readDB();
  },

  find(collection, query = {}) {
    const db = readDB();
    const items = db[collection] || [];
    if (Object.keys(query).length === 0) return items;

    return items.filter((item) => {
      return Object.entries(query).every(([key, val]) => item[key] === val);
    });
  },

  findOne(collection, query) {
    const db = readDB();
    const items = db[collection] || [];
    return items.find((item) => {
      return Object.entries(query).every(([key, val]) => item[key] === val);
    }) || null;
  },

  findById(collection, id) {
    return this.findOne(collection, { id });
  },

  insert(collection, buildItem) {
    return new Promise((resolve, reject) => {
      writeChain = writeChain.then(() => {
        try {
          const db = readDB();
          if (!db[collection]) db[collection] = [];
          const item = buildItem(db);
          db[collection].push(item);
          writeDBSync(db);
          resolve(item);
        } catch (err) {
          reject(err);
        }
      });
    });
  },

  update(collection, query, updates) {
    return new Promise((resolve, reject) => {
      writeChain = writeChain.then(() => {
        try {
          const db = readDB();
          const items = db[collection] || [];
          let updated = null;

          for (let i = 0; i < items.length; i++) {
            const match = Object.entries(query).every(([key, val]) => items[i][key] === val);
            if (match) {
              if (typeof updates === 'function') {
                items[i] = updates(items[i], db);
              } else {
                items[i] = { ...items[i], ...updates, updatedAt: new Date().toISOString() };
              }
              updated = items[i];
              break;
            }
          }

          if (updated) {
            writeDBSync(db);
          }
          resolve(updated);
        } catch (err) {
          reject(err);
        }
      });
    });
  },

  delete(collection, query) {
    return new Promise((resolve, reject) => {
      writeChain = writeChain.then(() => {
        try {
          const db = readDB();
          const items = db[collection] || [];
          const index = items.findIndex((item) => {
            return Object.entries(query).every(([key, val]) => item[key] === val);
          });

          if (index === -1) {
            resolve(null);
            return;
          }

          const deleted = items.splice(index, 1)[0];
          writeDBSync(db);
          resolve(deleted);
        } catch (err) {
          reject(err);
        }
      });
    });
  },

  count(collection, query = {}) {
    return this.find(collection, query).length;
  },

  mutate(mutator) {
    return new Promise((resolve, reject) => {
      writeChain = writeChain.then(() => {
        try {
          const db = readDB();
          mutator(db);
          writeDBSync(db);
          resolve(db);
        } catch (err) {
          reject(err);
        }
      });
    });
  },

  MEDIA_DIR,
  ITEM_MEDIA_DIR,
};

module.exports = database;
