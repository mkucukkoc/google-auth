import axios from 'axios';
import { config } from '../config';
import { logger } from '../utils/logger';

export interface RevenueCatCheckResult {
  hasActiveSubscription: boolean;
  entitlements: string[];
  blockingEntitlements: string[];
  expirationDates: Record<string, string | null>;
  isSandboxOnly: boolean;
  billingIssuesDetected?: boolean;
  gracePeriodActive?: boolean;
  billingRetryStates?: Record<string, string | null>;
  raw?: any;
}

class RevenueCatService {
  private baseUrl = config.revenueCat.baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');

  private get headers() {
    if (!config.revenueCat.apiKey) {
      throw new Error('Missing RevenueCat API key');
    }

    return {
      Authorization: `Bearer ${config.revenueCat.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async fetchSubscriber(appUserId: string): Promise<any> {
    try {
      const url = `${this.baseUrl}/v1/subscribers/${encodeURIComponent(appUserId)}`;
      const response = await axios.get(url, {
        headers: this.headers,
        timeout: config.revenueCat.timeoutMs,
      });

      return response.data;
    } catch (error) {
      logger.error(
        {
          err: error,
          appUserId,
          operation: 'revenuecat.fetchSubscriber',
        },
        'Failed to fetch subscriber from RevenueCat'
      );
      throw error;
    }
  }

  async createAlias(sourceAppUserId: string, targetAppUserId: string): Promise<void> {
    if (!config.revenueCat.apiKey) {
      throw new Error('Missing RevenueCat API key');
    }

    if (!sourceAppUserId || !targetAppUserId || sourceAppUserId === targetAppUserId) {
      return;
    }

    const url = `${this.baseUrl}/v1/subscribers/${encodeURIComponent(sourceAppUserId)}/alias`;
    try {
      await axios.post(
        url,
        { new_app_user_id: targetAppUserId },
        {
          headers: this.headers,
          timeout: config.revenueCat.timeoutMs,
        }
      );
      logger.info({ sourceAppUserId, targetAppUserId }, 'RevenueCat alias created successfully');
    } catch (error) {
      logger.error({ err: error, sourceAppUserId, targetAppUserId }, 'Failed to create RevenueCat alias');
      throw error;
    }
  }

  async checkActiveSubscription(appUserId: string): Promise<RevenueCatCheckResult> {
    if (!config.revenueCat.apiKey) {
      logger.warn(
        {
          appUserId,
        },
        'RevenueCat API key missing, skipping subscription validation'
      );
      return {
        hasActiveSubscription: false,
        entitlements: [],
        blockingEntitlements: [],
        expirationDates: {},
        isSandboxOnly: false,
      };
    }

    const payload = await this.fetchSubscriber(appUserId);
    const entitlements = payload?.subscriber?.entitlements || {};
    const subscriptions = payload?.subscriber?.subscriptions || {};

    const now = Date.now();
    const expirationDates: Record<string, string | null> = {};
    const blockingEntitlements: string[] = [];
    const entitlementNames: string[] = [];
    let hasActive = false;
    let sandboxOnly = true;
    let gracePeriodActive = false;
    let billingIssuesDetected = false;
    const billingRetryStates: Record<string, string | null> = {};

    Object.entries<any>(entitlements).forEach(([name, entitlement]) => {
      entitlementNames.push(name);
      const expiresDate = entitlement?.expires_date ? new Date(entitlement.expires_date).getTime() : null;
      const isSandbox = entitlement?.environment === 'sandbox' || entitlement?.product_identifier?.includes('sandbox');
      if (!isSandbox) {
        sandboxOnly = false;
      }

      expirationDates[name] = entitlement?.expires_date || null;

      const graceExpires = entitlement?.grace_period_expires_date
        ? new Date(entitlement.grace_period_expires_date).getTime()
        : null;
      if (graceExpires && graceExpires > now) {
        gracePeriodActive = true;
      }

      const isActive = Boolean(expiresDate && expiresDate > now);
      if (isActive) {
        hasActive = true;
        blockingEntitlements.push(name);
      }
    });

    Object.entries<any>(subscriptions).forEach(([productId, subscription]) => {
      const billingIssues =
        subscription?.billing_issues_detected_at || subscription?.unsubscribe_detected_at || null;
      if (billingIssues) {
        billingIssuesDetected = true;
      }
      billingRetryStates[productId] = billingIssues;
    });

    if (config.revenueCat.enforceRealMode !== false && sandboxOnly && hasActive) {
      // Treat sandbox-only entitlements as non-blocking if enforcement enabled
      hasActive = false;
      blockingEntitlements.length = 0;
    }

    return {
      hasActiveSubscription: hasActive,
      entitlements: entitlementNames,
      blockingEntitlements,
      expirationDates,
      isSandboxOnly: sandboxOnly,
      gracePeriodActive,
      billingIssuesDetected,
      billingRetryStates,
      raw: payload,
    };
  }
}

export const revenueCatService = new RevenueCatService();

