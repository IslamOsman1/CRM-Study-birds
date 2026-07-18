export function getMetaConfig() {
  return {
    appId: process.env.META_APP_ID || '',
    appSecret: process.env.META_APP_SECRET || '',
    configId: process.env.META_CONFIG_ID || '',
    verifyToken: process.env.META_VERIFY_TOKEN || '',
    graphApiVersion: process.env.META_GRAPH_API_VERSION || 'v22.0',
    redirectUri: process.env.META_REDIRECT_URI || '',
    webhookUrl: process.env.META_WEBHOOK_URL || '',
    clientOrigin: process.env.CLIENT_ORIGIN || ''
  };
}

export function assertMetaConfigured() {
  const config = getMetaConfig();
  const missing = ['appId', 'appSecret', 'verifyToken', 'redirectUri']
    .filter(key => !config[key]);

  if (missing.length) {
    throw Object.assign(new Error(`Meta app is not configured بالكامل: ${missing.join(', ')}`), {
      status: 503,
      code: 'META_NOT_CONFIGURED'
    });
  }

  return config;
}
