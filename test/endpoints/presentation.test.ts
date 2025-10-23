import request from 'supertest';
import { app } from '../../src/index';
import { logger } from '../../src/utils/logger';

describe('🎯 Presentation Endpoints - Comprehensive Test Suite', () => {
  let authToken: string;

  beforeAll(async () => {
    logger.info('🚀 Starting Presentation Endpoints Test Suite');
    authToken = 'mock-auth-token';
  });

  afterAll(async () => {
    logger.info('✅ Presentation Endpoints Test Suite Completed');
  });

  describe('POST /presentation/generate', () => {
    const testCases = [
      {
        name: 'Valid presentation generation',
        data: {
          topic: 'Climate Change and Renewable Energy',
          slides: 10,
          style: 'modern',
          includeImages: true
        },
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        expectedStatus: 200,
        shouldSucceed: true
      },
      {
        name: 'Generate presentation without topic',
        data: {
          slides: 10,
          style: 'modern',
          includeImages: true
        },
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        expectedStatus: 400,
        shouldSucceed: false
      },
      {
        name: 'Generate presentation without auth token',
        data: {
          topic: 'Climate Change and Renewable Energy',
          slides: 10,
          style: 'modern',
          includeImages: true
        },
        headers: {},
        expectedStatus: 401,
        shouldSucceed: false
      },
      {
        name: 'Generate presentation with empty topic',
        data: {
          topic: '',
          slides: 10,
          style: 'modern',
          includeImages: true
        },
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        expectedStatus: 400,
        shouldSucceed: false
      },
      {
        name: 'Generate presentation with invalid slide count',
        data: {
          topic: 'Climate Change and Renewable Energy',
          slides: -5,
          style: 'modern',
          includeImages: true
        },
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        expectedStatus: 400,
        shouldSucceed: false
      },
      {
        name: 'Generate presentation with too many slides',
        data: {
          topic: 'Climate Change and Renewable Energy',
          slides: 1000,
          style: 'modern',
          includeImages: true
        },
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        expectedStatus: 400,
        shouldSucceed: false
      },
      {
        name: 'Generate presentation with invalid style',
        data: {
          topic: 'Climate Change and Renewable Energy',
          slides: 10,
          style: 'invalid-style',
          includeImages: true
        },
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        expectedStatus: 400,
        shouldSucceed: false
      },
      {
        name: 'Generate presentation with very long topic',
        data: {
          topic: 'A'.repeat(1000),
          slides: 10,
          style: 'modern',
          includeImages: true
        },
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        expectedStatus: 400,
        shouldSucceed: false
      }
    ];

    testCases.forEach((testCase, index) => {
      it(`Test Case ${index + 1}: ${testCase.name}`, async () => {
        logger.info(`🧪 Running: ${testCase.name}`);
        
        const startTime = Date.now();
        const response = await request(app)
          .post('/presentation/generate')
          .set(testCase.headers)
          .send(testCase.data)
          .expect(testCase.expectedStatus);
        
        const duration = Date.now() - startTime;
        
        if (testCase.shouldSucceed) {
          expect(response.body.success).toBe(true);
          expect(response.body.data).toHaveProperty('presentationId');
          expect(response.body.data).toHaveProperty('downloadUrl');
          logger.info(`✅ SUCCESS: ${testCase.name} (${duration}ms)`);
        } else {
          expect(response.body.success).toBe(false);
          expect(response.body.error).toBeDefined();
          logger.info(`❌ EXPECTED FAILURE: ${testCase.name} - ${response.body.error} (${duration}ms)`);
        }
      });
    });
  });

  describe('GET /presentation/:presentationId', () => {
    const testCases = [
      {
        name: 'Get presentation with valid ID',
        presentationId: 'test-presentation-id',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        expectedStatus: 200,
        shouldSucceed: true
      },
      {
        name: 'Get presentation without auth token',
        presentationId: 'test-presentation-id',
        headers: {},
        expectedStatus: 401,
        shouldSucceed: false
      },
      {
        name: 'Get presentation with invalid ID',
        presentationId: 'invalid-presentation-id',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        expectedStatus: 404,
        shouldSucceed: false
      },
      {
        name: 'Get presentation with empty ID',
        presentationId: '',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        expectedStatus: 404,
        shouldSucceed: false
      }
    ];

    testCases.forEach((testCase, index) => {
      it(`Test Case ${index + 1}: ${testCase.name}`, async () => {
        logger.info(`🧪 Running: ${testCase.name}`);
        
        const startTime = Date.now();
        const response = await request(app)
          .get(`/presentation/${testCase.presentationId}`)
          .set(testCase.headers)
          .expect(testCase.expectedStatus);
        
        const duration = Date.now() - startTime;
        
        if (testCase.shouldSucceed) {
          expect(response.body.success).toBe(true);
          expect(response.body.data).toHaveProperty('presentation');
          expect(response.body.data.presentation).toHaveProperty('id');
          expect(response.body.data.presentation).toHaveProperty('topic');
          logger.info(`✅ SUCCESS: ${testCase.name} (${duration}ms)`);
        } else {
          expect(response.body.success).toBe(false);
          expect(response.body.error).toBeDefined();
          logger.info(`❌ EXPECTED FAILURE: ${testCase.name} - ${response.body.error} (${duration}ms)`);
        }
      });
    });
  });

  describe('GET /presentation', () => {
    const testCases = [
      {
        name: 'Get user presentations',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        expectedStatus: 200,
        shouldSucceed: true
      },
      {
        name: 'Get presentations without auth token',
        headers: {},
        expectedStatus: 401,
        shouldSucceed: false
      },
      {
        name: 'Get presentations with invalid token',
        headers: {
          'Authorization': 'Bearer invalid-token'
        },
        expectedStatus: 401,
        shouldSucceed: false
      }
    ];

    testCases.forEach((testCase, index) => {
      it(`Test Case ${index + 1}: ${testCase.name}`, async () => {
        logger.info(`🧪 Running: ${testCase.name}`);
        
        const startTime = Date.now();
        const response = await request(app)
          .get('/presentation')
          .set(testCase.headers)
          .expect(testCase.expectedStatus);
        
        const duration = Date.now() - startTime;
        
        if (testCase.shouldSucceed) {
          expect(response.body.success).toBe(true);
          expect(response.body.data).toHaveProperty('presentations');
          expect(Array.isArray(response.body.data.presentations)).toBe(true);
          logger.info(`✅ SUCCESS: ${testCase.name} (${duration}ms)`);
        } else {
          expect(response.body.success).toBe(false);
          expect(response.body.error).toBeDefined();
          logger.info(`❌ EXPECTED FAILURE: ${testCase.name} - ${response.body.error} (${duration}ms)`);
        }
      });
    });
  });

  describe('DELETE /presentation/:presentationId', () => {
    const testCases = [
      {
        name: 'Delete presentation with valid ID',
        presentationId: 'test-presentation-id',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        expectedStatus: 200,
        shouldSucceed: true
      },
      {
        name: 'Delete presentation without auth token',
        presentationId: 'test-presentation-id',
        headers: {},
        expectedStatus: 401,
        shouldSucceed: false
      },
      {
        name: 'Delete presentation with invalid ID',
        presentationId: 'invalid-presentation-id',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        expectedStatus: 404,
        shouldSucceed: false
      },
      {
        name: 'Delete presentation with empty ID',
        presentationId: '',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        expectedStatus: 404,
        shouldSucceed: false
      }
    ];

    testCases.forEach((testCase, index) => {
      it(`Test Case ${index + 1}: ${testCase.name}`, async () => {
        logger.info(`🧪 Running: ${testCase.name}`);
        
        const startTime = Date.now();
        const response = await request(app)
          .delete(`/presentation/${testCase.presentationId}`)
          .set(testCase.headers)
          .expect(testCase.expectedStatus);
        
        const duration = Date.now() - startTime;
        
        if (testCase.shouldSucceed) {
          expect(response.body.success).toBe(true);
          logger.info(`✅ SUCCESS: ${testCase.name} (${duration}ms)`);
        } else {
          expect(response.body.success).toBe(false);
          expect(response.body.error).toBeDefined();
          logger.info(`❌ EXPECTED FAILURE: ${testCase.name} - ${response.body.error} (${duration}ms)`);
        }
      });
    });
  });

  describe('POST /presentation/:presentationId/duplicate', () => {
    const testCases = [
      {
        name: 'Duplicate presentation with valid ID',
        presentationId: 'test-presentation-id',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        expectedStatus: 200,
        shouldSucceed: true
      },
      {
        name: 'Duplicate presentation without auth token',
        presentationId: 'test-presentation-id',
        headers: {},
        expectedStatus: 401,
        shouldSucceed: false
      },
      {
        name: 'Duplicate presentation with invalid ID',
        presentationId: 'invalid-presentation-id',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        expectedStatus: 404,
        shouldSucceed: false
      }
    ];

    testCases.forEach((testCase, index) => {
      it(`Test Case ${index + 1}: ${testCase.name}`, async () => {
        logger.info(`🧪 Running: ${testCase.name}`);
        
        const startTime = Date.now();
        const response = await request(app)
          .post(`/presentation/${testCase.presentationId}/duplicate`)
          .set(testCase.headers)
          .expect(testCase.expectedStatus);
        
        const duration = Date.now() - startTime;
        
        if (testCase.shouldSucceed) {
          expect(response.body.success).toBe(true);
          expect(response.body.data).toHaveProperty('duplicatedPresentationId');
          logger.info(`✅ SUCCESS: ${testCase.name} (${duration}ms)`);
        } else {
          expect(response.body.success).toBe(false);
          expect(response.body.error).toBeDefined();
          logger.info(`❌ EXPECTED FAILURE: ${testCase.name} - ${response.body.error} (${duration}ms)`);
        }
      });
    });
  });
});


