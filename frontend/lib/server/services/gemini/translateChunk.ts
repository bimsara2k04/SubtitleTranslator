import type { SubtitleCue, TranslationItem } from '../../types/subtitles';
import { GoogleGenAI } from '@google/genai';
import { translationResponseSchema } from './schema';
import { buildSystemInstructions, buildInputPayload } from './prompts';

export async function translateChunk(
  cues: SubtitleCue[],
  targetLanguage: string,
  model = 'gemini-3.5-flash',
  toneStyle = 'natural',
  glossary?: string | null,
  apiKey?: string
): Promise<TranslationItem[]> {
  if (cues.length === 0) {
    return [];
  }

  const activeKey = apiKey || process.env.GEMINI_API_KEY || 'dummy-key-to-prevent-constructor-crash';
  const customClient = new GoogleGenAI({ apiKey: activeKey });

  const systemInstruction = buildSystemInstructions(targetLanguage, toneStyle, glossary);
  const input = buildInputPayload(cues);

  try {
    const response = await customClient.models.generateContent({
      model,
      contents: input,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: translationResponseSchema,
        temperature: 0.1,
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

    const items: TranslationItem[] = parsed.items;
    return items;
  } catch (error: any) {
    console.error('[Gemini API Error] failed to translate chunk:', error);
    throw error;
  }
}
export default translateChunk;
