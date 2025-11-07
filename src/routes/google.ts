import { Router } from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes } from 'crypto';
import { config } from '../config';
import { setJson, getJson } from '../redis';
import { db } from '../firebase';
import { TokenService } from '../services/tokenService';
import { UserService } from '../services/userService';
import { SessionService } from '../services/sessionService';
import { auditService } from '../services/auditService';
import { authRateLimits } from '../middleware/rateLimitMiddleware';
import { admin } from '../firebase';
import { logger } from '../utils/logger';

export function createGoogleAuthRouter(): Router {
  const r = Router();

  r.post('/start', 
    authRateLimits.general,
    async (req, res) => {
      try {
        logger.debug('[GoogleAuth] /start endpoint called:', {
          body: req.body,
          headers: req.headers
        });
        
        const { device_id } = req.body || {};
        if (!device_id) {
          logger.debug('[GoogleAuth] Missing device_id');
          return res.status(400).json({ error: 'invalid_request' });
        }
        
        const id = uuidv4();
        logger.debug('[GoogleAuth] Generated state ID:', id);
        
        await setJson(`gls:${id}`, { device_id }, 600);
        logger.debug('[GoogleAuth] Stored session in Redis');
        
        const params = new URLSearchParams({
          client_id: config.google.clientId,
          redirect_uri: config.google.redirectUri,
          response_type: 'code',
          scope: 'openid email profile',
          state: id,
        });
        
        const authUrl = `https://accounts.google.com/o/oauth2/auth?${params}`;
        logger.debug('[GoogleAuth] Generated auth URL:', authUrl);
        
        return res.json({ url: authUrl });
      } catch (error) {
        logger.debug('[GoogleAuth] /start error:', error);
        logger.error({ error }, 'Google auth start error');
        return res.status(500).json({ error: 'internal_error' });
      }
    }
  );

  r.get('/status/:id', async (req, res) => {
    try {
      logger.debug('[GoogleAuth] /status endpoint called for ID:', req.params.id);
      const session = await getJson<any>(`gls:${req.params.id}`);
      logger.debug('[GoogleAuth] Retrieved session:', session);
      
      if (!session || !session.ready) {
        logger.debug('[GoogleAuth] Session not ready');
        return res.json({ ready: false });
      }
      
      logger.debug('[GoogleAuth] Session ready, returning data');
      return res.json(session);
    } catch (error) {
      logger.debug('[GoogleAuth] /status error:', error);
      logger.error({ error }, 'Google auth status check error');
      return res.status(500).json({ error: 'internal_error' });
    }
  });

  r.get('/callback', 
    authRateLimits.general,
    async (req, res) => {
      const { code, state } = req.query;
      if (typeof code !== 'string' || typeof state !== 'string') {
        return res.status(400).send('Invalid request');
      }
      const session = await getJson<any>(`gls:${state}`);
      if (!session || !session.device_id) {
        return res.status(400).send('Invalid state');
      }
      try {
        const tokenResp = await axios.post(
          'https://oauth2.googleapis.com/token',
          new URLSearchParams({
            code,
            client_id: config.google.clientId,
            client_secret: config.google.clientSecret,
            redirect_uri: config.google.redirectUri,
            grant_type: 'authorization_code',
          }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        const { access_token } = (tokenResp.data as any);
        const userResp = await axios.get(
          `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${access_token}`
        );
        const payload = userResp.data as any;
        const email = payload?.email;
        const emailVerified = payload?.email_verified;
        if (!email) return res.status(400).send('No email');

        const ipAddress = (req as any).ip || (req as any).connection?.remoteAddress;
        const userAgent = (req as any).get('User-Agent');

        // Check if user exists in our new auth system
        let user = await UserService.findByEmail(email);
        
        if (user && (user.provider === 'password' || (user.passwordHash && user.passwordHash.length > 0))) {
          const errorMessage = 'Bu e-posta şifreyle kayıtlı. Lütfen e-posta ve şifrenizle giriş yapın.';
          await auditService.logAuthEvent('login', {
            userId: user.id,
            ipAddress,
            userAgent,
            success: false,
            errorMessage,
          });

          await setJson(`gls:${state}`, {
            ready: true,
            error: 'password_account_exists',
            message: errorMessage,
            deviceId: session.device_id,
          }, 600);

          return res.send('<html><body>Bu e-posta şifreyle kayıtlı. Lütfen uygulamaya dönüp e-posta ve şifrenizle giriş yapın.</body></html>');
        }

        if (!user) {
          // Create new Google user in our auth system (this already handles Firebase Auth + subsc)
          user = await UserService.createGoogleUser(
            email,
            payload?.name || payload?.given_name || ''
          );
          
          logger.info('Google user created successfully via callback', {
            userId: user.id,
            email: user.email,
            operation: 'google_oauth_callback'
          });
        } else {
          // Update last login for existing user
          await UserService.updateUser(user.id, {
            lastLoginAt: new Date(),
            ...(user.provider !== 'google' ? { provider: 'google' } : {}),
          });

          // Also update Firebase Auth user if needed
          try {
            await admin.auth().updateUser(user.id, {
              displayName: payload?.name || payload?.given_name || user.name,
              emailVerified: true,
            });
          } catch (error) {
            logger.warn('Failed to update Firebase Auth user via callback', { error, userId: user.id });
          }
        }

        // Create session using new session system
        const deviceInfo = {
          os: 'unknown',
          model: 'unknown',
          appVersion: '1.0.0',
          platform: 'web',
        };

        const { session: newSession, tokens } = await SessionService.createSession(
          user.id,
          deviceInfo,
          session.device_id,
          ipAddress,
          userAgent
        );

        // Log successful Google auth
        await auditService.logAuthEvent('login', {
          userId: user.id,
          sessionId: newSession.id,
          ipAddress,
          userAgent,
          deviceInfo,
          success: true,
        });

        let firebaseCustomToken: string | undefined;
        try {
          firebaseCustomToken = await admin.auth().createCustomToken(user.id, {
            email: user.email,
            provider: 'google',
          });
        } catch (error) {
          logger.warn('Failed to create Firebase custom token for Google user', {
            error,
            userId: user.id,
            operation: 'google_custom_token',
          });
        }
        
        await setJson(`gls:${state}`, {
          ready: true,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          sessionId: tokens.sessionId,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar: user.avatar,
          },
          deviceId: session.device_id,
          firebaseCustomToken,
          firebase_token: firebaseCustomToken ?? null,
        }, 600);
        
        return res.send('<html><body>Login successful. You may close this window.</body></html>');
      } catch (error) {
        logger.error({ err: error, operation: 'googleAuth' }, 'Google auth error');
        
        // Log the error for debugging
        await auditService.logAuthEvent('login', {
          ipAddress: (req as any).ip || (req as any).connection?.remoteAddress,
          userAgent: (req as any).get('User-Agent'),
          success: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        
        return res.status(500).send('Authentication failed');
      }
    }
  );

  return r;
}

function base64url(b: Buffer | string): string {
  const raw = Buffer.isBuffer(b) ? b : Buffer.from(b);
  return raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(d.getDate() + days);
  return x;
}