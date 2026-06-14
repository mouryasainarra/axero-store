// db.js — Postgres (Supabase-ready) data layer for AXERO
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('\nMissing DATABASE_URL. Copy your Supabase connection string into .env (Project → Settings → Database → Connection string → URI).\n');
}
// Supabase (and any remote host) needs SSL; a local Postgres does not.
const isLocal = /localhost|127\.0\.0\.1/.test(connectionString || '');
const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false }
});

// create tables once, before any query runs
const ready = (async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Suits',
      gender TEXT NOT NULL DEFAULT 'Men',
      description TEXT DEFAULT '',
      price INTEGER NOT NULL,
      cost INTEGER DEFAULT 0,
      compare_at INTEGER,
      image_url TEXT DEFAULT '',
      sizes TEXT DEFAULT 'S,M,L,XL,XXL',
      stock INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS pending_orders (
      id SERIAL PRIMARY KEY,
      rzp_order_id TEXT UNIQUE, amount INTEGER, items_json TEXT, shipping_json TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      rzp_order_id TEXT UNIQUE, rzp_payment_id TEXT,
      name TEXT, email TEXT, phone TEXT, address TEXT, city TEXT, pincode TEXT,
      amount_total INTEGER, currency TEXT, status TEXT DEFAULT 'paid',
      items_json TEXT, created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
})().catch(e => console.error('DB init error:', e.message));

async function q(text, params) { await ready; return pool.query(text, params); }

module.exports = {
  ready,
  async allProducts(){ return (await q('SELECT * FROM products ORDER BY created_at DESC, id DESC')).rows; },
  async activeProducts(){ return (await q('SELECT * FROM products WHERE active=1 ORDER BY created_at DESC, id DESC')).rows; },
  async getProduct(id){ return (await q('SELECT * FROM products WHERE id=$1', [id])).rows[0]; },
  async createProduct(p){ return (await q(
    `INSERT INTO products (name,category,gender,description,price,cost,compare_at,image_url,sizes,stock,active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [p.name,p.category,p.gender,p.description,p.price,p.cost,p.compare_at,p.image_url,p.sizes,p.stock,p.active])).rows[0]; },
  async updateProduct(id,p){ return q(
    `UPDATE products SET name=$1,category=$2,gender=$3,description=$4,price=$5,cost=$6,compare_at=$7,image_url=$8,sizes=$9,stock=$10,active=$11 WHERE id=$12`,
    [p.name,p.category,p.gender,p.description,p.price,p.cost,p.compare_at,p.image_url,p.sizes,p.stock,p.active,id]); },
  async deleteProduct(id){ return q('DELETE FROM products WHERE id=$1', [id]); },
  async decrementStock(id,qty){ return q('UPDATE products SET stock=GREATEST(stock-$1,0) WHERE id=$2', [qty,id]); },

  async createPending(o){ return q(
    `INSERT INTO pending_orders (rzp_order_id,amount,items_json,shipping_json) VALUES ($1,$2,$3,$4)`,
    [o.rzp_order_id,o.amount,o.items_json,o.shipping_json]); },
  async getPending(id){ return (await q('SELECT * FROM pending_orders WHERE rzp_order_id=$1', [id])).rows[0]; },
  async deletePending(id){ return q('DELETE FROM pending_orders WHERE rzp_order_id=$1', [id]); },

  async createOrder(o){ return (await q(
    `INSERT INTO orders (rzp_order_id,rzp_payment_id,name,email,phone,address,city,pincode,amount_total,currency,status,items_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (rzp_order_id) DO NOTHING RETURNING id`,
    [o.rzp_order_id,o.rzp_payment_id,o.name,o.email,o.phone,o.address,o.city,o.pincode,o.amount_total,o.currency,o.status,o.items_json])).rows[0]; },
  async getOrder(id){ return (await q('SELECT * FROM orders WHERE id=$1', [id])).rows[0]; },
  async getOrderByRzp(id){ return (await q('SELECT * FROM orders WHERE rzp_order_id=$1', [id])).rows[0]; },
  async allOrders(){ return (await q('SELECT * FROM orders ORDER BY created_at DESC, id DESC')).rows; }
};
