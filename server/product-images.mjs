import { randomUUID } from 'node:crypto';
import {
  supabaseRequest,
  supabaseStorageObjectUrl,
  supabaseStorageRemove,
  supabaseStorageSignedUrl,
  supabaseStorageUpload,
} from './supabase.mjs';

export const PRODUCT_IMAGE_BUCKET = 'product-images';
export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PRODUCT_IMAGE_COUNT = 5;

const formats = {
  'image/jpeg': { extension: 'jpg', matches: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/png': { extension: 'png', matches: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { extension: 'webp', matches: (buffer) => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' },
};

function imageError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function encoded(value) {
  return encodeURIComponent(String(value || ''));
}

function cleanFileName(value) {
  return String(value || 'image').split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 100) || 'image';
}

function decodeUpload(upload) {
  const contentType = String(upload?.contentType || '').toLowerCase();
  const format = formats[contentType];
  if (!format) throw imageError('Only JPG, JPEG, PNG and WEBP files are allowed.');
  if (!upload?.data || typeof upload.data !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(upload.data)) {
    throw imageError('Each image upload must contain valid file data.');
  }
  let buffer;
  try {
    buffer = Buffer.from(upload.data, 'base64');
  } catch {
    throw imageError('An image upload could not be decoded.');
  }
  if (!buffer.length || buffer.length > MAX_PRODUCT_IMAGE_BYTES) throw imageError('Each image must be 5 MB or smaller.');
  if (!format.matches(buffer)) throw imageError(`The file ${cleanFileName(upload.fileName)} does not match its declared image type.`);
  return { buffer, contentType, extension: format.extension, fileName: cleanFileName(upload.fileName) };
}

async function productRecord(productId) {
  const rows = await supabaseRequest(`/rest/v1/products?id=eq.${encoded(productId)}&select=id,name&limit=1`, { useServiceRole: true });
  if (!rows?.[0]) throw imageError('The selected product is not available.', 404);
  return rows[0];
}

async function productImageRows(productId) {
  return supabaseRequest(`/rest/v1/product_images?product_id=eq.${encoded(productId)}&select=id,product_id,storage_key,public_url,alt_text,image_type,source,source_url,is_primary,verified,image_status,sort_order,active,created_at&order=is_primary.desc,sort_order.asc,created_at.asc`, { useServiceRole: true });
}

async function signedRecord(row) {
  let imageUrl = row.public_url || '';
  if (row.storage_key) {
    try {
      imageUrl = await supabaseStorageSignedUrl(PRODUCT_IMAGE_BUCKET, row.storage_key);
    } catch {
      imageUrl = row.public_url || '';
    }
  }
  return {
    id: row.id,
    productId: row.product_id,
    storageKey: row.storage_key,
    publicUrl: row.public_url || '',
    imageUrl,
    altText: row.alt_text || '',
    imageType: row.image_type || 'product',
    source: row.source || 'manual_upload',
    sourceUrl: row.source_url || '',
    isPrimary: row.is_primary === true,
    verified: row.verified === true,
    imageStatus: row.image_status || 'verified',
    sortOrder: row.sort_order ?? 0,
    active: row.active !== false,
  };
}

export async function listProductImages(productId) {
  return Promise.all((await productImageRows(productId)).map(signedRecord));
}

export async function uploadProductImages(productId, payload) {
  const product = await productRecord(productId);
  const uploads = Array.isArray(payload?.images) ? payload.images : [];
  if (!uploads.length || uploads.length > MAX_PRODUCT_IMAGE_COUNT) throw imageError(`Choose between 1 and ${MAX_PRODUCT_IMAGE_COUNT} images per upload.`);
  if (payload?.replaceImageId) return replaceProductImage(productId, payload.replaceImageId, uploads[0], product);
  const files = uploads.map(decodeUpload);
  const existing = await productImageRows(productId);
  const hasPrimary = existing.some((row) => row.is_primary === true && row.active !== false);
  const uploadedKeys = [];
  try {
    for (const [index, file] of files.entries()) {
      const key = `${productId}/${randomUUID()}.${file.extension}`;
      await supabaseStorageUpload(PRODUCT_IMAGE_BUCKET, key, file.buffer, file.contentType);
      uploadedKeys.push(key);
      const isPrimary = !hasPrimary && index === 0;
      const record = {
        product_id: productId,
        storage_key: key,
        public_url: supabaseStorageObjectUrl(PRODUCT_IMAGE_BUCKET, key),
        alt_text: product.name || file.fileName,
        image_type: 'product',
        source: 'manual_upload',
        source_url: null,
        is_primary: isPrimary,
        verified: true,
        image_status: 'verified',
        sort_order: existing.length + index,
        active: true,
      };
      await supabaseRequest('/rest/v1/product_images', {
        method: 'POST',
        useServiceRole: true,
        headers: { Prefer: 'return=representation' },
        body: [record],
      });
    }
  } catch (error) {
    await Promise.all(uploadedKeys.map((key) => supabaseStorageRemove(PRODUCT_IMAGE_BUCKET, key).catch(() => null)));
    throw error;
  }
  return listProductImages(productId);
}

async function replaceProductImage(productId, imageId, upload, product) {
  const rows = await productImageRows(productId);
  const current = rows.find((row) => String(row.id) === String(imageId));
  if (!current) throw imageError('The product image no longer exists.', 404);
  const file = decodeUpload(upload);
  const key = `${productId}/${randomUUID()}.${file.extension}`;
  await supabaseStorageUpload(PRODUCT_IMAGE_BUCKET, key, file.buffer, file.contentType);
  try {
    const updated = await supabaseRequest(`/rest/v1/product_images?id=eq.${encoded(imageId)}&product_id=eq.${encoded(productId)}`, {
      method: 'PATCH',
      useServiceRole: true,
      headers: { Prefer: 'return=representation' },
      body: {
        storage_key: key,
        public_url: supabaseStorageObjectUrl(PRODUCT_IMAGE_BUCKET, key),
        alt_text: product.name || file.fileName,
        image_type: 'product',
        source: 'manual_upload',
        source_url: null,
        verified: true,
        image_status: 'verified',
        active: true,
      },
    });
    if (current.storage_key) await supabaseStorageRemove(PRODUCT_IMAGE_BUCKET, current.storage_key).catch(() => null);
    return Promise.all((updated || [current]).map(signedRecord));
  } catch (error) {
    await supabaseStorageRemove(PRODUCT_IMAGE_BUCKET, key).catch(() => null);
    throw error;
  }
}

export async function setProductImagePrimary(productId, imageId) {
  const rows = await productImageRows(productId);
  const selected = rows.find((row) => String(row.id) === String(imageId) && row.active !== false);
  if (!selected) throw imageError('The product image no longer exists.', 404);
  await supabaseRequest(`/rest/v1/product_images?product_id=eq.${encoded(productId)}`, { method: 'PATCH', useServiceRole: true, body: { is_primary: false } });
  const updated = await supabaseRequest(`/rest/v1/product_images?id=eq.${encoded(imageId)}&product_id=eq.${encoded(productId)}`, {
    method: 'PATCH',
    useServiceRole: true,
    headers: { Prefer: 'return=representation' },
    body: { is_primary: true },
  });
  return Promise.all((updated || [selected]).map(signedRecord));
}

export async function deleteProductImage(productId, imageId) {
  const rows = await productImageRows(productId);
  const selected = rows.find((row) => String(row.id) === String(imageId));
  if (!selected) throw imageError('The product image no longer exists.', 404);
  let storageDeleted = true;
  if (selected.storage_key) {
    try {
      await supabaseStorageRemove(PRODUCT_IMAGE_BUCKET, selected.storage_key);
    } catch {
      storageDeleted = false;
    }
  }
  await supabaseRequest(`/rest/v1/product_images?id=eq.${encoded(imageId)}&product_id=eq.${encoded(productId)}`, { method: 'DELETE', useServiceRole: true });
  if (selected.is_primary) {
    const remaining = rows.find((row) => String(row.id) !== String(imageId) && row.active !== false);
    if (remaining) await supabaseRequest(`/rest/v1/product_images?id=eq.${encoded(remaining.id)}&product_id=eq.${encoded(productId)}`, { method: 'PATCH', useServiceRole: true, body: { is_primary: true } });
  }
  return { storageDeleted, images: await listProductImages(productId) };
}
