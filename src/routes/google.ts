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
import admin from 'firebase-admin';

export function createGoogleAuthRouter(): Router {
  const r = Router();

  r.post('/start', 
    authRateLimits.general,
    async (req, res) => {
      const { device_id } = req.body || {};
      if (!device_id) return res.status(400).json({ error: 'invalid_request' });
      const id = uuidv4();
      await setJson(`gls:${id}`, { device_id }, 600);
      const params = new URLSearchParams({
        client_id: config.google.clientId,
        redirect_uri: config.google.redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state: id,
      });
      return res.json({ url: `https://accounts.google.com/o/oauth2/auth?${params}` });
    }
  );

  r.get('/status/:id', async (req, res) => {
    const session = await getJson<any>(`gls:${req.params.id}`);
    if (!session || !session.ready) return res.json({ ready: false });
    return res.json(session);
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
        const { access_token } = tokenResp.data;
        const userResp = await axios.get(
          `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${access_token}`
        );
        const payload = userResp.data;
        const email = payload?.email;
        const emailVerified = payload?.email_verified;
        if (!email) return res.status(400).send('No email');

        const ipAddress = (req as any).ip || (req as any).connection?.remoteAddress;
        const userAgent = (req as any).get('User-Agent');

        // Check if user exists in our new auth system
        let user = await UserService.findByEmail(email);
        
        if (!user) {
          // Create new Google user in our auth system
          user = await UserService.createGoogleUser(
            email,
            payload?.name || payload?.given_name || ''
          );
        } else {
          // Update last login for existing user
          await UserService.updateUser(user.id, {
            lastLoginAt: new Date(),
          });
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

        // Firebase custom token for client-side auth (keep for compatibility)
        const firebaseToken = await admin.auth().createCustomToken(user.id);
        
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
          firebase_token: firebaseToken, // Keep for backward compatibility
        }, 600);
        
        return res.send('<html><body>Login successful. You may close this window.</body></html>');
      } catch (error) {
        console.error('Google auth error:', error);
        
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