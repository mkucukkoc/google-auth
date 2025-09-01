import { Router } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes } from 'crypto';
import { config } from '../config';
import { setJson, getJson } from '../redis';
import { db } from '../firebase';
import { signAccessJwt } from '../jwt';
import admin from 'firebase-admin';

export function createGoogleAuthRouter(): Router {
  const r = Router();

  r.post('/start', async (req, res) => {
    const { device_id } = req.body || {};
    if (!device_id) return res.status(400).json({ error: 'invalid_request' });
    const id = uuidv4();
    await setJson(`gls:${id}`, { device_id }, 600);
    const params = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: config.google.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
      state: id,
    });
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return res.json({ auth_url: authUrl, login_session_id: id });
  });

  r.get('/session/:id', async (req, res) => {
    const session = await getJson<any>(`gls:${req.params.id}`);
    if (!session || !session.ready) return res.json({ ready: false });
    return res.json(session);
  });

  r.get('/callback', async (req, res) => {
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
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );
      const idToken = tokenResp.data.id_token;
      const payload = jwt.decode(idToken) as any;
      const email = payload?.email;
      const emailVerified = payload?.email_verified;
      if (!email) return res.status(400).send('No email');

      // ensure user exists in Firebase Auth---Firebase authenticationa kayıt atlıyor sadece 
      let userId: string;
      try {
        const userRecord = await admin.auth().getUserByEmail(email);
        userId = userRecord.uid;
        if (emailVerified && !userRecord.emailVerified) {
          await admin.auth().updateUser(userId, { emailVerified: true });
        }
      } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
          const newUser = await admin.auth().createUser({ email, emailVerified: !!emailVerified });
          userId = newUser.uid;
        } else {
          throw err;
        }
      }


      // upsert device
      let deviceId: string;
      const deviceSnap = await db
        .collection('devices')
        .where('userId', '==', userId)
        .where('deviceId', '==', session.device_id)
        .limit(1)
        .get();
      if (deviceSnap.empty) {
        const deviceRef = db.collection('devices').doc();
        await deviceRef.set({ userId, deviceId: session.device_id, deviceName: 'rn-client', createdAt: new Date() });
        deviceId = deviceRef.id;
      } else {
        deviceId = deviceSnap.docs[0].id;
      }

      const rawRefresh = base64url(randomBytes(32));
      const refreshRef = db.collection('refreshTokens').doc();
      await refreshRef.set({
        userId,
        deviceId,
        tokenHash: sha256(rawRefresh),
        expiresAt: addDays(new Date(), config.refreshTtlDays),
        createdAt: new Date(),
      });
      const access = signAccessJwt(userId, deviceId);
      // Firebase custom token for client-side auth
      const firebaseToken = await admin.auth().createCustomToken(userId);
      await setJson(`gls:${state}`, {
        ready: true,
        access_token: access,
        refresh_token: rawRefresh,
        refresh_token_id: refreshRef.id,
        firebase_token: firebaseToken,
      }, 600);
      return res.send('<html><body>Login successful. You may close this window.</body></html>');
    } catch (e) {
      return res.status(400).send('OAuth error');
    }
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
