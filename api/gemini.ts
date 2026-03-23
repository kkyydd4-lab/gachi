import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenerativeAI, GenerationConfig } from '@google/generative-ai';

const DEFAULT_MODEL = 'gemini-3-flash-preview';
const FALLBACK_MODEL = 'gemini-2.5-flash';
const MAX_RETRIES = 2;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function repairTruncatedJson(text: string): string {
  let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const quoteCount = (cleaned.match(/(?<!\\)"/g) || []).length;
  if (quoteCount % 2 !== 0) cleaned += '"';

  let braces = 0, brackets = 0, inString = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '"' && (i === 0 || cleaned[i - 1] !== '\\')) inString = !inString;
    if (inString) continue;
    if (ch === '{') braces++;
    if (ch === '}') braces--;
    if (ch === '[') brackets++;
    if (ch === ']') brackets--;
  }

  cleaned = cleaned.replace(/,\s*"[^"]*"?\s*:?\s*$/, '');
  cleaned = cleaned.replace(/,\s*$/, '');
  for (let i = 0; i < brackets; i++) cleaned += ']';
  for (let i = 0; i < braces; i++) cleaned += '}';
  return cleaned;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const { prompt, options = {} } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = [options.model || DEFAULT_MODEL, FALLBACK_MODEL];

  const generationConfig: GenerationConfig = {
    temperature: options.temperature ?? 0.7,
    topP: options.topP ?? 0.95,
    topK: options.topK ?? 40,
    maxOutputTokens: options.maxOutputTokens ?? 65536,
  };

  if (options.responseMimeType) {
    generationConfig.responseMimeType = options.responseMimeType;
  }
  if (options.responseSchema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = options.responseSchema;
  }

  let lastError: any = null;

  for (const modelId of modelsToTry) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          await delay(Math.pow(2, attempt) * 1000);
        }

        const model = genAI.getGenerativeModel({ model: modelId, generationConfig });
        const result = await model.generateContent(prompt);
        const text = result.response.text();

        if (generationConfig.responseMimeType === 'application/json') {
          try {
            const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
            return res.status(200).json({ data: JSON.parse(cleaned), model: modelId });
          } catch {
            try {
              const repaired = repairTruncatedJson(text);
              return res.status(200).json({ data: JSON.parse(repaired), model: modelId, repaired: true });
            } catch {
              throw new Error('AI returned malformed JSON.');
            }
          }
        }

        return res.status(200).json({ data: text, model: modelId });
      } catch (error: any) {
        lastError = error;
        const msg = error?.message || '';
        const isRetryable = msg.includes('503') || msg.includes('429') || msg.includes('overloaded') || msg.includes('rate limit');

        if (isRetryable && attempt < MAX_RETRIES) continue;
        break;
      }
    }
  }

  return res.status(502).json({ error: lastError?.message || 'All models failed' });
}
