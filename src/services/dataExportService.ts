import { promisify } from 'util';
import zlib from 'zlib';
import { db } from '../firebase';
import { logger } from '../utils/logger';
import { config } from '../config';
import { PersonalDataExportResult } from '../types/deleteAccount';

const gzip = promisify(zlib.gzip);

class DataExportService {
  async generateUserExport(userId: string): Promise<PersonalDataExportResult> {
    const [profile, subsc, premium] = await Promise.all([
      db.collection('users').doc(userId).get(),
      db.collection('subsc').doc(userId).get(),
      db.collection('premiumusers').doc(userId).get(),
    ]);

    const chats = await this.fetchCollectionByField(
      'chats',
      'ownerId',
      userId,
      config.dataExport.maxChats
    );

    const sessions = await this.fetchCollectionByField(
      'sessions',
      'userId',
      userId,
      config.dataExport.maxSessions
    );

    const exportPayload = {
      generatedAt: new Date().toISOString(),
      profile: profile.exists ? profile.data() : null,
      subsc: subsc.exists ? subsc.data() : null,
      premium: premium.exists ? premium.data() : null,
      chats,
      sessions,
    };

    const serialized = Buffer.from(JSON.stringify(exportPayload, null, 2), 'utf-8');
    const compressed = await gzip(serialized);

    const fileName = `avenia-export-${userId}-${Date.now()}.json.gz`;

    logger.info(
      {
        userId,
        size: compressed.length,
      },
      'Generated personal data export archive'
    );

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    return {
      archiveBase64: compressed.toString('base64'),
      fileName,
      size: compressed.length,
      generatedAt: exportPayload.generatedAt,
      expiresAt,
    };
  }

  private async fetchCollectionByField(
    collection: string,
    field: string,
    value: string,
    limit: number
  ): Promise<any[]> {
    try {
      const snapshot = await db
        .collection(collection)
        .where(field, '==', value)
        .limit(limit)
        .get();

      return snapshot.docs.map(
        (
          doc: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>
        ) => ({
        id: doc.id,
        ...doc.data(),
        })
      );
    } catch (error) {
      logger.error(
        { err: error, collection, field },
        'Failed to fetch collection for data export'
      );
      return [];
    }
  }
}

export const dataExportService = new DataExportService();

