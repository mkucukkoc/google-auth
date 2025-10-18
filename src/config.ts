export const config = {
  port: Number(process.env.PORT || 4000),
  corsOrigin: (process.env.CORS_ORIGIN || '*').split(','),
  jwt: {
    iss: process.env.JWT_ISS || 'chatgbtmini',
    aud: process.env.JWT_AUD || 'chatgbtmini-mobile',
    hsSecret: process.env.JWT_HS_SECRET || 'change_me_in_production',
    accessTtlMin: Number(process.env.JWT_ACCESS_TTL_MIN || 120), // 2 saat (120 dakika)
  },
  refreshTtlDays: Number(process.env.REFRESH_TTL_DAYS || 60), // 1 ay (30 gün)
  redis: {
    url: process.env.REDIS_URL || 'redis://red-d2nf9m7diees73cjdo40:6379',
    password: process.env.REDIS_PASSWORD || '',
    host: process.env.REDIS_HOST || 'red-d2nf9m7diees73cjdo40',
    port: Number(process.env.REDIS_PORT || 6379),
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'https://google-auth-e4er.onrender.com/auth/google/callback',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },
  apple: {
    clientId: process.env.APPLE_CLIENT_ID || '',
    teamId: process.env.APPLE_TEAM_ID || '',
    keyId: process.env.APPLE_KEY_ID || '',
    privateKey: process.env.APPLE_PRIVATE_KEY || '',
    redirectUri: process.env.APPLE_REDIRECT_URI || 'https://google-auth-e4er.onrender.com/auth/apple/callback',
  },
  security: {
    maxFailedAttempts: Number(process.env.MAX_FAILED_ATTEMPTS || 5),
    lockoutDurationMinutes: Number(process.env.LOCKOUT_DURATION_MINUTES || 30),
    passwordResetTokenTtlHours: Number(process.env.PASSWORD_RESET_TTL_HOURS || 1),
  },
  api: {
    baseUrl: process.env.API_BASE_URL || 'https://google-auth-e4er.onrender.com',
    pdfRead: {
      baseUrl: process.env.PDFREAD_BASE_URL || 'https://avenia.onrender.com',
      fallbackBaseUrl: process.env.PDFREAD_FALLBACK_BASE_URL || 'https://google-auth-e4er.onrender.com',
      apiKey: process.env.PDFREAD_API_KEY || '',
    },
    openai: {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: process.env.OPENAI_API_KEY || '',
      fineTunedModelId: process.env.FINE_TUNED_MODEL_ID || 'gpt-3.5-turbo',
      assistantId: process.env.ASSISTANT_ID || '',
    },
    tts: {
      baseUrl: process.env.TTS_BASE_URL || 'https://avenia.onrender.com',
    },
  },
};



