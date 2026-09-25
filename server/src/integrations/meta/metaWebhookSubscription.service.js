import { metaGraphRequest } from './metaGraphClient.service.js';

// Facebook Login connects both Messenger and Instagram through the linked Page.
export async function subscribeMetaAssets(assets, accessToken) {
  const subscriptions = new Map();
  for (const asset of assets) {
    const isWhatsApp = asset.channelType === 'whatsapp';
    const id = isWhatsApp ? asset.whatsappBusinessAccountId : asset.pageId;
    const token = isWhatsApp ? accessToken : asset.pageAccessToken;
    if (!id || !token) {
      throw Object.assign(new Error('Missing account ID or access token for Meta webhook subscription'), { status: 400 });
    }
    subscriptions.set(`${isWhatsApp ? 'waba' : 'page'}:${id}`, { id, token, isWhatsApp });
  }

  for (const { id, token, isWhatsApp } of subscriptions.values()) {
    const result = await metaGraphRequest(`/${id}/subscribed_apps`, {
      method: 'POST',
      accessToken: token,
      body: isWhatsApp ? undefined : { subscribed_fields: ['messages'] }
    });
    if (result.success !== true) {
      throw Object.assign(new Error('Meta did not confirm the webhook subscription'), { status: 502 });
    }
  }
}
