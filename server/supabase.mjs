function config() {
  return {
    url: String(process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    anonKey: String(process.env.SUPABASE_ANON_KEY || ''),
    serviceRoleKey: String(process.env.SUPABASE_SERVICE_ROLE_KEY || ''),
  };
}

export function supabasePublicConfig() {
  const { url, anonKey } = config();
  return {
    enabled: Boolean(url && anonKey),
    url,
    anonKey,
  };
}

function makeError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function supabaseRequest(path, options = {}) {
  const { url, anonKey, serviceRoleKey } = config();
  if (!url || !anonKey) throw makeError('Supabase is not configured.', 503);
  const useServiceRole = options.useServiceRole === true;
  const key = useServiceRole ? serviceRoleKey : anonKey;
  if (useServiceRole && !serviceRoleKey) throw makeError('Supabase service-role access is not configured on the server.', 503);
  const accessToken = options.accessToken || (useServiceRole ? serviceRoleKey : '');
  const headers = {
    apikey: key,
    Authorization: `Bearer ${accessToken || key}`,
    Accept: 'application/json',
    ...(options.headers || {}),
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${url}${path.startsWith('/') ? path : `/${path}`}`, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(Number(process.env.SUPABASE_TIMEOUT_MS || 10000)),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = typeof data === 'object' && data ? data.message || data.error_description || data.error : data;
    throw makeError(String(message || `Supabase request failed with HTTP ${response.status}.`), response.status);
  }
  return data;
}

function storagePath(path) {
  return String(path || '').split('/').filter(Boolean).map((part) => encodeURIComponent(part)).join('/');
}

function storageUrl(path) {
  const { url } = config();
  return `${url}/storage/v1${path.startsWith('/') ? path : `/${path}`}`;
}

export function supabaseStorageObjectUrl(bucket, key) {
  return storageUrl(`/object/${encodeURIComponent(bucket)}/${storagePath(key)}`);
}

export async function supabaseStorageRequest(path, options = {}) {
  const { url, anonKey, serviceRoleKey } = config();
  if (!url || !anonKey) throw makeError('Supabase is not configured.', 503);
  const useServiceRole = options.useServiceRole !== false;
  const key = useServiceRole ? serviceRoleKey : anonKey;
  if (useServiceRole && !serviceRoleKey) throw makeError('Supabase service-role access is not configured on the server.', 503);
  const headers = {
    apikey: key,
    Authorization: `Bearer ${options.accessToken || key}`,
    Accept: 'application/json',
    ...(options.headers || {}),
  };
  if (options.contentType) headers['Content-Type'] = options.contentType;
  else if (options.json !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(storageUrl(path), {
    method: options.method || 'GET',
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
    signal: AbortSignal.timeout(Number(process.env.SUPABASE_TIMEOUT_MS || 10000)),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = typeof data === 'object' && data ? data.message || data.error || data.statusCode : data;
    throw makeError(String(message || `Supabase Storage request failed with HTTP ${response.status}.`), response.status);
  }
  return data;
}

export async function supabaseStorageUpload(bucket, key, body, contentType) {
  return supabaseStorageRequest(`/object/${encodeURIComponent(bucket)}/${storagePath(key)}`, {
    method: 'POST',
    body,
    contentType,
    headers: { 'x-upsert': 'false', 'cache-control': '31536000' },
  });
}

export async function supabaseStorageRemove(bucket, key) {
  return supabaseStorageRequest(`/object/remove/${encodeURIComponent(bucket)}`, {
    method: 'POST',
    json: { prefixes: [String(key)] },
  });
}

export async function supabaseStorageSignedUrl(bucket, key, expiresIn = 3600) {
  const data = await supabaseStorageRequest(`/object/sign/${encodeURIComponent(bucket)}/${storagePath(key)}`, {
    method: 'POST',
    json: { expiresIn },
  });
  const signedUrl = data?.signedURL || data?.signedUrl || data?.signed_url || '';
  if (!signedUrl) return '';
  return /^https?:\/\//i.test(signedUrl) ? signedUrl : `${config().url}${signedUrl.startsWith('/') ? '' : '/'}${signedUrl}`;
}

export async function getSupabaseUser(accessToken) {
  if (!accessToken) throw makeError('A Supabase access token is required.', 401);
  const user = await supabaseRequest('/auth/v1/user', { accessToken });
  let role = user?.app_metadata?.role === 'admin' ? 'admin' : 'customer';
  let isActive = true;
  const { serviceRoleKey } = config();
  if (serviceRoleKey && user?.id) {
    const rows = await supabaseRequest(`/rest/v1/users?id=eq.${encodeURIComponent(user.id)}&select=role,is_active&limit=1`, { useServiceRole: true });
    if (rows?.[0]) {
      role = rows[0].role || role;
      isActive = rows[0].is_active !== false;
    }
  }
  if (!isActive) throw makeError('This account is inactive.', 403);
  return { user, role, isActive, accessToken };
}

export async function requireSupabaseUser(request, options = {}) {
  const header = String(request.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw makeError('Authentication is required.', 401);
  const auth = await getSupabaseUser(match[1]);
  if (options.admin === true && auth.role !== 'admin') throw makeError('Administrator access is required.', 403);
  return auth;
}
