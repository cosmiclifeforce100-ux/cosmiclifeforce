import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const config = read('wrangler.toml');
const workerSource = read('worker.mjs');

assert.match(config, /^name\s*=\s*"cosmiclifeforce"/m);
assert.match(config, /^main\s*=\s*"worker\.mjs"/m);
assert.match(config, /^compatibility_date\s*=\s*"2026-10-04"/m);
assert.match(config, /directory\s*=\s*"\.worker-assets"/);
assert.match(config, /not_found_handling\s*=\s*"single-page-application"/);
assert.match(config, /run_worker_first\s*=\s*\[\s*"\/api\/\*"\s*,\s*"\/config\.js"\s*\]/);
assert.match(workerSource, /env\.ASSETS\.fetch\(request\)/);
for (const route of ['/api/health', '/api/catalog', '/api/auth/session', '/api/profile', '/api/payments/razorpay/webhook', '/api/payments/razorpay/order', '/api/payments/razorpay/verify', '/api/payments/razorpay/cancel', '/api/payments/razorpay/status']) {
  assert.ok(workerSource.includes(route), `Worker route missing: ${route}`);
}
assert.match(workerSource, /imageRoute = url\.pathname\.match\(\/\^\\\/api\\\/admin/);
for (const secret of ['SUPABASE_SERVICE_ROLE_KEY', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET']) {
  assert.ok(!config.includes(`${secret} =`), `Secret must not be configured in wrangler.toml: ${secret}`);
}

const requiredAssets = ['index.html', 'app.js', 'styles.css', 'assets/cosmic-life-force-logo.jpeg'];
for (const asset of requiredAssets) assert.ok(fs.existsSync(path.join(root, '.worker-assets', asset)), `Missing staged Worker asset: ${asset}`);

await import('../worker.mjs');
console.log('Worker compatibility check passed.');
