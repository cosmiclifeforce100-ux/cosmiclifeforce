import fs from 'node:fs/promises';
import path from 'node:path';
import { catalogProducts } from '../data/catalog.js';

const provider = String(process.env.IMAGE_SEARCH_PROVIDER || 'none').toLowerCase();
const limit = Math.min(Math.max(Number(process.env.IMAGE_SEARCH_RESULTS || 4), 1), 8);
const delayMs = Math.max(Number(process.env.IMAGE_SEARCH_DELAY_MS || 120), 0);
const outputPath = path.resolve(process.env.IMAGE_MANIFEST_PATH || 'public/image-manifest.json');
const categories = [
  ['Medicines', 'professional pharmaceutical bottles and tablets healthcare studio'],
  ['Surgical Supplies', 'sterile surgical instruments healthcare studio'],
  ['Medical Devices', 'blood pressure monitor stethoscope medical device studio'],
  ['Disposable Products', 'medical gloves masks syringes healthcare studio'],
  ['Diagnostic Products', 'diagnostic laboratory equipment healthcare studio'],
  ['Hospital Equipment', 'hospital bed patient care equipment studio'],
  ['PPE Products', 'medical protective equipment PPE studio'],
  ['Dental Products', 'professional dental instruments clinic studio'],
  ['Orthopedic', 'orthopedic knee back wrist support studio'],
  ['Healthcare & Hard Products', 'home healthcare mobility equipment studio'],
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function queryFor(product) {
  return product.query || [product.manufacturer, product.name, product.subcategory || product.category].filter(Boolean).join(' ');
}

function normalize(item, query) {
  const src = item.src || item.images || {};
  const imageUrl = item.image_url || item.imageUrl || item.url || src.medium || src.large || src.original || src.small;
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return null;
  return {
    imageUrl,
    thumbnailUrl: item.thumbnail_url || item.thumbnailUrl || src.small || src.medium || imageUrl,
    source: provider === 'pexels' ? 'pexels' : 'custom',
    sourceUrl: item.source_url || item.sourceUrl || item.page_url || item.pageUrl || item.photographer_url || '',
    altText: item.alt || item.altText || item.description || query,
    verified: false,
    imageStatus: 'pending_review',
    isPrimary: false,
  };
}

async function providerSearch(product) {
  if (provider === 'none') return [];
  const query = queryFor(product);
  const endpoint = provider === 'pexels'
    ? new URL('https://api.pexels.com/v1/search')
    : new URL(process.env.IMAGE_SEARCH_ENDPOINT || 'http://localhost:4173/api/image-search');
  endpoint.searchParams.set(provider === 'pexels' ? 'query' : 'q', query);
  endpoint.searchParams.set('limit', String(limit));
  if (provider === 'pexels') endpoint.searchParams.set('per_page', String(limit));
  const headers = { Accept: 'application/json' };
  if (provider === 'pexels') {
    if (!process.env.PEXELS_API_KEY) throw new Error('PEXELS_API_KEY is required for Pexels discovery.');
    headers.Authorization = process.env.PEXELS_API_KEY;
  } else if (process.env.IMAGE_SEARCH_API_KEY) {
    headers.Authorization = `Bearer ${process.env.IMAGE_SEARCH_API_KEY}`;
  }
  const response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(Number(process.env.IMAGE_SEARCH_TIMEOUT_MS || 12000)) });
  if (!response.ok) throw new Error(`Image provider returned HTTP ${response.status} for ${query}.`);
  const data = await response.json();
  const items = data.photos || data.images || data.results || data.items || [];
  return items.map((item) => normalize(item, query)).filter(Boolean).slice(0, limit);
}

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  provider,
  safety: 'Candidates are never customer-visible until an admin marks them verified.',
  products: {},
  categories: {},
};

let completed = 0;
for (const product of catalogProducts) {
  const query = queryFor(product);
  let candidates = [];
  let error = '';
  try {
    candidates = await providerSearch(product);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Image provider error.';
  }
  manifest.products[product.id] = {
    product: product.name,
    manufacturer: product.manufacturer,
    category: product.category,
    subcategory: product.subcategory,
    query,
    imageStatus: candidates.length ? 'pending_review' : 'placeholder',
    images: candidates,
    error,
  };
  completed += 1;
  if (delayMs && completed < catalogProducts.length) await sleep(delayMs);
  if (completed % 25 === 0) console.log(`Processed ${completed}/${catalogProducts.length} products.`);
}

for (const [name, query] of categories) {
  let candidates = [];
  let error = '';
  try {
    candidates = await providerSearch({ query, name: query, manufacturer: 'category', category: name });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Image provider error.';
  }
  manifest.categories[name] = { query, imageStatus: candidates.length ? 'pending_review' : 'placeholder', images: candidates, error };
  if (delayMs) await sleep(delayMs);
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Image manifest written to ${outputPath}. Provider: ${provider}.`);
