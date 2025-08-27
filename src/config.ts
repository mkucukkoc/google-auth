export const config = {
  port: Number(process.env.PORT || 4000),
  corsOrigin: (process.env.CORS_ORIGIN || '*').split(','),
  jwt: {
    iss: process.env.JWT_ISS || 'chatgbtmini',
    aud: process.env.JWT_AUD || 'chatgbtmini-mobile',
    hsSecret: process.env.JWT_HS_SECRET || 'change_me',
    accessTtlMin: Number(process.env.JWT_ACCESS_TTL_MIN || 15),
  },
  refreshTtlDays: Number(process.env.REFRESH_TTL_DAYS || 365),
  redisUrl: process.env.REDIS_URL || 'redis://red-d2nf9m7diees73cjdo40:6379',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'https://google-auth-e4er.onrender.com/auth/google/callback',
  },
};



