// AI 생성 클라이언트 — 서버 프록시(/api/gemini, AI Gateway 경유)만 호출한다.
// 이전의 "프록시 실패 시 브라우저에서 Google API 직접 호출" 폴백은 API 키가
// 번들에 노출되는 보안 문제가 있어 제거됨. 모델 선택/폴백/재시도는 서버가 담당.
import { auth } from './firebase';

// 서버 인증용 Firebase ID 토큰을 Authorization 헤더로 부착
// (서버는 로그인한 사용자 요청만 허용 — 유료 크레딧 무단 소진 방지)
async function buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
        const token = await auth.currentUser?.getIdToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch { /* 토큰 획득 실패 시 서버가 401로 응답 */ }
    return headers;
}

// 기존 호출부(@google/generative-ai의 SchemaType)와의 호환용 스키마 타입 상수
// 값은 JSON Schema 타입 문자열과 동일하다.
export const Type = {
    STRING: 'string',
    NUMBER: 'number',
    INTEGER: 'integer',
    BOOLEAN: 'boolean',
    ARRAY: 'array',
    OBJECT: 'object',
} as const;

export type Schema = any;

export interface GenerationOptions {
    model?: string;
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    responseSchema?: any;
    fallbackModels?: string[]; // 이 요청에 한해 게이트웨이 폴백 모델 지정
}

// 멀티모달 입력 (손글씨 사진 등)
export interface ImageInput {
    data: string;      // base64 (data: 접두사 없이)
    mediaType: string; // 예: image/jpeg
}

const REQUEST_TIMEOUT_MS = 120_000; // 서버가 폴백/재시도를 다 소진할 시간 여유

// 데이터 + 진단 메타(요청/실제 응답 모델)를 함께 반환
export async function generateContentDetailed<T = any>(
    prompt: string,
    options: GenerationOptions = {},
    images: ImageInput[] = []
): Promise<{ data: T; model?: string; servedModel?: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: await buildHeaders(),
            body: JSON.stringify({ prompt, options, images }),
            signal: controller.signal,
        });

        if (!response.ok) {
            let message = `AI 생성 요청이 실패했습니다. (${response.status})`;
            try {
                const body = await response.json();
                if (body?.error) message = body.error;
            } catch { /* 응답 본문이 JSON이 아니면 기본 메시지 유지 */ }
            throw new Error(message);
        }

        const result = await response.json();
        if (result.repaired) {
            console.warn('⚠️ Server repaired truncated JSON response');
        }
        return { data: result.data as T, model: result.model, servedModel: result.servedModel };
    } catch (error: any) {
        if (error?.name === 'AbortError') {
            throw new Error('AI 생성 요청이 시간 초과되었습니다. 잠시 후 다시 시도해주세요.');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

export async function generateContent<T = any>(
    prompt: string,
    options: GenerationOptions = {},
    images: ImageInput[] = []
): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: await buildHeaders(),
            body: JSON.stringify({ prompt, options, images }),
            signal: controller.signal,
        });

        if (!response.ok) {
            let message = `AI 생성 요청이 실패했습니다. (${response.status})`;
            try {
                const body = await response.json();
                if (body?.error) message = body.error;
            } catch { /* 응답 본문이 JSON이 아니면 기본 메시지 유지 */ }
            throw new Error(message);
        }

        const result = await response.json();
        if (result.repaired) {
            console.warn('⚠️ Server repaired truncated JSON response');
        }
        return result.data as T;
    } catch (error: any) {
        if (error?.name === 'AbortError') {
            throw new Error('AI 생성 요청이 시간 초과되었습니다. 잠시 후 다시 시도해주세요.');
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}
