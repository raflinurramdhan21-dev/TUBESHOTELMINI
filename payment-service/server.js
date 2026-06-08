const express = require('express');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const DB_HOST = process.env.DB_HOST || 'payment-db';
const DB_NAME = process.env.DB_NAME || 'payment_db';
const DB_USER = process.env.DB_USER || 'payment_user';
const DB_PASSWORD = process.env.DB_PASSWORD || 'payment_password';
const DB_PORT = process.env.DB_PORT || 5432;
const PORT = process.env.PORT || 4000;

const pool = new Pool({
  host: DB_HOST,
  database: DB_NAME,
  user: DB_USER,
  password: DB_PASSWORD,
  port: DB_PORT,
});

// ── DB CONNECT WITH RETRY ──────────────────────────────
async function connectWithRetry(retries = 20, delay = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await pool.query('SELECT 1');
      console.log('Payment Service berhasil terhubung ke PostgreSQL');
      return;
    } catch (err) {
      console.log(`Menunggu PostgreSQL siap... percobaan ${attempt}`);
      console.log(err.message);
      await new Promise((res) => setTimeout(res, delay));
    }
  }
  throw new Error('Payment Service gagal terhubung ke PostgreSQL');
}

// ── INIT DATABASE ──────────────────────────────────────
async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id VARCHAR(36) PRIMARY KEY,
      order_id VARCHAR(100) NOT NULL,
      room_id INT NOT NULL,
      amount INT NOT NULL,
      currency VARCHAR(10) NOT NULL DEFAULT 'IDR',
      method VARCHAR(50) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'pending',
      description TEXT,
      paid_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const { rows } = await pool.query('SELECT COUNT(*) FROM payments');
  if (parseInt(rows[0].count) === 0) {
    await pool.query(`
      INSERT INTO payments (id, order_id, room_id, amount, currency, method, status, description)
      VALUES
        ($1, 'ORDER-001', 1, 300000, 'IDR', 'bank_transfer', 'paid',    'Pembayaran kamar 101'),
        ($2, 'ORDER-002', 3, 500000, 'IDR', 'cash',          'pending', 'Pembayaran kamar 201'),
        ($3, 'ORDER-003', 2, 300000, 'IDR', 'ewallet',       'failed',  'Pembayaran kamar 102 gagal')
    `, [uuidv4(), uuidv4(), uuidv4()]);
  }

  console.log('Database payment siap');
}

// ── HELPERS ────────────────────────────────────────────
const ALLOWED_METHODS = ['cash', 'bank_transfer', 'credit_card', 'debit_card', 'ewallet'];
const ALLOWED_STATUS  = ['pending', 'paid', 'failed', 'cancelled', 'refunded'];
const TRANSITIONS = {
  pending:   ['paid', 'failed', 'cancelled'],
  paid:      ['refunded'],
  failed:    ['pending'],
  cancelled: [],
  refunded:  [],
};

function rowToPayment(row) {
  return {
    id:          row.id,
    order_id:    row.order_id,
    room_id:     row.room_id,
    amount:      row.amount,
    currency:    row.currency,
    method:      row.method,
    status:      row.status,
    description: row.description,
    paid_at:     row.paid_at ? row.paid_at.toISOString() : null,
    created_at:  row.created_at ? row.created_at.toISOString() : null,
    updated_at:  row.updated_at ? row.updated_at.toISOString() : null,
  };
}

// ── HEALTH CHECK ───────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    service:   'payment-service',
    language:  'JavaScript',
    framework: 'Express',
    database:  'PostgreSQL',
    status:    'running',
  });
});

// ── GET ALL PAYMENTS ───────────────────────────────────
app.get('/payments', async (req, res) => {
  try {
    const { status, order_id, method } = req.query;
    let query  = 'SELECT * FROM payments WHERE 1=1';
    const params = [];

    if (status)   { params.push(status);   query += ` AND status = $${params.length}`; }
    if (order_id) { params.push(order_id); query += ` AND order_id = $${params.length}`; }
    if (method)   { params.push(method);   query += ` AND method = $${params.length}`; }

    query += ' ORDER BY created_at DESC';

    const { rows } = await pool.query(query, params);
    res.json({
      service:  'payment-service',
      database: 'PostgreSQL',
      data:     rows.map(rowToPayment),
    });
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil data pembayaran', error: err.message });
  }
});

// ── GET PAYMENT BY ID ──────────────────────────────────
app.get('/payments/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM payments WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Pembayaran tidak ditemukan' });
    res.json({ service: 'payment-service', database: 'PostgreSQL', data: rowToPayment(rows[0]) });
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil pembayaran', error: err.message });
  }
});

// ── GET PAYMENT BY ORDER ID ────────────────────────────
app.get('/payments/order/:orderId', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM payments WHERE order_id = $1', [req.params.orderId]);
    if (rows.length === 0) return res.status(404).json({ message: 'Pembayaran untuk order ini tidak ditemukan' });
    res.json({ service: 'payment-service', database: 'PostgreSQL', data: rowToPayment(rows[0]) });
  } catch (err) {
    res.status(500).json({ message: 'Gagal mengambil pembayaran', error: err.message });
  }
});

// ── CREATE PAYMENT ─────────────────────────────────────
app.post('/payments', async (req, res) => {
  try {
    // Support 'booking_id' dari booking-service sebagai 'order_id'
    const { booking_id, order_id: raw_order_id, room_id, amount, currency = 'IDR', method = 'bank_transfer', description } = req.body;
    const order_id = raw_order_id || booking_id;

    if (!order_id || room_id === undefined || amount === undefined)
      return res.status(400).json({ message: 'order_id (atau booking_id), room_id, dan amount wajib diisi' });

    if (amount <= 0)
      return res.status(400).json({ message: 'Amount harus lebih dari 0' });

    if (!ALLOWED_METHODS.includes(method))
      return res.status(400).json({ message: 'Method tidak valid', allowed_methods: ALLOWED_METHODS });

    // Cegah duplikat pending
    const dup = await pool.query(
      "SELECT id FROM payments WHERE order_id = $1 AND status = 'pending'", [order_id]
    );
    if (dup.rows.length > 0)
      return res.status(409).json({ message: `Pembayaran untuk order '${order_id}' sudah dalam status pending` });

    const id = uuidv4();
    const { rows } = await pool.query(`
      INSERT INTO payments (id, order_id, room_id, amount, currency, method, status, description)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
      RETURNING *
    `, [id, order_id, room_id, amount, currency, method, description]);

    res.status(201).json({
      service:  'payment-service',
      message:  'Pembayaran berhasil dibuat',
      data:     rowToPayment(rows[0]),
    });
  } catch (err) {
    res.status(500).json({ message: 'Gagal membuat pembayaran', error: err.message });
  }
});

// ── UPDATE STATUS ──────────────────────────────────────
app.patch('/payments/:id/status', async (req, res) => {
  try {
    const { status } = req.body;

    if (!ALLOWED_STATUS.includes(status))
      return res.status(400).json({ message: 'Status tidak valid', allowed_status: ALLOWED_STATUS });

    const { rows } = await pool.query('SELECT status FROM payments WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Pembayaran tidak ditemukan' });

    const current = rows[0].status;
    if (!TRANSITIONS[current].includes(status))
      return res.status(422).json({ message: `Tidak bisa mengubah status dari '${current}' ke '${status}'` });

    const paidAt = status === 'paid' ? ', paid_at = CURRENT_TIMESTAMP' : '';
    const { rows: updated } = await pool.query(`
      UPDATE payments
      SET status = $1, updated_at = CURRENT_TIMESTAMP ${paidAt}
      WHERE id = $2
      RETURNING *
    `, [status, req.params.id]);

    res.json({
      service: 'payment-service',
      message: 'Status pembayaran berhasil diperbarui',
      data:    rowToPayment(updated[0]),
    });
  } catch (err) {
    res.status(500).json({ message: 'Gagal memperbarui status', error: err.message });
  }
});

// ── CANCEL PAYMENT ─────────────────────────────────────
app.patch('/payments/:id/cancel', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT status FROM payments WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Pembayaran tidak ditemukan' });

    if (rows[0].status !== 'pending')
      return res.status(422).json({
        message: `Hanya pembayaran berstatus 'pending' yang bisa dibatalkan, status saat ini: '${rows[0].status}'`,
      });

    const { rows: updated } = await pool.query(`
      UPDATE payments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING *
    `, [req.params.id]);

    res.json({
      service: 'payment-service',
      message: 'Pembayaran berhasil dibatalkan',
      data:    rowToPayment(updated[0]),
    });
  } catch (err) {
    res.status(500).json({ message: 'Gagal membatalkan pembayaran', error: err.message });
  }
});

// ── DELETE PAYMENT ─────────────────────────────────────
app.delete('/payments/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM payments WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ message: 'Pembayaran tidak ditemukan' });
    res.json({ service: 'payment-service', message: 'Pembayaran berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: 'Gagal menghapus pembayaran', error: err.message });
  }
});

// ── START SERVER ───────────────────────────────────────
async function start() {
  await connectWithRetry();
  await initDatabase();
  app.listen(PORT, () => {
    console.log(`Payment Service berjalan di http://localhost:${PORT}`);
  });
}

start();