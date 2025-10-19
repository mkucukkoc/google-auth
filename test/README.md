# 🧪 Avenia Test Suite

Kapsamlı test suite'i ile Avenia backend API'lerinin tüm endpoint'lerini, performance'ını ve regresyon testlerini kapsar.

## 📁 Test Yapısı

```
test/
├── endpoints/           # Endpoint testleri
│   ├── auth.test.ts
│   ├── chat.test.ts
│   ├── pdfRead.test.ts
│   ├── presentation.test.ts
│   └── notifications.test.ts
├── performance/         # Performance testleri
│   └── load.test.ts
├── regression/          # Regresyon testleri
│   └── regression.test.ts
├── run-tests.js         # Test runner script
└── README.md           # Bu dosya
```

## 🚀 Kullanım

### Tüm Testleri Çalıştır
```bash
npm run test:all
```

### Belirli Test Suite'leri
```bash
# Sadece endpoint testleri
npm run test:endpoints-only

# Sadece performance testleri
npm run test:load

# Sadece regresyon testleri
npm run test:regression

# Belirli endpoint testleri
npm run test:auth
npm run test:chat
npm run test:pdf
npm run test:presentation
npm run test:notifications
```

### Manuel Test Çalıştırma
```bash
# Test runner ile
node test/run-tests.js

# Belirli suite ile
node test/run-tests.js --suite auth
node test/run-tests.js --performance
node test/run-tests.js --endpoints

# Yardım
node test/run-tests.js --help
```

## 📊 Test Kategorileri

### 🔐 Auth Endpoints (auth.test.ts)
- **Test Case Sayısı**: 25+
- **Kapsanan Endpoint'ler**:
  - `POST /auth/register` - Kullanıcı kaydı
  - `POST /auth/login` - Kullanıcı girişi
  - `POST /auth/refresh-token` - Token yenileme
  - `POST /auth/logout` - Çıkış
  - `GET /auth/me` - Profil bilgisi
  - `GET /auth/test-firebase` - Firebase bağlantı testi

**Test Senaryoları**:
- ✅ Geçerli kayıt/giriş
- ❌ Geçersiz email formatı
- ❌ Zayıf şifre
- ❌ Eksik alanlar
- ❌ Duplicate email
- ❌ Yanlış şifre
- ❌ Mevcut olmayan email
- ❌ Geçersiz token

### 💬 Chat Endpoints (chat.test.ts)
- **Test Case Sayısı**: 30+
- **Kapsanan Endpoint'ler**:
  - `POST /chat/send` - Mesaj gönderme
  - `GET /chat/history/:sessionId` - Chat geçmişi
  - `DELETE /chat/session/:sessionId` - Session silme
  - `GET /chat/sessions` - Kullanıcı session'ları
  - `POST /chat/tts` - Text-to-Speech

**Test Senaryoları**:
- ✅ Geçerli mesaj gönderme
- ❌ Eksik sessionId
- ❌ Eksik mesaj
- ❌ Auth token eksik
- ❌ Boş mesaj
- ❌ Çok uzun mesaj
- ✅ Özel karakterler
- ✅ Emoji desteği

### 📄 PDF Read Endpoints (pdfRead.test.ts)
- **Test Case Sayısı**: 25+
- **Kapsanan Endpoint'ler**:
  - `POST /pdf-read/upload` - PDF yükleme
  - `POST /pdf-read/summarize` - PDF özetleme
  - `POST /pdf-read/generate-doc` - Doküman oluşturma
  - `POST /pdf-read/generate-ppt` - Sunum oluşturma
  - `GET /pdf-read/files` - Kullanıcı dosyaları
  - `DELETE /pdf-read/files/:fileId` - Dosya silme

**Test Senaryoları**:
- ✅ Geçerli PDF yükleme
- ❌ Dosya eksik
- ❌ Auth token eksik
- ❌ PDF olmayan dosya
- ❌ Çok büyük dosya
- ✅ Geçerli özetleme
- ❌ Geçersiz fileId
- ❌ Geçersiz seçenekler

### 🎯 Presentation Endpoints (presentation.test.ts)
- **Test Case Sayısı**: 20+
- **Kapsanan Endpoint'ler**:
  - `POST /presentation/generate` - Sunum oluşturma
  - `GET /presentation/:presentationId` - Sunum detayları
  - `GET /presentation` - Kullanıcı sunumları
  - `DELETE /presentation/:presentationId` - Sunum silme
  - `POST /presentation/:presentationId/duplicate` - Sunum kopyalama

**Test Senaryoları**:
- ✅ Geçerli sunum oluşturma
- ❌ Eksik topic
- ❌ Auth token eksik
- ❌ Boş topic
- ❌ Geçersiz slide sayısı
- ❌ Geçersiz style
- ❌ Çok uzun topic

### 🔔 Notifications Endpoints (notifications.test.ts)
- **Test Case Sayısı**: 20+
- **Kapsanan Endpoint'ler**:
  - `POST /notifications/send` - Bildirim gönderme
  - `GET /notifications` - Kullanıcı bildirimleri
  - `PUT /notifications/:notificationId/read` - Okundu işaretleme
  - `DELETE /notifications/:notificationId` - Bildirim silme
  - `POST /notifications/mark-all-read` - Tümünü okundu işaretleme

**Test Senaryoları**:
- ✅ Geçerli bildirim gönderme
- ❌ Eksik userId
- ❌ Eksik title
- ❌ Auth token eksik
- ❌ Boş title
- ❌ Geçersiz type
- ❌ Çok uzun title/body

## ⚡ Performance Tests (load.test.ts)

### Load Testing
- **Concurrent Login Requests**: 10 eşzamanlı kullanıcı
- **Concurrent Chat Messages**: 20 eşzamanlı mesaj
- **Concurrent PDF Uploads**: 5 eşzamanlı dosya yükleme

### Stress Testing
- **High Volume Chat**: 100 mesaj
- **High Volume Auth**: 50 kayıt

### Memory Testing
- **Memory Leak Detection**: 50 iterasyon
- **Memory Usage Monitoring**: Başlangıç/son durum

### Response Time Benchmarks
- **Auth Endpoints**: `/auth/test-firebase`
- **Chat Endpoints**: `/chat/sessions`
- **PDF Endpoints**: `/pdf-read/files`
- **Presentation Endpoints**: `/presentation`
- **Notification Endpoints**: `/notifications`

## 🔄 Regression Tests (regression.test.ts)

### Critical Path Testing
1. **User Authentication Flow**
   - Kayıt → Giriş → Profil → Token Yenileme → Çıkış

2. **Chat System Flow**
   - Mesaj Gönderme → Chat Geçmişi → TTS → Session Yönetimi

3. **PDF Processing Flow**
   - Yükleme → Özetleme → Doküman Oluşturma → Sunum Oluşturma

4. **Presentation System Flow**
   - Oluşturma → Detaylar → Kopyalama → Listeleme → Silme

5. **Notification System Flow**
   - Gönderme → Listeleme → Okundu İşaretleme → Silme

6. **End-to-End Integration Flow**
   - Kayıt → Giriş → Chat → PDF → Sunum → Bildirim

## 📈 Test Metrics

### Coverage
- **Endpoint Coverage**: %100 (Tüm API endpoint'leri)
- **Scenario Coverage**: 100+ test case
- **Error Coverage**: Tüm hata senaryoları

### Performance Benchmarks
- **Response Time**: < 500ms (ortalama)
- **Concurrent Users**: 10+ eşzamanlı
- **Memory Usage**: < 100MB artış
- **Success Rate**: > 95%

## 🛠️ Test Configuration

### Jest Configuration
```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 10000,
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};
```

### Test Environment
- **Node.js**: v18+
- **Jest**: v29+
- **Supertest**: v7+
- **TypeScript**: v5+

## 📝 Logging

### Test Results
- **Console Output**: Real-time test progress
- **Log File**: `test/test-results.log`
- **Detailed Metrics**: Response times, success rates
- **Error Details**: Hata mesajları ve stack trace'ler

### Log Format
```
[2024-01-15T10:30:00.000Z] [INFO] 🧪 Running: Valid user registration
[2024-01-15T10:30:00.150Z] [INFO] ✅ SUCCESS: Valid user registration (150ms)
[2024-01-15T10:30:00.200Z] [INFO] 🧪 Running: Registration with invalid email
[2024-01-15T10:30:00.250Z] [INFO] ❌ EXPECTED FAILURE: Registration with invalid email - Invalid email format (50ms)
```

## 🚨 Error Handling

### Test Failures
- **Expected Failures**: Geçersiz input testleri
- **Unexpected Failures**: Gerçek hatalar
- **Timeout Failures**: Response time aşımı
- **Memory Failures**: Memory leak tespiti

### Debugging
- **Verbose Logging**: Detaylı test çıktıları
- **Error Stack Traces**: Hata detayları
- **Performance Metrics**: Response time analizi
- **Memory Monitoring**: Memory kullanım takibi

## 🔧 Maintenance

### Test Updates
- Yeni endpoint'ler eklendiğinde test case'leri güncelleyin
- Performance benchmark'ları düzenli olarak gözden geçirin
- Regression test'leri yeni feature'lar için genişletin

### Best Practices
- Test case'leri açıklayıcı isimlerle adlandırın
- Her test case'i bağımsız olarak çalıştırılabilir yapın
- Mock data'ları gerçekçi değerlerle oluşturun
- Performance test'lerini production benzeri ortamda çalıştırın

## 📞 Support

Test suite ile ilgili sorularınız için:
- **Documentation**: Bu README dosyası
- **Logs**: `test/test-results.log`
- **Issues**: GitHub Issues
- **Team**: Avenia Development Team

---

**🎉 Happy Testing!** Bu test suite ile Avenia backend'inizin güvenilirliğini ve performansını garanti altına alabilirsiniz.
