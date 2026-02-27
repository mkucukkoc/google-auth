import { db, FieldValue } from '../firebase';
import { logger } from '../utils/logger';
import {
  CoinProvider,
  CoinTransaction,
  CoinUser,
  GenerationJob,
  GenerationKind,
} from '../types/coin';

const COIN_USERS_COLLECTION = 'coin_users';
const COIN_TRANSACTIONS_COLLECTION = 'coin_transactions';
const GENERATION_JOBS_COLLECTION = 'generation_jobs';

const DEFAULT_COIN_PACKAGES: Record<string, number> = {
  coin_30: 30,
  coin_50: 50,
  coin_100: 100,
  coin_250: 250,
};

const summarizeValue = (value?: string | null, max = 160) => {
  if (!value) return value;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...[len=${value.length}]`;
};

const sanitizeForFirestore = (value: any): any => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    const cleaned = value
      .map((item) => sanitizeForFirestore(item))
      .filter((item) => item !== undefined);
    return cleaned;
  }
  if (typeof value === 'object') {
    const output: Record<string, any> = {};
    Object.entries(value).forEach(([key, val]) => {
      const cleaned = sanitizeForFirestore(val);
      if (cleaned !== undefined) {
        output[key] = cleaned;
      }
    });
    return output;
  }
  return value;
};

const sanitizeMetadata = (metadata?: Record<string, any> | null) => {
  if (!metadata) return metadata;
  const cleaned = sanitizeForFirestore(metadata) as Record<string, any> | null;
  if (!cleaned) return cleaned;
  const copy = { ...cleaned };
  if (typeof copy.purchaseToken === 'string') {
    copy.purchaseToken = summarizeValue(copy.purchaseToken);
  }
  if (typeof copy.receipt === 'string') {
    copy.receipt = summarizeValue(copy.receipt);
  }
  return copy;
};

const logCoinEvent = (step: string, data: Record<string, any>) => {
  logger.info({ step, ...data }, `[CoinService] ${step}`);
};

type TransactionLike = {
  get: (ref: any) => Promise<any>;
  set: (ref: any, data: any, options?: any) => Promise<void>;
  update: (ref: any, data: any) => Promise<void>;
};

const toNumber = (value: any, fallback = 0) => {
  const asNumber = Number(value);
  return Number.isFinite(asNumber) ? asNumber : fallback;
};

const buildUserDoc = (uid: string, overrides?: Partial<CoinUser>): CoinUser => ({
  uid,
  balance: 0,
  lifetimePurchased: 0,
  lifetimeSpent: 0,
  createdAt: FieldValue.serverTimestamp(),
  updatedAt: FieldValue.serverTimestamp(),
  ...overrides,
});

const resolveCoinAmount = (productId?: string | null, coinsOverride?: number | null): number | null => {
  if (Number.isFinite(coinsOverride)) {
    return Math.max(0, Number(coinsOverride));
  }
  if (!productId) {
    return null;
  }
  const normalized = productId.toLowerCase();
  return DEFAULT_COIN_PACKAGES[normalized] ?? null;
};

const ensureProvider = (provider?: string | null): CoinProvider => {
  switch ((provider || '').toLowerCase()) {
    case 'google':
    case 'google_play':
      return 'google';
    case 'apple':
    case 'app_store':
    case 'appstore':
      return 'apple';
    case 'revenuecat':
      return 'revenuecat';
    case 'app':
      return 'app';
    default:
      return 'unknown';
  }
};

const runTransaction = async <T>(handler: (tx: TransactionLike) => Promise<T>): Promise<T> => {
  const runner = (db as any)?.runTransaction;
  if (typeof runner === 'function') {
    return runner.call(db, async (tx: TransactionLike) => handler(tx));
  }

  logger.warn('Firestore transaction unavailable, falling back to non-atomic coin operation');
  const txLike: TransactionLike = {
    get: (ref) => ref.get(),
    set: (ref, data, options) => ref.set(data, options),
    update: (ref, data) => ref.update(data),
  };
  return handler(txLike);
};

export class CoinServiceError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'CoinServiceError';
  }
}

interface VerifyPurchaseInput {
  uid: string;
  provider?: string;
  productId?: string | null;
  transactionId?: string | null;
  providerEventId?: string | null;
  platform?: string | null;
  coins?: number | null;
  metadata?: Record<string, any> | null;
}

interface SpendInput {
  uid: string;
  kind: GenerationKind;
  costCoins: number;
  input?: Record<string, any> | null;
  requestId?: string | null;
}

interface WebhookInput {
  provider?: string | null;
  eventId?: string | null;
  uid?: string | null;
  productId?: string | null;
  status?: string | null;
  coins?: number | null;
  metadata?: Record<string, any> | null;
}

interface JobUpdateInput {
  uid: string;
  jobId: string;
  status?: 'queued' | 'running' | 'success' | 'failed';
  output?: Record<string, any> | null;
}

class CoinService {
  async getBalance(uid: string): Promise<CoinUser> {
    logCoinEvent('get_balance_start', { uid });
    if (!uid) {
      throw new CoinServiceError('UID_REQUIRED', 'UID zorunludur');
    }

    const userRef = db.collection(COIN_USERS_COLLECTION).doc(uid);
    const snapshot = await userRef.get();
    if (!snapshot.exists) {
      const freshUser = buildUserDoc(uid);
      await userRef.set(freshUser);
      logCoinEvent('get_balance_created', { uid, balance: freshUser.balance });
      return freshUser;
    }

    const data = snapshot.data() || {};
    const resolved = buildUserDoc(uid, {
      balance: toNumber(data.balance, 0),
      lifetimePurchased: toNumber(data.lifetimePurchased, 0),
      lifetimeSpent: toNumber(data.lifetimeSpent, 0),
      createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: data.updatedAt ?? FieldValue.serverTimestamp(),
    });
    logCoinEvent('get_balance_success', {
      uid,
      balance: resolved.balance,
      lifetimePurchased: resolved.lifetimePurchased,
      lifetimeSpent: resolved.lifetimeSpent,
    });
    return resolved;
  }

  async verifyPurchase(input: VerifyPurchaseInput) {
    logCoinEvent('verify_purchase_start', {
      uid: input.uid,
      provider: input.provider,
      productId: input.productId,
      transactionId: input.transactionId,
      providerEventId: input.providerEventId,
      platform: input.platform,
      coinsOverride: input.coins,
      metadata: sanitizeMetadata(input.metadata),
    });
    const uid = input.uid;
    if (!uid) {
      throw new CoinServiceError('UID_REQUIRED', 'UID zorunludur');
    }

    const transactionId =
      input.transactionId ||
      input.providerEventId ||
      input.metadata?.purchaseToken ||
      input.metadata?.receipt ||
      null;

    if (!transactionId) {
      throw new CoinServiceError('TRANSACTION_ID_REQUIRED', 'transactionId zorunludur');
    }

    const coins = resolveCoinAmount(input.productId, input.coins);
    if (!coins || coins <= 0) {
      throw new CoinServiceError('COIN_AMOUNT_REQUIRED', 'Coin paketi bulunamadı');
    }

    const provider = ensureProvider(input.provider);
    const productId = input.productId || 'coin_unknown';

    const result = await runTransaction(async (tx) => {
      const txnRef = db.collection(COIN_TRANSACTIONS_COLLECTION).doc(transactionId);
      const userRef = db.collection(COIN_USERS_COLLECTION).doc(uid);

      const txnSnap = await tx.get(txnRef);
      if (txnSnap.exists) {
        const existing = txnSnap.data();
        return {
          status: 'already_processed',
          transactionId,
          balance: toNumber(existing?.balanceAfter, undefined),
        };
      }

      const userSnap = await tx.get(userRef);
      const existingUser = userSnap.exists ? userSnap.data() : null;

      const previousBalance = toNumber(existingUser?.balance, 0);
      const previousLifetimePurchased = toNumber(existingUser?.lifetimePurchased, 0);
      const previousLifetimeSpent = toNumber(existingUser?.lifetimeSpent, 0);

      const newBalance = previousBalance + coins;
      const nextUser = buildUserDoc(uid, {
        balance: newBalance,
        lifetimePurchased: previousLifetimePurchased + coins,
        lifetimeSpent: previousLifetimeSpent,
        createdAt: existingUser?.createdAt ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      tx.set(userRef, nextUser, { merge: true });

      const transactionMetadata = sanitizeForFirestore(input.metadata ?? null) ?? null;
      const transaction: CoinTransaction & { balanceAfter?: number } = {
        uid,
        type: 'purchase',
        provider,
        productId,
        coins,
        status: 'success',
        providerEventId: transactionId,
        createdAt: FieldValue.serverTimestamp(),
        metadata: transactionMetadata,
        balanceAfter: newBalance,
      };

      tx.set(txnRef, transaction);

      return {
        status: 'success',
        transactionId,
        balance: newBalance,
        coins,
      };
    });
    logCoinEvent('verify_purchase_result', { uid, result });
    return result;
  }

  async spendAndCreateJob(input: SpendInput) {
    logCoinEvent('spend_and_create_job_start', {
      uid: input.uid,
      kind: input.kind,
      costCoins: input.costCoins,
      requestId: input.requestId,
      inputPayload: input.input ?? null,
    });
    const uid = input.uid;
    if (!uid) {
      throw new CoinServiceError('UID_REQUIRED', 'UID zorunludur');
    }

    if (!input.kind) {
      throw new CoinServiceError('KIND_REQUIRED', 'kind zorunludur');
    }

    if (!Number.isFinite(input.costCoins) || input.costCoins <= 0) {
      throw new CoinServiceError('COST_REQUIRED', 'costCoins zorunludur');
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const transactionId = input.requestId
      ? `spend_${input.requestId}`
      : `spend_${jobId}`;

    const result = await runTransaction(async (tx) => {
      const userRef = db.collection(COIN_USERS_COLLECTION).doc(uid);
      const txnRef = db.collection(COIN_TRANSACTIONS_COLLECTION).doc(transactionId);
      const jobRef = db.collection(GENERATION_JOBS_COLLECTION).doc(jobId);

      const txnSnap = await tx.get(txnRef);
      if (txnSnap.exists) {
        const existing = txnSnap.data();
        return {
          status: 'already_processed',
          transactionId,
          jobId: existing?.jobId ?? jobId,
          balance: toNumber(existing?.balanceAfter, undefined),
        };
      }

      const userSnap = await tx.get(userRef);
      const existingUser = userSnap.exists ? userSnap.data() : null;
      const currentBalance = toNumber(existingUser?.balance, 0);

      if (currentBalance < input.costCoins) {
        throw new CoinServiceError('INSUFFICIENT_COINS', 'Coin yetersiz');
      }

      const updatedBalance = currentBalance - input.costCoins;
      const nextUser = buildUserDoc(uid, {
        balance: updatedBalance,
        lifetimePurchased: toNumber(existingUser?.lifetimePurchased, 0),
        lifetimeSpent: toNumber(existingUser?.lifetimeSpent, 0) + input.costCoins,
        createdAt: existingUser?.createdAt ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const sanitizedInput = sanitizeForFirestore(input.input ?? null) ?? null;
      const job: GenerationJob = {
        uid,
        kind: input.kind,
        costCoins: input.costCoins,
        status: 'queued',
        input: sanitizedInput,
        output: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      const transaction: CoinTransaction & { balanceAfter?: number; jobId?: string } = {
        uid,
        type: 'spend',
        provider: 'app',
        productId: input.kind === 'video' ? 'generation_video' : 'generation_image',
        coins: input.costCoins,
        status: 'success',
        providerEventId: transactionId,
        createdAt: FieldValue.serverTimestamp(),
        metadata: sanitizedInput,
        balanceAfter: updatedBalance,
        jobId,
      };

      tx.set(userRef, nextUser, { merge: true });
      tx.set(jobRef, job);
      tx.set(txnRef, transaction);

      return {
        status: 'success',
        transactionId,
        jobId,
        balance: updatedBalance,
      };
    });
    logCoinEvent('spend_and_create_job_result', { uid, result });
    return result;
  }

  async getJob(uid: string, jobId: string) {
    logCoinEvent('get_job_start', { uid, jobId });
    const jobRef = db.collection(GENERATION_JOBS_COLLECTION).doc(jobId);
    const snapshot = await jobRef.get();
    if (!snapshot.exists) {
      logCoinEvent('get_job_not_found', { uid, jobId });
      return null;
    }
    const data = snapshot.data() || {};
    if (uid && data.uid && data.uid !== uid) {
      throw new CoinServiceError('JOB_FORBIDDEN', 'Bu job size ait değil');
    }
    const result = { id: snapshot.id, ...data };
    logCoinEvent('get_job_success', { uid, jobId, result });
    return result;
  }

  async updateJob(input: JobUpdateInput) {
    logCoinEvent('update_job_start', {
      uid: input.uid,
      jobId: input.jobId,
      status: input.status,
      output: input.output ?? null,
    });
    const { uid, jobId, status, output } = input;
    if (!uid) {
      throw new CoinServiceError('UID_REQUIRED', 'UID zorunludur');
    }
    if (!jobId) {
      throw new CoinServiceError('JOB_ID_REQUIRED', 'jobId zorunludur');
    }

    const jobRef = db.collection(GENERATION_JOBS_COLLECTION).doc(jobId);
    const snapshot = await jobRef.get();
    if (!snapshot.exists) {
      throw new CoinServiceError('NOT_FOUND', 'Job bulunamadı');
    }
    const existing = snapshot.data() || {};
    if (existing.uid && existing.uid !== uid) {
      throw new CoinServiceError('JOB_FORBIDDEN', 'Bu job size ait değil');
    }

    const updates: Record<string, any> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (status) {
      updates.status = status;
    }
    if (output) {
      updates.output = sanitizeForFirestore(output);
    }

    await jobRef.update(updates);
    const result = { jobId, status: status ?? existing.status, output: output ?? existing.output };
    logCoinEvent('update_job_success', { uid, jobId, result });
    return result;
  }

  async handleWebhook(input: WebhookInput) {
    logCoinEvent('webhook_start', {
      uid: input.uid,
      eventId: input.eventId,
      provider: input.provider,
      productId: input.productId,
      status: input.status,
      coinsOverride: input.coins,
      metadata: sanitizeMetadata(input.metadata),
    });
    const uid = input.uid;
    const eventId = input.eventId;
    if (!uid) {
      throw new CoinServiceError('UID_REQUIRED', 'UID zorunludur');
    }
    if (!eventId) {
      throw new CoinServiceError('EVENT_ID_REQUIRED', 'eventId zorunludur');
    }

    const coins = resolveCoinAmount(input.productId, input.coins);
    if (!coins || coins <= 0) {
      throw new CoinServiceError('COIN_AMOUNT_REQUIRED', 'Coin paketi bulunamadı');
    }

    const status = (input.status || '').toLowerCase();
    const isPurchase = ['purchase', 'renew', 'initial_purchase', 'trial_converted'].includes(status);
    const isRefund = ['refund', 'revoke', 'chargeback'].includes(status);

    if (!isPurchase && !isRefund) {
      return { status: 'ignored', reason: 'event_not_actionable' };
    }

    const provider = ensureProvider(input.provider);
    const productId = input.productId || 'coin_unknown';

    const result = await runTransaction(async (tx) => {
      const txnRef = db.collection(COIN_TRANSACTIONS_COLLECTION).doc(eventId);
      const userRef = db.collection(COIN_USERS_COLLECTION).doc(uid);

      const txnSnap = await tx.get(txnRef);
      if (txnSnap.exists) {
        return { status: 'already_processed', eventId };
      }

      const userSnap = await tx.get(userRef);
      const existingUser = userSnap.exists ? userSnap.data() : null;
      const currentBalance = toNumber(existingUser?.balance, 0);
      const lifetimePurchased = toNumber(existingUser?.lifetimePurchased, 0);
      const lifetimeSpent = toNumber(existingUser?.lifetimeSpent, 0);

      let newBalance = currentBalance;
      let newLifetimePurchased = lifetimePurchased;
      let newLifetimeSpent = lifetimeSpent;

      if (isPurchase) {
        newBalance = currentBalance + coins;
        newLifetimePurchased = lifetimePurchased + coins;
      } else if (isRefund) {
        newBalance = Math.max(0, currentBalance - coins);
        newLifetimeSpent = lifetimeSpent;
      }

      const nextUser = buildUserDoc(uid, {
        balance: newBalance,
        lifetimePurchased: newLifetimePurchased,
        lifetimeSpent: newLifetimeSpent,
        createdAt: existingUser?.createdAt ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const transactionMetadata = sanitizeForFirestore(input.metadata ?? null) ?? null;
      const transaction: CoinTransaction & { balanceAfter?: number } = {
        uid,
        type: isPurchase ? 'purchase' : 'refund',
        provider,
        productId,
        coins,
        status: 'success',
        providerEventId: eventId,
        createdAt: FieldValue.serverTimestamp(),
        metadata: transactionMetadata,
        balanceAfter: newBalance,
      };

      tx.set(userRef, nextUser, { merge: true });
      tx.set(txnRef, transaction);

      return {
        status: 'success',
        eventId,
        balance: newBalance,
      };
    });
    logCoinEvent('webhook_result', { uid, eventId, result });
    return result;
  }
}

export const coinService = new CoinService();
