import { db } from '../firebase';
import { logger } from '../utils/logger';
import { revenueCatService } from './revenueCatService';
import { DeletedUserRegistryRecord } from '../types/deleteAccount';

const PREMIUM_COLLECTION = 'premiumusers';
const USERS_COLLECTION = 'users';
const SUBSC_COLLECTION = 'subsc';
const REVENUECAT_ENTITLEMENT_ID = process.env.REVENUECAT_ENTITLEMENT_ID || 'premium';

type PremiumStatus = 'monthly' | 'annual' | null;

interface PremiumState {
  premium: boolean;
  premiumStatus: PremiumStatus;
  premiumExpiresAt: string | null;
  entitlementProductId?: string | null;
  environment?: string | null;
  isSandboxOnly?: boolean;
  entitlementIds: string[];
  raw?: any;
}

interface PremiumSyncContext {
  source: string;
  origin: string;
  platform?: string;
  requestId?: string;
}

interface RevenueCatSubscriberPayload {
  subscriber?: {
    entitlements?: {
      active?: Record<string, any>;
      [key: string]: any;
    };
    subscriptions?: Record<string, any>;
  };
}

type DeletedSubscriptionRecord = DeletedUserRegistryRecord & { docId: string };

export class PremiumServiceError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

class PremiumService {
  async syncFromCustomerInfo(
    userId: string,
    payload: { customerInfo: any; platform?: string; source?: string; requestId?: string }
  ) {
    if (!payload?.customerInfo) {
      throw new PremiumServiceError('INVALID_PAYLOAD', 'customerInfo payload is required');
    }

    const premiumState = this.extractFromCustomerInfo(payload.customerInfo);

    if (!premiumState) {
      logger.info(
        { userId, source: payload.source || 'client_customer_info' },
        'Premium sync skipped: aktif entitlement bulunamadı'
      );
      throw new PremiumServiceError('ENTITLEMENT_NOT_FOUND', 'Aktif premium entitlement bulunamadı', 404);
    }

    const result = await this.writePremiumRecord(userId, premiumState, {
      source: payload.source || 'client_customer_info',
      origin: 'client',
      platform: payload.platform,
      requestId: payload.requestId,
    });

    return result;
  }

  async restoreFromRevenueCat(
    userId: string,
    options: { appUserId?: string; requestId?: string; source?: string } = {}
  ) {
    const resolvedAppUserId = options.appUserId || (await this.resolveAppUserId(userId));
    const appUserId = resolvedAppUserId?.toLowerCase?.() ?? resolvedAppUserId;

    if (!appUserId) {
      throw new PremiumServiceError('APP_USER_ID_MISSING', 'RevenueCat uygulama kimliği belirlenemedi', 400);
    }

    logger.info({ userId, appUserId }, 'Premium restore using email identity');

    let subscriberPayload: RevenueCatSubscriberPayload;
    try {
      subscriberPayload = (await revenueCatService.fetchSubscriber(appUserId)) as RevenueCatSubscriberPayload;
    } catch (error: any) {
      if (error?.response?.status === 404 || error?.message?.includes('not found') || error?.message?.includes('404')) {
        logger.warn({ userId, appUserId, error: error.message }, 'RevenueCat subscriber not found - user may need to login via SDK first');
        throw new PremiumServiceError(
          'SUBSCRIBER_NOT_FOUND',
          'RevenueCat\'te bu e-posta ile kullanıcı bulunamadı. Lütfen önce uygulamada giriş yapın.',
          404
        );
      }
      throw error;
    }

    logger.debug({ userId, appUserId, hasSubscriber: !!subscriberPayload?.subscriber, hasEntitlements: !!subscriberPayload?.subscriber?.entitlements }, 'RevenueCat subscriber payload received');

    const premiumState = this.extractFromSubscriber(subscriberPayload);

    if (!premiumState) {
      const hasSubscriber = !!subscriberPayload?.subscriber;
      const hasActiveEntitlements = !!subscriberPayload?.subscriber?.entitlements?.active;
      const activeEntitlements = subscriberPayload?.subscriber?.entitlements?.active;
      const activeEntitlementKeys = activeEntitlements ? Object.keys(activeEntitlements) : [];
      
      logger.info(
        { 
          userId, 
          appUserId, 
          hasSubscriber,
          hasActiveEntitlements,
          activeEntitlementKeys,
          lookingFor: REVENUECAT_ENTITLEMENT_ID
        }, 
        'Premium restore skipped: aktif abonelik bulunamadı'
      );
      throw new PremiumServiceError('ENTITLEMENT_NOT_FOUND', 'Aktif premium abonelik bulunamadı', 404);
    }

    const result = await this.writePremiumRecord(userId, premiumState, {
      source: options.source || 'restore_endpoint',
      origin: 'revenuecat',
      requestId: options.requestId,
    });

    return result;
  }

  async restoreTransferredSubscription(params: {
    currentUid: string;
    email: string;
    oldAppUserId?: string;
    requestId?: string;
    platform?: string;
  }): Promise<any> {
    const { currentUid, email, oldAppUserId, requestId, platform } = params;
    logger.info({ currentUid, email, oldAppUserId, platform }, 'Premium restore transfer requested');

    const deletedRecord = await this.findDeletedSubscriptionRecord(email, oldAppUserId);
    if (!deletedRecord) {
      if (!email) {
        throw new PremiumServiceError('RESTORE_SOURCE_NOT_FOUND', 'Geçmiş premium kaydı bulunamadı', 404);
      }
      logger.info({ currentUid, email }, 'No deleted subscription record found, falling back to email restore');
      return this.restoreFromRevenueCat(currentUid, {
        appUserId: email.toLowerCase(),
        requestId,
        source: 'restore_fallback',
      });
    }

    await db
      .collection('deleted_users_subsc')
      .doc(deletedRecord.docId)
      .set(
        {
          restoreAttemptedAt: new Date().toISOString(),
          lastRestoreRequestId: requestId || null,
        },
        { merge: true }
      )
      .catch((error: unknown) =>
        logger.warn({ err: error, docId: deletedRecord.docId }, 'Failed to log restore attempt')
      );

    const targetEmail = (deletedRecord.email || email || '').toLowerCase();
    if (!targetEmail) {
      throw new PremiumServiceError('RESTORE_SOURCE_INVALID', 'Geçerli bir e-posta bulunamadı', 400);
    }

    return this.restoreFromRevenueCat(currentUid, {
      appUserId: targetEmail,
      requestId,
      source: 'restore_transfer',
    });
  }

  async syncFromRevenueCat(
    userId: string,
    options: { appUserId?: string; requestId?: string; source?: string } = {}
  ) {
    return this.restoreFromRevenueCat(userId, { ...options, source: options.source || 'manual_sync' });
  }

  async getStatus(userId: string) {
    const doc = await db.collection(PREMIUM_COLLECTION).doc(userId).get();
    if (!doc.exists) {
      return null;
    }
    return doc.data();
  }

  private async findDeletedSubscriptionRecord(
    email: string,
    providedAppUserId?: string
  ): Promise<DeletedSubscriptionRecord | null> {
    try {
      const snapshot = await db
        .collection('deleted_users_subsc')
        .where('email', '==', email)
        .limit(25)
        .get();
      if (snapshot.empty) {
        return null;
      }
      const candidates: DeletedSubscriptionRecord[] = snapshot.docs
        .map((doc: any) => ({ docId: doc.id, ...(doc.data() as DeletedUserRegistryRecord) }))
        .sort((a: DeletedSubscriptionRecord, b: DeletedSubscriptionRecord) => {
          const aDate = a.deleteDate || a.deletedAt;
          const bDate = b.deleteDate || b.deletedAt;
          return (bDate || '').localeCompare(aDate || '');
        });

      if (providedAppUserId) {
        const match = candidates.find(
          doc =>
            doc.oldAppUserId === providedAppUserId ||
            doc.uid === providedAppUserId ||
            doc.docId === providedAppUserId
        );
        if (match) {
          return match;
        }
      }

      return candidates[0];
    } catch (error) {
      logger.error({ err: error, email }, 'Failed to query deleted subscription record');
      return null;
    }
  }

  private extractFromCustomerInfo(customerInfo: any): PremiumState | null {
    const activeEntitlements = customerInfo?.entitlements?.active || {};
    const entitlement = activeEntitlements[REVENUECAT_ENTITLEMENT_ID];

    if (!entitlement) {
      return null;
    }

    const activeSubscriptions: string[] = customerInfo?.activeSubscriptions ?? [];
    const basePlanId = this.getBasePlanIdFromSubscriptions(activeSubscriptions);
    const premiumStatus = this.determinePremiumStatus(basePlanId);

    const premiumExpiresAt =
      entitlement?.expirationDate ||
      entitlement?.expiresDate ||
      entitlement?.expiration_date ||
      entitlement?.expires_date ||
      null;

    const entitlementIds = Object.keys(activeEntitlements);

    return {
      premium: Boolean(entitlement?.isActive ?? entitlement?.is_active ?? true),
      premiumStatus,
      premiumExpiresAt,
      entitlementProductId: entitlement?.productIdentifier || entitlement?.product_identifier,
      environment: entitlement?.environment || null,
      isSandboxOnly: entitlement?.environment === 'sandbox',
      entitlementIds,
      raw: customerInfo,
    };
  }

  private extractFromSubscriber(payload: RevenueCatSubscriberPayload): PremiumState | null {
    const activeEntitlements = payload?.subscriber?.entitlements?.active || {};
    const entitlement = activeEntitlements[REVENUECAT_ENTITLEMENT_ID];

    if (!entitlement) {
      return null;
    }

    const subscriptions = payload?.subscriber?.subscriptions || {};
    const basePlanId = this.getBasePlanIdFromSubscriptionEntries(subscriptions);
    const premiumStatus = this.determinePremiumStatus(basePlanId);

    const expiresAt = entitlement?.expires_date || entitlement?.expiration_date || null;
    const entitlementIds = Object.keys(activeEntitlements);

    const premiumActive = this.isEntitlementActive(expiresAt);

    return {
      premium: premiumActive,
      premiumStatus,
      premiumExpiresAt: expiresAt,
      entitlementProductId: entitlement?.product_identifier || entitlement?.productIdentifier,
      environment: entitlement?.environment || null,
      isSandboxOnly: entitlement?.environment === 'sandbox',
      entitlementIds,
      raw: payload,
    };
  }

  private isEntitlementActive(expiresAt: string | null) {
    if (!expiresAt) {
      return true;
    }
    const expiration = new Date(expiresAt).getTime();
    return Number.isNaN(expiration) ? true : expiration > Date.now();
  }

  private getBasePlanIdFromSubscriptions(subscriptions: string[]): string | null {
    if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
      return null;
    }

    const prioritized = subscriptions.find((subscriptionId) => {
      const normalized = subscriptionId.toLowerCase();
      return (
        normalized.includes('monthly') ||
        normalized.includes('month') ||
        normalized.includes('annual') ||
        normalized.includes('year')
      );
    });

    const selected = prioritized ?? subscriptions[0];
    if (!selected) {
      return null;
    }

    const [, basePlanId] = selected.split(':');
    return (basePlanId ?? selected).toLowerCase();
  }

  private getBasePlanIdFromSubscriptionEntries(subscriptions: Record<string, any>): string | null {
    const entries = Object.entries(subscriptions || {});
    if (entries.length === 0) {
      return null;
    }

    const prioritized = entries.find(([productId]) => {
      const normalized = productId.toLowerCase();
      return (
        normalized.includes('monthly') ||
        normalized.includes('month') ||
        normalized.includes('annual') ||
        normalized.includes('year')
      );
    });

    const [selectedId, selectedSubscription] = prioritized ?? entries[0];
    if (!selectedId && !selectedSubscription?.product_identifier) {
      return null;
    }

    const identifier = selectedSubscription?.product_identifier || selectedId;
    const [, basePlanId] = identifier.split(':');
    return (basePlanId ?? identifier).toLowerCase();
  }

  private determinePremiumStatus(basePlanId: string | null): PremiumStatus {
    if (!basePlanId) {
      return null;
    }
    if (basePlanId.includes('annual') || basePlanId.includes('year')) {
      return 'annual';
    }
    if (basePlanId.includes('monthly') || basePlanId.includes('month')) {
      return 'monthly';
    }
    return null;
  }

  private async writePremiumRecord(userId: string, state: PremiumState, context: PremiumSyncContext) {
    const now = new Date().toISOString();
    const docRef = db.collection(PREMIUM_COLLECTION).doc(userId);
    const userProfile = await this.fetchUserProfile(userId);

    const payload: Record<string, any> = {
      uid: userId,
      premium: state.premium,
      premiumStatus: state.premiumStatus,
      premiumExpiresAt: state.premiumExpiresAt,
      entitlementProductId: state.entitlementProductId ?? null,
      entitlementEnvironment: state.environment ?? null,
      isSandboxOnly: state.isSandboxOnly ?? null,
      entitlementIds: state.entitlementIds,
      lastSyncSource: context.source,
      lastSyncOrigin: context.origin,
      lastSyncPlatform: context.platform || null,
      lastSyncRequestId: context.requestId || null,
      updatedAt: now,
    };

    if (userProfile?.email) {
      payload.email = userProfile.email.toLowerCase();
    }
    if (userProfile?.name) {
      payload.name = userProfile.name;
    }

    await docRef.set(payload, { merge: true });

    logger.info(
      {
        userId,
        premium: state.premium,
        premiumStatus: state.premiumStatus,
        expiresAt: state.premiumExpiresAt,
        source: context.source,
        origin: context.origin,
      },
      'Premium record updated'
    );

    return payload;
  }

  private async fetchUserProfile(userId: string) {
    try {
      const doc = await db.collection(USERS_COLLECTION).doc(userId).get();
      if (!doc.exists) {
        return null;
      }
      const data = doc.data() || {};
      return {
        email: data.email,
        name: data.name || data.displayName || data.fullName,
      };
    } catch (error) {
      logger.warn({ err: error, userId }, 'Failed to fetch user profile for premium sync');
      return null;
    }
  }

  private async resolveAppUserId(userId: string) {
    const profile = await this.fetchUserProfile(userId);
    if (profile?.email) {
      return profile.email.toLowerCase();
    }

    const fallbackEmail = await this.fetchSubscEmail(userId);
    if (fallbackEmail) {
      return fallbackEmail.toLowerCase();
    }

    return userId;
  }

  private async fetchSubscEmail(userId: string): Promise<string | null> {
    try {
      const doc = await db.collection(SUBSC_COLLECTION).doc(userId).get();
      if (!doc.exists) {
        return null;
      }
      const data = doc.data() || {};
      if (typeof data.email === 'string' && data.email.trim().length > 0) {
        return data.email.trim();
      }
    } catch (error) {
      logger.warn({ err: error, userId }, 'Failed to fetch subsc email for premium sync');
    }
    return null;
  }
}

export const premiumService = new PremiumService();

