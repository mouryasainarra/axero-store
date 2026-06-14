// server.js — AXERO (India): storefront + admin dashboard + Razorpay, on Supabase Postgres
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const razorpay = (KEY_ID && KEY_SECRET) ? new (require('razorpay'))({ key_id: KEY_ID, key_secret: KEY_SECRET }) : null;
const CURRENCY = (process.env.CURRENCY || 'inr').toUpperCase();
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const STORE_NAME = process.env.STORE_NAME || 'Axero';
const CATS = {
  Men: ['Suits', 'Sportswear', 'Oversized T-Shirts', 'Printed Jeans'],
  Women: ['Dresses', 'Tops', 'Co-ords', 'Printed Jeans']
};
const ALL_CATS = [...new Set([...CATS.Men, ...CATS.Women])];
const fmtMoney = new Intl.NumberFormat('en-IN', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 2 });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET || 'change-this-secret', resave: false, saveUninitialized: false, cookie: { maxAge: 1000*60*60*8 } }));

app.locals.money = (paise) => fmtMoney.format((paise || 0) / 100);
app.locals.SYMBOL = '\u20B9';
app.locals.CATS = CATS;
app.locals.ALL_CATS = ALL_CATS;
app.locals.STORE_NAME = STORE_NAME;
app.locals.fmtDate = (d) => { try { return new Date(d).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }); } catch(e){ return ''; } };

// ---------- storefront ----------
app.get('/', async (req, res, next) => {
  try {
    const gender = ['Men', 'Women'].includes(req.query.gender) ? req.query.gender : null;
    if (!gender) return res.render('entry');
    const cats = CATS[gender];
    const category = req.query.category && cats.includes(req.query.category) ? req.query.category : 'All';
    let products = (await db.activeProducts()).filter(p => (p.gender || 'Men') === gender);
    if (category !== 'All') products = products.filter(p => p.category === category);
    res.render('shop', { products, gender, category, cats, payReady: !!razorpay });
  } catch (e) { next(e); }
});

app.post('/api/checkout', async (req, res) => {
  if (!razorpay) return res.status(503).json({ error: 'Payments are not configured yet.' });
  try {
    const cart = Array.isArray(req.body.cart) ? req.body.cart : [];
    const s = req.body.shipping || {};
    if (!cart.length) return res.status(400).json({ error: 'Your bag is empty.' });
    if (!s.name || !s.phone || !s.address || !s.pincode) return res.status(400).json({ error: 'Please complete your delivery details.' });
    let amount = 0; const items = [];
    for (const entry of cart) {
      const p = await db.getProduct(Number(entry.id));
      const qty = Math.max(1, Math.min(20, Number(entry.qty) || 1));
      if (!p || !p.active || p.stock <= 0) continue;
      amount += p.price * qty;
      items.push({ id: p.id, name: p.name, price: p.price, cost: p.cost || 0, qty, size: entry.size || '' });
    }
    if (!items.length) return res.status(400).json({ error: 'Items are unavailable or out of stock.' });
    const order = await razorpay.orders.create({ amount, currency: CURRENCY, receipt: 'axero_' + Date.now() });
    await db.createPending({ rzp_order_id: order.id, amount, items_json: JSON.stringify(items),
      shipping_json: JSON.stringify({ name: s.name, email: s.email || '', phone: s.phone, address: s.address, city: s.city || '', pincode: s.pincode }) });
    res.json({ orderId: order.id, amount, currency: CURRENCY, keyId: KEY_ID, name: STORE_NAME, prefill: { name: s.name, email: s.email || '', contact: s.phone } });
  } catch (err) { console.error('Checkout error:', err.message); res.status(500).json({ error: 'Could not start checkout. Please try again.' }); }
});

app.post('/api/verify', async (req, res) => {
  if (!KEY_SECRET) return res.status(503).json({ error: 'Payments not configured.' });
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const expected = crypto.createHmac('sha256', KEY_SECRET).update(razorpay_order_id + '|' + razorpay_payment_id).digest('hex');
    if (expected !== razorpay_signature) return res.status(400).json({ error: 'Payment verification failed.' });
    const pending = await db.getPending(razorpay_order_id);
    if (!pending) return res.status(404).json({ error: 'Order not found.' });
    const existing = await db.getOrderByRzp(razorpay_order_id);
    let orderId;
    if (existing) orderId = existing.id;
    else {
      const ship = JSON.parse(pending.shipping_json || '{}');
      const items = JSON.parse(pending.items_json || '[]');
      const row = await db.createOrder({ rzp_order_id: razorpay_order_id, rzp_payment_id: razorpay_payment_id,
        name: ship.name || '', email: ship.email || '', phone: ship.phone || '', address: ship.address || '', city: ship.city || '', pincode: ship.pincode || '',
        amount_total: pending.amount, currency: CURRENCY, status: 'paid', items_json: pending.items_json });
      orderId = row ? row.id : (await db.getOrderByRzp(razorpay_order_id)).id;
      for (const it of items) await db.decrementStock(it.id, it.qty);
      await db.deletePending(razorpay_order_id);
    }
    res.json({ redirect: '/success?id=' + orderId });
  } catch (err) { console.error('Verify error:', err.message); res.status(500).json({ error: 'Could not confirm payment.' }); }
});

app.get('/success', async (req, res, next) => {
  try { res.render('success', { order: req.query.id ? await db.getOrder(req.query.id) : null }); }
  catch (e) { next(e); }
});

// ---------- admin ----------
function requireAdmin(req, res, next){ if (req.session.isAdmin) return next(); res.redirect('/admin/login'); }
app.get('/admin/login', (req, res) => res.render('admin-login', { error: null }));
app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  const hash = process.env.ADMIN_PASSWORD_HASH, plain = process.env.ADMIN_PASSWORD;
  let ok = false;
  if (hash) ok = bcrypt.compareSync(password || '', hash); else if (plain) ok = (password === plain);
  if (ok) { req.session.isAdmin = true; return res.redirect('/admin'); }
  res.render('admin-login', { error: 'Incorrect password.' });
});
app.post('/admin/logout', (req, res) => req.session.destroy(() => res.redirect('/admin/login')));

function buildStats(products, orders){
  let revenue = 0, cost = 0, units = 0; const byDay = {};
  orders.forEach(o => {
    revenue += o.amount_total || 0;
    const day = new Date(o.created_at).toISOString().slice(0, 10);
    byDay[day] = (byDay[day] || 0) + (o.amount_total || 0);
    let items = []; try { items = JSON.parse(o.items_json || '[]'); } catch (e) {}
    items.forEach(it => { units += it.qty || 0; cost += (it.cost || 0) * (it.qty || 0); });
  });
  const chart = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    chart.push({ label: d.toLocaleDateString('en-IN', { weekday: 'short' }), value: byDay[key] || 0 });
  }
  const maxVal = Math.max(1, ...chart.map(c => c.value));
  const lowStock = products.filter(p => p.active && p.stock > 0 && p.stock <= 5);
  const outOfStock = products.filter(p => p.stock <= 0);
  const inventoryValue = products.reduce((n, p) => n + p.price * p.stock, 0);
  const liveCount = products.filter(p => p.active).length;
  return { revenue, cost, profit: revenue - cost, units, orderCount: orders.length,
    productCount: products.length, liveCount, lowStock, outOfStock, inventoryValue, chart, maxVal,
    margin: revenue ? Math.round(((revenue - cost) / revenue) * 100) : 0 };
}

app.get('/admin', requireAdmin, async (req, res, next) => {
  try {
    const products = await db.allProducts(), orders = await db.allOrders();
    res.render('admin-dashboard', { products, orders, stats: buildStats(products, orders), payReady: !!razorpay });
  } catch (e) { next(e); }
});
app.get('/admin/products/new', requireAdmin, (req, res) => res.render('admin-product-form', { product: null }));
app.get('/admin/products/:id/edit', requireAdmin, async (req, res, next) => {
  try { const product = await db.getProduct(req.params.id); if (!product) return res.redirect('/admin'); res.render('admin-product-form', { product }); }
  catch (e) { next(e); }
});
function parseForm(b){
  return { name: (b.name||'').trim(), category: ALL_CATS.includes(b.category) ? b.category : 'Suits',
    gender: ['Men','Women'].includes(b.gender) ? b.gender : 'Men',
    description: (b.description||'').trim(), price: Math.round(parseFloat(b.price||0)*100),
    cost: b.cost ? Math.round(parseFloat(b.cost)*100) : 0,
    compare_at: b.compare_at ? Math.round(parseFloat(b.compare_at)*100) : null,
    image_url: (b.image_url||'').trim(), sizes: (b.sizes||'').trim() || 'S,M,L,XL,XXL',
    stock: parseInt(b.stock||0,10), active: b.active ? 1 : 0 };
}
app.post('/admin/products', requireAdmin, async (req, res, next) => {
  try { const d = parseForm(req.body); if (!d.name || !d.price) return res.redirect('/admin/products/new'); await db.createProduct(d); res.redirect('/admin'); }
  catch (e) { next(e); }
});
app.post('/admin/products/:id', requireAdmin, async (req, res, next) => {
  try { await db.updateProduct(req.params.id, parseForm(req.body)); res.redirect('/admin'); } catch (e) { next(e); }
});
app.post('/admin/products/:id/delete', requireAdmin, async (req, res, next) => {
  try { await db.deleteProduct(req.params.id); res.redirect('/admin'); } catch (e) { next(e); }
});

app.use((err, req, res, next) => { console.error(err); res.status(500).send('Something went wrong. Please try again.'); });

db.ready.then(() => {
  app.listen(PORT, () => {
    console.log(`AXERO running at ${BASE_URL}`);
    if (!razorpay) console.log('NOTE: Razorpay not configured — add RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET to enable payments.');
  });
}).catch(e => { console.error('Could not start — database not reachable:', e.message); process.exit(1); });
