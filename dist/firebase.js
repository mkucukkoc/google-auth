"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.FieldValue = exports.admin = exports.firestoreQuery = void 0;
const logger_1 = require("./utils/logger");
const firebaseAdmin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin SDK
if (!firebaseAdmin.apps.length) {
    try {
        // Try to initialize with service account
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
            ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
            : null;
        if (serviceAccount) {
            firebaseAdmin.initializeApp({
                credential: firebaseAdmin.credential.cert(serviceAccount),
                databaseURL: process.env.FIREBASE_DATABASE_URL
            });
            logger_1.logger.info('Firebase Admin SDK initialized with service account');
        }
        else {
            // Fallback to default credentials (for local development)
            firebaseAdmin.initializeApp();
            logger_1.logger.info('Firebase Admin SDK initialized with default credentials');
        }
    }
    catch (error) {
        logger_1.logger.error('Failed to initialize Firebase Admin SDK:', error);
        logger_1.logger.warn('Falling back to mock Firebase for development');
    }
}
const collections = new Map();
const randomId = () => `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
function getCollectionStore(name) {
    if (!collections.has(name)) {
        collections.set(name, new Map());
    }
    return collections.get(name);
}
function getFieldValue(data, field) {
    return field.split('.').reduce((value, part) => (value ? value[part] : undefined), data);
}
function matchesFilter(data, filter) {
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
}
function sortDocuments(docs, orderBy) {
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
}
function logDocAction(action, collectionName, docId, data) {
    const path = `${collectionName}/${docId}`;
    const message = `Mock Firebase: ${action} document ${path}`;
    if (data !== undefined) {
        logger_1.logger.debug({ collection: collectionName, docId, data }, message);
    }
    else {
        logger_1.logger.debug({ collection: collectionName, docId }, message);
    }
}
function createQuery(collectionName, options = { filters: [] }) {
    return {
        where(field, operator, value) {
            return createQuery(collectionName, {
                ...options,
                filters: [...options.filters, { field, operator, value }]
            });
        },
        orderBy(field, direction = 'asc') {
            return createQuery(collectionName, {
                ...options,
                orderBy: { field, direction }
            });
        },
        limit(count) {
            return createQuery(collectionName, {
                ...options,
                limit: count
            });
        },
        offset(count) {
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
            logger_1.logger.debug({ collection: collectionName, options }, 'Mock Firebase: query get');
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
                forEach(callback) {
                    snapshots.forEach(callback);
                }
            };
        }
    };
}
function createDocRef(collectionName, docId) {
    return {
        id: docId,
        collectionName,
        async set(data) {
            const store = getCollectionStore(collectionName);
            logDocAction('set', collectionName, docId, data);
            store.set(docId, { ...data });
        },
        async get() {
            const store = getCollectionStore(collectionName);
            const data = store.get(docId);
            const exists = data !== undefined;
            logger_1.logger.debug({ collection: collectionName, docId, exists }, 'Mock Firebase: get document');
            return {
                id: docId,
                exists,
                data: () => (exists ? { ...data } : undefined),
                ref: createDocRef(collectionName, docId)
            };
        },
        async update(data) {
            const store = getCollectionStore(collectionName);
            const existing = store.get(docId);
            if (!existing) {
                throw new Error(`Document ${docId} does not exist in collection ${collectionName}`);
            }
            logDocAction('update', collectionName, docId, data);
            store.set(docId, { ...existing, ...data });
        },
        async delete() {
            const store = getCollectionStore(collectionName);
            logDocAction('delete', collectionName, docId);
            store.delete(docId);
        },
        collection(subName) {
            return createCollection(`${collectionName}/${docId}/${subName}`);
        }
    };
}
function createCollection(collectionName) {
    return {
        doc(id) {
            const docId = id || randomId();
            return createDocRef(collectionName, docId);
        },
        async add(data) {
            const docId = randomId();
            logger_1.logger.debug({ collection: collectionName, docId, data }, 'Mock Firebase: add document');
            await createDocRef(collectionName, docId).set(data);
            return { id: docId };
        },
        where(field, operator, value) {
            return createQuery(collectionName, { filters: [{ field, operator, value }] });
        },
        orderBy(field, direction = 'asc') {
            return createQuery(collectionName, { filters: [], orderBy: { field, direction } });
        },
        async get() {
            return createQuery(collectionName, { filters: [] }).get();
        }
    };
}
const mockFirestore = () => ({
    collection: (name) => createCollection(name),
    batch: () => ({
        async set(docRef, data) {
            logger_1.logger.debug({ data }, 'Mock Firebase: batch set document');
            await docRef.set(data);
        },
        async update(docRef, data) {
            logger_1.logger.debug({ data }, 'Mock Firebase: batch update document');
            await docRef.update(data);
        },
        async delete(docRef) {
            logger_1.logger.debug('Mock Firebase: batch delete document');
            await docRef.delete();
        },
        async commit() {
            logger_1.logger.debug('Mock Firebase: batch commit');
        }
    })
});
// db is now exported above
exports.firestoreQuery = {
    where: () => exports.firestoreQuery,
    orderBy: () => exports.firestoreQuery,
    limit: () => exports.firestoreQuery,
    offset: () => exports.firestoreQuery,
    async get() {
        logger_1.logger.debug('Mock Firebase: empty query get');
        return {
            empty: true,
            size: 0,
            docs: [],
            forEach: () => { }
        };
    }
};
const authUsers = new Map();
const mockAuth = () => ({
    async getUser(uid) {
        const user = authUsers.get(uid);
        if (!user) {
            throw Object.assign(new Error(`User ${uid} not found`), { code: 'auth/user-not-found' });
        }
        logger_1.logger.debug({ uid }, 'Mock Firebase Auth: getUser');
        return { ...user };
    },
    async getUserByEmail(email) {
        const found = Array.from(authUsers.values()).find(user => user.email === email);
        if (!found) {
            throw Object.assign(new Error(`User with email ${email} not found`), { code: 'auth/user-not-found' });
        }
        logger_1.logger.debug({ email }, 'Mock Firebase Auth: getUserByEmail');
        return { ...found };
    },
    async createUser(data) {
        const uid = data.uid || randomId();
        if (data.email) {
            const existing = Array.from(authUsers.values()).find(user => user.email === data.email);
            if (existing) {
                throw Object.assign(new Error(`Email ${data.email} already exists`), { code: 'auth/email-already-exists' });
            }
        }
        const record = {
            uid,
            email: data.email,
            displayName: data.displayName,
            emailVerified: data.emailVerified ?? false,
            disabled: data.disabled ?? false
        };
        authUsers.set(uid, record);
        logger_1.logger.debug({ uid, email: record.email }, 'Mock Firebase Auth: createUser');
        return { ...record };
    },
    async updateUser(uid, data) {
        const existing = authUsers.get(uid);
        if (!existing) {
            throw Object.assign(new Error(`User ${uid} not found`), { code: 'auth/user-not-found' });
        }
        const updated = {
            ...existing,
            ...data,
            uid
        };
        authUsers.set(uid, updated);
        logger_1.logger.debug({ uid }, 'Mock Firebase Auth: updateUser');
        return { ...updated };
    },
    async deleteUser(uid) {
        authUsers.delete(uid);
        logger_1.logger.debug({ uid }, 'Mock Firebase Auth: deleteUser');
    }
});
// Use real Firebase Admin SDK if available, otherwise fallback to mock
const isFirebaseInitialized = firebaseAdmin.apps.length > 0;
exports.admin = {
    auth: () => isFirebaseInitialized ? firebaseAdmin.auth() : mockAuth(),
    firestore: () => isFirebaseInitialized ? firebaseAdmin.firestore() : mockFirestore()
};
exports.FieldValue = {
    serverTimestamp: () => new Date()
};
// Export Firestore instance
exports.db = exports.admin.firestore();
