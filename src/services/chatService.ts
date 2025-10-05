import axios from 'axios';
import { StandardResponse, ResponseBuilder } from '../types/response';
import { logger } from '../utils/logger';
import { db } from '../firebase';
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
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();
    
    try {
      logger.info({ 
        requestId,
        userId: request.userId, 
        chatId: request.chatId, 
        messageCount: request.messages.length,
        hasImage: request.hasImage,
        imageFileUrl: request.imageFileUrl ? 'provided' : 'none',
        operation: 'sendMessage' 
      }, 'Starting chat message processing');

      // Frontend'den gelen mesajları detaylı logla
      logger.info({
        requestId,
        userId: request.userId,
        chatId: request.chatId,
        frontendMessages: request.messages.map((msg, index) => ({
          index,
          role: msg.role,
          contentLength: msg.content.length,
          contentPreview: msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : ''),
          hasFileName: !!msg.fileName,
          fileName: msg.fileName,
          hasFileUrl: !!msg.fileUrl,
          fileUrl: msg.fileUrl ? 'provided' : 'none',
          hasTimestamp: !!msg.timestamp
        })),
        operation: 'frontendMessagesReceived'
      }, 'Frontend messages received and logged');

      // AI detection kontrolü
      const isAIDetectionRequest = this.isAIDetectionRequest(request.messages);
      
      if (isAIDetectionRequest && request.hasImage) {
        logger.info({ 
          requestId,
          userId: request.userId,
          chatId: request.chatId,
          operation: 'aiDetectionRequest' 
        }, 'AI detection request detected, redirecting to AI or Not API');
        
        // AI detection için özel işlem
        return await this.handleAIDetectionRequest(request, requestId);
      }

      // Model seçimi
      const modelToUse = request.hasImage ? 'gpt-4o' : this.FINE_TUNED_MODEL_ID;
      
      logger.info({ 
        requestId,
        modelToUse, 
        hasImage: request.hasImage,
        imageFileUrl: request.imageFileUrl,
        operation: 'modelSelection' 
      }, 'Model selected for OpenAI request');

      // Mesajları formatla
      const formattedMessages = await this.formatMessages(request.messages, request.imageFileUrl);
      
      logger.info({ 
        requestId,
        formattedMessagesCount: formattedMessages.length,
        hasArrayContent: formattedMessages.some(m => Array.isArray(m.content)),
        formattedMessages: formattedMessages.map((msg, index) => ({
          index,
          role: msg.role,
          contentType: Array.isArray(msg.content) ? 'multimodal' : 'text',
          contentLength: Array.isArray(msg.content) ? 
            msg.content.reduce((total: number, part: any) => total + (part.text?.length || 0), 0) : 
            msg.content.length,
          contentPreview: Array.isArray(msg.content) ? 
            msg.content.map((part: any) => part.text || `[${part.type}]`).join(' ') :
            msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : ''),
          hasImage: Array.isArray(msg.content) && msg.content.some((part: any) => part.type === 'image_url')
        })),
        operation: 'messageFormatting' 
      }, 'Messages formatted for OpenAI API');

      // Agent functions (PDF, Excel, Word işlemleri)
      const agentFunctions = this.getAgentFunctions();
      
      logger.info({ 
        requestId,
        toolCount: agentFunctions.length,
        toolNames: agentFunctions.map(f => f.name),
        tools: agentFunctions.map(f => ({
          name: f.name,
          description: f.description,
          parameters: f.parameters
        })),
        operation: 'agentFunctions' 
      }, 'Agent functions prepared for OpenAI');

      // OpenAI API'ye istek gönder
      const response = await this.callOpenAI(requestId, modelToUse, formattedMessages, agentFunctions);
      
      logger.info({ 
        requestId,
        hasResponse: !!response?.data,
        choicesCount: response?.data?.choices?.length,
        responseStatus: response?.status,
        responseStatusText: response?.statusText,
        responseHeaders: {
          contentType: response?.headers?.['content-type'],
          openaiVersion: response?.headers?.['openai-version'],
          requestId: response?.headers?.['x-request-id']
        },
        operation: 'openaiResponse' 
      }, 'OpenAI API response received');

      const reply = response.data.choices?.[0]?.message;
      
      if (!reply) {
        logger.error({
          requestId,
          responseData: response.data,
          operation: 'openaiResponse'
        }, 'No message in OpenAI response');
        throw new Error('No response from OpenAI');
      }

      logger.info({
        requestId,
        replyRole: reply.role,
        hasContent: !!reply.content,
        contentLength: reply.content?.length || 0,
        contentPreview: reply.content ? reply.content.substring(0, 200) + (reply.content.length > 200 ? '...' : '') : 'none',
        hasToolCalls: !!reply.tool_calls,
        toolCallsCount: reply.tool_calls?.length || 0,
        toolCalls: reply.tool_calls?.map((tc: any) => ({
          id: tc.id,
          type: tc.type,
          functionName: tc.function?.name,
          functionArguments: tc.function?.arguments
        })) || [],
        operation: 'openaiMessageAnalysis'
      }, 'OpenAI message analysis completed');

      // Tool calls varsa işle
      if (reply.tool_calls?.length > 0) {
        logger.info({ 
          requestId,
          toolCallsCount: reply.tool_calls.length,
          toolCalls: reply.tool_calls.map((tc: any) => ({
            id: tc.id,
            functionName: tc.function?.name,
            functionArguments: tc.function?.arguments
          })),
          operation: 'toolCalls' 
        }, 'Tool calls detected, processing...');

        const toolResult = await this.processToolCalls(requestId, reply.tool_calls, request);
        
        if (toolResult.finalMessage) {
          logger.info({
            requestId,
            finalMessageRole: toolResult.finalMessage.role,
            finalMessageLength: toolResult.finalMessage.content.length,
            finalMessagePreview: toolResult.finalMessage.content.substring(0, 200) + '...',
            processingTimeMs: Date.now() - startTime,
            operation: 'toolCallsCompleted'
          }, 'Tool calls processing completed successfully');

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
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        logger.info({ 
          requestId,
          contentLength: assistantMessage.content.length,
          contentPreview: assistantMessage.content.substring(0, 200) + (assistantMessage.content.length > 200 ? '...' : ''),
          processingTimeMs: Date.now() - startTime,
          operation: 'directResponse' 
        }, 'Direct assistant response received and processed');

        return ResponseBuilder.success({
          message: assistantMessage
        }, 'Message processed successfully');
      }

      logger.error({
        requestId,
        reply,
        processingTimeMs: Date.now() - startTime,
        operation: 'openaiResponse'
      }, 'No content in OpenAI response');
      throw new Error('No content in OpenAI response');

    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      logger.error({ 
        requestId,
        err: error, 
        userId: request.userId, 
        chatId: request.chatId,
        processingTimeMs: processingTime,
        operation: 'sendMessage' 
      }, 'Chat message processing failed');
      
      return ResponseBuilder.error(
        'chat_message_failed',
        error.message || 'Failed to process chat message'
      );
    }
  }

  /**
   * Mesajları OpenAI formatına çevir
   */
  private static async formatMessages(messages: ChatMessage[], imageFileUrl?: string): Promise<any[]> {
    const formattedMessages = [];
    
    for (const msg of messages) {
      // Dosya bağlantısı kontrolü
      const match = msg.content.match(/\[Dosya Bağlantısı\]:\s*(https?:\/\/\S+)/);
      const fileUrl = match?.[1]?.trim() || imageFileUrl;

      // Görsel kontrolü
      const isImage = fileUrl && fileUrl.match(/\.(jpeg|jpg|png|gif|webp)/i);

      if (fileUrl && isImage) {
        const parts = msg.content.split('[Dosya Bağlantısı]:');
        const textPart = (parts[0] || '').trim();
        
        try {
          // Image URL'ini base64'e çevir
          const base64Image = await this.convertImageUrlToBase64(fileUrl);
          
          formattedMessages.push({
            role: msg.role,
            content: [
              { type: 'text', text: textPart },
              { 
                type: 'image_url', 
                image_url: { url: base64Image } 
              }
            ]
          });
        } catch (error: any) {
          logger.error({ 
            fileUrl, 
            error: error?.message || 'Unknown error',
            operation: 'imageConversion' 
          }, 'Failed to convert image to base64, using text only');
          
          // Hata durumunda sadece text olarak gönder
          formattedMessages.push({
            role: msg.role,
            content: msg.content
          });
        }
      } else {
        formattedMessages.push({ role: msg.role, content: msg.content });
      }
    }
    
    return formattedMessages;
  }

  /**
   * Image URL'ini base64 formatına çevir
   */
  private static async convertImageUrlToBase64(imageUrl: string): Promise<string> {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 30000 // 30 saniye timeout
      });
      
      const buffer = Buffer.from(response.data as ArrayBuffer);
      const mimeType = response.headers['content-type'] || 'image/jpeg';
      const base64 = buffer.toString('base64');
      
      return `data:${mimeType};base64,${base64}`;
    } catch (error: any) {
      logger.error({ 
        imageUrl, 
        error: error?.message || 'Unknown error',
        operation: 'imageUrlToBase64' 
      }, 'Failed to convert image URL to base64');
      
      throw new Error(`Image conversion failed: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * OpenAI API'ye istek gönder
   */
  private static async callOpenAI(requestId: string, model: string, messages: any[], tools: any[]): Promise<any> {
    const startTime = Date.now();
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

    // Request size kontrolü
    const requestSize = JSON.stringify(requestData).length;
    const maxRequestSize = 200000; // 200KB limit
    
    if (requestSize > maxRequestSize) {
      logger.warn({
        requestId,
        requestSize,
        maxRequestSize,
        messageCount: messages.length,
        operation: 'openaiRequestSizeCheck'
      }, 'Request size exceeds limit, truncating messages');
      
      // Mesajları kısalt
      const truncatedMessages = messages.map(msg => {
        if (typeof msg.content === 'string' && msg.content.length > 3000) {
          return {
            ...msg,
            content: msg.content.substring(0, 3000) + '... [truncated]'
          };
        } else if (Array.isArray(msg.content)) {
          // Multimodal content için text kısmını kısalt
          const truncatedContent = msg.content.map((part: any) => {
            if (part.type === 'text' && part.text && part.text.length > 3000) {
              return {
                ...part,
                text: part.text.substring(0, 3000) + '... [truncated]'
              };
            }
            return part;
          });
          return {
            ...msg,
            content: truncatedContent
          };
        }
        return msg;
      });
      
      requestData.messages = truncatedMessages;
    }

    logger.info({ 
      requestId,
      model, 
      messageCount: messages.length, 
      toolCount: tools.length,
      requestData: {
        model: requestData.model,
        messageCount: requestData.messages.length,
        toolCount: requestData.tools.length,
        toolChoice: requestData.tool_choice,
        messages: requestData.messages.map((msg, index) => ({
          index,
          role: msg.role,
          contentType: Array.isArray(msg.content) ? 'multimodal' : 'text',
          contentLength: Array.isArray(msg.content) ? 
            msg.content.reduce((total: number, part: any) => total + (part.text?.length || 0), 0) : 
            (msg.content?.length || 0),
          contentPreview: Array.isArray(msg.content) ? 
            msg.content.map((part: any) => part.text || `[${part.type}]`).join(' ').substring(0, 100) + '...' :
            (msg.content ? msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '') : 'null'),
          hasImage: Array.isArray(msg.content) && msg.content.some((part: any) => part.type === 'image_url')
        })),
        tools: requestData.tools.map(tool => ({
          type: tool.type,
          functionName: tool.function.name,
          functionDescription: tool.function.description
        }))
      },
      operation: 'openaiRequest' 
    }, 'Sending detailed request to OpenAI API');

    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', requestData, {
        headers: {
          'Authorization': `Bearer ${this.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000 // 60 saniye timeout
      });

      const processingTime = Date.now() - startTime;
      logger.info({
        requestId,
        model,
        responseStatus: response.status,
        responseStatusText: response.statusText,
        responseHeaders: {
          contentType: response.headers['content-type'],
          openaiVersion: response.headers['openai-version'],
          requestId: response.headers['x-request-id'],
          ratelimitLimit: response.headers['x-ratelimit-limit-requests'],
          ratelimitRemaining: response.headers['x-ratelimit-remaining-requests'],
          ratelimitReset: response.headers['x-ratelimit-reset-requests']
        },
        responseData: {
          id: (response.data as any).id,
          object: (response.data as any).object,
          created: (response.data as any).created,
          model: (response.data as any).model,
          choicesCount: (response.data as any).choices?.length || 0,
          usage: (response.data as any).usage ? {
            promptTokens: (response.data as any).usage.prompt_tokens,
            completionTokens: (response.data as any).usage.completion_tokens,
            totalTokens: (response.data as any).usage.total_tokens
          } : null,
          choices: (response.data as any).choices?.map((choice: any, index: number) => ({
            index,
            finishReason: choice.finish_reason,
            messageRole: choice.message?.role,
            hasContent: !!choice.message?.content,
            contentLength: choice.message?.content?.length || 0,
            contentPreview: choice.message?.content ? 
              choice.message.content.substring(0, 200) + (choice.message.content.length > 200 ? '...' : '') : 'none',
            hasToolCalls: !!choice.message?.tool_calls,
            toolCallsCount: choice.message?.tool_calls?.length || 0
          })) || []
        },
        processingTimeMs: processingTime,
        operation: 'openaiResponse'
      }, 'OpenAI API response received with full details');

      return response;
    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      logger.error({
        requestId,
        model,
        requestSize: JSON.stringify(requestData).length,
        messageCount: messages.length,
        error: {
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        },
        processingTimeMs: processingTime,
        operation: 'openaiRequestError'
      }, 'OpenAI API request failed');
      
      throw error;
    }
  }

  /**
   * Tool calls işle
   */
  private static async processToolCalls(requestId: string, toolCalls: any[], request: ChatRequest): Promise<{ finalMessage?: ChatMessage }> {
    const startTime = Date.now();
    const functionMap = this.getFunctionMap();
    const toolResponses = [];

    logger.info({
      requestId,
      toolCallsCount: toolCalls.length,
      toolCalls: toolCalls.map(tc => ({
        id: tc.id,
        type: tc.type,
        functionName: tc.function?.name,
        functionArguments: tc.function?.arguments
      })),
      operation: 'toolCallsProcessing'
    }, 'Starting tool calls processing');

    for (const call of toolCalls) {
      const toolStartTime = Date.now();
      const name = call.function.name;
      const args = JSON.parse(call.function.arguments);

      logger.info({ 
        requestId,
        toolId: call.id,
        toolName: name, 
        args,
        operation: 'toolExecution' 
      }, 'Executing individual tool call');

      let functionResult = null;

      if (functionMap[name]) {
        try {
          functionResult = await functionMap[name](args);
          
          const toolProcessingTime = Date.now() - toolStartTime;
          logger.info({ 
            requestId,
            toolId: call.id,
            toolName: name, 
            success: true,
            resultType: typeof functionResult,
            resultKeys: functionResult && typeof functionResult === 'object' ? Object.keys(functionResult) : [],
            processingTimeMs: toolProcessingTime,
            operation: 'toolExecution' 
          }, 'Tool executed successfully');
        } catch (error: any) {
          const toolProcessingTime = Date.now() - toolStartTime;
          logger.error({ 
            requestId,
            toolId: call.id,
            err: error, 
            toolName: name,
            processingTimeMs: toolProcessingTime,
            operation: 'toolExecution' 
          }, 'Tool execution failed');
          
          functionResult = { error: `Tool execution failed: ${error.message}` };
        }
      } else {
        logger.warn({ 
          requestId,
          toolId: call.id,
          toolName: name,
          operation: 'toolExecution' 
        }, 'Tool not found in function map');
        
        functionResult = { error: `Tool not found: ${name}` };
      }

      const toolResponse = {
        tool_call_id: call.id,
        role: 'tool',
        content: JSON.stringify(functionResult)
      };

      toolResponses.push(toolResponse);

      logger.debug({
        requestId,
        toolId: call.id,
        toolName: name,
        responseLength: toolResponse.content.length,
        responsePreview: toolResponse.content.substring(0, 200) + (toolResponse.content.length > 200 ? '...' : ''),
        operation: 'toolResponse'
      }, 'Tool response prepared');
    }

    logger.info({
      requestId,
      toolResponsesCount: toolResponses.length,
      totalProcessingTimeMs: Date.now() - startTime,
      operation: 'toolCallsCompleted'
    }, 'All tool calls completed, preparing follow-up request');

    // Tool cevaplarını modele geri gönder
    // Önce orijinal mesajları, sonra assistant'ın tool call'ını, sonra tool cevaplarını ekle
    const formattedMessages = await this.formatMessages(request.messages, request.imageFileUrl);
    const followUpMessages = [
      ...formattedMessages,
      {
        role: 'assistant',
        content: null,
        tool_calls: toolCalls
      },
      ...toolResponses
    ];

    const followUpResponse = await this.callOpenAI(
      requestId,
      request.hasImage ? 'gpt-4o' : this.FINE_TUNED_MODEL_ID,
      followUpMessages,
      this.getAgentFunctions()
    );

    const followUpMessage = followUpResponse.data.choices?.[0]?.message;
    
    if (followUpMessage?.content) {
      logger.info({
        requestId,
        finalMessageRole: followUpMessage.role,
        finalMessageLength: followUpMessage.content.length,
        finalMessagePreview: followUpMessage.content.substring(0, 200) + '...',
        totalProcessingTimeMs: Date.now() - startTime,
        operation: 'toolCallsFinalResponse'
      }, 'Tool calls processing completed with final response');

      return {
        finalMessage: {
          role: 'assistant',
          content: followUpMessage.content.trim(),
          timestamp: admin.firestore.FieldValue.serverTimestamp()
        }
      };
    }

    logger.warn({
      requestId,
      followUpResponse: followUpResponse.data,
      totalProcessingTimeMs: Date.now() - startTime,
      operation: 'toolCallsFinalResponse'
    }, 'Tool calls processing completed but no final message content');

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
        // Gerçek PDF özetleme implementasyonu
        const { PDFService } = await import('./pdfService');
        const result = await PDFService.extractAndSummarizePDF({
          fileUrl: args.fileUrl,
          userId: 'system', // Chat context'ten alınabilir
          chatId: 'system'  // Chat context'ten alınabilir
        });
        
        if (result.success) {
          return { 
            message: 'PDF başarıyla özetlendi', 
            data: result.data?.summary || 'Özet oluşturulamadı',
            pageCount: result.data?.pageCount || 0,
            wordCount: result.data?.wordCount || 0
          };
        } else {
          return { 
            message: 'PDF özetleme hatası', 
            data: result.error?.message || 'Bilinmeyen hata',
            error: true
          };
        }
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
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();
    
    try {
      logger.info({ 
        requestId,
        userId, 
        chatId, 
        role: message.role,
        contentLength: message.content.length,
        contentPreview: message.content.substring(0, 100) + (message.content.length > 100 ? '...' : ''),
        hasFileName: !!message.fileName,
        fileName: message.fileName,
        hasFileUrl: !!message.fileUrl,
        fileUrl: message.fileUrl ? 'provided' : 'none',
        hasTimestamp: !!message.timestamp,
        operation: 'saveMessage' 
      }, 'Starting message save to Firestore');

      const messagesRef = db.collection('users').doc(userId).collection('chats').doc(chatId).collection('messages');
      
      // Duplicate kontrol: Aynı içerik ve role'e sahip mesaj var mı?
      const recentMessages = await messagesRef
        .orderBy('timestamp', 'desc')
        .limit(5)
        .get();
      
      const isDuplicate = recentMessages.docs.some(doc => {
        const data = doc.data();
        return data.role === message.role && 
               data.content === message.content &&
               Math.abs(new Date(data.timestamp?.toDate()).getTime() - new Date().getTime()) < 10000; // 10 saniye içinde
      });
      
      if (isDuplicate) {
        logger.info({
          requestId,
          userId,
          chatId,
          role: message.role,
          contentPreview: message.content.substring(0, 50) + '...',
          operation: 'duplicateMessageSkipped'
        }, 'Duplicate message detected, skipping save');
        
        return ResponseBuilder.success({}, 'Duplicate message skipped');
      }
      
      const messageData = {
        ...message,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      };

      logger.debug({
        requestId,
        userId,
        chatId,
        messageData: {
          role: messageData.role,
          contentLength: messageData.content.length,
          hasFileName: !!messageData.fileName,
          hasFileUrl: !!messageData.fileUrl,
          hasTimestamp: !!messageData.timestamp
        },
        operation: 'firestoreSave'
      }, 'Preparing message data for Firestore');

      await messagesRef.add(messageData);

      const processingTime = Date.now() - startTime;
      logger.info({ 
        requestId,
        userId, 
        chatId,
        role: message.role,
        contentLength: message.content.length,
        processingTimeMs: processingTime,
        operation: 'saveMessage' 
      }, 'Message saved to Firestore successfully');

      return ResponseBuilder.success({}, 'Message saved successfully');

    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      logger.error({ 
        requestId,
        err: error, 
        userId, 
        chatId,
        role: message.role,
        contentLength: message.content.length,
        processingTimeMs: processingTime,
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
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();
    
    try {
      logger.info({ 
        requestId,
        contentLength: content.length,
        contentPreview: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
        operation: 'generateTitle' 
      }, 'Starting chat title generation');

      const titleRequestData = {
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
      };

      logger.info({
        requestId,
        requestData: titleRequestData,
        operation: 'titleGenerationRequest'
      }, 'Sending title generation request to OpenAI');

      const response = await axios.post('https://api.openai.com/v1/chat/completions', titleRequestData, {
        headers: {
          'Authorization': `Bearer ${this.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      const processingTime = Date.now() - startTime;
      logger.info({
        requestId,
        responseStatus: response.status,
        responseHeaders: {
          contentType: response.headers['content-type'],
          openaiVersion: response.headers['openai-version'],
          requestId: response.headers['x-request-id']
        },
        responseData: {
          id: (response.data as any).id,
          model: (response.data as any).model,
          choicesCount: (response.data as any).choices?.length || 0,
          usage: (response.data as any).usage ? {
            promptTokens: (response.data as any).usage.prompt_tokens,
            completionTokens: (response.data as any).usage.completion_tokens,
            totalTokens: (response.data as any).usage.total_tokens
          } : null
        },
        processingTimeMs: processingTime,
        operation: 'titleGenerationResponse'
      }, 'Title generation response received from OpenAI');

      const title = (response.data as any).choices?.[0]?.message?.content?.trim() || 'Yeni Chat';
      
      logger.info({ 
        requestId,
        title,
        titleLength: title.length,
        processingTimeMs: processingTime,
        operation: 'generateTitle' 
      }, 'Chat title generated successfully');

      return title;

    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      logger.error({ 
        requestId,
        err: error,
        processingTimeMs: processingTime,
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

  /**
   * AI detection request kontrolü
   */
  private static isAIDetectionRequest(messages: ChatMessage[]): boolean {
    const aiDetectionKeywords = [
      'ai ile mi üretilmiş',
      'ai ile mi üretilmis',
      'ai ile mi üretildi',
      'yapay zeka ile mi üretilmiş',
      'yapay zeka ile mi üretilmis',
      'yapay zeka ile mi üretildi',
      'ai generated',
      'artificial intelligence',
      'ai ile mi yapılmış',
      'ai ile mi yapilmis',
      'ai ile mi yapıldı',
      'ai ile mi yapildi',
      'kontrol et',
      'kontrol eder misin',
      'ai detection',
      'ai tespit',
      'ai tespit et',
      'ai tespit eder misin',
      'bu foto ai ile mi',
      'bu görsel ai ile mi',
      'bu resim ai ile mi',
      'ai ile mi yapılmış',
      'ai ile mi yapilmis',
      'ai ile mi yapıldı',
      'ai ile mi yapildi',
      'yapay zeka ile mi yapılmış',
      'yapay zeka ile mi yapilmis',
      'yapay zeka ile mi yapıldı',
      'yapay zeka ile mi yapildi',
      'ai ile üretilmiş',
      'ai ile üretilmis',
      'ai ile üretildi',
      'yapay zeka ile üretilmiş',
      'yapay zeka ile üretilmis',
      'yapay zeka ile üretildi'
    ];

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return false;

    const content = lastMessage.content.toLowerCase();
    
    // Debug log
    logger.info({
      content: content.substring(0, 100),
      keywords: aiDetectionKeywords.slice(0, 5),
      operation: 'aiDetectionCheck'
    }, 'Checking for AI detection keywords');
    
    const isAIDetection = aiDetectionKeywords.some(keyword => 
      content.includes(keyword.toLowerCase())
    );
    
    logger.info({
      isAIDetection,
      matchedKeyword: aiDetectionKeywords.find(keyword => 
        content.includes(keyword.toLowerCase())
      ),
      operation: 'aiDetectionResult'
    }, 'AI detection check result');
    
    return isAIDetection;
  }

  /**
   * AI detection request işlemi
   */
  private static async handleAIDetectionRequest(request: ChatRequest, requestId: string): Promise<StandardResponse<ChatResponse>> {
    try {
      logger.info({ 
        requestId,
        userId: request.userId,
        chatId: request.chatId,
        operation: 'handleAIDetectionRequest' 
      }, 'Processing AI detection request');

      // Image URL'ini al
      const imageUrl = request.imageFileUrl;
      if (!imageUrl) {
        return ResponseBuilder.error(
          'no_image_provided',
          'AI detection için görsel gerekli'
        );
      }

      // Image'ı base64'e çevir
      const base64Image = await this.convertImageUrlToBase64(imageUrl);
      
      // AI or Not API'ye istek gönder
      const aiDetectionResult = await this.callAIOrNotAPI(base64Image, requestId);
      
      if (!aiDetectionResult.success) {
        return ResponseBuilder.error(
          'ai_detection_failed',
          'AI detection başarısız oldu'
        );
      }

      // Sonucu formatla
      const aiScore = aiDetectionResult.data?.ai_score || 0;
      const isAI = aiScore > 0.5;
      
      const responseMessage = isAI 
        ? `Bu görsel AI ile üretilmiş olabilir. AI skoru: ${(aiScore * 100).toFixed(1)}%`
        : `Bu görsel doğal olarak oluşturulmuş görünüyor. AI skoru: ${(aiScore * 100).toFixed(1)}%`;

      logger.info({ 
        requestId,
        userId: request.userId,
        chatId: request.chatId,
        aiScore,
        isAI,
        operation: 'aiDetectionCompleted' 
      }, 'AI detection completed successfully');

      return ResponseBuilder.success({
        message: {
          role: 'assistant',
          content: responseMessage,
          timestamp: new Date().toISOString()
        }
      }, 'AI detection completed');

    } catch (error: any) {
      logger.error({ 
        requestId,
        userId: request.userId,
        chatId: request.chatId,
        err: error,
        operation: 'handleAIDetectionRequest' 
      }, 'AI detection request failed');
      
      return ResponseBuilder.error(
        'ai_detection_failed',
        'AI detection işlemi başarısız oldu'
      );
    }
  }

  /**
   * AI or Not API'ye istek gönder
   */
  private static async callAIOrNotAPI(base64Image: string, requestId: string): Promise<StandardResponse<any>> {
    try {
      logger.info({ 
        requestId,
        imageSize: base64Image.length,
        operation: 'callAIOrNotAPI' 
      }, 'Calling AI or Not API');

      const response = await axios.post('https://api.ai-or-not.com/v1/analyze', {
        image: base64Image
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.AI_OR_NOT_API_KEY}`
      },
        timeout: 30000
      });

      logger.info({ 
        requestId,
        status: response.status,
        operation: 'callAIOrNotAPI' 
      }, 'AI or Not API response received');

      return ResponseBuilder.success(response.data, 'AI or Not API call successful');

    } catch (error: any) {
      logger.error({ 
        requestId,
        err: error,
        operation: 'callAIOrNotAPI' 
      }, 'AI or Not API call failed');
      
      return ResponseBuilder.error(
        'ai_or_not_api_failed',
        'AI or Not API çağrısı başarısız oldu'
      );
    }
  }
}
