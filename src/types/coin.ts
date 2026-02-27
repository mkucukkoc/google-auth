export type CoinTransactionType = 'purchase' | 'spend' | 'refund' | 'adjust';
export type CoinTransactionStatus = 'pending' | 'success' | 'failed';
export type CoinProvider = 'google' | 'apple' | 'revenuecat' | 'app' | 'unknown';

export interface CoinUser {
  uid: string;
  balance: number;
  lifetimePurchased: number;
  lifetimeSpent: number;
  updatedAt: any;
  createdAt: any;
}

export interface CoinTransaction {
  uid: string;
  type: CoinTransactionType;
  provider: CoinProvider;
  productId: string;
  coins: number;
  status: CoinTransactionStatus;
  providerEventId?: string | null;
  createdAt: any;
  metadata?: Record<string, any> | null;
}

export type GenerationKind = 'image' | 'video';
export type GenerationStatus = 'queued' | 'running' | 'success' | 'failed';

export interface GenerationJob {
  uid: string;
  kind: GenerationKind;
  costCoins: number;
  status: GenerationStatus;
  input: Record<string, any> | null;
  output: {
    url?: string;
    thumbUrl?: string;
    [key: string]: any;
  } | null;
  createdAt: any;
  updatedAt: any;
}
