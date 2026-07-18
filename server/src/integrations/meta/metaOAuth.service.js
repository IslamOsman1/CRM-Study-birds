import { createHash, randomBytes } from 'node:crypto';
import { getMetaConfig } from './metaConfig.service.js';

function stateHash(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function createMetaOauthState(db, user, providerTargets = ['whatsapp', 'facebook', 'instagram']) {
  const state = randomBytes(24).toString('hex');
  db.oauthStates ||= [];
  db.oauthStates.push({
    id: randomBytes(12).toString('hex'),
    companyId: user.companyId,
    userId: user.sub,
    provider: 'meta',
    stateHash: stateHash(state),
    targets: providerTargets,
    expiresAt: Date.now() + 10 * 60 * 1000,
    usedAt: 0,
    createdAt: new Date().toISOString()
  });

  return state;
}

export function consumeMetaOauthState(db, state) {
  db.oauthStates ||= [];
  const hash = stateHash(state);
  const record = db.oauthStates.find(item => item.provider === 'meta' && item.stateHash === hash);

  if (!record || record.usedAt || record.expiresAt < Date.now()) {
    throw Object.assign(new Error('Meta OAuth state is invalid or expired'), {
      status: 400,
      code: 'META_STATE_INVALID'
    });
  }

  record.usedAt = Date.now();
  return record;
}

export function buildMetaOauthUrl(state) {
  const config = getMetaConfig();
  const scopes = [
    'business_management',
    'pages_show_list',
    'pages_manage_metadata',
    'pages_messaging',
    'instagram_basic',
    'instagram_manage_messages',
    'whatsapp_business_management',
    'whatsapp_business_messaging'
  ].join(',');

  const url = new URL('https://www.facebook.com/dialog/oauth');
  url.searchParams.set('client_id', config.appId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes);
  if (config.configId) url.searchParams.set('config_id', config.configId);

  return url.toString();
}
