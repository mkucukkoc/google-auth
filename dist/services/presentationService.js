"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PresentationService = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../utils/logger");
class PresentationService {
    constructor() { }
    static getInstance() {
        if (!PresentationService.instance) {
            PresentationService.instance = new PresentationService();
        }
        return PresentationService.instance;
    }
    async generatePresentation(request) {
        try {
            logger_1.logger.info('Generating presentation', { request });
            const presentationId = `pres_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            // Generate presentation using OpenAI
            const presentation = await this.generatePresentationContent(request);
            const response = {
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
                    createdAt: new Date(),
                },
            };
            logger_1.logger.info('Presentation generated successfully', { presentationId });
            return response;
        }
        catch (error) {
            logger_1.logger.error('Failed to generate presentation', { error, request });
            throw new Error('Failed to generate presentation');
        }
    }
    async generatePresentationContent(request) {
        const systemPrompt = this.buildSystemPrompt(request);
        const userPrompt = this.buildUserPrompt(request);
        const response = await axios_1.default.post('https://api.openai.com/v1/chat/completions', {
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
        const content = response.data.choices?.[0]?.message?.content;
        if (!content) {
            throw new Error('No content generated');
        }
        return this.parsePresentationContent(content, request);
    }
    buildSystemPrompt(request) {
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
    buildUserPrompt(request) {
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
    parsePresentationContent(content, request) {
        const slides = [];
        const lines = content.split('\n');
        let currentSlide = null;
        let slideCounter = 0;
        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('### Slide')) {
                // Save previous slide
                if (currentSlide && currentSlide.title) {
                    slides.push(currentSlide);
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
            }
            else if (trimmedLine.startsWith('- ') && currentSlide) {
                // Add bullet point
                if (!currentSlide.content) {
                    currentSlide.content = [];
                }
                currentSlide.content.push(trimmedLine.substring(2));
            }
            else if (trimmedLine.startsWith('**Konuşmacı Notu:**') && currentSlide) {
                // Add speaker notes
                currentSlide.speakerNotes = trimmedLine.substring(19).trim();
            }
            else if (trimmedLine.startsWith('**Görsel Notu:**') && currentSlide) {
                // Add visual notes
                currentSlide.visualNotes = trimmedLine.substring(15).trim();
            }
        }
        // Add last slide
        if (currentSlide && currentSlide.title) {
            slides.push(currentSlide);
        }
        return {
            title: `${request.topic} - ${request.brandName} Sunumu`,
            slides,
        };
    }
    determineSlideType(slideNumber, title) {
        const titleLower = title.toLowerCase();
        if (slideNumber === 0 || titleLower.includes('kapak') || titleLower.includes('cover'))
            return 'cover';
        if (titleLower.includes('problem'))
            return 'problem';
        if (titleLower.includes('çözüm') || titleLower.includes('solution'))
            return 'solution';
        if (titleLower.includes('özellik') || titleLower.includes('feature'))
            return 'features';
        if (titleLower.includes('demo'))
            return 'demo';
        if (titleLower.includes('mimari') || titleLower.includes('architecture'))
            return 'architecture';
        if (titleLower.includes('güvenlik') || titleLower.includes('security'))
            return 'security';
        if (titleLower.includes('performans') || titleLower.includes('performance'))
            return 'performance';
        if (titleLower.includes('yol haritası') || titleLower.includes('roadmap'))
            return 'roadmap';
        if (titleLower.includes('pazar') || titleLower.includes('market'))
            return 'market';
        if (titleLower.includes('fiyat') || titleLower.includes('pricing'))
            return 'pricing';
        if (titleLower.includes('başarı') || titleLower.includes('success'))
            return 'success';
        if (titleLower.includes('rekabet') || titleLower.includes('competition'))
            return 'competition';
        if (titleLower.includes('risk') || titleLower.includes('risk'))
            return 'risks';
        if (titleLower.includes('kapanış') || titleLower.includes('cta') || titleLower.includes('closing'))
            return 'cta';
        return 'features'; // Default type
    }
    async getPresentationTemplates() {
        return [
            {
                id: 'startup-pitch',
                name: 'Startup Pitch Deck',
                description: 'Yatırımcılar için startup sunumu',
                defaultSlideCount: 15,
                includes: ['demo', 'pricing', 'competition', 'roadmap'],
            },
            {
                id: 'product-launch',
                name: 'Ürün Lansmanı',
                description: 'Yeni ürün tanıtım sunumu',
                defaultSlideCount: 12,
                includes: ['demo', 'pricing'],
            },
            {
                id: 'technical-presentation',
                name: 'Teknik Sunum',
                description: 'Geliştiriciler için teknik detaylar',
                defaultSlideCount: 10,
                includes: ['demo', 'roadmap'],
            },
            {
                id: 'business-proposal',
                name: 'İş Önerisi',
                description: 'Müşterilere iş önerisi sunumu',
                defaultSlideCount: 14,
                includes: ['pricing', 'competition'],
            },
        ];
    }
}
exports.PresentationService = PresentationService;
