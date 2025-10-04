"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatService = void 0;
const axios_1 = __importDefault(require("axios"));
const response_1 = require("../types/response");
const logger_1 = require("../utils/logger");
const firebase_1 = require("../firebase");
const firestore_1 = require("firebase/firestore");
class ChatService {
    /**
     * ChatGPT'ye mesaj gönder ve cevap al
     */
    static async sendMessage(request) {
        try {
            logger_1.logger.info({
                userId: request.userId,
                chatId: request.chatId,
                messageCount: request.messages.length,
                hasImage: request.hasImage,
                operation: 'sendMessage'
            }, 'Sending message to ChatGPT');
            // Model seçimi
            const modelToUse = request.hasImage ? 'gpt-4o' : this.FINE_TUNED_MODEL_ID;
            logger_1.logger.info({
                modelToUse,
                hasImage: request.hasImage,
                operation: 'modelSelection'
            }, 'Model selected for chat');
            // Mesajları formatla
            const formattedMessages = this.formatMessages(request.messages, request.imageFileUrl);
            logger_1.logger.debug({
                formattedMessagesCount: formattedMessages.length,
                hasArrayContent: formattedMessages.some(m => Array.isArray(m.content)),
                operation: 'messageFormatting'
            }, 'Messages formatted for OpenAI');
            // Agent functions (PDF, Excel, Word işlemleri)
            const agentFunctions = this.getAgentFunctions();
            logger_1.logger.debug({
                toolCount: agentFunctions.length,
                toolNames: agentFunctions.map(f => f.name),
                operation: 'agentFunctions'
            }, 'Agent functions prepared');
            // OpenAI API'ye istek gönder
            const response = await this.callOpenAI(modelToUse, formattedMessages, agentFunctions);
            logger_1.logger.info({
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
                logger_1.logger.info({
                    toolCallsCount: reply.tool_calls.length,
                    operation: 'toolCalls'
                }, 'Tool calls detected, processing...');
                const toolResult = await this.processToolCalls(reply.tool_calls, request);
                if (toolResult.finalMessage) {
                    return response_1.ResponseBuilder.success({
                        message: toolResult.finalMessage,
                        toolCalls: reply.tool_calls
                    }, 'Message processed with tools');
                }
            }
            // Direkt cevap
            if (reply.content) {
                const assistantMessage = {
                    role: 'assistant',
                    content: reply.content.trim(),
                    timestamp: (0, firestore_1.serverTimestamp)()
                };
                logger_1.logger.info({
                    contentLength: assistantMessage.content.length,
                    operation: 'directResponse'
                }, 'Direct assistant response received');
                return response_1.ResponseBuilder.success({
                    message: assistantMessage
                }, 'Message processed successfully');
            }
            throw new Error('No content in OpenAI response');
        }
        catch (error) {
            logger_1.logger.error({
                err: error,
                userId: request.userId,
                chatId: request.chatId,
                operation: 'sendMessage'
            }, 'Chat message error');
            return response_1.ResponseBuilder.error('chat_message_failed', error.message || 'Failed to process chat message');
        }
    }
    /**
     * Mesajları OpenAI formatına çevir
     */
    static formatMessages(messages, imageFileUrl) {
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
    static async callOpenAI(model, messages, tools) {
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
        logger_1.logger.debug({
            model,
            messageCount: messages.length,
            toolCount: tools.length,
            operation: 'openaiRequest'
        }, 'Sending request to OpenAI');
        const response = await axios_1.default.post('https://api.openai.com/v1/chat/completions', requestData, {
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
    static async processToolCalls(toolCalls, request) {
        const functionMap = this.getFunctionMap();
        const toolResponses = [];
        for (const call of toolCalls) {
            const name = call.function.name;
            const args = JSON.parse(call.function.arguments);
            logger_1.logger.debug({
                toolName: name,
                args,
                operation: 'toolExecution'
            }, 'Executing tool call');
            let functionResult = null;
            if (functionMap[name]) {
                try {
                    functionResult = await functionMap[name](args);
                    logger_1.logger.info({
                        toolName: name,
                        success: true,
                        operation: 'toolExecution'
                    }, 'Tool executed successfully');
                }
                catch (error) {
                    logger_1.logger.error({
                        err: error,
                        toolName: name,
                        operation: 'toolExecution'
                    }, 'Tool execution failed');
                    functionResult = { error: `Tool execution failed: ${error.message}` };
                }
            }
            else {
                logger_1.logger.warn({
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
        const followUpResponse = await this.callOpenAI(request.hasImage ? 'gpt-4o' : this.FINE_TUNED_MODEL_ID, [
            ...this.formatMessages(request.messages, request.imageFileUrl),
            ...toolResponses
        ], this.getAgentFunctions());
        const followUpMessage = followUpResponse.data.choices?.[0]?.message;
        if (followUpMessage?.content) {
            return {
                finalMessage: {
                    role: 'assistant',
                    content: followUpMessage.content.trim(),
                    timestamp: (0, firestore_1.serverTimestamp)()
                }
            };
        }
        return {};
    }
    /**
     * Agent functions listesi
     */
    static getAgentFunctions() {
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
    static getFunctionMap() {
        return {
            summarize_pdf: async (args) => {
                // PDF özetleme implementasyonu
                return { message: 'PDF özetlendi', data: 'Özet içeriği...' };
            },
            ask_pdf_question: async (args) => {
                // PDF soru-cevap implementasyonu
                return { message: 'Soru cevaplandı', answer: 'Cevap...' };
            },
            convert_pdf_to_word: async (args) => {
                // PDF to Word implementasyonu
                return { message: 'PDF Word\'e çevrildi', downloadUrl: 'url...' };
            },
            convert_pdf_to_excel: async (args) => {
                // PDF to Excel implementasyonu
                return { message: 'PDF Excel\'e çevrildi', downloadUrl: 'url...' };
            },
            generate_document: async (args) => {
                // Belge oluşturma implementasyonu
                return { message: 'Belge oluşturuldu', downloadUrl: 'url...' };
            }
        };
    }
    /**
     * Mesajı Firestore'a kaydet
     */
    static async saveMessageToFirestore(userId, chatId, message) {
        try {
            logger_1.logger.info({
                userId,
                chatId,
                role: message.role,
                contentLength: message.content.length,
                operation: 'saveMessage'
            }, 'Saving message to Firestore');
            const messagesRef = (0, firestore_1.collection)(firebase_1.db, 'users', userId, 'chats', chatId, 'messages');
            await (0, firestore_1.addDoc)(messagesRef, {
                ...message,
                timestamp: (0, firestore_1.serverTimestamp)()
            });
            logger_1.logger.info({
                userId,
                chatId,
                operation: 'saveMessage'
            }, 'Message saved to Firestore successfully');
            return response_1.ResponseBuilder.success({}, 'Message saved successfully');
        }
        catch (error) {
            logger_1.logger.error({
                err: error,
                userId,
                chatId,
                operation: 'saveMessage'
            }, 'Failed to save message to Firestore');
            return response_1.ResponseBuilder.error('save_message_failed', 'Failed to save message');
        }
    }
    /**
     * Chat başlığı oluştur
     */
    static async generateChatTitle(content) {
        try {
            logger_1.logger.info({
                contentLength: content.length,
                operation: 'generateTitle'
            }, 'Generating chat title');
            const response = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
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
            const title = response.data.choices?.[0]?.message?.content?.trim() || 'Yeni Chat';
            logger_1.logger.info({
                title,
                operation: 'generateTitle'
            }, 'Chat title generated');
            return title;
        }
        catch (error) {
            logger_1.logger.error({
                err: error,
                operation: 'generateTitle'
            }, 'Failed to generate chat title');
            return 'Yeni Chat';
        }
    }
    /**
     * TTS (Text-to-Speech) işlemi
     */
    static async textToSpeech(messages) {
        try {
            logger_1.logger.info({
                messageCount: messages.length,
                operation: 'textToSpeech'
            }, 'Converting text to speech');
            // TTS implementasyonu burada olacak
            // Şimdilik mock response
            const audioUrl = 'https://example.com/audio.mp3';
            logger_1.logger.info({
                audioUrl,
                operation: 'textToSpeech'
            }, 'TTS conversion completed');
            return response_1.ResponseBuilder.success({ audioUrl }, 'Text converted to speech');
        }
        catch (error) {
            logger_1.logger.error({
                err: error,
                operation: 'textToSpeech'
            }, 'TTS conversion failed');
            return response_1.ResponseBuilder.error('tts_failed', 'Failed to convert text to speech');
        }
    }
}
exports.ChatService = ChatService;
ChatService.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
ChatService.FINE_TUNED_MODEL_ID = process.env.FINE_TUNED_MODEL_ID || 'gpt-3.5-turbo';
ChatService.ASSISTANT_ID = process.env.ASSISTANT_ID;
