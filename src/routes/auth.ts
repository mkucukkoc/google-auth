import { Router } from 'express';
import { randomBytes, createHash } from 'crypto';
import { config } from '../config';
import { signAccessJwt } from '../jwt';
import { db } from '../firebase';

export function createAuthRouter(): Router {
  const r = Router();

  // POST /auth/refresh
  r.post('/refresh', async (req, res) => {
    const { refresh_token, device_id } = req.body || {};
    const refreshId = req.headers['x-refresh-id'];
    if (!refresh_token || typeof refreshId !== 'string' || !device_id) {
      return res.status(400).json({ error: 'invalid_request' });
    }
    const tokenHash = sha256(refresh_token);
    const currentSnap = await db.collection('refreshTokens').doc(refreshId).get();
    if (!currentSnap.exists) {
      return res.status(401).json({ error: 'invalid_refresh' });
    }
    const current = currentSnap.data() as any;
    if (current.revokedAt || current.replacedBy) {
      return res.status(401).json({ error: 'invalid_refresh' });
    }
    if (current.deviceId !== req.body.device_id) {
      return res.status(401).json({ error: 'device_mismatch' });
    }
    if (current.tokenHash !== tokenHash) {
      const query = await db
        .collection('refreshTokens')
        .where('userId', '==', current.userId)
        .where('revokedAt', '==', null)
        .get();
      const batch = db.batch();
      query.forEach((doc) => batch.update(doc.ref, { revokedAt: new Date() }));
      await batch.commit();
      return res.status(401).json({ error: 'reuse_detected' });
    }
    if (current.expiresAt.toDate() < new Date()) {
      return res.status(401).json({ error: 'expired' });
    }
    // rotate
    const nextRaw = randomToken();
    const nextHash = sha256(nextRaw);
    const nextRef = db.collection('refreshTokens').doc();
    await nextRef.set({
      userId: current.userId,
      deviceId: current.deviceId,
      tokenHash: nextHash,
      expiresAt: addDays(new Date(), config.refreshTtlDays),
      createdAt: new Date(),
    });
    await currentSnap.ref.update({ replacedBy: nextRef.id, revokedAt: new Date() });
    const access = signAccessJwt(current.userId, current.deviceId);
    return res.json({
      access_token: access,
      refresh_token: nextRaw,
      refresh_token_id: nextRef.id,
      user_id: current.userId,
    });
  });

  // POST /auth/logout
  r.post('/logout', async (req, res) => {
    const refreshId = req.headers['x-refresh-id'];
    const { device_id } = req.body || {};
    if (typeof refreshId !== 'string' || !device_id) return res.status(400).json({ error: 'invalid_request' });
    const rtSnap = await db.collection('refreshTokens').doc(refreshId).get();
    if (rtSnap.exists) {
      const rt = rtSnap.data() as any;
      if (rt.deviceId === device_id && !rt.revokedAt) {
        await rtSnap.ref.update({ revokedAt: new Date() });
      }
    }
    return res.json({ ok: true });
  });

  // POST /auth/logout_all
  r.post('/logout_all', async (req, res) => {
    const refreshId = req.headers['x-refresh-id'];
    if (typeof refreshId !== 'string') return res.status(400).json({ error: 'invalid_request' });
    const rtSnap = await db.collection('refreshTokens').doc(refreshId).get();
    if (rtSnap.exists) {
      const rt = rtSnap.data() as any;
      const query = await db
        .collection('refreshTokens')
        .where('userId', '==', rt.userId)
        .where('revokedAt', '==', null)
        .get();
      const batch = db.batch();
      query.forEach((doc) => batch.update(doc.ref, { revokedAt: new Date() }));
      await batch.commit();
    }
    return res.json({ ok: true });
  });

  // GET /user/me
  r.get('/me', async (req, res) => {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ error: 'unauthorized' });
    const token = header.split(' ')[1];
    try {
      const { verifyAccessJwt } = await import('../jwt');
      const claims = verifyAccessJwt(token);
      const userSnap = await db.collection('users').doc(claims.sub).get();
      if (!userSnap.exists) return res.status(404).json({ error: 'not_found' });
      const user = userSnap.data() as any;
      return res.json({ id: userSnap.id, email: user.email, is_email_verified: user.isEmailVerified });
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }
  });
  return r;
}

function randomToken(): string {
  return base64url(randomBytes(32));
}
function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
function base64url(b: Buffer | string): string {
  const raw = Buffer.isBuffer(b) ? b : Buffer.from(b);
  return raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(d.getDate() + days);
  return x;
}



