export default () => ({
  port: parseInt(process.env.API_PORT || '3000', 10),
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  supabase: {
    url: process.env.SUPABASE_URL || 'https://qvfdgxzgdumlralmvszc.supabase.co',
    endpointUrl: process.env.SUPABASE_S3_ENDPOINT || process.env.MINIO_ENDPOINT_URL || 'https://qvfdgxzgdumlralmvszc.storage.supabase.co/storage/v1/s3',
    accessKey: process.env.SUPABASE_S3_ACCESS_KEY || process.env.MINIO_ACCESS_KEY || '',
    secretKey: process.env.SUPABASE_S3_SECRET_KEY || process.env.MINIO_SECRET_KEY || '',
    bucket: process.env.SUPABASE_BUCKET || process.env.MINIO_BUCKET || 'multinegocio',
    region: process.env.SUPABASE_S3_REGION || process.env.MINIO_REGION || 'us-east-1',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-jwt-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-jwt-refresh-secret',
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  },
});
