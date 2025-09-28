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
import * as jwt from 'jsonwebtoken';

export function createAppleAuthRouter(): Router {
  const r = Router();

  r.post('/start', 
    authRateLimits.general,
    async (req, res) => {
      const { device_id } = req.body || {};
      if (!device_id) return res.status(400).json({ error: 'invalid_request' });
      
      const id = uuidv4();
      await setJson(`als:${id}`, { device_id }, 600);
      
      // Generate Apple client secret (JWT)
      const clientSecret = generateAppleClientSecret();
      
      const params = new URLSearchParams({
        client_id: config.apple.clientId,
        redirect_uri: config.apple.redirectUri,
        response_type: 'code',
        scope: 'name email',
        state: id,
        response_mode: 'form_post',
      });
      
      return res.json({ 
        url: `https://appleid.apple.com/auth/authorize?${params}`,
        clientSecret 
      });
    }
  );

  r.get('/status/:id', async (req, res) => {
    const session = await getJson<any>(`als:${req.params.id}`);
    if (!session) return res.json({ ready: false });
    return res.json(session);
  });

  r.post('/callback', 
    authRateLimits.general,
    async (req, res) => {
      const { code, state, user } = req.body;
      if (!code || !state) {
        return res.status(400).send('Invalid request');
      }
      
      const session = await getJson<any>(`als:${state}`);
      if (!session || !session.device_id) {
        return res.status(400).send('Invalid state');
      }
      
      try {
        // Exchange code for access token
        const tokenResp = await axios.post(
          'https://appleid.apple.com/auth/token',
          new URLSearchParams({
            client_id: config.apple.clientId,
            client_secret: generateAppleClientSecret(),
            code,
            grant_type: 'authorization_code',
            redirect_uri: config.apple.redirectUri,
          }),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );
        
        const { access_token, id_token } = tokenResp.data;
        
        // Decode ID token to get user info
        const decodedToken = jwt.decode(id_token) as any;
        const email = decodedToken?.email;
        const name = user?.name ? `${user.name.firstName} ${user.name.lastName}` : '';
        
        if (!email) return res.status(400).send('No email');

        const ipAddress = (req as any).ip || (req as any).connection?.remoteAddress;
        const userAgent = (req as any).get('User-Agent');

        // Check if user exists in our new auth system
        let userRecord = await UserService.findByEmail(email);
        
        if (!userRecord) {
          // Create new Apple user in our auth system
          userRecord = await UserService.createAppleUser(email, name);
        } else {
          // Update last login for existing user
          await UserService.updateUser(userRecord.id, {
            lastLoginAt: new Date(),
          });
        }

        // Create session using new session system
        const deviceInfo = {
          os: 'ios',
          model: 'unknown',
          appVersion: '1.0.0',
          platform: 'mobile',
        };

        const { session: newSession, tokens } = await SessionService.createSession(
          userRecord.id,
          deviceInfo,
          session.device_id,
          ipAddress,
          userAgent
        );

        // Log successful Apple auth
        await auditService.logAuthEvent('login', {
          userId: userRecord.id,
          sessionId: newSession.id,
          ipAddress,
          userAgent,
          deviceInfo,
          success: true,
        });

        // Firebase custom token for client-side auth (keep for compatibility)
        const firebaseToken = await admin.auth().createCustomToken(userRecord.id);
        
        await setJson(`als:${state}`, {
          ready: true,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          sessionId: tokens.sessionId,
          user: {
            id: userRecord.id,
            email: userRecord.email,
            name: userRecord.name,
            avatar: userRecord.avatar,
          },
          deviceId: session.device_id,
          firebase_token: firebaseToken, // Keep for backward compatibility
        }, 600);
        
        return res.send('<html><body>Login successful. You may close this window.</body></html>');
      } catch (error) {
        console.error('Apple auth error:', error);
        
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

function generateAppleClientSecret(): string {
  const now = Math.floor(Date.now() / 1000);
  
  const payload = {
    iss: config.apple.teamId,
    iat: now,
    exp: now + 3600, // 1 hour
    aud: 'https://appleid.apple.com',
    sub: config.apple.clientId,
  };

  const header = {
    alg: 'ES256',
    kid: config.apple.keyId,
  };

  return jwt.sign(payload, config.apple.privateKey, {
    algorithm: 'ES256',
    header,
  });
}

function base64url(b: Buffer | string): string {
  const raw = Buffer.isBuffer(b) ? b : Buffer.from(b);
  return raw.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
