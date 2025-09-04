"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateUsersToFirebase = migrateUsersToFirebase;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const firebase_1 = require("./firebase");
/**
 * Migration script to create Firebase Authentication users for existing database users
 * This should be run once to migrate existing users to Firebase Authentication
 */
async function migrateUsersToFirebase() {
    try {
        console.log('Starting user migration to Firebase Authentication...');
        // Get all users from Firestore
        const usersSnapshot = await firebase_1.db.collection('subsc').get();
        const users = usersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        console.log(`Found ${users.length} users to migrate`);
        let successCount = 0;
        let errorCount = 0;
        for (const user of users) {
            try {
                // Check if user already exists in Firebase Authentication
                try {
                    await firebase_admin_1.default.auth().getUser(user.id);
                    console.log(`User ${user.id} already exists in Firebase Authentication, skipping...`);
                    continue;
                }
                catch (error) {
                    // User doesn't exist, create it
                }
                // Create user in Firebase Authentication
                const firebaseUser = await firebase_admin_1.default.auth().createUser({
                    uid: user.id,
                    email: user.email,
                    displayName: user.name || '',
                    emailVerified: user.isEmailVerified || false,
                    // Don't set password for existing users, they'll use the existing auth system
                });
                console.log(`Successfully created Firebase user: ${firebaseUser.uid} (${firebaseUser.email})`);
                successCount++;
            }
            catch (error) {
                console.error(`Failed to create Firebase user for ${user.id}:`, error);
                errorCount++;
            }
        }
        console.log(`Migration completed. Success: ${successCount}, Errors: ${errorCount}`);
    }
    catch (error) {
        console.error('Migration failed:', error);
    }
}
// Run migration if this file is executed directly
if (require.main === module) {
    migrateUsersToFirebase()
        .then(() => {
        console.log('Migration script completed');
        process.exit(0);
    })
        .catch((error) => {
        console.error('Migration script failed:', error);
        process.exit(1);
    });
}
