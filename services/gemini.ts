import { GoogleGenerativeAI, SchemaType, GenerationConfig } from "@google/generative-ai";

// Re-export strict types for consumers
export { SchemaType as Type };
export type Schema = any;

export interface GenerationOptions {
    model?: string;
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    responseSchema?: any;
}

const DEFAULT_MODEL = "gemini-3-flash-preview";
const FALLBACK_MODEL = "gemini-2.5-flash";
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

/**
 * 서버 프록시(/api/gemini) 우선 시도, 실패 시 클라이언트 직접 호출 폴백
 */
export async function generateContent<T = any>(
    prompt: string,
    options: GenerationOptions = {}
): Promise<T> {
    // 1차: 서버 프록시 시도
    try {
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, options }),
        });

        if (response.ok) {
            const result = await response.json();
            if (result.repaired) {
                console.warn('⚠️ Server repaired truncated JSON response');
            }
            return result.data as T;
        }
    } catch {
        console.warn('⚠️ Gemini proxy unavailable, falling back to direct API call');
    }

    // 2차: 클라이언트 직접 호출 (폴백)
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("Gemini API key is not configured.");
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
        generationConfig.responseMimeType = "application/json";
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

                if (generationConfig.responseMimeType === "application/json") {
                    try {
                        const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
                        return JSON.parse(cleaned) as T;
                    } catch {
                        try {
                            const repaired = repairTruncatedJson(text);
                            console.warn('⚠️ Repaired truncated JSON response');
                            return JSON.parse(repaired) as T;
                        } catch {
                            throw new Error("AI returned malformed JSON.");
                        }
                    }
                }

                return text as unknown as T;
            } catch (error: any) {
                lastError = error;
                const msg = error?.message || '';
                const isRetryable = msg.includes('503') || msg.includes('429') || msg.includes('overloaded') || msg.includes('rate limit');
                if (isRetryable && attempt < MAX_RETRIES) continue;
                break;
            }
        }
    }

    throw lastError;
}
