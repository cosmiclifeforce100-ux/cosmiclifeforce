import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireSupabaseUser, supabasePublicConfig, supabaseRequest, supabaseStorageSignedUrl } from './server/supabase.mjs';
import { deleteProductImage, setProductImagePrimary, uploadProductImages, PRODUCT_IMAGE_BUCKET } from './server/product-images.mjs';
import { razorpayPublicConfig } from './server/razorpay.mjs';
import { cancelRazorpayPayment, createRazorpayOrder, getRazorpayPaymentStatus, processRazorpayWebhook, verifyRazorpayPayment } from './server/payments.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

function loadDotEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();
const port = Number(process.env.PORT || 4173);
const supabase = supabasePublicConfig();
const razorpay = razorpayPublicConfig();
const publicConfig = {
  whatsappNumber: process.env.WHATSAPP_BUSINESS_NUMBER || '',
  paymentProvider: razorpay.enabled ? 'razorpay' : process.env.PAYMENT_PROVIDER || '',
  razorpayEnabled: razorpay.enabled,
  razorpayKeyId: razorpay.keyId,
  razorpayTestMode: razorpay.testMode,
  razorpayWebhookConfigured: razorpay.webhookConfigured,
  supabaseEnabled: supabase.enabled,
  supabaseUrl: supabase.url,
  supabaseAnonKey: supabase.anonKey,
};

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(response, status, body, type = 'text/plain; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(body);
}

function sendJson(response, status, body) {
  return send(response, status, JSON.stringify(body), 'application/json; charset=utf-8');
}

async function readJson(request) {
  return JSON.parse(await readRaw(request) || '{}');
}

async function readRaw(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

function serveFile(response, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) return send(response, 404, 'Not found');
    response.writeHead(200, { 'Content-Type': mime[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    response.end(data);
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname === '/config.js') {
    return send(response, 200, `window.RUNTIME_CONFIG = ${JSON.stringify(publicConfig)};`, 'text/javascript; charset=utf-8');
  }
  if (url.pathname === '/api/health') {
    return sendJson(response, 200, { ok: true, service: 'cosmic-life-force', databaseConfigured: Boolean(process.env.DATABASE_URL || supabase.enabled), storageConfigured: Boolean(process.env.STORAGE_BUCKET || (supabase.enabled && process.env.SUPABASE_URL)), supabaseEnabled: supabase.enabled, razorpayEnabled: razorpay.enabled, razorpayTestMode: razorpay.testMode, razorpayWebhookConfigured: razorpay.webhookConfigured, productImageBucket: PRODUCT_IMAGE_BUCKET });
  }
  if (url.pathname === '/api/catalog' && request.method === 'GET') {
    try {
      const products = await supabaseRequest('/rest/v1/products?select=id,sku,name,manufacturer_id,brand,description,specifications,pack_size,moq,price,wholesale_price,gst,stock_status,purchase_mode,source_page,source_duplicate_count,active,manufacturer:manufacturers(name),category:categories(name),subcategory:subcategories(name)&active=eq.true&order=source_page.asc.nullslast,name.asc&limit=2000');
      const productIds = products.map((product) => product.id).filter(Boolean);
      let images = [];
      if (productIds.length) {
        try {
          const encodedIds = productIds.join(',');
          images = await supabaseRequest(`/rest/v1/product_images?product_id=in.(${encodedIds})&active=eq.true&verified=eq.true&image_status=eq.verified&select=id,product_id,storage_key,public_url,alt_text,image_type,source,source_url,is_primary,sort_order&order=is_primary.desc,sort_order.asc,created_at.asc`);
        } catch {
          images = [];
        }
      }
      const imageMap = new Map();
      for (const image of images) {
        let imageUrl = image.public_url || '';
        if (image.storage_key) {
          try {
            imageUrl = await supabaseStorageSignedUrl(PRODUCT_IMAGE_BUCKET, image.storage_key);
          } catch {
            imageUrl = image.public_url || '';
          }
        }
        if (!/^https?:\/\//i.test(imageUrl)) continue;
        const list = imageMap.get(image.product_id) || [];
        list.push({ ...image, imageUrl });
        imageMap.set(image.product_id, list);
      }
      return sendJson(response, 200, {
        ok: true,
        source: 'supabase',
        products: products.map((product) => ({
          ...product,
          images: (imageMap.get(product.id) || []).map((image) => ({
            id: image.id,
            storageKey: image.storage_key,
            imageUrl: image.imageUrl,
            publicUrl: image.public_url,
            altText: image.alt_text,
            imageType: image.image_type,
            source: image.source,
            sourceUrl: image.source_url,
            isPrimary: image.is_primary,
            verified: true,
            imageStatus: 'verified',
          })),
        })),
      });
    } catch (error) {
      return sendJson(response, error.status || 503, { ok: false, error: error instanceof Error ? error.message : 'Supabase catalog unavailable.' });
    }
  }
  if (url.pathname === '/api/auth/session' && request.method === 'GET') {
    try {
      const auth = await requireSupabaseUser(request);
      return sendJson(response, 200, { ok: true, user: auth.user, role: auth.role });
    } catch (error) {
      return sendJson(response, error.status || 401, { ok: false, error: error instanceof Error ? error.message : 'Authentication failed.' });
    }
  }
  if (url.pathname === '/api/profile' && (request.method === 'GET' || request.method === 'POST' || request.method === 'PUT')) {
    try {
      const auth = await requireSupabaseUser(request);
      const userId = encodeURIComponent(auth.user.id);
      if (request.method === 'GET') {
        const rows = await supabaseRequest(`/rest/v1/business_profiles?user_id=eq.${userId}&select=*&limit=1`, { accessToken: auth.accessToken });
        return sendJson(response, 200, { ok: true, profile: rows?.[0] || null });
      }
      const payload = await readJson(request);
      const profile = {
        user_id: auth.user.id,
        business_name: String(payload.businessName || '').trim(),
        owner_name: String(payload.ownerName || '').trim(),
        mobile_number: String(payload.phone || '').trim(),
        gst_number: String(payload.gstNumber || '').trim() || null,
        customer_type: String(payload.customerType || 'Other').trim(),
        business_address: String(payload.address || payload.shippingAddress || '').trim() || null,
      };
      if (!profile.business_name || !profile.owner_name || !profile.mobile_number || !profile.customer_type) {
        return sendJson(response, 422, { ok: false, error: 'Business name, owner name, mobile number and customer type are required.' });
      }
      const rows = await supabaseRequest('/rest/v1/business_profiles?on_conflict=user_id', {
        method: 'POST',
        accessToken: auth.accessToken,
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: [profile],
      });
      return sendJson(response, 200, { ok: true, profile: rows?.[0] || profile });
    } catch (error) {
      return sendJson(response, error.status || 400, { ok: false, error: error instanceof Error ? error.message : 'Profile request failed.' });
    }
  }
  if (url.pathname === '/api/payments/razorpay/webhook' && request.method === 'POST') {
    try {
      const rawBody = await readRaw(request);
      const result = await processRazorpayWebhook(rawBody, request.headers['x-razorpay-signature'], request.headers['x-razorpay-event-id']);
      return sendJson(response, 200, result);
    } catch (error) {
      return sendJson(response, error.status || 400, { ok: false, error: error instanceof Error ? error.message : 'Webhook processing failed.' });
    }
  }
  if (url.pathname === '/api/payments/razorpay/order' && request.method === 'POST') {
    try {
      const auth = await requireSupabaseUser(request);
      return sendJson(response, 200, await createRazorpayOrder(auth, await readJson(request)));
    } catch (error) {
      return sendJson(response, error.status || 400, { ok: false, error: error instanceof Error ? error.message : 'Unable to create Razorpay order.' });
    }
  }
  if (url.pathname === '/api/payments/razorpay/verify' && request.method === 'POST') {
    try {
      const auth = await requireSupabaseUser(request);
      return sendJson(response, 200, await verifyRazorpayPayment(auth, await readJson(request)));
    } catch (error) {
      return sendJson(response, error.status || 400, { ok: false, error: error instanceof Error ? error.message : 'Unable to verify Razorpay payment.' });
    }
  }
  if (url.pathname === '/api/payments/razorpay/cancel' && request.method === 'POST') {
    try {
      const auth = await requireSupabaseUser(request);
      return sendJson(response, 200, await cancelRazorpayPayment(auth, await readJson(request)));
    } catch (error) {
      return sendJson(response, error.status || 400, { ok: false, error: error instanceof Error ? error.message : 'Unable to cancel Razorpay checkout.' });
    }
  }
  if (url.pathname === '/api/payments/razorpay/status' && request.method === 'GET') {
    try {
      const auth = await requireSupabaseUser(request);
      return sendJson(response, 200, await getRazorpayPaymentStatus(auth, url.searchParams.get('orderId')));
    } catch (error) {
      return sendJson(response, error.status || 400, { ok: false, error: error instanceof Error ? error.message : 'Unable to read payment status.' });
    }
  }
  const imageRoute = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/images(?:\/([^/]+))?(?:\/primary)?$/);
  if (imageRoute && request.method === 'POST' && !imageRoute[2]) {
    try {
      await requireSupabaseUser(request, { admin: true });
      return sendJson(response, 200, { ok: true, images: await uploadProductImages(decodeURIComponent(imageRoute[1]), await readJson(request)) });
    } catch (error) {
      return sendJson(response, error.status || 400, { ok: false, error: error instanceof Error ? error.message : 'Product image upload failed.' });
    }
  }
  if (imageRoute && imageRoute[2] && url.pathname.endsWith('/primary') && request.method === 'PUT') {
    try {
      await requireSupabaseUser(request, { admin: true });
      return sendJson(response, 200, { ok: true, images: await setProductImagePrimary(decodeURIComponent(imageRoute[1]), decodeURIComponent(imageRoute[2])) });
    } catch (error) {
      return sendJson(response, error.status || 400, { ok: false, error: error instanceof Error ? error.message : 'Primary image update failed.' });
    }
  }
  if (imageRoute && imageRoute[2] && request.method === 'DELETE') {
    try {
      await requireSupabaseUser(request, { admin: true });
      return sendJson(response, 200, { ok: true, ...(await deleteProductImage(decodeURIComponent(imageRoute[1]), decodeURIComponent(imageRoute[2]))) });
    } catch (error) {
      return sendJson(response, error.status || 400, { ok: false, error: error instanceof Error ? error.message : 'Product image deletion failed.' });
    }
  }
  if (url.pathname.startsWith('/api/')) return sendJson(response, 404, { ok: false, error: 'API route not found.' });
  const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const staticPath = requested.startsWith('/assets/')
    ? `/public${requested}`
    : requested;
  const filePath = path.resolve(root, `.${staticPath}`);
  if (!filePath.startsWith(path.resolve(root))) return send(response, 403, 'Forbidden');
  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isFile()) return serveFile(response, filePath);
    serveFile(response, path.join(root, 'index.html'));
  });
});

server.listen(port, () => {
  console.log(`Cosmic Life Force running at http://localhost:${port}`);
});
