import axios from 'axios';
import pdf from 'pdf-parse';
import { StandardResponse, ResponseBuilder } from '../types/response';
import { logger } from '../utils/logger';

export interface PDFSummaryRequest {
  fileUrl: string;
  userId: string;
  chatId: string;
}

export interface PDFSummaryResponse {
  summary: string;
  pageCount: number;
  wordCount: number;
  extractedText: string;
  processingTime: number;
}

export class PDFService {
  /**
   * PDF'den metin çıkar ve özet oluştur
   */
  static async extractAndSummarizePDF(request: PDFSummaryRequest): Promise<StandardResponse<PDFSummaryResponse>> {
    const requestId = Math.random().toString(36).substring(7);
    const startTime = Date.now();
    
    try {
      logger.info({
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
        logger.warn({
          requestId,
          textLength: pdfData.text.length,
          operation: 'pdfExtraction'
        }, 'PDF text too short for summarization');
        
        return ResponseBuilder.error(
          'pdf_text_too_short',
          'PDF dosyasından yeterli metin çıkarılamadı. Dosya boş veya taranmış resim olabilir.'
        );
      }

      // OpenAI ile özet oluştur
      const summary = await this.generateSummary(pdfData.text, requestId);
      
      const processingTime = Date.now() - startTime;
      
      logger.info({
        requestId,
        userId: request.userId,
        chatId: request.chatId,
        pageCount: pdfData.numpages,
        wordCount: pdfData.text.split(/\s+/).length,
        summaryLength: summary.length,
        processingTime,
        operation: 'pdfExtraction'
      }, 'PDF extraction and summarization completed successfully');

      return ResponseBuilder.success({
        summary,
        pageCount: pdfData.numpages,
        wordCount: pdfData.text.split(/\s+/).length,
        extractedText: pdfData.text,
        processingTime
      }, 'PDF başarıyla özetlendi');

    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      logger.error({
        requestId,
        err: error,
        userId: request.userId,
        chatId: request.chatId,
        fileUrl: request.fileUrl,
        processingTime,
        operation: 'pdfExtraction'
      }, 'PDF extraction and summarization failed');
      
      return ResponseBuilder.error(
        'pdf_extraction_failed',
        error.message || 'PDF işleme sırasında hata oluştu'
      );
    }
  }

  /**
   * PDF dosyasını indir
   */
  private static async downloadPDF(fileUrl: string, requestId: string): Promise<Buffer> {
    try {
      logger.info({
        requestId,
        fileUrl,
        operation: 'pdfDownload'
      }, 'Downloading PDF file');

      const response = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
        timeout: 30000, // 30 saniye timeout
        maxContentLength: 25 * 1024 * 1024, // 25MB limit
      });

      const buffer = Buffer.from(response.data);
      
      logger.info({
        requestId,
        fileSize: buffer.length,
        fileSizeMB: (buffer.length / (1024 * 1024)).toFixed(2),
        operation: 'pdfDownload'
      }, 'PDF file downloaded successfully');

      return buffer;

    } catch (error: any) {
      logger.error({
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
  private static async extractTextFromPDF(buffer: Buffer, requestId: string): Promise<any> {
    try {
      logger.info({
        requestId,
        bufferSize: buffer.length,
        operation: 'textExtraction'
      }, 'Extracting text from PDF');

      const pdfData = await pdf(buffer, {
        // PDF parsing seçenekleri
        max: 0, // Tüm sayfaları işle
        version: 'v1.10.100', // PDF.js versiyonu
      });

      logger.info({
        requestId,
        pageCount: pdfData.numpages,
        textLength: pdfData.text.length,
        wordCount: pdfData.text.split(/\s+/).length,
        operation: 'textExtraction'
      }, 'Text extraction completed successfully');

      return pdfData;

    } catch (error: any) {
      logger.error({
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
  private static async generateSummary(text: string, requestId: string): Promise<string> {
    try {
      logger.info({
        requestId,
        textLength: text.length,
        operation: 'summaryGeneration'
      }, 'Generating PDF summary with OpenAI');

      // Metin çok uzunsa kısalt (OpenAI token limiti için)
      const maxLength = 15000; // ~4000 token
      const truncatedText = text.length > maxLength 
        ? text.substring(0, maxLength) + '...' 
        : text;

      const openaiResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
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
        max_tokens: 1000,
        temperature: 0.7
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

      logger.info({
        requestId,
        summaryLength: summary.length,
        operation: 'summaryGeneration'
      }, 'PDF summary generated successfully');

      return summary;

    } catch (error: any) {
      logger.error({
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
  static async validatePDF(fileUrl: string): Promise<boolean> {
    try {
      const response = await axios.head(fileUrl, {
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

    } catch (error) {
      logger.error({
        err: error,
        fileUrl,
        operation: 'pdfValidation'
      }, 'PDF validation failed');
      
      return false;
    }
  }
}
