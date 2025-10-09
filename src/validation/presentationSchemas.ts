import { z } from 'zod';

export const presentationGenerateSchema = z.object({
  topic: z.string().min(3).max(200),
  language: z.enum(['tr', 'en', 'es', 'fr', 'de', 'it']),
  audience: z.string().min(5).max(100),
  tone: z.string().min(3).max(50),
  slideCount: z.number().int().min(5).max(30).default(15),
  brandName: z.string().min(2).max(50).default('Avenia'),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#7A5AF8'),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#00C896'),
  darkBackgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#1A1A1A'),
  primaryFont: z.string().min(2).max(30).default('Inter'),
  secondaryFont: z.string().min(2).max(30).default('Roboto'),
  includeDemo: z.boolean().default(true),
  includePricing: z.boolean().default(true),
  includeCompetition: z.boolean().default(true),
  includeRoadmap: z.boolean().default(true),
});
