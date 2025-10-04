"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChatRouter = createChatRouter;
const express_1 = require("express");
const chatService_1 = require("../services/chatService");
const authMiddleware_1 = require("../middleware/authMiddleware");
const validationMiddleware_1 = require("../middleware/validationMiddleware");
const rateLimitMiddleware_1 = require("../middleware/rateLimitMiddleware");
const auditService_1 = require("../services/auditService");
const logger_1 = require("../utils/logger");
function createChatRouter() {
    const r = (0, express_1.Router)();
    // POST /chat/send - ChatGPT'ye mesaj gönder
    r.post('/send', authMiddleware_1.authenticateToken, rateLimitMiddleware_1.authRateLimits.general, (0, validationMiddleware_1.validate)(validationMiddleware_1.chatSchemas.sendMessage), async (req, res) => {
        const authReq = req;
        const { messages, chatId, hasImage, imageFileUrl } = req.body;
        try {
            logger_1.logger.info({
                userId: authReq.user.id,
                chatId,
                messageCount: messages.length,
                hasImage,
                operation: 'chatSend'
            }, 'Chat send request received');
            const chatRequest = {
                messages,
                chatId,
                userId: authReq.user.id,
                hasImage,
                imageFileUrl
            };
            const result = await chatService_1.ChatService.sendMessage(chatRequest);
            if (result.success && result.data) {
                // Mesajı Firestore'a kaydet
                await chatService_1.ChatService.saveMessageToFirestore(authReq.user.id, chatId, result.data.message);
                // Chat başlığı oluştur (sadece ilk assistant mesajında)
                if (result.data.message.role === 'assistant') {
                    const title = await chatService_1.ChatService.generateChatTitle(result.data.message.content);
                    // Chat başlığını güncelle (burada implement edilecek)
                }
                // Audit log
                await auditService_1.auditService.logUserAction(authReq.user.id, 'chat_send', {
                    chatId,
                    messageCount: messages.length,
                    hasImage,
                    success: true
                });
                logger_1.logger.info({
                    userId: authReq.user.id,
                    chatId,
                    operation: 'chatSend'
                }, 'Chat message processed successfully');
                res.json(result);
            }
            else {
                logger_1.logger.error({
                    userId: authReq.user.id,
                    chatId,
                    error: result.error,
                    operation: 'chatSend'
                }, 'Chat message processing failed');
                res.status(400).json(result);
            }
        }
        catch (error) {
            logger_1.logger.error({
                err: error,
                userId: authReq.user.id,
                chatId,
                operation: 'chatSend'
            }, 'Chat send error');
            await auditService_1.auditService.logUserAction(authReq.user.id, 'chat_send', {
                chatId,
                messageCount: messages.length,
                hasImage,
                success: false,
                errorMessage: error.message
            });
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to process chat message'
            });
        }
    });
    // POST /chat/tts - Text-to-Speech
    r.post('/tts', authMiddleware_1.authenticateToken, rateLimitMiddleware_1.authRateLimits.general, (0, validationMiddleware_1.validate)(validationMiddleware_1.chatSchemas.textToSpeech), async (req, res) => {
        const authReq = req;
        const { messages } = req.body;
        try {
            logger_1.logger.info({
                userId: authReq.user.id,
                messageCount: messages.length,
                operation: 'chatTTS'
            }, 'TTS request received');
            const result = await chatService_1.ChatService.textToSpeech(messages);
            if (result.success) {
                await auditService_1.auditService.logUserAction(authReq.user.id, 'chat_tts', {
                    messageCount: messages.length,
                    success: true
                });
                logger_1.logger.info({
                    userId: authReq.user.id,
                    operation: 'chatTTS'
                }, 'TTS conversion completed successfully');
                res.json(result);
            }
            else {
                logger_1.logger.error({
                    userId: authReq.user.id,
                    error: result.error,
                    operation: 'chatTTS'
                }, 'TTS conversion failed');
                res.status(400).json(result);
            }
        }
        catch (error) {
            logger_1.logger.error({
                err: error,
                userId: authReq.user.id,
                operation: 'chatTTS'
            }, 'TTS error');
            await auditService_1.auditService.logUserAction(authReq.user.id, 'chat_tts', {
                messageCount: messages.length,
                success: false,
                errorMessage: error.message
            });
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to convert text to speech'
            });
        }
    });
    // GET /chat/messages/:chatId - Chat mesajlarını getir
    r.get('/messages/:chatId', authMiddleware_1.authenticateToken, rateLimitMiddleware_1.authRateLimits.general, async (req, res) => {
        const authReq = req;
        const { chatId } = req.params;
        try {
            logger_1.logger.info({
                userId: authReq.user.id,
                chatId,
                operation: 'getChatMessages'
            }, 'Get chat messages request received');
            // Firestore'dan mesajları getir
            const { db } = require('../firebase');
            const { collection, getDocs, query, orderBy, where } = require('firebase/firestore');
            const messagesRef = collection(db, 'users', authReq.user.id, 'chats', chatId, 'messages');
            const q = query(messagesRef, orderBy('timestamp', 'asc'));
            const snapshot = await getDocs(q);
            const messages = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }));
            logger_1.logger.info({
                userId: authReq.user.id,
                chatId,
                messageCount: messages.length,
                operation: 'getChatMessages'
            }, 'Chat messages retrieved successfully');
            res.json({
                success: true,
                data: { messages },
                message: 'Messages retrieved successfully'
            });
        }
        catch (error) {
            logger_1.logger.error({
                err: error,
                userId: authReq.user.id,
                chatId,
                operation: 'getChatMessages'
            }, 'Get chat messages error');
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to retrieve chat messages'
            });
        }
    });
    // POST /chat/create - Yeni chat oluştur
    r.post('/create', authMiddleware_1.authenticateToken, rateLimitMiddleware_1.authRateLimits.general, async (req, res) => {
        const authReq = req;
        const { title } = req.body;
        try {
            logger_1.logger.info({
                userId: authReq.user.id,
                title,
                operation: 'createChat'
            }, 'Create chat request received');
            // Yeni chat ID oluştur
            const chatId = require('crypto').randomUUID();
            // Firestore'da chat oluştur
            const { db } = require('../firebase');
            const { setDoc, doc, serverTimestamp } = require('firebase/firestore');
            const chatRef = doc(db, 'users', authReq.user.id, 'chats', chatId);
            await setDoc(chatRef, {
                id: chatId,
                title: title || 'Yeni Chat',
                createdAt: serverTimestamp(),
                lastMessage: '',
                userId: authReq.user.id
            });
            await auditService_1.auditService.logUserAction(authReq.user.id, 'chat_create', {
                chatId,
                title: title || 'Yeni Chat',
                success: true
            });
            logger_1.logger.info({
                userId: authReq.user.id,
                chatId,
                operation: 'createChat'
            }, 'Chat created successfully');
            res.json({
                success: true,
                data: { chatId },
                message: 'Chat created successfully'
            });
        }
        catch (error) {
            logger_1.logger.error({
                err: error,
                userId: authReq.user.id,
                operation: 'createChat'
            }, 'Create chat error');
            await auditService_1.auditService.logUserAction(authReq.user.id, 'chat_create', {
                success: false,
                errorMessage: error.message
            });
            res.status(500).json({
                error: 'internal_error',
                message: 'Failed to create chat'
            });
        }
    });
    return r;
}
