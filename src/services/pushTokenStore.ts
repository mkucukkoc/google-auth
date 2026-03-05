import { db } from '../firebase';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase-admin/firestore';
import { logger } from '../utils/logger';

export type StoredPushToken = {
  id: string;
  userId: string;
  expoPushToken: string;
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
  isActive: boolean;
  lastUsed?: Date;
  createdAt?: Date;
};

const COLLECTION = 'user_push_tokens';

const buildDocId = (userId: string, deviceId: string) => `${userId}_${deviceId}`;

const normalizeToken = (docId: string, data: any): StoredPushToken => ({
  id: docId,
  userId: data.userId,
  expoPushToken: data.expoPushToken,
  deviceId: data.deviceId,
  platform: data.platform,
  isActive: Boolean(data.isActive),
  lastUsed: data.lastUsed?.toDate ? data.lastUsed.toDate() : data.lastUsed,
  createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
});

export const pushTokenStore = {
  async save(token: Omit<StoredPushToken, 'id'>): Promise<string> {
    const docId = buildDocId(token.userId, token.deviceId);
    await db.collection(COLLECTION).doc(docId).set(
      {
        ...token,
        id: docId,
        lastUsed: token.lastUsed || new Date(),
        createdAt: token.createdAt || new Date(),
      },
      { merge: true }
    );
    logger.debug({ userId: token.userId, deviceId: token.deviceId }, 'Push token saved');
    return docId;
  },

  async getByUser(userId: string): Promise<StoredPushToken[]> {
    const snapshot = await db
      .collection(COLLECTION)
      .where('userId', '==', userId)
      .where('isActive', '==', true)
      .get();
    return snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) =>
      normalizeToken(doc.id, doc.data())
    );
  },

  async getByUsers(userIds: string[]): Promise<StoredPushToken[]> {
    if (userIds.length === 0) return [];
    const chunkSize = 10;
    const chunks: string[][] = [];
    for (let i = 0; i < userIds.length; i += chunkSize) {
      chunks.push(userIds.slice(i, i + chunkSize));
    }
    const results: StoredPushToken[] = [];
    for (const chunk of chunks) {
      const snapshot = await db
        .collection(COLLECTION)
        .where('userId', 'in', chunk)
        .where('isActive', '==', true)
        .get();
      snapshot.docs.forEach((doc: QueryDocumentSnapshot<DocumentData>) =>
        results.push(normalizeToken(doc.id, doc.data()))
      );
    }
    return results;
  },

  async getAllActive(): Promise<StoredPushToken[]> {
    const snapshot = await db.collection(COLLECTION).where('isActive', '==', true).get();
    return snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) =>
      normalizeToken(doc.id, doc.data())
    );
  },

  async getByDevice(userId: string, deviceId: string): Promise<StoredPushToken | null> {
    const docId = buildDocId(userId, deviceId);
    const docSnap = await db.collection(COLLECTION).doc(docId).get();
    if (!docSnap.exists) return null;
    return normalizeToken(docId, docSnap.data());
  },

  async update(docId: string, updateData: Partial<StoredPushToken>): Promise<void> {
    await db.collection(COLLECTION).doc(docId).set(updateData, { merge: true });
  },
};
