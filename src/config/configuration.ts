export default () => ({
  port: parseInt(process.env.API_PORT || '3000', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.KV_URL || process.env.REDIS_URL || '',
  },
  r2: {
    endpointUrl: process.env.R2_ENDPOINT || '',
    accessKey: process.env.R2_ACCESS_KEY_ID || '',
    secretKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || process.env.MINIO_BUCKET || 'multinegocio',
    publicUrl: process.env.R2_PUBLIC_URL || '',
    region: process.env.R2_REGION || 'auto',
  },
  jwt: {
    secret: process.env.JWT_SECRET || '',
    refreshSecret: process.env.JWT_REFRESH_SECRET || '',
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },
  meta: {
    token: process.env.META_WHATSAPP_TOKEN || '',
    phoneNumberId: process.env.META_WHATSAPP_PHONE_NUMBER_ID || '',
    verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || '',
    apiVersion: process.env.META_API_VERSION || 'v22.0',
    baseUrl: process.env.META_API_BASE_URL || 'https://graph.facebook.com',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    baseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
    fallbackModels: (process.env.GEMINI_FALLBACK_MODELS || '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean),
  },
  mercadolivre: {
    appId: process.env.MERCADOLIVRE_APP_ID || '',
    secret: process.env.MERCADOLIVRE_SECRET || '',
    redirectUri: process.env.MERCADOLIVRE_REDIRECT_URI || '',
  },
});
