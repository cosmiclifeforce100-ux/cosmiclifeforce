# Cosmic Life Force Production Setup

## Audit result

The project is a vanilla ES-module storefront with a small Node server. It arrived without Git metadata or a remote, no Supabase URL/key, and no Cloudflare Pages/Workers/Wrangler configuration. Stage 1 initialized a local Git repository on `main`; no remote, commit, push or external infrastructure change was made.

The local preview remains available without credentials. When Supabase variables are present, the same UI switches customer registration/login/profile synchronization to Supabase Auth and the server protects the session/profile endpoints with bearer-token verification.

## Supabase

1. Confirm the existing Supabase project URL and anon key in the project dashboard.
2. Inspect the existing public schema, policies and storage buckets before applying anything.
3. If this project is the source of truth, apply `schema.sql` only when its tables do not already exist.
4. Apply `supabase/migrations/20260930000100_auth_rls_storage.sql` after reviewing table names against the existing database. It is additive, enables RLS, connects `auth.users` to the existing `public.users` table, and creates policies for customer/admin data and private delivery photos.
5. Set these server variables in the deployment secret store, never in committed files:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=server-only-service-role-key
```

The service-role key is used only by the server for role lookup. It must never be sent through `/config.js` or bundled into frontend code.

6. Create or reuse `product-images`, `gallery-images`, and `delivery-photos`. The migration creates private buckets and permits object reads only when a matching product/gallery metadata row is active and verified. Delivery photos remain private and should be served through signed URLs in the production storage adapter.
7. Promote an admin by changing the existing `public.users.role` value to `admin` through a controlled SQL migration or Supabase dashboard workflow. Do not trust a client-side role field.

## Razorpay TEST mode

Apply `supabase/migrations/20260930000200_razorpay_payments.sql` after reviewing the existing `orders` and `order_items` tables. The payment adapter:

- accepts only an `rzp_test_` key pair;
- creates Razorpay Orders on the server from active Supabase product prices;
- verifies the Checkout signature and remote payment order before marking payment `paid`;
- keeps payment status separate from delivery/order status;
- processes signed webhooks idempotently using `payments.webhook_event_id` and the provider IDs.

Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` as encrypted server/Cloudflare secrets. Configure the Razorpay TEST webhook endpoint as the temporary deployment URL plus `/api/payments/razorpay/webhook`. Never expose the key secret or commit any of these values. Without Supabase, service-role key, configured product prices and Razorpay TEST keys, the local preview intentionally cannot complete a real checkout.

## Cloudflare

The project does not contain an existing Cloudflare deployment file, so no Wrangler/Pages configuration was invented. Preserve the current deployment type and custom domain when connecting the repository:

- For Cloudflare Pages, keep the existing build command and publish directory, then add the required Pages Functions/API adapter for the Node server endpoints.
- For an existing Worker, keep its current routes and bind the static storefront/API handler through the existing Worker entrypoint.
- Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` through Cloudflare’s encrypted environment variables/secrets. Do not put them in GitHub Actions logs or source files.
- Keep delivery-photo storage private, disable accidental public caching for signed/private responses, and preserve existing DNS, SSL, redirects and custom-domain settings.

Do not create a second Pages project, Worker, domain or database. The current `server.mjs` is the local adapter and should be mapped into the existing Cloudflare deployment according to the infrastructure already attached to the domain.

## GitHub

The local repository now exists on `main`, but no GitHub remote is configured and no commit or push was made. Add the intended existing repository URL before committing:

```text
git status
git diff
git remote add origin <existing-repository-url>
git remote -v
npm test
npm run build
```

The repository must exclude `.env`, `.env.*` except `.env.example`, service-role keys, Cloudflare tokens, payment secrets and database passwords. `.gitignore` now covers those local secret files.

## Verification

With Supabase variables absent, `/api/health` reports the safe local-preview state. With variables present, verify:

- customer signup/login uses Supabase Auth;
- customer profile requests only return the signed-in user’s profile;
- admin session role comes from the server-side role lookup;
- unauthenticated admin/profile requests return `401`;
- non-admin admin requests return `403`;
- verified product/gallery images are readable while unverified records are hidden;
- delivery photo objects cannot be read publicly;
- `npm test`, `npm run build`, browser console checks and the production Cloudflare deployment checks all pass.
