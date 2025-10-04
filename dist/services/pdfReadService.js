"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PDFReadService = void 0;
const axios_1 = __importDefault(require("axios"));
const response_1 = require("../types/response");
const logger_1 = require("../utils/logger");
class PDFReadService {
    /**
     * PDF dosyasını özetler
     */
    static async summarizePDF(file, filename) {
        try {
            const formData = new FormData();
            formData.append('file', new Blob([file.buffer]), filename);
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/summarize-pdf/`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 30000 // 30 saniye timeout
            });
            logger_1.logger.info({ filename, fileSize: file.length }, 'PDF summarized successfully');
            return response_1.ResponseBuilder.success(response.data, 'PDF summarized successfully');
        }
        catch (error) {
            logger_1.logger.error({
                err: error,
                filename,
                fileSize: file.length,
                operation: 'summarizePDF'
            }, 'PDF summarize error');
            return response_1.ResponseBuilder.error('pdf_summarize_failed', error.response?.data?.detail || 'Failed to summarize PDF');
        }
    }
    /**
     * PDF'den soru-cevap yapar
     */
    static async askPDFQuestion(pdfText, question) {
        try {
            const formData = new FormData();
            formData.append('pdf_text', pdfText);
            formData.append('question', question);
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/ask-pdf-question/`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 30000
            });
            logger_1.logger.info({
                questionLength: question.length,
                pdfTextLength: pdfText.length
            }, 'PDF question answered successfully');
            return response_1.ResponseBuilder.success(response.data, 'PDF question answered successfully');
        }
        catch (error) {
            logger_1.logger.error({
                err: error,
                questionLength: question.length,
                pdfTextLength: pdfText.length,
                operation: 'askPDFQuestion'
            }, 'PDF question error');
            return response_1.ResponseBuilder.error('pdf_question_failed', error.response?.data?.detail || 'Failed to answer PDF question');
        }
    }
    /**
     * AI belge tespiti yapar
     */
    static async detectAIDocument(file, filename, mimeType) {
        try {
            const formData = new FormData();
            formData.append('file', new Blob([file.buffer]), filename);
            formData.append('mime_type', mimeType);
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/check-ai`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 30000
            });
            return response_1.ResponseBuilder.success(response.data, 'AI document detection completed');
        }
        catch (error) {
            logger_1.logger.error({ err: error, filename, mimeType, operation: 'detectAIDocument' }, 'AI document detection error');
            return response_1.ResponseBuilder.error('ai_detection_failed', error.response?.data?.detail || 'Failed to detect AI document');
        }
    }
    /**
     * Görsel analizi yapar
     */
    static async analyzeImage(imageBase64) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/analyze-image`, {
                image_base64: imageBase64
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 30000
            });
            return response_1.ResponseBuilder.success(response.data, 'Image analysis completed');
        }
        catch (error) {
            logger_1.logger.error({ err: error, imageSize: imageBase64.length, operation: 'analyzeImage' }, 'Image analysis error');
            return response_1.ResponseBuilder.error('image_analysis_failed', error.response?.data?.detail || 'Failed to analyze image');
        }
    }
    /**
     * PDF'den Word'e dönüştürür
     */
    static async pdfToWord(file, filename) {
        try {
            const formData = new FormData();
            formData.append('file', new Blob([file.buffer]), filename);
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/pdf-to-word`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000 // 60 saniye timeout
            });
            return response_1.ResponseBuilder.success(response.data, 'PDF converted to Word successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, filename, operation: 'pdfToWord' }, 'PDF to Word error');
            return response_1.ResponseBuilder.error('pdf_to_word_failed', error.response?.data?.detail || 'Failed to convert PDF to Word');
        }
    }
    /**
     * PDF'den Excel'e dönüştürür
     */
    static async pdfToExcel(file, filename) {
        try {
            const formData = new FormData();
            formData.append('file', new Blob([file.buffer]), filename);
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/pdf-to-excel`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'PDF converted to Excel successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, filename, operation: 'pdfToExcel' }, 'PDF to Excel error');
            return response_1.ResponseBuilder.error('pdf_to_excel_failed', error.response?.data?.detail || 'Failed to convert PDF to Excel');
        }
    }
    /**
     * PDF'den PPT'e dönüştürür
     */
    static async pdfToPPT(file, filename) {
        try {
            const formData = new FormData();
            formData.append('file', new Blob([file.buffer]), filename);
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/pdf-to-ppt`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'PDF converted to PPT successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, filename, operation: 'pdfToPPT' }, 'PDF to PPT error');
            return response_1.ResponseBuilder.error('pdf_to_ppt_failed', error.response?.data?.detail || 'Failed to convert PDF to PPT');
        }
    }
    /**
     * Word'den PDF'e dönüştürür
     */
    static async wordToPDF(file, filename) {
        try {
            const formData = new FormData();
            formData.append('file', new Blob([file.buffer]), filename);
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/word-to-pdf`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'Word converted to PDF successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, filename, operation: 'wordToPDF' }, 'Word to PDF error');
            return response_1.ResponseBuilder.error('word_to_pdf_failed', error.response?.data?.detail || 'Failed to convert Word to PDF');
        }
    }
    /**
     * Excel'den PDF'e dönüştürür
     */
    static async excelToPDF(file, filename) {
        try {
            const formData = new FormData();
            formData.append('file', new Blob([file.buffer]), filename);
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/excel-to-pdf`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'Excel converted to PDF successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, filename, operation: 'excelToPDF' }, 'Excel to PDF error');
            return response_1.ResponseBuilder.error('excel_to_pdf_failed', error.response?.data?.detail || 'Failed to convert Excel to PDF');
        }
    }
    /**
     * PPT'den PDF'e dönüştürür
     */
    static async pptToPDF(file, filename) {
        try {
            const formData = new FormData();
            formData.append('file', new Blob([file.buffer]), filename);
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/ppt-to-pdf`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'PPT converted to PDF successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, filename, operation: 'pptToPDF' }, 'PPT to PDF error');
            return response_1.ResponseBuilder.error('ppt_to_pdf_failed', error.response?.data?.detail || 'Failed to convert PPT to PDF');
        }
    }
    /**
     * Word belgesi oluşturur
     */
    static async generateDoc(prompt) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/generate-doc`, {
                prompt
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'Word document generated successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, promptLength: prompt.length, operation: 'generateDoc' }, 'Generate doc error');
            return response_1.ResponseBuilder.error('generate_doc_failed', error.response?.data?.detail || 'Failed to generate Word document');
        }
    }
    /**
     * Excel belgesi oluşturur
     */
    static async generateExcel(prompt) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/generate-excel`, {
                prompt
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'Excel document generated successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, promptLength: prompt.length, operation: 'generateExcel' }, 'Generate Excel error');
            return response_1.ResponseBuilder.error('generate_excel_failed', error.response?.data?.detail || 'Failed to generate Excel document');
        }
    }
    /**
     * PowerPoint belgesi oluşturur
     */
    static async generatePPT(prompt) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/generate-ppt`, {
                prompt
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'PowerPoint document generated successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, promptLength: prompt.length, operation: 'generatePPT' }, 'Generate PPT error');
            return response_1.ResponseBuilder.error('generate_ppt_failed', error.response?.data?.detail || 'Failed to generate PowerPoint document');
        }
    }
    /**
     * Gelişmiş Word belgesi oluşturur
     */
    static async generateDocAdvanced(prompt) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/generate-doc-advanced`, {
                prompt
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'Advanced Word document generated successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, promptLength: prompt.length, operation: 'generateDocAdvanced' }, 'Generate advanced doc error');
            return response_1.ResponseBuilder.error('generate_doc_advanced_failed', error.response?.data?.detail || 'Failed to generate advanced Word document');
        }
    }
    /**
     * Gelişmiş PowerPoint belgesi oluşturur
     */
    static async generatePPTAdvanced(prompt) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/generate-ppt-advanced`, {
                prompt
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'Advanced PowerPoint document generated successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, promptLength: prompt.length, operation: 'generatePPTAdvanced' }, 'Generate advanced PPT error');
            return response_1.ResponseBuilder.error('generate_ppt_advanced_failed', error.response?.data?.detail || 'Failed to generate advanced PowerPoint document');
        }
    }
    /**
     * Speech-to-Text (Ses metne çevirme)
     */
    static async speechToText(audioBase64) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/stt`, {
                base64: audioBase64
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 30000
            });
            return response_1.ResponseBuilder.success(response.data, 'Speech converted to text successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, audioSize: audioBase64.length, operation: 'speechToText' }, 'Speech to text error');
            return response_1.ResponseBuilder.error('speech_to_text_failed', error.response?.data?.detail || 'Failed to convert speech to text');
        }
    }
    /**
     * Text-to-Speech (Metin sese çevirme)
     */
    static async textToSpeech(messages) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/tts-chat`, {
                messages
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 30000
            });
            return response_1.ResponseBuilder.success(response.data, 'Text converted to speech successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, messageCount: messages.length, operation: 'textToSpeech' }, 'Text to speech error');
            return response_1.ResponseBuilder.error('text_to_speech_failed', error.response?.data?.detail || 'Failed to convert text to speech');
        }
    }
    /**
     * Görsel açıklama oluşturur
     */
    static async imageCaption(imageBase64) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/image-caption`, {
                image_base64: imageBase64
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 30000
            });
            return response_1.ResponseBuilder.success(response.data, 'Image caption generated successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, imageSize: imageBase64.length, operation: 'imageCaption' }, 'Image caption error');
            return response_1.ResponseBuilder.error('image_caption_failed', error.response?.data?.detail || 'Failed to generate image caption');
        }
    }
    /**
     * Video analizi yapar
     */
    static async analyzeVideo(videoBase64) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/analyze-video`, {
                video_base64: videoBase64
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'Video analysis completed successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, videoSize: videoBase64.length, operation: 'analyzeVideo' }, 'Video analysis error');
            return response_1.ResponseBuilder.error('video_analysis_failed', error.response?.data?.detail || 'Failed to analyze video');
        }
    }
    /**
     * Video üretir
     */
    static async generateVideo(prompt) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/generate-video`, {
                prompt
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 120000 // 2 dakika timeout
            });
            return response_1.ResponseBuilder.success(response.data, 'Video generated successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, promptLength: prompt.length, operation: 'generateVideo' }, 'Generate video error');
            return response_1.ResponseBuilder.error('generate_video_failed', error.response?.data?.detail || 'Failed to generate video');
        }
    }
    /**
     * Video prompt üretir
     */
    static async generateVideoPrompt(prompt) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/generate-video-prompt`, {
                prompt
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 30000
            });
            return response_1.ResponseBuilder.success(response.data, 'Video prompt generated successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, promptLength: prompt.length, operation: 'generateVideoPrompt' }, 'Generate video prompt error');
            return response_1.ResponseBuilder.error('generate_video_prompt_failed', error.response?.data?.detail || 'Failed to generate video prompt');
        }
    }
    /**
     * Embeddings ile soru-cevap
     */
    static async askWithEmbeddings(question, chatId) {
        try {
            const formData = new FormData();
            formData.append('question', question);
            formData.append('chat_id', chatId);
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/ask-with-embeddings/`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 30000
            });
            return response_1.ResponseBuilder.success(response.data, 'Question answered with embeddings successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, questionLength: question.length, chatId, operation: 'askWithEmbeddings' }, 'Ask with embeddings error');
            return response_1.ResponseBuilder.error('ask_with_embeddings_failed', error.response?.data?.detail || 'Failed to answer question with embeddings');
        }
    }
    /**
     * Doküman arama
     */
    static async searchDocs(query, chatId) {
        try {
            const formData = new FormData();
            formData.append('query', query);
            formData.append('chat_id', chatId);
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/search-docs`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 30000
            });
            return response_1.ResponseBuilder.success(response.data, 'Document search completed successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, queryLength: query.length, chatId, operation: 'searchDocs' }, 'Search docs error');
            return response_1.ResponseBuilder.error('search_docs_failed', error.response?.data?.detail || 'Failed to search documents');
        }
    }
    /**
     * URL'den PDF özetleme
     */
    static async summarizePDFUrl(url) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/summarize-pdf-url/`, {
                url
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'PDF URL summarized successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, url, operation: 'summarizePDFUrl' }, 'Summarize PDF URL error');
            return response_1.ResponseBuilder.error('summarize_pdf_url_failed', error.response?.data?.detail || 'Failed to summarize PDF URL');
        }
    }
    /**
     * URL'den Word özetleme
     */
    static async summarizeWordUrl(url) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/summarize-word-url/`, {
                url
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'Word URL summarized successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, url, operation: 'summarizeWordUrl' }, 'Summarize Word URL error');
            return response_1.ResponseBuilder.error('summarize_word_url_failed', error.response?.data?.detail || 'Failed to summarize Word URL');
        }
    }
    /**
     * URL'den Excel özetleme
     */
    static async summarizeExcelUrl(url) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/summarize-excel-url/`, {
                url
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'Excel URL summarized successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, url, operation: 'summarizeExcelUrl' }, 'Summarize Excel URL error');
            return response_1.ResponseBuilder.error('summarize_excel_url_failed', error.response?.data?.detail || 'Failed to summarize Excel URL');
        }
    }
    /**
     * URL'den PPT özetleme
     */
    static async summarizePPTUrl(url) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/summarize-ppt-url/`, {
                url
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'PPT URL summarized successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, url, operation: 'summarizePPTUrl' }, 'Summarize PPT URL error');
            return response_1.ResponseBuilder.error('summarize_ppt_url_failed', error.response?.data?.detail || 'Failed to summarize PPT URL');
        }
    }
    /**
     * URL'den HTML özetleme
     */
    static async summarizeHTMLUrl(url) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/summarize-html-url/`, {
                url
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'HTML URL summarized successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, url, operation: 'summarizeHTMLUrl' }, 'Summarize HTML URL error');
            return response_1.ResponseBuilder.error('summarize_html_url_failed', error.response?.data?.detail || 'Failed to summarize HTML URL');
        }
    }
    /**
     * URL'den JSON özetleme
     */
    static async summarizeJSONUrl(url) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/summarize-json-url/`, {
                url
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'JSON URL summarized successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, url, operation: 'summarizeJSONUrl' }, 'Summarize JSON URL error');
            return response_1.ResponseBuilder.error('summarize_json_url_failed', error.response?.data?.detail || 'Failed to summarize JSON URL');
        }
    }
    /**
     * URL'den CSV özetleme
     */
    static async summarizeCSVUrl(url) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/summarize-csv-url/`, {
                url
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'CSV URL summarized successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, url, operation: 'summarizeCSVUrl' }, 'Summarize CSV URL error');
            return response_1.ResponseBuilder.error('summarize_csv_url_failed', error.response?.data?.detail || 'Failed to summarize CSV URL');
        }
    }
    /**
     * URL'den TXT özetleme
     */
    static async summarizeTXTUrl(url) {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/summarize-txt-url/`, {
                url
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'TXT URL summarized successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, url, operation: 'summarizeTXTUrl' }, 'Summarize TXT URL error');
            return response_1.ResponseBuilder.error('summarize_txt_url_failed', error.response?.data?.detail || 'Failed to summarize TXT URL');
        }
    }
    /**
     * Dosya soru-cevap
     */
    static async askFileQuestion(file, filename, question, mimeType) {
        try {
            const formData = new FormData();
            formData.append('file', new Blob([file.buffer]), filename);
            formData.append('question', question);
            formData.append('mime_type', mimeType);
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/ask-file-question/`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'File question answered successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, filename, questionLength: question.length, mimeType, operation: 'askFileQuestion' }, 'Ask file question error');
            return response_1.ResponseBuilder.error('ask_file_question_failed', error.response?.data?.detail || 'Failed to answer file question');
        }
    }
    /**
     * Chat export
     */
    static async exportChat(chatId, format = 'pdf') {
        try {
            const response = await axios_1.default.post(`${this.PDFREAD_BASE_URL}/export-chat`, {
                chat_id: chatId,
                format
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.PDFREAD_API_KEY && { 'Authorization': `Bearer ${this.PDFREAD_API_KEY}` })
                },
                timeout: 60000
            });
            return response_1.ResponseBuilder.success(response.data, 'Chat exported successfully');
        }
        catch (error) {
            logger_1.logger.error({ err: error, chatId, format, operation: 'exportChat' }, 'Export chat error');
            return response_1.ResponseBuilder.error('export_chat_failed', error.response?.data?.detail || 'Failed to export chat');
        }
    }
    /**
     * Health check
     */
    static async healthCheck() {
        try {
            const response = await axios_1.default.get(`${this.PDFREAD_BASE_URL}/healthz`, {
                timeout: 10000
            });
            return response_1.ResponseBuilder.success(response.data, 'PDFRead service is healthy');
        }
        catch (error) {
            logger_1.logger.error({ err: error, operation: 'healthCheck' }, 'Health check error');
            return response_1.ResponseBuilder.error('health_check_failed', error.response?.data?.detail || 'PDFRead service is not available');
        }
    }
}
exports.PDFReadService = PDFReadService;
PDFReadService.PDFREAD_BASE_URL = process.env.PDFREAD_BASE_URL || 'https://avenia.onrender.com';
PDFReadService.PDFREAD_API_KEY = process.env.PDFREAD_API_KEY;
