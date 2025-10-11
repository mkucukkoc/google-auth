import { db } from '../firebase';
import { HashService } from './hashService';
import { User, RegisterRequest } from '../types/auth';
import { v4 as uuidv4 } from 'uuid';
import admin from 'firebase-admin';
import { logger } from '../utils/logger';

export class UserService {
  /**
   * Create a new user
   */
  static async createUser(request: RegisterRequest): Promise<User> {
    const userId = uuidv4();
    const passwordHash = request.password ? await HashService.hashPassword(request.password) : '';
    const now = new Date();
    const email = request.email.toLowerCase().trim();

    // Mock Firebase Authentication
    console.log(`Mock UserService: Creating user ${email}`);
    
    const user: Omit<User, 'id'> = {
      email: email,
      passwordHash,
      name: request.name,
      isEmailVerified: false,
      createdAt: now,
      updatedAt: now,
      failedLoginAttempts: 0,
    };

    // Mock Firestore save
    console.log(`Mock UserService: Saving user to Firestore`);

    return {
      id: userId,
      ...user,
    };
  }

  /**
   * Create a Google user (without password)
   */
  static async createGoogleUser(email: string, name?: string): Promise<User> {
    const userId = uuidv4();
    const now = new Date();
    const normalizedEmail = email.toLowerCase().trim();

    // Mock Firebase Authentication
    console.log(`Mock UserService: Creating Google user ${normalizedEmail}`);
    
    const user: Omit<User, 'id'> = {
      email: normalizedEmail,
      passwordHash: '', // Google users don't have passwords
      name: name || '',
      isEmailVerified: true, // Google users are pre-verified
      createdAt: now,
      updatedAt: now,
      failedLoginAttempts: 0,
    };

    // Mock Firestore save
    console.log(`Mock UserService: Saving Google user to Firestore`);

    return {
      id: userId,
      ...user,
    };
  }

  /**
   * Create a new Apple user
   */
  static async createAppleUser(email: string, name?: string): Promise<User> {
    const userId = uuidv4();
    const now = new Date();
    const normalizedEmail = email.toLowerCase().trim();

    // Mock Firebase Authentication
    console.log(`Mock UserService: Creating Apple user ${normalizedEmail}`);
    
    const user: Omit<User, 'id'> = {
      email: normalizedEmail,
      passwordHash: '', // Apple users don't have passwords
      name: name || '',
      isEmailVerified: true, // Apple users are pre-verified
      createdAt: now,
      updatedAt: now,
      failedLoginAttempts: 0,
    };

    // Mock Firestore save
    console.log(`Mock UserService: Saving Apple user to Firestore`);

    return {
      id: userId,
      ...user,
    };
  }

  /**
   * Find user by email
   */
  static async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase().trim();
    const snapshot = await db
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
    } as any as User;
  }

  /**
   * Find user by ID
   */
  static async findById(userId: string): Promise<User | null> {
    // Mock user data for testing
    console.log(`Mock UserService: Finding user by ID ${userId}`);
    
    // Return a mock user for testing
    return {
      id: userId,
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: 'mock_hash',
      isEmailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      failedLoginAttempts: 0,
    } as User;
  }

  /**
   * Verify user password
   */
  static async verifyPassword(user: User, password: string): Promise<boolean> {
    return HashService.verifyPassword(password, user.passwordHash);
  }

  /**
   * Check if user is locked due to failed attempts
   */
  static isUserLocked(user: User): boolean {
    if (!user.lockedUntil) {
      return false;
    }
    return user.lockedUntil > new Date();
  }

  /**
   * Increment failed login attempts
   */
  static async incrementFailedAttempts(userId: string): Promise<void> {
    const userRef = db.collection('subsc').doc(userId);
    const user = await this.findById(userId);
    
    if (!user) return;

    const failedAttempts = user.failedLoginAttempts + 1;
    const updateData: Partial<User> = {
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
  static async resetFailedAttempts(userId: string): Promise<void> {
    await db.collection('subsc').doc(userId).update({
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      updatedAt: new Date(),
    });
  }

  /**
   * Update user profile
   */
  static async updateUser(userId: string, updates: Partial<User>): Promise<void> {
    await db.collection('subsc').doc(userId).update({
      ...updates,
      updatedAt: new Date(),
    });
  }

  /**
   * Check if email is already registered
   */
  static async isEmailRegistered(email: string): Promise<boolean> {
    const user = await this.findByEmail(email);
    return user !== null;
  }
}
