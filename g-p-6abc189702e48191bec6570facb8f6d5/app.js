import { catalogMeta, catalogProducts, sourceRows } from './data/catalog.js';

const app = document.querySelector('#app');
const runtime = window.RUNTIME_CONFIG || {};
const STORAGE_KEY = 'cosmic-life-force-state';
const SUPABASE_SESSION_KEY = 'cosmic-life-force-supabase-session';
const PENDING_RAZORPAY_KEY = 'cosmic-life-force-pending-razorpay';
const DELIVERY_LOCATION_KEY = 'cosmic-life-force-delivery-location';
const suppliedReferenceAsset = '/assets/cosmic-life-force-reference.jpeg';
const catalogPositioning = 'Quality medical and healthcare products at competitive wholesale prices.';

const quickDeliveryLocations = ['Mumbai', 'Pune', 'Nashik'];

const categories = [
  { name: 'Medicines', description: 'Pharmaceutical products from the source catalog.', icon: 'Rx' },
  { name: 'Surgical Supplies', description: 'Procedure-ready supplies for clinical teams.', icon: '01' },
  { name: 'Medical Devices', description: 'Monitoring and care devices for professional use.', icon: 'BP' },
  { name: 'Disposable Products', description: 'Everyday disposable healthcare essentials.', icon: 'DS' },
  { name: 'Diagnostic Products', description: 'Diagnostic products and supporting supplies.', icon: 'DX' },
  { name: 'Hospital Equipment', description: 'Equipment for patient care environments.', icon: 'EQ' },
  { name: 'PPE Products', description: 'Protective products for clinical workflows.', icon: 'PPE' },
  { name: 'Dental Products', description: 'Dental and oral-care product lines.', icon: 'DR' },
  { name: 'Orthopedic', description: 'Supports, braces, belts and mobility products.', icon: 'OR' },
  { name: 'Healthcare & Hard Products', description: 'Personal care and healthcare business supplies.', icon: 'HC' },
];

const features = [
  ['Wholesale pricing', 'B2B-ready product records with admin-configurable pricing.'],
  ['Bulk orders', 'Request a structured quote for multi-line requirements.'],
  ['Fast delivery', 'Track each order from placement through delivery.'],
  ['GST invoices', 'Business fields are ready for GST and invoice workflows.'],
  ['Genuine products', 'Catalog rows are sourced from your uploaded product list.'],
  ['Dedicated support', 'Reach the team by WhatsApp when the number is configured.'],
];

const orthopedicSubcategories = [
  'All supports', 'Knee Support', 'Back Support', 'Wrist Support', 'Elbow Support',
  'Ankle Support', 'Shoulder Support', 'Abdominal Support', 'Braces', 'Belts',
  'Tapes', 'Fracture Support', 'Walking / Mobility Support',
];

const defaultState = {
  cart: [],
  quoteLines: [],
  profile: null,
  session: null,
  orders: [],
  prescriptionRequests: [],
  deliveries: [],
  gallery: [],
  imageCandidates: {},
  customProducts: [],
  overrides: {},
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      ...defaultState,
      ...saved,
      cart: Array.isArray(saved.cart) ? saved.cart : [],
      quoteLines: Array.isArray(saved.quoteLines) ? saved.quoteLines : [],
      orders: Array.isArray(saved.orders) ? saved.orders : [],
      prescriptionRequests: Array.isArray(saved.prescriptionRequests) ? saved.prescriptionRequests : [],
      deliveries: Array.isArray(saved.deliveries) ? saved.deliveries : [],
      gallery: Array.isArray(saved.gallery) ? saved.gallery : [],
      imageCandidates: saved.imageCandidates && typeof saved.imageCandidates === 'object' ? saved.imageCandidates : {},
      customProducts: Array.isArray(saved.customProducts) ? saved.customProducts : [],
      overrides: saved.overrides && typeof saved.overrides === 'object' ? saved.overrides : {},
    };
  } catch {
    return { ...defaultState };
  }
}

const state = loadState();
let supabaseSession = (() => {
  try {
    return JSON.parse(sessionStorage.getItem(SUPABASE_SESSION_KEY) || 'null');
  } catch {
    return null;
  }
})();
let imageManifest = { products: {}, categories: {} };
let remoteCatalogProducts = null;
let catalogSource = 'pdf';

function supabaseReady() {
  return Boolean(runtime.supabaseEnabled && runtime.supabaseUrl && runtime.supabaseAnonKey);
}

function sessionAccessToken() {
  return supabaseSession?.access_token || '';
}

function storeSupabaseSession(session) {
  supabaseSession = session || null;
  try {
    if (supabaseSession) sessionStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(supabaseSession));
    else sessionStorage.removeItem(SUPABASE_SESSION_KEY);
  } catch {
    // The browser preview remains usable when session storage is unavailable.
  }
}

async function supabaseAuth(path, payload) {
  if (!supabaseReady()) throw new Error('Supabase Auth is not configured for this deployment.');
  const response = await fetch(`${runtime.supabaseUrl}/auth/v1/${path}`, {
    method: 'POST',
    headers: { apikey: runtime.supabaseAnonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.error_description || data.message || 'Supabase Auth request failed.');
  return data;
}

async function authenticatedApi(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}), Authorization: `Bearer ${sessionAccessToken()}` },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Authenticated request failed.');
  return data;
}

function localProfileFields(data) {
  return {
    businessName: String(data.businessName || '').trim(),
    ownerName: String(data.ownerName || '').trim(),
    email: String(data.email || '').trim(),
    phone: String(data.phone || '').trim(),
    gstNumber: String(data.gstNumber || '').trim(),
    customerType: String(data.customerType || 'Other').trim(),
    address: String(data.address || data.shippingAddress || '').trim(),
  };
}

function mapRemoteProfile(profile) {
  return profile ? localProfileFields({
    businessName: profile.business_name,
    ownerName: profile.owner_name,
    phone: profile.mobile_number,
    gstNumber: profile.gst_number,
    customerType: profile.customer_type,
    address: profile.business_address,
    email: state.profile?.email || supabaseSession?.user?.email || '',
  }) : null;
}

async function saveRemoteProfile(data) {
  if (!supabaseReady() || !sessionAccessToken()) return;
  const result = await authenticatedApi('/api/profile', { method: 'PUT', body: localProfileFields(data) });
  if (result.profile) state.profile = { ...(state.profile || {}), ...mapRemoteProfile(result.profile) };
}

function readPendingRazorpay() {
  try {
    return JSON.parse(sessionStorage.getItem(PENDING_RAZORPAY_KEY) || 'null');
  } catch {
    return null;
  }
}

function savePendingRazorpay(value) {
  try {
    if (value) sessionStorage.setItem(PENDING_RAZORPAY_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(PENDING_RAZORPAY_KEY);
  } catch {
    // Payment verification remains server-authoritative when session storage is unavailable.
  }
}

function readDeliveryLocation() {
  try {
    return String(localStorage.getItem(DELIVERY_LOCATION_KEY) || '').trim();
  } catch {
    return '';
  }
}

function normalizeDeliveryLocation(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 60);
}

function storeDeliveryLocation(value) {
  const location = normalizeDeliveryLocation(value);
  try {
    if (location) localStorage.setItem(DELIVERY_LOCATION_KEY, location);
    else localStorage.removeItem(DELIVERY_LOCATION_KEY);
  } catch {
    // The header remains usable when browser storage is unavailable.
  }
  return location;
}

function localRemoteOrder(details, checkoutData, paymentStatus) {
  const order = {
    id: details.internalOrderId,
    orderNumber: details.orderNumber,
    ...checkoutData,
    items: details.items || [],
    status: 'Order Placed',
    paymentStatus,
    paymentProvider: 'razorpay',
    razorpayOrderId: details.razorpayOrderId,
    date: new Date().toLocaleDateString('en-IN'),
  };
  const existing = state.orders.findIndex((item) => item.id === order.id);
  if (existing >= 0) state.orders[existing] = { ...state.orders[existing], ...order };
  else state.orders.push(order);
  state.profile = { ...(state.profile || {}), ...localProfileFields(checkoutData) };
  if (paymentStatus === 'paid') state.cart = [];
  saveState();
  return order;
}

async function loadRazorpayCheckout() {
  if (window.Razorpay) return;
  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-razorpay-checkout]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', () => reject(new Error('Razorpay Checkout could not be loaded.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Razorpay Checkout could not be loaded.'));
    document.head.appendChild(script);
  });
  if (!window.Razorpay) throw new Error('Razorpay Checkout is unavailable in this browser.');
}

async function reconcilePendingRazorpay() {
  const pending = readPendingRazorpay();
  if (!pending?.order?.internalOrderId || !supabaseReady() || !sessionAccessToken() || !runtime.razorpayEnabled) return;
  try {
    const status = await authenticatedApi(`/api/payments/razorpay/status?orderId=${encodeURIComponent(pending.order.internalOrderId)}`);
    if (status.status === 'paid') {
      localRemoteOrder(pending.order, pending.checkoutData || {}, 'paid');
      savePendingRazorpay(null);
      toast('Payment verified and order saved.', 'success');
      renderShell();
    } else if (['failed', 'cancelled', 'refunded'].includes(status.status)) {
      savePendingRazorpay(null);
    }
  } catch {
    // Keep the pending record so a later authenticated visit can reconcile it.
  }
}

async function startRazorpayPayment(checkoutData) {
  if (!supabaseReady() || !sessionAccessToken()) {
    toast('Sign in with a business account before using Razorpay checkout.', 'error');
    navigate('/login');
    return;
  }
  const items = cartProductLines().map(({ line, product }) => ({ productId: product.id, quantity: line.quantity }));
  if (!items.length) {
    toast('Your cart is empty.', 'error');
    navigate('/cart');
    return;
  }
  try {
    const order = await authenticatedApi('/api/payments/razorpay/order', {
      method: 'POST',
      body: { items, customer: localProfileFields(checkoutData) },
    });
    savePendingRazorpay({ order, checkoutData });
    await loadRazorpayCheckout();
    const checkout = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: 'Cosmic Life Force',
      description: 'B2B medical order',
      order_id: order.razorpayOrderId,
      prefill: { name: checkoutData.ownerName, email: checkoutData.email, contact: checkoutData.phone },
      theme: { color: '#0a4770' },
      handler: async (response) => {
        try {
          const verified = await authenticatedApi('/api/payments/razorpay/verify', {
            method: 'POST',
            body: { internalOrderId: order.internalOrderId, ...response },
          });
          localRemoteOrder(order, checkoutData, verified.status);
          savePendingRazorpay(null);
          toast('Payment verified. Your order is now in the account workspace.', 'success');
          navigate('/account');
        } catch (error) {
          toast(error instanceof Error ? error.message : 'Payment verification is still pending. Please revisit your account shortly.', 'error');
        }
      },
      modal: {
        ondismiss: () => {
          void authenticatedApi('/api/payments/razorpay/cancel', { method: 'POST', body: { internalOrderId: order.internalOrderId } }).catch(() => {});
          savePendingRazorpay(null);
          toast('Razorpay checkout was cancelled.', 'info');
        },
      },
    });
    checkout.on('payment.failed', () => {
      toast('Razorpay reported a failed test payment. The server webhook remains authoritative.', 'error');
    });
    checkout.open();
  } catch (error) {
    savePendingRazorpay(null);
    toast(error instanceof Error ? error.message : 'Unable to start Razorpay checkout.', 'error');
  }
}

async function hydrateSupabaseSession() {
  if (!supabaseReady() || !sessionAccessToken()) return;
  try {
    const session = await authenticatedApi('/api/auth/session');
    state.session = { role: session.role || 'customer', email: session.user?.email || '', userId: session.user?.id || '' };
    const profile = await authenticatedApi('/api/profile');
    if (profile.profile) state.profile = { ...(state.profile || {}), ...mapRemoteProfile(profile.profile) };
    saveState();
    renderShell();
    await reconcilePendingRazorpay();
  } catch {
    storeSupabaseSession(null);
    state.session = null;
    saveState();
    renderShell();
  }
}

async function signOutSupabase() {
  if (supabaseReady() && sessionAccessToken()) {
    await fetch(`${runtime.supabaseUrl}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: runtime.supabaseAnonKey, Authorization: `Bearer ${sessionAccessToken()}` },
    }).catch(() => {});
  }
  storeSupabaseSession(null);
}

async function loadImageManifest() {
  try {
    const response = await fetch('/image-manifest.json', { cache: 'no-store' });
    if (!response.ok) return;
    const manifest = await response.json();
    imageManifest = { products: manifest.products || {}, categories: manifest.categories || {} };
    renderShell();
  } catch {
    // The storefront remains usable with safe placeholders until discovery is configured.
  }
}

function normalizeRemoteProduct(raw) {
  const images = Array.isArray(raw.images) ? raw.images : [];
  const relationName = (relation) => relation?.name || relation?.[0]?.name || 'Not configured';
  return {
    id: String(raw.sku || raw.id || '').trim(),
    name: raw.name || 'Unnamed product',
    manufacturer: relationName(raw.manufacturer),
    sourcePage: raw.source_page || null,
    sourceDuplicates: raw.source_duplicate_count || 0,
    category: relationName(raw.category) === 'Not configured' ? 'Healthcare & Hard Products' : relationName(raw.category),
    subcategory: relationName(raw.subcategory) === 'Not configured' ? 'Uncategorized' : relationName(raw.subcategory),
    brand: raw.brand || '',
    description: raw.description || '',
    packSize: raw.pack_size || '',
    specifications: raw.specifications || {},
    variants: Array.isArray(raw.product_variants) ? raw.product_variants : [],
    images: images.map((image) => ({
      imageUrl: image.imageUrl || image.public_url,
      altText: image.altText || image.alt_text || raw.name,
      verified: image.verified === true,
      imageStatus: image.imageStatus || image.image_status || 'verified',
      source: image.source || '',
      sourceUrl: image.sourceUrl || image.source_url || '',
      isPrimary: image.isPrimary === true || image.is_primary === true,
    })),
    moq: raw.moq ?? null,
    price: raw.price ?? null,
    wholesalePrice: raw.wholesale_price ?? null,
    bulkPricing: Array.isArray(raw.bulk_prices) ? raw.bulk_prices : [],
    gst: raw.gst ?? null,
    stockStatus: raw.stock_status || 'not-configured',
    purchaseMode: raw.purchase_mode || 'quote',
    sku: raw.sku || '',
    active: raw.active !== false,
  };
}

async function loadSupabaseCatalog() {
  if (!supabaseReady()) return;
  try {
    const response = await fetch('/api/catalog', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || 'Supabase catalog unavailable.');
    const products = (data.products || []).map(normalizeRemoteProduct).filter((product) => product.id && product.name);
    if (!products.length) throw new Error('No active Supabase products are available.');
    remoteCatalogProducts = products;
    catalogSource = 'supabase';
    renderShell();
  } catch {
    // Keep the PDF catalog visible when the optional remote catalog is unavailable.
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getProducts() {
  const sourceProducts = remoteCatalogProducts || catalogProducts;
  const catalog = sourceProducts.map((product) => ({ ...product, ...(state.overrides[product.id] || {}) }));
  return [...catalog, ...state.customProducts];
}

function catalogCount() {
  return customerProducts().length;
}

function customerProducts() {
  return getProducts().filter((product) => product.active !== false);
}

function getProduct(id) {
  return getProducts().find((product) => product.id === id);
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-IN').format(value);
}

function formatCurrency(value) {
  return `Rs. ${formatNumber(value)}`;
}

function displayValue(value, fallback = 'Not configured') {
  return value === null || value === undefined || value === '' ? fallback : esc(value);
}

function priceLabel(product) {
  return product.price !== null && product.price !== undefined && product.price !== '' ? formatCurrency(product.price) : 'Price on request';
}

function pathInfo() {
  const raw = location.hash.slice(1) || '/';
  const [path, queryString = ''] = raw.split('?');
  return { path: path || '/', query: new URLSearchParams(queryString) };
}

const RECENT_SEARCHES_KEY = 'cosmic-life-force-recent-searches';

function recentSearches() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
    return Array.isArray(saved) ? saved.filter(Boolean).slice(0, 5) : [];
  } catch {
    return [];
  }
}

function rememberSearch(value) {
  const term = String(value || '').trim();
  if (!term) return;
  const next = [term, ...recentSearches().filter((item) => item.toLowerCase() !== term.toLowerCase())].slice(0, 5);
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
  } catch {
    // Search remains functional if local storage is unavailable.
  }
}

function searchSuggestions(query = '') {
  const needle = String(query || '').toLowerCase();
  const catalogValues = customerProducts().flatMap((product) => [product.name, product.manufacturer, product.category, product.subcategory, product.sku]);
  return [...new Set([...recentSearches(), ...catalogValues]
    .map((value) => String(value || '').trim())
    .filter((value) => value && (!needle || value.toLowerCase().includes(needle))))].slice(0, 10);
}

function manufacturerDirectory(limit = 12) {
  const counts = new Map();
  customerProducts().forEach((product) => counts.set(product.manufacturer, (counts.get(product.manufacturer) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function categoryProducts(categoryName) {
  return customerProducts().filter((product) => product.category === categoryName);
}

function categoryImageUrl(category) {
  const manifestImage = (imageManifest.categories?.[category.name]?.images || []).find(isPublishableImage);
  if (manifestImage) return imageRecordUrl(manifestImage);
  return categoryProducts(category.name).flatMap((product) => linkedProductImages(product)).find(Boolean) || '';
}

function categoryMenu(label, categoryName, href, active, path) {
  const products = categoryProducts(categoryName);
  const subcategories = [...new Set(products.map((product) => product.subcategory).filter(Boolean))].slice(0, 8);
  const menuProducts = products.slice(0, 6);
  return `<div class="nav-menu-wrap"><a class="${active === 'products' && path.startsWith('/products') && pathInfo().query.get('category') === categoryName ? 'active' : ''}" href="${href}">${label}<span class="nav-caret">⌄</span></a><div class="nav-mega-menu"><div class="nav-mega-heading"><div><span class="eyebrow">Catalog family</span><strong>${esc(label)}</strong></div><span>${formatNumber(products.length)} lines</span></div><div class="nav-mega-columns"><div><b>Browse by type</b>${subcategories.length ? subcategories.map((subcategory) => `<a href="#/products?category=${encodeURIComponent(categoryName)}&subcategory=${encodeURIComponent(subcategory)}">${esc(subcategory)} <span>↗</span></a>`).join('') : '<span class="nav-mega-empty">Subcategories will appear as catalog data is configured.</span>'}</div><div><b>Product lines</b>${menuProducts.length ? menuProducts.map((product) => `<a href="#/product/${esc(product.id)}">${esc(product.name)} <span>↗</span></a>`).join('') : '<span class="nav-mega-empty">No active product lines in this family.</span>'}</div></div><a class="nav-mega-footer" href="${href}">View all ${esc(label)} products <span>↗</span></a></div></div>`;
}

function navigate(path) {
  location.hash = path;
}

function toast(message, tone = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const node = document.createElement('div');
  node.className = `toast toast-${tone}`;
  node.innerHTML = `<strong>${tone === 'success' ? 'Saved' : tone === 'error' ? 'Needs attention' : 'Cosmic Life Force'}</strong><span>${esc(message)}</span>`;
  document.body.appendChild(node);
  window.setTimeout(() => node.remove(), 3600);
}

function cartCount() {
  return state.cart.reduce((total, line) => total + line.quantity, 0);
}

function cartProductLines() {
  return state.cart.map((line) => ({ line, product: getProduct(line.productId) })).filter((item) => item.product);
}

function addToCart(productId, quantity = 1) {
  const product = getProduct(productId);
  if (!product) return;
  const existing = state.cart.find((line) => line.productId === productId);
  if (existing) existing.quantity += quantity;
  else state.cart.push({ productId, quantity: Math.max(1, quantity) });
  saveState();
  toast(`${product.name} added to cart.`, 'success');
  renderShell();
}

function addQuoteLine(productId, quantity = 1) {
  const product = getProduct(productId);
  if (!product) return;
  const existing = state.quoteLines.find((line) => line.productId === productId);
  if (existing) existing.quantity += quantity;
  else state.quoteLines.push({ productId, quantity: Math.max(1, quantity) });
  saveState();
  navigate('/quote');
}

function placeholderArt(label = 'Image not supplied', compact = false) {
  return `<div class="product-art ${compact ? 'product-art-compact' : ''}"><div class="art-cross">+</div><span>${esc(label === 'Image not supplied' ? 'Product Image Coming Soon' : label)}</span><small>Admin upload or verified match pending</small></div>`;
}

function imageRecordUrl(record) {
  return typeof record === 'string' ? record : record?.imageUrl || record?.url || record?.dataUrl || '';
}

function isPublishableImage(record) {
  if (typeof record === 'string') return true;
  return record?.verified === true || record?.imageStatus === 'verified' || (record?.dataUrl && record?.verified !== false);
}

function linkedProductImages(product) {
  const configured = Array.isArray(product?.images) ? product.images : [];
  const mapped = imageManifest.products?.[product?.id]?.images || [];
  const candidateImages = state.imageCandidates?.[product?.id] || [];
  const galleryImages = state.gallery
    .filter((item) => item.productId === product?.id && item.active !== false)
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    .filter(Boolean);
  return [...configured, ...galleryImages, ...mapped, ...candidateImages]
    .filter(isPublishableImage)
    .map(imageRecordUrl)
    .filter(Boolean);
}

function productArt(product, compact = false, label) {
  const image = linkedProductImages(product)[0];
  return image
    ? `<div class="product-art ${compact ? 'product-art-compact' : ''} product-art-image"><img src="${esc(image)}" alt="${esc(product.name)}" loading="lazy" decoding="async" sizes="(max-width: 650px) 92vw, (max-width: 980px) 45vw, 280px" /></div>`
    : placeholderArt(label || `${product.name} image coming soon`, compact);
}

function pageTitle(kicker, title, description = '') {
  return `<section class="page-intro"><div><p class="eyebrow">${esc(kicker)}</p><h1>${esc(title)}</h1>${description ? `<p class="page-description">${esc(description)}</p>` : ''}</div></section>`;
}

function renderHeader() {
  const { path } = pathInfo();
  const active = path.startsWith('/products') ? 'products' : path.slice(1) || 'home';
  const announcement = active === 'home' ? '' : '<div class="announcement"><div class="shell announcement-inner"><span>Wholesale medical supply, built for professional teams</span><span class="announcement-right">' + formatNumber(catalogCount()) + ' active catalog products · ' + (catalogSource === 'supabase' ? 'Supabase catalog' : 'PDF source catalog') + '</span></div></div>';
  const searchQuery = pathInfo().query.get('query') || '';
  const selectedLocation = readDeliveryLocation();
  const navItems = [
    `<a class="${active === 'home' ? 'active' : ''}" href="#/">Home</a>`,
    categoryMenu('Medicines', 'Medicines', '#/products?category=Medicines', active, path),
    categoryMenu('Healthcare', 'Healthcare & Hard Products', '#/products?category=Healthcare%20%26%20Hard%20Products', active, path),
    categoryMenu('Orthopedic', 'Orthopedic', '#/products?category=Orthopedic', active, path),
    `<a class="${active === 'categories' ? 'active' : ''}" href="#/categories">Categories</a>`,
    `<a class="${active === 'gallery' ? 'active' : ''}" href="#/gallery">Gallery</a>`,
    `<a class="${active === 'deliveries' ? 'active' : ''}" href="#/deliveries">Customer Deliveries</a>`,
    `<a class="${active === 'wholesale' ? 'active' : ''}" href="#/wholesale">Wholesale</a>`,
    `<a class="${active === 'about' ? 'active' : ''}" href="#/about">About Us</a>`,
    `<a class="${active === 'contact' ? 'active' : ''}" href="#/contact">Contact</a>`,
  ];
  return `<header class="site-header">
    ${announcement}
    <div class="shell header-main">
      <a class="brand" href="#/" aria-label="Cosmic Life Force home"><img src="/assets/cosmic-life-force-logo.jpeg" alt="Cosmic Life Force logo" /><span><strong>Cosmic Life Force</strong><small>Medicines for Quantum Healing</small></span></a>
      <div class="delivery-context-wrap">
        <button class="delivery-context" type="button" data-action="toggle-location" aria-expanded="false" aria-controls="delivery-location-popover"><small>Deliver to</small><strong>${esc(selectedLocation || 'Select location')} <span class="delivery-chevron" aria-hidden="true">⌄</span></strong></button>
        <div class="location-popover" id="delivery-location-popover" data-location-popover role="dialog" aria-label="Delivery location" aria-hidden="true">
          <div class="location-popover-heading"><div><p class="eyebrow">Delivery location</p><h3>Where should we deliver?</h3></div><button class="location-close" type="button" data-action="close-location" aria-label="Close location chooser">×</button></div>
          <div class="location-quick-list"><span>Quick select</span>${quickDeliveryLocations.map((location) => `<button type="button" data-action="select-location" data-location="${esc(location)}" class="${selectedLocation === location ? 'selected' : ''}">${esc(location)}</button>`).join('')}</div>
          <form class="location-form" data-form="delivery-location"><label for="delivery-location-input">City or area<input id="delivery-location-input" name="location" value="${esc(selectedLocation)}" maxlength="60" placeholder="e.g. Mumbai, Pune or Nashik" autocomplete="address-level2" required /></label><button class="button button-primary button-small" type="submit">Use this location <span aria-hidden="true">↗</span></button></form>
          ${selectedLocation ? `<button class="location-clear" type="button" data-action="clear-location">Clear saved location</button>` : ''}
          <small class="location-note">Your selection is saved in this browser.</small>
        </div>
      </div>
      <div class="header-search-wrap"><form class="header-search" data-form="search"><input name="query" list="catalog-search-suggestions" aria-label="Search product catalog" placeholder="What are you looking for? Search medicines, healthcare products, orthopedic products..." value="${esc(searchQuery)}" /><button type="submit" class="icon-button" aria-label="Search">⌕</button></form><datalist id="catalog-search-suggestions">${searchSuggestions(searchQuery).map((value) => `<option value="${esc(value)}"></option>`).join('')}</datalist><div class="search-panel" aria-label="Search discovery"><div><span class="search-panel-label">${searchQuery ? 'Matching catalog entries' : 'Start with a search'}</span><div class="search-suggestion-list">${searchSuggestions(searchQuery).map((value) => `<button type="button" data-action="search-suggestion" data-query="${esc(value)}">⌕ <span>${esc(value)}</span></button>`).join('') || '<span class="search-empty">Search by product, manufacturer, category or SKU.</span>'}</div></div><div class="search-panel-links"><span>Browse</span>${categories.slice(0, 5).map((category) => `<a href="#/products?category=${encodeURIComponent(category.name)}">${esc(category.name)}</a>`).join('')}</div></div></div>
      <div class="header-actions"><a class="text-action ${active === 'login' ? 'active' : ''}" href="#/login">Login</a><a class="text-action orders-link ${active === 'orders' ? 'active' : ''}" href="#/orders">Orders</a><a class="register-button" href="#/register">Register</a><a class="cart-button" href="#/cart" aria-label="Cart"><span class="cart-icon">Cart</span><b>${cartCount()}</b></a><button class="menu-button" data-action="toggle-menu" aria-label="Open navigation">Menu</button></div>
    </div>
    <nav class="primary-nav" aria-label="Main navigation"><div class="shell nav-inner"><div class="nav-links">${navItems.join('')}</div><a class="account-link ${active === 'account' ? 'active' : ''}" href="#/account">My account <span>↗</span></a></div></nav>
  </header>`;
}

function renderFooter() {
  return `<footer class="site-footer"><div class="shell footer-grid"><div class="footer-brand"><div class="footer-mark"><img src="/assets/cosmic-life-force-logo.jpeg" alt="Cosmic Life Force logo" /></div><h2>Cosmic Life Force</h2><p>Medicines for Quantum Healing</p><p class="muted">A catalog-led B2B supply experience for pharmacies, hospitals, clinics and distributors.</p></div><div><h3>Explore</h3><a href="#/products">Products</a><a href="#/categories">Categories</a><a href="#/brands">Manufacturers</a><a href="#/gallery">Gallery</a><a href="#/deliveries">Customer Deliveries</a></div><div><h3>Business</h3><a href="#/register">Create business account</a><a href="#/wholesale">Wholesale buying</a><a href="#/quote">Request a quote</a><a href="#/orders">Track an order</a><a href="#/admin">Admin workspace</a></div><div><h3>Contact</h3><p class="muted">WhatsApp number is configured through the server environment.</p><a href="#/contact">Contact support</a><a href="#/about">About Cosmic Life Force</a></div></div><div class="shell footer-bottom"><span>Cosmic Life Force. Catalog data supplied by the business.</span><span>Prices, stock, GST and images are admin-configured.</span></div></footer>`;
}

function renderShell() {
  const currentHash = location.hash;
  const previousHash = window.__clfRenderedHash;
  const preserveScroll = previousHash !== undefined && previousHash === currentHash;
  const scrollY = window.scrollY;
  app.innerHTML = `${renderHeader()}<main id="main-content"></main>${renderFooter()}`;
  renderRoute({ preserveScroll, scrollY });
  window.__clfRenderedHash = currentHash;
}

function renderFeatureGrid() {
  return `<div class="feature-grid">${features.map(([title, description], index) => `<article class="feature-card"><span class="feature-number">0${index + 1}</span><div><h3>${esc(title)}</h3><p>${esc(description)}</p></div></article>`).join('')}</div>`;
}

function renderCategoryGrid(limit = categories.length) {
  return `<div class="category-grid">${categories.slice(0, limit).map((category) => { const count = categoryProducts(category.name).length; const imageUrl = categoryImageUrl(category); return `<a class="category-card" href="#/products?category=${encodeURIComponent(category.name)}"><span class="category-art ${imageUrl ? 'has-image' : 'category-art-fallback'}">${imageUrl ? `<img src="${esc(imageUrl)}" alt="${esc(category.name)}" loading="lazy" decoding="async" /><b>${esc(category.name)}</b>` : `<b>${esc(category.icon)}</b><em>${esc(category.name)}</em>`}<small>${formatNumber(count)} lines</small></span><div><h3>${esc(category.name)}</h3><p>${esc(category.description)}</p></div><span class="category-arrow">↗</span></a>`; }).join('')}</div>`;
}

function renderQuickCategories() {
  const items = categories.map((category) => { const count = categoryProducts(category.name).length; const imageUrl = categoryImageUrl(category); const name = category.name === 'Healthcare & Hard Products' ? 'Healthcare Products' : category.name; const visualUrl = imageUrl || suppliedReferenceAsset; return `<a class="quick-category-card" href="#/products?category=${encodeURIComponent(category.name)}"><span class="quick-category-photo ${imageUrl ? 'has-image' : 'reference-image'}"><img src="${esc(visualUrl)}" alt="" aria-hidden="true" loading="lazy" decoding="async" /><b>${esc(category.icon)}</b></span><strong>${esc(name)}</strong><small>${formatNumber(count)} lines</small></a>`; }).join('');
  return `<section class="quick-category-section"><div class="shell"><div class="section-heading compact-heading"><div><p class="eyebrow">Start with a product family</p><h2>Quick category navigation</h2></div><a class="text-link" href="#/categories">All categories <span>↗</span></a></div><div class="quick-category-viewport"><div class="quick-category-track">${items}${items.replaceAll('loading="lazy"', 'loading="eager"').replaceAll('aria-label=', 'aria-hidden=')}</div></div></div></section>`;
}

function renderProductCard(product, compact = false) {
  const modeLabel = product.purchaseMode === 'direct' ? 'Direct purchase' : product.purchaseMode === 'enquiry' ? 'Enquiry only' : 'Quote enabled';
  const meta = [product.packSize ? `<span>Pack <b>${esc(product.packSize)}</b></span>` : '', product.moq ? `<span>MOQ <b>${esc(product.moq)}</b></span>` : '', product.sku ? `<span>SKU <b>${esc(product.sku)}</b></span>` : ''].filter(Boolean).join('');
  const wholesale = product.wholesalePrice !== null && product.wholesalePrice !== undefined && product.wholesalePrice !== '' ? `<small>Wholesale ${formatCurrency(product.wholesalePrice)}</small>` : '';
  const stock = product.stockStatus && product.stockStatus !== 'not-configured' ? `<span class="stock-status stock-${esc(product.stockStatus)}">${product.stockStatus === 'in-stock' ? 'In stock' : 'Out of stock'}</span>` : '';
  const direct = product.purchaseMode === 'direct' && product.price !== null && product.price !== undefined && product.price !== '' && product.stockStatus !== 'out-of-stock';
  return `<article class="product-card ${compact ? 'compact' : ''}"><button class="product-art-button" data-action="open-product" data-id="${esc(product.id)}" aria-label="View ${esc(product.name)}">${productArt(product, compact)}</button><div class="product-card-body"><div class="product-card-top"><span class="tag">${esc(product.category)}</span><span class="mode-dot">${esc(modeLabel)}</span></div><button class="product-name" data-action="open-product" data-id="${esc(product.id)}">${esc(product.name)}</button><p class="manufacturer">${esc(product.manufacturer)}</p><p class="product-description">${product.description ? esc(product.description) : 'Catalog entry imported from the supplied source list. Product details can be completed by an administrator.'}</p>${meta ? `<div class="product-meta">${meta}</div>` : ''}<div class="product-card-footer"><div><strong>${priceLabel(product)}</strong>${wholesale}</div>${stock}</div><div class="card-actions"><button class="button button-primary button-small" data-action="add-cart" data-id="${esc(product.id)}">Add to cart</button><button class="button button-ghost button-small" data-action="open-product" data-id="${esc(product.id)}">View details</button><button class="button button-ghost button-small" data-action="add-quote" data-id="${esc(product.id)}">Request quote</button>${direct ? `<button class="button button-dark button-small" data-action="buy-now" data-id="${esc(product.id)}">Buy now</button>` : ''}</div></div></article>`;
}

function renderProductStrip(products, title, description, link = '#/products', limit = 8) {
  const cards = products.slice(0, limit).map((product) => renderProductCard(product, true)).join('');
  return `<section class="section-band"><div class="shell"><div class="section-heading"><div><p class="eyebrow">Catalog selection</p><h2>${esc(title)}</h2><p>${esc(description)}</p></div><a class="text-link" href="${link}">View all <span>↗</span></a></div>${cards ? `<div class="product-grid product-grid-strip">${cards}</div>` : `<div class="empty-state compact-empty"><h3>No configured products in this section yet</h3><p>Products from the source catalog will appear here once they are assigned to this category.</p></div>`}</div></section>`;
}

function renderManufacturerSection() {
  const manufacturers = manufacturerDirectory(10);
  return `<section class="shell manufacturer-section"><div class="section-heading"><div><p class="eyebrow">Source catalog discovery</p><h2>Shop by manufacturer</h2><p>Browse manufacturers already present in the active Cosmic Life Force catalog.</p></div><a class="text-link" href="#/brands">View all manufacturers <span>↗</span></a></div><div class="manufacturer-grid">${manufacturers.map(({ name, count }) => `<a class="manufacturer-card" href="#/brands/${encodeURIComponent(name)}"><span class="manufacturer-initial">${esc(name.slice(0, 2).toUpperCase())}</span><strong>${esc(name)}</strong><small>${formatNumber(count)} catalog lines <span>↗</span></small></a>`).join('')}</div></section>`;
}

function renderHomeVisualLinks() {
  const galleryImages = Object.entries(imageManifest.products || {}).flatMap(([productId, record]) => (record.images || [])
    .filter(isPublishableImage)
    .map((image) => ({ ...image, productId })));
  const localImages = state.gallery.filter((item) => item.active !== false && isPublishableImage(item));
  const galleryPreview = [...localImages, ...galleryImages].slice(0, 3);
  const approvedDeliveries = state.deliveries.filter((delivery) => delivery.status === 'approved');
  return `<section class="shell home-discovery-grid"><a class="home-discovery-card" href="#/gallery"><div class="home-discovery-art ${galleryPreview.length ? 'has-images' : ''}">${galleryPreview.length ? galleryPreview.map((image) => `<img src="${esc(imageRecordUrl(image))}" alt="Approved product gallery image" loading="lazy" decoding="async" />`).join('') : placeholderArt('Gallery images pending', true)}</div><div class="home-discovery-copy"><p class="eyebrow">Product gallery</p><h2>See verified product imagery</h2><p>${galleryPreview.length ? `${galleryPreview.length} approved image${galleryPreview.length === 1 ? '' : 's'} ready to explore.` : 'Product-linked gallery images appear after an administrator verifies them.'}</p><span class="text-link">Open gallery <span>↗</span></span></div></a><a class="home-discovery-card" href="#/deliveries"><div class="home-discovery-art ${approvedDeliveries.length ? 'has-images' : ''}">${approvedDeliveries.length ? approvedDeliveries.slice(0, 3).map((delivery) => `<img src="${esc(delivery.photos?.[0] || '')}" alt="Approved customer delivery" loading="lazy" decoding="async" />`).join('') : placeholderArt('Delivery stories pending', true)}</div><div class="home-discovery-copy"><p class="eyebrow">Customer deliveries</p><h2>Purchase stories with approval</h2><p>${approvedDeliveries.length ? `${approvedDeliveries.length} approved customer stor${approvedDeliveries.length === 1 ? 'y' : 'ies'} available.` : 'Customer uploads remain private until an administrator approves them.'}</p><span class="text-link">View deliveries <span>↗</span></span></div></a></section>`;
}

function renderHome() {
  const products = customerProducts();
  const featured = products.slice(0, 8);
  const medicines = products.filter((product) => product.category === 'Medicines').slice(0, 8);
  const orthopedic = products.filter((product) => product.category === 'Orthopedic').slice(0, 8);
  const surgical = products.filter((product) => product.category === 'Surgical Supplies').slice(0, 8);
  const healthcareDevices = products.filter((product) => ['Medical Devices', 'Diagnostic Products', 'Hospital Equipment', 'Healthcare & Hard Products'].includes(product.category)).slice(0, 8);
  return `<div class="home-page">${renderQuickCategories()}<section class="shell section-padding"><div class="section-heading"><div><p class="eyebrow">Browse by need</p><h2>Shop by category</h2><p>Find the right product family, then filter by manufacturer or source category.</p></div><a class="text-link" href="#/categories">See all categories <span>↗</span></a></div>${renderCategoryGrid(10)}</section>${renderProductStrip(featured, 'Featured products', 'Real products from the active source catalog, with pricing and availability shown only when configured.', '#/products', 8)}${renderProductStrip(medicines, 'Medicines', 'Browse medicine lines from the source catalog. Product fields remain admin-configurable.', '#/products?category=Medicines', 8)}<section class="shell orthopedic-feature"><div class="orthopedic-panel"><div><p class="eyebrow eyebrow-light">Major category</p><h2>Orthopedic care for professional buyers</h2><p>The catalog includes knee caps, lumbar belts, braces, tapes, mobility products and more. Every sourced line remains traceable to its PDF page.</p><a class="button button-light" href="#/products?category=Orthopedic">View all Orthopedic products <span>↗</span></a></div><div class="orthopedic-stats"><div><strong>${formatNumber(orthopedic.length)}</strong><span>source lines classified</span></div><div><strong>${formatNumber(new Set(orthopedic.map((product) => product.subcategory)).size)}</strong><span>source subcategories</span></div><div><strong>0</strong><span>invented images</span></div></div></div></section>${renderProductStrip(orthopedic, 'Orthopedic products', 'Supports, braces, belts and tapes linked to the actual Orthopedic catalog.', '#/products?category=Orthopedic', 8)}${renderProductStrip(surgical, 'Surgical & medical supplies', 'Procedure and clinical supply lines from the source catalog.', '#/products?category=Surgical%20Supplies', 8)}${renderProductStrip(healthcareDevices, 'Healthcare devices', 'Devices, diagnostics, hospital equipment and healthcare products that exist in the catalog.', '#/products', 8)}${renderManufacturerSection()}<section class="shell wholesale-banner"><div><p class="eyebrow eyebrow-light">For healthcare businesses</p><h2>Wholesale prices for medical businesses</h2><p>Support pharmacies, hospitals, clinics, medical stores, distributors and healthcare teams with a quote-ready supply workflow.</p><div class="wholesale-points"><span>Bulk orders</span><span>GST invoices</span><span>Dedicated support</span><span>Fast delivery tracking</span></div></div><a class="button button-light" href="#/wholesale">Explore wholesale buying <span>↗</span></a></section>${renderHomeVisualLinks()}<section class="shell quote-banner"><div><p class="eyebrow">Need a multi-line order?</p><h2>Build a quote around your business requirement.</h2><p>Select products and quantities, add context, and send the request to your admin workspace.</p></div><a class="button button-dark" href="#/quote">Build a wholesale quote <span>↗</span></a></section><section class="shell home-close"><div><p class="eyebrow">A clear operating layer</p><h2>From first enquiry to delivered order.</h2><p>Business registration, order tracking and delivery photo review are part of the same experience. The customer-facing catalog only shows what is actually present or configured.</p></div><div class="close-links"><a href="#/register"><span>01</span><b>Create a business profile</b><i>↗</i></a><a href="#/orders"><span>02</span><b>Track your order</b><i>↗</i></a><a href="#/deliveries"><span>03</span><b>See approved deliveries</b><i>↗</i></a></div></section></div>`;
}

function renderFilters(params) {
  const selectedCategory = params.get('category') || '';
  const selectedManufacturer = params.get('manufacturer') || '';
  const selectedSubcategory = params.get('subcategory') || '';
  const selectedSort = params.get('sort') || 'source';
  const manufacturers = [...new Set(customerProducts().map((product) => product.manufacturer))].sort();
  const subcategories = selectedCategory === 'Orthopedic' ? orthopedicSubcategories.slice(1) : [...new Set(customerProducts().filter((p) => !selectedCategory || p.category === selectedCategory).map((p) => p.subcategory))].sort();
  const option = (value, label, selected) => `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(label)}</option>`;
  return `<form class="filters-panel" data-form="filters"><div class="filters-heading"><span>Refine catalog</span><button type="button" class="filter-reset" data-action="reset-filters">Reset</button></div><label>Category<select name="category" data-filter-change>${option('', 'All categories', selectedCategory)}${categories.map((category) => option(category.name, category.name, selectedCategory)).join('')}</select></label><label>Subcategory<select name="subcategory" data-filter-change>${option('', 'All subcategories', selectedSubcategory)}${subcategories.map((subcategory) => option(subcategory, subcategory, selectedSubcategory)).join('')}</select></label><label>Manufacturer<select name="manufacturer" data-filter-change>${option('', 'All manufacturers', selectedManufacturer)}${manufacturers.map((manufacturer) => option(manufacturer, manufacturer, selectedManufacturer)).join('')}</select></label><label>Availability<select name="availability" data-filter-change>${option(params.get('availability') || '', 'Any availability', params.get('availability') || '')}${option('in-stock', 'In stock', params.get('availability') || '')}${option('not-configured', 'Not configured', params.get('availability') || '')}</select></label><div class="filter-note"><span class="info-mark">i</span><p>Prices, GST, stock, MOQ and specifications are blank when the PDF did not supply them.</p></div></form><div class="sort-control"><span>${formatNumber(customerProducts().length)} catalog entries</span><label>Sort<select name="sort" data-filter-change>${option('source', 'Source order', selectedSort)}${option('name', 'Name A-Z', selectedSort)}${option('manufacturer', 'Manufacturer A-Z', selectedSort)}${option('category', 'Category', selectedSort)}${option('price-low', 'Price low to high', selectedSort)}</select></label></div>`;
}

function renderProducts() {
  const { query: params } = pathInfo();
  const query = (params.get('query') || '').trim().toLowerCase();
  const category = params.get('category') || '';
  let products = customerProducts().filter((product) => {
    const matchesQuery = !query || `${product.name} ${product.manufacturer} ${product.category} ${product.subcategory} ${product.sku || ''}`.toLowerCase().includes(query);
    const matchesCategory = !category || product.category === category;
    const matchesManufacturer = !params.get('manufacturer') || product.manufacturer === params.get('manufacturer');
    const matchesSubcategory = !params.get('subcategory') || product.subcategory === params.get('subcategory');
    const matchesAvailability = !params.get('availability') || product.stockStatus === params.get('availability');
    return matchesQuery && matchesCategory && matchesManufacturer && matchesSubcategory && matchesAvailability;
  });
  const sort = params.get('sort') || 'source';
  products = [...products].sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'manufacturer' ? a.manufacturer.localeCompare(b.manufacturer) : sort === 'category' ? a.category.localeCompare(b.category) : sort === 'price-low' ? (a.price || Number.MAX_SAFE_INTEGER) - (b.price || Number.MAX_SAFE_INTEGER) : 0);
  const heading = category || 'All products';
  const description = category === 'Orthopedic' ? 'Complete orthopedic lines detected in the uploaded PDF, including support products, braces, belts, tapes and mobility items.' : 'Search the source catalog by product, manufacturer, category or subcategory. Customer-facing exact duplicates have been removed.';
  return `<div class="shell products-page">${pageTitle('Product catalog', heading, description)}<div class="catalog-toolbar"><div class="active-filters">${query ? `<span class="filter-chip">Search: ${esc(query)} <button data-action="clear-query">×</button></span>` : ''}${category ? `<span class="filter-chip">${esc(category)} <button data-action="clear-category">×</button></span>` : ''}</div><button class="button button-primary button-small" data-action="add-all-visible-quote" data-count="${products.length}">Request quote for view</button></div><div class="catalog-layout"><aside>${renderFilters(params)}</aside><section class="catalog-results"><div class="results-heading"><p>${products.length ? `Showing ${formatNumber(products.length)} matching entries` : 'No matching entries'}</p><span>Source rows: ${formatNumber(catalogMeta.sourceRows)} | duplicates removed: ${formatNumber(catalogMeta.duplicatesRemoved)}</span></div>${products.length ? `<div class="product-grid">${products.map((product) => renderProductCard(product)).join('')}</div>` : `<div class="empty-state large-empty"><div class="empty-icon">⌕</div><h2>No products match those filters</h2><p>Try another manufacturer, category or search phrase.</p><button class="button button-dark" data-action="reset-filters">Clear filters</button></div>`}</section></div></div>`;
}

function renderCategories() {
  const counts = Object.fromEntries(categories.map((category) => [category.name, customerProducts().filter((product) => product.category === category.name).length]));
  return `<div class="shell section-padding categories-page">${pageTitle('Catalog map', 'Categories for professional sourcing', 'The initial taxonomy is generated from the product names and manufacturer divisions in the supplied PDF. Administrators can reassign records as the catalog is enriched.')}${renderCategoryGrid()}<section class="category-insight"><div><p class="eyebrow">Orthopedic focus</p><h2>${formatNumber(counts.Orthopedic || 0)} sourced orthopedic lines</h2><p>Orthopedic is a first-class category with support-specific filters so teams can move from broad product family to a focused quote.</p><a class="text-link" href="#/products?category=Orthopedic">Open Orthopedic catalog <span>↗</span></a></div><div class="category-mini-list">${orthopedicSubcategories.slice(1, 7).map((name) => `<a href="#/products?category=Orthopedic&subcategory=${encodeURIComponent(name)}"><span>${esc(name)}</span><b>↗</b></a>`).join('')}</div></section></div>`;
}

function renderWholesale() {
  return `<div class="shell content-page wholesale-page">${pageTitle('For professional buyers', 'Wholesale buying, made clearer', 'A quote-ready workflow for pharmacies, hospitals, clinics, medical stores, distributors and healthcare teams.')}${renderFeatureGrid()}<section class="wholesale-detail-grid"><div class="wholesale-detail-copy"><p class="eyebrow">One catalog, two buying modes</p><h2>Source products first. Confirm commercial details with your team.</h2><p>Browse the source-led catalog, add multiple lines to a quote, and include the quantities, GST needs and delivery context that matter to your business.</p><div class="wholesale-points"><span>Bulk order requests</span><span>MOQ-aware buying</span><span>GST-ready profiles</span><span>Order tracking</span></div></div><div class="wholesale-detail-actions"><a class="button button-dark" href="#/quote">Request wholesale quote <span>↗</span></a><a class="button button-ghost" href="#/register">Create business account <span>↗</span></a><a class="text-link" href="#/products">Browse the full catalog <span>↗</span></a></div></section><section class="section-band wholesale-catalog-preview"><div class="section-heading"><div><p class="eyebrow">Catalog selection</p><h2>Start with high-volume categories</h2></div></div>${renderCategoryGrid(5)}</section></div>`;
}

function renderOrders() {
  const orders = state.orders.slice().reverse();
  return `<div class="shell content-page orders-page">${pageTitle('Order desk', 'Orders and delivery tracking', 'Review order status separately from payment status. Delivered orders unlock the customer photo workflow.')}${orders.length ? `<div class="orders-list">${orders.map((order) => renderOrderRow(order)).join('')}</div>` : `<div class="empty-state large-empty"><div class="empty-icon">ORD</div><h2>No orders yet</h2><p>Orders created through checkout will appear here with their current delivery stage.</p><div class="empty-actions"><a class="button button-dark" href="#/products">Browse products</a><a class="button button-ghost" href="#/quote">Request a quote</a></div></div>`}</div>`;
}

function renderBrands() {
  const { path } = pathInfo();
  const selected = path.startsWith('/brands/') ? decodeURIComponent(path.slice('/brands/'.length)) : '';
  const products = selected ? customerProducts().filter((product) => product.manufacturer === selected) : [];
  if (selected) return `<div class="shell content-page brand-page">${pageTitle('Manufacturer catalog', selected, `${formatNumber(products.length)} catalog lines from this manufacturer in the active source list.`)}<a class="back-link" href="#/brands">← All manufacturers</a>${products.length ? `<div class="product-grid">${products.map((product) => renderProductCard(product)).join('')}</div>` : `<div class="empty-state large-empty"><h2>No active products for this manufacturer</h2><p>The manufacturer may be present in source data but has no active customer-facing rows.</p></div>`}</div>`;
  const manufacturers = manufacturerDirectory(customerProducts().length);
  return `<div class="shell content-page brands-page">${pageTitle('Source catalog', 'Manufacturers and divisions', 'Browse the manufacturer and division names present in the active Cosmic Life Force catalog.')}${manufacturers.length ? `<div class="manufacturer-directory">${manufacturers.map(({ name, count }) => `<a class="manufacturer-card" href="#/brands/${encodeURIComponent(name)}"><span class="manufacturer-initial">${esc(name.slice(0, 2).toUpperCase())}</span><strong>${esc(name)}</strong><small>${formatNumber(count)} catalog lines <span>↗</span></small></a>`).join('')}</div>` : `<div class="empty-state large-empty"><h2>Manufacturer data is not configured</h2></div>`}</div>`;
}

function renderProductDetail(id) {
  const product = getProduct(id);
  if (!product || product.active === false) return renderNotFound('Product not found', 'That catalog entry is not available in the current workspace.');
  const related = customerProducts().filter((item) => item.category === product.category && item.id !== product.id).slice(0, 4);
  const bulkRows = product.bulkPricing?.length ? product.bulkPricing.map((tier) => `<tr><td>${esc(tier.label || tier.min_quantity || '')}</td><td>${tier.price || tier.wholesale_price ? formatCurrency(tier.price || tier.wholesale_price) : 'Not configured'}</td></tr>`).join('') : '<tr><td colspan="2">Bulk pricing is not configured for this product.</td></tr>';
  const imageUrls = linkedProductImages(product);
  const detailImage = imageUrls[0] ? `<div class="product-art product-art-image"><img src="${esc(imageUrls[0])}" alt="${esc(product.name)}" loading="eager" decoding="async" /></div>` : placeholderArt(product.category === 'Orthopedic' ? 'Orthopedic image pending' : undefined);
  const thumb = (src, label, active = false) => `<button class="detail-thumb ${active ? 'is-active' : ''}" ${src || active ? '' : 'disabled'}>${src ? `<img src="${esc(src)}" alt="${esc(label)}" loading="lazy" decoding="async" />` : placeholderArt(label, true)}</button>`;
  const direct = product.purchaseMode === 'direct' && product.price !== null && product.price !== undefined && product.price !== '' && product.stockStatus !== 'out-of-stock';
  const status = product.stockStatus === 'in-stock' ? 'In stock' : product.stockStatus === 'out-of-stock' ? 'Out of stock' : 'Stock status not configured';
  return `<div class="shell detail-page"><a class="back-link" href="#/products">← Back to catalog</a><div class="detail-grid"><div class="detail-media"><div class="detail-main-art">${detailImage}</div><div class="detail-thumbs">${thumb(imageUrls[0], 'Main image', true)}${thumb(imageUrls[1], 'Image 2')}${thumb(imageUrls[2], 'Image 3')}</div></div><div class="detail-summary"><div class="detail-topline"><span class="tag">${esc(product.category)}</span><span class="source-ref">${product.sourcePage ? `PDF page ${esc(product.sourcePage)}` : 'Catalog record'}</span></div><h1>${esc(product.name)}</h1><p class="detail-manufacturer">Manufacturer / division <strong>${esc(product.manufacturer)}</strong></p><p class="detail-copy">${product.description ? esc(product.description) : 'This is a source catalog entry with editable product fields. Add approved packaging, specifications, pricing and images from the admin workspace before publishing a full product record.'}</p><div class="detail-status-row"><span class="availability-mark"></span><span>${status}</span><span class="divider-dot"></span><span>${product.purchaseMode === 'direct' ? 'Direct purchase' : product.purchaseMode === 'enquiry' ? 'Enquiry only' : 'Quote enabled'}</span></div><div class="detail-facts"><div><span>Pack size</span><strong>${displayValue(product.packSize)}</strong></div><div><span>MOQ</span><strong>${displayValue(product.moq)}</strong></div><div><span>GST</span><strong>${displayValue(product.gst, 'Not configured')}</strong></div><div><span>SKU / code</span><strong>${displayValue(product.sku, 'Not configured')}</strong></div></div><div class="detail-purchase"><div><span class="detail-price">${priceLabel(product)}</span><small>${product.wholesalePrice !== null && product.wholesalePrice !== undefined && product.wholesalePrice !== '' ? `Wholesale ${formatCurrency(product.wholesalePrice)}` : 'Wholesale price not configured'}</small></div><div class="detail-controls"><label class="variant-control">Variant<select disabled><option>Not configured</option></select></label><label class="quantity-control">Qty <input type="number" min="1" value="1" data-detail-qty /></label></div></div><div class="detail-actions"><button class="button button-primary" data-action="add-detail-cart" data-id="${esc(product.id)}">Add to cart</button>${direct ? `<button class="button button-dark" data-action="buy-now" data-id="${esc(product.id)}">Buy now</button>` : ''}<button class="button button-ghost" data-action="add-detail-quote" data-id="${esc(product.id)}">Request bulk quote</button><button class="button button-whatsapp" data-action="whatsapp-product" data-id="${esc(product.id)}">WhatsApp enquiry</button></div><p class="admin-note"><span class="info-mark">i</span> Product prices, variants and purchase mode are editable from the admin workspace. This source row does not include a verified price or image.</p></div></div><section class="detail-tabs"><div class="detail-tab-heading"><span class="is-active">Product details</span><span>Specifications</span><span>Packaging</span><span>Bulk pricing</span></div><div class="detail-tab-content"><div><h2>Source catalog record</h2><p>The storefront preserves the manufacturer, product name and source page from the uploaded PDF. Fields absent from that file remain intentionally blank.</p></div><table class="pricing-table"><thead><tr><th>Quantity tier</th><th>Wholesale price</th></tr></thead><tbody>${bulkRows}</tbody></table></div></section>${related.length ? `<section class="related-products"><div class="section-heading"><div><p class="eyebrow">Keep browsing</p><h2>Related ${esc(product.category)} entries</h2></div></div><div class="product-grid">${related.map((item) => renderProductCard(item, true)).join('')}</div></section>` : ''}</div>`;
}

function renderGallery() {
  const categoryFilter = pathInfo().query.get('category') || 'All';
  const galleryCategories = ['All', 'Medicines', 'Surgical', 'Orthopedic', 'Diagnostics', 'PPE', 'Medical Devices'];
  const categoryMap = { Surgical: 'Surgical Supplies', Diagnostics: 'Diagnostic Products' };
  const manifestGallery = Object.entries(imageManifest.products || {}).flatMap(([productId, record]) => (record.images || [])
    .filter(isPublishableImage)
    .map((image, index) => ({ ...image, id: `manifest-${productId}-${index}`, productId, active: true })));
  const activeGallery = [...state.gallery, ...manifestGallery].filter((item) => {
    if (item.active === false) return false;
    if (!isPublishableImage(item) || item.imageStatus === 'pending_review' || item.imageStatus === 'rejected') return false;
    if (categoryFilter === 'All') return true;
    const product = getProduct(item.productId);
    return product?.category === (categoryMap[categoryFilter] || categoryFilter);
  });
  const galleryTabs = `<div class="gallery-filter-row">${galleryCategories.map((category) => `<a class="${categoryFilter === category ? 'active' : ''}" href="#/gallery${category === 'All' ? '' : `?category=${encodeURIComponent(category)}`} ">${esc(category)}</a>`).join('')}</div>`;
  return `<div class="shell gallery-page">${pageTitle('Product gallery', 'A product-linked visual library', 'Only approved product images appear publicly. Automatically discovered candidates stay private until an administrator verifies the match.')}${galleryTabs}${activeGallery.length ? `<div class="gallery-grid">${activeGallery.map((item) => { const product = getProduct(item.productId); const image = imageRecordUrl(item); return product ? `<article class="gallery-card"><div class="gallery-image">${image ? `<img src="${esc(image)}" alt="${esc(product.name)}" loading="lazy" decoding="async" />` : placeholderArt()}</div><div class="gallery-card-body"><span class="tag">${esc(product.category)}</span><h3>${esc(product.name)}</h3><p>${esc(product.manufacturer)}</p><a class="text-link" href="#/product/${product.id}">View product <span>↗</span></a></div></article>` : ''; }).join('')}</div>` : `<div class="empty-state large-empty gallery-empty"><div class="empty-icon">IMG</div><h2>No verified product images yet</h2><p>Automatic discovery can find candidates when an image provider is configured. Candidates remain private until an admin verifies the product match.</p><a class="button button-dark" href="#/admin?tab=gallery">Open gallery management</a></div>`}<section class="gallery-rule"><div><p class="eyebrow">Traceable imagery</p><h2>Every image has a product relationship.</h2></div><p>A gallery item stores a linked product ID, an activation state, source details and verification state. That relationship is used by the customer-facing page.</p></section></div>`;
}

function renderDeliveries() {
  const approved = state.deliveries.filter((delivery) => delivery.status === 'approved');
  return `<div class="shell deliveries-page">${pageTitle('Customer deliveries', 'Real deliveries, shared with approval', 'Only delivery submissions reviewed and approved by an administrator appear publicly.')}${approved.length ? `<div class="delivery-grid">${approved.map((delivery) => `<article class="delivery-card"><div class="delivery-image">${delivery.photos?.[0] ? `<img src="${delivery.photos[0]}" alt="Approved delivery submission" />` : placeholderArt('Photo unavailable')}</div><div class="delivery-body"><div class="delivery-card-top"><span class="tag">Approved</span><span>${esc(delivery.date || 'Date not configured')}</span></div><h3>${esc(delivery.businessName || 'Business name not provided')}</h3><p>${esc(delivery.productName || 'Product not specified')}</p><div class="stars">${'★'.repeat(Number(delivery.rating || 0))}${'☆'.repeat(5 - Number(delivery.rating || 0))}</div><blockquote>${esc(delivery.comment || 'No written comment provided.')}</blockquote></div></article>`).join('')}</div>` : `<div class="empty-state large-empty"><div class="empty-icon">OK</div><h2>Approved delivery stories will appear here</h2><p>Customer uploads stay private while pending. Once an admin approves a submission, it becomes visible on this page.</p><a class="button button-dark" href="#/account">Go to customer account</a></div>`}<section class="delivery-trust"><div><p class="eyebrow">Privacy by workflow</p><h2>Pending is private by default.</h2></div><p>Customers can submit multiple JPG, JPEG or PNG photos after delivery, with a rating and comment. Admin review controls the public state.</p></section></div>`;
}

function renderQuote() {
  const lines = state.quoteLines.map((line) => ({ line, product: getProduct(line.productId) })).filter((item) => item.product);
  return `<div class="shell form-page quote-page">${pageTitle('Wholesale workflow', 'Request a wholesale quote', 'Select source-catalog products and give the admin team enough context to respond with verified pricing.')}${lines.length ? `<div class="quote-layout"><section class="form-card"><div class="form-card-heading"><div><p class="eyebrow">Selected products</p><h2>Your quote lines</h2></div><a class="text-link" href="#/products">Add products <span>↗</span></a></div><div class="quote-lines">${lines.map(({ line, product }, index) => `<div class="quote-line"><div class="quote-line-info"><span class="quote-line-index">${String(index + 1).padStart(2, '0')}</span><div><strong>${esc(product.name)}</strong><small>${esc(product.manufacturer)} · ${esc(product.category)}</small></div></div><label>Qty<input type="number" min="1" value="${line.quantity}" data-quote-qty data-id="${product.id}" /></label><button class="remove-link" data-action="remove-quote" data-id="${product.id}">Remove</button></div>`).join('')}</div></section><form class="form-card" data-form="quote-submit"><div class="form-card-heading"><div><p class="eyebrow">Request details</p><h2>Send to admin review</h2></div></div><div class="form-grid"><label>Business name<input name="businessName" required value="${esc(state.profile?.businessName || '')}" placeholder="Your business name" /></label><label>Contact email<input name="email" type="email" required value="${esc(state.profile?.email || '')}" placeholder="name@business.com" /></label><label>Mobile number<input name="phone" required value="${esc(state.profile?.phone || '')}" placeholder="Business contact number" /></label><label>Customer type<select name="customerType"><option>Pharmacy</option><option>Hospital</option><option>Clinic</option><option>Medical Store</option><option>Distributor</option><option>Other</option></select></label><label class="full-span">Additional message<textarea name="message" rows="5" placeholder="Delivery location, timing, compliance requirements or anything else the quote team should know."></textarea></label></div><button class="button button-dark" type="submit">Submit quote request <span>↗</span></button><p class="form-footnote">No pricing is calculated until an administrator configures and reviews the product records.</p></form></div>` : `<div class="empty-state large-empty"><div class="empty-icon">RFQ</div><h2>Your quote is empty</h2><p>Browse the catalog and add products to a quote. Product quantities can be adjusted before submission.</p><a class="button button-dark" href="#/products">Browse the catalog</a></div>`}</div>`;
}

function renderCart() {
  const lines = cartProductLines();
  return `<div class="shell cart-page">${pageTitle('Your cart', 'A quote-ready cart for your supply desk', 'Cart lines preserve quantity and catalog references. Prices, GST and shipping are calculated only after admin configuration.')}${lines.length ? `<div class="cart-layout"><section class="cart-lines">${lines.map(({ line, product }) => `<article class="cart-line"><div class="cart-line-art">${placeholderArt('Image pending', true)}</div><div class="cart-line-info"><span class="tag">${esc(product.category)}</span><h2>${esc(product.name)}</h2><p>${esc(product.manufacturer)}</p><span class="source-ref">PDF page ${product.sourcePage}</span></div><div class="cart-quantity"><button data-action="cart-dec" data-id="${product.id}" aria-label="Decrease quantity">-</button><span>${line.quantity}</span><button data-action="cart-inc" data-id="${product.id}" aria-label="Increase quantity">+</button></div><div class="cart-line-price"><strong>${priceLabel(product)}</strong><button class="remove-link" data-action="remove-cart" data-id="${product.id}">Remove</button></div></article>`).join('')}</section><aside class="summary-card"><div class="summary-heading"><p class="eyebrow">Order summary</p><h2>Ready for checkout</h2></div><div class="summary-row"><span>Items</span><strong>${cartCount()}</strong></div><div class="summary-row"><span>Subtotal</span><strong>On request</strong></div><div class="summary-row"><span>GST</span><strong>Configured at checkout</strong></div><div class="summary-row"><span>Shipping</span><strong>Configured at checkout</strong></div><div class="summary-total"><span>Total</span><strong>Quote pricing</strong></div><a class="button button-dark full-button" href="#/checkout">Proceed to checkout <span>↗</span></a><a class="text-link centered-link" href="#/products">Continue shopping <span>↗</span></a></aside></div>` : `<div class="empty-state large-empty"><div class="empty-icon">CART</div><h2>Your cart is ready when you are</h2><p>Add catalog products to begin a purchase or quote conversation.</p><a class="button button-dark" href="#/products">Browse products</a></div>`}</div>`;
}

function renderCheckout() {
  const lines = cartProductLines();
  if (!lines.length) return `<div class="shell form-page">${pageTitle('Checkout', 'Nothing to check out yet', 'Add products to your cart before starting the checkout workflow.')}<div class="empty-state large-empty"><a class="button button-dark" href="#/products">Browse products</a></div></div>`;
  const payment = runtime.razorpayEnabled ? 'Razorpay (TEST mode)' : runtime.paymentProvider ? `Online payment (${esc(runtime.paymentProvider)} configured)` : 'Payment link requested after admin review';
  const checkoutButton = runtime.razorpayEnabled ? 'Continue to Razorpay checkout' : 'Place order request';
  const checkoutNote = runtime.razorpayEnabled ? 'Razorpay TEST mode calculates the final INR amount on the server. Your order is saved only after signature verification.' : 'This preview stores an order request locally. Production payment, authentication and order APIs are wired through the setup contract in README.';
  return `<div class="shell form-page checkout-page">${pageTitle('Checkout', 'Confirm your business order', 'Complete the business and delivery details. A payment provider is only shown when configured by the server environment.')}${state.profile?.businessName ? `<div class="saved-profile"><span class="status-pulse"></span>Using saved business profile: <strong>${esc(state.profile.businessName)}</strong><a class="text-link" href="#/account">Edit profile</a></div>` : ''}<div class="checkout-layout"><form class="form-card" data-form="checkout"><div class="form-card-heading"><div><p class="eyebrow">Business details</p><h2>Where should we send the order?</h2></div></div><div class="form-grid"><label>Business name<input name="businessName" required value="${esc(state.profile?.businessName || '')}" placeholder="Registered business name" /></label><label>Owner / contact name<input name="ownerName" required value="${esc(state.profile?.ownerName || '')}" placeholder="Primary contact" /></label><label>Email<input name="email" type="email" required value="${esc(state.profile?.email || '')}" placeholder="name@business.com" /></label><label>Mobile number<input name="phone" required value="${esc(state.profile?.phone || '')}" placeholder="Business contact number" /></label><label>GST number<input name="gstNumber" value="${esc(state.profile?.gstNumber || '')}" placeholder="Optional until configured" /></label><label>Customer type<select name="customerType"><option>Pharmacy</option><option>Hospital</option><option>Clinic</option><option>Medical Store</option><option>Distributor</option><option>Other</option></select></label><label class="full-span">Shipping address<textarea name="shippingAddress" required rows="4" placeholder="Address for delivery"></textarea></label><label class="full-span">Billing address<textarea name="billingAddress" rows="4" placeholder="Same as shipping, or provide a billing address"></textarea></label><label>Payment method<select name="paymentMethod"><option>${payment}</option>${runtime.razorpayEnabled ? '' : '<option>Bank transfer / proforma invoice</option><option>Cash on delivery, subject to approval</option>'}</select></label></div><button class="button button-dark" type="submit">${checkoutButton} <span>↗</span></button><p class="form-footnote">${checkoutNote}</p></form><aside class="summary-card"><div class="summary-heading"><p class="eyebrow">Order summary</p><h2>${lines.length} catalog lines</h2></div>${lines.map(({ line, product }) => `<div class="checkout-line"><span>${line.quantity} × ${esc(product.name)}</span><strong>${priceLabel(product)}</strong></div>`).join('')}<div class="summary-total"><span>Total</span><strong>${runtime.razorpayEnabled ? 'Calculated securely' : 'Quote pricing'}</strong></div></aside></div></div>`;
}

function renderRegister() {
  const passwordRequired = supabaseReady() ? 'required minlength="8"' : '';
  const authNote = supabaseReady() ? 'Authentication is handled by Supabase Auth for this deployment.' : 'This local preview stores a browser-only session until Supabase Auth is configured.';
  return `<div class="shell form-page narrow-page">${pageTitle('B2B registration', 'Create your business profile', 'Save business details once, then reuse them for quotes, checkout and customer account workflows.')}<form class="form-card" data-form="register"><div class="form-grid"><label>Business name<input name="businessName" required placeholder="Registered business name" /></label><label>Owner name<input name="ownerName" required placeholder="Primary contact" /></label><label>Mobile number<input name="phone" required placeholder="Business contact number" /></label><label>Email<input name="email" type="email" required placeholder="name@business.com" /></label><label>Password<input name="password" type="password" ${passwordRequired} autocomplete="new-password" placeholder="At least 8 characters" /></label><label>Confirm password<input name="passwordConfirm" type="password" ${passwordRequired} autocomplete="new-password" placeholder="Repeat password" /></label><label>GST number<input name="gstNumber" placeholder="Optional until configured" /></label><label>Customer type<select name="customerType"><option>Pharmacy</option><option>Hospital</option><option>Clinic</option><option>Medical Store</option><option>Distributor</option><option>Other</option></select></label><label class="full-span">Business address<textarea name="address" required rows="5" placeholder="Business address"></textarea></label></div><label class="checkbox-line"><input type="checkbox" required /> I confirm this is an authorized business account request.</label><button class="button button-dark" type="submit">Create profile <span>↗</span></button><p class="form-footnote">${authNote}</p></form></div>`;
}

function renderLogin() {
  const authMessage = supabaseReady() ? 'Supabase Auth is enabled for this deployment.' : 'This local preview creates a browser session for workflow testing. No credential is bundled or accepted by default.';
  return `<div class="shell form-page narrow-page">${pageTitle('Customer account', 'Sign in to your business workspace', 'Use your business identity to access orders, quotes and delivery workflows.')}<form class="form-card" data-form="login"><div class="preview-callout"><span class="info-mark">i</span><p>${authMessage}</p></div><div class="form-grid"><label>Email<input name="email" type="email" required autocomplete="email" placeholder="name@business.com" /></label><label>Password<input name="password" type="password" required autocomplete="current-password" placeholder="Your password" /></label></div><button class="button button-dark" type="submit">Continue <span>↗</span></button><p class="form-footnote">Need an account? <a href="#/register">Create a business profile</a></p></form></div>`;
}

function renderAccount() {
  const orders = state.orders;
  const delivered = orders.filter((order) => order.status === 'Delivered').length;
  const pending = orders.filter((order) => order.status !== 'Delivered').length;
  return `<div class="shell account-page">${pageTitle('My account', state.profile ? `Welcome, ${state.profile.ownerName || 'business partner'}` : 'Your business workspace', 'Manage orders, quotes, profile details and delivery photo submissions in one place.')}${state.profile ? `<div class="account-grid"><section class="account-main"><div class="metric-grid"><div><span>Total orders</span><strong>${orders.length}</strong></div><div><span>Pending orders</span><strong>${pending}</strong></div><div><span>Delivered orders</span><strong>${delivered}</strong></div><div><span>Total spending</span><strong>On request</strong></div></div><div class="account-panel"><div class="panel-heading"><div><p class="eyebrow">Recent orders</p><h2>Order tracking</h2></div><a class="text-link" href="#/products">Shop products <span>↗</span></a></div>${orders.length ? orders.slice().reverse().map((order) => renderOrderRow(order)).join('') : `<div class="mini-empty"><p>No orders yet.</p><a class="text-link" href="#/products">Browse catalog <span>↗</span></a></div>`}</div><div class="account-panel"><div class="panel-heading"><div><p class="eyebrow">Delivery stories</p><h2>Share after delivery</h2></div><a class="text-link" href="#/deliveries">Public deliveries <span>↗</span></a></div><p class="muted">A delivery photo is private and pending until an admin reviews it. Use a delivered order below to submit one.</p>${orders.filter((order) => order.status === 'Delivered').map((order) => `<div class="delivery-action-row"><div><strong>${esc(order.id)}</strong><span>${esc(order.items?.[0]?.name || 'Delivered order')}</span></div><button class="button button-ghost button-small" data-action="open-delivery-form" data-id="${order.id}">Upload photo</button></div>`).join('') || '<div class="mini-empty"><p>Delivered orders unlock the upload flow.</p></div>'}</div></section><aside class="account-side"><div class="profile-card"><div class="profile-avatar">${esc((state.profile.businessName || 'B').slice(0, 1).toUpperCase())}</div><span class="tag">${esc(state.profile.customerType || 'Business')}</span><h2>${esc(state.profile.businessName)}</h2><p>${esc(state.profile.email)}</p><p>${esc(state.profile.phone)}</p><a class="text-link" href="#/account?edit=profile">Edit profile <span>↗</span></a></div><nav class="account-nav"><a class="active" href="#/account">Dashboard <span>↗</span></a><a href="#/quote">My quotations <span>↗</span></a><a href="#/cart">Cart <span>${cartCount()}</span></a><a href="#/contact">Support <span>↗</span></a><button data-action="logout">Log out <span>↗</span></button></nav></aside></div>${pathInfo().query.get('edit') === 'profile' ? renderProfileEditor() : ''}${pathInfo().query.get('delivery') ? renderDeliveryForm(pathInfo().query.get('delivery')) : ''}` : `<div class="empty-state large-empty"><div class="empty-icon">B2B</div><h2>Register to unlock your account workspace</h2><p>Save business information, review orders, submit quotes and upload delivery photos after a delivered order.</p><div class="empty-actions"><a class="button button-dark" href="#/register">Create business account</a><a class="button button-ghost" href="#/login">Sign in</a></div></div>`}</div>`;
}

function renderOrderRow(order) {
  const stage = ['Order Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'];
  const current = Math.max(0, stage.indexOf(order.status));
  return `<article class="order-row"><div class="order-row-head"><div><strong>${esc(order.id)}</strong><span>${esc(order.date)}</span></div><span class="order-status">${esc(order.status)}</span></div><div class="tracking-line">${stage.map((item, index) => `<div class="tracking-stage ${index <= current ? 'complete' : ''}"><span>${index < current ? '✓' : index + 1}</span><small>${esc(item)}</small></div>`).join('')}</div><div class="order-row-foot"><span>${order.items?.length || 0} catalog lines</span>${order.status === 'Delivered' ? `<a class="text-link" href="#/account?delivery=${encodeURIComponent(order.id)}">Upload delivery photo <span>↗</span></a>` : '<span class="muted">Delivery photo unlocks after delivery</span>'}</div></article>`;
}

function renderProfileEditor() {
  return `<section class="modal-like"><div class="form-card"><div class="panel-heading"><div><p class="eyebrow">Profile</p><h2>Edit business details</h2></div><a class="text-link" href="#/account">Close <span>×</span></a></div><form data-form="profile"><div class="form-grid"><label>Business name<input name="businessName" required value="${esc(state.profile.businessName)}" /></label><label>Owner name<input name="ownerName" value="${esc(state.profile.ownerName || '')}" /></label><label>Email<input name="email" type="email" required value="${esc(state.profile.email)}" /></label><label>Mobile number<input name="phone" required value="${esc(state.profile.phone)}" /></label><label>GST number<input name="gstNumber" value="${esc(state.profile.gstNumber || '')}" /></label><label>Customer type<select name="customerType"><option ${state.profile.customerType === 'Pharmacy' ? 'selected' : ''}>Pharmacy</option><option ${state.profile.customerType === 'Hospital' ? 'selected' : ''}>Hospital</option><option ${state.profile.customerType === 'Clinic' ? 'selected' : ''}>Clinic</option><option ${state.profile.customerType === 'Medical Store' ? 'selected' : ''}>Medical Store</option><option ${state.profile.customerType === 'Distributor' ? 'selected' : ''}>Distributor</option><option ${state.profile.customerType === 'Other' ? 'selected' : ''}>Other</option></select></label><label class="full-span">Business address<textarea name="address" rows="4">${esc(state.profile.address || '')}</textarea></label></div><button class="button button-dark" type="submit">Save profile</button></form></div></section>`;
}

function renderDeliveryForm(orderId) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return '';
  return `<section class="modal-like"><form class="form-card" data-form="delivery" data-order-id="${esc(orderId)}"><div class="panel-heading"><div><p class="eyebrow">Order delivered</p><h2>Share your delivery experience</h2><p class="muted">Upload a photo of your delivered box or product to help other customers.</p></div><a class="text-link" href="#/account">Close <span>×</span></a></div><label class="upload-drop"><input name="photos" type="file" accept="image/jpeg,image/png" capture="environment" multiple required /><span class="upload-icon">+</span><strong>Take or choose delivery photos</strong><small>JPG, JPEG or PNG. Multiple photos allowed.</small></label><div class="form-grid"><label>Rating<select name="rating"><option value="5">5 stars</option><option value="4">4 stars</option><option value="3">3 stars</option><option value="2">2 stars</option><option value="1">1 star</option></select></label><label class="full-span">Comment / review<textarea name="comment" rows="4" placeholder="Tell other buyers about the delivery."></textarea></label></div><button class="button button-dark" type="submit">Submit for admin approval <span>↗</span></button><p class="form-footnote">Your photos will be marked Pending and remain private until an admin approves them.</p></form></section>`;
}

function renderAbout() {
  return `<div class="shell content-page">${pageTitle('About the business', 'Cosmic Life Force', 'Medicines for Quantum Healing')}<div class="about-grid"><div class="about-copy about-copy-wide"><p class="large-lede">A focused B2B medical supply experience shaped around your real catalog, your professional buyers and the details that must be verified before a product is sold.</p><p>Cosmic Life Force supports pharmacies, hospitals, clinics, medical stores and distributors with a catalog that begins with the manufacturer and product rows supplied in the source PDF.</p><p>Prices, stock, GST, pack sizes, specifications, product images and purchase mode are intentionally admin-editable. That keeps the customer experience useful without making claims the source data does not support.</p><a class="button button-dark" href="#/register">Create a business profile <span>↗</span></a></div></div><section class="principles"><div><span>01</span><h2>Source-led</h2><p>Every initial catalog product points back to a PDF page.</p></div><div><span>02</span><h2>Quote-ready</h2><p>Blank price and stock fields stay clear until the admin team completes them.</p></div><div><span>03</span><h2>Review-first</h2><p>Customer delivery photos are private until explicitly approved.</p></div></section></div>`;
}

function renderContact() {
  const whatsappReady = Boolean(runtime.whatsappNumber);
  return `<div class="shell form-page contact-page">${pageTitle('Contact', 'Talk to the supply team', 'Tell us what your business needs and the right channel can be configured for follow-up.')}<div class="contact-grid"><div class="contact-panel"><p class="eyebrow">Business support</p><h2>One clear conversation is often faster than a long search.</h2><p>Use the quote workflow for product lists and quantities. Use WhatsApp for a quick enquiry once the business number is configured.</p><div class="contact-links"><a href="#/quote"><span>RFQ</span><strong>Request a wholesale quote</strong><b>↗</b></a><button data-action="whatsapp"><span>WA</span><strong>${whatsappReady ? 'Open WhatsApp business chat' : 'Configure WhatsApp business chat'}</strong><b>↗</b></button><a href="#/contact"><span>@</span><strong>Support email via deployment config</strong><b>↗</b></a></div></div><form class="form-card" data-form="contact"><div class="form-card-heading"><div><p class="eyebrow">Send a message</p><h2>How can we help?</h2></div></div><div class="form-grid"><label>Name<input name="name" required placeholder="Your name" /></label><label>Business email<input name="email" type="email" required placeholder="name@business.com" /></label><label>Business name<input name="business" placeholder="Business name" /></label><label>Mobile number<input name="phone" placeholder="Contact number" /></label><label class="full-span">Message<textarea name="message" required rows="6" placeholder="Product names, quantities or a general enquiry"></textarea></label></div><button class="button button-dark" type="submit">Send enquiry <span>↗</span></button></form></div></div>`;
}

function renderAdminLegacy() {
  const { query } = pathInfo();
  if (supabaseReady() && (!supabaseSession || state.session?.role !== 'admin')) {
    return `<div class="shell form-page narrow-page"><div class="empty-state large-empty"><div class="empty-icon">LOCK</div><h1>Admin access required</h1><p>Sign in with an authorized Supabase admin account to open the operations workspace.</p><div class="empty-actions"><a class="button button-dark" href="#/login">Sign in</a><a class="button button-ghost" href="#/">Return home</a></div></div></div>`;
  }
  const tab = query.get('tab') || 'overview';
  const pending = state.deliveries.filter((delivery) => delivery.status === 'pending').length;
  const approved = state.deliveries.filter((delivery) => delivery.status === 'approved').length;
  const rejected = state.deliveries.filter((delivery) => delivery.status === 'rejected').length;
  const activeProducts = getProducts().filter((product) => product.active !== false).length;
  return `<div class="shell admin-page"><div class="admin-heading"><div><p class="eyebrow">Operations workspace</p><h1>Admin dashboard</h1><p>Manage the imported catalog, pricing fields, linked imagery, order requests and delivery approvals.</p></div><span class="admin-badge">RBAC: admin route</span></div><div class="admin-layout"><aside class="admin-nav">${[['overview','Dashboard'],['products','Products'],['categories','Categories'],['orders','Orders'],['customers','Customers'],['gallery','Gallery'],['deliveries','Delivery Photos'],['quotes','Quotations'],['inventory','Inventory'],['reports','Reports'],['settings','Settings']].map(([value, label]) => `<a class="${tab === value ? 'active' : ''}" href="#/admin?tab=${value}">${esc(label)}${value === 'deliveries' && pending ? `<b>${pending}</b>` : '<span>↗</span>'}</a>`).join('')}</aside><section class="admin-content">${tab === 'products' ? renderAdminProducts() : tab === 'deliveries' ? renderAdminDeliveries() : tab === 'gallery' ? renderAdminGallery() : tab === 'quotes' ? renderAdminQuotes() : tab === 'orders' ? renderAdminOrders() : `<div class="admin-stats"><div><span>Active products</span><strong>${formatNumber(activeProducts)}</strong><small>${formatNumber(catalogMeta.customerProducts)} imported, editable</small></div><div><span>Source rows</span><strong>${formatNumber(catalogMeta.sourceRows)}</strong><small>${formatNumber(catalogMeta.duplicatesRemoved)} exact duplicates removed for customers</small></div><div><span>Pending deliveries</span><strong>${pending}</strong><small>Private until approval</small></div><div><span>Approved deliveries</span><strong>${approved}</strong><small>${rejected} rejected submissions</small></div></div><div class="admin-overview-grid"><div class="admin-overview-card"><p class="eyebrow">Catalog health</p><h2>Complete the fields before selling.</h2><p>The imported rows are intentionally blank for price, MOQ, GST, stock, images and specifications. Use Product Management to configure them.</p><a class="button button-dark button-small" href="#/admin?tab=products">Manage products <span>↗</span></a></div><div class="admin-overview-card dark-card"><p class="eyebrow eyebrow-light">Customer trust</p><h2>Delivery photos stay private until approved.</h2><p>Review submissions with the customer, order and product context before publishing them to Customer Deliveries.</p><a class="button button-light button-small" href="#/admin?tab=deliveries">Review submissions <span>↗</span></a></div></div><div class="admin-checklist"><div><p class="eyebrow">Integration status</p><h2>Deployment checklist</h2></div><div class="checklist-grid"><span class="check-item"><i class="status-dot ${runtime.paymentProvider ? 'is-on' : ''}"></i> Payment provider ${runtime.paymentProvider ? 'configured' : 'needs env'}</span><span class="check-item"><i class="status-dot ${runtime.whatsappNumber ? 'is-on' : ''}"></i> WhatsApp ${runtime.whatsappNumber ? 'configured' : 'needs env'}</span><span class="check-item"><i class="status-dot"></i> Database adapter ready in schema</span><span class="check-item"><i class="status-dot"></i> Cloud storage adapter env-ready</span></div></div>`}</section></div></div>`;
}

function renderAdminDirectory(tab) {
  const products = getProducts();
  if (tab === 'categories') {
    return `<div class="admin-section-heading"><div><p class="eyebrow">Catalog structure</p><h2>Categories</h2><p>Review the active source categories and their customer-facing line counts.</p></div></div><div class="admin-summary-grid">${categories.map((category) => `<a class="admin-summary-card" href="#/admin?tab=products&category=${encodeURIComponent(category.name)}"><span class="tag">${esc(category.icon)}</span><strong>${esc(category.name)}</strong><small>${formatNumber(categoryProducts(category.name).length)} active lines</small><span class="text-link">Open products ↗</span></a>`).join('')}</div>`;
  }
  if (tab === 'manufacturers') {
    const manufacturers = manufacturerDirectory(products.length);
    return `<div class="admin-section-heading"><div><p class="eyebrow">Catalog structure</p><h2>Manufacturers</h2><p>Manufacturer and division names are derived from the active source catalog.</p></div></div><div class="admin-summary-grid">${manufacturers.map(({ name, count }) => `<a class="admin-summary-card" href="#/brands/${encodeURIComponent(name)}"><span class="manufacturer-initial">${esc(name.slice(0, 2).toUpperCase())}</span><strong>${esc(name)}</strong><small>${formatNumber(count)} catalog lines</small><span class="text-link">View catalog ↗</span></a>`).join('')}</div>`;
  }
  if (tab === 'customers') {
    return `<div class="admin-section-heading"><div><p class="eyebrow">Customer workspace</p><h2>Customers</h2><p>Customer profiles remain private and are shown here only when a session or Supabase profile is available.</p></div></div>${state.profile ? `<div class="admin-customer-card"><div class="profile-avatar">${esc((state.profile.businessName || 'B').slice(0, 1).toUpperCase())}</div><div><span class="tag">${esc(state.profile.customerType || 'Business')}</span><h3>${esc(state.profile.businessName || 'Business profile')}</h3><p>${esc(state.profile.ownerName || 'Owner not configured')} · ${esc(state.profile.email || 'Email not configured')}</p><small>${esc(state.profile.phone || 'Phone not configured')}</small></div><a class="button button-ghost button-small" href="#/account">Open customer view <span>↗</span></a></div>` : `<div class="empty-state admin-empty"><div class="empty-icon">B2B</div><h2>No customer profiles in this preview</h2><p>Supabase customer records will appear here after the production profile adapter is configured.</p></div>`}`;
  }
  if (tab === 'prescriptions') {
    const prescriptions = state.prescriptionRequests || [];
    return `<div class="admin-section-heading"><div><p class="eyebrow">Clinical workflow</p><h2>Prescription requests</h2><p>Review prescription submissions separately from ordinary catalog requests.</p></div></div>${prescriptions.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Request</th><th>Customer</th><th>Status</th><th>Date</th></tr></thead><tbody>${prescriptions.map((item) => `<tr><td>${esc(item.id || 'Request')}</td><td>${esc(item.email || item.businessName || 'Customer not configured')}</td><td><span class="tag">${esc(item.status || 'Pending')}</span></td><td>${esc(item.date || 'Not configured')}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state admin-empty"><div class="empty-icon">RX</div><h2>No prescription requests</h2><p>Prescription workflow records will appear here when the production submission adapter is connected.</p></div>`}`;
  }
  if (tab === 'payments') {
    const orders = state.orders || [];
    return `<div class="admin-section-heading"><div><p class="eyebrow">Finance</p><h2>Payments</h2><p>Payment status stays separate from delivery status. Razorpay identifiers remain server-side.</p></div></div>${orders.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Order</th><th>Business</th><th>Payment status</th><th>Order status</th><th>Date</th></tr></thead><tbody>${orders.map((order) => `<tr><td>${esc(order.id)}</td><td>${esc(order.businessName || 'Not configured')}</td><td><span class="tag">${esc(order.paymentStatus || 'Not configured')}</span></td><td>${esc(order.status || 'Not configured')}</td><td>${esc(order.date || '')}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state admin-empty"><div class="empty-icon">INR</div><h2>No payment records</h2><p>Verified Razorpay payments will appear here after the server payment adapter is configured.</p></div>`}`;
  }
  if (tab === 'settings') {
    return `<div class="admin-section-heading"><div><p class="eyebrow">System</p><h2>Settings</h2><p>Configuration status is visible here without exposing credentials or service-role keys.</p></div></div><div class="settings-grid"><div class="admin-setting-card"><span class="status-dot ${runtime.paymentProvider ? 'is-on' : ''}"></span><div><strong>Payment provider</strong><small>${runtime.paymentProvider ? 'Configured' : 'Needs environment configuration'}</small></div></div><div class="admin-setting-card"><span class="status-dot ${runtime.whatsappNumber ? 'is-on' : ''}"></span><div><strong>WhatsApp business chat</strong><small>${runtime.whatsappNumber ? 'Configured' : 'Needs environment configuration'}</small></div></div><div class="admin-setting-card"><span class="status-dot"></span><div><strong>Supabase adapter</strong><small>${supabaseReady() ? 'Connected' : 'Ready for environment configuration'}</small></div></div><div class="admin-setting-card"><span class="status-dot"></span><div><strong>Image storage</strong><small>Cloud-storage-ready, admin verified publishing</small></div></div></div>`;
  }
  return renderAdminQuotes();
}

function renderAdminProductsWithSearch() {
  const searchBar = `<div class="admin-filter-bar"><label><span>Search products</span><input type="search" data-admin-product-search placeholder="Name, manufacturer or category" /></label><span class="admin-filter-hint">Search filters the current list without changing the route.</span></div>`;
  return renderAdminProducts().replace('<div class="admin-product-layout">', `${searchBar}<div class="admin-product-layout">`);
}

function renderAdmin() {
  const { query } = pathInfo();
  if (supabaseReady() && (!supabaseSession || state.session?.role !== 'admin')) {
    return `<div class="shell form-page narrow-page"><div class="empty-state large-empty"><div class="empty-icon">LOCK</div><h1>Admin access required</h1><p>Sign in with an authorized Supabase admin account to open the operations workspace.</p><div class="empty-actions"><a class="button button-dark" href="#/login">Sign in</a><a class="button button-ghost" href="#/">Return home</a></div></div></div>`;
  }
  const tab = query.get('tab') || 'overview';
  const pending = state.deliveries.filter((delivery) => delivery.status === 'pending').length;
  const approved = state.deliveries.filter((delivery) => delivery.status === 'approved').length;
  const rejected = state.deliveries.filter((delivery) => delivery.status === 'rejected').length;
  const activeProducts = getProducts().filter((product) => product.active !== false).length;
  const tabTitles = { overview: 'Dashboard', products: 'Products', categories: 'Categories', manufacturers: 'Manufacturers', orders: 'Orders', customers: 'Customers', gallery: 'Gallery', deliveries: 'Delivery Photos', wholesale: 'Wholesale Requests', quotes: 'Wholesale Requests', prescriptions: 'Prescription Requests', payments: 'Payments', settings: 'Settings' };
  const navGroups = [['', [['overview', 'Dashboard']]], ['Catalog', [['products', 'Products'], ['categories', 'Categories'], ['manufacturers', 'Manufacturers']]], ['Orders', [['orders', 'Orders'], ['wholesale', 'Wholesale Requests'], ['prescriptions', 'Prescription Requests']]], ['Customers', [['customers', 'Customers']]], ['Finance', [['payments', 'Payments']]], ['System', [['gallery', 'Gallery'], ['deliveries', 'Delivery Photos'], ['settings', 'Settings']]]];
  const nav = navGroups.map(([group, items]) => `<div class="admin-nav-group">${group ? `<p>${esc(group)}</p>` : ''}${items.map(([value, label]) => `<a class="${tab === value || (value === 'wholesale' && tab === 'quotes') ? 'active' : ''}" href="#/admin?tab=${value}">${esc(label)}${value === 'deliveries' && pending ? `<b>${pending}</b>` : '<span>↗</span>'}</a>`).join('')}</div>`).join('');
  const content = tab === 'products' ? renderAdminProductsWithSearch() : tab === 'deliveries' ? renderAdminDeliveries() : tab === 'gallery' ? renderAdminGallery() : tab === 'quotes' || tab === 'wholesale' ? renderAdminQuotes() : tab === 'orders' ? renderAdminOrders() : ['categories', 'manufacturers', 'customers', 'prescriptions', 'payments', 'settings'].includes(tab) ? renderAdminDirectory(tab) : `<div class="admin-stats"><div><span>Active products</span><strong>${formatNumber(activeProducts)}</strong><small>${formatNumber(catalogMeta.customerProducts)} imported, editable</small></div><div><span>Source rows</span><strong>${formatNumber(catalogMeta.sourceRows)}</strong><small>${formatNumber(catalogMeta.duplicatesRemoved)} exact duplicates removed for customers</small></div><div><span>Pending deliveries</span><strong>${pending}</strong><small>Private until approval</small></div><div><span>Approved deliveries</span><strong>${approved}</strong><small>${rejected} rejected submissions</small></div></div><div class="admin-overview-grid"><div class="admin-overview-card"><p class="eyebrow">Catalog health</p><h2>Complete the fields before selling.</h2><p>The imported rows are intentionally blank for price, MOQ, GST, stock, images and specifications. Use Product Management to configure them.</p><a class="button button-dark button-small" href="#/admin?tab=products">Manage products <span>↗</span></a></div><div class="admin-overview-card dark-card"><p class="eyebrow eyebrow-light">Customer trust</p><h2>Delivery photos stay private until approved.</h2><p>Review submissions with the customer, order and product context before publishing them to Customer Deliveries.</p><a class="button button-light button-small" href="#/admin?tab=deliveries">Review submissions <span>↗</span></a></div></div><div class="admin-checklist"><div><p class="eyebrow">Integration status</p><h2>Deployment checklist</h2></div><div class="checklist-grid"><span class="check-item"><i class="status-dot ${runtime.paymentProvider ? 'is-on' : ''}"></i> Payment provider ${runtime.paymentProvider ? 'configured' : 'needs env'}</span><span class="check-item"><i class="status-dot ${runtime.whatsappNumber ? 'is-on' : ''}"></i> WhatsApp ${runtime.whatsappNumber ? 'configured' : 'needs env'}</span><span class="check-item"><i class="status-dot"></i> Database adapter ready in schema</span><span class="check-item"><i class="status-dot"></i> Cloud storage adapter env-ready</span></div></div>`;
  return `<div class="shell admin-page"><header class="admin-heading"><div><div class="admin-breadcrumb"><a href="#/admin?tab=overview">Admin</a><span>&gt;</span><strong>${esc(tabTitles[tab] || 'Workspace')}</strong></div><h1>${esc(tabTitles[tab] || 'Admin workspace')}</h1><p>Manage the imported catalog, business workflows and approval queues without leaving the workspace.</p></div><div class="admin-heading-actions"><span class="admin-badge">RBAC: admin route</span><button class="button button-ghost button-small" type="button" data-action="admin-refresh">Refresh view</button></div></header><div class="admin-layout"><aside class="admin-nav" aria-label="Admin navigation">${nav}</aside><section class="admin-content">${content}</section></div></div>`;
}

function imageRecordsFor(product) {
  const local = state.gallery.filter((item) => item.productId === product.id && item.active !== false);
  const candidates = state.imageCandidates?.[product.id] || [];
  const manifest = imageManifest.products?.[product.id]?.images || [];
  return [...local, ...candidates, ...manifest];
}

function imageStatusLabel(record) {
  if (record?.verified === true || record?.imageStatus === 'verified') return 'Verified';
  if (record?.imageStatus === 'rejected') return 'Rejected';
  return 'Pending review';
}

function renderImageAutomation(product) {
  const records = imageRecordsFor(product);
  const approved = records.filter(isPublishableImage).length;
  const pending = records.filter((record) => !isPublishableImage(record)).length;
  const manifestState = imageManifest.products?.[product.id]?.imageStatus || 'placeholder';
  return `<div class="image-automation"><div><p class="eyebrow">Automatic image system</p><strong>${approved ? `${approved} approved image${approved === 1 ? '' : 's'}` : 'No approved image yet'}</strong><small>${pending ? `${pending} candidate${pending === 1 ? '' : 's'} awaiting review` : manifestState === 'placeholder' ? 'Safe Product Image Coming Soon fallback' : 'Search for exact manufacturer + product matches.'}</small></div><div class="image-automation-actions"><button type="button" class="button button-primary button-small" data-action="discover-images" data-id="${product.id}">Find image candidates</button><a class="button button-ghost button-small" href="#/admin?tab=gallery&product=${product.id}">Manage images</a></div></div>`;
}

function renderAdminProducts() {
  const products = getProducts();
  const selected = products.find((product) => product.id === (pathInfo().query.get('product') || products[0]?.id));
  return `<div class="admin-section-heading"><div><p class="eyebrow">Product CRUD</p><h2>Catalog management</h2><p>Imported rows are preserved; fields below are editable overrides stored locally for this preview.</p></div><a class="button button-ghost button-small" href="#/admin?tab=products&new=1">Add product</a></div><div class="admin-product-layout"><div class="admin-list"><div class="admin-list-toolbar"><strong>${formatNumber(products.length)} products</strong><button class="text-link" data-action="download-csv">Download CSV <span>↗</span></button></div>${products.slice(0, 120).map((product) => `<a class="admin-product-row ${selected?.id === product.id ? 'active' : ''}" href="#/admin?tab=products&product=${product.id}"><span class="admin-row-icon">${esc(product.category.slice(0, 2).toUpperCase())}</span><span><strong>${esc(product.name)}</strong><small>${esc(product.manufacturer)}</small></span><em>${esc(product.category)}</em></a>`).join('')}<p class="list-footnote">Showing the first 120 rows for a fast admin list. Search/import can be connected to the relational API in production.</p></div>${selected ? `<form class="form-card admin-editor" data-form="admin-product" data-id="${selected.id}"><div class="form-card-heading"><div><p class="eyebrow">Edit product</p><h2>${esc(selected.name)}</h2><p>${esc(selected.manufacturer)} · PDF page ${selected.sourcePage}</p></div></div><div class="form-grid"><label>Category<select name="category">${categories.map((category) => `<option ${selected.category === category.name ? 'selected' : ''}>${esc(category.name)}</option>`).join('')}</select></label><label>Subcategory<input name="subcategory" value="${esc(selected.subcategory)}" /></label><label>Brand<input name="brand" value="${esc(selected.brand || '')}" placeholder="Not configured" /></label><label>Pack size<input name="packSize" value="${esc(selected.packSize || '')}" placeholder="Not configured" /></label><label>Price<input name="price" type="number" min="0" value="${selected.price ?? ''}" placeholder="Blank until verified" /></label><label>Wholesale price<input name="wholesalePrice" type="number" min="0" value="${selected.wholesalePrice ?? ''}" placeholder="Blank until verified" /></label><label>MOQ<input name="moq" type="number" min="1" value="${selected.moq ?? ''}" placeholder="Blank until verified" /></label><label>GST<input name="gst" value="${esc(selected.gst || '')}" placeholder="Blank until verified" /></label><label>Stock status<select name="stockStatus"><option value="not-configured" ${selected.stockStatus === 'not-configured' ? 'selected' : ''}>Not configured</option><option value="in-stock" ${selected.stockStatus === 'in-stock' ? 'selected' : ''}>In stock</option><option value="out-of-stock" ${selected.stockStatus === 'out-of-stock' ? 'selected' : ''}>Out of stock</option></select></label><label>Purchase mode<select name="purchaseMode"><option value="quote" ${selected.purchaseMode === 'quote' ? 'selected' : ''}>Request quote</option><option value="direct" ${selected.purchaseMode === 'direct' ? 'selected' : ''}>Direct purchase</option><option value="enquiry" ${selected.purchaseMode === 'enquiry' ? 'selected' : ''}>Enquiry only</option></select></label><label class="full-span">Description<textarea name="description" rows="4" placeholder="Admin-approved description">${esc(selected.description || '')}</textarea></label></div>${renderImageAutomation(selected)}<label class="checkbox-line"><input type="checkbox" name="active" ${selected.active !== false ? 'checked' : ''} /> Active in customer catalog</label><button class="button button-dark" type="submit">Save product fields</button><p class="form-footnote">Automatic candidates remain private until verified. Product imagery is managed in Gallery so each image remains linked to a product.</p></form>` : ''}</div><div class="admin-import"><div><p class="eyebrow">Bulk import</p><h2>CSV / Excel-ready intake</h2><p>CSV import works in this browser preview. The production adapter accepts the same columns from CSV or Excel and validates rows server-side before publishing.</p></div><form data-form="admin-import"><label class="upload-drop compact-upload"><input type="file" name="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required /><span class="upload-icon">CSV</span><strong>Choose CSV or Excel</strong><small>CSV rows are validated here. Excel is handed to the production import adapter.</small></label><button class="button button-ghost" type="submit">Import file</button></form></div></div>`;
}

function renderAdminDeliveries() {
  const filter = pathInfo().query.get('filter') || 'pending';
  const deliveries = state.deliveries.filter((delivery) => delivery.status === filter);
  return `<div class="admin-section-heading"><div><p class="eyebrow">Moderation queue</p><h2>Delivery photo approvals</h2><p>Customer uploads remain private until you approve them.</p></div><div class="segmented-control">${['pending', 'approved', 'rejected'].map((value) => `<a class="${filter === value ? 'active' : ''}" href="#/admin?tab=deliveries&filter=${value}">${value} <b>${state.deliveries.filter((item) => item.status === value).length}</b></a>`).join('')}</div></div>${deliveries.length ? `<div class="admin-delivery-list">${deliveries.map((delivery) => `<article class="admin-delivery-card"><div class="admin-delivery-photo">${delivery.photos?.[0] ? `<img src="${delivery.photos[0]}" alt="Delivery submission" />` : placeholderArt('Photo pending')}</div><div class="admin-delivery-info"><div class="delivery-card-top"><span class="tag">${esc(delivery.status)}</span><span>${esc(delivery.date || '')}</span></div><h3>${esc(delivery.businessName || 'Business not provided')}</h3><p>${esc(delivery.productName || 'Product not specified')}</p><div class="stars">${'★'.repeat(Number(delivery.rating || 0))}${'☆'.repeat(5 - Number(delivery.rating || 0))}</div><blockquote>${esc(delivery.comment || 'No comment provided.')}</blockquote><div class="admin-card-actions">${filter === 'pending' ? `<button class="button button-primary button-small" data-action="approve-delivery" data-id="${delivery.id}">Approve</button><button class="button button-danger button-small" data-action="reject-delivery" data-id="${delivery.id}">Reject</button>` : ''}<button class="button button-ghost button-small" data-action="delete-delivery" data-id="${delivery.id}">Delete</button></div></div></article>`).join('')}</div>` : `<div class="empty-state admin-empty"><div class="empty-icon">${filter === 'pending' ? 'OK' : filter.toUpperCase()}</div><h2>No ${filter} delivery submissions</h2><p>Approved customer submissions are the only ones visible on the public Customer Deliveries page.</p></div>`}`;
}

function renderAdminGallery() {
  const products = getProducts();
  const candidateRows = [
    ...Object.entries(state.imageCandidates || {}).flatMap(([productId, candidates]) => (candidates || []).map((candidate, index) => ({ productId, candidate, index, candidateSource: 'session' }))),
    ...Object.entries(imageManifest.products || {}).flatMap(([productId, record]) => (record.images || []).map((candidate, index) => ({ productId, candidate, index, candidateSource: 'manifest' }))),
  ];
  const selectedProductId = pathInfo().query.get('product') || '';
  const visibleCandidates = candidateRows.filter((row) => !selectedProductId || row.productId === selectedProductId);
  const galleryRows = state.gallery.map((item) => { const product = getProduct(item.productId); return product ? `<div class="admin-gallery-row"><div class="admin-gallery-thumb">${item.dataUrl || item.url ? `<img src="${esc(item.dataUrl || item.url)}" alt="${esc(product.name)}" loading="lazy" />` : placeholderArt('Image', true)}</div><div><strong>${esc(product.name)}</strong><span>${esc(item.source || 'admin_upload')} · ${imageStatusLabel(item)}</span>${item.sourceUrl ? `<a href="${esc(item.sourceUrl)}" target="_blank" rel="noreferrer">View source</a>` : ''}</div><div class="admin-card-actions"><button class="button button-ghost button-small" data-action="${item.verified === true ? 'unverify-image' : 'verify-image'}" data-id="${item.id}">${item.verified === true ? 'Mark unverified' : 'Mark verified'}</button><button class="button button-ghost button-small" data-action="set-main-image" data-id="${item.id}">Set as main</button><button class="remove-link" data-action="delete-gallery" data-id="${item.id}">Remove</button></div></div>` : ''; }).join('');
  const candidateCards = visibleCandidates.map(({ productId, candidate, index, candidateSource }) => { const product = getProduct(productId); return product ? `<article class="image-candidate-card"><img src="${esc(candidate.thumbnailUrl || candidate.imageUrl)}" alt="${esc(candidate.altText || product.name)}" loading="lazy" /><div><span class="tag">Candidate · ${esc(candidate.source || 'provider')}</span><h3>${esc(product.name)}</h3><p>${esc(product.manufacturer)}</p><small>Unverified until admin review</small><div class="admin-card-actions"><button class="button button-primary button-small" data-action="use-image-candidate" data-product-id="${productId}" data-candidate-index="${index}" data-candidate-source="${candidateSource}">Use for product</button><a class="button button-ghost button-small" href="${esc(candidate.sourceUrl || candidate.imageUrl)}" target="_blank" rel="noreferrer">View source</a></div></div></article>` : ''; }).join('');
  return `<div class="admin-section-heading"><div><p class="eyebrow">Gallery management</p><h2>Link images to products</h2><p>Discover candidates automatically, then verify or replace them before they become customer-visible.</p></div></div><div class="admin-gallery-layout"><form class="form-card" data-form="admin-gallery"><div class="form-grid"><label class="full-span">Related product<select name="productId" required><option value="">Select product</option>${products.map((product) => `<option value="${product.id}">${esc(product.name)} - ${esc(product.manufacturer)}</option>`).join('')}</select></label><label class="full-span upload-drop"><input name="file" type="file" accept="image/jpeg,image/png" capture="environment" required /><span class="upload-icon">IMG</span><strong>Upload or replace image</strong><small>JPEG or PNG. Stored via cloud adapter in production.</small></label><label class="checkbox-line full-span"><input name="replace" type="checkbox" /> Replace current primary image</label></div><button class="button button-dark" type="submit">Add linked image</button></form><div class="admin-gallery-list">${galleryRows || '<div class="mini-empty"><p>No linked images yet. Run automatic discovery or add an approved upload.</p></div>'}</div></div>${candidateCards ? `<section class="image-candidate-section"><div class="admin-section-heading"><div><p class="eyebrow">Automatic candidates</p><h2>Review before publishing</h2><p>These results are sourced with the exact manufacturer and product name. They remain private until you choose and verify one.</p></div></div><div class="image-candidate-grid">${candidateCards}</div></section>` : ''}`;
}

function renderAdminQuotes() {
  const quoteOrders = JSON.parse(localStorage.getItem('cosmic-life-force-quotes') || '[]');
  return `<div class="admin-section-heading"><div><p class="eyebrow">Quote workflow</p><h2>Wholesale quotations</h2><p>Review requests submitted through the customer quote flow.</p></div></div>${quoteOrders.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Quote</th><th>Business</th><th>Lines</th><th>Status</th><th>Date</th></tr></thead><tbody>${quoteOrders.map((quote) => `<tr><td>${esc(quote.id)}</td><td>${esc(quote.businessName)}</td><td>${quote.lines.length}</td><td><span class="tag">${esc(quote.status)}</span></td><td>${esc(quote.date)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state admin-empty"><div class="empty-icon">RFQ</div><h2>No quote requests yet</h2><p>Submitted quote requests will appear here with product lines, quantities and customer context.</p></div>`}`;
}

function renderAdminOrders() {
  const statuses = ['Order Placed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled'];
  return `<div class="admin-section-heading"><div><p class="eyebrow">Order workflow</p><h2>Orders</h2><p>Local preview orders are shown here. Production order status history belongs in the relational order tables.</p></div></div>${state.orders.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Order</th><th>Business</th><th>Items</th><th>Status</th><th>Date</th></tr></thead><tbody>${state.orders.map((order) => `<tr><td>${esc(order.id)}</td><td>${esc(order.businessName)}</td><td>${order.items.length}</td><td><select data-order-status data-id="${order.id}">${statuses.map((status) => `<option ${order.status === status ? 'selected' : ''}>${esc(status)}</option>`).join('')}</select></td><td>${esc(order.date)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty-state admin-empty"><div class="empty-icon">ORD</div><h2>No orders yet</h2><p>Checkout requests will populate the order workflow.</p></div>`}`;
}

function renderNotFound(title, description) {
  return `<div class="shell content-page"><div class="empty-state large-empty"><div class="empty-icon">404</div><h1>${esc(title)}</h1><p>${esc(description)}</p><a class="button button-dark" href="#/products">Return to catalog</a></div></div>`;
}

function renderRoute({ preserveScroll = false, scrollY = 0 } = {}) {
  const main = document.querySelector('#main-content');
  const { path } = pathInfo();
  let html = path === '/' ? renderHome() : path === '/products' ? renderProducts() : path === '/categories' ? renderCategories() : path === '/brands' || path.startsWith('/brands/') ? renderBrands() : path === '/gallery' ? renderGallery() : path === '/deliveries' ? renderDeliveries() : path === '/quote' ? renderQuote() : path === '/wholesale' ? renderWholesale() : path === '/orders' ? renderOrders() : path === '/cart' ? renderCart() : path === '/checkout' ? renderCheckout() : path === '/register' ? renderRegister() : path === '/login' ? renderLogin() : path === '/account' ? renderAccount() : path === '/about' ? renderAbout() : path === '/contact' ? renderContact() : path === '/admin' ? renderAdmin() : path.startsWith('/product/') ? renderProductDetail(path.split('/')[2]) : path.startsWith('/products/') ? renderProductDetail(path.split('/')[2]) : renderNotFound('Page not found', 'Use the main navigation to return to the catalog.');
  main.innerHTML = html;
  if (preserveScroll) {
    const restore = () => window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' });
    window.requestAnimationFrame(() => {
      restore();
      window.requestAnimationFrame(restore);
    });
  }
}

function currentQueryWith(changes = {}) {
  const { query } = pathInfo();
  Object.entries(changes).forEach(([key, value]) => value ? query.set(key, value) : query.delete(key));
  const encoded = query.toString();
  return `/products${encoded ? `?${encoded}` : ''}`;
}

function readFiles(files) {
  return Promise.all([...files].slice(0, 5).map((file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  })));
}

function whatsapp(product) {
  if (!runtime.whatsappNumber) {
    toast('WhatsApp is not configured. Set WHATSAPP_BUSINESS_NUMBER in the server environment.', 'error');
    return;
  }
  const text = product ? `Hello Cosmic Life Force, I would like an enquiry for ${product.name}. Product reference: ${location.origin}/#/product/${product.id}` : 'Hello Cosmic Life Force, I would like to discuss a wholesale medical product requirement.';
  window.open(`https://wa.me/${runtime.whatsappNumber}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

function csvValue(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadCatalogCsv() {
  const header = ['id', 'name', 'manufacturer', 'category', 'subcategory', 'sourcePage', 'price', 'wholesalePrice', 'moq', 'gst', 'stockStatus', 'purchaseMode'];
  const rows = getProducts().map((product) => header.map((key) => csvValue(product[key])).join(','));
  const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'cosmic-life-force-catalog.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

async function discoverImageCandidates(productId) {
  const product = getProduct(productId);
  if (!product) return;
  toast('Searching exact manufacturer and product name…');
  try {
    const response = await fetch('/api/image-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, name: product.name, manufacturer: product.manufacturer, category: product.category, subcategory: product.subcategory, limit: 6 }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'Image search failed.');
    state.imageCandidates[productId] = result.candidates || [];
    saveState();
    toast(result.candidates?.length ? `${result.candidates.length} candidate images saved for review.` : 'No verified provider results. The safe placeholder remains active.', result.candidates?.length ? 'success' : 'info');
    renderShell();
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Image search is unavailable.', 'error');
  }
}

document.addEventListener('click', (event) => {
  if (!event.target.closest('.delivery-context-wrap')) {
    document.querySelector('.location-popover.is-open')?.classList.remove('is-open');
    document.querySelector('.delivery-context[aria-expanded="true"]')?.setAttribute('aria-expanded', 'false');
  }
  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) return;
  const action = actionTarget.dataset.action;
  if (action === 'toggle-menu') {
    document.querySelector('.primary-nav')?.classList.toggle('is-open');
  } else if (action === 'toggle-location') {
    const popover = document.querySelector('[data-location-popover]');
    if (popover) {
      const isOpen = popover.classList.toggle('is-open');
      actionTarget.setAttribute('aria-expanded', String(isOpen));
      popover.setAttribute('aria-hidden', String(!isOpen));
      if (isOpen) window.setTimeout(() => popover.querySelector('input')?.focus(), 0);
    }
  } else if (action === 'close-location') {
    document.querySelector('.location-popover.is-open')?.classList.remove('is-open');
    document.querySelector('.delivery-context[aria-expanded="true"]')?.setAttribute('aria-expanded', 'false');
  } else if (action === 'select-location') {
    const location = storeDeliveryLocation(actionTarget.dataset.location);
    toast(`Delivery location set to ${location}.`, 'success');
    renderShell();
  } else if (action === 'clear-location') {
    storeDeliveryLocation('');
    toast('Saved delivery location cleared.', 'info');
    renderShell();
  } else if (action === 'search-suggestion') {
    rememberSearch(actionTarget.dataset.query || '');
    navigate(`/products?query=${encodeURIComponent(actionTarget.dataset.query || '')}`);
  } else if (action === 'open-product') {
    navigate(`/product/${actionTarget.dataset.id}`);
  } else if (action === 'add-cart') {
    addToCart(actionTarget.dataset.id);
  } else if (action === 'buy-now') {
    const product = getProduct(actionTarget.dataset.id);
    if (product) {
      addToCart(product.id, Number(document.querySelector('[data-detail-qty]')?.value || 1));
      navigate('/checkout');
    }
  } else if (action === 'add-quote') {
    addQuoteLine(actionTarget.dataset.id);
  } else if (action === 'add-detail-cart') {
    const quantity = Number(document.querySelector('[data-detail-qty]')?.value || 1);
    addToCart(actionTarget.dataset.id, quantity);
  } else if (action === 'add-detail-quote') {
    const quantity = Number(document.querySelector('[data-detail-qty]')?.value || 1);
    addQuoteLine(actionTarget.dataset.id, quantity);
  } else if (action === 'whatsapp' || action === 'whatsapp-product') {
    whatsapp(actionTarget.dataset.id ? getProduct(actionTarget.dataset.id) : null);
  } else if (action === 'cart-inc' || action === 'cart-dec') {
    const line = state.cart.find((item) => item.productId === actionTarget.dataset.id);
    if (line) line.quantity = action === 'cart-inc' ? line.quantity + 1 : Math.max(1, line.quantity - 1);
    saveState();
    renderShell();
  } else if (action === 'remove-cart') {
    state.cart = state.cart.filter((line) => line.productId !== actionTarget.dataset.id);
    saveState();
    renderShell();
  } else if (action === 'remove-quote') {
    state.quoteLines = state.quoteLines.filter((line) => line.productId !== actionTarget.dataset.id);
    saveState();
    renderShell();
  } else if (action === 'reset-filters') {
    navigate('/products');
  } else if (action === 'clear-query') {
    navigate(currentQueryWith({ query: '' }));
  } else if (action === 'clear-category') {
    navigate(currentQueryWith({ category: '' }));
  } else if (action === 'add-all-visible-quote') {
    document.querySelectorAll('.product-card [data-action="add-quote"]').forEach((button) => {
      const existing = state.quoteLines.find((line) => line.productId === button.dataset.id);
      if (existing) existing.quantity += 1;
      else state.quoteLines.push({ productId: button.dataset.id, quantity: 1 });
    });
    saveState();
    navigate('/quote');
  } else if (action === 'logout') {
    void signOutSupabase();
    state.session = null;
    saveState();
    toast('Local preview session ended.');
    navigate('/');
  } else if (action === 'open-delivery-form') {
    navigate(`/account?delivery=${encodeURIComponent(actionTarget.dataset.id)}`);
  } else if (action === 'discover-images') {
    void discoverImageCandidates(actionTarget.dataset.id);
  } else if (action === 'use-image-candidate') {
    const productId = actionTarget.dataset.productId;
    const candidates = actionTarget.dataset.candidateSource === 'manifest'
      ? imageManifest.products?.[productId]?.images || []
      : state.imageCandidates?.[productId] || [];
    const candidate = candidates[Number(actionTarget.dataset.candidateIndex)];
    if (candidate) {
      state.gallery.push({ id: `gallery-${Date.now()}`, productId, url: candidate.imageUrl, source: candidate.source, sourceUrl: candidate.sourceUrl, altText: candidate.altText, active: true, verified: false, imageStatus: 'pending_review', isPrimary: false });
      saveState();
      toast('Candidate linked as pending review.', 'success');
      renderShell();
    }
  } else if (action === 'verify-image' || action === 'unverify-image') {
    const image = state.gallery.find((item) => item.id === actionTarget.dataset.id);
    if (image) {
      image.verified = action === 'verify-image';
      image.imageStatus = action === 'verify-image' ? 'verified' : 'unverified';
      saveState();
      toast(action === 'verify-image' ? 'Image verified and published.' : 'Image marked unverified and hidden from customers.', action === 'verify-image' ? 'success' : 'info');
      renderShell();
    }
  } else if (action === 'set-main-image') {
    const image = state.gallery.find((item) => item.id === actionTarget.dataset.id);
    if (image) {
      state.gallery.filter((item) => item.productId === image.productId).forEach((item) => { item.isPrimary = false; });
      image.isPrimary = true;
      saveState();
      toast('Primary image updated.', 'success');
      renderShell();
    }
  } else if (action === 'approve-delivery' || action === 'reject-delivery') {
    const delivery = state.deliveries.find((item) => item.id === actionTarget.dataset.id);
    if (delivery) delivery.status = action === 'approve-delivery' ? 'approved' : 'rejected';
    saveState();
    toast(`Delivery submission ${delivery?.status || 'updated'}.`, action === 'approve-delivery' ? 'success' : 'info');
    renderShell();
  } else if (action === 'delete-delivery') {
    state.deliveries = state.deliveries.filter((item) => item.id !== actionTarget.dataset.id);
    saveState();
    renderShell();
  } else if (action === 'delete-gallery') {
    state.gallery = state.gallery.filter((item) => item.id !== actionTarget.dataset.id);
    saveState();
    renderShell();
  } else if (action === 'download-csv') {
    downloadCatalogCsv();
  } else if (action === 'admin-refresh') {
    renderShell();
  }
});

document.addEventListener('input', (event) => {
  const target = event.target;
  if (!target.matches('[data-admin-product-search]')) return;
  const needle = target.value.trim().toLowerCase();
  const rows = [...document.querySelectorAll('.admin-product-row')];
  rows.forEach((row) => { row.hidden = Boolean(needle) && !row.textContent.toLowerCase().includes(needle); });
  const visible = rows.filter((row) => !row.hidden).length;
  const hint = document.querySelector('.admin-filter-hint');
  if (hint) hint.textContent = needle ? `${visible} matching rows` : 'Search filters the current list without changing the route.';
});

document.addEventListener('change', (event) => {
  const target = event.target;
  if (target.matches('[data-order-status]')) {
    const order = state.orders.find((item) => item.id === target.dataset.id);
    if (order) order.status = target.value;
    saveState();
    toast(`Order status updated to ${target.value}.`, 'success');
    renderShell();
  }
  if (target.matches('[data-filter-change]')) {
    const form = target.closest('form');
    const data = new FormData(form);
    navigate(currentQueryWith({ category: data.get('category'), subcategory: data.get('subcategory'), manufacturer: data.get('manufacturer'), availability: data.get('availability'), sort: data.get('sort') }));
  }
  if (target.matches('[data-quote-qty]')) {
    const line = state.quoteLines.find((item) => item.productId === target.dataset.id);
    if (line) line.quantity = Math.max(1, Number(target.value || 1));
    saveState();
  }
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const formName = form.dataset.form;
  const data = Object.fromEntries(new FormData(form).entries());
  if (formName === 'delivery-location') {
    const location = storeDeliveryLocation(data.location);
    if (!location) {
      toast('Enter a city or area to set delivery location.', 'error');
      return;
    }
    toast(`Delivery location set to ${location}.`, 'success');
    renderShell();
  } else if (formName === 'search') {
    rememberSearch(data.query);
    navigate(`/products?query=${encodeURIComponent(data.query || '')}`);
  } else if (formName === 'register') {
    if (supabaseReady()) {
      if (String(data.password || '').length < 8 || data.password !== data.passwordConfirm) {
        toast('Use a password of at least 8 characters and confirm it correctly.', 'error');
        return;
      }
      try {
        const auth = await supabaseAuth('signup', { email: data.email, password: data.password, options: { data: { business_name: data.businessName, owner_name: data.ownerName } } });
        if (!auth.access_token) {
          toast('Account created. Check your email to confirm access, then sign in.', 'info');
          navigate('/login');
          return;
        }
        storeSupabaseSession(auth);
        state.profile = localProfileFields(data);
        state.session = { role: 'customer', email: data.email, userId: auth.user?.id || '' };
        await saveRemoteProfile(data);
        saveState();
        toast('Supabase business account created.', 'success');
        navigate('/account');
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Registration failed.', 'error');
      }
    } else {
      state.profile = { ...(state.profile || {}), ...localProfileFields(data) };
      state.session = { role: 'customer', email: data.email };
      saveState();
      toast('Business profile saved in this preview.', 'success');
      navigate('/account');
    }
  } else if (formName === 'profile') {
    try {
      state.profile = { ...(state.profile || {}), ...localProfileFields(data) };
      if (supabaseReady() && sessionAccessToken()) await saveRemoteProfile(data);
      saveState();
      toast(supabaseReady() ? 'Business profile saved to Supabase.' : 'Business profile saved in this preview.', 'success');
      navigate('/account');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Profile update failed.', 'error');
    }
  } else if (formName === 'login') {
    if (supabaseReady()) {
      try {
        const auth = await supabaseAuth('token?grant_type=password', { email: data.email, password: data.password });
        storeSupabaseSession(auth);
        const session = await authenticatedApi('/api/auth/session');
        state.session = { role: session.role || 'customer', email: session.user?.email || data.email, userId: session.user?.id || '' };
        const profile = await authenticatedApi('/api/profile');
        if (profile.profile) state.profile = { ...(state.profile || {}), ...mapRemoteProfile(profile.profile) };
        if (!state.profile) state.profile = { email: data.email, businessName: 'Business profile pending', ownerName: '', phone: '', customerType: 'Other' };
        saveState();
        toast('Signed in with Supabase Auth.', 'success');
        navigate('/account');
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Sign in failed.', 'error');
      }
    } else {
      state.session = { role: 'customer', email: data.email };
      if (!state.profile) state.profile = { email: data.email, businessName: 'Business profile pending', ownerName: '', phone: '', customerType: 'Other' };
      saveState();
      toast('Local preview session started.', 'success');
      navigate('/account');
    }
  } else if (formName === 'quote-submit') {
    const quotes = JSON.parse(localStorage.getItem('cosmic-life-force-quotes') || '[]');
    quotes.push({ id: `RFQ-${Date.now().toString().slice(-6)}`, ...data, lines: state.quoteLines, status: 'Pending', date: new Date().toLocaleDateString('en-IN') });
    localStorage.setItem('cosmic-life-force-quotes', JSON.stringify(quotes));
    state.quoteLines = [];
    saveState();
    toast('Quote request submitted for admin review.', 'success');
    navigate('/account');
  } else if (formName === 'checkout') {
    if (runtime.razorpayEnabled) {
      await startRazorpayPayment(data);
      return;
    }
    const order = { id: `CLF-${Date.now().toString().slice(-6)}`, ...data, items: cartProductLines().map(({ line, product }) => ({ productId: product.id, name: product.name, quantity: line.quantity })), status: 'Order Placed', date: new Date().toLocaleDateString('en-IN') };
    state.orders.push(order);
    state.profile = { ...(state.profile || {}), ...data };
    state.cart = [];
    saveState();
    toast(`Order request ${order.id} created.`, 'success');
    navigate('/account');
  } else if (formName === 'contact') {
    toast('Enquiry saved for the configured support channel.', 'success');
    form.reset();
  } else if (formName === 'delivery') {
    const files = form.querySelector('input[type="file"]').files;
    if (!files.length) return;
    const order = state.orders.find((item) => item.id === form.dataset.orderId);
    const photos = await readFiles(files);
    state.deliveries.push({ id: `delivery-${Date.now()}`, orderId: form.dataset.orderId, businessName: state.profile?.businessName || 'Business not provided', productName: order?.items?.[0]?.name || 'Product not specified', rating: Number(data.rating || 5), comment: data.comment || '', photos, status: 'pending', date: new Date().toLocaleDateString('en-IN') });
    saveState();
    toast('Delivery photo submitted as Pending for admin approval.', 'success');
    navigate('/account');
  } else if (formName === 'admin-product') {
    const product = getProduct(form.dataset.id);
    if (!product) return;
    const override = { ...data, price: data.price ? Number(data.price) : null, wholesalePrice: data.wholesalePrice ? Number(data.wholesalePrice) : null, moq: data.moq ? Number(data.moq) : null, active: data.active === 'on' };
    state.overrides[product.id] = { ...state.overrides[product.id], ...override };
    saveState();
    toast('Product fields updated.', 'success');
    renderShell();
  } else if (formName === 'admin-import') {
    const file = form.querySelector('input[type="file"]').files[0];
    if (!file) return;
    if (/\.xlsx?$/i.test(file.name)) {
      toast('Excel file accepted for the production import adapter. Export as CSV to run a local preview import.', 'info');
      return;
    }
    const text = await file.text();
    const rows = text.split(/\r?\n/).filter(Boolean);
    const headers = rows.shift().split(',').map((header) => header.trim().replace(/^"|"$/g, ''));
    rows.slice(0, 250).forEach((row, index) => {
      const values = row.split(',').map((value) => value.trim().replace(/^"|"$/g, ''));
      const mapped = Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] || '']));
      if (!mapped.name) return;
      state.customProducts.push({ id: `custom-${Date.now()}-${index}`, name: mapped.name, manufacturer: mapped.manufacturer || 'Not configured', category: mapped.category || 'Medicines', subcategory: mapped.subcategory || 'Imported', sourcePage: 'Admin import', sourceDuplicates: 0, brand: mapped.brand || '', description: mapped.description || '', packSize: '', specifications: {}, variants: [], images: [], moq: null, price: null, wholesalePrice: null, bulkPricing: [], gst: null, stockStatus: 'not-configured', purchaseMode: 'quote', active: true });
    });
    saveState();
    toast('CSV rows imported into the local admin catalog.', 'success');
    renderShell();
  } else if (formName === 'admin-gallery') {
    const file = form.querySelector('input[type="file"]').files[0];
    if (!file) return;
    const [dataUrl] = await readFiles([file]);
    if (data.replace === 'on') state.gallery = state.gallery.filter((item) => item.productId !== data.productId);
    state.gallery.push({ id: `gallery-${Date.now()}`, productId: data.productId, dataUrl, active: true, verified: true, imageStatus: 'verified', source: 'admin_upload', sourceUrl: '', isPrimary: true });
    saveState();
    toast(data.replace === 'on' ? 'Primary image replaced.' : 'Linked gallery image added and verified.', 'success');
    renderShell();
  }
});

window.addEventListener('hashchange', renderShell);
window.addEventListener('scroll', () => document.querySelector('.site-header')?.classList.toggle('is-scrolled', window.scrollY > 18), { passive: true });
renderShell();
void loadImageManifest();
void loadSupabaseCatalog();
void hydrateSupabaseSession();
