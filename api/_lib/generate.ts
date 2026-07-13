// AI Gateway 기반 공용 생성 로직
// - api/gemini.ts (Vercel 함수)와 vite 개발 서버 미들웨어가 함께 사용
// - 인증: Vercel 배포에서는 OIDC 자동, 로컬/기타 환경은 AI_GATEWAY_API_KEY
import { generateText, generateObject, jsonSchema } from 'ai';

// 게이트웨이 모델 슬러그 (provider/model 형식)
// 가성비 기본: 텍스트/JSON 작업(문항 생성·루브릭·처방·진로·상담·홍보문)은
// 신형 Flash 티어로. 손글씨 판독만 별도로 비전 강한 모델을 오버라이드해서 씀.
const PRIMARY_MODEL = 'google/gemini-3.5-flash';
// 기본 모델 실패/제한 시 게이트웨이가 순서대로 폴백 (모두 비전 지원 → OCR 폴백도 안전)
const FALLBACK_MODELS = ['google/gemini-2.5-flash', 'anthropic/claude-haiku-4.5'];

export interface GenerateRequestOptions {
  model?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  responseMimeType?: string;
  responseSchema?: any;
}

// 멀티모달 입력 (손글씨 사진 판독 등) — base64 데이터 + MIME 타입
export interface GenerateImageInput {
  data: string;      // base64 (data: 접두사 없이)
  mediaType: string; // 예: image/jpeg
}

export interface GenerateResult {
  data: any;
  model: string;
  repaired?: boolean;
}

// SDK 에러 메시지에 섞여 오는 터미널 색상 코드(ANSI escape)를 제거해 클라이언트에 깨끗한 문구만 전달
export function toCleanErrorMessage(error: any): string {
  const raw: string = error?.message || 'Generation failed';
  const ansiPattern = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');
  return raw.replace(ansiPattern, '').replace(/\s+/g, ' ').trim();
}

export function repairTruncatedJson(text: string): string {
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

// 기존 Gemini SchemaType 스키마(type이 소문자 문자열)를 JSON Schema로 정규화
// (@google/generative-ai의 SchemaType 값은 'object'/'string' 등 JSON Schema와 동일한 소문자라 구조만 손보면 됨)
function toJsonSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  if (Array.isArray(schema)) return schema.map(toJsonSchema);

  const out: any = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type' && typeof value === 'string') {
      out.type = value.toLowerCase();
    } else if (key === 'properties' && value && typeof value === 'object') {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, any>).map(([k, v]) => [k, toJsonSchema(v)])
      );
    } else if (key === 'items') {
      out.items = toJsonSchema(value);
    } else if (key === 'nullable') {
      // JSON Schema에는 nullable 키워드가 없으므로 생략 (검증은 게이트웨이/모델이 관대하게 처리)
      continue;
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function runGeneration(
  prompt: string,
  options: GenerateRequestOptions = {},
  images: GenerateImageInput[] = []
): Promise<GenerateResult> {
  const providerOptions = {
    gateway: {
      models: FALLBACK_MODELS,
      tags: ['app:gachi-literacy'],
    },
  } as any;

  const common = {
    temperature: options.temperature ?? 0.7,
    topP: options.topP ?? 0.95,
    maxOutputTokens: options.maxOutputTokens ?? 65536,
    maxRetries: 2,
    providerOptions,
  };

  const modelId = options.model || PRIMARY_MODEL;
  const wantsJson = options.responseMimeType === 'application/json' || !!options.responseSchema;

  // 이미지가 있으면 prompt 대신 멀티모달 messages로 전달
  const hasImages = images.length > 0;
  const promptInput = hasImages
    ? {
        messages: [{
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: prompt },
            ...images.map(img => ({
              type: 'image' as const,
              image: img.data,
              mediaType: img.mediaType || 'image/jpeg',
            })),
          ],
        }],
      }
    : { prompt };

  // 1) 스키마가 명시된 경우: generateObject로 구조를 강제
  if (options.responseSchema) {
    try {
      const { object } = await generateObject({
        model: modelId,
        ...promptInput,
        schema: jsonSchema(toJsonSchema(options.responseSchema)),
        ...common,
      } as any);
      return { data: object, model: modelId };
    } catch (schemaError) {
      // 일부 모델/스키마 조합에서 generateObject가 실패할 수 있으므로 텍스트 경로로 재시도
      console.warn('[generate] generateObject failed, falling back to text+parse:', (schemaError as Error)?.message);
    }
  }

  // 2) 텍스트 생성 (JSON 요청이면 파싱 + 잘림 복구)
  const { text } = await generateText({ model: modelId, ...promptInput, ...common } as any);

  if (wantsJson) {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    try {
      return { data: JSON.parse(cleaned), model: modelId };
    } catch {
      const repaired = repairTruncatedJson(text);
      try {
        return { data: JSON.parse(repaired), model: modelId, repaired: true };
      } catch {
        throw new Error('AI returned malformed JSON.');
      }
    }
  }

  return { data: text, model: modelId };
}
