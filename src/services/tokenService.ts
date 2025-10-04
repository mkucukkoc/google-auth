import { SignJWT, jwtVerify } from 'jose';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { AccessTokenClaims } from '../types/auth';

export class TokenService {
  private static readonly secret = new TextEncoder().encode(config.jwt.hsSecret);

  /**
   * Generate a secure random refresh token
   */
  static generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Create access token with required claims
   */
  static async createAccessToken(
    userId: string,
    sessionId: string,
    jti?: string
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (config.jwt.accessTtlMin * 60);

    const token = await new SignJWT({
      sub: userId,
      sid: sessionId,
      jti: jti || uuidv4(),
      iat: now,
      exp,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .setIssuer(config.jwt.iss)
      .setAudience(config.jwt.aud)
      .sign(this.secret);

    return token;
  }

  /**
   * Verify and decode access token
   */
  static async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      console.log('[TokenService] verifyAccessToken START:', {
        tokenLength: token.length,
        tokenPreview: token.substring(0, 20) + '...',
        issuer: config.jwt.iss,
        audience: config.jwt.aud,
        secretLength: this.secret.length,
        secretPreview: Array.from(this.secret).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('')
      });

      // First, try to decode without verification to see what's in the token
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          console.log('[TokenService] Token decode (no verification):', {
            header,
            payload: {
              sub: payload.sub,
              sid: payload.sid,
              jti: payload.jti,
              iat: payload.iat,
              exp: payload.exp,
              iss: payload.iss,
              aud: payload.aud
            }
          });
        }
      } catch (decodeError) {
        console.log('[TokenService] Token decode failed:', decodeError);
      }

      const { payload } = await jwtVerify(token, this.secret, {
        issuer: config.jwt.iss,
        audience: config.jwt.aud,
        algorithms: ['HS256'],
      });

      console.log('[TokenService] verifyAccessToken SUCCESS:', {
        userId: payload.sub,
        sessionId: payload.sid,
        jti: payload.jti,
        iat: payload.iat,
        exp: payload.exp
      });

      return payload as unknown as AccessTokenClaims;
    } catch (error) {
      console.log('[TokenService] verifyAccessToken ERROR:', {
        error: error instanceof Error ? error.message : String(error),
        tokenLength: token.length,
        tokenPreview: token.substring(0, 20) + '...'
      });
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Extract token expiration time
   */
  static getTokenExpiration(token: string): number {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return payload.exp * 1000; // Convert to milliseconds
    } catch {
      return 0;
    }
  }

  /**
   * Check if token is expired
   */
  static isTokenExpired(token: string): boolean {
    const exp = this.getTokenExpiration(token);
    return exp < Date.now();
  }
}
