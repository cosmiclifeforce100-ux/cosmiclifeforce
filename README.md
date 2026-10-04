# Cosmic Life Force

Production-oriented B2B medical-products storefront built from the supplied Cosmic Life Force assets and `product list (1).pdf`.

## What is included

- Responsive customer storefront with Cosmic Life Force branding, unchanged supplied logo asset, tagline and supplied reference asset.
- 617 customer-facing products extracted from 754 source PDF rows. Exact manufacturer/product duplicates are removed from the customer catalog and the raw source rows remain available in `data/catalog.js` for admin/import audit work.
- Full orthopedic classification from the PDF, including size-specific knee caps, lumbar belts, wrist support, abdominal belts, anklets, arm pouch, clavicle braces, elbow braces, rib belts, kinesiology tape, neoprene support, mobility products and Vissco lines present in the source.
- Search, category/subcategory/manufacturer/availability filters, source-order/name/manufacturer/category/price sorting and product detail pages.
- Configurable product fields for brand, pack size, MOQ, price, wholesale price, GST, stock, purchase mode, descriptions, product images and gallery links. Missing source attributes are intentionally blank.
- Functional browser-preview flows for cart, quote request, B2B registration, checkout request, order tracking, delivery-photo upload, admin moderation, linked gallery management and CSV import/export.
- Manual product image workflow backed by Supabase Storage: multi-file previews, verified uploads, replacement, primary-image selection, deletion and verified-only customer publishing.
- Responsive product gallery with lazy-loaded cards, product-linked image records and a relational `product_images` model.
- `schema.sql` with relationships, foreign keys, checks and indexes for PostgreSQL production wiring.
- `server.mjs` with `/api/health` and environment-backed public integration configuration. Secrets are never sent to the browser.
- `worker.mjs` and `wrangler.toml` for a Cloudflare Workers deployment that reuses the existing Supabase and Razorpay adapters without replacing the local Node server.
- Optional Supabase Auth/profile integration through `/api/auth/session` and `/api/profile`, with server-side bearer verification and admin route gating when Supabase is configured.
- Additive Supabase RLS/storage migration at `supabase/migrations/20260930000100_auth_rls_storage.sql`. Review it against the existing Supabase schema before applying it.
- Razorpay TEST mode payment flow with server-side order creation, database price validation, signature verification, webhook idempotency and separate payment/order statuses. The additive payment migration is `supabase/migrations/20260930000200_razorpay_payments.sql`.

## Run it

```text
npm run test
npm run build
npm run dev
```

Open `http://localhost:4173`.

The preview uses local browser storage so the workflows can be inspected without credentials. It is not a substitute for production authentication or a database connection.

## Manual product images

Product photos are selected by an administrator inside the Product Images section of each product editor. JPG, JPEG, PNG and WEBP files are limited to 5 images per action and 5 MB per file. The browser shows previews before upload, while the server validates the bytes again before writing to the private `product-images` Supabase Storage bucket.

Each upload creates a verified `product_images` record with `source=manual_upload`, `image_type=product`, the product name as alt text and an object key under `product-images/{productId}/`. The server issues signed URLs for customer catalog reads. Replacements upload a new object before updating the existing record, and deletion removes the database record plus its storage object when available. The storefront renders only active verified HTTP or HTTPS image URLs and uses the existing placeholder when no image is available.

## Production setup

1. Copy `.env.example` to local development only. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY`; keep `SUPABASE_SERVICE_ROLE_KEY` server-only.
2. Inspect the existing Supabase schema, migrations, RLS policies and buckets before applying `schema.sql`, `supabase/migrations/20260930000100_auth_rls_storage.sql` or `supabase/migrations/20261003000300_manual_product_image_uploads.sql`. Never reset or destructively replace an existing project.
3. Seed `categories`, `subcategories`, `manufacturers` and `products` from `data/catalog.js`, retaining `source_page` and `source_duplicate_count` for provenance.
4. Configure Supabase Storage for product/gallery/delivery images. Keep `product-images` private, store object keys and metadata in the database, and use signed URLs for product reads and private delivery-photo storage until moderation.
5. Apply `supabase/migrations/20260930000200_razorpay_payments.sql` after reviewing the existing order schema. It adds the payment record and `orders.payment_status` without replacing delivery status.
6. Configure Razorpay TEST credentials only in the server/deployment secret store:

```text
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=server-only-test-secret
RAZORPAY_WEBHOOK_SECRET=server-only-webhook-secret
RAZORPAY_API_BASE_URL=https://api.razorpay.com
```

The server rejects non-`rzp_test_` keys. The secret is never included in `/config.js` or frontend code. Configure the Razorpay TEST webhook URL as `<temporary-deployment-url>/api/payments/razorpay/webhook` and keep webhook signing enabled.
7. Set `WHATSAPP_BUSINESS_NUMBER` once. Product enquiry links are generated from that single runtime value.
8. Deploy the existing application through Cloudflare Workers using the checked-in `worker.mjs` and `wrangler.toml`. Hostinger remains the domain registrar/DNS provider only; do not deploy the application there. See the Cloudflare deployment section below and [the production setup runbook](docs/supabase-cloudflare-github-production.md).
9. Add operational email/SMS and invoice generation in the server adapters before launch.

## Cloudflare Workers deployment

The production Worker serves the frontend from the generated `.worker-assets/` directory and handles `/api/*` through `worker.mjs`. The directory contains only the frontend shell and `public/assets`; it does not expose the repository, `.env`, migrations or server source files. The Worker then calls Supabase over HTTPS and Razorpay over HTTPS using Cloudflare environment bindings.

```text
npm install
npm test
npm run build
npm run worker:check
npm run worker:dry-run
```

`worker:dry-run` uses Wrangler's local bundle validation and does not deploy. When ready, authenticate Wrangler and configure the Worker environment values without putting them in this repository:

```text
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put APP_ORIGIN
npx wrangler secret put WHATSAPP_BUSINESS_NUMBER
npx wrangler secret put RAZORPAY_KEY_ID
npx wrangler secret put RAZORPAY_KEY_SECRET
npx wrangler secret put RAZORPAY_WEBHOOK_SECRET
npx wrangler secret put RAZORPAY_API_BASE_URL
npm run worker:deploy
```

No custom domain is configured by `wrangler.toml`. After deployment, verify the temporary `workers.dev` URL at `/api/health`, then connect the existing Hostinger domain to this Worker through Cloudflare DNS/routes when you are ready. Never commit `.env`, Supabase service-role keys, database passwords, Cloudflare tokens or payment secrets.

## Source data rules

The PDF did not provide customer prices, stock quantities, GST, MOQs, specifications or product images. The app keeps those values unconfigured instead of inventing them. Product purchase mode defaults to quote and can be changed by an admin after verification.

The two supplied JPEGs are copied to `public/assets/cosmic-life-force-logo.jpeg` and `public/assets/cosmic-life-force-reference.jpeg`. The logo file is used unchanged.
