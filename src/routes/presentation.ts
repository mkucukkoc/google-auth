import { Router, Request, Response } from 'express';
import { PresentationService, PresentationRequest } from '../services/presentationService';
import { authenticateToken, AuthRequest } from '../middleware/authMiddleware';
import { validate } from '../middleware/validationMiddleware';
import { presentationGenerateSchema } from '../validation/presentationSchemas';
import { authRateLimits } from '../middleware/rateLimitMiddleware';
import { auditService } from '../services/auditService';
import { logger } from '../utils/logger';

export function createPresentationRouter(): Router {
  const router = Router();

  /**
   * @swagger
   * /api/v1/presentation/generate:
   *   post:
   *     summary: Generate a professional presentation
   *     tags: [Presentation]
   *     security:
   *       - BearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - topic
   *               - language
   *               - audience
   *               - tone
   *             properties:
   *               topic:
   *                 type: string
   *                 description: Presentation topic
   *                 example: "AI-Powered Mobile App Backend"
   *               language:
   *                 type: string
   *                 enum: [tr, en, es, fr, de, it]
   *                 description: Presentation language
   *                 example: "tr"
   *               audience:
   *                 type: string
   *                 description: Target audience
   *                 example: "investors and business partners"
   *               tone:
   *                 type: string
   *                 description: Presentation tone
   *                 example: "professional and inspiring"
   *               slideCount:
   *                 type: number
   *                 minimum: 5
   *                 maximum: 30
   *                 description: Number of slides
   *                 example: 15
   *               brandName:
   *                 type: string
   *                 description: Brand name
   *                 example: "Avenia"
   *               primaryColor:
   *                 type: string
   *                 description: Primary color hex code
   *                 example: "#7A5AF8"
   *               secondaryColor:
   *                 type: string
   *                 description: Secondary color hex code
   *                 example: "#00C896"
   *               darkBackgroundColor:
   *                 type: string
   *                 description: Dark background color hex code
   *                 example: "#1A1A1A"
   *               primaryFont:
   *                 type: string
   *                 description: Primary font family
   *                 example: "Inter"
   *               secondaryFont:
   *                 type: string
   *                 description: Secondary font family
   *                 example: "Roboto"
   *               includeDemo:
   *                 type: boolean
   *                 description: Include demo flow section
   *                 example: true
   *               includePricing:
   *                 type: boolean
   *                 description: Include pricing section
   *                 example: true
   *               includeCompetition:
   *                 type: boolean
   *                 description: Include competition analysis
   *                 example: true
   *               includeRoadmap:
   *                 type: boolean
   *                 description: Include roadmap section
   *                 example: true
   *     responses:
   *       200:
   *         description: Presentation generated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   $ref: '#/components/schemas/PresentationResponse'
   *       400:
   *         description: Invalid request parameters
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  router.post('/generate',
    authRateLimits.presentation,
    authenticateToken,
    validate(presentationGenerateSchema),
    async (req: AuthRequest, res: Response) => {
      const requestId = Math.random().toString(36).substring(7);
      const startTime = Date.now();
      
      try {
        const presentationRequest: PresentationRequest = req.body;
        const presentationService = PresentationService.getInstance();
        
            // Generate presentation
            const presentation = await presentationService.generatePresentation(presentationRequest, req.user?.id || '');
        
        // Log audit
        await auditService.logEvent({
          userId: req.user?.id || 'unknown',
          action: 'presentation_generated',
          resource: 'presentation',
          resourceId: presentation.id,
          success: true,
          metadata: {
            topic: presentationRequest.topic,
            language: presentationRequest.language,
            slideCount: presentationRequest.slideCount,
            requestId,
          },
        });

        const responseTime = Date.now() - startTime;
        logger.info('Presentation generated successfully', {
          requestId,
          userId: req.user?.id,
          topic: presentationRequest.topic,
          slideCount: presentation.slides.length,
          responseTime,
        });

        res.json({
          success: true,
          data: presentation,
        });
      } catch (error) {
        const responseTime = Date.now() - startTime;
        logger.error('Failed to generate presentation', {
          requestId,
          userId: req.user?.id,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          responseTime,
          requestBody: req.body,
        });

        res.status(500).json({
          success: false,
          error: 'presentation_generation_failed',
          message: `Failed to generate presentation: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }
  );

  /**
   * @swagger
   * /api/v1/presentation/templates:
   *   get:
   *     summary: Get available presentation templates
   *     tags: [Presentation]
   *     security:
   *       - BearerAuth: []
   *     responses:
   *       200:
   *         description: Templates retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       id:
   *                         type: string
   *                       name:
   *                         type: string
   *                       description:
   *                         type: string
   *                       defaultSlideCount:
   *                         type: number
   *                       includes:
   *                         type: array
   *                         items:
   *                           type: string
   *       401:
   *         description: Unauthorized
   *       500:
   *         description: Internal server error
   */
  router.get('/templates',
    authRateLimits.presentation,
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        const presentationService = PresentationService.getInstance();
        const templates = await presentationService.getPresentationTemplates();
        
        res.json({
          success: true,
          data: templates,
        });
      } catch (error) {
        logger.error('Failed to get presentation templates', {
          userId: req.user?.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        res.status(500).json({
          success: false,
          error: 'templates_retrieval_failed',
          message: 'Failed to retrieve presentation templates',
        });
      }
    }
  );

      /**
       * @swagger
       * /api/v1/presentation/user-presentations:
       *   get:
       *     summary: Get user's saved presentations
       *     tags: [Presentation]
       *     security:
       *       - BearerAuth: []
       *     responses:
       *       200:
       *         description: User presentations retrieved successfully
       *         content:
       *           application/json:
       *             schema:
       *               type: object
       *               properties:
       *                 success:
       *                   type: boolean
       *                   example: true
       *                 data:
       *                   type: array
       *                   items:
       *                     $ref: '#/components/schemas/PresentationResponse'
       *                 message:
       *                   type: string
       *                   example: "Presentations retrieved successfully"
       *       401:
       *         $ref: '#/components/responses/Unauthorized'
       *       500:
       *         $ref: '#/components/responses/InternalServerError'
       */
      router.get('/user-presentations', authenticateToken, async (req: AuthRequest, res: Response) => {
        try {
          const presentationService = PresentationService.getInstance();
          const presentations = await presentationService.getUserPresentations(req.user?.id || '');
          
          res.json({
            success: true,
            data: presentations,
            message: 'Presentations retrieved successfully',
          });
        } catch (error: any) {
          logger.error('Failed to get user presentations', {
            userId: req.user?.id,
            error: error.message,
            stack: error.stack,
          });
          res.status(500).json({
            success: false,
            error: 'internal_server_error',
            message: 'Failed to get user presentations',
          });
        }
      });

      return router;
    }
