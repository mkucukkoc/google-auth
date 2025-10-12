import { Router, Request, Response } from 'express';
import { UserService } from '../services/userService';
import { SessionService } from '../services/sessionService';
import { auditService } from '../services/auditService';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import { validate, authSchemas } from '../middleware/validationMiddleware';
import { authRateLimits } from '../middleware/rateLimitMiddleware';
import { RegisterRequest, LoginRequest, RefreshRequest, LogoutRequest, AuthResponse } from '../types/auth';
import { StandardResponse, ResponseBuilder } from '../types/response';
import { admin } from '../firebase';
import { randomInt, createHash } from 'crypto';
import { sendOtpEmail } from '../email';
import { getJson, setJson } from '../redis';
import { db } from '../firebase';
import { logger } from '../utils/logger';
import { config } from '../config';

export function createAuthRouter(): Router {
  const r = Router();

  // POST /auth/register
  r.post('/register', 
    authRateLimits.register,
    validate(authSchemas.register),
    async (req, res) => {
      try {
        const { email, password, device, deviceId, name }: RegisterRequest = req.body;
        const ipAddress = (req as any).ip || (req as any).connection?.remoteAddress;
        const userAgent = (req as any).get('User-Agent');

        // Check if email is already registered
        if (await UserService.isEmailRegistered(email)) {
          await auditService.logAuthEvent('register', {
            ipAddress,
            userAgent,
            deviceInfo: device,
            success: false,
            errorMessage: 'Email already registered',
          });
          return res.status(409).json(ResponseBuilder.error(
            'email_already_registered',
            'An account with this email already exists'
          ));
        }

        // Create user
        const user = await UserService.createUser({ email, password, device, deviceId, name });

        // Create session
        const { session, tokens } = await SessionService.createSession(
          user.id,
          device,
          deviceId,
          ipAddress,
          userAgent
        );

        // Log successful registration
        await auditService.logAuthEvent('register', {
          userId: user.id,
          sessionId: session.id,
          ipAddress,
          userAgent,
          deviceInfo: device,
          success: true,
        });

        const response: AuthResponse = {
          ...tokens,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar: user.avatar,
          },
          deviceId,
        };

        res.status(201).json(ResponseBuilder.success(response, 'User registered successfully'));
      } catch (error) {
        logger.error({ err: error, email: req.body.email, operation: 'register' }, 'Registration error');
        res.status(500).json(ResponseBuilder.error(
          'internal_error',
          'Registration failed'
        ));
      }
    }
  );

  // POST /auth/login
  r.post('/login',
    authRateLimits.login,
    validate(authSchemas.login),
    async (req, res) => {
      try {
        const { email, password, device, deviceId }: LoginRequest = req.body;
        const ipAddress = (req as any).ip || (req as any).connection?.remoteAddress;
        const userAgent = (req as any).get('User-Agent');

        // Find user
        const user = await UserService.findByEmail(email);
        if (!user) {
          await auditService.logAuthEvent('login', {
            ipAddress,
            userAgent,
            deviceInfo: device,
            success: false,
            errorMessage: 'User not found',
          });
          return res.status(401).json({ 
            error: 'invalid_credentials',
            message: 'Invalid email or password' 
          });
        }

        // Check if user is locked
        if (UserService.isUserLocked(user)) {
          await auditService.logAuthEvent('login', {
            userId: user.id,
            ipAddress,
            userAgent,
            deviceInfo: device,
            success: false,
            errorMessage: 'Account locked',
          });
          return res.status(423).json({ 
            error: 'account_locked',
            message: 'Account is temporarily locked due to too many failed attempts' 
          });
        }

        // Verify password
        const isValidPassword = await UserService.verifyPassword(user, password);
        if (!isValidPassword) {
          await UserService.incrementFailedAttempts(user.id);
          await auditService.logAuthEvent('login', {
            userId: user.id,
            ipAddress,
            userAgent,
            deviceInfo: device,
            success: false,
            errorMessage: 'Invalid password',
          });
          return res.status(401).json({ 
            error: 'invalid_credentials',
            message: 'Invalid email or password' 
          });
        }

        // Reset failed attempts on successful login
        await UserService.resetFailedAttempts(user.id);

        // Verify Firebase authentication user exists
        try {
          const firebaseUser = await admin.auth().getUser(user.id);
          logger.info({ userId: firebaseUser.uid, email: firebaseUser.email, operation: 'firebaseVerification' }, 'Firebase user verified for login');
        } catch (error) {
          logger.warn({ err: error, userId: user.id, operation: 'firebaseVerification' }, 'Firebase user verification failed during login');
          // Continue with login even if Firebase verification fails
        }

        // Create session
        const { session, tokens } = await SessionService.createSession(
          user.id,
          device,
          deviceId,
          ipAddress,
          userAgent
        );

        // Log successful login
        await auditService.logAuthEvent('login', {
          userId: user.id,
          sessionId: session.id,
          ipAddress,
          userAgent,
          deviceInfo: device,
          success: true,
        });

        const response: AuthResponse = {
          ...tokens,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar: user.avatar,
          },
          deviceId,
        };

        res.json(response);
      } catch (error) {
        logger.error({ err: error, email: req.body.email, operation: 'login' }, 'Login error');
        res.status(500).json({ 
          error: 'internal_error',
          message: 'Login failed' 
        });
      }
    }
  );

  // POST /auth/refresh
  r.post('/refresh',
    authRateLimits.refresh,
    validate(authSchemas.refresh),
    async (req, res) => {
      try {
        const { refreshToken, sessionId, deviceId }: RefreshRequest = req.body;
        const ipAddress = (req as any).ip || (req as any).connection?.remoteAddress;
        const userAgent = (req as any).get('User-Agent');

        try {
          const result = await SessionService.verifyAndRotateRefreshToken(
            sessionId,
            refreshToken,
            deviceId
          );

          if (!result) {
            await auditService.logAuthEvent('refresh', {
              sessionId,
              ipAddress,
              userAgent,
              success: false,
              errorMessage: 'Invalid session or token',
            });
            return res.status(401).json({ 
              error: 'invalid_refresh_token',
              message: 'Invalid or expired refresh token' 
            });
          }

          // Log successful refresh
          await auditService.logAuthEvent('refresh', {
            userId: result.session.userId,
            sessionId: result.session.id,
            ipAddress,
            userAgent,
            success: true,
          });

          res.json(result.tokens);
        } catch (error: any) {
          if (error.message === 'REUSE_DETECTED') {
            await auditService.logAuthEvent('reuse_detected', {
              sessionId,
              ipAddress,
              userAgent,
              success: false,
              errorMessage: 'Refresh token reuse detected',
            });
            return res.status(401).json({ 
              error: 'token_reuse_detected',
              message: 'Security violation detected. All sessions have been revoked.' 
            });
          }
          throw error;
        }
      } catch (error) {
        logger.error({ err: error, operation: 'refresh' }, 'Refresh error');
        res.status(500).json({ 
          error: 'internal_error',
          message: 'Token refresh failed' 
        });
      }
    }
  );

  // POST /auth/logout
  r.post('/logout',
    authRateLimits.general,
    validate(authSchemas.logout),
    async (req, res) => {
      try {
        const { sessionId }: LogoutRequest = req.body;
        const ipAddress = (req as any).ip || (req as any).connection?.remoteAddress;
        const userAgent = (req as any).get('User-Agent');

        const success = await SessionService.revokeSession(sessionId);

        if (success) {
          await auditService.logAuthEvent('logout', {
            sessionId,
            ipAddress,
            userAgent,
            success: true,
          });
        }

        res.json({ success });
      } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({ 
          error: 'internal_error',
          message: 'Logout failed' 
        });
      }
    }
  );

  // POST /auth/logout-all
  r.post('/logout-all',
    authRateLimits.general,
    authenticateToken,
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const ipAddress = (req as any).ip || (req as any).connection?.remoteAddress;
        const userAgent = (req as any).get('User-Agent');

        await SessionService.revokeAllUserSessions(authReq.user!.id);

        await auditService.logAuthEvent('logout_all', {
          userId: authReq.user!.id,
          ipAddress,
          userAgent,
          success: true,
        });

        res.json({ success: true });
      } catch (error) {
        logger.error('Logout all error:', error);
        res.status(500).json({ 
          error: 'internal_error',
          message: 'Logout failed' 
        });
      }
    }
  );

  // GET /auth/me
  r.get('/me',
    authenticateToken,
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const user = await UserService.findById(authReq.user!.id);
        if (!user) {
          return res.status(404).json({ 
            error: 'user_not_found',
            message: 'User not found' 
          });
        }

        res.json({
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          isEmailVerified: user.isEmailVerified,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
        });
      } catch (error) {
        logger.error('Get user error:', error);
        res.status(500).json({ 
          error: 'internal_error',
          message: 'Failed to get user information' 
        });
      }
    }
  );

  // POST /auth/register/email/start - Send verification code for registration
  r.post('/register/email/start', 
    authRateLimits.register,
    async (req, res) => {
      try {
        const { email } = req.body;
        if (!email) {
          return res.status(400).json({ 
            error: 'invalid_request',
            message: 'Email is required' 
          });
        }

        // Check if email is already registered
        if (await UserService.isEmailRegistered(email)) {
          return res.status(409).json({ 
            error: 'email_already_registered',
            message: 'An account with this email already exists' 
          });
        }

        // Rate limiting for email sending
        const key = `register_otp:rl:${email}`;
        const rl = (await getJson<{ count: number }>(key)) || { count: 0 };
        if (rl.count >= 5) {
          return res.status(429).json({ 
            error: 'rate_limited',
            message: 'Too many verification attempts. Please try again later.' 
          });
        }
        rl.count += 1;
        await setJson(key, rl, 600); // 10 minutes

        // Generate and store OTP
        const code = (randomInt(0, 999999) + '').padStart(6, '0');
        const codeHash = sha256(code);
        await db.collection('registerOtpCodes').add({ 
          email, 
          codeHash, 
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
          createdAt: new Date() 
        });

        // Send email
        try {
          await sendOtpEmail(email, code);
        } catch (emailError) {
          logger.error('Failed to send verification email:', emailError);
          // Don't fail the request if email sending fails
        }

        res.json({ 
          success: true,
          message: 'Verification code sent to your email' 
        });
      } catch (error) {
        logger.error('Send registration OTP error:', error);
        res.status(500).json({ 
          error: 'internal_error',
          message: 'Failed to send verification code' 
        });
      }
    }
  );

  // POST /auth/register/email/verify - Verify code and complete registration
  r.post('/register/email/verify',
    authRateLimits.register,
    async (req, res) => {
      try {
        const { email, otp, password, name, device, deviceId } = req.body;
        
        if (!email || !otp || !password || !device || !deviceId) {
          return res.status(400).json({ 
            error: 'invalid_request',
            message: 'Email, OTP, password, device, and deviceId are required' 
          });
        }

        // Verify OTP - Get all records for email and sort in memory
        const recordSnap = await db
          .collection('registerOtpCodes')
          .where('email', '==', email)
          .get();

        if (recordSnap.empty) {
          return res.status(400).json({ 
            error: 'invalid_otp',
            message: 'Invalid or expired verification code' 
          });
        }

        // Sort by createdAt in memory and get the most recent
        const sortedDocs = recordSnap.docs.sort((a: any, b: any) => {
          const aTime = a.data().createdAt?.toDate ? a.data().createdAt.toDate() : (a.data().createdAt || new Date(0));
          const bTime = b.data().createdAt?.toDate ? b.data().createdAt.toDate() : (b.data().createdAt || new Date(0));
          return bTime.getTime() - aTime.getTime();
        });

        const doc = sortedDocs[0];
        const record = doc.data() as any;
        
        if (record.expiresAt.toDate() < new Date()) {
          await doc.ref.delete(); // Clean up expired code
          return res.status(400).json({ 
            error: 'invalid_otp',
            message: 'Verification code has expired' 
          });
        }

        const isMatch = record.codeHash === sha256(otp);
        if (!isMatch) {
          return res.status(400).json({ 
            error: 'invalid_otp',
            message: 'Invalid verification code' 
          });
        }

        // Clean up the OTP code
        await doc.ref.delete();

        // Check if email is still available (double-check)
        if (await UserService.isEmailRegistered(email)) {
          return res.status(409).json({ 
            error: 'email_already_registered',
            message: 'An account with this email already exists' 
          });
        }

        // Create user
        const user = await UserService.createUser({ email, password, device, deviceId, name });

        // Create session
        const ipAddress = (req as any).ip || (req as any).connection?.remoteAddress;
        const userAgent = (req as any).get('User-Agent');
        const { session, tokens } = await SessionService.createSession(
          user.id,
          device,
          deviceId,
          ipAddress,
          userAgent
        );

        // Log successful registration
        await auditService.logAuthEvent('register', {
          userId: user.id,
          sessionId: session.id,
          ipAddress,
          userAgent,
          deviceInfo: device,
          success: true,
        });

        const response: AuthResponse = {
          ...tokens,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar: user.avatar,
          },
          deviceId,
        };

        res.status(201).json(response);
      } catch (error) {
        logger.error('Verify registration OTP error:', error);
        res.status(500).json({ 
          error: 'internal_error',
          message: 'Registration verification failed' 
        });
      }
    }
  );

  // Google OAuth endpoint
  r.post('/google', 
    authRateLimits.general,
    async (req, res) => {
      try {
        const { idToken, email, name, photo } = req.body;
        
        if (!idToken || !email) {
          return res.status(400).json({ 
            error: 'invalid_request',
            message: 'Missing required fields: idToken and email' 
          });
        }

        // Verify Google ID token
        const { OAuth2Client } = require('google-auth-library');
        const client = new OAuth2Client(config.google.clientId);
        
        let ticket;
        try {
          ticket = await client.verifyIdToken({
            idToken,
            audience: config.google.clientId,
          });
        } catch (error) {
          logger.error('Google ID token verification failed:', error);
          return res.status(401).json({ 
            error: 'invalid_token',
            message: 'Invalid Google ID token' 
          });
        }

        const payload = ticket.getPayload();
        if (!payload || payload.email !== email) {
          return res.status(401).json({ 
            error: 'invalid_token',
            message: 'Token email does not match provided email' 
          });
        }

        const ipAddress = (req as any).ip || (req as any).connection?.remoteAddress;
        const userAgent = (req as any).get('User-Agent');

        // Check if user exists
        let user = await UserService.findByEmail(email);
        
        if (!user) {
          // Create new Google user (this already handles Firebase Auth + subsc)
          user = await UserService.createGoogleUser(
            email,
            name || payload.name || payload.given_name || ''
          );
          
          logger.info('Google user created successfully', {
            userId: user.id,
            email: user.email,
            operation: 'google_oauth'
          });
        } else {
          // Update last login for existing user
          await UserService.updateUser(user.id, {
            lastLoginAt: new Date(),
          });
          
          // Also update Firebase Auth user if needed
          try {
            await admin.auth().updateUser(user.id, {
              displayName: name || payload.name || payload.given_name || user.name,
              emailVerified: true,
            });
          } catch (error) {
            logger.warn('Failed to update Firebase Auth user', { error, userId: user.id });
          }
        }

        // Create session
        const deviceInfo = {
          os: 'mobile',
          model: 'unknown',
          appVersion: '1.0.0',
          platform: 'mobile',
        };

        const { session, tokens } = await SessionService.createSession(
          user.id,
          deviceInfo,
          'google-auth-device', // Device ID for Google auth
          ipAddress,
          userAgent
        );

        // Log successful Google auth
        await auditService.logAuthEvent('login', {
          userId: user.id,
          sessionId: session.id,
          ipAddress,
          userAgent,
          deviceInfo,
          success: true,
        });

        const response: AuthResponse = {
          ...tokens,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar: user.avatar,
          },
          deviceId: 'google-auth-device',
        };

        res.json(response);
      } catch (error) {
        logger.error('Google auth error:', error);
        res.status(500).json({ 
          error: 'internal_error',
          message: 'Google authentication failed' 
        });
      }
    }
  );

  return r;
}

// Helper functions
function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}



