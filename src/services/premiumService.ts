import { db } from '../firebase';
import { logger } from '../utils/logger';
import { revenueCatService } from './revenueCatService';

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
    const appUserId = options.appUserId || (await this.resolveAppUserId(userId));

    logger.info({ userId, appUserId }, 'Restoring premium data from RevenueCat');

    const subscriberPayload = (await revenueCatService.fetchSubscriber(appUserId)) as RevenueCatSubscriberPayload;
    const premiumState = this.extractFromSubscriber(subscriberPayload);

    if (!premiumState) {
      logger.info({ userId, appUserId }, 'Premium restore skipped: aktif abonelik bulunamadı');
      throw new PremiumServiceError('ENTITLEMENT_NOT_FOUND', 'Aktif premium abonelik bulunamadı', 404);
    }

    const result = await this.writePremiumRecord(userId, premiumState, {
      source: options.source || 'restore_endpoint',
      origin: 'revenuecat',
      requestId: options.requestId,
    });

    return result;
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
      payload.email = userProfile.email;
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
    try {
      const doc = await db.collection(SUBSC_COLLECTION).doc(userId).get();
      if (doc.exists) {
        const data = doc.data() || {};
        if (data.revenueCatUserId) {
          return data.revenueCatUserId;
        }
      }
    } catch (error) {
      logger.warn({ err: error, userId }, 'Failed to resolve appUserId from subsc collection');
    }
    return userId;
  }
}

export const premiumService = new PremiumService();

