/**
 * JSON Schema for structured subtitle translation output.
 * Gemini enforces this exact structure in its response.
 */
export const translationResponseSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      description: 'The translated subtitle items',
      items: {
        type: 'object',
        properties: {
          index: {
            type: 'integer',
            description: 'Original subtitle cue index',
          },
          translatedLines: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'Translated subtitle lines for the cue',
          },
        },
        required: ['index', 'translatedLines'],
      },
    },
  },
  required: ['items'],
};
export type SchemaType = typeof translationResponseSchema;
