import { createHash } from 'node:crypto';
import { razorpayRequest, verifyPaymentSignature, verifyWebhookSignature } from './razorpay.mjs';
import { supabaseRequest } from './supabase.mjs';

function paymentError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requireServiceRole() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw paymentError('Server-side Supabase service-role access is required for payment processing.', 503);
}

function normalizeItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 50) throw paymentError('A checkout must contain between 1 and 50 products.', 422);
  return items.map((item) => {
    const productId = String(item?.productId || '').trim();
    const quantity = Number(item?.quantity);
    if (!productId || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000) throw paymentError('Each checkout line needs a valid product and quantity.', 422);
    return { productId, quantity };
  });
}

async function productForSku(productReference) {
  const reference = String(productReference || '').trim();
  const select = 'id,sku,name,manufacturer_id,manufacturer:manufacturers(name),price,wholesale_price,active';
  let rows = await supabaseRequest(`/rest/v1/products?sku=eq.${encodeURIComponent(reference)}&select=${select}&limit=1`, { useServiceRole: true });
  if (!rows?.length && /^[0-9a-f-]{36}$/i.test(reference)) {
    rows = await supabaseRequest(`/rest/v1/products?id=eq.${encodeURIComponent(reference)}&select=${select}&limit=1`, { useServiceRole: true });
  }
  return rows?.[0] || null;
}

async function orderPayment(orderId, userId) {
  const rows = await supabaseRequest(`/rest/v1/payments?order_id=eq.${encodeURIComponent(orderId)}&user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`, { useServiceRole: true });
  return rows?.[0] || null;
}

async function updatePayment(payment, orderStatus, paymentStatus, patch = {}) {
  await supabaseRequest(`/rest/v1/payments?id=eq.${encodeURIComponent(payment.id)}`, {
    method: 'PATCH',
    useServiceRole: true,
    headers: { Prefer: 'return=minimal' },
    body: { ...patch, status: paymentStatus, updated_at: new Date().toISOString() },
  });
  await supabaseRequest(`/rest/v1/orders?id=eq.${encodeURIComponent(payment.order_id)}`, {
    method: 'PATCH',
    useServiceRole: true,
    headers: { Prefer: 'return=minimal' },
    body: { payment_status: paymentStatus, ...(orderStatus ? { status: orderStatus } : {}), updated_at: new Date().toISOString() },
  });
}

export async function createRazorpayOrder(auth, payload) {
  requireServiceRole();
  const items = normalizeItems(payload?.items);
  const products = await Promise.all(items.map((item) => productForSku(item.productId)));
  const pricedItems = products.map((product, index) => {
    if (!product || product.active === false) throw paymentError(`Product ${items[index].productId} is unavailable.`, 422);
    const unitPrice = Number(product.wholesale_price ?? product.price);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw paymentError(`Price is not configured for ${items[index].productId}.`, 422);
    return { product, quantity: items[index].quantity, unitPrice, amountPaise: Math.round(unitPrice * 100) * items[index].quantity };
  });
  const amountPaise = pricedItems.reduce((total, item) => total + item.amountPaise, 0);
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) throw paymentError('The server could not calculate a valid INR amount.', 422);

  const orderNumber = `CLF-${Date.now().toString(36).toUpperCase()}`;
  const orderRows = await supabaseRequest('/rest/v1/orders', {
    method: 'POST',
    useServiceRole: true,
    headers: { Prefer: 'return=representation' },
    body: [{
      order_number: orderNumber,
      user_id: auth.user.id,
      status: 'Order Placed',
      payment_status: 'created',
      payment_provider: 'razorpay',
      subtotal: amountPaise / 100,
      grand_total: amountPaise / 100,
      notes: 'Created by Razorpay TEST mode checkout.',
    }],
  });
  const order = orderRows?.[0];
  if (!order?.id) throw paymentError('The server could not create the internal order.', 502);

  try {
    await supabaseRequest('/rest/v1/order_items', {
      method: 'POST',
      useServiceRole: true,
      headers: { Prefer: 'return=minimal' },
      body: pricedItems.map(({ product, quantity, unitPrice }) => ({
        order_id: order.id,
        product_id: product.id,
        product_name_snapshot: product.name,
        manufacturer_snapshot: product.manufacturer?.name || 'Not configured',
        quantity,
        unit_price: unitPrice,
        gst: null,
      })),
    });
    const razorpayOrder = await razorpayRequest('/v1/orders', {
      method: 'POST',
      body: { amount: amountPaise, currency: 'INR', receipt: orderNumber, notes: { internal_order_id: order.id } },
    });
    await supabaseRequest('/rest/v1/payments', {
      method: 'POST',
      useServiceRole: true,
      headers: { Prefer: 'return=minimal' },
      body: [{ order_id: order.id, user_id: auth.user.id, provider: 'razorpay', provider_order_id: razorpayOrder.id, status: 'created', amount_paise: amountPaise, currency: 'INR' }],
    });
    await supabaseRequest(`/rest/v1/orders?id=eq.${encodeURIComponent(order.id)}`, {
      method: 'PATCH',
      useServiceRole: true,
      headers: { Prefer: 'return=minimal' },
      body: { payment_status: 'pending', updated_at: new Date().toISOString() },
    });
    return { internalOrderId: order.id, orderNumber, razorpayOrderId: razorpayOrder.id, amount: amountPaise, currency: 'INR', keyId: process.env.RAZORPAY_KEY_ID, items: pricedItems.map(({ product, quantity }) => ({ productId: product.sku, name: product.name, quantity })) };
  } catch (error) {
    await supabaseRequest(`/rest/v1/orders?id=eq.${encodeURIComponent(order.id)}`, { method: 'PATCH', useServiceRole: true, headers: { Prefer: 'return=minimal' }, body: { payment_status: 'failed', updated_at: new Date().toISOString() } }).catch(() => {});
    throw error;
  }
}

export async function verifyRazorpayPayment(auth, payload) {
  requireServiceRole();
  const internalOrderId = String(payload?.internalOrderId || '').trim();
  const paymentId = String(payload?.razorpay_payment_id || '').trim();
  const providerOrderId = String(payload?.razorpay_order_id || '').trim();
  const signature = String(payload?.razorpay_signature || '').trim();
  if (!internalOrderId || !paymentId || !providerOrderId || !signature) throw paymentError('Incomplete Razorpay verification payload.', 422);
  const payment = await orderPayment(internalOrderId, auth.user.id);
  if (!payment) throw paymentError('Payment record not found.', 404);
  if (payment.provider_order_id !== providerOrderId) throw paymentError('Razorpay order mismatch.', 400);
  if (payment.status === 'paid') return { ok: true, status: 'paid', idempotent: true, internalOrderId };
  if (!verifyPaymentSignature(payment.provider_order_id, paymentId, signature)) throw paymentError('Razorpay signature verification failed.', 400);
  const remotePayment = await razorpayRequest(`/v1/payments/${encodeURIComponent(paymentId)}`);
  if (remotePayment.order_id !== payment.provider_order_id) throw paymentError('Razorpay payment belongs to a different order.', 400);
  if (!['authorized', 'captured'].includes(remotePayment.status)) throw paymentError(`Razorpay payment is ${remotePayment.status || 'not successful'}.`, 422);
  await updatePayment(payment, null, 'paid', { provider_payment_id: paymentId, provider_signature: signature, provider_payload: remotePayment });
  return { ok: true, status: 'paid', internalOrderId };
}

export async function cancelRazorpayPayment(auth, payload) {
  requireServiceRole();
  const internalOrderId = String(payload?.internalOrderId || '').trim();
  const payment = await orderPayment(internalOrderId, auth.user.id);
  if (!payment || ['paid', 'refunded'].includes(payment.status)) return { ok: true, status: payment?.status || 'not_found' };
  await updatePayment(payment, null, 'cancelled');
  return { ok: true, status: 'cancelled', internalOrderId };
}

export async function getRazorpayPaymentStatus(auth, internalOrderId) {
  requireServiceRole();
  const payment = await orderPayment(String(internalOrderId || '').trim(), auth.user.id);
  if (!payment) throw paymentError('Payment record not found.', 404);
  return { ok: true, internalOrderId: payment.order_id, razorpayOrderId: payment.provider_order_id, razorpayPaymentId: payment.provider_payment_id, status: payment.status, amount: payment.amount_paise, currency: payment.currency };
}

function webhookStatus(event) {
  if (event === 'payment.captured' || event === 'order.paid') return 'paid';
  if (event === 'payment.failed') return 'failed';
  if (event === 'refund.created' || event === 'refund.processed') return 'refunded';
  if (event === 'payment.authorized') return 'pending';
  return null;
}

export async function processRazorpayWebhook(rawBody, signature, eventIdHeader) {
  requireServiceRole();
  if (!verifyWebhookSignature(rawBody, signature)) throw paymentError('Razorpay webhook signature verification failed.', 401);
  const payload = JSON.parse(rawBody);
  const event = String(payload.event || '');
  const eventId = String(eventIdHeader || createHash('sha256').update(rawBody).digest('hex'));
  const duplicateRows = await supabaseRequest(`/rest/v1/payments?webhook_event_id=eq.${encodeURIComponent(eventId)}&select=id&limit=1`, { useServiceRole: true });
  if (duplicateRows?.length) return { ok: true, duplicate: true, eventId };
  const status = webhookStatus(event);
  if (!status) return { ok: true, ignored: true, event, eventId };
  const paymentEntity = payload.payload?.payment?.entity || payload.payload?.order?.entity || payload.payload?.refund?.entity || {};
  const providerOrderId = paymentEntity.order_id || paymentEntity.id;
  const providerPaymentId = paymentEntity.id?.startsWith?.('pay_') ? paymentEntity.id : paymentEntity.payment_id;
  if (!providerOrderId && !providerPaymentId) return { ok: true, ignored: true, event, eventId };
  const filter = providerOrderId ? `provider_order_id=eq.${encodeURIComponent(providerOrderId)}` : `provider_payment_id=eq.${encodeURIComponent(providerPaymentId)}`;
  const rows = await supabaseRequest(`/rest/v1/payments?${filter}&select=*&limit=1`, { useServiceRole: true });
  const payment = rows?.[0];
  if (!payment) return { ok: true, ignored: true, event, eventId };
  await updatePayment(payment, null, status, { provider_payment_id: providerPaymentId || payment.provider_payment_id, webhook_event_id: eventId, provider_payload: payload });
  return { ok: true, event, eventId, status };
}
