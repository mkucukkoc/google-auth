"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushNotificationService = void 0;
const expo_server_sdk_1 = require("expo-server-sdk");
const logger_1 = require("../utils/logger");
const database_1 = require("../config/database");
class PushNotificationService {
    constructor() {
        this.isInitialized = false;
        this.expo = new expo_server_sdk_1.Expo({
            accessToken: process.env.EXPO_ACCESS_TOKEN,
            useFcmV1: true,
        });
    }
    static getInstance() {
        if (!PushNotificationService.instance) {
            PushNotificationService.instance = new PushNotificationService();
        }
        return PushNotificationService.instance;
    }
    // Initialize the service
    async initialize() {
        if (this.isInitialized) {
            logger_1.logger.info('PushNotificationService already initialized');
            return;
        }
        try {
            // Test Expo connection
            await this.testExpoConnection();
            this.isInitialized = true;
            logger_1.logger.info('PushNotificationService initialized successfully');
        }
        catch (error) {
            logger_1.logger.error('Failed to initialize PushNotificationService:', error);
            throw error;
        }
    }
    // Test Expo connection
    async testExpoConnection() {
        try {
            // Simple test to verify Expo SDK is working
            const testMessage = {
                to: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]', // Invalid token for testing
                title: 'Test',
                body: 'Test message',
            };
            // This will fail but we can catch the error to verify connection
            await this.expo.sendPushNotificationsAsync([testMessage]);
        }
        catch (error) {
            // Expected to fail with invalid token, but connection should work
            if (error instanceof Error && error.message.includes('InvalidPushTokenError')) {
                logger_1.logger.info('Expo connection test successful');
                return;
            }
            throw error;
        }
    }
    // Send push notification to single device
    async sendPushNotification(expoPushToken, notification) {
        try {
            if (!expo_server_sdk_1.Expo.isExpoPushToken(expoPushToken)) {
                throw new Error(`Invalid Expo push token: ${expoPushToken}`);
            }
            const message = {
                to: expoPushToken,
                title: notification.title,
                body: notification.body,
                data: notification.data || {},
                sound: notification.sound || 'default',
                badge: notification.badge,
                priority: notification.priority || 'default',
                channelId: notification.channelId,
                categoryId: notification.category,
            };
            const tickets = await this.expo.sendPushNotificationsAsync([message]);
            const ticket = tickets[0];
            if (ticket.status === 'error') {
                throw new Error(`Push notification failed: ${ticket.message}`);
            }
            logger_1.logger.info('Push notification sent successfully:', {
                token: expoPushToken,
                ticketId: ticket.id,
                status: ticket.status,
            });
            return ticket;
        }
        catch (error) {
            logger_1.logger.error('Failed to send push notification:', error);
            throw error;
        }
    }
    // Send push notification to multiple devices
    async sendBulkPushNotification(expoPushTokens, notification) {
        try {
            // Filter valid tokens
            const validTokens = expoPushTokens.filter(token => expo_server_sdk_1.Expo.isExpoPushToken(token));
            if (validTokens.length === 0) {
                throw new Error('No valid push tokens provided');
            }
            // Create messages
            const messages = validTokens.map(token => ({
                to: token,
                title: notification.title,
                body: notification.body,
                data: notification.data || {},
                sound: notification.sound || 'default',
                badge: notification.badge,
                priority: notification.priority || 'default',
                channelId: notification.channelId,
                categoryId: notification.category,
            }));
            // Send in batches (Expo recommends max 100 per batch)
            const batchSize = 100;
            const batches = this.chunkArray(messages, batchSize);
            const allTickets = [];
            for (const batch of batches) {
                const tickets = await this.expo.sendPushNotificationsAsync(batch);
                allTickets.push(...tickets);
            }
            logger_1.logger.info('Bulk push notification sent:', {
                totalTokens: expoPushTokens.length,
                validTokens: validTokens.length,
                tickets: allTickets.length,
            });
            return allTickets;
        }
        catch (error) {
            logger_1.logger.error('Failed to send bulk push notification:', error);
            throw error;
        }
    }
    // Send push notification to user
    async sendPushNotificationToUser(userId, notification) {
        try {
            const userTokens = await this.getUserPushTokens(userId);
            if (userTokens.length === 0) {
                logger_1.logger.warn('No push tokens found for user:', { userId });
                return;
            }
            const expoPushTokens = userTokens.map(token => token.expoPushToken);
            await this.sendBulkPushNotification(expoPushTokens, notification);
            logger_1.logger.info('Push notification sent to user:', { userId, tokenCount: userTokens.length });
        }
        catch (error) {
            logger_1.logger.error('Failed to send push notification to user:', error);
            throw error;
        }
    }
    // Send push notification to multiple users
    async sendPushNotificationToUsers(userIds, notification) {
        try {
            const allTokens = await this.getUsersPushTokens(userIds);
            if (allTokens.length === 0) {
                logger_1.logger.warn('No push tokens found for users:', { userIds });
                return;
            }
            const expoPushTokens = allTokens.map(token => token.expoPushToken);
            await this.sendBulkPushNotification(expoPushTokens, notification);
            logger_1.logger.info('Push notification sent to users:', {
                userIds: userIds.length,
                tokenCount: allTokens.length
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to send push notification to users:', error);
            throw error;
        }
    }
    // Send push notification to all active users
    async sendPushNotificationToAllUsers(notification) {
        try {
            const allTokens = await this.getAllActivePushTokens();
            if (allTokens.length === 0) {
                logger_1.logger.warn('No active push tokens found');
                return;
            }
            const expoPushTokens = allTokens.map(token => token.expoPushToken);
            await this.sendBulkPushNotification(expoPushTokens, notification);
            logger_1.logger.info('Push notification sent to all users:', { tokenCount: allTokens.length });
        }
        catch (error) {
            logger_1.logger.error('Failed to send push notification to all users:', error);
            throw error;
        }
    }
    // Save user push token
    async saveUserPushToken(userId, expoPushToken, deviceId, platform) {
        try {
            if (!expo_server_sdk_1.Expo.isExpoPushToken(expoPushToken)) {
                throw new Error(`Invalid Expo push token: ${expoPushToken}`);
            }
            const tokenData = {
                userId,
                expoPushToken,
                deviceId,
                platform,
                isActive: true,
                lastUsed: new Date(),
                createdAt: new Date(),
            };
            // Check if token already exists
            const existingToken = await this.getUserPushTokenByDevice(userId, deviceId);
            if (existingToken) {
                // Update existing token
                await this.updateUserPushToken(existingToken.id, tokenData);
                logger_1.logger.info('User push token updated:', { userId, deviceId });
            }
            else {
                // Create new token
                await this.createUserPushToken(tokenData);
                logger_1.logger.info('User push token created:', { userId, deviceId });
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to save user push token:', error);
            throw error;
        }
    }
    // Deactivate user push token
    async deactivateUserPushToken(userId, deviceId) {
        try {
            const token = await this.getUserPushTokenByDevice(userId, deviceId);
            if (token) {
                await this.updateUserPushToken(token.id, { isActive: false });
                logger_1.logger.info('User push token deactivated:', { userId, deviceId });
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to deactivate user push token:', error);
            throw error;
        }
    }
    // Get user push tokens
    async getUserPushTokens(userId) {
        try {
            const db = database_1.databaseManager.getFirestore();
            const tokensRef = db.collection('user_push_tokens');
            const snapshot = await tokensRef
                .where('userId', '==', userId)
                .where('isActive', '==', true)
                .get();
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                lastUsed: doc.data().lastUsed?.toDate(),
                createdAt: doc.data().createdAt?.toDate(),
            }));
        }
        catch (error) {
            logger_1.logger.error('Failed to get user push tokens:', error);
            return [];
        }
    }
    // Get multiple users push tokens
    async getUsersPushTokens(userIds) {
        try {
            const db = database_1.databaseManager.getFirestore();
            const tokensRef = db.collection('user_push_tokens');
            const snapshot = await tokensRef
                .where('userId', 'in', userIds)
                .where('isActive', '==', true)
                .get();
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                lastUsed: doc.data().lastUsed?.toDate(),
                createdAt: doc.data().createdAt?.toDate(),
            }));
        }
        catch (error) {
            logger_1.logger.error('Failed to get users push tokens:', error);
            return [];
        }
    }
    // Get all active push tokens
    async getAllActivePushTokens() {
        try {
            const db = database_1.databaseManager.getFirestore();
            const tokensRef = db.collection('user_push_tokens');
            const snapshot = await tokensRef
                .where('isActive', '==', true)
                .get();
            return snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                lastUsed: doc.data().lastUsed?.toDate(),
                createdAt: doc.data().createdAt?.toDate(),
            }));
        }
        catch (error) {
            logger_1.logger.error('Failed to get all active push tokens:', error);
            return [];
        }
    }
    // Get user push token by device
    async getUserPushTokenByDevice(userId, deviceId) {
        try {
            const db = database_1.databaseManager.getFirestore();
            const tokensRef = db.collection('user_push_tokens');
            const snapshot = await tokensRef
                .where('userId', '==', userId)
                .where('deviceId', '==', deviceId)
                .limit(1)
                .get();
            if (snapshot.empty) {
                return null;
            }
            const doc = snapshot.docs[0];
            return {
                id: doc.id,
                ...doc.data(),
                lastUsed: doc.data().lastUsed?.toDate(),
                createdAt: doc.data().createdAt?.toDate(),
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get user push token by device:', error);
            return null;
        }
    }
    // Create user push token
    async createUserPushToken(tokenData) {
        try {
            const db = database_1.databaseManager.getFirestore();
            const tokensRef = db.collection('user_push_tokens');
            await tokensRef.add({
                ...tokenData,
                lastUsed: new Date(),
                createdAt: new Date(),
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to create user push token:', error);
            throw error;
        }
    }
    // Update user push token
    async updateUserPushToken(tokenId, updateData) {
        try {
            const db = database_1.databaseManager.getFirestore();
            const tokenRef = db.collection('user_push_tokens').doc(tokenId);
            await tokenRef.update({
                ...updateData,
                lastUsed: new Date(),
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to update user push token:', error);
            throw error;
        }
    }
    // Chunk array into smaller arrays
    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
    // Get push notification statistics
    async getPushNotificationStats() {
        try {
            const allTokens = await this.getAllActivePushTokens();
            const platformBreakdown = allTokens.reduce((acc, token) => {
                acc[token.platform] = (acc[token.platform] || 0) + 1;
                return acc;
            }, {});
            return {
                totalTokens: allTokens.length,
                activeTokens: allTokens.filter(token => token.isActive).length,
                platformBreakdown,
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get push notification stats:', error);
            return {
                totalTokens: 0,
                activeTokens: 0,
                platformBreakdown: {},
            };
        }
    }
    // Clean up inactive tokens
    async cleanupInactiveTokens(daysInactive = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysInactive);
            const db = database_1.databaseManager.getFirestore();
            const tokensRef = db.collection('user_push_tokens');
            const snapshot = await tokensRef
                .where('isActive', '==', true)
                .where('lastUsed', '<', cutoffDate)
                .get();
            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, { isActive: false });
            });
            await batch.commit();
            logger_1.logger.info('Inactive push tokens cleaned up:', { count: snapshot.size });
        }
        catch (error) {
            logger_1.logger.error('Failed to cleanup inactive tokens:', error);
        }
    }
}
exports.pushNotificationService = PushNotificationService.getInstance();
