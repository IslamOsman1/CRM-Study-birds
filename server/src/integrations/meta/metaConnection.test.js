import test from 'node:test';
import assert from 'node:assert/strict';
import { subscribeMetaAssets } from './metaWebhookSubscription.service.js';
import { discoverMetaAssets } from './metaAssetDiscovery.service.js';

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
      return { data: [{ id: 'waba', phone_numbers: { data: [{ id: 'phone', display_phone_number: '+123456789' }] } }] };
    }
    return { id: 'user' };
  });
  const result = await discoverMetaAssets('token');
  assert.equal(result.whatsappAccounts.length, 1);
  assert.equal(result.whatsappAccounts[0].phoneNumberId, 'phone');
  assert.equal(result.whatsappAccounts[0].whatsappBusinessAccountId, 'waba');
});
