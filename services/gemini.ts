import { GoogleGenerativeAI, SchemaType, GenerationConfig } from "@google/generative-ai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
    console.error("VITE_GEMINI_API_KEY is not set in environment variables.");
}

const genAI = new GoogleGenerativeAI(apiKey || "");

// Model configuration with fallback
const DEFAULT_MODEL = "gemini-3-flash-preview";
const FALLBACK_MODEL = "gemini-2.5-flash";
const MAX_RETRIES = 2;

export interface GenerationOptions {
    model?: string;
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    responseSchema?: any;
}

// Re-export strict types for consumers
export { SchemaType as Type };
export type Schema = any;

/**
 * 잘린 JSON 응답을 복구하는 헬퍼
 * - 닫히지 않은 문자열, 배열, 객체를 닫아줌
 */
function repairTruncatedJson(text: string): string {
    let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();

    // 잘린 문자열 닫기: 마지막에 열린 따옴표가 있으면 닫기
    const quoteCount = (cleaned.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) {
        cleaned += '"';
    }

    // 누락된 괄호 세기
    let braces = 0, brackets = 0;
    let inString = false;
    for (let i = 0; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (ch === '"' && (i === 0 || cleaned[i - 1] !== '\\')) inString = !inString;
        if (inString) continue;
        if (ch === '{') braces++;
        if (ch === '}') braces--;
        if (ch === '[') brackets++;
        if (ch === ']') brackets--;
    }

    // 마지막에 잘린 키-값 쌍 정리 (예: ,"key": 로 끝남)
    cleaned = cleaned.replace(/,\s*"[^"]*"?\s*:?\s*$/, '');
    // 잘린 값 정리 (예: "value 로 끝남)
    cleaned = cleaned.replace(/,\s*$/, '');

    // 괄호 균형 맞추기
    for (let i = 0; i < brackets; i++) cleaned += ']';
    for (let i = 0; i < braces; i++) cleaned += '}';

    return cleaned;
}

/**
 * Delay helper for exponential backoff
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generates content using Google Gemini model with retry, fallback, and error handling.
 */
export async function generateContent<T = any>(
    prompt: string,
    options: GenerationOptions = {}
): Promise<T> {
    const modelsToTry = [
        options.model || DEFAULT_MODEL,
        FALLBACK_MODEL
    ];

    // Configure the inference parameters
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
                    const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s
                    console.log(`⏳ Retry ${attempt}/${MAX_RETRIES} for ${modelId} (waiting ${waitTime}ms)...`);
                    await delay(waitTime);
                }

                const model = genAI.getGenerativeModel({
                    model: modelId,
                    generationConfig,
                });

                const result = await model.generateContent(prompt);
                const response = result.response;
                const text = response.text();

                if (modelId !== (options.model || DEFAULT_MODEL)) {
                    console.log(`✅ Fallback to ${modelId} succeeded`);
                }

                if (generationConfig.responseMimeType === "application/json") {
                    try {
                        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
                        return JSON.parse(cleanedText) as T;
                    } catch (e) {
                        // 잘린 JSON 복구 시도
                        try {
                            const repaired = repairTruncatedJson(text);
                            console.warn('⚠️ Repaired truncated JSON response');
                            return JSON.parse(repaired) as T;
                        } catch (e2) {
                            console.error("Failed to parse JSON response:", text.substring(0, 200) + '...');
                            throw new Error("AI returned malformed JSON.");
                        }
                    }
                }

                return text as unknown as T;
            } catch (error: any) {
                lastError = error;
                const errorMsg = error?.message || '';
                const is503 = errorMsg.includes('503') || errorMsg.includes('high demand') || errorMsg.includes('overloaded');
                const is429 = errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('quota');

                if (is503 || is429) {
                    console.warn(`⚠️ ${modelId} returned ${is503 ? '503' : '429'} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
                    if (attempt < MAX_RETRIES) continue; // retry same model
                    console.warn(`🔄 Switching to fallback model...`);
                    break; // try next model
                }

                // Non-retryable error
                console.error(`❌ ${modelId} error:`, error);
                break; // try fallback model
            }
        }
    }

    console.error("Gemini Generation Error: All models failed", lastError);
    throw lastError;
}

