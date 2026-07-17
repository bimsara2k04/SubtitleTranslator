export function buildSystemInstructions(targetLanguage: string, toneStyle = 'natural', glossary?: string | null): string {
  let instructions = `You are a professional subtitle translator. Translate the given subtitle text lines from English into ${targetLanguage}.

CRITICAL SUBTITLE RULES:
1. Translate naturally and idiomatically for subtitles, prioritizing reading speed and clarity.
2. Maintain original context, meaning, and emotional nuance.
3. NEVER add your own commentary, explanations, translator notes, or extra characters.
4. Return ONLY valid JSON matching the specified schema.
5. Preserve the exact original item indexes. Do NOT omit or change any index.
6. Translate only the 'textLines' values. Do NOT touch indexes or formatting outside the text lines.
7. Keep line lengths reasonably compact for reading comfort. Do not merge separate lines unless it substantially improves readability.
8. Use a tone style that is: "${toneStyle}".
`;

  if (glossary && glossary.trim()) {
    instructions += `\nGLOSSARY RULES (Prioritize these translations for the specified terms):\n${glossary.trim()}\n`;
  }

  return instructions;
}

export function buildInputPayload(cues: { index: number; textLines: string[] }[]): string {
  return JSON.stringify({
    cues: cues.map((c) => ({
      index: c.index,
      textLines: c.textLines,
    })),
  });
}
