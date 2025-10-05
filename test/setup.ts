import { beforeAll, afterAll } from 'vitest';
import 'dotenv/config';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_HS_SECRET = 'test-secret-key-for-testing-only';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.FIREBASE_PROJECT_ID = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@test-project.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKB\n-----END PRIVATE KEY-----\n';

beforeAll(async () => {
  // Setup test environment
  console.log('Setting up test environment...');
});

afterAll(async () => {
  // Cleanup test environment
  console.log('Cleaning up test environment...');
});










