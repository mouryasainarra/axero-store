// db.js — Postgres (Supabase-ready) data layer for AXERO
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('\nMissing DATABASE_URL. Copy your Supabase connection string into .env (Project → Settings → Database → Connection string → URI).\n');
}
const isLocal = /localhost|127\.0\.0\.1/.test(connectionString || '');
const pool = new Pool({ connectionString, ssl: isLocal ? false : { rejectUnauthorized: false } });

const ready = (async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY, name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Suits', gender TEXT NOT NULL DEFAULT 'Men',
      description TEXT DEFAULT '', price INTEGER NOT NULL, cost INTEGER DEFAULT 0,
      compare_at INTEGER, image_url TEXT DEFAULT '', sizes TEXT DEFAULT 'S,M,L,XL,XXL',
      stock INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
      featured INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS pending_orders (
      id SERIAL PRIMARY KEY, rzp_order_id TEXT UNIQUE, amount INTEGER,
      items_json TEXT, shipping_json TEXT, created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY, rzp_order_id TEXT UNIQUE, rzp_payment_id TEXT,
      name TEXT, email TEXT, phone TEXT, address TEXT, city TEXT, pincode TEXT,
      amount_total INTEGER, currency TEXT, status TEXT DEFAULT 'paid',
      items_json TEXT, created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY, product_id INTEGER, name TEXT, rating INTEGER NOT NULL,
      comment TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS subscribers (
      id SERIAL PRIMARY KEY, email TEXT UNIQUE, created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS product_images (
      id SERIAL PRIMARY KEY, product_id INTEGER, mime TEXT, data BYTEA, created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS discounts (
      id SERIAL PRIMARY KEY, code TEXT UNIQUE, type TEXT DEFAULT 'percent',
      value INTEGER NOT NULL, min_amount INTEGER DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ DEFAULT now()
    );
    ALTER TABLE products ADD COLUMN IF NOT EXISTS featured INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT DEFAULT '';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS material TEXT DEFAULT '';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS fit TEXT DEFAULT '';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS care TEXT DEFAULT '';
    ALTER TABLE products ADD COLUMN IF NOT EXISTS details TEXT DEFAULT '';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'online';
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount INTEGER DEFAULT 0;
  `);
})().catch(e => console.error('DB init error:', e.message));

async function q(text, params) { await ready; return pool.query(text, params); }

module.exports = {
  ready,
  async allProducts(){ return (await q('SELECT * FROM products ORDER BY created_at DESC, id DESC')).rows; },
  async activeProducts(){ return (await q('SELECT * FROM products WHERE active=1 ORDER BY created_at DESC, id DESC')).rows; },
  async getProduct(id){ return (await q('SELECT * FROM products WHERE id=$1', [id])).rows[0]; },
  async featuredProducts(limit){ return (await q('SELECT * FROM products WHERE active=1 AND featured=1 ORDER BY created_at DESC LIMIT $1', [limit||8])).rows; },
  async saleProducts(){ return (await q('SELECT * FROM products WHERE active=1 AND compare_at IS NOT NULL AND compare_at>price ORDER BY (compare_at-price) DESC').catch(()=>({rows:[]}))).rows; },
  async searchProducts(term){
    const t = '%' + (term||'').toLowerCase() + '%';
    return (await q(`SELECT * FROM products WHERE active=1 AND (LOWER(name) LIKE $1 OR LOWER(category) LIKE $1 OR LOWER(description) LIKE $1) ORDER BY created_at DESC`, [t])).rows;
  },
  async relatedProducts(product, limit){
    const rows = (await q(`SELECT * FROM products WHERE active=1 AND id<>$1 AND gender=$2 AND category=$3 ORDER BY created_at DESC LIMIT $4`,
      [product.id, product.gender, product.category, limit||4])).rows;
    if (rows.length >= (limit||4)) return rows;
    const more = (await q(`SELECT * FROM products WHERE active=1 AND id<>$1 AND gender=$2 AND category<>$3 ORDER BY created_at DESC LIMIT $4`,
      [product.id, product.gender, product.category, (limit||4)-rows.length])).rows;
    return rows.concat(more);
  },
  async createProduct(p){ return (await q(
    `INSERT INTO products (name,category,gender,description,price,cost,compare_at,image_url,sizes,stock,active,featured,images,material,fit,care,details)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
    [p.name,p.category,p.gender,p.description,p.price,p.cost,p.compare_at,p.image_url,p.sizes,p.stock,p.active,p.featured||0,p.images||'',p.material||'',p.fit||'',p.care||'',p.details||''])).rows[0]; },
  async updateProduct(id,p){ return q(
    `UPDATE products SET name=$1,category=$2,gender=$3,description=$4,price=$5,cost=$6,compare_at=$7,image_url=$8,sizes=$9,stock=$10,active=$11,featured=$12,images=$13,material=$14,fit=$15,care=$16,details=$17 WHERE id=$18`,
    [p.name,p.category,p.gender,p.description,p.price,p.cost,p.compare_at,p.image_url,p.sizes,p.stock,p.active,p.featured||0,p.images||'',p.material||'',p.fit||'',p.care||'',p.details||'',id]); },
  async deleteProduct(id){ return q('DELETE FROM products WHERE id=$1', [id]); },
  async decrementStock(id,qty){ return q('UPDATE products SET stock=GREATEST(stock-$1,0) WHERE id=$2', [qty,id]); },

  // ---- uploaded product images (stored in DB, served at /img/:id) ----
  async addImage(productId, mime, buffer){ return (await q('INSERT INTO product_images (product_id,mime,data) VALUES ($1,$2,$3) RETURNING id', [productId, mime, buffer])).rows[0]; },
  async getProductImages(productId){ return (await q('SELECT id, mime FROM product_images WHERE product_id=$1 ORDER BY id', [productId])).rows; },
  async getImage(id){ return (await q('SELECT mime, data FROM product_images WHERE id=$1', [id])).rows[0]; },
  async deleteImage(id){ return q('DELETE FROM product_images WHERE id=$1', [id]); },
  async deleteProductImages(productId){ return q('DELETE FROM product_images WHERE product_id=$1', [productId]); },
  // a customer-uploaded custom print design (product_id NULL = isolated from product galleries)
  async addCustomUpload(mime, buffer){ return (await q('INSERT INTO product_images (product_id,mime,data) VALUES (NULL,$1,$2) RETURNING id', [mime, buffer])).rows[0]; },

  async getReviews(productId){ return (await q('SELECT * FROM reviews WHERE product_id=$1 ORDER BY created_at DESC', [productId])).rows; },
  async addReview(r){ return q('INSERT INTO reviews (product_id,name,rating,comment) VALUES ($1,$2,$3,$4)', [r.product_id,r.name,r.rating,r.comment]); },
  async allRatings(){
    const rows = (await q('SELECT product_id, ROUND(AVG(rating)::numeric,1) AS avg, COUNT(*) AS count FROM reviews GROUP BY product_id')).rows;
    const map = {}; rows.forEach(r => { map[r.product_id] = { avg: Number(r.avg), count: Number(r.count) }; });
    return map;
  },

  async addSubscriber(email){ return q('INSERT INTO subscribers (email) VALUES ($1) ON CONFLICT (email) DO NOTHING', [email]); },
  async allSubscribers(){ return (await q('SELECT * FROM subscribers ORDER BY created_at DESC')).rows; },

  async getDiscount(code){ return (await q('SELECT * FROM discounts WHERE UPPER(code)=UPPER($1) AND active=1', [code])).rows[0]; },
  async allDiscounts(){ return (await q('SELECT * FROM discounts ORDER BY created_at DESC')).rows; },
  async createDiscount(d){ return q('INSERT INTO discounts (code,type,value,min_amount,active) VALUES (UPPER($1),$2,$3,$4,$5) ON CONFLICT (code) DO UPDATE SET type=$2,value=$3,min_amount=$4,active=$5',
    [d.code,d.type,d.value,d.min_amount||0,d.active]); },
  async deleteDiscount(id){ return q('DELETE FROM discounts WHERE id=$1', [id]); },

  async createPending(o){ return q('INSERT INTO pending_orders (rzp_order_id,amount,items_json,shipping_json) VALUES ($1,$2,$3,$4)', [o.rzp_order_id,o.amount,o.items_json,o.shipping_json]); },
  async getPending(id){ return (await q('SELECT * FROM pending_orders WHERE rzp_order_id=$1', [id])).rows[0]; },
  async deletePending(id){ return q('DELETE FROM pending_orders WHERE rzp_order_id=$1', [id]); },

  async createOrder(o){ return (await q(
    `INSERT INTO orders (rzp_order_id,rzp_payment_id,name,email,phone,address,city,pincode,amount_total,currency,status,items_json,payment_method,discount_code,discount_amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (rzp_order_id) DO NOTHING RETURNING id`,
    [o.rzp_order_id,o.rzp_payment_id,o.name,o.email,o.phone,o.address,o.city,o.pincode,o.amount_total,o.currency,o.status,o.items_json,o.payment_method||'online',o.discount_code||null,o.discount_amount||0])).rows[0]; },
  async createCodOrder(o){ return (await q(
    `INSERT INTO orders (name,email,phone,address,city,pincode,amount_total,currency,status,items_json,payment_method,discount_code,discount_amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'cod',$11,$12) RETURNING id`,
    [o.name,o.email,o.phone,o.address,o.city,o.pincode,o.amount_total,o.currency,o.status||'cod_pending',o.items_json,o.discount_code||null,o.discount_amount||0])).rows[0]; },
  async getOrder(id){ return (await q('SELECT * FROM orders WHERE id=$1', [id])).rows[0]; },
  async getOrderByRzp(id){ return (await q('SELECT * FROM orders WHERE rzp_order_id=$1', [id])).rows[0]; },
  async allOrders(){ return (await q('SELECT * FROM orders ORDER BY created_at DESC, id DESC')).rows; }
};
