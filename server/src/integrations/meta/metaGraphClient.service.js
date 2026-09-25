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
    const payload = await response.json();

    if (!response.ok || payload?.error) {
      const providerMessage = payload?.error?.message || 'Meta request failed';
      throw Object.assign(new Error(providerMessage), {
        status: response.status,
        code: payload?.error?.code || 'META_REQUEST_FAILED',
        subcode: payload?.error?.error_subcode || '',
        providerPayload: payload?.error || {}
      });
    }

    return payload;
  } catch (error) {
    // Never log request URLs, query strings, bodies, or bearer tokens.
    let message = String(error.message || 'Meta request failed');
    for (const secret of [accessToken, getMetaConfig().appSecret, query?.input_token, query?.code]) {
      if (secret) message = message.split(String(secret)).join('[redacted]');
    }
    error.message = message;
    console.error('[meta-api] request failed', {
      path: pathname.split('?')[0], method, status: error.status || 0,
      code: error.code || error.name, subcode: error.subcode || '', message,
      traceId: error.providerPayload?.fbtrace_id || ''
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function metaGraphList(pathname, { accessToken, query = {} }) {
  const items = [];
  const seen = new Set();
  let after;
  do {
    const page = await metaGraphRequest(pathname, { accessToken, query: { ...query, after } });
    if (!Array.isArray(page.data)) throw new Error(`Invalid Meta collection: ${pathname}`);
    items.push(...page.data);
    after = page.paging?.next ? page.paging?.cursors?.after : undefined;
    if (page.paging?.next && (!after || seen.has(after))) {
      throw new Error(`Invalid Meta pagination: ${pathname}`);
    }
    if (after) seen.add(after);
  } while (after);
  return items;
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
