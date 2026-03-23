import { SchemaType } from "@google/generative-ai";

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

/**
 * Generates content via server-side Gemini proxy (/api/gemini).
 * API 키는 서버에서만 사용되므로 클라이언트에 노출되지 않습니다.
 */
export async function generateContent<T = any>(
    prompt: string,
    options: GenerationOptions = {}
): Promise<T> {
    const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, options }),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `Gemini proxy error: ${response.status}`);
    }

    const result = await response.json();

    if (result.repaired) {
        console.warn('⚠️ Server repaired truncated JSON response');
    }

    return result.data as T;
}
