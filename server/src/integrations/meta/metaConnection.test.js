import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeMetaAssets } from './metaWebhookSubscription.service.js';
import { assertWhatsAppPermissions, discoverMetaAssets, whatsappPermissions } from './metaAssetDiscovery.service.js';
import { createMetaOauthState, consumeMetaOauthState } from './metaOAuth.service.js';
import { metaGraphRequest } from './metaGraphClient.service.js';

function setup(t, handler) {
  for (const key of ['META_APP_ID', 'META_APP_SECRET', 'META_VERIFY_TOKEN', 'META_REDIRECT_URI']) {
    const previous = process.env[key];
    process.env[key] = 'test-only';
    t.after(() => previous === undefined ? delete process.env[key] : process.env[key] = previous);
  }
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const payload = await handler(new URL(url), options);
    return { ok: !payload.error, status: payload.error ? 403 : 200, json: async () => payload };
  });
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
}

test('subscribes linked pages and WABAs once with the correct tokens', async t => {
  const calls = [];
  setup(t, (url, options) => {
    calls.push({ url, ...options });
    return { success: true };
  });
  await subscribeMetaAssets([
    { channelType: 'facebook', pageId: 'page', pageAccessToken: 'page-token' },
    { channelType: 'instagram', pageId: 'page', pageAccessToken: 'page-token' },
    { channelType: 'whatsapp', whatsappBusinessAccountId: 'waba', phoneNumberId: 'phone1' },
    { channelType: 'whatsapp', whatsappBusinessAccountId: 'waba', phoneNumberId: 'phone2' }
  ], 'user-token');
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.pathname.endsWith('/page/subscribed_apps'));
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.Authorization, 'Bearer page-token');
  assert.deepEqual(JSON.parse(calls[0].body), { subscribed_fields: ['messages'] });
  assert.ok(calls[1].url.pathname.endsWith('/waba/subscribed_apps'));
  assert.equal(calls[1].headers.Authorization, 'Bearer user-token');
});

test('rejects missing Page tokens before making requests', async t => {
  setup(t, () => assert.fail('Must not call Meta without a Page token'));
  await assert.rejects(subscribeMetaAssets([{ channelType: 'facebook', pageId: 'page' }], 'user-token'), /Missing/);
});

test('propagates permission failures and unconfirmed subscriptions', async t => {
  let payload = { error: { message: 'Permission denied', code: 200 } };
  setup(t, () => payload);
  const assets = [{ channelType: 'whatsapp', whatsappBusinessAccountId: 'waba' }];
  await assert.rejects(subscribeMetaAssets(assets, 'token'), /Permission denied/);
  payload = { success: false };
  await assert.rejects(subscribeMetaAssets(assets, 'token'), /did not confirm/);
});

test('discovers phone numbers from the Graph API nested data collection', async t => {
  setup(t, url => {
    if (url.pathname.endsWith('/me/accounts')) return { data: [] };
    if (url.pathname.endsWith('/me/businesses')) return { data: [{ id: 'business' }] };
    if (url.pathname.endsWith('/owned_whatsapp_business_accounts')) {
      return { data: [{ id: 'waba' }] };
    }
    if (url.pathname.endsWith('/waba/phone_numbers')) return { data: [{ id: 'phone', display_phone_number: '+123456789' }] };
    if (url.pathname.endsWith('/me')) return { id: 'user' };
    return { data: [] };
  });
  const result = await discoverMetaAssets('token');
  assert.equal(result.whatsappAccounts.length, 1);
  assert.equal(result.whatsappAccounts[0].phoneNumberId, 'phone');
  assert.equal(result.whatsappAccounts[0].whatsappBusinessAccountId, 'waba');
});

const targetWaba = '1009302038569191';
const targetPhone = { id: '1235463112988868', display_phone_number: '+201034426659', platform_type: 'CLOUD_API', is_on_biz_app: true, status: 'CONNECTED' };
const debugToken = { data: { is_valid: true, app_id: 'test-only', scopes: whatsappPermissions } };

test('discovers a shared Coexistence number across business and phone pagination without duplicates', async t => {
  setup(t, url => {
    const path = url.pathname;
    const after = url.searchParams.get('after');
    if (path.endsWith('/me')) return { id: 'user' };
    if (path.endsWith('/debug_token')) return debugToken;
    if (path.endsWith('/me/businesses')) return after
      ? { data: [{ id: 'business' }] }
      : { data: [], paging: { next: 'https://graph.facebook.com/next', cursors: { after: 'next-business' } } };
    if (path.endsWith('/client_whatsapp_business_accounts')) return { data: [{ id: targetWaba }] };
    if (path.endsWith(`/${targetWaba}/phone_numbers`)) return after
      ? { data: [targetPhone] }
      : { data: [{ id: 'old', display_phone_number: '+201034426650' }], paging: { next: 'https://graph.facebook.com/next', cursors: { after: 'next-phone' } } };
    return { data: [] };
  });
  const result = await discoverMetaAssets('token', { wabaId: targetWaba });
  const target = result.whatsappAccounts.filter(item => item.phoneNumberId === targetPhone.id);
  assert.equal(target.length, 1);
  assert.equal(target[0].waba_id, targetWaba);
  assert.equal(target[0].display_phone_number, targetPhone.display_phone_number);
  assert.deepEqual(result.missingPermissions, []);
});

test('uses token-scoped WABA IDs when business and Page discovery are unavailable', async t => {
  setup(t, url => {
    if (url.pathname.endsWith('/me')) return { id: 'user' };
    if (url.pathname.endsWith('/debug_token')) return { data: { ...debugToken.data, granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: [targetWaba] }] } };
    if (url.pathname.endsWith(`/${targetWaba}`)) return { id: targetWaba };
    if (url.pathname.endsWith(`/${targetWaba}/phone_numbers`)) return { data: [targetPhone] };
    return { error: { message: 'Business permission denied', code: 200 } };
  });
  const result = await discoverMetaAssets('token');
  assert.equal(result.whatsappAccounts[0].phoneNumberId, targetPhone.id);
  assert.equal(result.warnings.length, 2);
  assert.equal(console.error.mock.callCount(), 2);
});

test('explicit WABA hint still requires API access and never fabricates the target phone', async t => {
  setup(t, url => {
    if (url.pathname.endsWith('/me')) return { id: 'user' };
    if (url.pathname.endsWith('/debug_token')) return debugToken;
    if (url.pathname.endsWith(`/${targetWaba}`)) return { error: { message: 'Account inaccessible', code: 100 } };
    return { data: [] };
  });
  const result = await discoverMetaAssets('token', { wabaId: targetWaba });
  assert.equal(result.whatsappAccounts.length, 0);
  assert.ok(result.warnings.some(item => item.message === 'Account inaccessible'));
});

test('permissions must be granted, not assumed from requested OAuth scopes', () => {
  assert.throws(() => assertWhatsAppPermissions(['whatsapp_business_management']), /whatsapp_business_messaging/);
  assert.doesNotThrow(() => assertWhatsAppPermissions(whatsappPermissions));
});

test('WABA hint is bound to the authenticated OAuth state', () => {
  const db = {};
  const state = createMetaOauthState(db, { companyId: 'company', sub: 'admin' }, ['whatsapp'], targetWaba);
  const record = consumeMetaOauthState(db, state);
  assert.equal(record.companyId, 'company');
  assert.equal(record.wabaId, targetWaba);
  assert.throws(() => createMetaOauthState(db, {}, [], '../other'), /digits/);
});

test('connecting only the selected WABA makes no Page or phone mutation requests', async t => {
  const calls = [];
  setup(t, (url, options) => {
    calls.push({ path: url.pathname, method: options.method });
    return { success: true };
  });
  await subscribeMetaAssets([{ channelType: 'whatsapp', whatsappBusinessAccountId: targetWaba, phoneNumberId: targetPhone.id }], 'token');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].path.endsWith(`/${targetWaba}/subscribed_apps`));
  assert.equal(calls[0].method, 'POST');
});

test('explicit WABA hint returns the real phone even when business lists are empty', async t => {
  setup(t, url => {
    if (url.pathname.endsWith('/me')) return { id: 'user' };
    if (url.pathname.endsWith('/debug_token')) return debugToken;
    if (url.pathname.endsWith(`/${targetWaba}`)) return { id: targetWaba };
    if (url.pathname.endsWith(`/${targetWaba}/phone_numbers`)) return { data: [targetPhone] };
    return { data: [] };
  });
  const result = await discoverMetaAssets('token', { wabaId: targetWaba });
  assert.equal(result.whatsappAccounts.length, 1);
  assert.equal(result.whatsappAccounts[0].phone_number_id, targetPhone.id);
});

test('API error logs contain diagnostics without access tokens or secrets', async t => {
  setup(t, () => ({ error: { message: 'Denied private-token test-only', code: 190, fbtrace_id: 'trace' } }));
  await assert.rejects(metaGraphRequest('/me', { accessToken: 'private-token' }), /Denied/);
  const logged = JSON.stringify(console.error.mock.calls[0].arguments);
  assert.ok(logged.includes('190'));
  assert.ok(logged.includes('trace'));
  assert.ok(!logged.includes('private-token'));
  assert.ok(!logged.includes('test-only'));
});
