# Security Guide

Bu doküman, ChatGBT Mini backend authentication sisteminin güvenlik özelliklerini ve en iyi uygulamalarını detaylandırır.

## 🔐 Güvenlik Mimarisi

### Token Güvenliği
- **Access Token**: JWT formatında, 15 dakika TTL
- **Refresh Token**: Rotasyonlu, 60 gün TTL, Argon2id ile hash'lenir
- **Token Reuse Detection**: Eski token kullanımı tespit edilir ve tüm session'lar iptal edilir

### Şifreleme
- **Password Hashing**: Argon2id (memory: 64MB, time: 3, parallelism: 1)
- **Refresh Token Hashing**: Argon2id (memory: 16MB, time: 2)
- **JWT Signing**: HMAC-SHA256

## 🛡️ Güvenlik Katmanları

### 1. Rate Limiting
```javascript
// Endpoint bazlı rate limiting
const authRateLimits = {
  login: rateLimitByIPAndEmail(15 * 60 * 1000, 5),      // 5/15min
  register: rateLimitByIP(60 * 60 * 1000, 3),           // 3/hour
  refresh: rateLimitByIP(60 * 1000, 10),                // 10/min
  passwordReset: rateLimitByEmail(60 * 60 * 1000, 3),   // 3/hour
  general: rateLimitByIP(60 * 1000, 20),                // 20/min
};
```

### 2. Brute Force Koruması
```javascript
// Hesap kilitleme mekanizması
const maxFailedAttempts = 5;
const lockoutDuration = 30; // dakika

// Progressive delay
const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
```

### 3. Input Validation
```javascript
// Zod ile strict validation
const authSchemas = {
  register: z.object({
    email: z.string().email(),
    password: z.string().min(8).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
    device: z.object({
      os: z.string().optional(),
      model: z.string().optional(),
      appVersion: z.string().optional(),
      platform: z.string().optional(),
    }),
  }),
};
```

### 4. Session Yönetimi
```javascript
// Session güvenliği
const sessionSecurity = {
  deviceBinding: true,           // Device ID kontrolü
  ipTracking: true,             // IP adresi takibi
  userAgentTracking: true,      // User agent takibi
  automaticCleanup: true,       // Otomatik temizlik
  concurrentSessionLimit: null, // Sınırsız eşzamanlı session
};
```

## 🔍 Güvenlik Monitoring

### Audit Logging
```javascript
// Tüm güvenlik olayları loglanır
const auditEvents = [
  'login',           // Giriş denemeleri
  'logout',          // Çıkış işlemleri
  'refresh',         // Token yenileme
  'reuse_detected',  // Token reuse tespiti
  'register',        // Kayıt işlemleri
  'logout_all',      // Tüm session'ları sonlandırma
  'password_reset',  // Şifre sıfırlama
];
```

### Güvenlik Metrikleri
```javascript
// İzlenen metrikler
const securityMetrics = {
  failedLoginAttempts: 'counter',
  successfulLogins: 'counter',
  tokenRefreshes: 'counter',
  tokenReuseDetections: 'counter',
  accountLockouts: 'counter',
  passwordResets: 'counter',
  suspiciousActivity: 'gauge',
};
```

## 🚨 Güvenlik İhlali Tespiti

### Token Reuse Detection
```javascript
// Eski refresh token kullanımı tespiti
if (current.tokenHash !== tokenHash) {
  // Tüm kullanıcı session'larını iptal et
  await SessionService.revokeAllUserSessions(current.userId);
  
  // Güvenlik ihlali logla
  await AuditService.logAuthEvent('reuse_detected', {
    userId: current.userId,
    sessionId,
    ipAddress,
    userAgent,
    success: false,
    errorMessage: 'Refresh token reuse detected',
  });
  
  return res.status(401).json({ 
    error: 'token_reuse_detected',
    message: 'Security violation detected. All sessions have been revoked.' 
  });
}
```

### Anormal Aktivite Tespiti
```javascript
// Şüpheli aktivite tespiti
const detectSuspiciousActivity = async (userId, ipAddress, userAgent) => {
  const recentLogins = await AuditService.getUserAuditLogs(userId, 10);
  const uniqueIPs = new Set(recentLogins.map(log => log.ipAddress));
  const uniqueUserAgents = new Set(recentLogins.map(log => log.userAgent));
  
  // Yeni IP veya User Agent
  if (!uniqueIPs.has(ipAddress) || !uniqueUserAgents.has(userAgent)) {
    await AuditService.logAuthEvent('suspicious_activity', {
      userId,
      ipAddress,
      userAgent,
      success: false,
      errorMessage: 'New IP or User Agent detected',
    });
  }
};
```

## 🔒 Güvenlik En İyi Uygulamaları

### 1. Environment Variables
```bash
# Güvenli environment variable yönetimi
JWT_HS_SECRET=<256-bit-random-key>
FIREBASE_PRIVATE_KEY=<encrypted-in-secrets-manager>
REDIS_PASSWORD=<strong-password>
```

### 2. HTTPS/TLS
```nginx
# Nginx SSL konfigürasyonu
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 10m;
```

### 3. Headers Security
```javascript
// Helmet.js güvenlik başlıkları
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));
```

### 4. Input Sanitization
```javascript
// XSS koruması
const sanitizeInput = (input) => {
  return input
    .replace(/[<>]/g, '')  // HTML tag'leri kaldır
    .replace(/javascript:/gi, '')  // JavaScript protokolü kaldır
    .trim();
};
```

## 🔐 Şifre Güvenliği

### Şifre Politikası
```javascript
const passwordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: false,
  maxLength: 128,
  preventCommonPasswords: true,
  preventUserInfo: true,
};
```

### Şifre Hash'leme
```javascript
// Argon2id konfigürasyonu
const argon2Options = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16,  // 64 MB
  timeCost: 3,          // 3 iterations
  parallelism: 1,       // 1 thread
  hashLength: 32,       // 32 bytes
};
```

## 🛡️ API Güvenliği

### CORS Konfigürasyonu
```javascript
// Güvenli CORS ayarları
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://yourdomain.com',
      'https://app.yourdomain.com',
    ];
    
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

### Request Size Limiting
```javascript
// Request boyut sınırlaması
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
```

## 🔍 Güvenlik Testleri

### Penetration Testing
```bash
# OWASP ZAP ile güvenlik testi
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t http://localhost:4000 \
  -J zap-report.json

# Nmap ile port tarama
nmap -sS -O localhost

# SSL/TLS test
testssl.sh https://yourdomain.com
```

### Automated Security Scanning
```yaml
# GitHub Actions güvenlik taraması
name: Security Scan
on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Snyk to check for vulnerabilities
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      - name: Run CodeQL Analysis
        uses: github/codeql-action/analyze@v2
```

## 🚨 Incident Response

### Güvenlik İhlali Müdahale Planı

#### 1. Tespit ve Analiz
```javascript
// Otomatik güvenlik ihlali tespiti
const securityIncident = {
  type: 'token_reuse',
  severity: 'high',
  userId: 'user-123',
  ipAddress: '192.168.1.100',
  timestamp: new Date(),
  actions: [
    'revoke_all_sessions',
    'notify_user',
    'log_incident',
  ],
};
```

#### 2. Müdahale Adımları
```bash
# 1. Tüm kullanıcı session'larını iptal et
curl -X POST https://api.yourdomain.com/auth/logout-all \
  -H "Authorization: Bearer admin-token"

# 2. Şüpheli IP'yi engelle
iptables -A INPUT -s 192.168.1.100 -j DROP

# 3. Güvenlik loglarını analiz et
grep "reuse_detected" /var/log/auth.log

# 4. Kullanıcıyı bilgilendir
curl -X POST https://api.yourdomain.com/notifications/security-alert \
  -d '{"userId": "user-123", "type": "suspicious_activity"}'
```

#### 3. İyileştirme
```javascript
// Güvenlik ihlali sonrası iyileştirmeler
const postIncidentActions = [
  'review_security_logs',
  'update_rate_limits',
  'enhance_monitoring',
  'user_education',
  'security_policy_update',
];
```

## 📊 Güvenlik Metrikleri

### KPI'lar
```javascript
const securityKPIs = {
  meanTimeToDetection: '< 5 minutes',
  meanTimeToResponse: '< 15 minutes',
  falsePositiveRate: '< 1%',
  securityIncidentCount: 'monthly',
  userSecurityScore: 'per user',
};
```

### Dashboard
```javascript
// Güvenlik dashboard metrikleri
const securityDashboard = {
  realTimeMetrics: [
    'active_sessions',
    'failed_login_attempts',
    'token_refresh_rate',
    'suspicious_activities',
  ],
  historicalMetrics: [
    'login_success_rate',
    'account_lockout_rate',
    'password_reset_rate',
    'security_incident_trend',
  ],
};
```

## 🔄 Güvenlik Güncellemeleri

### Dependency Updates
```bash
# Güvenlik güncellemelerini kontrol et
npm audit

# Otomatik güvenlik güncellemeleri
npm audit fix

# Manuel güncelleme
npm update
```

### Security Patches
```bash
# Sistem güvenlik güncellemeleri
sudo apt update && sudo apt upgrade

# Docker image güvenlik taraması
docker scan your-image:latest
```

## 📚 Güvenlik Eğitimi

### Developer Training
- OWASP Top 10
- Secure coding practices
- Authentication best practices
- Session management
- Input validation

### Security Awareness
- Phishing awareness
- Password security
- Two-factor authentication
- Incident reporting

## 🔐 Compliance

### GDPR Compliance
```javascript
// Kişisel veri koruma
const gdprCompliance = {
  dataMinimization: true,
  purposeLimitation: true,
  storageLimitation: true,
  rightToErasure: true,
  dataPortability: true,
  consentManagement: true,
};
```

### SOC 2 Compliance
```javascript
// Güvenlik kontrolleri
const soc2Controls = {
  accessControls: true,
  systemOperations: true,
  changeManagement: true,
  riskManagement: true,
  dataProtection: true,
};
```

## 📞 Güvenlik İletişimi

### Emergency Contacts
- **Security Team**: security@yourdomain.com
- **Incident Response**: incident@yourdomain.com
- **On-call Engineer**: +1-XXX-XXX-XXXX

### Reporting
- **Bug Bounty**: security@yourdomain.com
- **Vulnerability Disclosure**: security@yourdomain.com
- **General Security**: security@yourdomain.com



