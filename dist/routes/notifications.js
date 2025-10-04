"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const pushNotificationService_1 = require("../services/pushNotificationService");
const authMiddleware_1 = require("../middleware/authMiddleware");
const validationMiddleware_1 = require("../middleware/validationMiddleware");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
// Validation schemas
const saveTokenSchema = zod_1.z.object({
    expoPushToken: zod_1.z.string().min(1, 'Expo push token is required'),
    deviceId: zod_1.z.string().min(1, 'Device ID is required'),
    platform: zod_1.z.enum(['ios', 'android', 'web']),
});
const sendNotificationSchema = zod_1.z.object({
    userIds: zod_1.z.array(zod_1.z.string()).optional(),
    title: zod_1.z.string().min(1, 'Title is required'),
    body: zod_1.z.string().min(1, 'Body is required'),
    data: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
    sound: zod_1.z.string().optional(),
    badge: zod_1.z.number().optional(),
    priority: zod_1.z.enum(['default', 'normal', 'high']).optional(),
    channelId: zod_1.z.string().optional(),
    category: zod_1.z.string().optional(),
});
const sendBulkNotificationSchema = zod_1.z.object({
    expoPushTokens: zod_1.z.array(zod_1.z.string()).min(1, 'At least one push token is required'),
    title: zod_1.z.string().min(1, 'Title is required'),
    body: zod_1.z.string().min(1, 'Body is required'),
    data: zod_1.z.record(zod_1.z.string(), zod_1.z.any()).optional(),
    sound: zod_1.z.string().optional(),
    badge: zod_1.z.number().optional(),
    priority: zod_1.z.enum(['default', 'normal', 'high']).optional(),
    channelId: zod_1.z.string().optional(),
    category: zod_1.z.string().optional(),
});
// Save user push token
router.post('/tokens', authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(saveTokenSchema), async (req, res) => {
    try {
        const { expoPushToken, deviceId, platform } = req.body;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: { code: 'unauthorized', message: 'User not authenticated' }
            });
        }
        await pushNotificationService_1.pushNotificationService.saveUserPushToken(userId, expoPushToken, deviceId, platform);
        logger_1.logger.info('Push token saved successfully', { userId, deviceId, platform });
        res.json({
            success: true,
            message: 'Push token saved successfully',
            data: { userId, deviceId, platform }
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to save push token:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'internal_error',
                message: 'Failed to save push token'
            }
        });
    }
});
// Deactivate user push token
router.delete('/tokens/:deviceId', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: { code: 'unauthorized', message: 'User not authenticated' }
            });
        }
        await pushNotificationService_1.pushNotificationService.deactivateUserPushToken(userId, deviceId);
        logger_1.logger.info('Push token deactivated successfully', { userId, deviceId });
        res.json({
            success: true,
            message: 'Push token deactivated successfully',
            data: { userId, deviceId }
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to deactivate push token:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'internal_error',
                message: 'Failed to deactivate push token'
            }
        });
    }
});
// Send notification to specific users
router.post('/send', authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(sendNotificationSchema), async (req, res) => {
    try {
        const { userIds, ...notification } = req.body;
        const senderId = req.user?.id;
        if (!senderId) {
            return res.status(401).json({
                success: false,
                error: { code: 'unauthorized', message: 'User not authenticated' }
            });
        }
        if (userIds && userIds.length > 0) {
            // Send to specific users
            await pushNotificationService_1.pushNotificationService.sendPushNotificationToUsers(userIds, notification);
            logger_1.logger.info('Push notification sent to specific users', {
                senderId,
                userIds: userIds.length,
                title: notification.title
            });
        }
        else {
            // Send to all users
            await pushNotificationService_1.pushNotificationService.sendPushNotificationToAllUsers(notification);
            logger_1.logger.info('Push notification sent to all users', {
                senderId,
                title: notification.title
            });
        }
        res.json({
            success: true,
            message: 'Push notification sent successfully',
            data: {
                userIds: userIds || 'all',
                title: notification.title
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to send push notification:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'internal_error',
                message: 'Failed to send push notification'
            }
        });
    }
});
// Send notification to specific push tokens
router.post('/send/bulk', authMiddleware_1.authenticateToken, (0, validationMiddleware_1.validate)(sendBulkNotificationSchema), async (req, res) => {
    try {
        const { expoPushTokens, ...notification } = req.body;
        const senderId = req.user?.id;
        if (!senderId) {
            return res.status(401).json({
                success: false,
                error: { code: 'unauthorized', message: 'User not authenticated' }
            });
        }
        const tickets = await pushNotificationService_1.pushNotificationService.sendBulkPushNotification(expoPushTokens, notification);
        logger_1.logger.info('Bulk push notification sent', {
            senderId,
            tokenCount: expoPushTokens.length,
            title: notification.title
        });
        res.json({
            success: true,
            message: 'Bulk push notification sent successfully',
            data: {
                tokenCount: expoPushTokens.length,
                tickets: tickets.length,
                title: notification.title
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to send bulk push notification:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'internal_error',
                message: 'Failed to send bulk push notification'
            }
        });
    }
});
// Send chat message notification
router.post('/chat/message', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const { chatId, recipientIds, senderName, messagePreview, messageId } = req.body;
        const senderId = req.user?.id;
        if (!senderId) {
            return res.status(401).json({
                success: false,
                error: { code: 'unauthorized', message: 'User not authenticated' }
            });
        }
        if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: { code: 'invalid_request', message: 'Recipient IDs are required' }
            });
        }
        const notification = {
            title: 'Yeni Mesaj',
            body: `${senderName}: ${messagePreview}`,
            data: {
                chatId,
                messageId,
                senderId,
                senderName,
                messagePreview,
                deepLink: `chat/${chatId}`,
            },
            sound: 'default',
            priority: 'high',
            channelId: 'chat',
            category: 'chat_message',
        };
        await pushNotificationService_1.pushNotificationService.sendPushNotificationToUsers(recipientIds, notification);
        logger_1.logger.info('Chat message notification sent', {
            senderId,
            chatId,
            recipientCount: recipientIds.length
        });
        res.json({
            success: true,
            message: 'Chat message notification sent successfully',
            data: { chatId, recipientCount: recipientIds.length }
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to send chat message notification:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'internal_error',
                message: 'Failed to send chat message notification'
            }
        });
    }
});
// Send payment notification
router.post('/payment', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const { userId, type, amount, subscriptionId, reason } = req.body;
        const senderId = req.user?.id;
        if (!senderId) {
            return res.status(401).json({
                success: false,
                error: { code: 'unauthorized', message: 'User not authenticated' }
            });
        }
        if (!userId || !type || !amount) {
            return res.status(400).json({
                success: false,
                error: { code: 'invalid_request', message: 'User ID, type, and amount are required' }
            });
        }
        let notification;
        if (type === 'success') {
            notification = {
                title: 'Ödeme Başarılı',
                body: `${amount} ödemesi başarıyla tamamlandı`,
                data: {
                    type: 'payment_success',
                    amount,
                    subscriptionId,
                    deepLink: 'premium/status',
                },
                sound: 'default',
                priority: 'high',
                channelId: 'payments',
                category: 'payment_success',
            };
        }
        else if (type === 'failed') {
            notification = {
                title: 'Ödeme Başarısız',
                body: `${amount} ödemesi başarısız oldu. ${reason || 'Lütfen tekrar deneyin.'}`,
                data: {
                    type: 'payment_failed',
                    amount,
                    reason,
                    deepLink: 'premium/payment',
                },
                sound: 'default',
                priority: 'high',
                channelId: 'payments',
                category: 'payment_failed',
            };
        }
        else {
            return res.status(400).json({
                success: false,
                error: { code: 'invalid_request', message: 'Type must be success or failed' }
            });
        }
        await pushNotificationService_1.pushNotificationService.sendPushNotificationToUser(userId, notification);
        logger_1.logger.info('Payment notification sent', {
            senderId,
            userId,
            type,
            amount
        });
        res.json({
            success: true,
            message: 'Payment notification sent successfully',
            data: { userId, type, amount }
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to send payment notification:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'internal_error',
                message: 'Failed to send payment notification'
            }
        });
    }
});
// Send subscription expiring notification
router.post('/subscription/expiring', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const { userId, daysLeft, subscriptionId } = req.body;
        const senderId = req.user?.id;
        if (!senderId) {
            return res.status(401).json({
                success: false,
                error: { code: 'unauthorized', message: 'User not authenticated' }
            });
        }
        if (!userId || !daysLeft || !subscriptionId) {
            return res.status(400).json({
                success: false,
                error: { code: 'invalid_request', message: 'User ID, days left, and subscription ID are required' }
            });
        }
        const notification = {
            title: 'Abonelik Uyarısı',
            body: `Aboneliğiniz ${daysLeft} gün sonra sona eriyor`,
            data: {
                type: 'subscription_expiring',
                daysLeft,
                subscriptionId,
                deepLink: 'premium/renew',
            },
            sound: 'default',
            priority: 'high',
            channelId: 'payments',
            category: 'subscription_expiring',
        };
        await pushNotificationService_1.pushNotificationService.sendPushNotificationToUser(userId, notification);
        logger_1.logger.info('Subscription expiring notification sent', {
            senderId,
            userId,
            daysLeft,
            subscriptionId
        });
        res.json({
            success: true,
            message: 'Subscription expiring notification sent successfully',
            data: { userId, daysLeft, subscriptionId }
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to send subscription expiring notification:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'internal_error',
                message: 'Failed to send subscription expiring notification'
            }
        });
    }
});
// Send system notification
router.post('/system', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const { title, body, data, userIds } = req.body;
        const senderId = req.user?.id;
        if (!senderId) {
            return res.status(401).json({
                success: false,
                error: { code: 'unauthorized', message: 'User not authenticated' }
            });
        }
        if (!title || !body) {
            return res.status(400).json({
                success: false,
                error: { code: 'invalid_request', message: 'Title and body are required' }
            });
        }
        const notification = {
            title,
            body,
            data: {
                type: 'system',
                ...data,
            },
            sound: 'default',
            priority: 'default',
            channelId: 'system',
            category: 'system_update',
        };
        if (userIds && userIds.length > 0) {
            await pushNotificationService_1.pushNotificationService.sendPushNotificationToUsers(userIds, notification);
            logger_1.logger.info('System notification sent to specific users', {
                senderId,
                userIds: userIds.length,
                title
            });
        }
        else {
            await pushNotificationService_1.pushNotificationService.sendPushNotificationToAllUsers(notification);
            logger_1.logger.info('System notification sent to all users', {
                senderId,
                title
            });
        }
        res.json({
            success: true,
            message: 'System notification sent successfully',
            data: {
                userIds: userIds || 'all',
                title
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to send system notification:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'internal_error',
                message: 'Failed to send system notification'
            }
        });
    }
});
// Get push notification statistics
router.get('/stats', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const senderId = req.user?.id;
        if (!senderId) {
            return res.status(401).json({
                success: false,
                error: { code: 'unauthorized', message: 'User not authenticated' }
            });
        }
        const stats = await pushNotificationService_1.pushNotificationService.getPushNotificationStats();
        res.json({
            success: true,
            data: stats
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to get push notification stats:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'internal_error',
                message: 'Failed to get push notification stats'
            }
        });
    }
});
// Cleanup inactive tokens
router.post('/cleanup', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const { daysInactive = 30 } = req.body;
        const senderId = req.user?.id;
        if (!senderId) {
            return res.status(401).json({
                success: false,
                error: { code: 'unauthorized', message: 'User not authenticated' }
            });
        }
        await pushNotificationService_1.pushNotificationService.cleanupInactiveTokens(daysInactive);
        logger_1.logger.info('Inactive tokens cleaned up', { senderId, daysInactive });
        res.json({
            success: true,
            message: 'Inactive tokens cleaned up successfully',
            data: { daysInactive }
        });
    }
    catch (error) {
        logger_1.logger.error('Failed to cleanup inactive tokens:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'internal_error',
                message: 'Failed to cleanup inactive tokens'
            }
        });
    }
});
exports.default = router;
