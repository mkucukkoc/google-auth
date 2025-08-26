import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { config } from './config';
import { createAuthRouter } from './routes/auth';
import { createEmailOtpRouter } from './routes/emailOtp';
import { createGoogleAuthRouter } from './routes/google';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger';

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

app.use(express.json());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(helmet());
app.use(pinoHttp({ logger }));
const limiter = rateLimit({ windowMs: 60_000, max: 100 });
app.use(limiter);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Specific stricter limits for sensitive routes
const authLimiter = rateLimit({ windowMs: 60_000, max: 20 });
app.use('/auth', authLimiter, createAuthRouter());
app.use('/auth/email', authLimiter, createEmailOtpRouter());
app.use('/auth/google', authLimiter, createGoogleAuthRouter());
app.use('/user', createAuthRouter());

app.listen(config.port, () => {
  logger.info({ port: config.port }, 'server listening');
});

