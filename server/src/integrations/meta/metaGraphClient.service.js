import { URLSearchParams } from 'node:url';
import { assertMetaConfigured, getMetaConfig } from './metaConfig.service.js';

function buildGraphUrl(pathname, query = {}) {
  const { graphApiVersion } = getMetaConfig();
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  });
  return `https://graph.facebook.com/${graphApiVersion}${path}?${params.toString()}`;
}

export async function metaGraphRequest(pathname, { method = 'GET', accessToken = '', body, query, timeoutMs = 10000 } = {}) {
  assertMetaConfigured();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = { Accept: 'application/json' };

  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body && !(body instanceof URLSearchParams)) headers['Content-Type'] = 'application/json';

  try {
    const response = await fetch(buildGraphUrl(pathname, query), {
      method,
      headers,
      body: body instanceof URLSearchParams ? body : body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const providerMessage = payload?.error?.message || 'Meta request failed';
      throw Object.assign(new Error(providerMessage), {
        status: response.status,
        code: payload?.error?.code || 'META_REQUEST_FAILED',
        subcode: payload?.error?.error_subcode || '',
        providerPayload: payload?.error || {}
      });
    }

    return payload;
  } finally {
    clearTimeout(timer);
  }
}

export async function exchangeMetaCodeForToken(code) {
  const config = assertMetaConfigured();
  return metaGraphRequest('/oauth/access_token', {
    query: {
      client_id: config.appId,
      client_secret: config.appSecret,
      redirect_uri: config.redirectUri,
      code
    }
  });
}
