type DocumentData = Record<string, any>;

interface Filter {
  field: string;
  operator: string;
  value: any;
}

interface QueryOptions {
  filters: Filter[];
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}

const collections = new Map<string, Map<string, DocumentData>>();

const randomId = () => `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const getCollectionStore = (name: string): Map<string, DocumentData> => {
  if (!collections.has(name)) {
    collections.set(name, new Map());
  }
  return collections.get(name)!;
};

const getFieldValue = (data: DocumentData, field: string): any => {
  return field.split('.').reduce((value: any, part: string) => (value ? value[part] : undefined), data);
};

const matchesFilter = (data: DocumentData, filter: Filter): boolean => {
  const fieldValue = getFieldValue(data, filter.field);
  switch (filter.operator) {
    case '==':
      if (filter.value === null) {
        return fieldValue === null || fieldValue === undefined;
      }
      return fieldValue === filter.value;
    case '!=':
      return fieldValue !== filter.value;
    case '>':
      return fieldValue > filter.value;
    case '>=':
      return fieldValue >= filter.value;
    case '<':
      return fieldValue < filter.value;
    case '<=':
      return fieldValue <= filter.value;
    default:
      return false;
  }
};

const sortDocuments = (
  docs: Array<{ id: string; data: DocumentData }>,
  orderBy?: { field: string; direction: 'asc' | 'desc' }
) => {
  if (!orderBy) {
    return docs;
  }

  return docs.sort((a, b) => {
    const aValue = getFieldValue(a.data, orderBy.field);
    const bValue = getFieldValue(b.data, orderBy.field);

    if (aValue === bValue) {
      return 0;
    }

    const direction = orderBy.direction === 'desc' ? -1 : 1;
    return aValue > bValue ? direction : -direction;
  });
};

const createDocRef = (collectionName: string, docId: string) => ({
  id: docId,
  collectionName,
  async set(data: DocumentData): Promise<void> {
    const store = getCollectionStore(collectionName);
    store.set(docId, { ...data });
  },
  async get() {
    const store = getCollectionStore(collectionName);
    const data = store.get(docId);
    return {
      id: docId,
      exists: data !== undefined,
      data: () => (data !== undefined ? { ...data } : undefined),
      ref: createDocRef(collectionName, docId)
    };
  },
  async update(data: DocumentData): Promise<void> {
    const store = getCollectionStore(collectionName);
    const existing = store.get(docId);
    if (!existing) {
      throw new Error(`Document ${docId} does not exist in collection ${collectionName}`);
// Firebase temporarily disabled for testing
// import admin from 'firebase-admin';
import { logger } from './utils/logger';

// Mock document factory
const createMockDoc = (id: string, collectionPath: string) => ({
  id,
  exists: false,
  data: () => ({
    createdAt: new Date(),
    role: 'user',
    content: 'mock content',
    timestamp: new Date(),
    userId: 'mock_user',
    deviceId: 'mock_device',
    lastUsedAt: new Date(),
    expiresAt: new Date(),
    revokedAt: undefined,
    ipAddress: '127.0.0.1',
    tokenHash: 'mock_token_hash',
    refreshTokenHash: 'mock_refresh_token_hash',
    deviceInfo: 'mock_device_info',
    email: 'mock@example.com',
    passwordHash: 'mock_password_hash',
    isEmailVerified: true,
    updatedAt: new Date(),
    failedLoginAttempts: 0
  }),
  ref: {
    delete: async () => {
      logger.debug(`Mock Firebase: Deleting document ${id} in collection ${collectionPath}`);
      return Promise.resolve();
    },
    update: async (data: any) => {
      logger.debug(`Mock Firebase: Updating document ${id} in collection ${collectionPath}`, data);
      return Promise.resolve();
    }
    store.set(docId, { ...existing, ...data });
  },
  async delete(): Promise<void> {
    const store = getCollectionStore(collectionName);
    store.delete(docId);
  },
  collection(subName: string) {
    return createCollection(`${collectionName}/${docId}/${subName}`);
  }
});

const createQuery = (
  collectionName: string,
  options: QueryOptions = { filters: [] }
) => ({
  where(field: string, operator: string, value: any) {
    return createQuery(collectionName, {
      ...options,
      filters: [...options.filters, { field, operator, value }]
    });
  },
  orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    return createQuery(collectionName, {
      ...options,
      orderBy: { field, direction }
    });
  },
  limit(count: number) {
    return createQuery(collectionName, {
      ...options,
      limit: count
    });
  },
  offset(count: number) {
    return createQuery(collectionName, {
      ...options,
      offset: count
    });
  },
  async get() {
    const store = getCollectionStore(collectionName);
    let docs = Array.from(store.entries()).map(([id, data]) => ({ id, data }));

    if (options.filters.length > 0) {
      docs = docs.filter(({ data }) => options.filters.every(filter => matchesFilter(data, filter)));
    }

    docs = sortDocuments(docs, options.orderBy);

    if (options.offset && options.offset > 0) {
      docs = docs.slice(options.offset);
    }

    if (options.limit !== undefined) {
      docs = docs.slice(0, options.limit);
    }

    const snapshots = docs.map(({ id, data }) => ({
      id,
      exists: true,
      data: () => ({ ...data }),
      ref: createDocRef(collectionName, id)
    }));

    return {
      empty: snapshots.length === 0,
      size: snapshots.length,
      docs: snapshots,
      forEach: (callback: (doc: any) => void) => {
        snapshots.forEach(callback);
      }
    };
  }
});

const createCollection = (collectionName: string) => ({
  doc(id?: string) {
    const docId = id || randomId();
    return createDocRef(collectionName, docId);
  },
  async add(data: DocumentData) {
    const docId = randomId();
    await createDocRef(collectionName, docId).set(data);
    return { id: docId };
  },
  where(field: string, operator: string, value: any) {
    return createQuery(collectionName, { filters: [{ field, operator, value }] });
  },
  orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
    return createQuery(collectionName, { filters: [], orderBy: { field, direction } });
  },
  async get() {
    return createQuery(collectionName, { filters: [] }).get();
  }
});

export const db = {
  collection: (name: string) => createCollection(name),
  batch: () => ({
    async set(docRef: any, data: DocumentData) {
      await docRef.set(data);
    },
    async update(docRef: any, data: DocumentData) {
      await docRef.update(data);
    },
    async delete(docRef: any) {
      await docRef.delete();
    },
    async commit() {}

  collection: (name: string) => ({
    doc: (id?: string) => {
      const docId = id || `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      return {
        id: docId,
        set: async (data: any) => {
          logger.debug(`Mock Firebase: Setting document ${docId} in collection ${name}`, data);
          return Promise.resolve();
        },
        get: async () => createMockDoc(docId, name),
        update: async (data: any) => {
          logger.debug(`Mock Firebase: Updating document ${docId} in collection ${name}`, data);
          return Promise.resolve();
        },
        collection: (subName: string) => ({
          doc: (subId?: string) => {
            const subDocId = subId || `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            return {
              id: subDocId,
              set: async (data: any) => {
                logger.debug(`Mock Firebase: Setting document ${subDocId} in collection ${name}/${docId}/${subName}`, data);
                return Promise.resolve();
              },
              get: async () => createMockDoc(subDocId, `${name}/${docId}/${subName}`),
              update: async (data: any) => {
                logger.debug(`Mock Firebase: Updating document ${subDocId} in collection ${name}/${docId}/${subName}`, data);
                return Promise.resolve();
              },
              collection: (subSubName: string) => ({
                doc: (subSubId?: string) => {
                  const subSubDocId = subSubId || `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                  return {
                    id: subSubDocId,
                    set: async (data: any) => {
                      logger.debug(`Mock Firebase: Setting document ${subSubDocId} in collection ${name}/${docId}/${subName}/${subSubName}`, data);
                      return Promise.resolve();
                    },
                    get: async () => createMockDoc(subSubDocId, `${name}/${docId}/${subName}/${subSubName}`),
                    update: async (data: any) => {
                      logger.debug(`Mock Firebase: Updating document ${subSubDocId} in collection ${name}/${docId}/${subName}/${subSubName}`, data);
                      return Promise.resolve();
                    }
                  };
                },
                add: async (data: any) => {
                  const subSubId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                  logger.debug(`Mock Firebase: Adding document ${subSubId} to collection ${name}/${docId}/${subName}/${subSubName}`, data);
                  return Promise.resolve({ id: subSubId });
                },
                where: (field: string, operator: string, value: any) => createMockQueryBuilder(),
                orderBy: (field: string, direction: string) => createMockQueryBuilder()
              })
            };
          },
          add: async (data: any) => {
            const subId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            logger.debug(`Mock Firebase: Adding document ${subId} to collection ${name}/${docId}/${subName}`, data);
            return Promise.resolve({ id: subId });
          },
          where: (field: string, operator: string, value: any) => createMockQueryBuilder(),
          orderBy: (field: string, direction: string) => createMockQueryBuilder()
        })
      };
    },
    add: async (data: any) => {
      const id = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      logger.debug(`Mock Firebase: Adding document ${id} to collection ${name}`, data);
      return Promise.resolve({ id });
    },
    get: async () => createMockQueryResult(),
    where: (field: string, operator: string, value: any) => createMockQueryBuilder()
  }),
  batch: () => ({
    set: (docRef: any, data: any) => {
      logger.debug(`Mock Firebase: Batch setting document`, data);
    },
    update: (docRef: any, data: any) => {
      logger.debug(`Mock Firebase: Batch updating document`, data);
    },
    delete: (docRef: any) => {
      logger.debug(`Mock Firebase: Batch deleting document`);
    },
    commit: async () => {
      logger.debug(`Mock Firebase: Committing batch`);
      return Promise.resolve();
    }
  })
};

export const firestoreQuery = {
  where: () => firestoreQuery,
  orderBy: () => firestoreQuery,
  limit: () => firestoreQuery,
  offset: () => firestoreQuery,
  async get() {
    return {
      empty: true,
      size: 0,
      docs: [],
      forEach: () => {}
    };
  }
} as any;

interface MockUserRecord {
  uid: string;
  email?: string;
  displayName?: string;
  emailVerified?: boolean;
  disabled?: boolean;
}

const authUsers = new Map<string, MockUserRecord>();

const mockAuth = () => ({
  async getUser(uid: string) {
    const user = authUsers.get(uid);
    if (!user) {
      throw Object.assign(new Error(`User ${uid} not found`), { code: 'auth/user-not-found' });
    }
    return { ...user };
  },
  async getUserByEmail(email: string) {
    const found = Array.from(authUsers.values()).find(user => user.email === email);
    if (!found) {
      throw Object.assign(new Error(`User with email ${email} not found`), { code: 'auth/user-not-found' });
    }
    return { ...found };
  },
  async createUser(data: Partial<MockUserRecord>) {
    const uid = data.uid || randomId();
    if (data.email) {
      const existing = Array.from(authUsers.values()).find(user => user.email === data.email);
      if (existing) {
        throw Object.assign(new Error(`Email ${data.email} already exists`), { code: 'auth/email-already-exists' });
      }
    }
    const record: MockUserRecord = {
      uid,
      email: data.email,
      displayName: data.displayName,
      emailVerified: data.emailVerified ?? false,
      disabled: data.disabled ?? false
    };
    authUsers.set(uid, record);
    return { ...record };
  },
  async updateUser(uid: string, data: Partial<MockUserRecord>) {
    const existing = authUsers.get(uid);
    if (!existing) {
      throw Object.assign(new Error(`User ${uid} not found`), { code: 'auth/user-not-found' });
    }
    const updated: MockUserRecord = {
      ...existing,
      ...data,
      uid
    };
    authUsers.set(uid, updated);
    return { ...updated };
  },
  async deleteUser(uid: string) {
    authUsers.delete(uid);
  }
});

export const admin = {
  auth: mockAuth,
  firestore: {
    FieldValue: {
      serverTimestamp: () => new Date()
    }
  }
};