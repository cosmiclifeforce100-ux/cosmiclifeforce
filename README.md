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
8. Preserve the existing GitHub repository and Cloudflare deployment. This local workspace now has a `main` Git branch but no remote Git or Cloudflare configuration, so connect the actual repository/domain rather than guessing. See [the production setup runbook](docs/supabase-cloudflare-github-production.md).
9. Add operational email/SMS and invoice generation in the server adapters before launch.

## Hostinger deployment

This repository is a Node.js web app, not a static-only site. On Hostinger, use Websites -> Add Website -> Node.js Web App -> Import Git Repository, then select the GitHub repository and the main branch. Use these settings when Hostinger asks for them:

```text
Node.js version: 20 or newer
Build command: npm run build
Start command: npm start
Port: use Hostinger's PORT value
```

Add the production environment variables in Hostinger's deployment settings. At minimum:

```text
APP_ORIGIN=https://your-domain.example
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=server-only-service-role-key
```

Never commit .env, Supabase service-role keys, database passwords or payment secrets. After the first deployment, confirm https://your-domain.example/api/health reports ok: true and supabaseEnabled: true.

If the domain is registered at Hostinger, point it from Domains -> Domain portfolio -> Manage -> DNS / Nameservers. If it is registered elsewhere, update DNS at that registrar. Hostinger's SSL certificate should be active before testing account creation or checkout.

Hostinger's Node.js GitHub deployment flow can redeploy from the selected branch after changes are pushed. Review the deployment settings and environment variables again whenever the app is redeployed.

## Source data rules

The PDF did not provide customer prices, stock quantities, GST, MOQs, specifications or product images. The app keeps those values unconfigured instead of inventing them. Product purchase mode defaults to quote and can be changed by an admin after verification.

The two supplied JPEGs are copied to `public/assets/cosmic-life-force-logo.jpeg` and `public/assets/cosmic-life-force-reference.jpeg`. The logo file is used unchanged.
