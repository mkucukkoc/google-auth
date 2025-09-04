import { db } from '../firebase';
import { HashService } from './hashService';
import { User, RegisterRequest } from '../types/auth';
import { v4 as uuidv4 } from 'uuid';
import admin from 'firebase-admin';

export class UserService {
  /**
   * Create a new user
   */
  static async createUser(request: RegisterRequest): Promise<User> {
    const userId = uuidv4();
    const passwordHash = request.password ? await HashService.hashPassword(request.password) : '';
    const now = new Date();
    const email = request.email.toLowerCase().trim();

    // Create user in Firebase Authentication
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().createUser({
        uid: userId,
        email: email,
        displayName: request.name || '',
        emailVerified: false,
        password: request.password,
      });
      console.log('Firebase user created:', firebaseUser.uid);
    } catch (error) {
      console.error('Firebase user creation failed:', error);
      throw new Error('Failed to create Firebase user');
    }

    const user: Omit<User, 'id'> = {
      email: email,
      passwordHash,
      name: request.name,
      isEmailVerified: false,
      createdAt: now,
      updatedAt: now,
      failedLoginAttempts: 0,
    };

    await db.collection('subsc').doc(userId).set(user);

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

    // Create user in Firebase Authentication
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().createUser({
        uid: userId,
        email: normalizedEmail,
        displayName: name || '',
        emailVerified: true, // Google users are pre-verified
      });
      console.log('Firebase Google user created:', firebaseUser.uid);
    } catch (error) {
      console.error('Firebase Google user creation failed:', error);
      throw new Error('Failed to create Firebase Google user');
    }

    const user: Omit<User, 'id'> = {
      email: normalizedEmail,
      passwordHash: '', // Google users don't have passwords
      name: name || '',
      isEmailVerified: true, // Google users are pre-verified
      createdAt: now,
      updatedAt: now,
      failedLoginAttempts: 0,
    };

    await db.collection('subsc').doc(userId).set(user);

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
    } as User;
  }

  /**
   * Find user by ID
   */
  static async findById(userId: string): Promise<User | null> {
    const doc = await db.collection('subsc').doc(userId).get();
    
    if (!doc.exists) {
      return null;
    }

    return {
      id: doc.id,
      ...doc.data(),
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
