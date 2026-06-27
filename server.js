// server.js — AXERO storefront + admin + Razorpay + COD, on Supabase Postgres
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 8 } });
function uploadPhotos(req, res, next){ upload.array('photos', 8)(req, res, function(err){ if (err) { req.uploadError = err.message; } next(); }); }

const app = express();
const PORT = process.env.PORT || 3000;
const KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const razorpay = (KEY_ID && KEY_SECRET) ? new (require('razorpay'))({ key_id: KEY_ID, key_secret: KEY_SECRET }) : null;
const CURRENCY = (process.env.CURRENCY || 'inr').toUpperCase();
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const STORE_NAME = process.env.STORE_NAME || 'Axero';
const WHATSAPP = (process.env.WHATSAPP_NUMBER || '').replace(/[^0-9]/g, '');
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || '';
const COD_ENABLED = (process.env.COD_ENABLED || 'true') !== 'false';

const CATS = {
  Men: ['Oversized T-Shirts', 'Regular Fit T-Shirts', 'Polo T-Shirts', 'Full Sleeve T-Shirts', 'Sleeveless T-Shirts', 'Hoodies', 'Customized T-Shirts'],
  Women: ['Oversized T-Shirts', 'Regular Fit T-Shirts', 'Polo T-Shirts', 'Full Sleeve T-Shirts', 'Sleeveless T-Shirts', 'Hoodies', 'Customized T-Shirts', 'Crop T-Shirts']
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
app.locals.WHATSAPP = WHATSAPP;
app.locals.SUPPORT_EMAIL = SUPPORT_EMAIL;
app.locals.COD_ENABLED = COD_ENABLED;
app.locals.payReady = !!razorpay;
app.locals.fmtDate = (d) => { try { return new Date(d).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }); } catch(e){ return ''; } };

function sortProducts(list, sort){
  const a = list.slice();
  if (sort === 'price-asc') a.sort((x,y)=>x.price-y.price);
  else if (sort === 'price-desc') a.sort((x,y)=>y.price-x.price);
  else if (sort === 'name') a.sort((x,y)=>(x.name||'').localeCompare(y.name||''));
  return a;
}
function attachRatings(list, ratings){ list.forEach(p => { p.rating = ratings[p.id] || null; }); return list; }

app.get('/', async (req, res, next) => {
  try {
    const gender = ['Men', 'Women'].includes(req.query.gender) ? req.query.gender : null;
    const qstr = (req.query.q || '').trim();
    if (qstr) {
      let results = await db.searchProducts(qstr);
      const ratings = await db.allRatings();
      results = sortProducts(attachRatings(results, ratings), req.query.sort);
      return res.render('shop', { mode:'search', q:qstr, products: results, gender: gender || 'Men',
        category:'All', cats: CATS[gender || 'Men'], sort:req.query.sort || '' });
    }
    if (!gender) {
      const featured = attachRatings(await db.featuredProducts(8), await db.allRatings());
      return res.render('entry', { featured });
    }
    const cats = CATS[gender];
    const category = req.query.category && cats.includes(req.query.category) ? req.query.category : 'All';
    let products = (await db.activeProducts()).filter(p => (p.gender || 'Men') === gender);
    if (category !== 'All') products = products.filter(p => p.category === category);
    products = sortProducts(attachRatings(products, await db.allRatings()), req.query.sort);
    res.render('shop', { mode:'shop', q:'', products, gender, category, cats, sort:req.query.sort || '' });
  } catch (e) { next(e); }
});

app.get('/sale', async (req, res, next) => {
  try {
    let products = await db.saleProducts();
    products = sortProducts(attachRatings(products, await db.allRatings()), req.query.sort);
    res.render('shop', { mode:'sale', q:'', products, gender:'Men', category:'All', cats: CATS.Men, sort:req.query.sort || '' });
  } catch (e) { next(e); }
});

app.get('/product/:id', async (req, res, next) => {
  try {
    const product = await db.getProduct(req.params.id);
    if (!product || !product.active) return res.status(404).render('page', { title:'Not found', body:'<p>That product could not be found.</p>' });
    const reviews = await db.getReviews(product.id);
    const summary = reviews.length
      ? { avg: Math.round((reviews.reduce((n,r)=>n+r.rating,0)/reviews.length)*10)/10, count: reviews.length }
      : null;
    const related = attachRatings(await db.relatedProducts(product, 4), await db.allRatings());
    const uploaded = await db.getProductImages(product.id);
    res.render('product', { product, reviews, summary, related, gender: product.gender, uploaded });
  } catch (e) { next(e); }
});

app.post('/product/:id/review', async (req, res, next) => {
  try {
    const product = await db.getProduct(req.params.id);
    if (!product) return res.redirect('/');
    const rating = Math.max(1, Math.min(5, parseInt(req.body.rating || 0, 10)));
    const name = (req.body.name || 'Anonymous').toString().trim().slice(0, 60) || 'Anonymous';
    const comment = (req.body.comment || '').toString().trim().slice(0, 800);
    if (rating) await db.addReview({ product_id: product.id, name, rating, comment });
    res.redirect('/product/' + product.id + '#reviews');
  } catch (e) { next(e); }
});

async function discountFor(code, amount){
  if (!code) return { amount: 0, code: null };
  const d = await db.getDiscount(code.trim());
  if (!d) return { amount: 0, code: null, error: 'Invalid code' };
  if (amount < (d.min_amount || 0)) return { amount: 0, code: null, error: 'Order below minimum for this code' };
  let off = d.type === 'flat' ? d.value : Math.round(amount * d.value / 100);
  off = Math.min(off, amount);
  return { amount: off, code: d.code, type: d.type, value: d.value };
}
app.post('/api/apply-code', async (req, res) => {
  try {
    const amount = Math.max(0, parseInt(req.body.amount || 0, 10));
    const r = await discountFor(req.body.code, amount);
    if (!r.code) return res.json({ ok:false, error: r.error || 'Invalid code' });
    res.json({ ok:true, code:r.code, discount:r.amount });
  } catch (e) { res.json({ ok:false, error:'Could not check code.' }); }
});

async function buildItems(cart){
  let amount = 0; const items = [];
  for (const entry of (cart || [])) {
    const p = await db.getProduct(Number(entry.id));
    const qty = Math.max(1, Math.min(20, Number(entry.qty) || 1));
    if (!p || !p.active || p.stock <= 0) continue;
    amount += p.price * qty;
    const item = { id: p.id, name: p.name, price: p.price, cost: p.cost || 0, qty, size: entry.size || '' };
    if (entry.custom && /^\/img\/\d+$/.test(entry.custom)) item.custom = entry.custom;
    items.push(item);
  }
  return { amount, items };
}
function validShipping(s){ return s && s.name && s.phone && s.address && s.pincode; }

app.post('/api/checkout', async (req, res) => {
  if (!razorpay) return res.status(503).json({ error: 'Online payment is not switched on yet.' });
  try {
    const s = req.body.shipping || {};
    if (!validShipping(s)) return res.status(400).json({ error: 'Please complete your delivery details.' });
    const { amount, items } = await buildItems(req.body.cart);
    if (!items.length) return res.status(400).json({ error: 'Items are unavailable or out of stock.' });
    const disc = await discountFor(req.body.code, amount);
    const payable = amount - disc.amount;
    const order = await razorpay.orders.create({ amount: payable, currency: CURRENCY, receipt: 'axero_' + Date.now() });
    await db.createPending({ rzp_order_id: order.id, amount: payable, items_json: JSON.stringify(items),
      shipping_json: JSON.stringify({ name:s.name, email:s.email||'', phone:s.phone, address:s.address, city:s.city||'', pincode:s.pincode,
        discount_code: disc.code, discount_amount: disc.amount }) });
    res.json({ orderId: order.id, amount: payable, currency: CURRENCY, keyId: KEY_ID, name: STORE_NAME, prefill: { name:s.name, email:s.email||'', contact:s.phone } });
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
        name: ship.name||'', email: ship.email||'', phone: ship.phone||'', address: ship.address||'', city: ship.city||'', pincode: ship.pincode||'',
        amount_total: pending.amount, currency: CURRENCY, status: 'paid', items_json: pending.items_json,
        payment_method: 'online', discount_code: ship.discount_code || null, discount_amount: ship.discount_amount || 0 });
      orderId = row ? row.id : (await db.getOrderByRzp(razorpay_order_id)).id;
      for (const it of items) await db.decrementStock(it.id, it.qty);
      await db.deletePending(razorpay_order_id);
    }
    res.json({ redirect: '/success?id=' + orderId });
  } catch (err) { console.error('Verify error:', err.message); res.status(500).json({ error: 'Could not confirm payment.' }); }
});

app.post('/api/cod-order', async (req, res) => {
  if (!COD_ENABLED) return res.status(503).json({ error: 'Cash on Delivery is not available.' });
  try {
    const s = req.body.shipping || {};
    if (!validShipping(s)) return res.status(400).json({ error: 'Please complete your delivery details.' });
    const { amount, items } = await buildItems(req.body.cart);
    if (!items.length) return res.status(400).json({ error: 'Items are unavailable or out of stock.' });
    const disc = await discountFor(req.body.code, amount);
    const payable = amount - disc.amount;
    const row = await db.createCodOrder({ name:s.name, email:s.email||'', phone:s.phone, address:s.address, city:s.city||'', pincode:s.pincode,
      amount_total: payable, currency: CURRENCY, status:'cod_pending', items_json: JSON.stringify(items),
      discount_code: disc.code, discount_amount: disc.amount });
    for (const it of items) await db.decrementStock(it.id, it.qty);
    res.json({ redirect: '/success?id=' + row.id });
  } catch (err) { console.error('COD error:', err.message); res.status(500).json({ error: 'Could not place order. Please try again.' }); }
});

app.post('/api/custom-upload', upload.single('design'), async (req, res) => {
  try {
    if (!req.file || !req.file.mimetype || !req.file.mimetype.startsWith('image/')) return res.json({ ok:false, error:'Please choose an image file.' });
    const row = await db.addCustomUpload(req.file.mimetype, req.file.buffer);
    if (!row) return res.json({ ok:false, error:'Upload failed, please try again.' });
    res.json({ ok:true, url:'/img/' + row.id });
  } catch (e) { res.json({ ok:false, error:'Upload failed, please try again.' }); }
});

app.get('/img/:id', async (req, res) => {
  try {
    const img = await db.getImage(req.params.id);
    if (!img || !img.data) return res.status(404).send('Not found');
    res.set('Content-Type', img.mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(img.data);
  } catch (e) { res.status(404).send('Not found'); }
});

app.get('/success', async (req, res, next) => {
  try { res.render('success', { order: req.query.id ? await db.getOrder(req.query.id) : null }); }
  catch (e) { next(e); }
});

app.post('/api/newsletter', async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.json({ ok:false, error:'Enter a valid email.' });
    await db.addSubscriber(email);
    res.json({ ok:true });
  } catch (e) { res.json({ ok:false, error:'Could not subscribe.' }); }
});

const PAGES = {
  about: { title:'About AXERO', body:`<p>AXERO is an Indian fashion label built on one belief — <strong>style that speaks you</strong>. From sharp suits to everyday oversized tees, every piece is designed in India with a global eye for detail.</p><p>We focus on premium fabric, a modern fit, and unique prints you won\u2019t find everywhere. Indian brand, global vision.</p>` },
  contact: { title:'Contact us', body:`<p>We\u2019d love to hear from you. Our team usually replies within 24 hours.</p><ul class="plain">__CONTACT__</ul>` },
  'size-guide': { title:'Size guide', body:`<p>Measurements are approximate. If you\u2019re between sizes, we suggest sizing up for an oversized look.</p>
    <table class="sizetable"><thead><tr><th>Size</th><th>Chest (in)</th><th>Waist (in)</th></tr></thead><tbody>
    <tr><td>S</td><td>36-38</td><td>28-30</td></tr><tr><td>M</td><td>38-40</td><td>30-32</td></tr>
    <tr><td>L</td><td>40-42</td><td>32-34</td></tr><tr><td>XL</td><td>42-44</td><td>34-36</td></tr>
    <tr><td>XXL</td><td>44-46</td><td>36-38</td></tr></tbody></table>` },
  shipping: { title:'Shipping & delivery', body:`<p>We ship across India. Orders are dispatched within 1\u20132 business days and typically arrive in 3\u20137 days depending on your location.</p><p>Free delivery on orders over &#8377;2,999. You\u2019ll get a tracking update once your order ships.</p>` },
  returns: { title:'Returns & exchanges', body:`<p>Not the right fit? You can request a return or exchange within <strong>7 days</strong> of delivery, provided the item is unworn, unwashed, and has its original tags.</p><p>To start a return, contact us with your order number and we\u2019ll guide you through it.</p>` },
  privacy: { title:'Privacy policy', body:`<p>We collect only the details needed to process and deliver your order (name, contact, address). We never sell your data. Payments are handled securely by our payment partner and your card details never touch our servers.</p>` },
  faq: { title:'Frequently asked questions', body:`<h3>How do I track my order?</h3><p>You\u2019ll receive a tracking link by email/SMS once your order ships.</p>
    <h3>What payment methods do you accept?</h3><p>UPI (PhonePe, Google Pay, Paytm), cards, net banking, and Cash on Delivery where available.</p>
    <h3>Can I change my order?</h3><p>Contact us quickly after ordering and we\u2019ll do our best before it ships.</p>
    <h3>Do you deliver everywhere in India?</h3><p>Yes, to most pincodes across the country.</p>` }
};
app.get('/page/:slug', (req, res) => {
  const p = PAGES[req.params.slug];
  if (!p) return res.status(404).render('page', { title:'Not found', body:'<p>Page not found.</p>' });
  let body = p.body;
  if (req.params.slug === 'contact') {
    let c = '';
    if (WHATSAPP) c += `<li><strong>WhatsApp:</strong> <a href="https://wa.me/${WHATSAPP}">Chat with us</a></li>`;
    if (SUPPORT_EMAIL) c += `<li><strong>Email:</strong> <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></li>`;
    if (!c) c = '<li>Reach us any time and we\u2019ll get back to you.</li>';
    body = body.replace('__CONTACT__', c);
  }
  res.render('page', { title: p.title, body });
});

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
    res.render('admin-dashboard', { products, orders, stats: buildStats(products, orders) });
  } catch (e) { next(e); }
});
app.get('/admin/products/new', requireAdmin, (req, res) => res.render('admin-product-form', { product: null, uploaded: [] }));
app.get('/admin/products/:id/edit', requireAdmin, async (req, res, next) => {
  try { const product = await db.getProduct(req.params.id); if (!product) return res.redirect('/admin'); const uploaded = await db.getProductImages(product.id); res.render('admin-product-form', { product, uploaded }); }
  catch (e) { next(e); }
});
function parseForm(b){
  return { name: (b.name||'').trim(), category: ALL_CATS.includes(b.category) ? b.category : 'Oversized T-Shirts',
    gender: ['Men','Women'].includes(b.gender) ? b.gender : 'Men',
    description: (b.description||'').trim(), price: Math.round(parseFloat(b.price||0)*100),
    cost: b.cost ? Math.round(parseFloat(b.cost)*100) : 0,
    compare_at: b.compare_at ? Math.round(parseFloat(b.compare_at)*100) : null,
    image_url: (b.image_url||'').trim(), sizes: (b.sizes||'').trim() || 'S,M,L,XL,XXL',
    stock: parseInt(b.stock||0,10), active: b.active ? 1 : 0, featured: b.featured ? 1 : 0,
    images: (b.images||'').trim(), material: (b.material||'').trim(), fit: (b.fit||'').trim(),
    care: (b.care||'').trim(), details: (b.details||'').trim() };
}
async function saveUploads(productId, files){
  const ids = [];
  for (const f of (files || [])) {
    if (!f.mimetype || !f.mimetype.startsWith('image/')) continue;
    const row = await db.addImage(productId, f.mimetype, f.buffer);
    if (row) ids.push(row.id);
  }
  return ids;
}
// if a product has uploaded images and no manual main URL, use the first uploaded image as the card image
async function refreshPrimaryImage(productId){
  const imgs = await db.getProductImages(productId);
  const p = await db.getProduct(productId);
  if (imgs.length && (!p.image_url || p.image_url.startsWith('/img/'))) {
    if (p.image_url !== '/img/' + imgs[0].id) { p.image_url = '/img/' + imgs[0].id; await db.updateProduct(productId, p); }
  } else if (!imgs.length && p.image_url && p.image_url.startsWith('/img/')) {
    p.image_url = ''; await db.updateProduct(productId, p);
  }
}
app.post('/admin/products', requireAdmin, uploadPhotos, async (req, res, next) => {
  try { const d = parseForm(req.body); if (!d.name || !d.price) return res.redirect('/admin/products/new');
    const row = await db.createProduct(d);
    if (row && row.id) { await saveUploads(row.id, req.files); await refreshPrimaryImage(row.id); }
    res.redirect('/admin'); }
  catch (e) { next(e); }
});
app.post('/admin/products/:id', requireAdmin, uploadPhotos, async (req, res, next) => {
  try {
    await db.updateProduct(req.params.id, parseForm(req.body));
    let rm = req.body.remove_img; if (rm && !Array.isArray(rm)) rm = [rm];
    for (const id of (rm || [])) await db.deleteImage(id);
    await saveUploads(req.params.id, req.files);
    await refreshPrimaryImage(req.params.id);
    res.redirect('/admin');
  } catch (e) { next(e); }
});
app.post('/admin/products/:id/delete', requireAdmin, async (req, res, next) => {
  try { await db.deleteProductImages(req.params.id); await db.deleteProduct(req.params.id); res.redirect('/admin'); } catch (e) { next(e); }
});

app.get('/admin/discounts', requireAdmin, async (req, res, next) => {
  try { res.render('admin-discounts', { discounts: await db.allDiscounts() }); } catch (e) { next(e); }
});
app.post('/admin/discounts', requireAdmin, async (req, res, next) => {
  try {
    const code = (req.body.code||'').trim();
    const type = req.body.type === 'flat' ? 'flat' : 'percent';
    const value = type === 'flat' ? Math.round(parseFloat(req.body.value||0)*100) : Math.max(1, Math.min(90, parseInt(req.body.value||0,10)));
    const min_amount = req.body.min_amount ? Math.round(parseFloat(req.body.min_amount)*100) : 0;
    if (code && value) await db.createDiscount({ code, type, value, min_amount, active: 1 });
    res.redirect('/admin/discounts');
  } catch (e) { next(e); }
});
app.post('/admin/discounts/:id/delete', requireAdmin, async (req, res, next) => {
  try { await db.deleteDiscount(req.params.id); res.redirect('/admin/discounts'); } catch (e) { next(e); }
});

app.use((err, req, res, next) => { console.error(err); res.status(500).send('Something went wrong. Please try again.'); });

db.ready.then(() => {
  app.listen(PORT, () => {
    console.log(`AXERO running at ${BASE_URL}`);
    if (!razorpay) console.log('NOTE: Razorpay not configured — online card/UPI payment is off. Cash on Delivery still works.');
  });
}).catch(e => { console.error('Could not start — database not reachable:', e.message); process.exit(1); });
