import { Router, Request, Response } from 'express';
import { ChatService, ChatRequest } from '../services/chatService';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import { validate, chatSchemas } from '../middleware/validationMiddleware';
import { authRateLimits } from '../middleware/rateLimitMiddleware';
import { auditService } from '../services/auditService';
import { logger } from '../utils/logger';

export function createChatRouter(): Router {
  const r = Router();
  
  console.log('[ChatRouter] Creating chat router with routes:');
  console.log('[ChatRouter] - POST /send');
  console.log('[ChatRouter] - POST /tts');
  console.log('[ChatRouter] - GET /history');
  console.log('[ChatRouter] - GET /history/:chatId');
  console.log('[ChatRouter] - DELETE /history/:chatId');

  // POST /chat/send - ChatGPT'ye mesaj gönder
  r.post('/send',
    authenticateToken,
    authRateLimits.general,
    validate(chatSchemas.sendMessage),
    async (req: Request, res: Response) => {
      const requestId = Math.random().toString(36).substring(7);
      const startTime = Date.now();
      const authReq = req as AuthRequest;
      const { messages, chatId, hasImage, imageFileUrl } = req.body;

      logger.info({
        requestId,
        operation: 'chatSend',
        userId: authReq.user?.id,
        chatId,
        messageCount: messages?.length,
        hasImage,
        imageFileUrl: imageFileUrl ? 'provided' : 'none',
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        headers: {
          contentType: req.headers['content-type'],
          accept: req.headers.accept
        }
      }, 'Chat send request received');

      try {
        const chatRequest: ChatRequest = {
          messages,
          chatId,
          userId: authReq.user!.id,
          hasImage,
          imageFileUrl
        };

        logger.debug({
          requestId,
          operation: 'chatSend',
          userId: authReq.user!.id,
          chatId,
          chatRequest: {
            messageCount: chatRequest.messages.length,
            hasImage: chatRequest.hasImage,
            imageFileUrl: chatRequest.imageFileUrl ? 'provided' : 'none'
          }
        }, 'Calling ChatService.sendMessage');

        const result = await ChatService.sendMessage(chatRequest);
        
        logger.info({
          requestId,
          operation: 'chatSend',
          userId: authReq.user!.id,
          chatId,
          success: result.success,
          hasData: !!result.data,
          error: result.error,
          processingTimeMs: Date.now() - startTime
        }, 'ChatService.sendMessage completed');

        if (result.success && result.data) {
          logger.debug({
            requestId,
            operation: 'chatSend',
            userId: authReq.user!.id,
            chatId,
            messageRole: result.data.message.role,
            messageLength: result.data.message.content?.length || 0,
            hasChatTitle: !!result.data.chatTitle
          }, 'Processing successful result');
          
          // Mesajı Firestore'a kaydet
          logger.debug({
            requestId,
            operation: 'chatSend',
            userId: authReq.user!.id,
            chatId,
            messageRole: result.data.message.role
          }, 'Saving message to Firestore');
          
          await ChatService.saveMessageToFirestore(
            authReq.user!.id,
            chatId,
            result.data.message
          );

          logger.info({
            requestId,
            operation: 'chatSend',
            userId: authReq.user!.id,
            chatId,
            messageRole: result.data.message.role
          }, 'Message saved to Firestore successfully');

          // Chat başlığı oluştur (sadece ilk assistant mesajında)
          if (result.data.message.role === 'assistant') {
            logger.debug({
              requestId,
              operation: 'chatSend',
              userId: authReq.user!.id,
              chatId,
              messageContent: result.data.message.content?.substring(0, 100) + '...'
            }, 'Generating chat title for assistant message');
            
            const title = await ChatService.generateChatTitle(result.data.message.content);
            
            logger.info({
              requestId,
              operation: 'chatSend',
              userId: authReq.user!.id,
              chatId,
              generatedTitle: title
            }, 'Chat title generated successfully');
          }

          // Audit log
          logger.debug({
            requestId,
            operation: 'chatSend',
            userId: authReq.user!.id,
            chatId
          }, 'Logging user action to audit service');
          
          await auditService.logUserAction(
            authReq.user!.id,
            'chat_send',
            {
              chatId,
              messageCount: messages.length,
              hasImage,
              success: true
            }
          );

          const totalProcessingTime = Date.now() - startTime;
          logger.info({ 
            requestId,
            userId: authReq.user!.id, 
            chatId,
            messageCount: messages.length,
            hasImage,
            processingTimeMs: totalProcessingTime,
            operation: 'chatSend' 
          }, 'Chat message processed successfully');

          res.json(result);
        } else {
          logger.error({ 
            requestId,
            userId: authReq.user!.id, 
            chatId,
            error: result.error,
            processingTimeMs: Date.now() - startTime,
            operation: 'chatSend' 
          }, 'Chat message processing failed');

          res.status(400).json(result);
        }

      } catch (error: any) {
        const totalProcessingTime = Date.now() - startTime;
        logger.error({ 
          requestId,
          err: error, 
          userId: authReq.user!.id, 
          chatId,
          messageCount: messages?.length,
          hasImage,
          processingTimeMs: totalProcessingTime,
          operation: 'chatSend' 
        }, 'Chat send error occurred');

        await auditService.logUserAction(
          authReq.user!.id,
          'chat_send',
          {
            chatId,
            messageCount: messages.length,
            hasImage,
            success: false,
            errorMessage: error.message
          }
        );

        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to process chat message'
        });
      }
    }
  );

  // POST /chat/tts - Text-to-Speech
  r.post('/tts',
    authenticateToken,
    authRateLimits.general,
    validate(chatSchemas.textToSpeech),
    async (req: Request, res: Response) => {
      const authReq = req as AuthRequest;
      const { messages } = req.body;

      try {
        logger.info({ 
          userId: authReq.user!.id, 
          messageCount: messages.length,
          operation: 'chatTTS' 
        }, 'TTS request received');

        const result = await ChatService.textToSpeech(messages);

        if (result.success) {
          await auditService.logUserAction(
            authReq.user!.id,
            'chat_tts',
            {
              messageCount: messages.length,
              success: true
            }
          );

          logger.info({ 
            userId: authReq.user!.id,
            operation: 'chatTTS' 
          }, 'TTS conversion completed successfully');

          res.json(result);
        } else {
          logger.error({ 
            userId: authReq.user!.id,
            error: result.error,
            operation: 'chatTTS' 
          }, 'TTS conversion failed');

          res.status(400).json(result);
        }

      } catch (error: any) {
        logger.error({ 
          err: error, 
          userId: authReq.user!.id,
          operation: 'chatTTS' 
        }, 'TTS error');

        await auditService.logUserAction(
          authReq.user!.id,
          'chat_tts',
          {
            messageCount: messages.length,
            success: false,
            errorMessage: error.message
          }
        );

        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to convert text to speech'
        });
      }
    }
  );

  // GET /chat/messages/:chatId - Chat mesajlarını getir
  r.get('/messages/:chatId',
    authenticateToken,
    authRateLimits.general,
    async (req: Request, res: Response) => {
      const authReq = req as AuthRequest;
      const { chatId } = req.params;

      try {
        logger.info({ 
          userId: authReq.user!.id, 
          chatId,
          operation: 'getChatMessages' 
        }, 'Get chat messages request received');

        // Firestore'dan mesajları getir
        const { db } = require('../firebase');
        
        const messagesRef = db.collection('users').doc(authReq.user!.id).collection('chats').doc(chatId).collection('messages');
        const snapshot = await messagesRef.orderBy('timestamp', 'asc').get();
        
        const messages = snapshot.docs.map((doc: any) => ({
          id: doc.id,
          ...doc.data()
        }));

        logger.info({ 
          userId: authReq.user!.id, 
          chatId,
          messageCount: messages.length,
          operation: 'getChatMessages' 
        }, 'Chat messages retrieved successfully');

        res.json({
          success: true,
          data: { messages },
          message: 'Messages retrieved successfully'
        });

      } catch (error: any) {
        logger.error({ 
          err: error, 
          userId: authReq.user!.id, 
          chatId,
          operation: 'getChatMessages' 
        }, 'Get chat messages error');

        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to retrieve chat messages'
        });
      }
    }
  );

  // POST /chat/create - Yeni chat oluştur
  r.post('/create',
    authenticateToken,
    authRateLimits.general,
    async (req: Request, res: Response) => {
      const authReq = req as AuthRequest;
      const { title } = req.body;

      try {
        logger.info({ 
          userId: authReq.user!.id, 
          title,
          operation: 'createChat' 
        }, 'Create chat request received');

        // Yeni chat ID oluştur
        const chatId = require('crypto').randomUUID();
        
        // Firestore'da chat oluştur
        const { db } = require('../firebase');
        const { setDoc, doc, serverTimestamp } = require('firebase/firestore');
        
        const chatRef = doc(db, 'users', authReq.user!.id, 'chats', chatId);
        await setDoc(chatRef, {
          id: chatId,
          title: title || 'Yeni Chat',
          createdAt: serverTimestamp(),
          lastMessage: '',
          userId: authReq.user!.id
        });

        await auditService.logUserAction(
          authReq.user!.id,
          'chat_create',
          {
            chatId,
            title: title || 'Yeni Chat',
            success: true
          }
        );

        logger.info({ 
          userId: authReq.user!.id, 
          chatId,
          operation: 'createChat' 
        }, 'Chat created successfully');

        res.json({
          success: true,
          data: { chatId },
          message: 'Chat created successfully'
        });

      } catch (error: any) {
        logger.error({ 
          err: error, 
          userId: authReq.user!.id,
          operation: 'createChat' 
        }, 'Create chat error');

        await auditService.logUserAction(
          authReq.user!.id,
          'chat_create',
          {
            success: false,
            errorMessage: error.message
          }
        );

        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to create chat'
        });
      }
    }
  );

  return r;
}
