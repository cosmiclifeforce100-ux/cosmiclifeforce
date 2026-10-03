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
