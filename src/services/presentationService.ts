import axios from 'axios';
import { logger } from '../utils/logger';
import { db } from '../firebase';

export interface PresentationRequest {
  topic: string;
  language: string;
  audience: string;
  tone: string;
  slideCount: number;
  brandName: string;
  primaryColor: string;
  secondaryColor: string;
  darkBackgroundColor: string;
  primaryFont: string;
  secondaryFont: string;
  includeDemo: boolean;
  includePricing: boolean;
  includeCompetition: boolean;
  includeRoadmap: boolean;
}

export interface Slide {
  id: number;
  title: string;
  content: string[];
  speakerNotes: string;
  visualNotes?: string;
  type: 'cover' | 'problem' | 'solution' | 'features' | 'demo' | 'architecture' | 'security' | 'performance' | 'roadmap' | 'market' | 'pricing' | 'success' | 'competition' | 'risks' | 'cta';
}

export interface PresentationResponse {
  id: string;
  title: string;
  slides: Slide[];
  metadata: {
    language: string;
    audience: string;
    tone: string;
    slideCount: number;
    brandName: string;
    colors: {
      primary: string;
      secondary: string;
      darkBackground: string;
    };
    fonts: {
      primary: string;
      secondary: string;
    };
    includes: {
      demo: boolean;
      pricing: boolean;
      competition: boolean;
      roadmap: boolean;
    };
  };
  createdAt: string;
  updatedAt: string;
}

export class PresentationService {
  private static instance: PresentationService;

  private constructor() {}

  public static getInstance(): PresentationService {
    if (!PresentationService.instance) {
      PresentationService.instance = new PresentationService();
    }
    return PresentationService.instance;
  }

  public async getPresentationTemplates(): Promise<any[]> {
    return [
      {
        id: 'startup_pitch',
        name: 'Startup Pitch Deck',
        description: 'A template for pitching your startup to investors.',
        defaultSlideCount: 12,
        includes: ['demo', 'pricing', 'competition', 'roadmap']
      },
      {
        id: 'product_launch',
        name: 'Product Launch',
        description: 'A template for launching a new product.',
        defaultSlideCount: 10,
        includes: ['demo', 'pricing']
      },
      {
        id: 'technical_deep_dive',
        name: 'Technical Deep Dive',
        description: 'A template for technical presentations.',
        defaultSlideCount: 15,
        includes: ['demo', 'roadmap']
      },
      {
        id: 'business_proposal',
        name: 'Business Proposal',
        description: 'A template for business proposals.',
        defaultSlideCount: 8,
        includes: ['pricing', 'competition']
      }
    ];
  }

  public async generatePresentation(request: PresentationRequest, userId: string): Promise<PresentationResponse> {
    try {
      logger.info('Generating presentation', { request, userId });

      // Validate required fields
      if (!request.topic || !request.language || !request.audience || !request.tone) {
        throw new Error('Missing required fields: topic, language, audience, or tone');
      }

      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
      }

      const presentationId = `pres_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      // Generate presentation using OpenAI
      const presentation = await this.generatePresentationContent(request);
      
      const response: PresentationResponse = {
        id: presentationId,
        title: presentation.title,
        slides: presentation.slides,
        metadata: {
          language: request.language,
          audience: request.audience,
          tone: request.tone,
          slideCount: request.slideCount,
          brandName: request.brandName,
          colors: {
            primary: request.primaryColor,
            secondary: request.secondaryColor,
            darkBackground: request.darkBackgroundColor,
          },
          fonts: {
            primary: request.primaryFont,
            secondary: request.secondaryFont,
          },
          includes: {
            demo: request.includeDemo,
            pricing: request.includePricing,
            competition: request.includeCompetition,
            roadmap: request.includeRoadmap,
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Save to Firebase
      await this.savePresentationToFirebase(response, userId);

      logger.info('Presentation generated and saved successfully', { presentationId, userId });
      return response;
    } catch (error) {
      logger.error('Failed to generate presentation', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        request, 
        userId 
      });
      throw error;
    }
  }

  private async savePresentationToFirebase(presentation: PresentationResponse, userId: string): Promise<void> {
    try {
      const presentationData = {
        ...presentation,
        userId,
        type: 'presentation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await db.collection('presentations').doc(presentation.id).set(presentationData);
      logger.info('Presentation saved to Firebase', { presentationId: presentation.id, userId });
    } catch (error) {
      logger.error('Failed to save presentation to Firebase', { error, presentationId: presentation.id, userId });
      throw error;
    }
  }

  public async getUserPresentations(userId: string): Promise<PresentationResponse[]> {
    try {
      const snapshot = await db
        .collection('presentations')
        .where('userId', '==', userId)
        .where('type', '==', 'presentation')
        .orderBy('createdAt', 'desc')
        .get();

      const presentations: PresentationResponse[] = [];
      snapshot.forEach((doc: any) => {
        const data = doc.data();
        presentations.push({
          id: data.id,
          title: data.title,
          slides: data.slides,
          metadata: data.metadata,
          createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || new Date().toISOString(),
        });
      });

      logger.info('Retrieved user presentations', { userId, count: presentations.length });
      return presentations;
    } catch (error) {
      logger.error('Failed to get user presentations', { error, userId });
      throw error;
    }
  }

  private async generatePresentationContent(request: PresentationRequest): Promise<{ title: string; slides: Slide[] }> {
    try {
      const systemPrompt = this.buildSystemPrompt(request);
      const userPrompt = this.buildUserPrompt(request);

      logger.info('Sending request to OpenAI', { 
        model: 'gpt-4',
        systemPromptLength: systemPrompt.length,
        userPromptLength: userPrompt.length 
      });

      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 60000
      });

      logger.info('OpenAI response received', { 
        status: response.status,
        hasChoices: !!(response.data as any).choices,
        choicesLength: (response.data as any).choices?.length 
      });

      const content = (response.data as any).choices?.[0]?.message?.content;
      if (!content) {
        logger.error('No content in OpenAI response', { 
          responseData: response.data,
          choices: (response.data as any).choices 
        });
        throw new Error('No content generated from OpenAI');
      }

      logger.info('Parsing presentation content', { contentLength: content.length });
      return this.parsePresentationContent(content, request);
    } catch (error) {
      logger.error('Failed to generate presentation content', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        request
      });
      throw error;
    }
  }

  private buildSystemPrompt(request: PresentationRequest): string {
    return `Sen dünya standartlarında bir **AI Sunum Yazarı** ve **Görsel Tasarım Direktörü**sün.

HEDEF: ${request.topic} konusunda profesyonel bir sunum oluşturmak
Sunum dili: ${request.language}
Hedef kitle: ${request.audience}
Ton: ${request.tone}
Okunabilirlik: her slaytta ≤6 madde, her madde ≤12 kelime.

MARKA / TASARIM
Renk paleti: Ana ${request.primaryColor}, ikincil ${request.secondaryColor}, koyu arka plan ${request.darkBackgroundColor}
Fontlar: Başlık ${request.primaryFont}, Metin ${request.secondaryFont}
Görsel stil: minimal, modern, bol boşluklu, düz çizgili ikonlar
Logo veya marka ismi: "${request.brandName}"
Slaytlarda gereksiz metin olmasın; ana mesajlar kalın, önemli sayılar büyük puntolu.

YAPI (~${request.slideCount} slayt; ±%20 esnetilebilir)
0. Kapak
1. Problem
2. Mevcut Çözümler & Eksikleri
3. Bizim Çözüm
4. Ürün Özellikleri
5. Demo Akışı
6. Mimari
7. Güvenlik & Uyumluluk
8. Performans & Ölçeklenebilirlik
9. Yol Haritası
10. Pazar / Persona
11. Fiyatlandırma
12. Başarı Örnekleri
13. Rekabet Matrisi
14. Riskler & Azaltım
15. Kapanış / CTA

İÇERİK KURALLARI
- Slide başına 3–6 madde.
- Her slaytta "**Konuşmacı Notu:**" (3–5 cümle) yer alsın.
- Gerektiğinde "**Görsel Notu:**" (grafik/diyagram tanımı) ekle.
- Türkçe içeriklerde KVKK, e-Devlet gibi terimleri yerelleştir.
- Veriler yaklaşık aralıklarla yazılsın (örn. ~%30–35 artış).

ÇIKTI FORMAT
- Her slaytı \`### Slide {num} — {başlık}\` ile başlat.
- Madde işaretleri \`-\` ile verilsin.
- Slayt sonunda:
  - "**Konuşmacı Notu:** …"
  - "**Görsel Notu:** …" (gerektiğinde)
- Tüm metinleri Markdown biçiminde üret.`;
  }

  private buildUserPrompt(request: PresentationRequest): string {
    return `Aşağıdaki detaylara göre profesyonel bir sunum oluştur:

KONU: ${request.topic}
Kısa özet: ${request.topic} hakkında kapsamlı bir sunum
Öne çıkanlar: Modern teknoloji, kullanıcı odaklı tasarım, ölçeklenebilir mimari
Pazarda fark: ${request.topic} konusunda benzersiz yaklaşım

Slayt sayısı: ${request.slideCount}
Dil: ${request.language}
Hedef kitle: ${request.audience}
Ton: ${request.tone}

Ek özellikler:
${request.includeDemo ? '- Demo akışı dahil et' : ''}
${request.includePricing ? '- Fiyatlandırma bölümü dahil et' : ''}
${request.includeCompetition ? '- Rekabet analizi dahil et' : ''}
${request.includeRoadmap ? '- Yol haritası dahil et' : ''}

Lütfen tam sunumu üret.`;
  }

  private parsePresentationContent(content: string, request: PresentationRequest): { title: string; slides: Slide[] } {
    const slides: Slide[] = [];
    const lines = content.split('\n');
    let currentSlide: Partial<Slide> | null = null;
    let slideCounter = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (trimmedLine.startsWith('### Slide')) {
        // Save previous slide
        if (currentSlide && currentSlide.title) {
          slides.push(currentSlide as Slide);
        }
        
        // Start new slide
        const titleMatch = trimmedLine.match(/### Slide \d+ — (.+)/);
        currentSlide = {
          id: slideCounter++,
          title: titleMatch ? titleMatch[1] : 'Untitled Slide',
          content: [],
          speakerNotes: '',
          type: this.determineSlideType(slideCounter, trimmedLine),
        };
      } else if (trimmedLine.startsWith('- ') && currentSlide) {
        // Add bullet point
        if (!currentSlide.content) {
          currentSlide.content = [];
        }
        currentSlide.content.push(trimmedLine.substring(2));
      } else if (trimmedLine.startsWith('**Konuşmacı Notu:**') && currentSlide) {
        // Add speaker notes
        currentSlide.speakerNotes = trimmedLine.substring(19).trim();
      } else if (trimmedLine.startsWith('**Görsel Notu:**') && currentSlide) {
        // Add visual notes
        currentSlide.visualNotes = trimmedLine.substring(15).trim();
      }
    }

    // Add last slide
    if (currentSlide && currentSlide.title) {
      slides.push(currentSlide as Slide);
    }

    return {
      title: `${request.topic} - ${request.brandName} Sunumu`,
      slides,
    };
  }

  private determineSlideType(slideNumber: number, title: string): Slide['type'] {
    const titleLower = title.toLowerCase();
    
    if (slideNumber === 0 || titleLower.includes('kapak') || titleLower.includes('cover')) return 'cover';
    if (titleLower.includes('problem')) return 'problem';
    if (titleLower.includes('çözüm') || titleLower.includes('solution')) return 'solution';
    if (titleLower.includes('özellik') || titleLower.includes('feature')) return 'features';
    if (titleLower.includes('demo')) return 'demo';
    if (titleLower.includes('mimari') || titleLower.includes('architecture')) return 'architecture';
    if (titleLower.includes('güvenlik') || titleLower.includes('security')) return 'security';
    if (titleLower.includes('performans') || titleLower.includes('performance')) return 'performance';
    if (titleLower.includes('yol haritası') || titleLower.includes('roadmap')) return 'roadmap';
    if (titleLower.includes('pazar') || titleLower.includes('market')) return 'market';
    if (titleLower.includes('fiyat') || titleLower.includes('pricing')) return 'pricing';
    if (titleLower.includes('başarı') || titleLower.includes('success')) return 'success';
    if (titleLower.includes('rekabet') || titleLower.includes('competition')) return 'competition';
    if (titleLower.includes('risk') || titleLower.includes('risk')) return 'risks';
    if (titleLower.includes('kapanış') || titleLower.includes('cta') || titleLower.includes('closing')) return 'cta';
    
    return 'features'; // Default type
  }

}
