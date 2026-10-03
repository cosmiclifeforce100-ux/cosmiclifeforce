import { createHmac, timingSafeEqual } from 'node:crypto';

function config() {
  return {
    keyId: String(process.env.RAZORPAY_KEY_ID || ''),
    keySecret: String(process.env.RAZORPAY_KEY_SECRET || ''),
    webhookSecret: String(process.env.RAZORPAY_WEBHOOK_SECRET || ''),
    apiBaseUrl: String(process.env.RAZORPAY_API_BASE_URL || 'https://api.razorpay.com').replace(/\/$/, ''),
  };
}

export function razorpayPublicConfig() {
  const { keyId, keySecret } = config();
  const testKey = keyId.startsWith('rzp_test_');
  return {
    enabled: Boolean(keyId && keySecret && testKey),
    keyId: testKey ? keyId : '',
    testMode: testKey,
    webhookConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
  };
}

function errorWithStatus(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function compareHex(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyPaymentSignature(orderId, paymentId, signature) {
  const { keySecret } = config();
  if (!keySecret || !orderId || !paymentId || !signature) return false;
  const expected = createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return compareHex(expected, signature);
}

export function verifyWebhookSignature(rawBody, signature) {
  const { webhookSecret } = config();
  if (!webhookSecret || !signature) return false;
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return compareHex(expected, signature);
}

export async function razorpayRequest(path, options = {}) {
  const { keyId, keySecret, apiBaseUrl } = config();
  if (!keyId || !keySecret || !keyId.startsWith('rzp_test_')) {
    throw errorWithStatus('Razorpay TEST mode is not configured. Provide an rzp_test_ key pair.', 503);
  }
  const response = await fetch(`${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      ...(options.headers || {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(Number(process.env.RAZORPAY_TIMEOUT_MS || 10000)),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = typeof data === 'object' && data ? data.error?.description || data.error?.reason || data.message : data;
    throw errorWithStatus(String(message || `Razorpay returned HTTP ${response.status}.`), response.status);
  }
  return data;
}
