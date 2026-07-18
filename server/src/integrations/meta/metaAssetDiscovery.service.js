import { metaGraphRequest } from './metaGraphClient.service.js';

export async function discoverMetaAssets(accessToken) {
  const me = await metaGraphRequest('/me', {
    accessToken,
    query: { fields: 'id,name' }
  });

  const pagesResponse = await metaGraphRequest('/me/accounts', {
    accessToken,
    query: {
      fields: 'id,name,access_token,instagram_business_account{id,username,profile_picture_url},tasks'
    }
  });

  const businessesResponse = await metaGraphRequest('/me/businesses', {
    accessToken,
    query: { fields: 'id,name' }
  }).catch(() => ({ data: [] }));

  const whatsappAssets = [];

  for (const business of businessesResponse.data || []) {
    const wabaResponse = await metaGraphRequest(`/${business.id}/owned_whatsapp_business_accounts`, {
      accessToken,
      query: {
        fields: 'id,name,phone_numbers{id,display_phone_number,verified_name}'
      }
    }).catch(() => ({ data: [] }));

    for (const account of wabaResponse.data || []) {
      for (const phone of account.phone_numbers || []) {
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
          permissions: ['whatsapp_business_messaging', 'whatsapp_business_management'],
          metadata: {
            businessName: business.name || '',
            whatsappBusinessName: account.name || ''
          }
        });
      }
    }
  }

  const messengerAssets = [];
  const instagramAssets = [];

  for (const page of pagesResponse.data || []) {
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
    scopes: [],
    businesses: businessesResponse.data || [],
    pages: messengerAssets,
    instagramAccounts: instagramAssets,
    whatsappAccounts: whatsappAssets
  };
}
