"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditService = void 0;
// import { getFirestore } from 'firebase-admin/firestore'; // Temporarily disabled
const logger_1 = require("../utils/logger");
const cacheService_1 = require("./cacheService");
const firebase_1 = require("../firebase");
class AuditService {
    constructor() {
        this.collectionName = 'audit_logs';
        // this.firestore = getFirestore(); // Temporarily disabled
        this.firestore = null; // Mock firestore
    }
    static getInstance() {
        if (!AuditService.instance) {
            AuditService.instance = new AuditService();
        }
        return AuditService.instance;
    }
    // Log an audit event
    async logEvent(event) {
        try {
            const auditEvent = {
                ...event,
                timestamp: new Date(),
            };
            // Add to Firestore (temporarily disabled)
            // await this.firestore.collection(this.collectionName).add(auditEvent);
            logger_1.logger.debug('Mock Audit: Event logged', auditEvent);
            // Add to cache for quick access
            await this.cacheRecentEvent(auditEvent);
            logger_1.logger.info('Audit event logged', {
                action: event.action,
                resource: event.resource,
                userId: event.userId,
                success: event.success,
            });
        }
        catch (error) {
            logger_1.logger.error('Failed to log audit event:', error);
            // Don't throw error to avoid breaking the main flow
        }
    }
    // Log authentication events
    async logAuthEvent(action, details, success) {
        const { userId, ipAddress, userAgent, ...otherDetails } = details;
        await this.logEvent({
            userId: userId || '',
            action,
            resource: 'authentication',
            details: otherDetails,
            ipAddress,
            userAgent,
            success: success !== undefined ? success : true,
        });
    }
    // Log API events
    async logApiEvent(action, resource, resourceId, userId, success, details, ipAddress, userAgent) {
        await this.logEvent({
            userId,
            action,
            resource,
            resourceId,
            details,
            ipAddress,
            userAgent,
            success,
        });
    }
    // Log user actions
    async logUserAction(userId, action, details, ipAddress, userAgent) {
        await this.logEvent({
            userId,
            action,
            resource: 'user_action',
            details,
            ipAddress,
            userAgent,
            success: true,
        });
    }
    // Log chat events
    async logChatEvent(action, chatId, userId, success, details, ipAddress, userAgent) {
        await this.logEvent({
            userId,
            action,
            resource: 'chat',
            resourceId: chatId,
            details,
            ipAddress,
            userAgent,
            success,
        });
    }
    // Log file events
    async logFileEvent(action, fileId, userId, success, details, ipAddress, userAgent) {
        await this.logEvent({
            userId,
            action,
            resource: 'file',
            resourceId: fileId,
            details,
            ipAddress,
            userAgent,
            success,
        });
    }
    // Log security events
    async logSecurityEvent(action, userId, details, ipAddress, userAgent) {
        await this.logEvent({
            userId,
            action,
            resource: 'security',
            details,
            ipAddress,
            userAgent,
            success: false, // Security events are typically failures
        });
    }
    // Query audit events
    async queryEvents(query) {
        try {
            // let firestoreQuery = this.firestore.collection(this.collectionName); // Temporarily disabled
            logger_1.logger.debug('Mock Audit: Query events', query);
            return []; // Return empty array for testing
            // Apply filters
            let queryBuilder = firebase_1.firestoreQuery;
            if (query.userId) {
                queryBuilder = queryBuilder.where('userId', '==', query.userId);
            }
            if (query.action) {
                queryBuilder = queryBuilder.where('action', '==', query.action);
            }
            if (query.resource) {
                queryBuilder = queryBuilder.where('resource', '==', query.resource);
            }
            if (query.success !== undefined) {
                queryBuilder = queryBuilder.where('success', '==', query.success);
            }
            if (query.startDate) {
                queryBuilder = queryBuilder.where('timestamp', '>=', query.startDate);
            }
            if (query.endDate) {
                queryBuilder = queryBuilder.where('timestamp', '<=', query.endDate);
            }
            // Apply ordering and pagination
            queryBuilder = queryBuilder.orderBy('timestamp', 'desc');
            if (query.offset !== undefined && query.offset !== null) {
                queryBuilder = queryBuilder.offset(query.offset);
            }
            if (query.limit !== undefined && query.limit !== null) {
                queryBuilder = queryBuilder.limit(query.limit);
            }
            const snapshot = await queryBuilder.get();
            const events = [];
            snapshot.forEach((doc) => {
                events.push({
                    id: doc.id,
                    ...doc.data(),
                });
            });
            return events;
        }
        catch (error) {
            logger_1.logger.error('Failed to query audit events:', error);
            return [];
        }
    }
    // Get audit statistics
    async getAuditStats(startDate, endDate, userId) {
        try {
            let query = this.firestore
                .collection(this.collectionName)
                .where('timestamp', '>=', startDate)
                .where('timestamp', '<=', endDate);
            if (userId) {
                query = query.where('userId', '==', userId);
            }
            const snapshot = await query.get();
            const events = [];
            snapshot.forEach((doc) => {
                events.push({
                    id: doc.id,
                    ...doc.data(),
                });
            });
            // Calculate statistics
            const totalEvents = events.length;
            const successfulEvents = events.filter(e => e.success).length;
            const failedEvents = totalEvents - successfulEvents;
            const eventsByAction = {};
            const eventsByResource = {};
            const eventsByUser = {};
            events.forEach(event => {
                // Count by action
                eventsByAction[event.action] = (eventsByAction[event.action] || 0) + 1;
                // Count by resource
                eventsByResource[event.resource] = (eventsByResource[event.resource] || 0) + 1;
                // Count by user
                if (event.userId) {
                    eventsByUser[event.userId] = (eventsByUser[event.userId] || 0) + 1;
                }
            });
            return {
                totalEvents,
                eventsByAction,
                eventsByResource,
                eventsByUser,
                successRate: totalEvents > 0 ? (successfulEvents / totalEvents) * 100 : 0,
                errorRate: totalEvents > 0 ? (failedEvents / totalEvents) * 100 : 0,
                timeRange: {
                    start: startDate,
                    end: endDate,
                },
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get audit stats:', error);
            return {
                totalEvents: 0,
                eventsByAction: {},
                eventsByResource: {},
                eventsByUser: {},
                successRate: 0,
                errorRate: 0,
                timeRange: {
                    start: startDate,
                    end: endDate,
                },
            };
        }
    }
    // Get user activity summary
    async getUserActivitySummary(userId, days = 30) {
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            const events = await this.queryEvents({
                userId,
                startDate,
                endDate,
                limit: 1000,
            });
            const summary = {
                userId,
                period: { start: startDate, end: endDate },
                totalEvents: events.length,
                lastActivity: events.length > 0 ? events[0].timestamp : null,
                activityByDay: this.groupEventsByDay(events),
                topActions: this.getTopActions(events),
                topResources: this.getTopResources(events),
                successRate: this.calculateSuccessRate(events),
            };
            return summary;
        }
        catch (error) {
            logger_1.logger.error('Failed to get user activity summary:', error);
            return null;
        }
    }
    // Cleanup old audit logs
    async cleanupOldAuditLogs(retentionDays) {
        try {
            // Temporarily disabled for testing
            logger_1.logger.debug('Mock Audit: Cleanup old audit logs', { retentionDays });
            return 0;
        }
        catch (error) {
            logger_1.logger.error('Failed to cleanup old audit logs:', error);
            return 0;
        }
    }
    // Cache recent events for quick access
    async cacheRecentEvent(event) {
        try {
            const cacheKey = `audit:recent:${event.userId || 'anonymous'}`;
            const recentEvents = await cacheService_1.cacheService.get(cacheKey) || [];
            recentEvents.unshift(event);
            // Keep only last 50 events
            const trimmedEvents = recentEvents.slice(0, 50);
            await cacheService_1.cacheService.set(cacheKey, trimmedEvents, 3600); // 1 hour
        }
        catch (error) {
            logger_1.logger.error('Failed to cache recent event:', error);
        }
    }
    // Helper methods
    groupEventsByDay(events) {
        const grouped = {};
        events.forEach(event => {
            const day = event.timestamp.toISOString().split('T')[0];
            grouped[day] = (grouped[day] || 0) + 1;
        });
        return grouped;
    }
    getTopActions(events, limit = 5) {
        const actionCounts = {};
        events.forEach(event => {
            actionCounts[event.action] = (actionCounts[event.action] || 0) + 1;
        });
        return Object.entries(actionCounts)
            .map(([action, count]) => ({ action, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }
    getTopResources(events, limit = 5) {
        const resourceCounts = {};
        events.forEach(event => {
            resourceCounts[event.resource] = (resourceCounts[event.resource] || 0) + 1;
        });
        return Object.entries(resourceCounts)
            .map(([resource, count]) => ({ resource, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }
    calculateSuccessRate(events) {
        if (events.length === 0)
            return 0;
        const successfulEvents = events.filter(e => e.success).length;
        return (successfulEvents / events.length) * 100;
    }
    // Export audit data
    async exportAuditData(startDate, endDate, format = 'json') {
        try {
            const events = await this.queryEvents({
                startDate,
                endDate,
                limit: 10000, // Max export limit
            });
            if (format === 'json') {
                return JSON.stringify(events, null, 2);
            }
            else {
                // Convert to CSV
                const headers = ['id', 'userId', 'action', 'resource', 'resourceId', 'timestamp', 'success', 'ipAddress'];
                const csvRows = [headers.join(',')];
                events.forEach(event => {
                    const row = headers.map(header => {
                        const value = event[header];
                        return typeof value === 'string' ? `"${value.replace(/"/g, '""')}"` : value || '';
                    });
                    csvRows.push(row.join(','));
                });
                return csvRows.join('\n');
            }
        }
        catch (error) {
            logger_1.logger.error('Failed to export audit data:', error);
            throw error;
        }
    }
}
// Export singleton instance
exports.auditService = AuditService.getInstance();
