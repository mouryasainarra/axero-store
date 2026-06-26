# AXERO — premium Indian fashion store

Node.js + Express storefront with an admin dashboard, on Supabase (Postgres).
Payments via Razorpay (UPI / PhonePe / GPay / cards) **and Cash on Delivery**.
Fully responsive — phones, tablets, and laptops.

## Customer site
- Landing page with Men / Women entry + a Featured row (toggle "Featured" on a product in admin).
- Product detail pages (`/product/:id`) — big image, description, size picker, add-to-bag, related products.
- Search (header icon) and Sort (newest / price / name).
- Sale page (`/sale`) and sale badges.
- Customer reviews & ratings.
- Wishlist (heart icon, saved in the browser).
- Discount codes at checkout (managed in admin).
- Cash on Delivery — works even before Razorpay is switched on.
- Newsletter signup in the footer.
- Info pages: `/page/about`, `/page/contact`, `/page/size-guide`, `/page/shipping`, `/page/returns`, `/page/privacy`, `/page/faq`.
- WhatsApp button (appears when `WHATSAPP_NUMBER` is set).

## Admin (`/admin`)
- Sales dashboard; product add/edit/delete with Featured + Live toggles.
- Orders table shows Pay (Online / COD) and status.
- Discount-codes manager.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL` (Supabase → Settings → Database → Session pooler URI).
3. `npm run seed` (optional sample data + WELCOME10 code).
4. `npm start` → http://localhost:3000

## Environment variables
- `DATABASE_URL` (required) — Supabase Session-pooler connection string.
- `ADMIN_PASSWORD` — admin login. Production: `node make-password.js "pw"` then set `ADMIN_PASSWORD_HASH`.
- `SESSION_SECRET` — long random string.
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` — optional; enables online payment. COD works without them.
- `COD_ENABLED` — `true` (default) / `false`.
- `WHATSAPP_NUMBER` — country code + number, digits only. Blank hides the button.
- `SUPPORT_EMAIL` — shown on the Contact page.
- `STORE_NAME`, `CURRENCY` (`inr`), `BASE_URL`.

Tables (incl. reviews, subscribers, discounts, and new orders/products columns) are created/upgraded automatically on startup.
