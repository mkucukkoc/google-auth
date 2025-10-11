"use strict";
// Firebase temporarily disabled for testing
// import admin from 'firebase-admin';
Object.defineProperty(exports, "__esModule", { value: true });
exports.firestoreQuery = exports.db = void 0;
// Mock document factory
const createMockDoc = (id, collectionPath) => ({
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
            console.log(`Mock Firebase: Deleting document ${id} in collection ${collectionPath}`);
            return Promise.resolve();
        },
        update: async (data) => {
            console.log(`Mock Firebase: Updating document ${id} in collection ${collectionPath}`, data);
            return Promise.resolve();
        }
    }
});
// Mock query result factory
const createMockQueryResult = (docCount = 0) => ({
    empty: docCount === 0,
    size: docCount,
    docs: createMockDocs(docCount),
    forEach: (callback) => {
        // Mock empty results
    }
});
// Mock docs array factory
const createMockDocs = (count = 0) => {
    const docs = [];
    for (let i = 0; i < count; i++) {
        docs.push(createMockDoc(`mock_doc_${i}`, 'mock_collection'));
    }
    return docs;
};
// Mock query builder factory
const createMockQueryBuilder = () => ({
    where: (field, operator, value) => createMockQueryBuilder(),
    orderBy: (field, direction) => createMockQueryBuilder(),
    limit: (count) => createMockQueryBuilder(),
    offset: (count) => createMockQueryBuilder(),
    get: async () => createMockQueryResult()
});
// if (!admin.apps.length) {
//   const projectId = process.env.FIREBASE_PROJECT_ID;
//   const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
//   const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
//   if (!projectId || !clientEmail || !privateKey) {
//     throw new Error('Firebase credentials are not set');
//   }
//   admin.initializeApp({
//     credential: admin.credential.cert({
//       projectId,
//       clientEmail,
//       privateKey,
//     }),
//   });
// }
// export const db = admin.firestore();
// Mock database for testing
exports.db = {
    collection: (name) => ({
        doc: (id) => {
            const docId = id || `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            return {
                id: docId,
                set: async (data) => {
                    console.log(`Mock Firebase: Setting document ${docId} in collection ${name}`, data);
                    return Promise.resolve();
                },
                get: async () => createMockDoc(docId, name),
                update: async (data) => {
                    console.log(`Mock Firebase: Updating document ${docId} in collection ${name}`, data);
                    return Promise.resolve();
                },
                collection: (subName) => ({
                    doc: (subId) => {
                        const subDocId = subId || `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        return {
                            id: subDocId,
                            set: async (data) => {
                                console.log(`Mock Firebase: Setting document ${subDocId} in collection ${name}/${docId}/${subName}`, data);
                                return Promise.resolve();
                            },
                            get: async () => createMockDoc(subDocId, `${name}/${docId}/${subName}`),
                            update: async (data) => {
                                console.log(`Mock Firebase: Updating document ${subDocId} in collection ${name}/${docId}/${subName}`, data);
                                return Promise.resolve();
                            },
                            collection: (subSubName) => ({
                                doc: (subSubId) => {
                                    const subSubDocId = subSubId || `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                                    return {
                                        id: subSubDocId,
                                        set: async (data) => {
                                            console.log(`Mock Firebase: Setting document ${subSubDocId} in collection ${name}/${docId}/${subName}/${subSubName}`, data);
                                            return Promise.resolve();
                                        },
                                        get: async () => createMockDoc(subSubDocId, `${name}/${docId}/${subName}/${subSubName}`),
                                        update: async (data) => {
                                            console.log(`Mock Firebase: Updating document ${subSubDocId} in collection ${name}/${docId}/${subName}/${subSubName}`, data);
                                            return Promise.resolve();
                                        }
                                    };
                                },
                                add: async (data) => {
                                    const subSubId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                                    console.log(`Mock Firebase: Adding document ${subSubId} to collection ${name}/${docId}/${subName}/${subSubName}`, data);
                                    return Promise.resolve({ id: subSubId });
                                },
                                where: (field, operator, value) => createMockQueryBuilder(),
                                orderBy: (field, direction) => createMockQueryBuilder()
                            })
                        };
                    },
                    add: async (data) => {
                        const subId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        console.log(`Mock Firebase: Adding document ${subId} to collection ${name}/${docId}/${subName}`, data);
                        return Promise.resolve({ id: subId });
                    },
                    where: (field, operator, value) => createMockQueryBuilder(),
                    orderBy: (field, direction) => createMockQueryBuilder()
                })
            };
        },
        add: async (data) => {
            const id = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            console.log(`Mock Firebase: Adding document ${id} to collection ${name}`, data);
            return Promise.resolve({ id });
        },
        get: async () => createMockQueryResult(),
        where: (field, operator, value) => createMockQueryBuilder()
    }),
    batch: () => ({
        set: (docRef, data) => {
            console.log(`Mock Firebase: Batch setting document`, data);
        },
        update: (docRef, data) => {
            console.log(`Mock Firebase: Batch updating document`, data);
        },
        delete: (docRef) => {
            console.log(`Mock Firebase: Batch deleting document`);
        },
        commit: async () => {
            console.log(`Mock Firebase: Committing batch`);
            return Promise.resolve();
        }
    })
};
// Mock firestoreQuery for auditService
exports.firestoreQuery = createMockQueryBuilder();
