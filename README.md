# AXERO — premium Indian fashion store

Node.js + Express storefront with an admin dashboard, on Supabase (Postgres).
Payments via Razorpay (UPI / PhonePe / GPay / cards) **and Cash on Delivery**.

## What the customer site has
- **Landing page** with Men / Women entry + a **Featured** row (toggle "Featured" on any product in admin).
- **Product detail pages** (`/product/:id`) — big image, description, size picker, add-to-bag, related products.
- **Search** (search icon in the header) and **Sort** (newest / price / name).
- **Sale page** (`/sale`) and sale badges on any product with a "Was price".
- **Customer reviews & ratings** — star rating shown on cards and product pages; visitors can post reviews.
- **Wishlist** (heart icon) saved in the browser, with its own drawer.
- **Discount codes** at checkout — create/manage them in admin under "Discount codes".
- **Cash on Delivery** — orders work even before Razorpay is switched on.
- **Newsletter signup** in the footer (stored in the `subscribers` table).
- **Info pages**: `/page/about`, `/page/contact`, `/page/size-guide`, `/page/shipping`, `/page/returns`, `/page/privacy`, `/page/faq`.
- **WhatsApp button** — appears when `WHATSAPP_NUMBER` is set.

## Admin (`/admin`)
- Sales dashboard, product add/edit/delete (with **Featured** + **Live** toggles).
- Orders table now shows **Pay** (Online / COD) and order **status**.
- **Discount codes** manager (percent or flat, optional minimum order).

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL` (Supabase → Settings → Database → **Session pooler** URI).
3. `npm run seed` (optional — adds demo products, features 4, and a WELCOME10 code).
4. `npm start` → http://localhost:3000

## Environment variables
- `DATABASE_URL` (required) — Supabase Session-pooler connection string.
- `ADMIN_PASSWORD` — admin login. For production: `node make-password.js "yourpassword"` then set `ADMIN_PASSWORD_HASH`.
- `SESSION_SECRET` — any long random string.
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` — optional; enables online payment. COD works without them.
- `COD_ENABLED` — `true` (default) / `false`.
- `WHATSAPP_NUMBER` — country code + number, digits only (e.g. `9198XXXXXXXX`). Blank hides the button.
- `SUPPORT_EMAIL` — shown on the Contact page.
- `STORE_NAME`, `CURRENCY` (`inr`), `BASE_URL`.

The database tables (incl. `reviews`, `subscribers`, `discounts`, and new `orders`/`products` columns) are created/upgraded automatically on startup.
