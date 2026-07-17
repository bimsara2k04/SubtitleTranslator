import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.warn('GEMINI_API_KEY is not defined in .env. Gemini API requests will fail.');
}

export const client = new GoogleGenAI({
  apiKey: apiKey || 'dummy-key-to-prevent-constructor-crash',
});

export default client;
