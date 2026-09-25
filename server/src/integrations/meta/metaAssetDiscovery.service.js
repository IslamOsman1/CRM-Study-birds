import { metaGraphRequest, metaGraphList } from './metaGraphClient.service.js';
import { getMetaConfig } from './metaConfig.service.js';

export const whatsappPermissions = ['whatsapp_business_management', 'whatsapp_business_messaging'];

export function assertWhatsAppPermissions(scopes = []) {
  const missing = whatsappPermissions.filter(scope => !scopes.includes(scope));
  if (missing.length) throw Object.assign(new Error(`Missing WhatsApp permissions: ${missing.join(', ')}`), { status: 403 });
}

export async function discoverMetaAssets(accessToken, { wabaId = '' } = {}) {
  const warnings = [];
  const optional = async (operation, action, fallback) => {
    try { return await action(); } catch (error) {
      const warning = { operation, code: error.code || 'META_DISCOVERY_FAILED', message: error.message };
      console.warn('[meta-discovery]', warning);
      warnings.push(warning);
      return fallback;
    }
  };
  const me = await metaGraphRequest('/me', {
    accessToken,
    query: { fields: 'id,name' }
  });

  const pages = await optional('pages', () => metaGraphList('/me/accounts', {
    accessToken,
    query: {
      fields: 'id,name,access_token,instagram_business_account{id,username,profile_picture_url},tasks'
    }
  }), []);

  const businesses = await optional('businesses', () => metaGraphList('/me/businesses', {
    accessToken,
    query: { fields: 'id,name' }
  }), []);

  const config = getMetaConfig();
  const tokenInfo = await optional('token_permissions', () => metaGraphRequest('/debug_token', {
    accessToken: `${config.appId}|${config.appSecret}`,
    query: { input_token: accessToken }
  }), null);
  const validToken = tokenInfo?.data?.is_valid === true && String(tokenInfo.data.app_id) === config.appId;
  const scopes = validToken ? tokenInfo.data.scopes || [] : [];
  const missingPermissions = whatsappPermissions.filter(scope => !scopes.includes(scope));
  if (missingPermissions.length) warnings.push({ operation: 'whatsapp_permissions', code: 'MISSING_PERMISSIONS', message: `صلاحيات واتساب غير مؤكدة: ${missingPermissions.join(', ')}` });

  const whatsappAssets = [];
  const accounts = new Map();
  const addAccount = (account, business = {}) => {
    if (account.id && !accounts.has(String(account.id))) accounts.set(String(account.id), { ...account, business });
  };

  for (const business of businesses) {
    for (const edge of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts']) {
      const found = await optional(`${business.id}/${edge}`, () => metaGraphList(`/${business.id}/${edge}`, {
        accessToken, query: { fields: 'id,name' }
      }), []);
      found.forEach(account => addAccount(account, business));
    }
  }

  // Embedded Signup tokens can grant WABA access without listing its business.
  const targetIds = validToken ? (tokenInfo.data.granular_scopes || [])
    .filter(item => item.scope === 'whatsapp_business_management')
    .flatMap(item => item.target_ids || []) : [];
  if (wabaId) targetIds.push(wabaId);
  for (const id of new Set(targetIds.map(String))) {
    if (!/^\d+$/.test(id) || accounts.has(id)) continue;
    const account = await optional(`waba/${id}`, () => metaGraphRequest(`/${id}`, {
      accessToken, query: { fields: 'id,name' }
    }), null);
    if (account) addAccount(account);
  }

  for (const account of accounts.values()) {
    const business = account.business;
    const phones = await optional(`waba/${account.id}/phone_numbers`, () => metaGraphList(`/${account.id}/phone_numbers`, {
      accessToken, query: { fields: 'id,display_phone_number,verified_name' }
    }), []);
    // Keep all returned numbers, including Business App / Coexistence numbers.
    // Platform type and verification status are not discovery filters.
    for (const phone of phones) {
        whatsappAssets.push({
          channelType: 'whatsapp',
          externalBusinessId: business.id,
          metaBusinessId: business.id,
          whatsappBusinessAccountId: account.id,
          pageId: '',
          pageName: '',
          instagramAccountId: '',
          instagramUsername: '',
          phoneNumberId: phone.id,
          displayPhoneNumber: phone.display_phone_number || '',
          verifiedName: phone.verified_name || account.name || '',
          status: 'pending',
          waba_id: account.id,
          phone_number_id: phone.id,
          display_phone_number: phone.display_phone_number || '',
          permissions: scopes.filter(scope => whatsappPermissions.includes(scope)),
          metadata: {
            businessName: business.name || '',
            whatsappBusinessName: account.name || ''
          }
        });
    }
  }

  const messengerAssets = [];
  const instagramAssets = [];

  for (const page of pages) {
    messengerAssets.push({
      channelType: 'facebook',
      externalAccountId: page.id,
      pageId: page.id,
      pageName: page.name || '',
      pageAccessToken: page.access_token || '',
      status: 'pending',
      permissions: page.tasks || [],
      metadata: {}
    });

    if (page.instagram_business_account?.id) {
      instagramAssets.push({
        channelType: 'instagram',
        externalAccountId: page.instagram_business_account.id,
        pageId: page.id,
        pageName: page.name || '',
        pageAccessToken: page.access_token || '',
        instagramAccountId: page.instagram_business_account.id,
        instagramUsername: page.instagram_business_account.username || '',
        profilePictureUrl: page.instagram_business_account.profile_picture_url || '',
        status: 'pending',
        permissions: page.tasks || [],
        metadata: {}
      });
    }
  }

  return {
    user: me,
    scopes,
    warnings,
    missingPermissions,
    businesses,
    pages: messengerAssets,
    instagramAccounts: instagramAssets,
    whatsappAccounts: whatsappAssets
  };
}
