import { useState, useCallback } from 'react';
import { generateContent, GenerationOptions, Schema, Type } from '../services/gemini';
import { DiagnosticPassage, Question } from '../types';

export interface UseContentGeneratorReturn {
    isLoading: boolean;
    error: string | null;
    generatePassage: (
        topic: string,
        grade: string,
        options?: {
            length?: string;
            difficulty?: string;
            additionalPrompt?: string;
        }
    ) => Promise<ContentGenerationResult | null>;
    generateQuestions: (
        passage: string,
        count: number,
        grade: string,
        options?: {
            instructions?: string;
            responseSchema?: Schema; // Allow overriding schema for advanced types
        }
    ) => Promise<QuestionGenerationResult | null>; // Changed return type
}

interface ContentGenerationResult {
    title: string;
    content: string;
    summary: string;
    keywords: string[];
}

export interface QuestionGenerationResult {
    modified_content?: string; // For questions that modify text (blanks, underlines)
    questions: Question[];
}

// Schemas
const PASSAGE_SCHEMA: Schema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING },
        content: { type: Type.STRING },
        summary: { type: Type.STRING },
        keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ["title", "content", "summary", "keywords"],
};

const DEFAULT_QUESTION_SCHEMA: Schema = {
    type: Type.OBJECT,
    properties: {
        modified_content: { type: Type.STRING },
        questions: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.INTEGER }, // Changed to INTEGER to match Question interface
                    category: { type: Type.STRING },
                    type: { type: Type.STRING }, // Added type
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: 5, maxItems: 5 },
                    answer: { type: Type.INTEGER },
                    // 정답 선택지의 "전체 텍스트". 모델이 1-based/0-based를 혼동해도
                    // 이 텍스트로 정확한 번호를 서버에서 다시 계산한다. (정답 밀림 사고 방지)
                    answerText: { type: Type.STRING },
                    rationale: { type: Type.STRING },
                },
                required: ["question", "options", "answer", "answerText", "category"],
            },
        },
    },
    required: ["questions"],
};

/**
 * 정답 번호(answer)를 1-based로 정규화한다.
 * 모델이 지시를 무시하고 0-based로 답하는 사고가 반복되어(저장된 문항의 약 2/3),
 * 정답 선택지 원문(answerText)과 대조해 실제 번호를 다시 계산한다.
 * - answerText가 선택지와 일치하면 그 위치(1-based)를 정답으로 확정
 * - 일치하지 않으면 answer가 0이거나 범위를 벗어난 경우만 보정
 */
export const normalizeAnswerIndex = (q: any) => {
    const options: string[] = Array.isArray(q?.options) ? q.options : [];
    if (options.length === 0) return q;

    const norm = (s: unknown) =>
        String(s ?? '').replace(/^[①-⑮0-9.)\s]+/, '').replace(/\s+/g, ' ').trim();

    // 1) answerText로 위치 확정 (가장 신뢰도 높음)
    const answerText = norm(q?.answerText);
    if (answerText) {
        let idx = options.findIndex(o => norm(o) === answerText);
        if (idx === -1) idx = options.findIndex(o => norm(o).includes(answerText) || answerText.includes(norm(o)));
        if (idx !== -1) return { ...q, answer: idx + 1 };
    }

    // 2) 텍스트 대조 실패 시: 범위를 벗어난 값만 보정 (0이면 0-based로 간주해 +1)
    const ans = Number(q?.answer);
    if (!Number.isInteger(ans) || ans < 1 || ans > options.length) {
        const shifted = ans + 1;
        if (Number.isInteger(ans) && shifted >= 1 && shifted <= options.length) {
            return { ...q, answer: shifted };
        }
        return { ...q, answer: 1 }; // 최후: 사람이 검토하도록 1로 두되 검토 대기 상태로 저장됨
    }
    return q;
};

const getComplexityGuidelines = (grade: string): string => {
    if (grade.includes('초등') || grade.includes('Elementary')) {
        return `
        - Sentence Structure: Simple sentences with 1-2 clauses.
        - Vocabulary: Familiar words, limit abstract concepts.
        - Tone: Friendly and encouraging.
        `;
    } else if (grade.includes('중등') || grade.includes('Middle')) {
        return `
        - Sentence Structure: Compound sentences permitted.
        - Vocabulary: Subject-specific terminology with 2-3 defined academic terms.
        - Tone: Informative and objective.
        `;
    } else {
        // High school / General
        return `
        - Sentence Structure: Complex sentences with varied structure.
        - Vocabulary: Academic and abstract concepts.
        - Tone: Formal and analytical.
        `;
    }
};

export const useContentGenerator = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const generatePassage = useCallback(async (
        topic: string,
        grade: string,
        options: { length?: string; difficulty?: string; additionalPrompt?: string } = {}
    ): Promise<ContentGenerationResult | null> => {
        setIsLoading(true);
        setError(null);
        try {
            const complexityGuides = getComplexityGuidelines(grade);

            const prompt = `
        Role: You are a professional educational content writer specializing in Korean literacy.
        
        Task: Write a high-quality reading passage about "${topic}".
        
        [Target Audience]
        - Grade Level: ${grade}
        - Complexity Goal: Create a text appropriate for ${grade} students to test their reading comprehension.
        ${complexityGuides}
        
        [Structure Guidelines]
        1. **Introduction**: Introduce the main topic clearly.
        2. **Body**: Develop the topic with supporting details, examples, or arguments. Use logical connectors.
        3. **Conclusion**: Summarize the main points or provide a closing thought.
        
        [Configuration]
        - Length: ${options.length || 'Appropriate for grade'}
        - Difficulty: ${options.difficulty || 'Medium'}
        ${options.additionalPrompt || ''}
        
        [Style & Tone]
        - Use polite and formal Korean (해요체 or 합쇼체 depending on context, but consistent).
        - Ensure vocabulary is grade-appropriate but includes 2-3 challenging words for context clues.
        
        Return a JSON object with:
        - title: The title of the passage
        - content: The main text of the passage
        - summary: A brief summary
        - keywords: An array of 3-5 key vocabulary words from the text
      `;

            const result = await generateContent<ContentGenerationResult>(prompt, {
                responseSchema: PASSAGE_SCHEMA,
            });

            return result;
        } catch (err: any) {
            setError(err.message || 'Failed to generate passage');
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const generateQuestions = useCallback(async (
        passage: string,
        count: number,
        grade: string,
        options: { instructions?: string; responseSchema?: Schema } = {}
    ): Promise<QuestionGenerationResult | null> => {
        setIsLoading(true);
        setError(null);
        try {
            // If instructions are provided, use them heavily.
            const prompt = options.instructions ? `
        ${options.instructions}
        
        Original Text:
        """
        ${passage}
        """
      ` : `
        역할: 당신은 20년 경력의 한국어 문해력 평가 전문가입니다.
        
        과제: 다음 지문을 읽고 ${count}개의 5지선다형 문항을 출제하세요.
        
        [지문]
        ${passage}
        
        [문항 출제 기준]
        1. **형식**: 반드시 선택지 5개 (정답 1개, 오답 4개). 4지선다 절대 금지!
        2. **오답 선택지**: 그럴듯하지만 틀린 선택지를 만드세요.
           - 흔한 오해를 활용하세요.
           - 부분적 사실을 활용하세요.
           - 지문의 정보를 잘못 적용한 선택지를 포함하세요.
        3. **역량 분류**: 아래 5가지 역량을 골고루 섞어 출제하되, category 필드에 반드시 아래의 정확한 한국어 이름만 사용하세요:
           - '어휘력': 문맥 속 어휘의 의미 파악, 유의어/반의어, 관용 표현
           - '사실적 이해': 지문에 명시된 정보 확인, 세부 내용 파악
           - '추론적 이해': 행간의 의미 추론, 원인/결과 추론, 빈칸 추론
           - '구조적 이해': 글의 구조 파악, 문단 관계, 요약/주제 파악
           - '비판적 이해': 글쓴이의 의도/관점 평가, 논증의 타당성 판단
        
        ⚠️ 중요: category 필드에는 반드시 위 5개 중 하나의 정확한 한국어 이름만 입력하세요!
        영어(Facts, Inference 등)로 쓰면 안 됩니다.
        
        [출력 형식]
        JSON 객체로 반환하세요. 'questions' 배열 포함.
        각 문항 필수 필드:
        - id (정수, 1부터 순차)
        - category (문자열: '어휘력' | '사실적 이해' | '추론적 이해' | '구조적 이해' | '비판적 이해' 중 택 1)
        - question (문자열)
        - options (문자열 5개 배열)
        - answer (정수, 1-based 인덱스: 첫 번째 선택지가 1, 다섯 번째가 5. 0을 쓰지 마세요)
        - answerText (문자열: 정답 선택지의 내용을 options에 있는 그대로 똑같이 복사)
        - rationale (문자열: 정답인 이유 + 오답인 이유 설명)

        ⚠️ answer와 answerText는 반드시 같은 선택지를 가리켜야 합니다.

        대상 학년: ${grade}
      `;

            const result = await generateContent<QuestionGenerationResult>(prompt, {
                responseSchema: options.responseSchema || DEFAULT_QUESTION_SCHEMA,
            });

            // 정답 번호 정규화 — 모델이 0-based로 응답하는 사고가 반복되어,
            // answerText(정답 선택지 원문)로 실제 번호를 다시 계산한다.
            if (result?.questions) {
                result.questions = result.questions.map(normalizeAnswerIndex);
            }

            return result;
        } catch (err: any) {
            setError(err.message || 'Failed to generate questions');
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    return {
        isLoading,
        error,
        generatePassage,
        generateQuestions
    };
};
