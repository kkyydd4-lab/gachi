import { GoogleGenerativeAI, SchemaType, GenerationConfig } from "@google/generative-ai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

if (!apiKey) {
    console.error("VITE_GEMINI_API_KEY is not set in environment variables.");
}

const genAI = new GoogleGenerativeAI(apiKey || "");

// Default model configuration
const DEFAULT_MODEL = "gemini-3.0-pro";

export interface GenerationOptions {
    model?: string;
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    responseSchema?: any; // google-generative-ai uses a specific Schema type but 'any' offers flexibility with strict runtime checks
}

// Re-export strict types for consumers
export { SchemaType as Type };
export type Schema = any; // Schema type in @google/generative-ai is complex, simplifying for now or mapping it

/**
 * Generates content using Google Gemini model with standardized error handling and typing.
 * @param prompt The prompt to send to the model.
 * @param options Configuration options for the generation.
 * @returns The generated response, parsed as JSON if a schema is provided or strict JSON is requested.
 */
export async function generateContent<T = any>(
    prompt: string,
    options: GenerationOptions = {}
): Promise<T> {
    try {
        const modelId = options.model || DEFAULT_MODEL;

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

        const model = genAI.getGenerativeModel({
            model: modelId,
            generationConfig,
        });

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        if (generationConfig.responseMimeType === "application/json") {
            try {
                // Simple clean up for common markdown code block wrappers
                const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
                return JSON.parse(cleanedText) as T;
            } catch (e) {
                console.error("Failed to parse JSON response:", text);
                throw new Error("AI returned malformed JSON.");
            }
        }

        return text as unknown as T;
    } catch (error) {
        console.error("Gemini Generation Error:", error);
        throw error;
    }
}
