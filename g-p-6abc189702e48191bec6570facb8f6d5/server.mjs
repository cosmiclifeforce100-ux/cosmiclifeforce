import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireSupabaseUser, supabasePublicConfig, supabaseRequest } from './server/supabase.mjs';
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
  imageSearchProvider: process.env.IMAGE_SEARCH_PROVIDER || 'none',
  imageSearchConfigured: Boolean(process.env.PEXELS_API_KEY || process.env.IMAGE_SEARCH_ENDPOINT),
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

function imageQuery(payload) {
  const manufacturer = String(payload.manufacturer || '').trim();
  const name = String(payload.name || '').trim();
  const category = String(payload.category || '').trim();
  const subcategory = String(payload.subcategory || '').trim();
  if (!name || !manufacturer) throw new Error('Manufacturer and exact product name are required.');
  return [manufacturer, name, subcategory || category].filter(Boolean).join(' ');
}

function normalizeImageCandidate(item, provider, query) {
  const src = item.src || item.images || {};
  const imageUrl = item.image_url || item.imageUrl || item.url || src.medium || src.large || src.original || src.small;
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return null;
  return {
    imageUrl,
    thumbnailUrl: item.thumbnail_url || item.thumbnailUrl || src.small || src.medium || imageUrl,
    source: provider,
    sourceUrl: item.source_url || item.sourceUrl || item.page_url || item.pageUrl || item.photographer_url || '',
    altText: item.alt || item.altText || item.description || query,
    verified: false,
    imageStatus: 'pending_review',
    isPrimary: false,
  };
}

async function searchImageCandidates(payload) {
  const provider = String(process.env.IMAGE_SEARCH_PROVIDER || 'none').toLowerCase();
  const query = imageQuery(payload);
  const limit = Math.min(Math.max(Number(payload.limit || 6), 1), 12);
  const timeout = Math.min(Math.max(Number(process.env.IMAGE_SEARCH_TIMEOUT_MS || 8000), 1000), 20000);
  if (provider === 'none' && !process.env.IMAGE_SEARCH_ENDPOINT) return { configured: false, provider: 'none', query, candidates: [] };

  let response;
  if (provider === 'pexels') {
    if (!process.env.PEXELS_API_KEY) throw new Error('PEXELS_API_KEY is not configured.');
    const endpoint = new URL('https://api.pexels.com/v1/search');
    endpoint.searchParams.set('query', query);
    endpoint.searchParams.set('per_page', String(limit));
    response = await fetch(endpoint, { headers: { Authorization: process.env.PEXELS_API_KEY }, signal: AbortSignal.timeout(timeout) });
  } else if (process.env.IMAGE_SEARCH_ENDPOINT) {
    const endpoint = new URL(process.env.IMAGE_SEARCH_ENDPOINT);
    endpoint.searchParams.set('q', query);
    endpoint.searchParams.set('query', query);
    endpoint.searchParams.set('limit', String(limit));
    const headers = { Accept: 'application/json' };
    if (process.env.IMAGE_SEARCH_API_KEY) headers.Authorization = `Bearer ${process.env.IMAGE_SEARCH_API_KEY}`;
    response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(timeout) });
  } else {
    throw new Error(`Unsupported image search provider: ${provider}`);
  }
  if (!response.ok) throw new Error(`Image provider returned HTTP ${response.status}.`);
  const data = await response.json();
  const items = data.photos || data.images || data.results || data.items || [];
  const candidates = items.map((item) => normalizeImageCandidate(item, provider === 'none' ? 'custom' : provider, query)).filter(Boolean).slice(0, limit);
  return { configured: true, provider, query, candidates };
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
    return sendJson(response, 200, { ok: true, service: 'cosmic-life-force', databaseConfigured: Boolean(process.env.DATABASE_URL || supabase.enabled), storageConfigured: Boolean(process.env.STORAGE_BUCKET || (supabase.enabled && process.env.SUPABASE_URL)), supabaseEnabled: supabase.enabled, razorpayEnabled: razorpay.enabled, razorpayTestMode: razorpay.testMode, razorpayWebhookConfigured: razorpay.webhookConfigured, imageSearchConfigured: publicConfig.imageSearchConfigured, imageSearchProvider: publicConfig.imageSearchProvider });
  }
  if (url.pathname === '/api/catalog' && request.method === 'GET') {
    try {
      const products = await supabaseRequest('/rest/v1/products?select=id,sku,name,manufacturer_id,brand,description,specifications,pack_size,moq,price,wholesale_price,gst,stock_status,purchase_mode,source_page,source_duplicate_count,active,manufacturer:manufacturers(name),category:categories(name),subcategory:subcategories(name)&active=eq.true&order=source_page.asc.nullslast,name.asc&limit=2000');
      const productIds = products.map((product) => product.id).filter(Boolean);
      let images = [];
      if (productIds.length) {
        try {
          const encodedIds = productIds.join(',');
          images = await supabaseRequest(`/rest/v1/product_images?product_id=in.(${encodedIds})&active=eq.true&verified=eq.true&image_status=eq.verified&select=product_id,public_url,alt_text,image_type,source,source_url,is_primary&order=is_primary.desc,sort_order.asc,created_at.asc`);
        } catch {
          images = [];
        }
      }
      const imageMap = new Map();
      images.forEach((image) => {
        if (!/^https?:\/\//i.test(image.public_url || '')) return;
        const list = imageMap.get(image.product_id) || [];
        list.push(image);
        imageMap.set(image.product_id, list);
      });
      return sendJson(response, 200, {
        ok: true,
        source: 'supabase',
        products: products.map((product) => ({
          ...product,
          images: (imageMap.get(product.id) || []).map((image) => ({
            imageUrl: image.public_url,
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
  if (url.pathname === '/api/image-search' && request.method === 'POST') {
    if (process.env.IMAGE_SEARCH_ADMIN_TOKEN && request.headers['x-image-search-token'] !== process.env.IMAGE_SEARCH_ADMIN_TOKEN) {
      return sendJson(response, 401, { ok: false, error: 'Image search authorization is required.' });
    }
    try {
      const payload = await readJson(request);
      return sendJson(response, 200, { ok: true, ...(await searchImageCandidates(payload)) });
    } catch (error) {
      return sendJson(response, 400, { ok: false, error: error instanceof Error ? error.message : 'Image search failed.' });
    }
  }
  const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const staticPath = requested.startsWith('/assets/') || requested === '/image-manifest.json'
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
