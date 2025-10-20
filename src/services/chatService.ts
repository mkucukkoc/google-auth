import axios from 'axios';
import { StandardResponse, ResponseBuilder } from '../types/response';
import { logger } from '../utils/logger';
import { admin, db, FieldValue } from '../firebase';
import {
  OpenAIAgentService,
  AgentMessage,
  AgentMessageContent
} from './openAIAgentService';

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

      // Image kontrolü - daha esnek
      const hasImageInMessages =
        request.messages.some(msg => {
          const inlineMatch = msg.content.match(/\[Dosya Bağlantısı\]:\s*(https?:\/\/\S+)/);
          if (inlineMatch?.[1]) {
            return true;
          }

          return Boolean(this.normalizeImageUrl(msg.fileUrl));
        }) || Boolean(this.normalizeImageUrl(request.imageFileUrl));
      
      const shouldHandleAIDetection = isAIDetectionRequest && (request.hasImage || hasImageInMessages);
      const hasAIDetectionSupport = Boolean(process.env.AI_OR_NOT_API_KEY && process.env.AI_OR_NOT_API_KEY.trim().length > 0);

      if (shouldHandleAIDetection) {
        if (!hasAIDetectionSupport) {
          logger.warn({
            requestId,
            userId: request.userId,
            chatId: request.chatId,
            hasImage: request.hasImage,
            hasImageInMessages,
            operation: 'aiDetectionRequest'
          }, 'AI detection requested but API key is not configured. Falling back to standard chat processing.');
        } else {
          logger.info({
            requestId,
            userId: request.userId,
            chatId: request.chatId,
            hasImage: request.hasImage,
            hasImageInMessages,
            operation: 'aiDetectionRequest'
          }, 'AI detection request detected, redirecting to AI or Not API');

          // AI detection için özel işlem
          return await this.handleAIDetectionRequest(request, requestId);
        }
      }

      // Model seçimi - Image varsa gpt-4o kullan (hasImageInMessages zaten yukarıda tanımlandı)
      
      const modelToUse = (request.hasImage || hasImageInMessages) ? 'gpt-4o' : this.FINE_TUNED_MODEL_ID;
      
      logger.info({ 
        requestId,
        modelToUse, 
        hasImage: request.hasImage,
        hasImageInMessages,
        imageFileUrl: request.imageFileUrl,
        fineTunedModel: this.FINE_TUNED_MODEL_ID,
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
          contentType: Array.isArray(msg.content)
            ? 'multimodal'
            : typeof msg.content === 'string'
              ? 'text'
              : 'empty',
          contentLength: Array.isArray(msg.content)
            ? msg.content.reduce((total: number, part: AgentMessageContent) => total + (part.text?.length || 0), 0)
            : typeof msg.content === 'string'
              ? msg.content.length
              : 0,
          contentPreview: Array.isArray(msg.content)
            ? msg.content
              .map((part: AgentMessageContent) => part.text || `[${part.type}]`)
              .join(' ')
            : typeof msg.content === 'string'
              ? msg.content.substring(0, 100) + (msg.content.length > 100 ? '...' : '')
              : '',
          hasImage: Array.isArray(msg.content) && msg.content.some((part: AgentMessageContent) =>
            part.type === 'input_image' || part.type === 'image_url'
          )
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

      const functionMap = this.getFunctionMap(request);

      const agentResult = await OpenAIAgentService.runAgent({
        requestId,
        model: modelToUse,
        messages: formattedMessages,
        tools: agentFunctions,
        executeTool: async (name: string, args: any) => {
          const toolFn = functionMap[name];
          if (!toolFn) {
            throw new Error(`Tool not found: ${name}`);
          }
          return await toolFn(args);
        }
      });

      const rawAgentResponse = agentResult.rawResponse;

      logger.info({
        requestId,
        responseId: rawAgentResponse?.id,
        responseStatus: rawAgentResponse?.status,
        model: rawAgentResponse?.model || modelToUse,
        hasOutput: !!agentResult.outputText,
        toolCallsCount: agentResult.toolCalls.length,
        operation: 'openaiAgentAnalysis'
      }, 'OpenAI agent response received');

      if (agentResult.toolCalls.length > 0) {
        logger.info({
          requestId,
          toolCallsCount: agentResult.toolCalls.length,
          toolCalls: agentResult.toolCalls.map(call => ({
            id: call.id,
            name: call.name,
            arguments: call.arguments,
            hasResult: call.result !== undefined
          })),
          operation: 'openaiAgentToolSummary'
        }, 'OpenAI agent tool calls executed');
      }

      if (!agentResult.outputText) {
        logger.error({
          requestId,
          rawAgentResponse,
          operation: 'openaiAgentAnalysis'
        }, 'No content in OpenAI agent response');
        throw new Error('No content generated from OpenAI agent');
      }

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: agentResult.outputText.trim(),
        timestamp: FieldValue.serverTimestamp()
      };

      const responseToolCalls = agentResult.toolCalls.map(call => ({
        id: call.id,
        type: 'function',
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments ?? {})
        },
        result: call.result
      }));

      const processingTime = Date.now() - startTime;

      logger.info({
        requestId,
        contentLength: assistantMessage.content.length,
        contentPreview: assistantMessage.content.substring(0, 200) + (assistantMessage.content.length > 200 ? '...' : ''),
        processingTimeMs: processingTime,
        toolCallsCount: responseToolCalls.length,
        operation: 'openaiAgentResponse'
      }, 'Assistant response prepared');

      const responsePayload: any = {
        message: assistantMessage
      };

      if (responseToolCalls.length > 0) {
        responsePayload.toolCalls = responseToolCalls;
      }

      return ResponseBuilder.success(
        responsePayload,
        responseToolCalls.length > 0 ? 'Message processed with tools' : 'Message processed successfully'
      );

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
  private static async formatMessages(
    messages: ChatMessage[],
    imageFileUrl?: string
  ): Promise<AgentMessage[]> {
    const formattedMessages: AgentMessage[] = [];

    for (const msg of messages) {
      // Inline formatta ("[Dosya Bağlantısı]: <url>") gönderilen görsel linkini yakala
      const inlineUrlCandidate = this.extractInlineImageUrl(msg.content);
      // Yakaladığımız veya doğrudan gelen URL'leri tek formatta normalize et
      const inlineUrl = this.normalizeImageUrl(inlineUrlCandidate);
      const messageLevelUrl = this.normalizeImageUrl(msg.fileUrl);
      const fallbackUrl = this.normalizeImageUrl(imageFileUrl);
      const fileUrl = inlineUrl || messageLevelUrl || fallbackUrl;

      // Seçilen URL'nin gerçekten görsel olup olmadığını teyit et
      const isImage = this.isImageUrl(fileUrl);

      if (fileUrl && isImage) {
        // Kullanıcı mesajındaki görsel referansını temizleyip sadece açıklama metnini bırak
        const cleanedTextPart = this.stripInlineFileReference(msg.content);

        // OpenAI Responses API'ye hem metin hem de görseli ayrı parçalarda göndereceğiz
        const messageContentParts: AgentMessageContent[] = [];

        if (cleanedTextPart) {
          // Açıklama metnini `input_text` tipinde ekle
          messageContentParts.push({ type: 'input_text', text: cleanedTextPart });
        }

        // Normalize edilmiş URL'yi `input_image` tipinde gönder
        messageContentParts.push({
          type: 'input_image',
          image_url: fileUrl
        });

        formattedMessages.push({
          role: msg.role,
          content: messageContentParts
        });
      } else {
        // Görsel bulunmadığında mesajı olduğu gibi OpenAI'ye yönlendir
        formattedMessages.push({ role: msg.role, content: msg.content });
      }
    }

    return formattedMessages;
  }

  private static normalizeImageUrl(raw?: unknown): string | undefined {
    if (!raw) {
      return undefined;
    }

    if (typeof raw === 'string') {
      // String olarak gelirse baştaki/sondaki boşlukları temizle
      const trimmed = raw.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }

    if (Array.isArray(raw)) {
      // Dizi halinde gelirse ilk geçerli URL'yi bul
      for (const entry of raw) {
        const normalized = this.normalizeImageUrl(entry);
        if (normalized) {
          return normalized;
        }
      }
      return undefined;
    }

    if (typeof raw === 'object') {
      // { url: "..." } gibi nesneleri işle
      const possibleUrl = (raw as { url?: unknown }).url;
      if (typeof possibleUrl === 'string') {
        const trimmed = possibleUrl.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }

      // { image_url: "..." } ya da { image_url: { url: "..." } } yapılarını ele al
      const imageUrlField = (raw as { image_url?: unknown }).image_url;
      if (typeof imageUrlField === 'string') {
        const trimmed = imageUrlField.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }

      if (typeof imageUrlField === 'object') {
        return this.normalizeImageUrl(imageUrlField);
      }

      // CamelCase yazılmış alternatif anahtarları da destekle
      const camelCaseImageUrl = (raw as { imageUrl?: unknown }).imageUrl;
      if (typeof camelCaseImageUrl === 'string') {
        const trimmed = camelCaseImageUrl.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }

      if (typeof camelCaseImageUrl === 'object') {
        return this.normalizeImageUrl(camelCaseImageUrl);
      }
    }

    return undefined;
  }

  private static extractInlineImageUrl(content: string): string | undefined {
    if (!content) {
      return undefined;
    }

    // Markdown benzeri "[Dosya Bağlantısı]: <url>" kalıbını eşleştir
    const match = content.match(/\[Dosya Bağlantısı\]:\s*(https?:\/\/\S+)/i);
    return match?.[1];
  }

  private static stripInlineFileReference(content: string): string {
    if (!content) {
      return '';
    }

    // Mesaj metninden görsel referansını çıkartarak sadece açıklamayı bırak
    const withoutReference = content.replace(/\[Dosya Bağlantısı\]:\s*(https?:\/\/\S+)/gi, '').trim();

    return withoutReference;
  }

  private static isImageUrl(url?: string): boolean {
    if (!url) {
      return false;
    }

    // Uzantı bazlı basit doğrulama ile görsel olup olmadığını kontrol et
    return /(\.)(jpeg|jpg|png|gif|webp|bmp|heic|heif|tif|tiff)(\?|$)/i.test(url);
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
  private static getFunctionMap(request?: ChatRequest): Record<string, (args: any) => Promise<any>> {
    const userId = request?.userId || 'system';
    const chatId = request?.chatId || 'system';

    return {
      summarize_pdf: async (args: any) => {
        // Gerçek PDF özetleme implementasyonu
        const { PDFService } = await import('./pdfService');
        const result = await PDFService.extractAndSummarizePDF({
          fileUrl: args.fileUrl,
          userId,
          chatId
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
      
      const isDuplicate = recentMessages.docs.some((doc: any) => {
        const data = doc.data();
        const timestamp = (data.timestamp && typeof data.timestamp.toDate === 'function') ? data.timestamp.toDate() : data.timestamp;
        return data.role === message.role && 
               data.content === message.content &&
               Math.abs(new Date(timestamp).getTime() - new Date().getTime()) < 10000; // 10 saniye içinde
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
        timestamp: FieldValue.serverTimestamp()
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
      'bu foto ai ile mi üretildi',
      'bu görsel ai ile mi üretildi',
      'bu resim ai ile mi üretildi',
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

      // Image URL'ini al - mesajlardan veya request'ten
      let imageUrl = request.imageFileUrl;
      
      // Eğer request.imageFileUrl yoksa, mesajlardan al
      if (!imageUrl) {
        const messageWithImage = request.messages.find(msg => 
          msg.content.includes('[Dosya Bağlantısı]') || msg.fileUrl
        );
        
        if (messageWithImage) {
          const match = messageWithImage.content.match(/\[Dosya Bağlantısı\]:\s*(https?:\/\/\S+)/);
          imageUrl = match?.[1]?.trim() || messageWithImage.fileUrl;
        }
      }
      
      if (!imageUrl) {
        logger.error({ 
          requestId,
          userId: request.userId,
          chatId: request.chatId,
          operation: 'handleAIDetectionRequest' 
        }, 'No image URL found for AI detection');
        
        return ResponseBuilder.error(
          'no_image_provided',
          'AI detection için görsel gerekli'
        );
      }
      
      logger.info({ 
        requestId,
        userId: request.userId,
        chatId: request.chatId,
        imageUrl: imageUrl.substring(0, 100) + '...',
        operation: 'handleAIDetectionRequest' 
      }, 'Image URL found for AI detection');

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
      const apiKey = process.env.AI_OR_NOT_API_KEY;
      logger.info({ 
        requestId,
        imageSize: base64Image.length,
        hasApiKey: !!apiKey,
        apiKeyLength: apiKey?.length || 0,
        operation: 'callAIOrNotAPI' 
      }, 'Calling AI or Not API');
      
      if (!apiKey) {
        logger.error({ 
          requestId,
          operation: 'callAIOrNotAPI' 
        }, 'AI_OR_NOT_API_KEY environment variable is not set');
        
        return ResponseBuilder.error(
          'ai_or_not_api_key_missing',
          'AI or Not API key is not configured'
        );
      }

      // Base64'ten buffer'a çevir
      const imageBuffer = Buffer.from(base64Image.replace(/^data:image\/[a-z]+;base64,/, ''), 'base64');
      
      // FormData oluştur
      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('image', imageBuffer, {
        filename: 'image.jpg',
        contentType: 'image/jpeg'
      });

      const response = await axios.post('https://api.aiornot.com/v2/image/sync', formData, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          ...formData.getHeaders()
        },
        timeout: 30000
      });

      logger.info({ 
        requestId,
        status: response.status,
        responseData: response.data,
        operation: 'callAIOrNotAPI' 
      }, 'AI or Not API response received');

      return ResponseBuilder.success(response.data, 'AI or Not API call successful');

    } catch (error: any) {
      logger.error({ 
        requestId,
        err: error,
        errorStatus: error.response?.status,
        errorData: error.response?.data,
        operation: 'callAIOrNotAPI' 
      }, 'AI or Not API call failed');
      
      return ResponseBuilder.error(
        'ai_or_not_api_failed',
        'AI or Not API çağrısı başarısız oldu'
      );
    }
  }
}
