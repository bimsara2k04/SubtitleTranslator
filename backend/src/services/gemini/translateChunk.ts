import type { SubtitleCue, TranslationItem } from '../../types/subtitles.js';
import { GoogleGenAI } from '@google/genai';
import { translationResponseSchema } from './schema.js';
import { buildSystemInstructions, buildInputPayload } from './prompts.js';
import { DEFAULT_MODEL } from '../jobs/schemas.js';

// Reuse one GoogleGenAI client per API key — constructing one per call is wasteful.
const clientCache = new Map<string, GoogleGenAI>();

function getClient(apiKey: string): GoogleGenAI {
  let client = clientCache.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({ apiKey });
    clientCache.set(apiKey, client);
  }
  return client;
}

export async function translateChunk(
  cues: SubtitleCue[],
  targetLanguage: string,
  model = DEFAULT_MODEL,
  toneStyle = 'natural',
  glossary?: string | null,
  apiKey?: string,
  sourceLanguage = 'English'
): Promise<TranslationItem[]> {
  if (cues.length === 0) {
    return [];
  }

  const activeKey = apiKey || process.env.GEMINI_API_KEY || 'dummy-key-to-prevent-constructor-crash';
  const client = getClient(activeKey);

  const systemInstruction = buildSystemInstructions(targetLanguage, toneStyle, glossary, sourceLanguage);
  const input = buildInputPayload(cues);

  try {
    const response = await client.models.generateContent({
      model,
      contents: input,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: translationResponseSchema,
        temperature: 0.1, // Low temperature for consistent translation structure
      },
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error('Gemini API returned an empty response text.');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch (e: any) {
      throw new Error(`Failed to parse Gemini response as JSON: ${e?.message}. Raw output: ${responseText}`);
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) {
      throw new Error(`Gemini response JSON does not match expected structure. Missing 'items' array. Raw: ${responseText}`);
    }

    return parsed.items as TranslationItem[];
  } catch (error: any) {
    console.error('[Gemini API Error] failed to translate chunk:', error?.message || error);
    throw error;
  }
}
export default translateChunk;
