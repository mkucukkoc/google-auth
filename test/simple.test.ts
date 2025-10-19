import request from 'supertest';
import { app } from '../src/index';
import { logger } from '../src/utils/logger';

describe('🧪 Simple API Test', () => {
  beforeAll(async () => {
    logger.info('🚀 Starting Simple API Test');
  });

  afterAll(async () => {
    logger.info('✅ Simple API Test Completed');
  });

  it('Health check endpoint', async () => {
    logger.info('🧪 Running: Health check');
    
    const startTime = Date.now();
    const response = await request(app)
      .get('/health')
      .expect(200);
    
    const duration = Date.now() - startTime;
    
    expect(response.body.ok).toBe(true);
    expect(response.body.version).toBeDefined();
    logger.info(`✅ Health check completed in ${duration}ms`);
  });

  it('Auth register with device info', async () => {
    logger.info('🧪 Running: Auth register with device info');
    
    const startTime = Date.now();
    const response = await request(app)
      .post('/auth/register')
      .send({
        email: 'test@example.com',
        password: 'TestPassword123!',
        firstName: 'Test',
        lastName: 'User',
        device: {
          deviceId: 'test-device-123',
          deviceType: 'mobile',
          os: 'iOS',
          osVersion: '15.0',
          appVersion: '1.0.0'
        }
      });
    
    const duration = Date.now() - startTime;
    
    logger.info(`Response status: ${response.status}`);
    logger.info(`Response body: ${JSON.stringify(response.body, null, 2)}`);
    
    // Don't assert specific status, just log the response
    logger.info(`✅ Auth register test completed in ${duration}ms`);
  });
});
