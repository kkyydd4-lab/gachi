import { GoogleGenerativeAI, SchemaType, GenerationConfig } from "@google/generative-ai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
    console.error("VITE_GEMINI_API_KEY is not set in environment variables.");
}

const genAI = new GoogleGenerativeAI(apiKey || "");

// Model configuration with fallback
const DEFAULT_MODEL = "gemini-2.5-flash";
const FALLBACK_MODEL = "gemini-2.5-pro";
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
        maxOutputTokens: options.maxOutputTokens ?? 8192,
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
                        console.error("Failed to parse JSON response:", text);
                        throw new Error("AI returned malformed JSON.");
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

