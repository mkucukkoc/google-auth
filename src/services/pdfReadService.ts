import axios from 'axios';
import FormData from 'form-data';
import { StandardResponse, ResponseBuilder } from '../types/response';
import { logger } from '../utils/logger';
import { config } from '../config';
import { PDFService } from './pdfService';

export interface PPTThemePayload {
  mode?: 'light' | 'dark';
  primary?: string;
  secondary?: string;
  accent?: string;
  title_font?: string;
  body_font?: string;
}

export interface BrandKitPayload {
  primary?: string;
  secondary?: string;
  accent?: string;
  title_font?: string;
  body_font?: string;
  logo_url?: string;
}

export interface PPTAdvancedPayload {
  prompt: string;
  language?: 'tr' | 'en';
  audience?: string;
  purpose?: string;
  title?: string;
  outline?: string[];
  slide_goal?: number;
  charts_allowed?: boolean;
  image_policy?: 'generate' | 'none';
  image_style?: string;
  speaker_notes?: boolean;
  aspect_ratio?: '16:9' | '4:3';
  include_cover?: boolean;
  include_agenda?: boolean;
  include_summary?: boolean;
  include_qna?: boolean;
  include_closing?: boolean;
  slide_numbers?: boolean;
  header_text?: string;
  footer_text?: string;
  logo_url?: string;
  theme?: PPTThemePayload;
  brand_kit?: BrandKitPayload;
  references?: string[];
}

export interface DocAdvancedMargins {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

export interface DocAdvancedPayload {
  prompt: string;
  language?: 'tr' | 'en';
  title?: string;
  page_goal?: number;
  include_cover?: boolean;
  include_toc?: boolean;
  header_text?: string;
  footer_text?: string;
  page_numbers?: boolean;
  paper_size?: string;
  orientation?: 'portrait' | 'landscape';
  margins_mm?: DocAdvancedMargins;
  font?: string;
  font_size_pt?: number;
  line_spacing?: number;
  outline?: string[];
  references?: string[];
  reference_style?: string;
  watermark_text?: string;
}

export class PDFReadService {
  private static readonly PDFREAD_BASE_URL = config.api.pdfRead.baseUrl;
  private static readonly PDFREAD_FALLBACK_BASE_URL = config.api.pdfRead.fallbackBaseUrl;
  private static readonly PDFREAD_API_BASE_PATH = '/api/v1/pdfread';
  private static readonly PDFREAD_API_KEY = config.api.pdfRead.apiKey;
  private static readonly MAX_RETRIES = 1;
  private static readonly ALLOWED_BASE_HOSTS = new Set<string>([
    'google-auth-e4er.onrender.com',
    'avenia.onrender.com'
  ]);
  private static readonly AVENIA_BASE_URL = 'https://avenia.onrender.com';
  private static readonly AVENIA_ENDPOINTS: string[] = [
    '/generate-video',
    '/generate-video-prompt',
    '/summarize',
    '/ask-question',
    '/summarize-pdf-url',
    '/summarize-word-url',
    '/summarize-excel-url',
    '/summarize-ppt-url',
    '/summarize-html-url',
    '/summarize-json-url',
    '/summarize-csv-url',
    '/summarize-txt-url',
    '/generate-doc',
    '/generate-doc-advanced',
    '/generate-excel',
    '/generate-ppt',
    '/generate-ppt-advanced',
    '/audio-isolation',
    '/stt',
    '/tts-chat',
    '/ask-with-embeddings',
    '/search-docs',
    '/export-chat',
    '/healthz',
    '/analyze-image',
    '/analyze-video',
    '/check-ai',
    '/pdf-to-word',
    '/pdf-to-excel',
    '/pdf-to-ppt',
    '/word-to-pdf',
    '/ppt-to-pdf',
    '/excel-to-pdf'
  ];

  private static isAllowedBaseUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return this.ALLOWED_BASE_HOSTS.has(parsed.hostname);
    } catch (error) {
      logger.warn(
        {
          err: error,
          url,
          operation: 'pdfread_invalid_base_url'
        },
        'Ignoring invalid PDFRead base URL'
      );
      return false;
    }
  }

  private static normalizeBaseUrl(url: string): string {
    const trimmed = url.replace(/\/+$/, '');
    if (!trimmed) {
      return trimmed;
    }

    if (trimmed.endsWith(this.PDFREAD_API_BASE_PATH)) {
      return trimmed;
    }

    return `${trimmed}${this.PDFREAD_API_BASE_PATH}`;
  }

  private static normalizeEndpointPath(path: string): string {
    if (!path) {
      return '/';
    }

    const trimmed = path.trim();
    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    const withoutTrailing = withLeadingSlash.replace(/\/+$/, '');

    return withoutTrailing || '/';
  }

  private static getBaseUrls(): string[] {
    const urls = [this.PDFREAD_BASE_URL, this.PDFREAD_FALLBACK_BASE_URL]
      .filter((url): url is string => Boolean(url && url.trim()))
      .map((url) => url.replace(/\/+$/, ''))
      .filter((url): url is string => Boolean(url))
      .map((url) => this.normalizeBaseUrl(url))
      .filter((url) => this.isAllowedBaseUrl(url));

    if (!urls.length) {
      logger.warn(
        {
          configuredEndpoints: [this.PDFREAD_BASE_URL, this.PDFREAD_FALLBACK_BASE_URL],
          allowedHosts: Array.from(this.ALLOWED_BASE_HOSTS),
          operation: 'pdfread_no_allowed_endpoints'
        },
        'No allowed PDFRead endpoints configured'
      );
    }

    return [...new Set(urls)];
  }

  private static getAveniaBaseUrls(): string[] {
    const baseUrl = this.AVENIA_BASE_URL?.trim();
    if (!baseUrl) {
      return [];
    }

    const normalized = baseUrl.replace(/\/+$/, '');
    if (!normalized) {
      return [];
    }
    if (!this.isAllowedBaseUrl(normalized)) {
      logger.warn(
        {
          configuredEndpoint: baseUrl,
          normalizedEndpoint: normalized,
          allowedHosts: Array.from(this.ALLOWED_BASE_HOSTS),
          operation: 'pdfread_special_endpoint_invalid_base'
        },
        'Avenia base URL is not allowed, skipping'
      );
      return [];
    }

    return [normalized];
  }

  private static shouldUseAveniaBase(path: string): boolean {
    const normalizedPath = this.normalizeEndpointPath(path);
    return this.AVENIA_ENDPOINTS.some(
      (endpoint) => this.normalizeEndpointPath(endpoint) === normalizedPath
    );
  }

  private static resolveBaseUrls(path: string): string[] {
    if (this.shouldUseAveniaBase(path)) {
      const aveniaBaseUrls = this.getAveniaBaseUrls();
      if (aveniaBaseUrls.length) {
        return aveniaBaseUrls;
      }

      logger.warn(
        {
          path: this.normalizeEndpointPath(path),
          operation: 'pdfread_special_endpoint_fallback'
        },
        'Falling back to default PDFRead endpoints for special path'
      );
    }

    return this.getBaseUrls();
  }

  private static async requestWithFallback(
    method: 'post' | 'get',
    path: string,
    data: any,
    axiosConfig: any
  ): Promise<any> {
    const baseUrls = this.resolveBaseUrls(path);
    const attemptLimit = Math.min(baseUrls.length, this.MAX_RETRIES + 1);
    const attemptUrls = baseUrls.slice(0, attemptLimit);
    if (baseUrls.length > attemptUrls.length) {
      logger.warn(
        {
          configuredEndpoints: baseUrls,
          attemptLimit,
          operation: 'pdfread_request_retry_limit'
        },
        'PDFRead retry limit reached, extra endpoints skipped'
      );
    }
    let lastError: any = null;

    for (let index = 0; index < attemptUrls.length; index += 1) {
      const baseUrl = attemptUrls[index];
      try {
        if (method === 'post') {
          return await axios.post(`${baseUrl}${path}`, data, axiosConfig);
        }

        return await axios.get(`${baseUrl}${path}`, axiosConfig);
      } catch (error: any) {
        lastError = error;
        const status = error?.response?.status;
        const isLastAttempt = index === attemptUrls.length - 1;
        if (status === 429) {
          logger.warn(
            {
              baseUrl,
              status,
              path,
              method,
              errorMessage: error?.message,
              operation: 'pdfread_request_rate_limited'
            },
            'PDFRead request hit rate limit, skipping further retries'
          );

          throw error;
        }

        const retryStatuses = [404, 408, 429, 500, 502, 503, 504];
        const shouldRetry = !isLastAttempt && (!status || retryStatuses.includes(status));

        if (!shouldRetry) {
          throw error;
        }

        logger.warn(
          {
            baseUrl,
            status,
            path,
            method,
            errorMessage: error?.message,
            operation: 'pdfread_request_fallback'
          },
          'Primary PDFRead endpoint failed, retrying with fallback'
        );
      }
    }

    throw lastError;
  }

  private static postWithFallback(
    path: string,
    data: any,
    axiosConfig: any
  ): Promise<any> {
    return this.requestWithFallback('post', path, data, axiosConfig);
  }

  private static getWithFallback(
    path: string,
    axiosConfig: any
  ): Promise<any> {
    return this.requestWithFallback('get', path, null, axiosConfig);
  }

  private static appendFile(
    formData: FormData,
    file: Buffer,
    filename: string,
    mimeType?: string
  ) {
    const options: { filename: string; contentType?: string } = { filename };
    if (mimeType) {
      options.contentType = mimeType;
    }
    formData.append('file', file, options);
  }

  private static applyUserAuthHeaders(
    baseHeaders: Record<string, string>,
    authToken?: string
  ): Record<string, string> {
    if (!authToken) {
      return baseHeaders;
    }

    if (this.PDFREAD_API_KEY) {
      return {
        ...baseHeaders,
        'X-User-Token': authToken
      };
    }

    return {
      ...baseHeaders,
      Authorization: `Bearer ${authToken}`
    };
  }

  private static buildMultipartConfig(
    formData: FormData,
    timeout: number,
    options?: { authToken?: string }
  ) {
    const headers = {
      ...formData.getHeaders(),
      ...(this.PDFREAD_API_KEY ? { Authorization: `Bearer ${this.PDFREAD_API_KEY}` } : {})
    } as Record<string, string>;

    return {
      headers: this.applyUserAuthHeaders(headers, options?.authToken),
      timeout
    };
  }

  private static buildJsonConfig(timeout: number, options?: { authToken?: string }) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.PDFREAD_API_KEY ? { Authorization: `Bearer ${this.PDFREAD_API_KEY}` } : {})
    };

    return {
      headers: this.applyUserAuthHeaders(headers, options?.authToken),
      timeout
    };
  }

  /**
   * PDF dosyasını özetler
   */
  static async summarizePDF(file: Buffer, filename: string): Promise<StandardResponse<any>> {
    try {
      const formData = new FormData();
      this.appendFile(formData, file, filename);

      const response = await this.postWithFallback(
        '/summarize',
        formData,
        this.buildMultipartConfig(formData, 30000)
      );

      logger.info({ filename, fileSize: file.length }, 'PDF summarized successfully');
      return ResponseBuilder.success(response.data, 'PDF summarized successfully');
    } catch (error: any) {
      logger.error({ 
        err: error, 
        filename, 
        fileSize: file.length,
        operation: 'summarizePDF'
      }, 'PDF summarize error');
      return ResponseBuilder.error(
        'pdf_summarize_failed',
        error.response?.data?.detail || 'Failed to summarize PDF'
      );
    }
  }

  /**
   * PDF'den soru-cevap yapar
   */
  static async askPDFQuestion(pdfText: string, question: string): Promise<StandardResponse<any>> {
    try {
      const formData = new FormData();
      formData.append('pdf_text', pdfText);
      formData.append('question', question);

      const response = await this.postWithFallback(
        '/ask-question',
        formData,
        this.buildMultipartConfig(formData, 30000)
      );

      logger.info({ 
        questionLength: question.length, 
        pdfTextLength: pdfText.length 
      }, 'PDF question answered successfully');
      return ResponseBuilder.success(response.data, 'PDF question answered successfully');
    } catch (error: any) {
      logger.error({ 
        err: error, 
        questionLength: question.length,
        pdfTextLength: pdfText.length,
        operation: 'askPDFQuestion'
      }, 'PDF question error');
      return ResponseBuilder.error(
        'pdf_question_failed',
        error.response?.data?.detail || 'Failed to answer PDF question'
      );
    }
  }

  /**
   * AI belge tespiti yapar
   */
  static async detectAIDocument(file: Buffer, filename: string, mimeType: string): Promise<StandardResponse<any>> {
    try {
      const formData = new FormData();
      this.appendFile(formData, file, filename, mimeType);
      formData.append('mime_type', mimeType);

      const response = await this.postWithFallback(
        '/check-ai',
        formData,
        this.buildMultipartConfig(formData, 30000)
      );

      return ResponseBuilder.success(response.data, 'AI document detection completed');
    } catch (error: any) {
      logger.error({ err: error, filename, mimeType, operation: 'detectAIDocument' }, 'AI document detection error');
      return ResponseBuilder.error(
        'ai_detection_failed',
        error.response?.data?.detail || 'Failed to detect AI document'
      );
    }
  }

  /**
   * Görsel analizi yapar
   */
  static async analyzeImage(imageBase64: string): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback(
        '/analyze-image',
        {
          image_base64: imageBase64
        },
        this.buildJsonConfig(30000)
      );

      return ResponseBuilder.success(response.data, 'Image analysis completed');
    } catch (error: any) {
      logger.error({ err: error, imageSize: imageBase64.length, operation: 'analyzeImage' }, 'Image analysis error');
      return ResponseBuilder.error(
        'image_analysis_failed',
        error.response?.data?.detail || 'Failed to analyze image'
      );
    }
  }

  /**
   * PDF'den Word'e dönüştürür
   */
  static async pdfToWord(file: Buffer, filename: string): Promise<StandardResponse<any>> {
    try {
      const formData = new FormData();
      this.appendFile(formData, file, filename);

      const response = await this.postWithFallback(
        '/pdf-to-word',
        formData,
        this.buildMultipartConfig(formData, 60000)
      );

      return ResponseBuilder.success(response.data, 'PDF converted to Word successfully');
    } catch (error: any) {
      logger.error({ err: error, filename, operation: 'pdfToWord' }, 'PDF to Word error');
      return ResponseBuilder.error(
        'pdf_to_word_failed',
        error.response?.data?.detail || 'Failed to convert PDF to Word'
      );
    }
  }

  /**
   * PDF'den Excel'e dönüştürür
   */
  static async pdfToExcel(file: Buffer, filename: string): Promise<StandardResponse<any>> {
    try {
      const formData = new FormData();
      this.appendFile(formData, file, filename);

      const response = await this.postWithFallback(
        '/pdf-to-excel',
        formData,
        this.buildMultipartConfig(formData, 60000)
      );

      return ResponseBuilder.success(response.data, 'PDF converted to Excel successfully');
    } catch (error: any) {
      logger.error({ err: error, filename, operation: 'pdfToExcel' }, 'PDF to Excel error');
      return ResponseBuilder.error(
        'pdf_to_excel_failed',
        error.response?.data?.detail || 'Failed to convert PDF to Excel'
      );
    }
  }

  /**
   * PDF'den PPT'e dönüştürür
   */
  static async pdfToPPT(file: Buffer, filename: string): Promise<StandardResponse<any>> {
    try {
      const formData = new FormData();
      this.appendFile(formData, file, filename);

      const response = await this.postWithFallback(
        '/pdf-to-ppt',
        formData,
        this.buildMultipartConfig(formData, 60000)
      );

      return ResponseBuilder.success(response.data, 'PDF converted to PPT successfully');
    } catch (error: any) {
      logger.error({ err: error, filename, operation: 'pdfToPPT' }, 'PDF to PPT error');
      return ResponseBuilder.error(
        'pdf_to_ppt_failed',
        error.response?.data?.detail || 'Failed to convert PDF to PPT'
      );
    }
  }

  /**
   * Word'den PDF'e dönüştürür
   */
  static async wordToPDF(file: Buffer, filename: string): Promise<StandardResponse<any>> {
    try {
      const formData = new FormData();
      this.appendFile(formData, file, filename);

      const response = await this.postWithFallback(
        '/word-to-pdf',
        formData,
        this.buildMultipartConfig(formData, 60000)
      );

      return ResponseBuilder.success(response.data, 'Word converted to PDF successfully');
    } catch (error: any) {
      logger.error({ err: error, filename, operation: 'wordToPDF' }, 'Word to PDF error');
      return ResponseBuilder.error(
        'word_to_pdf_failed',
        error.response?.data?.detail || 'Failed to convert Word to PDF'
      );
    }
  }

  /**
   * Excel'den PDF'e dönüştürür
   */
  static async excelToPDF(file: Buffer, filename: string): Promise<StandardResponse<any>> {
    try {
      const formData = new FormData();
      this.appendFile(formData, file, filename);

      const response = await this.postWithFallback(
        '/excel-to-pdf',
        formData,
        this.buildMultipartConfig(formData, 60000)
      );

      return ResponseBuilder.success(response.data, 'Excel converted to PDF successfully');
    } catch (error: any) {
      logger.error({ err: error, filename, operation: 'excelToPDF' }, 'Excel to PDF error');
      return ResponseBuilder.error(
        'excel_to_pdf_failed',
        error.response?.data?.detail || 'Failed to convert Excel to PDF'
      );
    }
  }

  /**
   * PPT'den PDF'e dönüştürür
  */
  static async pptToPDF(file: Buffer, filename: string): Promise<StandardResponse<any>> {
    try {
      const formData = new FormData();
      this.appendFile(formData, file, filename);

      const response = await this.postWithFallback(
        '/ppt-to-pdf',
        formData,
        this.buildMultipartConfig(formData, 60000)
      );

      return ResponseBuilder.success(response.data, 'PPT converted to PDF successfully');
    } catch (error: any) {
      logger.error({ err: error, filename, operation: 'pptToPDF' }, 'PPT to PDF error');
      return ResponseBuilder.error(
        'ppt_to_pdf_failed',
        error.response?.data?.detail || 'Failed to convert PPT to PDF'
      );
    }
  }

  /**
   * Word belgesi oluşturur
  */
  static async generateDoc(prompt: string): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback(
        '/generate/doc',
        {
          prompt
        },
        this.buildJsonConfig(60000)
      );

      return ResponseBuilder.success(response.data, 'Word document generated successfully');
    } catch (error: any) {
      logger.error({ err: error, promptLength: prompt.length, operation: 'generateDoc' }, 'Generate doc error');
      return ResponseBuilder.error(
        'generate_doc_failed',
        error.response?.data?.detail || 'Failed to generate Word document'
      );
    }
  }

  /**
   * Excel belgesi oluşturur
  */
  static async generateExcel(prompt: string): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback(
        '/generate/excel',
        {
          prompt
        },
        this.buildJsonConfig(60000)
      );

      return ResponseBuilder.success(response.data, 'Excel document generated successfully');
    } catch (error: any) {
      logger.error({ err: error, promptLength: prompt.length, operation: 'generateExcel' }, 'Generate Excel error');
      return ResponseBuilder.error(
        'generate_excel_failed',
        error.response?.data?.detail || 'Failed to generate Excel document'
      );
    }
  }

  /**
   * PowerPoint belgesi oluşturur
  */
  static async generatePPT(prompt: string): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback(
        '/generate/ppt',
        {
          prompt
        },
        this.buildJsonConfig(60000)
      );

      return ResponseBuilder.success(response.data, 'PowerPoint document generated successfully');
    } catch (error: any) {
      logger.error({ err: error, promptLength: prompt.length, operation: 'generatePPT' }, 'Generate PPT error');
      return ResponseBuilder.error(
        'generate_ppt_failed',
        error.response?.data?.detail || 'Failed to generate PowerPoint document'
      );
    }
  }

  /**
   * Gelişmiş Word belgesi oluşturur
  */
  static async generateDocAdvanced(payload: DocAdvancedPayload): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback(
        '/generate/doc-advanced',
        payload,
        this.buildJsonConfig(60000)
      );

      return ResponseBuilder.success(response.data, 'Advanced Word document generated successfully');
    } catch (error: any) {
      const promptLength = payload?.prompt ? payload.prompt.length : 0;
      logger.error({ err: error, promptLength, operation: 'generateDocAdvanced' }, 'Generate advanced doc error');
      return ResponseBuilder.error(
        'generate_doc_advanced_failed',
        error.response?.data?.detail || 'Failed to generate advanced Word document'
      );
    }
  }

  /**
   * Gelişmiş PowerPoint belgesi oluşturur
  */
  static async generatePPTAdvanced(payload: PPTAdvancedPayload): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback(
        '/generate/ppt-advanced',
        payload,
        this.buildJsonConfig(60000)
      );

      return ResponseBuilder.success(response.data, 'Advanced PowerPoint document generated successfully');
    } catch (error: any) {
      const promptLength = payload?.prompt ? payload.prompt.length : 0;
      logger.error({ err: error, promptLength, operation: 'generatePPTAdvanced' }, 'Generate advanced PPT error');
      return ResponseBuilder.error(
        'generate_ppt_advanced_failed',
        error.response?.data?.detail || 'Failed to generate advanced PowerPoint document'
      );
    }
  }

  /**
   * Speech-to-Text (Ses metne çevirme)
   */
  static async speechToText(audioBase64: string): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback(
        '/speech-to-text',
        {
          base64: audioBase64
        },
        this.buildJsonConfig(30000)
      );

      return ResponseBuilder.success(response.data, 'Speech converted to text successfully');
    } catch (error: any) {
      logger.error({ err: error, audioSize: audioBase64.length, operation: 'speechToText' }, 'Speech to text error');
      return ResponseBuilder.error(
        'speech_to_text_failed',
        error.response?.data?.detail || 'Failed to convert speech to text'
      );
    }
  }

  /**
   * Text-to-Speech (Metin sese çevirme)
   */
  static async textToSpeech(messages: Array<{role: string, content: string}>): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback(
        '/text-to-speech',
        {
          messages
        },
        this.buildJsonConfig(30000)
      );

      return ResponseBuilder.success(response.data, 'Text converted to speech successfully');
    } catch (error: any) {
      logger.error({ err: error, messageCount: messages.length, operation: 'textToSpeech' }, 'Text to speech error');
      return ResponseBuilder.error(
        'text_to_speech_failed',
        error.response?.data?.detail || 'Failed to convert text to speech'
      );
    }
  }

  /**
   * Görsel açıklama oluşturur
   */
  static async imageCaption(imageBase64: string): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback(
        '/analyze-image',
        {
          image_base64: imageBase64
        },
        this.buildJsonConfig(30000)
      );

      return ResponseBuilder.success(response.data, 'Image caption generated successfully');
    } catch (error: any) {
      logger.error({ err: error, imageSize: imageBase64.length, operation: 'imageCaption' }, 'Image caption error');
      return ResponseBuilder.error(
        'image_caption_failed',
        error.response?.data?.detail || 'Failed to generate image caption'
      );
    }
  }

  /**
   * Video analizi yapar
   */
  static async analyzeVideo(videoBase64: string): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback(
        '/analyze-video',
        {
          video_base64: videoBase64
        },
        this.buildJsonConfig(60000)
      );

      return ResponseBuilder.success(response.data, 'Video analysis completed successfully');
    } catch (error: any) {
      logger.error({ err: error, videoSize: videoBase64.length, operation: 'analyzeVideo' }, 'Video analysis error');
      return ResponseBuilder.error(
        'video_analysis_failed',
        error.response?.data?.detail || 'Failed to analyze video'
      );
    }
  }

  /**
   * Audio isolation (Ses izolasyonu)
   */
  static async audioIsolation(audioBase64: string): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback(
        '/audio-isolation',
        {
          base64: audioBase64
        },
        this.buildJsonConfig(60000)
      );

      return ResponseBuilder.success(response.data, 'Audio isolation completed successfully');
    } catch (error: any) {
      logger.error({ err: error, audioSize: audioBase64.length, operation: 'audioIsolation' }, 'Audio isolation error');
      return ResponseBuilder.error(
        'audio_isolation_failed',
        error.response?.data?.detail || 'Failed to process audio isolation'
      );
    }
  }

  /**
   * Video üretir
   */
  static async generateVideo(prompt: string): Promise<StandardResponse<any>> {
    try {
      // 2 dakika timeout
      const response = await this.postWithFallback(
        '/generate-video',
        {
          prompt
        },
        this.buildJsonConfig(120000)
      );

      return ResponseBuilder.success(response.data, 'Video generated successfully');
    } catch (error: any) {
      logger.error({ err: error, promptLength: prompt.length, operation: 'generateVideo' }, 'Generate video error');
      return ResponseBuilder.error(
        'generate_video_failed',
        error.response?.data?.detail || 'Failed to generate video'
      );
    }
  }

  /**
   * Video prompt üretir
   */
  static async generateVideoPrompt(prompt: string): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback(
        '/generate-video-prompt',
        {
          prompt
        },
        this.buildJsonConfig(30000)
      );

      return ResponseBuilder.success(response.data, 'Video prompt generated successfully');
    } catch (error: any) {
      logger.error(
        { err: error, promptLength: prompt.length, operation: 'generateVideoPrompt' },
        'Generate video prompt error'
      );
      return ResponseBuilder.error(
        'generate_video_prompt_failed',
        error.response?.data?.detail || 'Failed to generate video prompt'
      );
    }
  }

  /**
   * Embeddings ile soru-cevap
   */
  static async askWithEmbeddings(question: string, chatId: string): Promise<StandardResponse<any>> {
    try {
      const formData = new FormData();
      formData.append('question', question);
      formData.append('chat_id', chatId);

      const response = await this.postWithFallback(
        '/ask-with-embeddings',
        formData,
        this.buildMultipartConfig(formData, 30000)
      );

      return ResponseBuilder.success(response.data, 'Question answered with embeddings successfully');
    } catch (error: any) {
      logger.error(
        { err: error, questionLength: question.length, chatId, operation: 'askWithEmbeddings' },
        'Ask with embeddings error'
      );
      return ResponseBuilder.error(
        'ask_with_embeddings_failed',
        error.response?.data?.detail || 'Failed to answer question with embeddings'
      );
    }
  }

  /**
   * Doküman arama
   */
  static async searchDocs(query: string, chatId: string): Promise<StandardResponse<any>> {
    try {
      const formData = new FormData();
      formData.append('query', query);
      formData.append('chat_id', chatId);

      const response = await this.postWithFallback(
        '/search-docs',
        formData,
        this.buildMultipartConfig(formData, 30000)
      );

      return ResponseBuilder.success(response.data, 'Document search completed successfully');
    } catch (error: any) {
      logger.error({ err: error, queryLength: query.length, chatId, operation: 'searchDocs' }, 'Search docs error');
      return ResponseBuilder.error(
        'search_docs_failed',
        error.response?.data?.detail || 'Failed to search documents'
      );
    }
  }

  /**
   * URL'den PDF özetleme
   */
  static async summarizePDFUrl(
    url: string,
    options?: {
      authToken?: string;
      userId?: string;
      chatId?: string;
    }
  ): Promise<StandardResponse<any>> {
    try {
      const requestConfig = this.buildJsonConfig(120000, { authToken: options?.authToken });

      const payload: Record<string, unknown> = { url };

      if (options?.userId) {
        payload.user_id = options.userId;
      }

      if (options?.chatId) {
        payload.chat_id = options.chatId;
      }

      const response = await this.postWithFallback(
        '/summarize-pdf-url',
        payload,
        requestConfig
      );

      return ResponseBuilder.success(response.data, 'PDF URL summarized successfully');
    } catch (error: any) {
      const fallbackResult = await this.handleSummarizePdfUrlFallback(error, url, options);
      if (fallbackResult) {
        return fallbackResult;
      }

      logger.error({ err: error, url, operation: 'summarizePDFUrl' }, 'Summarize PDF URL error');
      return ResponseBuilder.error(
        'summarize_pdf_url_failed',
        error.response?.data?.detail || 'Failed to summarize PDF URL'
      );
    }
  }

  private static shouldUseInternalPdfFallback(error: any): boolean {
    const status = error?.response?.status;

    if (!status) {
      // Ağ hataları için fallback dene
      return true;
    }

    return [408, 429, 500, 502, 503, 504].includes(status);
  }

  private static async handleSummarizePdfUrlFallback(
    error: any,
    url: string,
    options?: { userId?: string; chatId?: string }
  ): Promise<StandardResponse<any> | null> {
    if (!this.shouldUseInternalPdfFallback(error)) {
      return null;
    }

    try {
      const fallbackResult = await PDFService.extractAndSummarizePDF({
        fileUrl: url,
        userId: options?.userId || 'unknown',
        chatId: options?.chatId || 'unknown'
      });

      if (!fallbackResult.success) {
        logger.error(
          {
            url,
            userId: options?.userId,
            chatId: options?.chatId,
            fallbackError: fallbackResult.error,
            operation: 'summarizePDFUrlFallback'
          },
          'Internal PDF summary fallback failed'
        );
      } else {
        logger.warn(
          {
            url,
            userId: options?.userId,
            chatId: options?.chatId,
            operation: 'summarizePDFUrlFallback'
          },
          'PDF summary completed via internal fallback'
        );
      }

      return fallbackResult;
    } catch (fallbackError: any) {
      logger.error(
        {
          err: fallbackError,
          url,
          userId: options?.userId,
          chatId: options?.chatId,
          operation: 'summarizePDFUrlFallback'
        },
        'Internal PDF summary fallback threw an exception'
      );

      return null;
    }
  }

  /**
   * URL'den Word özetleme
   */
  static async summarizeWordUrl(
    url: string,
    options?: {
      authToken?: string;
    }
  ): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback('/summarize-word-url', {
        url
      },
        this.buildJsonConfig(60000, { authToken: options?.authToken })
      );

      return ResponseBuilder.success(response.data, 'Word URL summarized successfully');
    } catch (error: any) {
      logger.error({ err: error, url, operation: 'summarizeWordUrl' }, 'Summarize Word URL error');
      return ResponseBuilder.error(
        'summarize_word_url_failed',
        error.response?.data?.detail || 'Failed to summarize Word URL'
      );
    }
  }

  /**
   * URL'den Excel özetleme
   */
  static async summarizeExcelUrl(
    url: string,
    options?: {
      authToken?: string;
    }
  ): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback('/summarize-excel-url', {
        url
      },
        this.buildJsonConfig(60000, { authToken: options?.authToken })
      );

      return ResponseBuilder.success(response.data, 'Excel URL summarized successfully');
    } catch (error: any) {
      logger.error({ err: error, url, operation: 'summarizeExcelUrl' }, 'Summarize Excel URL error');
      return ResponseBuilder.error(
        'summarize_excel_url_failed',
        error.response?.data?.detail || 'Failed to summarize Excel URL'
      );
    }
  }

  /**
   * URL'den PPT özetleme
   */
  static async summarizePPTUrl(
    url: string,
    options?: {
      authToken?: string;
    }
  ): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback('/summarize-ppt-url', {
        url
      },
        this.buildJsonConfig(60000, { authToken: options?.authToken })
      );

      return ResponseBuilder.success(response.data, 'PPT URL summarized successfully');
    } catch (error: any) {
      logger.error({ err: error, url, operation: 'summarizePPTUrl' }, 'Summarize PPT URL error');
      return ResponseBuilder.error(
        'summarize_ppt_url_failed',
        error.response?.data?.detail || 'Failed to summarize PPT URL'
      );
    }
  }

  /**
   * URL'den HTML özetleme
   */
  static async summarizeHTMLUrl(
    url: string,
    options?: {
      authToken?: string;
    }
  ): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback('/summarize-html-url', {
        url
      },
        this.buildJsonConfig(60000, { authToken: options?.authToken })
      );

      return ResponseBuilder.success(response.data, 'HTML URL summarized successfully');
    } catch (error: any) {
      logger.error({ err: error, url, operation: 'summarizeHTMLUrl' }, 'Summarize HTML URL error');
      return ResponseBuilder.error(
        'summarize_html_url_failed',
        error.response?.data?.detail || 'Failed to summarize HTML URL'
      );
    }
  }

  /**
   * URL'den JSON özetleme
   */
  static async summarizeJSONUrl(
    url: string,
    options?: {
      authToken?: string;
    }
  ): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback('/summarize-json-url', {
        url
      },
        this.buildJsonConfig(60000, { authToken: options?.authToken })
      );

      return ResponseBuilder.success(response.data, 'JSON URL summarized successfully');
    } catch (error: any) {
      logger.error({ err: error, url, operation: 'summarizeJSONUrl' }, 'Summarize JSON URL error');
      return ResponseBuilder.error(
        'summarize_json_url_failed',
        error.response?.data?.detail || 'Failed to summarize JSON URL'
      );
    }
  }

  /**
   * URL'den CSV özetleme
   */
  static async summarizeCSVUrl(
    url: string,
    options?: {
      authToken?: string;
    }
  ): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback('/summarize-csv-url', {
        url
      },
        this.buildJsonConfig(60000, { authToken: options?.authToken })
      );

      return ResponseBuilder.success(response.data, 'CSV URL summarized successfully');
    } catch (error: any) {
      logger.error({ err: error, url, operation: 'summarizeCSVUrl' }, 'Summarize CSV URL error');
      return ResponseBuilder.error(
        'summarize_csv_url_failed',
        error.response?.data?.detail || 'Failed to summarize CSV URL'
      );
    }
  }

  /**
   * URL'den TXT özetleme
   */
  static async summarizeTXTUrl(
    url: string,
    options?: {
      authToken?: string;
    }
  ): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback('/summarize-txt-url', {
        url
      },
        this.buildJsonConfig(60000, { authToken: options?.authToken })
      );

      return ResponseBuilder.success(response.data, 'TXT URL summarized successfully');
    } catch (error: any) {
      logger.error({ err: error, url, operation: 'summarizeTXTUrl' }, 'Summarize TXT URL error');
      return ResponseBuilder.error(
        'summarize_txt_url_failed',
        error.response?.data?.detail || 'Failed to summarize TXT URL'
      );
    }
  }

  /**
   * Dosya soru-cevap
   */
  static async askFileQuestion(file: Buffer, filename: string, question: string, mimeType: string): Promise<StandardResponse<any>> {
    try {
      const formData = new FormData();
      this.appendFile(formData, file, filename, mimeType);
      formData.append('question', question);
      formData.append('mime_type', mimeType);

      const response = await this.postWithFallback(
        '/ask-question',
        formData,
        this.buildMultipartConfig(formData, 60000)
      );

      return ResponseBuilder.success(response.data, 'File question answered successfully');
    } catch (error: any) {
      logger.error(
        {
          err: error,
          filename,
          questionLength: question.length,
          mimeType,
          operation: 'askFileQuestion'
        },
        'Ask file question error'
      );
      return ResponseBuilder.error(
        'ask_file_question_failed',
        error.response?.data?.detail || 'Failed to answer file question'
      );
    }
  }

  /**
   * Chat export
   */
  static async exportChat(chatId: string, format: string = 'pdf'): Promise<StandardResponse<any>> {
    try {
      const response = await this.postWithFallback('/export-chat', {
        chat_id: chatId,
        format
      },
        this.buildJsonConfig(60000)
      );

      return ResponseBuilder.success(response.data, 'Chat exported successfully');
    } catch (error: any) {
      logger.error({ err: error, chatId, format, operation: 'exportChat' }, 'Export chat error');
      return ResponseBuilder.error(
        'export_chat_failed',
        error.response?.data?.detail || 'Failed to export chat'
      );
    }
  }

  /**
   * Health check
   */
  static async healthCheck(): Promise<StandardResponse<any>> {
    try {
      const response = await this.getWithFallback('/healthz', {
        timeout: 10000
      });

      return ResponseBuilder.success(response.data, 'PDFRead service is healthy');
    } catch (error: any) {
      logger.error({ err: error, operation: 'healthCheck' }, 'Health check error');
      return ResponseBuilder.error(
        'health_check_failed',
        error.response?.data?.detail || 'PDFRead service is not available'
      );
    }
  }
}
