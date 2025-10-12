"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateUsersToFirebase = migrateUsersToFirebase;
const firebase_1 = require("./firebase");
const firebase_2 = require("./firebase");
const logger_1 = require("./utils/logger");
/**
 * Migration script to create Firebase Authentication users for existing database users
 * This should be run once to migrate existing users to Firebase Authentication
 */
async function migrateUsersToFirebase() {
    try {
        logger_1.logger.info('Starting user migration to Firebase Authentication...');
        // Get all users from Firestore
        const usersSnapshot = await firebase_2.db.collection('subsc').get();
        const users = usersSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
        }));
        logger_1.logger.info(`Found ${users.length} users to migrate`);
        let successCount = 0;
        let errorCount = 0;
        for (const user of users) {
            try {
                // Check if user already exists in Firebase Authentication
                try {
                    await firebase_1.admin.auth().getUser(user.id);
                    logger_1.logger.warn(`User ${user.id} already exists in Firebase Authentication, skipping...`);
                    continue;
                }
                catch (error) {
                    // User doesn't exist, create it
                }
                // Create user in Firebase Authentication
                const firebaseUser = await firebase_1.admin.auth().createUser({
                    uid: user.id,
                    email: user.email,
                    displayName: user.name || '',
                    emailVerified: user.isEmailVerified || false,
                    // Don't set password for existing users, they'll use the existing auth system
                });
                logger_1.logger.info(`Successfully created Firebase user: ${firebaseUser.uid} (${firebaseUser.email})`);
                successCount++;
            }
            catch (error) {
                logger_1.logger.error(`Failed to create Firebase user for ${user.id}:`, error);
                errorCount++;
            }
        }
        logger_1.logger.info(`Migration completed. Success: ${successCount}, Errors: ${errorCount}`);
    }
    catch (error) {
        logger_1.logger.error('Migration failed:', error);
    }
}
// Run migration if this file is executed directly
if (require.main === module) {
    migrateUsersToFirebase()
        .then(() => {
        logger_1.logger.info('Migration script completed');
        process.exit(0);
    })
        .catch((error) => {
        logger_1.logger.error('Migration script failed:', error);
        process.exit(1);
    });
}
