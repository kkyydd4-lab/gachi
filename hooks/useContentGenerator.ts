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
            responseSchema?: Schema;
        }
    ) => Promise<QuestionGenerationResult | null>;
    generatePassageWithQuestions: (
        topic: string,
        grade: string,
        questionDistribution: Record<string, number>,
        options?: {
            length?: string;
            difficulty?: string;
            style?: string;
        }
    ) => Promise<CombinedGenerationResult | null>;
}

interface ContentGenerationResult {
    title: string;
    content: string;
    summary: string;
    keywords: string[];
}

export interface QuestionGenerationResult {
    modified_content?: string;
    questions: Question[];
}

export interface CombinedGenerationResult {
    title: string;
    content: string;
    summary: string;
    keywords: string[];
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
                    id: { type: Type.INTEGER },
                    category: { type: Type.STRING },
                    type: { type: Type.STRING },
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: 5, maxItems: 5 },
                    answer: { type: Type.INTEGER },
                    rationale: { type: Type.STRING },
                },
                required: ["question", "options", "answer", "category"],
            },
        },
    },
    required: ["questions"],
};

const COMBINED_SCHEMA: Schema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING },
        content: { type: Type.STRING },
        summary: { type: Type.STRING },
        keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        questions: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.INTEGER },
                    category: { type: Type.STRING },
                    type: { type: Type.STRING },
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING }, minItems: 5, maxItems: 5 },
                    answer: { type: Type.INTEGER },
                    rationale: { type: Type.STRING },
                },
                required: ["question", "options", "answer", "category"],
            },
        },
    },
    required: ["title", "content", "summary", "keywords", "questions"],
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
        - answer (정수, 1-based 인덱스)
        - rationale (문자열: 정답인 이유 + 오답인 이유 설명)

        대상 학년: ${grade}
      `;

            const result = await generateContent<QuestionGenerationResult>(prompt, {
                responseSchema: options.responseSchema || DEFAULT_QUESTION_SCHEMA,
            });

            return result;
        } catch (err: any) {
            setError(err.message || 'Failed to generate questions');
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * 🚀 통합 생성: 지문 + 문항을 1회 API 호출로 동시 생성
     * - 기존: 2회 호출 (지문 1회 + 문항 1회) → 통합: 1회 호출
     * - 4주제 기준: 8회 → 4회 호출로 50% 속도 향상
     */
    const generatePassageWithQuestions = useCallback(async (
        topic: string,
        grade: string,
        questionDistribution: Record<string, number>,
        options: { length?: string; difficulty?: string; style?: string } = {}
    ): Promise<CombinedGenerationResult | null> => {
        setIsLoading(true);
        setError(null);
        try {
            const complexityGuides = getComplexityGuidelines(grade);
            const totalQuestions = Object.values(questionDistribution).reduce((a, b) => a + b, 0);
            const distributionText = Object.entries(questionDistribution)
                .filter(([_, count]) => count > 0)
                .map(([cat, count]) => `- ${cat}: ${count}문항`)
                .join('\n');

            const prompt = `역할: 당신은 20년 경력의 한국어 문해력 평가 전문 콘텐츠 제작자입니다.

과제: "${topic}" 주제로 읽기 지문을 작성하고, 해당 지문에 대한 ${totalQuestions}개의 5지선다형 문항을 함께 출제하세요.

[대상]
- 학년: ${grade}
${complexityGuides}

[지문 작성 규칙]
- 길이: ${options.length || '학년에 적합한 길이'}
- 난이도: ${options.difficulty || '중'}
- 문체: ${options.style || '학년에 적합한 문체'}
- 구조: 서론-본론-결론이 명확한 글
- 언어: 한국어만 사용

[문항 출제 규칙]
1. 반드시 선택지 5개 (정답 1개, 오답 4개)
2. 오답은 그럴듯하지만 틀린 선택지로 구성
3. 아래 역량 배분을 정확히 따르세요:
${distributionText}

4. category 필드에는 반드시 다음 중 하나만 사용:
   '어휘력' | '사실적 이해' | '추론적 이해' | '구조적 이해' | '비판적 이해'

[JSON 출력 형식]
{
  "title": "지문 제목",
  "content": "지문 본문 전체",
  "summary": "지문 요약 (1-2문장)",
  "keywords": ["핵심단어1", "핵심단어2", "핵심단어3"],
  "questions": [
    {
      "id": 1,
      "category": "역량명",
      "question": "문항 텍스트",
      "options": ["선택지1", "선택지2", "선택지3", "선택지4", "선택지5"],
      "answer": 1,
      "rationale": "정답/오답 설명"
    }
  ]
}`;

            const result = await generateContent<CombinedGenerationResult>(prompt, {
                responseSchema: COMBINED_SCHEMA,
            });

            return result;
        } catch (err: any) {
            setError(err.message || 'Failed to generate content');
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    return {
        isLoading,
        error,
        generatePassage,
        generateQuestions,
        generatePassageWithQuestions
    };
};

