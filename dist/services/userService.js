"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const firebase_1 = require("../firebase");
const hashService_1 = require("./hashService");
const uuid_1 = require("uuid");
const logger_1 = require("../utils/logger");
class UserService {
    /**
     * Create a new user
     */
    static async createUser(request) {
        const userId = (0, uuid_1.v4)();
        const passwordHash = request.password ? await hashService_1.HashService.hashPassword(request.password) : '';
        const now = new Date();
        const email = request.email.toLowerCase().trim();
        // Mock Firebase Authentication
        logger_1.logger.info(`Mock UserService: Creating user ${email}`);
        const user = {
            email: email,
            passwordHash,
            name: request.name,
            isEmailVerified: false,
            createdAt: now,
            updatedAt: now,
            failedLoginAttempts: 0,
        };
        await firebase_1.db.collection('subsc').doc(userId).set(user);
        try {
            await firebase_1.admin.auth().createUser({
                uid: userId,
                email,
                displayName: request.name,
                emailVerified: false,
            });
        }
        catch (error) {
            logger_1.logger.warn({ error, userId, email, operation: 'createUser' }, 'Failed to sync user with Firebase Auth');
        }
        // Mock Firestore save
        logger_1.logger.info('Mock UserService: Saving user to Firestore');
        return {
            id: userId,
            ...user,
        };
    }
    /**
     * Create a Google user (without password)
     */
    static async createGoogleUser(email, name) {
        let userId = (0, uuid_1.v4)();
        const now = new Date();
        const normalizedEmail = email.toLowerCase().trim();
        let existingAuthUser = null;
        try {
            existingAuthUser = await firebase_1.admin.auth().getUserByEmail(normalizedEmail);
            if (existingAuthUser?.uid) {
                userId = existingAuthUser.uid;
            }
        }
        catch (error) {
            if (error?.code !== 'auth/user-not-found') {
                logger_1.logger.warn({ error, email: normalizedEmail, operation: 'lookupGoogleAuthUser' }, 'Failed to lookup Firebase Auth user by email');
            }
        }
        logger_1.logger.info(`Creating Google user: ${normalizedEmail}`, { operation: 'createGoogleUser' });
        const user = {
            email: normalizedEmail,
            passwordHash: '', // Google users don't have passwords
            name: name || '',
            isEmailVerified: true, // Google users are pre-verified
            createdAt: now,
            updatedAt: now,
            failedLoginAttempts: 0,
            lastLoginAt: now,
        };
        // 1. Save to subsc collection (Firestore)
        try {
            await firebase_1.db.collection('subsc').doc(userId).set({
                ...user,
                id: userId, // Include ID in document
                provider: 'google', // Add provider info
                googleId: existingAuthUser?.uid || null, // Add Google ID if exists
            });
            logger_1.logger.info('User saved to subsc collection', { userId, email: normalizedEmail });
        }
        catch (error) {
            logger_1.logger.error('Failed to save user to subsc collection', { error, userId, email: normalizedEmail });
            throw new Error('Failed to save user to database');
        }
        // 2. Create/Update Firebase Auth user
        try {
            if (existingAuthUser) {
                // Update existing Firebase Auth user
                logger_1.logger.info('Updating existing Firebase Auth user', { userId, email: normalizedEmail });
                await firebase_1.admin.auth().updateUser(userId, {
                    email: normalizedEmail,
                    displayName: name,
                    emailVerified: true,
                });
                logger_1.logger.info('Firebase Auth user updated successfully', { userId, email: normalizedEmail });
            }
            else {
                // Create new Firebase Auth user
                logger_1.logger.info('Creating new Firebase Auth user', { userId, email: normalizedEmail });
                const firebaseUser = await firebase_1.admin.auth().createUser({
                    uid: userId,
                    email: normalizedEmail,
                    displayName: name,
                    emailVerified: true,
                });
                logger_1.logger.info('Firebase Auth user created successfully', {
                    userId,
                    email: normalizedEmail,
                    firebaseUid: firebaseUser.uid
                });
            }
        }
        catch (error) {
            logger_1.logger.error('Firebase Auth sync error', {
                error: error instanceof Error ? error.message : String(error),
                errorCode: error?.code || 'UNKNOWN',
                userId,
                email: normalizedEmail,
                stack: error instanceof Error ? error.stack : undefined
            });
            // Don't throw error here, user is already saved to subsc
        }
        return {
            id: userId,
            ...user,
        };
    }
    /**
     * Create a new Apple user
     */
    static async createAppleUser(email, name) {
        const userId = (0, uuid_1.v4)();
        const now = new Date();
        const normalizedEmail = email.toLowerCase().trim();
        // Mock Firebase Authentication
        logger_1.logger.info(`Mock UserService: Creating Apple user ${normalizedEmail}`);
        const user = {
            email: normalizedEmail,
            passwordHash: '', // Apple users don't have passwords
            name: name || '',
            isEmailVerified: true, // Apple users are pre-verified
            createdAt: now,
            updatedAt: now,
            failedLoginAttempts: 0,
        };
        await firebase_1.db.collection('subsc').doc(userId).set(user);
        try {
            await firebase_1.admin.auth().createUser({
                uid: userId,
                email: normalizedEmail,
                displayName: name,
                emailVerified: true,
            });
        }
        catch (error) {
            logger_1.logger.warn({ error, email: normalizedEmail, operation: 'createAppleUser' }, 'Failed to sync Apple user with Firebase Auth');
        }
        // Mock Firestore save
        logger_1.logger.info('Mock UserService: Saving Apple user to Firestore');
        return {
            id: userId,
            ...user,
        };
    }
    /**
     * Find user by email
     */
    static async findByEmail(email) {
        const normalizedEmail = email.toLowerCase().trim();
        const snapshot = await firebase_1.db
            .collection('subsc')
            .where('email', '==', normalizedEmail)
            .limit(1)
            .get();
        if (snapshot.empty) {
            return null;
        }
        const doc = snapshot.docs[0];
        return {
            id: doc.id,
            ...doc.data(),
        };
    }
    /**
     * Find user by ID
     */
    static async findById(userId) {
        const doc = await firebase_1.db.collection('subsc').doc(userId).get();
        if (!doc.exists) {
            return null;
        }
        const data = doc.data();
        if (!data) {
            return null;
        }
        // Mock user data for testing
        logger_1.logger.info(`Mock UserService: Finding user by ID ${userId}`);
        // Return a mock user for testing
        return {
            id: doc.id,
            ...data,
        };
    }
    /**
     * Verify user password
     */
    static async verifyPassword(user, password) {
        return hashService_1.HashService.verifyPassword(password, user.passwordHash);
    }
    /**
     * Check if user is locked due to failed attempts
     */
    static isUserLocked(user) {
        if (!user.lockedUntil) {
            return false;
        }
        return user.lockedUntil > new Date();
    }
    /**
     * Increment failed login attempts
     */
    static async incrementFailedAttempts(userId) {
        const userRef = firebase_1.db.collection('subsc').doc(userId);
        const user = await this.findById(userId);
        if (!user)
            return;
        const failedAttempts = user.failedLoginAttempts + 1;
        const updateData = {
            failedLoginAttempts: failedAttempts,
            updatedAt: new Date(),
        };
        // Lock account after 5 failed attempts for 30 minutes
        if (failedAttempts >= 5) {
            const lockUntil = new Date();
            lockUntil.setMinutes(lockUntil.getMinutes() + 30);
            updateData.lockedUntil = lockUntil;
        }
        await userRef.update(updateData);
    }
    /**
     * Reset failed login attempts on successful login
     */
    static async resetFailedAttempts(userId) {
        await firebase_1.db.collection('subsc').doc(userId).update({
            failedLoginAttempts: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
            updatedAt: new Date(),
        });
    }
    /**
     * Update user profile
     */
    static async updateUser(userId, updates) {
        const userRef = firebase_1.db.collection('subsc').doc(userId);
        const existing = await userRef.get();
        if (!existing.exists || !existing.data()) {
            return;
        }
        await userRef.update({
            ...updates,
            updatedAt: new Date(),
        });
        try {
            const firebaseUpdates = {};
            if (updates.email)
                firebaseUpdates.email = updates.email;
            if (updates.name)
                firebaseUpdates.displayName = updates.name;
            if (Object.keys(firebaseUpdates).length > 0) {
                await firebase_1.admin.auth().updateUser(userId, firebaseUpdates);
            }
        }
        catch (error) {
            logger_1.logger.warn({ error, userId, operation: 'updateUser' }, 'Failed to update Firebase Auth user');
        }
        // Mock Firestore update
        logger_1.logger.info(`Mock UserService: Updating user ${userId}`, updates);
    }
    /**
     * Check if email is already registered
     */
    static async isEmailRegistered(email) {
        const user = await this.findByEmail(email);
        return user !== null;
    }
}
exports.UserService = UserService;
