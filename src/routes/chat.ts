import { Router, Request, Response } from 'express';
import { ChatService, ChatRequest } from '../services/chatService';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import { validate, chatSchemas } from '../middleware/validationMiddleware';
import { authRateLimits } from '../middleware/rateLimitMiddleware';
import { auditService } from '../services/auditService';
import { logger } from '../utils/logger';

export function createChatRouter(): Router {
  const r = Router();

  // POST /chat/send - ChatGPT'ye mesaj gönder
  r.post('/send',
    authenticateToken,
    authRateLimits.general,
    validate(chatSchemas.sendMessage),
    async (req: Request, res: Response) => {
      const authReq = req as AuthRequest;
      const { messages, chatId, hasImage, imageFileUrl } = req.body;

      try {
        logger.info({ 
          userId: authReq.user!.id, 
          chatId, 
          messageCount: messages.length,
          hasImage,
          operation: 'chatSend' 
        }, 'Chat send request received');

        const chatRequest: ChatRequest = {
          messages,
          chatId,
          userId: authReq.user!.id,
          hasImage,
          imageFileUrl
        };

        const result = await ChatService.sendMessage(chatRequest);

        if (result.success && result.data) {
          // Mesajı Firestore'a kaydet
          await ChatService.saveMessageToFirestore(
            authReq.user!.id,
            chatId,
            result.data.message
          );

          // Chat başlığı oluştur (sadece ilk assistant mesajında)
          if (result.data.message.role === 'assistant') {
            const title = await ChatService.generateChatTitle(result.data.message.content);
            // Chat başlığını güncelle (burada implement edilecek)
          }

          // Audit log
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

          logger.info({ 
            userId: authReq.user!.id, 
            chatId,
            operation: 'chatSend' 
          }, 'Chat message processed successfully');

          res.json(result);
        } else {
          logger.error({ 
            userId: authReq.user!.id, 
            chatId,
            error: result.error,
            operation: 'chatSend' 
          }, 'Chat message processing failed');

          res.status(400).json(result);
        }

      } catch (error: any) {
        logger.error({ 
          err: error, 
          userId: authReq.user!.id, 
          chatId,
          operation: 'chatSend' 
        }, 'Chat send error');

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
        const { collection, getDocs, query, orderBy, where } = require('firebase/firestore');
        
        const messagesRef = collection(db, 'users', authReq.user!.id, 'chats', chatId, 'messages');
        const q = query(messagesRef, orderBy('timestamp', 'asc'));
        const snapshot = await getDocs(q);
        
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
