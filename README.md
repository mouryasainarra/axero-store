# AXERO — online store (India) with admin dashboard, Razorpay & Supabase

A complete, deployable two-sided fashion store:
- **Entry screen** → customers choose **Men** or **Women**, then browse that collection.
- **Storefront** — gendered categories, bag, delivery details, and payment by **UPI (PhonePe / Google Pay / Paytm), cards, net banking & wallets** via **Razorpay**, all in **INR (₹)**.
- **Admin dashboard** — password-protected, with **Revenue, Profit (+ margin), Units sold, Inventory value**, a 7-day revenue chart, low/out-of-stock alerts, and full product management (with cost price for profit).
- **Data lives in Supabase (managed PostgreSQL)** — persistent, backed up, and secure.

---

## 1. Create your Supabase database
1. Sign up at https://supabase.com and create a new project (pick a region close to India, e.g. Mumbai/Singapore). Set a strong database password.
2. Go to **Project Settings → Database → Connection string → URI**.
3. Copy the URI (it looks like `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`).

> Security note: this connection string is a **secret**. It stays in `.env` on your server only — never put it in frontend code or commit it to GitHub. Your app talks to Supabase **server-side**, so you don't use Supabase's public "anon" key or Row Level Security here — which avoids the most common Supabase mistake.

## 2. Run it on your computer
Install **Node.js 18+** (https://nodejs.org), then in this folder:
```bash
npm install
cp .env.example .env      # then paste your Supabase URI into DATABASE_URL
npm run seed              # (optional) load sample Men & Women products
npm start
```
Open **http://localhost:3000** (store) and **http://localhost:3000/admin** (admin — default password `changeme`). The tables are created automatically in Supabase the first time it runs.

## 3. Add your products
Log in to `/admin` → **+ Add product**. Set the **Collection** (Men/Women), category, **selling price**, **cost price** (used for profit), stock, sizes, and an **image URL**. Tick **Live** and save — it appears in the shop instantly. Delete the samples once you've added your own.

## 4. Turn on payments (Razorpay)
Razorpay needs an Indian business (bank account + KYC: PAN, etc.).
1. Sign up at https://dashboard.razorpay.com and complete activation.
2. **Settings → API Keys → Generate Key.** Put `RAZORPAY_KEY_ID` (`rzp_test_…` to test, `rzp_live_…` when live) and `RAZORPAY_KEY_SECRET` in `.env`.
3. Set `BASE_URL` to your live site URL.
The browser only sends product IDs + quantities; the server looks up real prices, creates a Razorpay order, opens the payment popup, and **verifies the signature** before saving the order.

## 5. Secure the admin
Run `node make-password.js "your-strong-password"`, put the printed `ADMIN_PASSWORD_HASH=…` in your environment (remove `ADMIN_PASSWORD`), and set a long random `SESSION_SECRET`.

## 6. Deploy (hosting)
Push to GitHub, then on **Render** (or Railway/Fly): New → Web Service → connect repo → Build `npm install`, Start `npm start`, and add all `.env` variables under Environment. Because the data lives in **Supabase**, you do **not** need a persistent disk — the host can be stateless and your data is safe in Supabase. After deploy, set `BASE_URL` to your live URL.

## Your logo
Included at `public/logo.png` (full lockup) and `public/logo_mark.png` (monogram). Overwrite with higher-res files anytime — no code changes needed.

## File map
```
server.js                 Express app + routes (storefront, admin, Razorpay)
db.js                     Supabase/Postgres data layer (pg)
seed.js                   Sample products (npm run seed)
make-password.js          Generate an admin password hash
views/                    entry, shop, success, admin login/dashboard/form, _logo
public/css/style.css      Styling (black/gold)
public/js/cart.js         Bag + delivery + Razorpay checkout
public/logo*.png          Your logo
.env.example              Config template — copy to .env
```
