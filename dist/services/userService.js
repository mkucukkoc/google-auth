"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const firebase_1 = require("../firebase");
const hashService_1 = require("./hashService");
const uuid_1 = require("uuid");
const firebase_admin_1 = __importDefault(require("firebase-admin"));
class UserService {
    /**
     * Create a new user
     */
    static async createUser(request) {
        const userId = (0, uuid_1.v4)();
        const passwordHash = request.password ? await hashService_1.HashService.hashPassword(request.password) : '';
        const now = new Date();
        const email = request.email.toLowerCase().trim();
        // Create user in Firebase Authentication
        let firebaseUser;
        try {
            firebaseUser = await firebase_admin_1.default.auth().createUser({
                uid: userId,
                email: email,
                displayName: request.name || '',
                emailVerified: false,
                password: request.password,
            });
            console.log('Firebase user created:', firebaseUser.uid);
        }
        catch (error) {
            console.error('Firebase user creation failed:', error);
            throw new Error('Failed to create Firebase user');
        }
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
        return {
            id: userId,
            ...user,
        };
    }
    /**
     * Create a Google user (without password)
     */
    static async createGoogleUser(email, name) {
        const userId = (0, uuid_1.v4)();
        const now = new Date();
        const normalizedEmail = email.toLowerCase().trim();
        // Create user in Firebase Authentication
        let firebaseUser;
        try {
            firebaseUser = await firebase_admin_1.default.auth().createUser({
                uid: userId,
                email: normalizedEmail,
                displayName: name || '',
                emailVerified: true, // Google users are pre-verified
            });
            console.log('Firebase Google user created:', firebaseUser.uid);
        }
        catch (error) {
            console.error('Firebase Google user creation failed:', error);
            throw new Error('Failed to create Firebase Google user');
        }
        const user = {
            email: normalizedEmail,
            passwordHash: '', // Google users don't have passwords
            name: name || '',
            isEmailVerified: true, // Google users are pre-verified
            createdAt: now,
            updatedAt: now,
            failedLoginAttempts: 0,
        };
        await firebase_1.db.collection('subsc').doc(userId).set(user);
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
        // Create user in Firebase Authentication
        let firebaseUser;
        try {
            firebaseUser = await firebase_admin_1.default.auth().createUser({
                uid: userId,
                email: normalizedEmail,
                displayName: name || '',
                emailVerified: true, // Apple users are pre-verified
            });
            console.log('Firebase Apple user created:', firebaseUser.uid);
        }
        catch (error) {
            console.error('Firebase Apple user creation failed:', error);
            throw new Error('Failed to create Firebase Apple user');
        }
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
        return {
            id: doc.id,
            ...doc.data(),
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
        await firebase_1.db.collection('subsc').doc(userId).update({
            ...updates,
            updatedAt: new Date(),
        });
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
