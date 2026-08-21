# 🛍 Telegram Marketplace Bot

Bot Telegram marketplace untuk penjualan produk/jasa dengan sistem order, ticket/chat relay, dan manajemen admin/seller.

## Fitur

- 🛍 **Marketplace** — Katalog produk dengan kategori dinamis
- 📦 **Order Management** — Buat, bayar, batalkan order dengan state machine
- 🎫 **Ticket System** — Chat relay buyer ↔ bot ↔ seller/admin
- 👨‍💼 **Seller Panel** — Kelola produk, order masuk, ticket masuk
- ⚙️ **Admin Panel** — Full management (produk, kategori, order, ticket, user, seller, statistik)
- 📞 **Support Ticket** — Ticket bantuan (tidak terkait order)
- 🔔 **Notifikasi** — Auto-notify buyer, seller, admin
- 💾 **Persistence** — Database JSON, data aman saat restart

## Requirements

- **Node.js** v16 atau lebih baru
- **Telegram Bot Token** (dari [@BotFather](https://t.me/BotFather))

## Installation

### 1. Clone/Download Project

```bash
cd telegram-marketplace
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Setup Environment

Salin `.env.example` menjadi `.env`:

```bash
cp .env.example .env
```

Edit `.env`:

```env
BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
ADMIN_IDS=123456789
```

- `BOT_TOKEN`: Token dari BotFather
- `ADMIN_IDS`: Telegram ID admin (pisahkan dengan koma untuk multiple admin)

> 💡 Untuk mengetahui Telegram ID Anda, kirim pesan ke [@userinfobot](https://t.me/userinfobot)

### 4. Menjalankan Bot

**Production:**
```bash
npm start
```

**Development (auto-restart):**
```bash
npm run dev
```

## Struktur Database

Database disimpan di `db.json` (otomatis dibuat saat pertama kali dijalankan):

```json
{
  "users": [],
  "products": [],
  "categories": [],
  "orders": [],
  "tickets": [],
  "messages": [],
  "settings": {}
}
```

### User
```json
{
  "id": "USR-10001",
  "telegramId": 123456789,
  "username": "username",
  "firstName": "User",
  "role": "buyer",
  "balance": 0,
  "status": "active",
  "createdAt": "2026-08-21T00:00:00.000Z"
}
```

### Product
```json
{
  "id": "PRD-10001",
  "categoryId": "CAT-001",
  "name": "Produk Premium",
  "description": "Deskripsi produk",
  "price": 50000,
  "stock": 10,
  "status": "active",
  "sellerId": "USR-20001",
  "createdAt": "2026-08-21T00:00:00.000Z"
}
```

### Order
```json
{
  "id": "ORD-10001",
  "buyerId": "USR-10001",
  "sellerId": "USR-20001",
  "productId": "PRD-10001",
  "quantity": 1,
  "total": 50000,
  "status": "pending",
  "ticketId": "TKT-10001",
  "createdAt": "2026-08-21T00:00:00.000Z"
}
```

### Ticket
```json
{
  "id": "TKT-10001",
  "orderId": "ORD-10001",
  "buyerId": "USR-10001",
  "sellerId": "USR-20001",
  "status": "open",
  "createdAt": "2026-08-21T00:00:00.000Z"
}
```

### Message
```json
{
  "id": "MSG-10001",
  "ticketId": "TKT-10001",
  "senderId": "USR-10001",
  "senderRole": "buyer",
  "message": "Halo, saya mau tanya.",
  "createdAt": "2026-08-21T00:00:00.000Z"
}
```

## Cara Menambah Seller

1. User harus mengirim `/start` ke bot terlebih dahulu
2. Admin buka **Admin Panel** → **Sellers** → **Tambah Seller**
3. Masukkan Telegram ID user yang ingin dijadikan seller

## Cara Menambah Produk

1. Admin buka **Admin Panel** → **Produk** → **Tambah Produk**
2. Masukkan nama, kategori, deskripsi, harga, dan stok

## Cara Testing Order

1. Buka bot → **Marketplace** → Pilih kategori → Pilih produk
2. Klik **🛒 Beli Sekarang**
3. Order dan ticket otomatis dibuat
4. Klik **🎫 Buka Ticket** untuk memulai chat
5. Kirim pesan → pesan diteruskan ke seller/admin

## Cara Testing Ticket

1. Setelah order dibuat, klik **🎫 Buka Ticket**
2. Kirim pesan teks → pesan diteruskan ke seller/admin
3. Seller/admin menerima pesan dan bisa reply
4. Reply seller/admin diteruskan kembali ke buyer
5. Untuk menutup ticket, klik **❌ Tutup Ticket**

## Cara Backup db.json

```bash
# Backup
cp db.json db.json.backup

# Restore
cp db.json.backup db.json
```

## Alur Order

```
Buyer memilih produk
    ↓
Klik "Beli Sekarang"
    ↓
Order dibuat (status: pending → waiting_payment)
    ↓
Ticket otomatis dibuat
    ↓
Buyer klik "Saya Sudah Bayar" (status: payment_review)
    ↓
Admin/Seller verifikasi (status: paid → processing)
    ↓
Order selesai (status: completed)
```

## Status Order

| Status | Keterangan |
|--------|------------|
| `pending` | Order baru dibuat |
| `waiting_payment` | Menunggu pembayaran |
| `payment_review` | Pembayaran sedang diverifikasi |
| `paid` | Pembayaran dikonfirmasi |
| `processing` | Order sedang diproses |
| `completed` | Order selesai |
| `cancelled` | Order dibatalkan |
| `refunded` | Dana dikembalikan |

## Status Ticket

| Status | Keterangan |
|--------|------------|
| `open` | Ticket baru dibuat |
| `waiting` | Menunggu balasan |
| `processing` | Sedang diproses |
| `closed` | Ticket ditutup |

## Struktur Project

```
├── src/
│   ├── bot.js                 # Main bot + middleware
│   ├── config.js              # Environment config
│   ├── database.js            # Thread-safe db.json abstraction
│   ├── handlers/
│   │   ├── start.js           # /start, main menu
│   │   ├── marketplace.js     # Kategori & produk listing
│   │   ├── product.js         # Detail produk & beli
│   │   ├── order.js           # Manajemen order (buyer)
│   │   ├── ticket.js          # Ticket & chat relay
│   │   ├── admin.js           # Admin panel
│   │   ├── seller.js          # Seller panel
│   │   ├── support.js         # Support ticket
│   │   └── account.js         # Profil user
│   ├── services/
│   │   ├── orderService.js    # Order CRUD + state machine
│   │   ├── ticketService.js   # Ticket CRUD + message
│   │   ├── productService.js  # Produk CRUD
│   │   ├── userService.js     # User registration & role
│   │   └── messageService.js  # Telegram message helpers
│   └── utils/
│       ├── id.js              # ID generator
│       ├── format.js          # Currency, date, status format
│       ├── keyboard.js        # Inline keyboard builders
│       └── logger.js          # Console logger
├── index.js                   # Entry point
├── db.json                    # Database (auto-created)
├── package.json
├── .env                       # Environment variables
├── .env.example               # Template
├── .gitignore
└── README.md
```

## License

ISC
