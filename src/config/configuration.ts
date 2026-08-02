export default () => ({
  port: parseInt(process.env.API_PORT || '3000', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.KV_URL || process.env.REDIS_URL || '',
  },
  supabase: {
    url: process.env.SUPABASE_URL || '',
    endpointUrl: process.env.SUPABASE_S3_ENDPOINT || process.env.MINIO_ENDPOINT_URL || '',
    accessKey: process.env.SUPABASE_S3_ACCESS_KEY || process.env.MINIO_ACCESS_KEY || '',
    secretKey: process.env.SUPABASE_S3_SECRET_KEY || process.env.MINIO_SECRET_KEY || '',
    bucket: process.env.SUPABASE_BUCKET || process.env.MINIO_BUCKET || 'multinegocio',
    region: process.env.SUPABASE_S3_REGION || process.env.MINIO_REGION || 'us-east-1',
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
  },
});
