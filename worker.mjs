import { requireSupabaseUser, supabasePublicConfig, supabaseRequest, supabaseStorageSignedUrl } from './server/supabase.mjs';
import { deleteProductImage, setProductImagePrimary, uploadProductImages, PRODUCT_IMAGE_BUCKET } from './server/product-images.mjs';
import { razorpayPublicConfig } from './server/razorpay.mjs';
import { cancelRazorpayPayment, createRazorpayOrder, getRazorpayPaymentStatus, processRazorpayWebhook, verifyRazorpayPayment } from './server/payments.mjs';

function publicConfig() {
  const supabase = supabasePublicConfig();
  const razorpay = razorpayPublicConfig();
  return {
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
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function textResponse(status, body, type = 'text/plain; charset=utf-8') {
  return new Response(body, {
    status,
    headers: { 'Content-Type': type, 'Cache-Control': 'no-store' },
  });
}

async function readJson(request) {
  return JSON.parse(await request.text() || '{}');
}

function nodeRequestHeaders(request) {
  return Object.fromEntries(request.headers.entries());
}

function authRequest(request) {
  return { headers: nodeRequestHeaders(request) };
}

function errorMessage(error, fallback) {
  return error instanceof Error ? error.message : fallback;
}

async function apiResponse(request, url) {
  if (url.pathname === '/api/health' && request.method === 'GET') {
    const supabase = supabasePublicConfig();
    const razorpay = razorpayPublicConfig();
    return jsonResponse(200, {
      ok: true,
      service: 'cosmic-life-force',
      databaseConfigured: Boolean(process.env.DATABASE_URL || supabase.enabled),
      storageConfigured: Boolean(process.env.STORAGE_BUCKET || (supabase.enabled && process.env.SUPABASE_URL)),
      supabaseEnabled: supabase.enabled,
      razorpayEnabled: razorpay.enabled,
      razorpayTestMode: razorpay.testMode,
      razorpayWebhookConfigured: razorpay.webhookConfigured,
      productImageBucket: PRODUCT_IMAGE_BUCKET,
    });
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
      return jsonResponse(200, {
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
      return jsonResponse(error.status || 503, { ok: false, error: errorMessage(error, 'Supabase catalog unavailable.') });
    }
  }

  if (url.pathname === '/api/auth/session' && request.method === 'GET') {
    try {
      const auth = await requireSupabaseUser(authRequest(request));
      return jsonResponse(200, { ok: true, user: auth.user, role: auth.role });
    } catch (error) {
      return jsonResponse(error.status || 401, { ok: false, error: errorMessage(error, 'Authentication failed.') });
    }
  }

  if (url.pathname === '/api/profile' && ['GET', 'POST', 'PUT'].includes(request.method)) {
    try {
      const auth = await requireSupabaseUser(authRequest(request));
      const userId = encodeURIComponent(auth.user.id);
      if (request.method === 'GET') {
        const rows = await supabaseRequest(`/rest/v1/business_profiles?user_id=eq.${userId}&select=*&limit=1`, { accessToken: auth.accessToken });
        return jsonResponse(200, { ok: true, profile: rows?.[0] || null });
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
        return jsonResponse(422, { ok: false, error: 'Business name, owner name, mobile number and customer type are required.' });
      }
      const rows = await supabaseRequest('/rest/v1/business_profiles?on_conflict=user_id', {
        method: 'POST',
        accessToken: auth.accessToken,
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: [profile],
      });
      return jsonResponse(200, { ok: true, profile: rows?.[0] || profile });
    } catch (error) {
      return jsonResponse(error.status || 400, { ok: false, error: errorMessage(error, 'Profile request failed.') });
    }
  }

  if (url.pathname === '/api/payments/razorpay/webhook' && request.method === 'POST') {
    try {
      const result = await processRazorpayWebhook(await request.text(), request.headers.get('x-razorpay-signature'), request.headers.get('x-razorpay-event-id'));
      return jsonResponse(200, result);
    } catch (error) {
      return jsonResponse(error.status || 400, { ok: false, error: errorMessage(error, 'Webhook processing failed.') });
    }
  }

  if (url.pathname === '/api/payments/razorpay/order' && request.method === 'POST') {
    try {
      const auth = await requireSupabaseUser(authRequest(request));
      return jsonResponse(200, await createRazorpayOrder(auth, await readJson(request)));
    } catch (error) {
      return jsonResponse(error.status || 400, { ok: false, error: errorMessage(error, 'Unable to create Razorpay order.') });
    }
  }

  if (url.pathname === '/api/payments/razorpay/verify' && request.method === 'POST') {
    try {
      const auth = await requireSupabaseUser(authRequest(request));
      return jsonResponse(200, await verifyRazorpayPayment(auth, await readJson(request)));
    } catch (error) {
      return jsonResponse(error.status || 400, { ok: false, error: errorMessage(error, 'Unable to verify Razorpay payment.') });
    }
  }

  if (url.pathname === '/api/payments/razorpay/cancel' && request.method === 'POST') {
    try {
      const auth = await requireSupabaseUser(authRequest(request));
      return jsonResponse(200, await cancelRazorpayPayment(auth, await readJson(request)));
    } catch (error) {
      return jsonResponse(error.status || 400, { ok: false, error: errorMessage(error, 'Unable to cancel Razorpay checkout.') });
    }
  }

  if (url.pathname === '/api/payments/razorpay/status' && request.method === 'GET') {
    try {
      const auth = await requireSupabaseUser(authRequest(request));
      return jsonResponse(200, await getRazorpayPaymentStatus(auth, url.searchParams.get('orderId')));
    } catch (error) {
      return jsonResponse(error.status || 400, { ok: false, error: errorMessage(error, 'Unable to read payment status.') });
    }
  }

  const imageRoute = url.pathname.match(/^\/api\/admin\/products\/([^/]+)\/images(?:\/([^/]+))?(?:\/primary)?$/);
  if (imageRoute && request.method === 'POST' && !imageRoute[2]) {
    try {
      await requireSupabaseUser(authRequest(request), { admin: true });
      return jsonResponse(200, { ok: true, images: await uploadProductImages(decodeURIComponent(imageRoute[1]), await readJson(request)) });
    } catch (error) {
      return jsonResponse(error.status || 400, { ok: false, error: errorMessage(error, 'Product image upload failed.') });
    }
  }
  if (imageRoute && imageRoute[2] && url.pathname.endsWith('/primary') && request.method === 'PUT') {
    try {
      await requireSupabaseUser(authRequest(request), { admin: true });
      return jsonResponse(200, { ok: true, images: await setProductImagePrimary(decodeURIComponent(imageRoute[1]), decodeURIComponent(imageRoute[2])) });
    } catch (error) {
      return jsonResponse(error.status || 400, { ok: false, error: errorMessage(error, 'Primary image update failed.') });
    }
  }
  if (imageRoute && imageRoute[2] && request.method === 'DELETE') {
    try {
      await requireSupabaseUser(authRequest(request), { admin: true });
      return jsonResponse(200, { ok: true, ...(await deleteProductImage(decodeURIComponent(imageRoute[1]), decodeURIComponent(imageRoute[2]))) });
    } catch (error) {
      return jsonResponse(error.status || 400, { ok: false, error: errorMessage(error, 'Product image deletion failed.') });
    }
  }

  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/config.js' && request.method === 'GET') {
      return textResponse(200, `window.RUNTIME_CONFIG = ${JSON.stringify(publicConfig())};`, 'text/javascript; charset=utf-8');
    }
    if (url.pathname.startsWith('/api/')) {
      const response = await apiResponse(request, url);
      return response || jsonResponse(404, { ok: false, error: 'API route not found.' });
    }
    if (!env?.ASSETS) return textResponse(500, 'Static asset binding is not configured.');
    return env.ASSETS.fetch(request);
  },
};
