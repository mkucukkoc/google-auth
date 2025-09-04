"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmailOtpRouter = createEmailOtpRouter;
const express_1 = require("express");
const crypto_1 = require("crypto");
const email_1 = require("../email");
const redis_1 = require("../redis");
const config_1 = require("../config");
const tokenService_1 = require("../services/tokenService");
const firebase_1 = require("../firebase");
function createEmailOtpRouter() {
    const r = (0, express_1.Router)();
    r.post('/start', async (req, res) => {
        const { email } = req.body || {};
        if (!email)
            return res.status(400).json({ error: 'invalid_request' });
        const key = `otp:rl:${email}`;
        const rl = (await (0, redis_1.getJson)(key)) || { count: 0 };
        if (rl.count >= 5)
            return res.status(429).json({ error: 'rate_limited' });
        rl.count += 1;
        await (0, redis_1.setJson)(key, rl, 600);
        const code = ((0, crypto_1.randomInt)(0, 999999) + '').padStart(6, '0');
        const codeHash = sha256(code);
        await firebase_1.db.collection('otpCodes').add({ email, codeHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000), createdAt: new Date() });
        try {
            await (0, email_1.sendOtpEmail)(email, code);
        }
        catch { }
        return res.json({ ok: true });
    });
    r.post('/verify', async (req, res) => {
        const { email, otp, device_id, device_name } = req.body || {};
        if (!email || !otp || !device_id)
            return res.status(400).json({ error: 'invalid_request' });
        const recordSnap = await firebase_1.db
            .collection('otpCodes')
            .where('email', '==', email)
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
        if (recordSnap.empty)
            return res.status(400).json({ error: 'invalid_otp' });
        const doc = recordSnap.docs[0];
        const record = doc.data();
        if (record.expiresAt.toDate() < new Date())
            return res.status(400).json({ error: 'invalid_otp' });
        const isMatch = record.codeHash === sha256(otp);
        if (!isMatch)
            return res.status(400).json({ error: 'invalid_otp' });
        await doc.ref.delete();
        // upsert user
        let userId;
        const userSnap = await firebase_1.db.collection('users').where('email', '==', email).limit(1).get();
        if (userSnap.empty) {
            const userRef = firebase_1.db.collection('users').doc();
            await userRef.set({ email, isEmailVerified: true, createdAt: new Date() });
            userId = userRef.id;
        }
        else {
            userId = userSnap.docs[0].id;
        }
        // upsert device
        let deviceId;
        const deviceSnap = await firebase_1.db
            .collection('devices')
            .where('userId', '==', userId)
            .where('deviceId', '==', device_id)
            .limit(1)
            .get();
        if (deviceSnap.empty) {
            const deviceRef = firebase_1.db.collection('devices').doc();
            await deviceRef.set({ userId, deviceId: device_id, deviceName: device_name || 'rn-client', createdAt: new Date() });
            deviceId = deviceRef.id;
        }
        else {
            deviceId = deviceSnap.docs[0].id;
        }
        const rawRefresh = base64url(Buffer.from((0, crypto_1.randomInt)(0, 2 ** 31 - 1).toString()));
        const refreshRef = firebase_1.db.collection('refreshTokens').doc();
        await refreshRef.set({
            userId,
            deviceId,
            tokenHash: sha256(rawRefresh),
            expiresAt: addDays(new Date(), config_1.config.refreshTtlDays),
            createdAt: new Date(),
        });
        const access = await tokenService_1.TokenService.createAccessToken(userId, 'email-otp-session');
        return res.json({
            access_token: access,
            refresh_token: rawRefresh,
            refresh_token_id: refreshRef.id,
            user_id: userId,
        });
    });
    return r;
}
function sha256(input) {
    return (0, crypto_1.createHash)('sha256').update(input).digest('hex');
}
function addDays(d, days) {
    const x = new Date(d);
    x.setDate(d.getDate() + days);
    return x;
}
function base64url(b) {
    return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
