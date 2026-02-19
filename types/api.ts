import { z } from 'zod';
import { GradeGroupType, Question } from './domain';

// ========================================
// AI Response Validation Schemes (Zod)
// ========================================

export const QuestionSchema = z.object({
    category: z.enum(['어휘력', '사실적 이해', '추론적 이해', '비판적 이해', '구조적 이해']),
    question: z.string().min(1),
    options: z.array(z.string()).length(5),
    answer: z.number().int().min(1).max(5),
    rationale: z.string().optional()
});

export const AIWriterResponseSchema = z.object({
    title: z.string().min(1),
    content: z.string().min(10)
});

export const AIExaminerResponseSchema = z.object({
    modified_content: z.string().optional(),
    questions: z.array(QuestionSchema).min(1)
});

// ========================================
// API Interfaces
// ========================================

/**
 * 문항별 상세 로그
 * 각 문항에서 유저가 선택한 답안, 소요 시간, 난이도 피드백 등을 기록
 */
export interface QuestionLog {
    questionId: number;           // 문항 번호
    category: string;             // 역량 카테고리 (어휘력, 추론적 이해 등)
    userChoice: number | null;    // 유저가 선택한 답안 (null = 미응답)
    isCorrect: boolean;           // 정오표
    timeSpent: number;            // 해당 문항 체류 시간 (밀리초)
    timestamp: string;            // 문항 완료 시각 (ISO 문자열)
    difficultyFeedback?: 1 | 2 | 3 | 4 | 5;  // 마이크로 서베이: 난이도 피드백 (1=매우 쉬움 ~ 5=매우 어려움)
}

/**
 * 테스트 종료 후 설문
 * 결과 페이지에서 수집하는 유저 피드백
 */
export interface PostTestSurvey {
    overallDifficulty: 1 | 2 | 3 | 4 | 5;    // 전체 난이도 (1=너무 쉬움 ~ 5=너무 어려움)
    wasExplanationClear: boolean;             // 설명이 충분히 이해되었나요?
    wouldRecommend: 1 | 2 | 3 | 4 | 5;       // 친구에게 추천 의향 (NPS)
    needsGuidance?: boolean;                  // 학습 방향 추천 필요 여부
    additionalFeedback?: string;              // 추가 의견 (선택)
}

/**
 * 테스트 세션 전체 데이터
 * 한 번의 테스트 수행에 대한 모든 정보를 담는 최상위 구조
 */
export interface TestSession {
    sessionId: string;           // 고유 세션 ID
    userId: string;              // 유저 ID
    userInfo: {
        grade: string;             // 학년
        school: string;            // 학교
        source?: string;           // 유입 경로 (utm_source)
    };
    summary: {
        totalScore: number;        // 총점
        totalQuestions: number;    // 전체 문항 수
        correctCount: number;      // 정답 수
        durationSec: number;       // 총 소요 시간 (초)
        startedAt: string;         // 테스트 시작 시각
        completedAt?: string;      // 테스트 완료 시각 (이탈 시 없음)
        categoryScores: Record<string, {  // 카테고리별 점수
            correct: number;
            total: number;
            rate: number;            // 정답률 (0-100)
        }>;
    };
    questionLogs: QuestionLog[];  // 문항별 상세 로그
    assetIds?: string[];          // [New] 세션에 사용된 지문 ID 목록 (중복 출제 방지용)
    learningSessionId?: string;   // [New] 할당된 차시 ID
    survey?: PostTestSurvey;      // 종료 후 설문 (선택)
    dropOff?: {                   // 이탈 정보 (완료 시 null)
        questionId: number;         // 이탈 시점 문항 번호
        passageIdx: number;         // 이탈 시점 지문 인덱스
        timestamp: string;          // 이탈 시각
        reason: 'REFRESH' | 'CLOSE' | 'CANCEL' | 'TIMEOUT';  // 이탈 사유
    };
}
