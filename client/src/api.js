const API_BASE = import.meta.env.VITE_API_URL || '';
export const AUTH_EXPIRED_EVENT = 'eduglobal:auth-expired';

function parseTokenExpiry(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const decoded = atob(padded);
    const { exp } = JSON.parse(decoded);
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function notifySessionExpired(message) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { message } }));
}

function ensureActiveSession(token) {
  if (!token) return;

  const expiresAt = parseTokenExpiry(token);
  if (expiresAt && Date.now() >= expiresAt) {
    notifySessionExpired('انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى');
    throw new Error('انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى');
  }
}

function applyAuthHeader(headers, token) {
  if (token) headers.set('Authorization', `Bearer ${token}`);
}

function applyJsonHeader(headers, options) {
  if (!(options.body instanceof FormData) && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
}

export async function api(path, options = {}) {
  const token = localStorage.getItem('eduglobal_token');
  ensureActiveSession(token);

  const headers = new Headers(options.headers || {});
  applyAuthHeader(headers, token);
  applyJsonHeader(headers, options);

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) {
      notifySessionExpired(data.message || 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى');
    }
    throw new Error(data.message || 'فشل تنفيذ الطلب');
  }

  return data;
}

export async function apiDownload(path, options = {}) {
  const token = localStorage.getItem('eduglobal_token');
  ensureActiveSession(token);

  const headers = new Headers(options.headers || {});
  applyAuthHeader(headers, token);
  applyJsonHeader(headers, options);

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      notifySessionExpired(data.message || 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى');
    }
    throw new Error(data.message || 'فشل تنزيل الملف');
  }

  return response.blob();
}

export function resolveFileUrl(file) {
  if (!file?.url) return '';

  const rawUrl = String(file.url).trim();
  if (!rawUrl) return '';

  if (file.storageProvider === 'cloudinary') {
    const proxyUrl = new URL(`${API_BASE || window.location.origin}/api/cloudinary-file`, window.location.origin);
    proxyUrl.searchParams.set('url', rawUrl);
    proxyUrl.searchParams.set('filename', file.originalName || file.fileName || 'file');
    return proxyUrl.toString();
  }

  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  return `${API_BASE}${rawUrl}`;
}

export const formatMoney = (value, currency = 'USD') =>
  new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0
  }).format(Number(value || 0));

export const formatDate = value =>
  value
    ? new Intl.DateTimeFormat('ar-EG', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).format(new Date(value))
    : '—';

export const initials = name =>
  String(name || '?')
    .split(' ')
    .map(part => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
