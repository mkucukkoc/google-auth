"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebSocketService = exports.initializeWebSocket = exports.WebSocketService = void 0;
const socket_io_1 = require("socket.io");
const logger_1 = require("../utils/logger");
const tokenService_1 = require("./tokenService");
const userService_1 = require("./userService");
const auditService_1 = require("./auditService");
class WebSocketService {
    constructor(httpServer) {
        this.connectedUsers = new Map();
        this.userSockets = new Map(); // userId -> socketId
        this.io = new socket_io_1.Server(httpServer, {
            cors: {
                origin: process.env.CORS_ORIGIN || "*",
                methods: ["GET", "POST"],
                credentials: true
            },
            transports: ['websocket', 'polling']
        });
        this.setupMiddleware();
        this.setupEventHandlers();
    }
    setupMiddleware() {
        // Authentication middleware
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
                if (!token) {
                    return next(new Error('Authentication token required'));
                }
                // Verify token directly without Express middleware
                const decoded = await this.verifyToken(token);
                if (!decoded) {
                    return next(new Error('Invalid token'));
                }
                // Get user information
                const user = await this.getUserById(decoded.sub);
                if (!user) {
                    return next(new Error('User not found'));
                }
                socket.data.user = {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    avatar: user.avatar,
                };
                next();
            }
            catch (error) {
                logger_1.logger.error({ error }, 'WebSocket authentication failed');
                next(new Error('Authentication failed'));
            }
        });
    }
    async verifyToken(token) {
        try {
            const decoded = await tokenService_1.TokenService.verifyAccessToken(token);
            return decoded;
        }
        catch (error) {
            logger_1.logger.error({ error }, 'Token verification failed');
            return null;
        }
    }
    async getUserById(userId) {
        try {
            const user = await userService_1.UserService.findById(userId);
            return user;
        }
        catch (error) {
            logger_1.logger.error({ error, userId }, 'Failed to get user by ID');
            return null;
        }
    }
    setupEventHandlers() {
        this.io.on('connection', (socket) => {
            const user = socket.data.user;
            const deviceId = socket.handshake.auth.deviceId || 'unknown';
            logger_1.logger.info({ userId: user.id, socketId: socket.id }, 'User connected to WebSocket');
            // Store user connection
            this.connectedUsers.set(socket.id, {
                userId: user.id,
                socketId: socket.id,
                deviceId,
                lastSeen: new Date(),
            });
            this.userSockets.set(user.id, socket.id);
            // Join user to their personal room
            socket.join(`user:${user.id}`);
            // Handle chat events
            this.setupChatEvents(socket);
            // Handle typing indicators
            this.setupTypingEvents(socket);
            // Handle presence events
            this.setupPresenceEvents(socket);
            // Handle disconnection
            socket.on('disconnect', (reason) => {
                logger_1.logger.info({ userId: user.id, socketId: socket.id, reason }, 'User disconnected from WebSocket');
                this.connectedUsers.delete(socket.id);
                this.userSockets.delete(user.id);
                // Notify other users about disconnection
                socket.broadcast.emit('user:offline', {
                    userId: user.id,
                    timestamp: new Date(),
                });
            });
            // Handle errors
            socket.on('error', (error) => {
                logger_1.logger.error({ userId: user.id, error }, 'WebSocket error');
            });
        });
    }
    setupChatEvents(socket) {
        // Join chat room
        socket.on('chat:join', async (data) => {
            try {
                const { chatId } = data;
                socket.join(`chat:${chatId}`);
                logger_1.logger.info({
                    userId: socket.data.user.id,
                    chatId
                }, 'User joined chat room');
                // Notify others in the chat
                socket.to(`chat:${chatId}`).emit('chat:user_joined', {
                    userId: socket.data.user.id,
                    chatId,
                    timestamp: new Date(),
                });
            }
            catch (error) {
                logger_1.logger.error({ error }, 'Error joining chat room');
                socket.emit('error', { message: 'Failed to join chat room' });
            }
        });
        // Leave chat room
        socket.on('chat:leave', async (data) => {
            try {
                const { chatId } = data;
                socket.leave(`chat:${chatId}`);
                logger_1.logger.info({
                    userId: socket.data.user.id,
                    chatId
                }, 'User left chat room');
                // Notify others in the chat
                socket.to(`chat:${chatId}`).emit('chat:user_left', {
                    userId: socket.data.user.id,
                    chatId,
                    timestamp: new Date(),
                });
            }
            catch (error) {
                logger_1.logger.error({ error }, 'Error leaving chat room');
                socket.emit('error', { message: 'Failed to leave chat room' });
            }
        });
        // Send message
        socket.on('chat:message', async (data) => {
            try {
                const { chatId, content, type = 'text' } = data;
                const user = socket.data.user;
                const message = {
                    id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    userId: user.id,
                    chatId,
                    content,
                    timestamp: new Date(),
                    type: type,
                };
                // Broadcast message to all users in the chat
                this.io.to(`chat:${chatId}`).emit('chat:message', message);
                // Log message for audit
                await auditService_1.auditService.logUserAction(user.id, 'chat_message', {
                    chatId,
                    messageId: message.id,
                    messageType: type,
                });
                logger_1.logger.info({
                    userId: user.id,
                    chatId,
                    messageId: message.id
                }, 'Message sent via WebSocket');
            }
            catch (error) {
                logger_1.logger.error({ error }, 'Error sending message');
                socket.emit('error', { message: 'Failed to send message' });
            }
        });
    }
    setupTypingEvents(socket) {
        socket.on('typing:start', (data) => {
            const { chatId } = data;
            const user = socket.data.user;
            const typingIndicator = {
                userId: user.id,
                chatId,
                isTyping: true,
            };
            // Notify others in the chat
            socket.to(`chat:${chatId}`).emit('typing:indicator', typingIndicator);
        });
        socket.on('typing:stop', (data) => {
            const { chatId } = data;
            const user = socket.data.user;
            const typingIndicator = {
                userId: user.id,
                chatId,
                isTyping: false,
            };
            // Notify others in the chat
            socket.to(`chat:${chatId}`).emit('typing:indicator', typingIndicator);
        });
    }
    setupPresenceEvents(socket) {
        // Send online status
        socket.on('presence:online', () => {
            const user = socket.data.user;
            // Notify all connected users
            socket.broadcast.emit('user:online', {
                userId: user.id,
                timestamp: new Date(),
            });
        });
        // Send offline status
        socket.on('presence:offline', () => {
            const user = socket.data.user;
            // Notify all connected users
            socket.broadcast.emit('user:offline', {
                userId: user.id,
                timestamp: new Date(),
            });
        });
    }
    // Public methods for server-side usage
    sendToUser(userId, event, data) {
        const socketId = this.userSockets.get(userId);
        if (socketId) {
            this.io.to(socketId).emit(event, data);
        }
    }
    sendToChat(chatId, event, data) {
        this.io.to(`chat:${chatId}`).emit(event, data);
    }
    broadcast(event, data) {
        this.io.emit(event, data);
    }
    getConnectedUsers() {
        return Array.from(this.connectedUsers.values());
    }
    isUserOnline(userId) {
        return this.userSockets.has(userId);
    }
    getOnlineUsers() {
        return Array.from(this.userSockets.keys());
    }
}
exports.WebSocketService = WebSocketService;
// Singleton instance
let websocketService = null;
const initializeWebSocket = (httpServer) => {
    if (!websocketService) {
        websocketService = new WebSocketService(httpServer);
    }
    return websocketService;
};
exports.initializeWebSocket = initializeWebSocket;
const getWebSocketService = () => {
    return websocketService;
};
exports.getWebSocketService = getWebSocketService;
