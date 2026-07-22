import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;

export const client = new GoogleGenAI({
  apiKey: apiKey || 'dummy-key-to-prevent-constructor-crash',
});

export default client;
