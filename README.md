# ChatGBT Mini - Backend Authentication System

Bu proje, üretim kalitesinde bir authentication sistemi içerir. JWT tabanlı access token'lar, rotasyonlu refresh token'lar, session yönetimi, rate limiting ve kapsamlı güvenlik önlemleri ile donatılmıştır.

## 🚀 Özellikler

### Token Politikası
- **Access Token**: 15 dakika TTL, JWT formatında
- **Refresh Token**: 60 gün TTL, rotasyonlu (her yenilemede yeni token)
- **Reuse Detection**: Eski refresh token kullanımı tespit edilir ve tüm session'lar iptal edilir
- **Claims**: `sub` (user_id), `sid` (session_id), `jti`, `iat`, `exp`

### Session & Device Yönetimi
- Her cihaz için benzersiz session
- Çoklu cihaz desteği
- Device bilgileri (OS, model, app version) takibi
- Session geçmişi ve istatistikleri

### Güvenlik Önlemleri
- **Argon2id** ile şifre hash'leme
- **Rate Limiting**: IP, email ve endpoint bazlı
- **Brute Force Koruması**: 5 başarısız denemeden sonra 30 dakika kilitleme
- **Audit Logging**: Tüm auth olayları loglanır
- **Token Reuse Detection**: Güvenlik ihlali tespiti
- **Password Reset**: Güvenli token tabanlı şifre sıfırlama

## 📋 API Endpoints

### Authentication

#### POST /auth/register
Yeni kullanıcı kaydı.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "name": "John Doe",
  "device": {
    "os": "iOS",
    "model": "iPhone 13",
    "appVersion": "1.0.0",
    "platform": "mobile"
  },
  "deviceId": "unique-device-id"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "accessExp": 1640995200000,
  "refreshToken": "base64url-encoded-token",
  "refreshExp": 1643587200000,
  "sessionId": "uuid-session-id",
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "avatar": null
  },
  "deviceId": "unique-device-id"
}
```

#### POST /auth/login
Kullanıcı girişi.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "device": {
    "os": "iOS",
    "model": "iPhone 13",
    "appVersion": "1.0.0",
    "platform": "mobile"
  },
  "deviceId": "unique-device-id"
}
```

**Response:** Register ile aynı format.

#### POST /auth/refresh
Token yenileme.

**Request Body:**
```json
{
  "refreshToken": "base64url-encoded-token",
  "sessionId": "uuid-session-id",
  "deviceId": "unique-device-id"
}
```

**Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "accessExp": 1640995200000,
  "refreshToken": "new-base64url-encoded-token",
  "refreshExp": 1643587200000,
  "sessionId": "uuid-session-id"
}
```

#### POST /auth/logout
Tek session çıkışı.

**Request Body:**
```json
{
  "sessionId": "uuid-session-id"
}
```

#### POST /auth/logout-all
Tüm session'ları sonlandırma.

**Headers:**
```
Authorization: Bearer <access-token>
```

#### GET /auth/me
Kullanıcı bilgilerini getirme.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response:**
```json
{
  "id": "user-uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "avatar": null,
  "isEmailVerified": false,
  "createdAt": "2023-12-01T00:00:00.000Z",
  "lastLoginAt": "2023-12-01T00:00:00.000Z"
}
```

### Password Reset

#### POST /auth/password-reset/request
Şifre sıfırlama talebi.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

#### POST /auth/password-reset/confirm
Şifre sıfırlama onayı.

**Request Body:**
```json
{
  "token": "reset-token",
  "password": "NewSecurePassword123"
}
```

## 🔧 Kurulum

### Gereksinimler
- Node.js 18+
- Firebase Firestore
- Redis (rate limiting için)

### Environment Variables
```bash
# Server
PORT=4000
NODE_ENV=production
LOG_LEVEL=info

# CORS
CORS_ORIGIN=https://yourdomain.com,https://app.yourdomain.com

# JWT
JWT_ISS=your-app-name
JWT_AUD=your-app-audience
JWT_HS_SECRET=your-super-secret-jwt-key
JWT_ACCESS_TTL_MIN=15

# Refresh Token
REFRESH_TTL_DAYS=60

# Redis
REDIS_URL=redis://localhost:6379

# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Security
MAX_FAILED_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=30
PASSWORD_RESET_TTL_HOURS=1
```

### Kurulum Adımları

1. **Bağımlılıkları yükleyin:**
```bash
npm install
```

2. **Environment variables'ları ayarlayın:**
```bash
cp .env.example .env
# .env dosyasını düzenleyin
```

3. **Firebase'i yapılandırın:**
```bash
# Firebase CLI ile proje oluşturun
firebase init firestore
```

4. **Redis'i başlatın:**
```bash
# Docker ile
docker run -d -p 6379:6379 redis:alpine

# Veya sistem Redis'i
redis-server
```

5. **Uygulamayı başlatın:**
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## 🧪 Test

```bash
# Tüm testleri çalıştır
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

## 📊 Monitoring & Logging

### Audit Logs
Tüm authentication olayları `auditLogs` koleksiyonunda loglanır:
- Login/logout olayları
- Token refresh işlemleri
- Reuse detection
- Başarısız giriş denemeleri
- Password reset işlemleri

### Health Check
```
GET /health
```

### Metrics
- Rate limiting istatistikleri
- Session sayıları
- Başarısız giriş denemeleri
- Token refresh oranları

## 🔒 Güvenlik

### Rate Limiting
- **Login**: 5 deneme / 15 dakika (IP + email)
- **Register**: 3 deneme / saat (IP)
- **Refresh**: 10 deneme / dakika (IP)
- **Password Reset**: 3 deneme / saat (email)
- **General**: 20 deneme / dakika (IP)

### Brute Force Koruması
- 5 başarısız denemeden sonra hesap 30 dakika kilitlenir
- IP bazlı rate limiting
- Progressive delay

### Token Güvenliği
- Refresh token'lar Argon2id ile hash'lenir
- Token reuse detection
- Otomatik session cleanup
- Secure token generation

## 🚀 Production Deployment

### Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 4000
CMD ["node", "dist/index.js"]
```

### Environment Checklist
- [ ] JWT secret güçlü ve benzersiz
- [ ] Firebase credentials doğru
- [ ] Redis bağlantısı çalışıyor
- [ ] CORS origins güvenli
- [ ] Rate limiting ayarları uygun
- [ ] Log level production için ayarlanmış
- [ ] SSL/TLS sertifikaları
- [ ] Firewall kuralları
- [ ] Backup stratejisi

### Scaling
- **Horizontal**: Load balancer ile multiple instance
- **Database**: Firestore otomatik scaling
- **Cache**: Redis cluster
- **Monitoring**: Prometheus + Grafana

## 🔄 Maintenance

### Cleanup Tasks
Sistem otomatik olarak şunları temizler:
- Süresi dolmuş session'lar
- Eski audit log'ları (90 gün)
- Süresi dolmuş password reset token'ları
- Rate limit cache'leri

### Backup
- Firestore otomatik backup
- Redis persistence
- Environment variables backup

## 📚 API Documentation

Swagger UI: `http://localhost:4000/docs`

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Write tests
4. Submit pull request

## 📄 License

MIT License



