import { Router } from 'express';
import { randomInt, createHash } from 'crypto';
import { sendOtpEmail } from '../email';
import { getJson, setJson } from '../redis';
import { config } from '../config';
import { TokenService } from '../services/tokenService';
import { db } from '../firebase';

export function createEmailOtpRouter(): Router {
  const r = Router();

  r.post('/start', async (req, res) => {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'invalid_request' });
    const key = `otp:rl:${email}`;
    const rl = (await getJson<{ count: number }>(key)) || { count: 0 };
    if (rl.count >= 5) return res.status(429).json({ error: 'rate_limited' });
    rl.count += 1;
    await setJson(key, rl, 600);

    const code = (randomInt(0, 999999) + '').padStart(6, '0');
    const codeHash = sha256(code);
    await db.collection('otpCodes').add({ email, codeHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000), createdAt: new Date() });
    try {
      await sendOtpEmail(email, code);
    } catch {}
    return res.json({ ok: true });
  });

  r.post('/verify', async (req, res) => {
    const { email, otp, device_id, device_name } = req.body || {};
    if (!email || !otp || !device_id) return res.status(400).json({ error: 'invalid_request' });
    const recordSnap = await db
      .collection('otpCodes')
      .where('email', '==', email)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (recordSnap.empty) return res.status(400).json({ error: 'invalid_otp' });
    const doc = recordSnap.docs[0];
    const record = doc.data() as any;
    if (record.expiresAt.toDate() < new Date()) return res.status(400).json({ error: 'invalid_otp' });
    const isMatch = record.codeHash === sha256(otp);
    if (!isMatch) return res.status(400).json({ error: 'invalid_otp' });
    await doc.ref.delete();

    // upsert user
    let userId: string;
    const userSnap = await db.collection('users').where('email', '==', email).limit(1).get();
    if (userSnap.empty) {
      const userRef = db.collection('users').doc();
      await userRef.set({ email, isEmailVerified: true, createdAt: new Date() });
      userId = userRef.id;
    } else {
      userId = userSnap.docs[0].id;
    }

    // upsert device
    let deviceId: string;
    const deviceSnap = await db
      .collection('devices')
      .where('userId', '==', userId)
      .where('deviceId', '==', device_id)
      .limit(1)
      .get();
    if (deviceSnap.empty) {
      const deviceRef = db.collection('devices').doc();
      await deviceRef.set({ userId, deviceId: device_id, deviceName: device_name || 'rn-client', createdAt: new Date() });
      deviceId = deviceRef.id;
    } else {
      deviceId = deviceSnap.docs[0].id;
    }

    const rawRefresh = base64url(Buffer.from(randomInt(0, 2 ** 31 - 1).toString()));
    const refreshRef = db.collection('refreshTokens').doc();
    await refreshRef.set({
      userId,
      deviceId,
      tokenHash: sha256(rawRefresh),
      expiresAt: addDays(new Date(), config.refreshTtlDays),
      createdAt: new Date(),
    });
    const access = await TokenService.createAccessToken(userId, 'email-otp-session');
    return res.json({
      access_token: access,
      refresh_token: rawRefresh,
      refresh_token_id: refreshRef.id,
      user_id: userId,
    });
  });

  return r;
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(d.getDate() + days);
  return x;
}
function base64url(b: Buffer): string {
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}



