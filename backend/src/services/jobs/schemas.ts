import { z } from 'zod';

export const ALLOWED_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
] as const;

export const ALLOWED_TONES = ['natural', 'literal', 'formal', 'casual'] as const;

export const DEFAULT_MODEL = 'gemini-3.6-flash';
export const DEFAULT_TONE = 'natural';

const MAX_GLOSSARY_CHARS = 4000;
const MAX_FILENAME_CHARS = 255;

export const uploadBodySchema = z.object({
  targetLanguage: z.string().trim().min(1, 'targetLanguage is required.').max(100),
  model: z
    .string()
    .trim()
    .optional()
    .transform((m) => m ?? DEFAULT_MODEL)
    .pipe(z.enum(ALLOWED_MODELS)),
  toneStyle: z
    .string()
    .trim()
    .optional()
    .transform((t) => t ?? DEFAULT_TONE)
    .pipe(z.enum(ALLOWED_TONES)),
  glossary: z
    .string()
    .optional()
    .transform((g) => (typeof g === 'string' ? g.trim() : ''))
    .pipe(z.string().max(MAX_GLOSSARY_CHARS, `Glossary is too long (max ${MAX_GLOSSARY_CHARS} characters).`)),
  filename: z.string().max(MAX_FILENAME_CHARS, 'Filename is too long.'),
});

export type UploadBody = z.infer<typeof uploadBodySchema>;

export function parseUploadBody(input: unknown) {
  return uploadBodySchema.safeParse(input);
}
