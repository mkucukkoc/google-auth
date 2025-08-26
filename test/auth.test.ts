import express from 'express';
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createAuthRouter } from '../src/routes/auth';
import { createEmailOtpRouter } from '../src/routes/emailOtp';

describe('Auth API', () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', createAuthRouter());
  app.use('/auth/email', createEmailOtpRouter());

  it('should start OTP and then reject wrong verify', async () => {
    const email = `user${Date.now()}@example.com`;
    const start = await request(app).post('/auth/email/start').send({ email });
    expect(start.status).toBe(200);
    const verify = await request(app).post('/auth/email/verify').send({ email, otp: '000000', device_id: 'dev-1' });
    expect(verify.status).toBe(400);
  });
});



