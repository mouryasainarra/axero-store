require('dotenv').config();
// seed.js — sample products into Supabase Postgres. Run: npm run seed
const db = require('./db');
const samples = [
  { gender:'Men', name:'Onyx Slim-Fit Two-Piece Suit', category:'Suits', description:'Tailored slim-fit suit in deep onyx.', price:899900, cost:467900, compare_at:1199900, image_url:'', sizes:'38,40,42,44,46', stock:20, active:1 },
  { gender:'Men', name:'Midnight Tuxedo Blazer', category:'Suits', description:'Satin-lapel tuxedo blazer.', price:649900, cost:337900, compare_at:null, image_url:'', sizes:'38,40,42,44', stock:14, active:1 },
  { gender:'Men', name:'AXERO Tech Track Jacket', category:'Sportswear', description:'Lightweight track jacket with gold taping.', price:349900, cost:181900, compare_at:449900, image_url:'', sizes:'S,M,L,XL,XXL', stock:35, active:1 },
  { gender:'Men', name:'Statue Print Oversized Tee', category:'Oversized T-Shirts', description:'Drop-shoulder tee with classical statue print.', price:149900, cost:77900, compare_at:199900, image_url:'', sizes:'S,M,L,XL,XXL', stock:50, active:1 },
  { gender:'Men', name:'Gold Emblem Oversized Tee', category:'Oversized T-Shirts', description:'Heavyweight tee with the AXERO emblem.', price:129900, cost:67900, compare_at:null, image_url:'', sizes:'S,M,L,XL,XXL', stock:0, active:1 },
  { gender:'Men', name:'Smiley Graffiti Printed Jeans', category:'Printed Jeans', description:'Light-wash denim with graffiti print.', price:379900, cost:197900, compare_at:469900, image_url:'', sizes:'28,30,32,34,36', stock:18, active:1 },
  { gender:'Women', name:'Satin Slip Midi Dress', category:'Dresses', description:'Bias-cut satin slip dress with a cowl neck.', price:329900, cost:171900, compare_at:419900, image_url:'', sizes:'XS,S,M,L,XL', stock:24, active:1 },
  { gender:'Women', name:'Square-Neck Ribbed Top', category:'Tops', description:'Stretch rib top with a square neckline.', price:129900, cost:67900, compare_at:null, image_url:'', sizes:'XS,S,M,L,XL', stock:40, active:1 },
  { gender:'Women', name:'Tailored Co-ord Set', category:'Co-ords', description:'Matching blazer and wide-leg trouser set.', price:549900, cost:285900, compare_at:699900, image_url:'', sizes:'XS,S,M,L,XL', stock:16, active:1 },
  { gender:'Women', name:'Floral Print Straight Jeans', category:'Printed Jeans', description:'High-rise straight jeans with floral print.', price:329900, cost:171900, compare_at:null, image_url:'', sizes:'26,28,30,32,34', stock:20, active:1 }
];
(async () => {
  await db.ready;
  const ids = [];
  for (const p of samples) { const r = await db.createProduct(p); if (r && r.id) ids.push(r.id); }
  // feature the first four products on the home page
  for (const id of ids.slice(0, 4)) await db.updateProduct(id, Object.assign({}, samples[ids.indexOf(id)], { featured: 1 }));
  // a demo welcome discount (10% off, no minimum)
  await db.createDiscount({ code: 'WELCOME10', type: 'percent', value: 10, min_amount: 0, active: 1 });
  // a couple of sample reviews on the first product
  if (ids[0]) { await db.addReview({ product_id: ids[0], name: 'Rahul', rating: 5, comment: 'Excellent fit and premium fabric.' });
                await db.addReview({ product_id: ids[0], name: 'Aisha', rating: 4, comment: 'Looks great, runs slightly snug.' }); }
  console.log('Seeded ' + samples.length + ' products, featured 4, added WELCOME10 (10% off) and sample reviews.');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
