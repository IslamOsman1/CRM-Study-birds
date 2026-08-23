const API_BASE = import.meta.env.VITE_API_URL || '';

export async function api(path, options = {}) {
  const token = localStorage.getItem('eduglobal_token');
  const headers = new Headers(options.headers || {});

  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!(options.body instanceof FormData) && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (response.status === 204) return null;

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'فشل تنفيذ الطلب');

  return data;
}

export async function apiDownload(path, options = {}) {
  const token = localStorage.getItem('eduglobal_token');
  const headers = new Headers(options.headers || {});

  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!(options.body instanceof FormData) && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'فشل تنزيل الملف');
  }

  return response.blob();
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
