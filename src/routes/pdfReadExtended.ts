import { Router, Request, Response } from 'express';
import multer from 'multer';
import { PDFReadService, PPTAdvancedPayload, DocAdvancedPayload } from '../services/pdfReadService';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import { validate, pdfReadSchemas } from '../middleware/validationMiddleware';
import { authRateLimits } from '../middleware/rateLimitMiddleware';
import { auditService } from '../services/auditService';
import { logger } from '../utils/logger';

// Multer configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg',
      'image/png',
      'image/gif',
      'text/plain',
      'video/mp4'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, XLSX, PPTX, images, videos, and text files are allowed.'));
    }
  }
});

export function createPDFReadExtendedRouter(): Router {
  const r = Router();

  // POST /pdfread/generate/doc
  r.post('/generate/doc',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.generateDoc),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { prompt } = req.body;

        const result = await PDFReadService.generateDoc(prompt);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_generate_doc',
          {
            promptLength: prompt.length,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'generateDoc' }, 'Generate doc error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to generate Word document'
        });
      }
    }
  );

  // POST /pdfread/generate/excel
  r.post('/generate/excel',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.generateDoc),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { prompt } = req.body;

        const result = await PDFReadService.generateExcel(prompt);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_generate_excel',
          {
            promptLength: prompt.length,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'generateExcel' }, 'Generate Excel error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to generate Excel document'
        });
      }
    }
  );

  // POST /pdfread/generate/ppt
  r.post('/generate/ppt',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.generateDoc),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { prompt } = req.body;

        const result = await PDFReadService.generatePPT(prompt);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_generate_ppt',
          {
            promptLength: prompt.length,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'generatePPT' }, 'Generate PPT error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to generate PowerPoint document'
        });
      }
    }
  );

  // POST /pdfread/generate/doc-advanced
  r.post('/generate/doc-advanced',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.generateDocAdvanced),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const payload = req.body as DocAdvancedPayload;
        const { prompt } = payload;
        const promptLength = prompt?.length ?? 0;

        const result = await PDFReadService.generateDocAdvanced(payload);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_generate_doc_advanced',
          {
            promptLength,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'generateDocAdvanced' }, 'Generate advanced doc error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to generate advanced Word document'
        });
      }
    }
  );

  // POST /pdfread/generate/ppt-advanced
  r.post('/generate/ppt-advanced',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.generatePPTAdvanced),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const payload = req.body as PPTAdvancedPayload;
        const { prompt } = payload;
        const promptLength = prompt?.length ?? 0;

        const result = await PDFReadService.generatePPTAdvanced(payload);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_generate_ppt_advanced',
          {
            promptLength,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'generatePPTAdvanced' }, 'Generate advanced PPT error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to generate advanced PowerPoint document'
        });
      }
    }
  );

  // POST /pdfread/speech-to-text
  r.post('/speech-to-text',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.speechToText),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { audioBase64 } = req.body;

        const result = await PDFReadService.speechToText(audioBase64);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_speech_to_text',
          {
            audioSize: audioBase64.length,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'speechToText' }, 'Speech to text error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to convert speech to text'
        });
      }
    }
  );

  // POST /pdfread/text-to-speech
  r.post('/text-to-speech',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.textToSpeech),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { messages } = req.body;

        const result = await PDFReadService.textToSpeech(messages);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_text_to_speech',
          {
            messageCount: messages.length,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'textToSpeech' }, 'Text to speech error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to convert text to speech'
        });
      }
    }
  );

  // POST /pdfread/image-caption
  r.post('/image-caption',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.analyzeImage),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { imageBase64 } = req.body;

        const result = await PDFReadService.imageCaption(imageBase64);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_image_caption',
          {
            imageSize: imageBase64.length,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'imageCaption' }, 'Image caption error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to generate image caption'
        });
      }
    }
  );

  // POST /pdfread/analyze-video
  r.post('/analyze-video',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.analyzeVideo),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { videoBase64, user_id, chat_id } = req.body;

        const result = await PDFReadService.analyzeVideo(videoBase64);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_analyze_video',
          {
            videoSize: videoBase64.length,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'analyzeVideo' }, 'Video analysis error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to analyze video'
        });
      }
    }
  );

  // POST /pdfread/generate-video
  r.post('/generate-video',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.generateDoc),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { prompt } = req.body;

        const result = await PDFReadService.generateVideo(prompt);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_generate_video',
          {
            promptLength: prompt.length,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'generateVideo' }, 'Generate video error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to generate video'
        });
      }
    }
  );

  // POST /pdfread/generate-video-prompt
  r.post('/generate-video-prompt',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.generateDoc),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { prompt } = req.body;

        const result = await PDFReadService.generateVideoPrompt(prompt);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_generate_video_prompt',
          {
            promptLength: prompt.length,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'generateVideoPrompt' }, 'Generate video prompt error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to generate video prompt'
        });
      }
    }
  );

  // POST /pdfread/ask-with-embeddings
  r.post('/ask-with-embeddings',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.askWithEmbeddings),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { question, chatId } = req.body;

        const result = await PDFReadService.askWithEmbeddings(question, chatId);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_ask_with_embeddings',
          {
            questionLength: question.length,
            chatId,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'askWithEmbeddings' }, 'Ask with embeddings error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to answer question with embeddings'
        });
      }
    }
  );

  // POST /pdfread/search-docs
  r.post('/search-docs',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.searchDocs),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { query, chatId } = req.body;

        const result = await PDFReadService.searchDocs(query, chatId);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_search_docs',
          {
            queryLength: query.length,
            chatId,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'searchDocs' }, 'Search docs error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to search documents'
        });
      }
    }
  );

  // POST /pdfread/summarize/pdf-url
  r.post('/summarize/pdf-url',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.summarizeUrl),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { url } = req.body;

        const result = await PDFReadService.summarizePDFUrl(url);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_summarize_pdf_url',
          {
            url,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'summarizePDFUrl' }, 'Summarize PDF URL error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to summarize PDF URL'
        });
      }
    }
  );

  // POST /pdfread/summarize/word-url
  r.post('/summarize/word-url',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.summarizeUrl),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { url } = req.body;

        const result = await PDFReadService.summarizeWordUrl(url);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_summarize_word_url',
          {
            url,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'summarizeWordUrl' }, 'Summarize Word URL error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to summarize Word URL'
        });
      }
    }
  );

  // POST /pdfread/summarize/excel-url
  r.post('/summarize/excel-url',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.summarizeUrl),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { url } = req.body;

        const result = await PDFReadService.summarizeExcelUrl(url);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_summarize_excel_url',
          {
            url,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'summarizeExcelUrl' }, 'Summarize Excel URL error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to summarize Excel URL'
        });
      }
    }
  );

  // POST /pdfread/summarize/ppt-url
  r.post('/summarize/ppt-url',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.summarizeUrl),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { url } = req.body;

        const result = await PDFReadService.summarizePPTUrl(url);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_summarize_ppt_url',
          {
            url,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'summarizePPTUrl' }, 'Summarize PPT URL error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to summarize PPT URL'
        });
      }
    }
  );

  // POST /pdfread/summarize/html-url
  r.post('/summarize/html-url',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.summarizeUrl),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { url } = req.body;

        const result = await PDFReadService.summarizeHTMLUrl(url);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_summarize_html_url',
          {
            url,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'summarizeHTMLUrl' }, 'Summarize HTML URL error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to summarize HTML URL'
        });
      }
    }
  );

  // POST /pdfread/summarize/json-url
  r.post('/summarize/json-url',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.summarizeUrl),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { url } = req.body;

        const result = await PDFReadService.summarizeJSONUrl(url);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_summarize_json_url',
          {
            url,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'summarizeJSONUrl' }, 'Summarize JSON URL error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to summarize JSON URL'
        });
      }
    }
  );

  // POST /pdfread/summarize/csv-url
  r.post('/summarize/csv-url',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.summarizeUrl),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { url } = req.body;

        const result = await PDFReadService.summarizeCSVUrl(url);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_summarize_csv_url',
          {
            url,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'summarizeCSVUrl' }, 'Summarize CSV URL error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to summarize CSV URL'
        });
      }
    }
  );

  // POST /pdfread/summarize/txt-url
  r.post('/summarize/txt-url',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.summarizeUrl),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { url } = req.body;

        const result = await PDFReadService.summarizeTXTUrl(url);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_summarize_txt_url',
          {
            url,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'summarizeTXTUrl' }, 'Summarize TXT URL error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to summarize TXT URL'
        });
      }
    }
  );

  // POST /pdfread/ask-file-question
  r.post('/ask-file-question',
    authRateLimits.general,
    authenticateToken,
    upload.single('file'),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        if (!req.file) {
          return res.status(400).json({
            error: 'no_file',
            message: 'No file uploaded'
          });
        }

        const { question } = req.body;

        const result = await PDFReadService.askFileQuestion(
          req.file.buffer,
          req.file.originalname,
          question,
          req.file.mimetype
        );

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_ask_file_question',
          {
            fileName: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            questionLength: question.length,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'askFileQuestion' }, 'Ask file question error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to answer file question'
        });
      }
    }
  );

  // POST /pdfread/export-chat
  r.post('/export-chat',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.exportChat),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { chatId, format } = req.body;

        const result = await PDFReadService.exportChat(chatId, format);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_export_chat',
          {
            chatId,
            format,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'exportChat' }, 'Export chat error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to export chat'
        });
      }
    }
  );

  // POST /pdfread/audio-isolation
  r.post('/audio-isolation',
    authRateLimits.general,
    authenticateToken,
    validate(pdfReadSchemas.audioIsolation),
    async (req: Request, res: Response) => {
      const authReq = req as unknown as AuthRequest;
      try {
        const { audioBase64 } = req.body;

        const result = await PDFReadService.audioIsolation(audioBase64);

        // Log the action
        await auditService.logUserAction(
          authReq.user!.id,
          'pdf_audio_isolation',
          {
            audioSize: audioBase64.length,
            success: result.success
          }
        );

        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }
      } catch (error) {
        logger.error({ err: error, userId: authReq.user!.id, operation: 'audioIsolation' }, 'Audio isolation error');
        res.status(500).json({
          error: 'internal_error',
          message: 'Failed to process audio isolation'
        });
      }
    }
  );

  // GET /pdfread/health
  r.get('/health',
    async (req: Request, res: Response) => {
      try {
        const result = await PDFReadService.healthCheck();

        if (result.success) {
          res.json(result);
        } else {
          res.status(503).json(result);
        }
      } catch (error) {
        logger.error({ err: error, operation: 'healthCheck' }, 'Health check error');
        res.status(503).json({
          error: 'service_unavailable',
          message: 'PDFRead service is not available'
        });
      }
    }
  );

  return r;
}
