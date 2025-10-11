// Firebase temporarily disabled for testing
// import admin from 'firebase-admin';

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
export const db = {
  collection: (name: string) => ({
    doc: (id: string) => ({
      set: async (data: any) => {
        console.log(`Mock Firebase: Setting document ${id} in collection ${name}`, data);
        return Promise.resolve();
      }
    }),
    where: (field: string, operator: string, value: any) => ({
      where: (field2: string, operator2: string, value2: any) => ({
        orderBy: (field3: string, direction: string) => ({
          get: async () => ({
            forEach: (callback: (doc: any) => void) => {
              // Mock empty results
            }
          })
        })
      })
    })
  })
};
