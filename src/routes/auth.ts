import { Router, Request, Response } from 'express';
import { UserService } from '../services/userService';
import { SessionService } from '../services/sessionService';
import { AuditService } from '../services/auditService';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import { validate, authSchemas } from '../middleware/validationMiddleware';
import { authRateLimits } from '../middleware/rateLimitMiddleware';
import { RegisterRequest, LoginRequest, RefreshRequest, LogoutRequest, AuthResponse } from '../types/auth';
import admin from 'firebase-admin';
import { randomInt, createHash } from 'crypto';
import { sendOtpEmail } from '../email';
import { getJson, setJson } from '../redis';
import { db } from '../firebase';

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
          await AuditService.logAuthEvent('register', {
            ipAddress,
            userAgent,
            deviceInfo: device,
            success: false,
            errorMessage: 'Email already registered',
          });
          return res.status(409).json({ 
            error: 'email_already_registered',
            message: 'An account with this email already exists' 
          });
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
        await AuditService.logAuthEvent('register', {
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
        console.error('Registration error:', error);
        res.status(500).json({ 
          error: 'internal_error',
          message: 'Registration failed' 
        });
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
          await AuditService.logAuthEvent('login', {
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
          await AuditService.logAuthEvent('login', {
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
          await AuditService.logAuthEvent('login', {
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
          console.log('Firebase user verified for login:', firebaseUser.uid, firebaseUser.email);
        } catch (error) {
          console.error('Firebase user verification failed during login:', error);
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
        await AuditService.logAuthEvent('login', {
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
        console.error('Login error:', error);
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
            await AuditService.logAuthEvent('refresh', {
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
          await AuditService.logAuthEvent('refresh', {
            userId: result.session.userId,
            sessionId: result.session.id,
            ipAddress,
            userAgent,
            success: true,
          });

          res.json(result.tokens);
        } catch (error: any) {
          if (error.message === 'REUSE_DETECTED') {
            await AuditService.logAuthEvent('reuse_detected', {
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
        console.error('Refresh error:', error);
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
          await AuditService.logAuthEvent('logout', {
            sessionId,
            ipAddress,
            userAgent,
            success: true,
          });
        }

        res.json({ success });
      } catch (error) {
        console.error('Logout error:', error);
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

        await AuditService.logAuthEvent('logout_all', {
          userId: authReq.user!.id,
          ipAddress,
          userAgent,
          success: true,
        });

        res.json({ success: true });
      } catch (error) {
        console.error('Logout all error:', error);
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
        console.error('Get user error:', error);
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
          console.error('Failed to send verification email:', emailError);
          // Don't fail the request if email sending fails
        }

        res.json({ 
          success: true,
          message: 'Verification code sent to your email' 
        });
      } catch (error) {
        console.error('Send registration OTP error:', error);
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
        const sortedDocs = recordSnap.docs.sort((a, b) => {
          const aTime = a.data().createdAt?.toDate?.() || new Date(0);
          const bTime = b.data().createdAt?.toDate?.() || new Date(0);
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
        await AuditService.logAuthEvent('register', {
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
        console.error('Verify registration OTP error:', error);
        res.status(500).json({ 
          error: 'internal_error',
          message: 'Registration verification failed' 
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



