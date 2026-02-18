/**
 * Analytics Service - 데이터 로깅 및 분석
 * 
 * 목적:
 * - 문항별 상세 데이터 수집 (시간, 정답, 난이도 피드백)
 * - 세션 관리 (시작/종료/이탈)
 * - 카테고리별 점수 자동 계산
 * - Firebase 저장 (재시도 로직 포함)
 */

import { db } from './firebase';
import {
    collection,
    doc,
    setDoc,
    updateDoc,
    getDoc,
    getDocs,
    query,
    where
} from 'firebase/firestore';
import { TestSession, QuestionLog, PostTestSurvey } from '../types';

// 컬렉션 참조
const SESSIONS_COLLECTION = 'test_sessions';

// ========================================
// 유틸리티 함수
// ========================================

/**
 * 고유 세션 ID 생성
 */
const generateSessionId = (): string => {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * 재시도 로직이 포함된 Firebase 저장
 * 네트워크 오류 시 최대 3회 재시도, 실패 시 localStorage 백업
 */
const saveWithRetry = async <T>(
    saveFn: () => Promise<T>,
    backupKey: string,
    data: any,
    maxRetries = 3
): Promise<T | null> => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const result = await saveFn();
            // 성공 시 백업 삭제
            localStorage.removeItem(backupKey);
            return result;
        } catch (error) {
            console.error(`[Analytics] 저장 시도 ${attempt + 1}/${maxRetries} 실패:`, error);

            if (attempt === maxRetries - 1) {
                // 최종 실패 시 localStorage에 백업
                console.warn('[Analytics] Firebase 저장 실패, localStorage에 백업');
                localStorage.setItem(backupKey, JSON.stringify(data));
                return null;
            }

            // 지수 백오프 대기
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
    }
    return null;
};

/**
 * URL에서 유입 경로(UTM 파라미터) 추출
 */
export const getTrafficSource = (): string => {
    const params = new URLSearchParams(window.location.search);
    return params.get('utm_source') || params.get('ref') || 'direct';
};

// ========================================
// 세션 관리
// ========================================

/**
 * 새 테스트 세션 시작
 */
export const startSession = (userId: string, grade: string, school: string): TestSession => {
    const session: TestSession = {
        sessionId: generateSessionId(),
        userId,
        userInfo: {
            grade,
            school,
            source: getTrafficSource()
        },
        summary: {
            totalScore: 0,
            totalQuestions: 0,
            correctCount: 0,
            durationSec: 0,
            startedAt: new Date().toISOString(),
            categoryScores: {}
        },
        questionLogs: []
    };

    // sessionStorage에 현재 세션 저장 (새로고침 복구용)
    sessionStorage.setItem('current_session', JSON.stringify(session));

    return session;
};

/**
 * 진행 중인 세션 복구 (새로고침 시)
 */
export const recoverSession = (): TestSession | null => {
    const saved = sessionStorage.getItem('current_session');
    if (saved) {
        try {
            return JSON.parse(saved);
        } catch {
            return null;
        }
    }
    return null;
};

/**
 * 세션 상태 저장 (진행 중 주기적 호출)
 */
export const updateSessionProgress = (session: TestSession): void => {
    sessionStorage.setItem('current_session', JSON.stringify(session));
};

/**
 * 세션 종료 및 정리
 */
export const clearSession = (): void => {
    sessionStorage.removeItem('current_session');
};

// ========================================
// 문항별 데이터 로깅
// ========================================

/**
 * 문항 응답 기록
 */
export const logQuestionAnswer = (
    session: TestSession,
    questionId: number,
    category: string,
    userChoice: number | null,
    correctAnswer: number,
    timeSpent: number,
    difficultyFeedback?: 1 | 2 | 3 | 4 | 5
): TestSession => {
    const isCorrect = userChoice === correctAnswer;

    const log: QuestionLog = {
        questionId,
        category,
        userChoice,
        isCorrect,
        timeSpent,
        timestamp: new Date().toISOString(),
        difficultyFeedback
    };

    // 기존 로그 업데이트 또는 추가
    const existingIdx = session.questionLogs.findIndex(l => l.questionId === questionId);
    if (existingIdx >= 0) {
        session.questionLogs[existingIdx] = log;
    } else {
        session.questionLogs.push(log);
    }

    // 세션 저장
    updateSessionProgress(session);

    return session;
};

/**
 * 이탈 로그 기록
 */
export const logDropOff = (
    session: TestSession,
    questionId: number,
    passageIdx: number,
    reason: 'REFRESH' | 'CLOSE' | 'CANCEL' | 'TIMEOUT'
): TestSession => {
    session.dropOff = {
        questionId,
        passageIdx,
        timestamp: new Date().toISOString(),
        reason
    };

    // 이탈 시 즉시 Firebase 저장 시도
    saveSessionToFirebase(session);

    return session;
};

// ========================================
// 점수 계산
// ========================================

/**
 * 카테고리별 점수 자동 계산
 */
export const calculateCategoryScores = (
    logs: QuestionLog[]
): Record<string, { correct: number; total: number; rate: number }> => {
    const scores: Record<string, { correct: number; total: number; rate: number }> = {};

    logs.forEach(log => {
        if (!scores[log.category]) {
            scores[log.category] = { correct: 0, total: 0, rate: 0 };
        }

        scores[log.category].total += 1;
        if (log.isCorrect) {
            scores[log.category].correct += 1;
        }
    });

    // 정답률 계산
    Object.keys(scores).forEach(category => {
        const s = scores[category];
        s.rate = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
    });

    return scores;
};

/**
 * 세션 요약 데이터 계산 (테스트 완료 시 호출)
 */
export const calculateSessionSummary = (
    session: TestSession,
    startTime: number
): TestSession => {
    const logs = session.questionLogs;
    const categoryScores = calculateCategoryScores(logs);

    const correctCount = logs.filter(l => l.isCorrect).length;
    const totalQuestions = logs.length;
    const totalScore = totalQuestions > 0
        ? Math.round((correctCount / totalQuestions) * 100)
        : 0;

    session.summary = {
        totalScore,
        totalQuestions,
        correctCount,
        durationSec: Math.round((Date.now() - startTime) / 1000),
        startedAt: session.summary.startedAt,
        completedAt: new Date().toISOString(),
        categoryScores
    };

    return session;
};

// ========================================
// Firebase 저장
// ========================================

/**
 * 세션 데이터 Firebase 저장
 */
export const saveSessionToFirebase = async (session: TestSession): Promise<boolean> => {
    const result = await saveWithRetry(
        async () => {
            await setDoc(doc(db, SESSIONS_COLLECTION, session.sessionId), session);
            return true;
        },
        `pending_session_${session.sessionId}`,
        session
    );

    return result !== null;
};

/**
 * 설문 데이터 업데이트
 */
export const updateSurvey = async (
    sessionId: string,
    survey: PostTestSurvey
): Promise<boolean> => {
    const result = await saveWithRetry(
        async () => {
            await updateDoc(doc(db, SESSIONS_COLLECTION, sessionId), { survey });
            return true;
        },
        `pending_survey_${sessionId}`,
        { sessionId, survey }
    );

    return result !== null;
};

/**
 * 유저의 세션 히스토리 조회
 */
export const getSessionsByUser = async (userId: string): Promise<TestSession[]> => {
    try {
        const q = query(
            collection(db, SESSIONS_COLLECTION),
            where('userId', '==', userId)
        );
        const snapshot = await getDocs(q);

        return snapshot.docs.map(doc => doc.data() as TestSession);
    } catch (error) {
        console.error('[Analytics] 세션 조회 실패:', error);
        return [];
    }
};

/**
 * 로컬에 백업된 세션 복구 및 재전송
 */
export const retryPendingSessions = async (): Promise<void> => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('pending_session'));

    for (const key of keys) {
        try {
            const data = JSON.parse(localStorage.getItem(key) || '');
            if (data?.sessionId) {
                await setDoc(doc(db, SESSIONS_COLLECTION, data.sessionId), data);
                localStorage.removeItem(key);

            }
        } catch (error) {
            console.error(`[Analytics] 백업 세션 복구 실패: ${key}`, error);
        }
    }
};

// ========================================
// 분석 유틸리티
// ========================================

/**
 * 설문 + 성적 데이터 매핑 분석
 * 예: "70점 맞은 학생이 '너무 어렵다'고 답변"
 */
export const mapSurveyToPerformance = (session: TestSession): {
    score: number;
    perceivedDifficulty: number | null;
    difficultyGap: number | null;  // 양수: 실제보다 어렵게 느낌, 음수: 실제보다 쉽게 느낌
    wouldRecommend: number | null;
    needsGuidance: boolean;
} => {
    const score = session.summary.totalScore;
    const survey = session.survey;

    if (!survey) {
        return {
            score,
            perceivedDifficulty: null,
            difficultyGap: null,
            wouldRecommend: null,
            needsGuidance: false
        };
    }

    // 점수를 난이도 척도로 변환 (100점 = 1, 0점 = 5)
    const expectedDifficulty = 5 - (score / 25);  // 0-100 -> 5-1
    const difficultyGap = survey.overallDifficulty - expectedDifficulty;

    return {
        score,
        perceivedDifficulty: survey.overallDifficulty,
        difficultyGap: Math.round(difficultyGap * 10) / 10,
        wouldRecommend: survey.wouldRecommend,
        needsGuidance: survey.needsGuidance || false
    };
};

/**
 * 문항별 평균 소요 시간 분석
 */
export const analyzeTimeByQuestion = (
    logs: QuestionLog[]
): { questionId: number; avgTime: number; category: string }[] => {
    return logs.map(log => ({
        questionId: log.questionId,
        avgTime: log.timeSpent,
        category: log.category
    }));
};

// 서비스 초기화 시 백업 세션 복구 시도
if (typeof window !== 'undefined') {
    retryPendingSessions();
}

export default {
    startSession,
    recoverSession,
    updateSessionProgress,
    clearSession,
    logQuestionAnswer,
    logDropOff,
    calculateCategoryScores,
    calculateSessionSummary,
    saveSessionToFirebase,
    updateSurvey,
    getSessionsByUser,
    getTrafficSource,
    mapSurveyToPerformance,
    analyzeTimeByQuestion
};
