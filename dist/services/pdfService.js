"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PDFService = void 0;
const axios_1 = __importDefault(require("axios"));
const response_1 = require("../types/response");
const logger_1 = require("../utils/logger");
// pdf-parse CommonJS modülü olduğundan, default import yerine require kullanıyoruz
const pdfModule = require('pdf-parse');
class PDFService {
    /**
     * PDF'den metin çıkar ve özet oluştur
     */
    static async extractAndSummarizePDF(request) {
        const requestId = Math.random().toString(36).substring(7);
        const startTime = Date.now();
        try {
            logger_1.logger.info({
                requestId,
                userId: request.userId,
                chatId: request.chatId,
                fileUrl: request.fileUrl,
                operation: 'pdfExtraction'
            }, 'Starting PDF extraction and summarization');
            // PDF dosyasını indir
            const pdfBuffer = await this.downloadPDF(request.fileUrl, requestId);
            // PDF'den metin çıkar
            const pdfData = await this.extractTextFromPDF(pdfBuffer, requestId);
            // Metin çok kısaysa hata ver
            if (pdfData.text.length < 50) {
                logger_1.logger.warn({
                    requestId,
                    textLength: pdfData.text.length,
                    operation: 'pdfExtraction'
                }, 'PDF text too short for summarization');
                return response_1.ResponseBuilder.error('pdf_text_too_short', 'PDF dosyasından yeterli metin çıkarılamadı. Dosya boş veya taranmış resim olabilir.');
            }
            // OpenAI ile özet oluştur
            const summary = await this.generateSummary(pdfData.text, requestId);
            const processingTime = Date.now() - startTime;
            logger_1.logger.info({
                requestId,
                userId: request.userId,
                chatId: request.chatId,
                pageCount: pdfData.numpages,
                wordCount: pdfData.text.split(/\s+/).length,
                summaryLength: summary.length,
                processingTime,
                operation: 'pdfExtraction'
            }, 'PDF extraction and summarization completed successfully');
            return response_1.ResponseBuilder.success({
                summary,
                pageCount: pdfData.numpages,
                wordCount: pdfData.text.split(/\s+/).length,
                extractedText: pdfData.text,
                processingTime
            }, 'PDF başarıyla özetlendi');
        }
        catch (error) {
            const processingTime = Date.now() - startTime;
            logger_1.logger.error({
                requestId,
                err: error,
                userId: request.userId,
                chatId: request.chatId,
                fileUrl: request.fileUrl,
                processingTime,
                operation: 'pdfExtraction'
            }, 'PDF extraction and summarization failed');
            return response_1.ResponseBuilder.error('pdf_extraction_failed', error.message || 'PDF işleme sırasında hata oluştu');
        }
    }
    /**
     * PDF dosyasını indir
     */
    static async downloadPDF(fileUrl, requestId) {
        try {
            logger_1.logger.info({
                requestId,
                fileUrl,
                operation: 'pdfDownload'
            }, 'Downloading PDF file');
            const response = await axios_1.default.get(fileUrl, {
                responseType: 'arraybuffer',
                timeout: 30000, // 30 saniye timeout
                maxContentLength: 25 * 1024 * 1024, // 25MB limit
            });
            const buffer = Buffer.from(response.data);
            logger_1.logger.info({
                requestId,
                fileSize: buffer.length,
                fileSizeMB: (buffer.length / (1024 * 1024)).toFixed(2),
                operation: 'pdfDownload'
            }, 'PDF file downloaded successfully');
            return buffer;
        }
        catch (error) {
            logger_1.logger.error({
                requestId,
                err: error,
                fileUrl,
                operation: 'pdfDownload'
            }, 'Failed to download PDF file');
            throw new Error(`PDF dosyası indirilemedi: ${error.message}`);
        }
    }
    /**
     * PDF'den metin çıkar
     */
    static async extractTextFromPDF(buffer, requestId) {
        try {
            logger_1.logger.info({
                requestId,
                bufferSize: buffer.length,
                operation: 'textExtraction'
            }, 'Extracting text from PDF');
            // pdf-parse CJS/ESM farklı paketleme şekillerine karşı dayanıklı çözüm
            let parseFn = null;
            const tryResolve = (mod) => {
                if (!mod)
                    return null;
                if (typeof mod === 'function')
                    return mod;
                if (typeof mod.default === 'function')
                    return mod.default;
                if (mod.default && typeof mod.default.default === 'function')
                    return mod.default.default;
                if (typeof mod.pdfParse === 'function')
                    return mod.pdfParse;
                return null;
            };
            // 1) require('pdf-parse') farklı varyantlar
            parseFn = tryResolve(pdfModule);
            // 2) Alternatif yol: pdf-parse/lib/pdf-parse
            if (!parseFn) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-var-requires
                    const alt = require('pdf-parse/lib/pdf-parse');
                    parseFn = tryResolve(alt);
                }
                catch { }
            }
            // 3) Dynamic import fallback (ESM ortamları)
            if (!parseFn) {
                try {
                    const dyn = await Promise.resolve().then(() => __importStar(require('pdf-parse')));
                    parseFn = tryResolve(dyn);
                }
                catch { }
            }
            if (!parseFn) {
                throw new Error('pdf-parse modülü beklenen bir fonksiyon döndürmedi');
            }
            // Sadece gerekli minimum parametrelerle çağır
            const pdfData = await parseFn(buffer);
            logger_1.logger.info({
                requestId,
                pageCount: pdfData.numpages,
                textLength: pdfData.text.length,
                wordCount: pdfData.text.split(/\s+/).length,
                operation: 'textExtraction'
            }, 'Text extraction completed successfully');
            return pdfData;
        }
        catch (error) {
            logger_1.logger.error({
                requestId,
                err: error,
                bufferSize: buffer.length,
                operation: 'textExtraction'
            }, 'Failed to extract text from PDF');
            throw new Error(`PDF'den metin çıkarılamadı: ${error.message}`);
        }
    }
    /**
     * OpenAI ile özet oluştur
     */
    static async generateSummary(text, requestId) {
        try {
            logger_1.logger.info({
                requestId,
                textLength: text.length,
                operation: 'summaryGeneration'
            }, 'Generating PDF summary with OpenAI');
            // Metin çok uzunsa kısalt (OpenAI token limiti için)
            const maxLength = Number(process.env.PDF_SUMMARY_MAX_CHARS || 8000);
            const truncatedText = text.length > maxLength
                ? text.substring(0, maxLength) + '...'
                : text;
            const openaiResponse = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'Sen bir PDF özetleme uzmanısın. Verilen PDF içeriğini Türkçe olarak özetle. Özeti kısa, öz ve anlaşılır tut. Ana noktaları vurgula.'
                    },
                    {
                        role: 'user',
                        content: `Bu PDF dosyasının içeriğini özetle:\n\n${truncatedText}`
                    }
                ],
                max_tokens: Number(process.env.PDF_SUMMARY_MAX_TOKENS || 600),
                temperature: Number(process.env.PDF_SUMMARY_TEMPERATURE || 0.5)
            }, {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 60000 // 60 saniye timeout
            });
            const summary = openaiResponse.data.choices?.[0]?.message?.content?.trim();
            if (!summary) {
                throw new Error('OpenAI\'dan özet alınamadı');
            }
            logger_1.logger.info({
                requestId,
                summaryLength: summary.length,
                operation: 'summaryGeneration'
            }, 'PDF summary generated successfully');
            return summary;
        }
        catch (error) {
            logger_1.logger.error({
                requestId,
                err: error,
                textLength: text.length,
                operation: 'summaryGeneration'
            }, 'Failed to generate PDF summary');
            throw new Error(`Özet oluşturulamadı: ${error.message}`);
        }
    }
    /**
     * PDF dosyasının geçerliliğini kontrol et
     */
    static async validatePDF(fileUrl) {
        try {
            const response = await axios_1.default.head(fileUrl, {
                timeout: 10000,
                maxContentLength: 25 * 1024 * 1024
            });
            const contentType = response.headers['content-type'];
            const contentLength = parseInt(response.headers['content-length'] || '0');
            // PDF dosyası mı kontrol et
            if (!contentType?.includes('application/pdf')) {
                return false;
            }
            // Boyut kontrolü (25MB)
            if (contentLength > 25 * 1024 * 1024) {
                return false;
            }
            return true;
        }
        catch (error) {
            logger_1.logger.error({
                err: error,
                fileUrl,
                operation: 'pdfValidation'
            }, 'PDF validation failed');
            return false;
        }
    }
}
exports.PDFService = PDFService;
