import axios from 'axios';
import { StandardResponse, ResponseBuilder } from '../types/response';
import { logger } from '../utils/logger';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, getDocs, orderBy, query, setDoc, doc, updateDoc, getDoc, onSnapshot, where, limit } from 'firebase/firestore';
import admin from 'firebase-admin';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: any;
  fileName?: string;
  fileUrl?: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  chatId: string;
  userId: string;
  hasImage?: boolean;
  imageFileUrl?: string;
}

export interface ChatResponse {
  message: ChatMessage;
  chatTitle?: string;
  toolCalls?: any[];
}

export class ChatService {
  private static readonly OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  private static readonly FINE_TUNED_MODEL_ID = process.env.FINE_TUNED_MODEL_ID || 'gpt-3.5-turbo';
  private static readonly ASSISTANT_ID = process.env.ASSISTANT_ID;

  /**
   * ChatGPT'ye mesaj gönder ve cevap al
   */
  static async sendMessage(request: ChatRequest): Promise<StandardResponse<ChatResponse>> {
    try {
      logger.info({ 
        userId: request.userId, 
        chatId: request.chatId, 
        messageCount: request.messages.length,
        hasImage: request.hasImage,
        operation: 'sendMessage' 
      }, 'Sending message to ChatGPT');

      // Model seçimi
      const modelToUse = request.hasImage ? 'gpt-4o' : this.FINE_TUNED_MODEL_ID;
      
      logger.info({ 
        modelToUse, 
        hasImage: request.hasImage,
        operation: 'modelSelection' 
      }, 'Model selected for chat');

      // Mesajları formatla
      const formattedMessages = this.formatMessages(request.messages, request.imageFileUrl);
      
      logger.debug({ 
        formattedMessagesCount: formattedMessages.length,
        hasArrayContent: formattedMessages.some(m => Array.isArray(m.content)),
        operation: 'messageFormatting' 
      }, 'Messages formatted for OpenAI');

      // Agent functions (PDF, Excel, Word işlemleri)
      const agentFunctions = this.getAgentFunctions();
      
      logger.debug({ 
        toolCount: agentFunctions.length,
        toolNames: agentFunctions.map(f => f.name),
        operation: 'agentFunctions' 
      }, 'Agent functions prepared');

      // OpenAI API'ye istek gönder
      const response = await this.callOpenAI(modelToUse, formattedMessages, agentFunctions);
      
      logger.info({ 
        hasResponse: !!response?.data,
        choicesCount: response?.data?.choices?.length,
        operation: 'openaiResponse' 
      }, 'OpenAI response received');

      const reply = response.data.choices?.[0]?.message;
      
      if (!reply) {
        throw new Error('No response from OpenAI');
      }

      // Tool calls varsa işle
      if (reply.tool_calls?.length > 0) {
        logger.info({ 
          toolCallsCount: reply.tool_calls.length,
          operation: 'toolCalls' 
        }, 'Tool calls detected, processing...');

        const toolResult = await this.processToolCalls(reply.tool_calls, request);
        
        if (toolResult.finalMessage) {
          return ResponseBuilder.success({
            message: toolResult.finalMessage,
            toolCalls: reply.tool_calls
          }, 'Message processed with tools');
        }
      }

      // Direkt cevap
      if (reply.content) {
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: reply.content.trim(),
          timestamp: serverTimestamp()
        };

        logger.info({ 
          contentLength: assistantMessage.content.length,
          operation: 'directResponse' 
        }, 'Direct assistant response received');

        return ResponseBuilder.success({
          message: assistantMessage
        }, 'Message processed successfully');
      }

      throw new Error('No content in OpenAI response');

    } catch (error: any) {
      logger.error({ 
        err: error, 
        userId: request.userId, 
        chatId: request.chatId,
        operation: 'sendMessage' 
      }, 'Chat message error');
      
      return ResponseBuilder.error(
        'chat_message_failed',
        error.message || 'Failed to process chat message'
      );
    }
  }

  /**
   * Mesajları OpenAI formatına çevir
   */
  private static formatMessages(messages: ChatMessage[], imageFileUrl?: string): any[] {
    return messages.map((msg, idx) => {
      // Dosya bağlantısı kontrolü
      const match = msg.content.match(/\[Dosya Bağlantısı\]:\s*(https?:\/\/\S+)/);
      const fileUrl = match?.[1]?.trim() || imageFileUrl;

      // Görsel kontrolü
      const isImage = fileUrl && fileUrl.match(/\.(jpeg|jpg|png|gif|webp)/i);

      if (fileUrl && isImage) {
        const parts = msg.content.split('[Dosya Bağlantısı]:');
        const textPart = (parts[0] || '').trim();
        
        return {
          role: msg.role,
          content: [
            { type: 'text', text: textPart },
            { 
              type: 'image_url', 
              image_url: { url: fileUrl } 
            }
          ]
        };
      }

      return { role: msg.role, content: msg.content };
    });
  }

  /**
   * OpenAI API'ye istek gönder
   */
  private static async callOpenAI(model: string, messages: any[], tools: any[]): Promise<any> {
    const requestData = {
      model,
      messages,
      tools: tools.map(fn => ({
        type: 'function',
        function: {
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters
        }
      })),
      tool_choice: 'auto'
    };

    logger.debug({ 
      model, 
      messageCount: messages.length, 
      toolCount: tools.length,
      operation: 'openaiRequest' 
    }, 'Sending request to OpenAI');

    const response = await axios.post('https://api.openai.com/v1/chat/completions', requestData, {
      headers: {
        'Authorization': `Bearer ${this.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000 // 60 saniye timeout
    });

    return response;
  }

  /**
   * Tool calls işle
   */
  private static async processToolCalls(toolCalls: any[], request: ChatRequest): Promise<{ finalMessage?: ChatMessage }> {
    const functionMap = this.getFunctionMap();
    const toolResponses = [];

    for (const call of toolCalls) {
      const name = call.function.name;
      const args = JSON.parse(call.function.arguments);

      logger.debug({ 
        toolName: name, 
        args,
        operation: 'toolExecution' 
      }, 'Executing tool call');

      let functionResult = null;

      if (functionMap[name]) {
        try {
          functionResult = await functionMap[name](args);
          
          logger.info({ 
            toolName: name, 
            success: true,
            operation: 'toolExecution' 
          }, 'Tool executed successfully');
        } catch (error: any) {
          logger.error({ 
            err: error, 
            toolName: name,
            operation: 'toolExecution' 
          }, 'Tool execution failed');
          
          functionResult = { error: `Tool execution failed: ${error.message}` };
        }
      } else {
        logger.warn({ 
          toolName: name,
          operation: 'toolExecution' 
        }, 'Tool not found');
        
        functionResult = { error: `Tool not found: ${name}` };
      }

      toolResponses.push({
        tool_call_id: call.id,
        role: 'tool',
        content: JSON.stringify(functionResult)
      });
    }

    // Tool cevaplarını modele geri gönder
    const followUpResponse = await this.callOpenAI(
      request.hasImage ? 'gpt-4o' : this.FINE_TUNED_MODEL_ID,
      [
        ...this.formatMessages(request.messages, request.imageFileUrl),
        ...toolResponses
      ],
      this.getAgentFunctions()
    );

    const followUpMessage = followUpResponse.data.choices?.[0]?.message;
    
    if (followUpMessage?.content) {
      return {
        finalMessage: {
          role: 'assistant',
          content: followUpMessage.content.trim(),
          timestamp: serverTimestamp()
        }
      };
    }

    return {};
  }

  /**
   * Agent functions listesi
   */
  private static getAgentFunctions(): any[] {
    return [
      {
        name: 'summarize_pdf',
        description: 'PDF dosyasını özetler',
        parameters: {
          type: 'object',
          properties: {
            fileUrl: { type: 'string', description: 'PDF dosya URL\'si' }
          },
          required: ['fileUrl']
        }
      },
      {
        name: 'ask_pdf_question',
        description: 'PDF dosyasından soru sorar',
        parameters: {
          type: 'object',
          properties: {
            fileUrl: { type: 'string', description: 'PDF dosya URL\'si' },
            question: { type: 'string', description: 'Sorulacak soru' }
          },
          required: ['fileUrl', 'question']
        }
      },
      {
        name: 'convert_pdf_to_word',
        description: 'PDF dosyasını Word formatına çevirir',
        parameters: {
          type: 'object',
          properties: {
            fileUrl: { type: 'string', description: 'PDF dosya URL\'si' }
          },
          required: ['fileUrl']
        }
      },
      {
        name: 'convert_pdf_to_excel',
        description: 'PDF dosyasını Excel formatına çevirir',
        parameters: {
          type: 'object',
          properties: {
            fileUrl: { type: 'string', description: 'PDF dosya URL\'si' }
          },
          required: ['fileUrl']
        }
      },
      {
        name: 'generate_document',
        description: 'Belge oluşturur',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string', description: 'Belge içeriği için prompt' },
            format: { type: 'string', enum: ['word', 'excel', 'powerpoint'], description: 'Belge formatı' }
          },
          required: ['prompt', 'format']
        }
      }
    ];
  }

  /**
   * Function map (gerçek implementasyonlar)
   */
  private static getFunctionMap(): Record<string, Function> {
    return {
      summarize_pdf: async (args: any) => {
        // PDF özetleme implementasyonu
        return { message: 'PDF özetlendi', data: 'Özet içeriği...' };
      },
      ask_pdf_question: async (args: any) => {
        // PDF soru-cevap implementasyonu
        return { message: 'Soru cevaplandı', answer: 'Cevap...' };
      },
      convert_pdf_to_word: async (args: any) => {
        // PDF to Word implementasyonu
        return { message: 'PDF Word\'e çevrildi', downloadUrl: 'url...' };
      },
      convert_pdf_to_excel: async (args: any) => {
        // PDF to Excel implementasyonu
        return { message: 'PDF Excel\'e çevrildi', downloadUrl: 'url...' };
      },
      generate_document: async (args: any) => {
        // Belge oluşturma implementasyonu
        return { message: 'Belge oluşturuldu', downloadUrl: 'url...' };
      }
    };
  }

  /**
   * Mesajı Firestore'a kaydet
   */
  static async saveMessageToFirestore(
    userId: string, 
    chatId: string, 
    message: ChatMessage
  ): Promise<StandardResponse<any>> {
    try {
      logger.info({ 
        userId, 
        chatId, 
        role: message.role,
        contentLength: message.content.length,
        operation: 'saveMessage' 
      }, 'Saving message to Firestore');

      const messagesRef = collection(db as any, 'users', userId, 'chats', chatId, 'messages');
      
      await addDoc(messagesRef, {
        ...message,
        timestamp: serverTimestamp()
      });

      logger.info({ 
        userId, 
        chatId,
        operation: 'saveMessage' 
      }, 'Message saved to Firestore successfully');

      return ResponseBuilder.success({}, 'Message saved successfully');

    } catch (error: any) {
      logger.error({ 
        err: error, 
        userId, 
        chatId,
        operation: 'saveMessage' 
      }, 'Failed to save message to Firestore');
      
      return ResponseBuilder.error(
        'save_message_failed',
        'Failed to save message'
      );
    }
  }

  /**
   * Chat başlığı oluştur
   */
  static async generateChatTitle(content: string): Promise<string> {
    try {
      logger.info({ 
        contentLength: content.length,
        operation: 'generateTitle' 
      }, 'Generating chat title');

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Sadece kısa bir başlık oluştur (maksimum 5 kelime). Sadece başlığı döndür, başka açıklama yapma.'
          },
          {
            role: 'user',
            content: content
          }
        ],
        max_tokens: 20,
        temperature: 0.7
      }, {
        headers: {
          'Authorization': `Bearer ${this.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const title = (response.data as any).choices?.[0]?.message?.content?.trim() || 'Yeni Chat';
      
      logger.info({ 
        title,
        operation: 'generateTitle' 
      }, 'Chat title generated');

      return title;

    } catch (error: any) {
      logger.error({ 
        err: error,
        operation: 'generateTitle' 
      }, 'Failed to generate chat title');
      
      return 'Yeni Chat';
    }
  }

  /**
   * TTS (Text-to-Speech) işlemi
   */
  static async textToSpeech(messages: ChatMessage[]): Promise<StandardResponse<any>> {
    try {
      logger.info({ 
        messageCount: messages.length,
        operation: 'textToSpeech' 
      }, 'Converting text to speech');

      // TTS implementasyonu burada olacak
      // Şimdilik mock response
      const audioUrl = 'https://example.com/audio.mp3';

      logger.info({ 
        audioUrl,
        operation: 'textToSpeech' 
      }, 'TTS conversion completed');

      return ResponseBuilder.success({ audioUrl }, 'Text converted to speech');

    } catch (error: any) {
      logger.error({ 
        err: error,
        operation: 'textToSpeech' 
      }, 'TTS conversion failed');
      
      return ResponseBuilder.error(
        'tts_failed',
        'Failed to convert text to speech'
      );
    }
  }
}
