"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.presentationGenerateSchema = void 0;
const zod_1 = require("zod");
exports.presentationGenerateSchema = zod_1.z.object({
    topic: zod_1.z.string().min(3).max(200),
    language: zod_1.z.enum(['tr', 'en', 'es', 'fr', 'de', 'it']),
    audience: zod_1.z.string().min(5).max(100),
    tone: zod_1.z.string().min(3).max(50),
    slideCount: zod_1.z.number().int().min(5).max(30).default(15),
    brandName: zod_1.z.string().min(2).max(50).default('Avenia'),
    primaryColor: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#7A5AF8'),
    secondaryColor: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#00C896'),
    darkBackgroundColor: zod_1.z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#1A1A1A'),
    primaryFont: zod_1.z.string().min(2).max(30).default('Inter'),
    secondaryFont: zod_1.z.string().min(2).max(30).default('Roboto'),
    includeDemo: zod_1.z.boolean().default(true),
    includePricing: zod_1.z.boolean().default(true),
    includeCompetition: zod_1.z.boolean().default(true),
    includeRoadmap: zod_1.z.boolean().default(true),
});
