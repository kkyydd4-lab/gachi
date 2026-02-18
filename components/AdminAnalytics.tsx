/**
 * AdminAnalytics Component
 * 
 * 관리자용 분석 대시보드
 * - 세션 데이터 조회
 * - 문항별 난이도/정답률 통계
 * - 이탈 분석
 * - 설문 피드백 요약
 */

import React, { useState, useEffect } from 'react';
import { TestSession } from '../types';
import { SessionService } from '../services/api';

interface AdminAnalyticsProps {
    isVisible: boolean;
}

// 통계 요약 타입
interface AnalyticsSummary {
    totalSessions: number;
    completedSessions: number;
    dropOffSessions: number;
    avgScore: number;
    avgDuration: number;
    categoryStats: Record<string, { avgRate: number; totalQuestions: number }>;
    difficultyFeedback: { easy: number; medium: number; hard: number };
    surveyStats: {
        avgDifficulty: number;
        recommendRate: number;
        needsGuidanceCount: number;
    };
    isDataSufficient: boolean; // 데이터 충분 여부
    totalQuestionLogs: number; // 전체 문항 로그 수
}

// 최소 데이터 임계값 (이 이상이어야 분석 결과 신뢰)
const MIN_QUESTION_LOGS_FOR_ANALYSIS = 30;
const MIN_SESSIONS_FOR_ANALYSIS = 5;

const AdminAnalytics: React.FC<AdminAnalyticsProps> = ({ isVisible }) => {
    const [sessions, setSessions] = useState<TestSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
    const [selectedTab, setSelectedTab] = useState<'overview' | 'questions' | 'dropoff' | 'feedback'>('overview');

    // 세션 데이터 로드
    useEffect(() => {
        if (!isVisible) return;

        const loadSessions = async () => {
            setLoading(true);
            try {
                const allSessions = await SessionService.getAllSessions();
                setSessions(allSessions);
                calculateSummary(allSessions);
            } catch (error) {
                console.error('세션 로드 실패:', error);
            } finally {
                setLoading(false);
            }
        };

        loadSessions();
    }, [isVisible]);

    // 통계 계산
    const calculateSummary = (data: TestSession[]) => {
        if (data.length === 0) {
            setSummary(null);
            return;
        }

        const completed = data.filter(s => s.summary.completedAt);
        const dropOff = data.filter(s => s.dropOff);

        // 전체 문항 로그 수 계산
        let totalQuestionLogs = 0;
        data.forEach(session => {
            totalQuestionLogs += session.questionLogs?.length || 0;
        });

        // 데이터 충분 여부 판단
        const isDataSufficient = totalQuestionLogs >= MIN_QUESTION_LOGS_FOR_ANALYSIS
            && data.length >= MIN_SESSIONS_FOR_ANALYSIS;

        // 카테고리별 통계
        const categoryStats: Record<string, { totalRate: number; count: number }> = {};
        data.forEach(session => {
            Object.entries(session.summary.categoryScores || {}).forEach(([cat, score]) => {
                if (!categoryStats[cat]) {
                    categoryStats[cat] = { totalRate: 0, count: 0 };
                }
                categoryStats[cat].totalRate += score.rate;
                categoryStats[cat].count += 1;
            });
        });

        // 난이도 피드백 분포
        let easyCount = 0, mediumCount = 0, hardCount = 0;
        data.forEach(session => {
            session.questionLogs?.forEach(log => {
                if (log.difficultyFeedback) {
                    if (log.difficultyFeedback <= 2) easyCount++;
                    else if (log.difficultyFeedback === 3) mediumCount++;
                    else hardCount++;
                }
            });
        });

        // 설문 통계
        const sessionsWithSurvey = data.filter(s => s.survey);
        const avgDifficulty = sessionsWithSurvey.length > 0
            ? sessionsWithSurvey.reduce((sum, s) => sum + (s.survey?.overallDifficulty || 0), 0) / sessionsWithSurvey.length
            : 0;
        const recommendRate = sessionsWithSurvey.length > 0
            ? sessionsWithSurvey.reduce((sum, s) => sum + (s.survey?.wouldRecommend || 0), 0) / sessionsWithSurvey.length
            : 0;
        const needsGuidanceCount = sessionsWithSurvey.filter(s => s.survey?.needsGuidance).length;

        setSummary({
            totalSessions: data.length,
            completedSessions: completed.length,
            dropOffSessions: dropOff.length,
            avgScore: completed.length > 0
                ? Math.round(completed.reduce((sum, s) => sum + s.summary.totalScore, 0) / completed.length)
                : 0,
            avgDuration: completed.length > 0
                ? Math.round(completed.reduce((sum, s) => sum + s.summary.durationSec, 0) / completed.length)
                : 0,
            categoryStats: Object.fromEntries(
                Object.entries(categoryStats).map(([cat, stats]) => [
                    cat,
                    { avgRate: Math.round(stats.totalRate / stats.count), totalQuestions: stats.count }
                ])
            ),
            difficultyFeedback: { easy: easyCount, medium: mediumCount, hard: hardCount },
            surveyStats: {
                avgDifficulty: Math.round(avgDifficulty * 10) / 10,
                recommendRate: Math.round(recommendRate * 10) / 10,
                needsGuidanceCount
            },
            isDataSufficient,
            totalQuestionLogs
        });
    };

    if (!isVisible) return null;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <span className="material-symbols-outlined text-4xl text-primary animate-spin">refresh</span>
                    <p className="mt-4 text-gray-500 font-bold">분석 데이터 로딩 중...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* 데이터 충분 여부 배너 */}
            {summary && !summary.isDataSufficient && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                    <span className="material-symbols-outlined text-amber-500">info</span>
                    <div>
                        <p className="font-bold text-amber-800 text-sm">초기 단계: 기본 설정 적용 중</p>
                        <p className="text-xs text-amber-600 mt-1">
                            현재 {summary.totalQuestionLogs}개의 문항 응답이 수집되었습니다.
                            최소 30개 이상의 응답과 5회 이상의 세션이 쌓이면 정확한 난이도 분석이 적용됩니다.
                            그 전까지는 관리자가 설정한 기본 난이도(상/중/하)를 사용합니다.
                        </p>
                    </div>
                </div>
            )}

            {summary && summary.isDataSufficient && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex items-start gap-3">
                    <span className="material-symbols-outlined text-green-500">verified</span>
                    <div>
                        <p className="font-bold text-green-800 text-sm">데이터 기반 분석 활성화</p>
                        <p className="text-xs text-green-600 mt-1">
                            충분한 데이터({summary.totalQuestionLogs}개 응답, {summary.totalSessions}개 세션)가 수집되어
                            실제 정답률 기반의 난이도 분석이 적용됩니다.
                        </p>
                    </div>
                </div>
            )}

            {/* 탭 네비게이션 */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {[
                    { id: 'overview' as const, label: '개요', icon: 'dashboard' },
                    { id: 'questions' as const, label: '문항 분석', icon: 'quiz' },
                    { id: 'dropoff' as const, label: '이탈 분석', icon: 'exit_to_app' },
                    { id: 'feedback' as const, label: '피드백', icon: 'rate_review' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setSelectedTab(tab.id)}
                        className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm whitespace-nowrap transition-all ${selectedTab === tab.id
                            ? 'bg-navy text-white shadow-lg'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }`}
                    >
                        <span className="material-symbols-outlined text-lg">{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* 개요 탭 */}
            {selectedTab === 'overview' && summary && (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">전체 세션</p>
                            <p className="text-3xl font-black text-navy">{summary.totalSessions}</p>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">완료율</p>
                            <p className="text-3xl font-black text-primary">
                                {summary.totalSessions > 0 ? Math.round((summary.completedSessions / summary.totalSessions) * 100) : 0}%
                            </p>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">평균 점수</p>
                            <p className="text-3xl font-black text-secondary">{summary.avgScore}점</p>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">평균 소요 시간</p>
                            <p className="text-3xl font-black text-navy">{Math.floor(summary.avgDuration / 60)}분</p>
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                        <h3 className="text-lg font-black text-navy mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">insights</span>
                            카테고리별 평균 정답률
                        </h3>
                        <div className="space-y-4">
                            {Object.entries(summary.categoryStats).map(([category, stats]) => {
                                const typedStats = stats as { avgRate: number; totalQuestions: number };
                                return (
                                    <div key={category} className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span className="font-bold text-navy">{category}</span>
                                            <span className="font-black text-primary">{typedStats.avgRate}%</span>
                                        </div>
                                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${typedStats.avgRate}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* 문항 분석 탭 */}
            {selectedTab === 'questions' && summary && (
                <div className="space-y-6">
                    <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                        <h3 className="text-lg font-black text-navy mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-secondary">analytics</span>
                            난이도 피드백 분포
                        </h3>
                        <div className="grid grid-cols-3 gap-6">
                            <div className="text-center p-6 bg-primary/5 rounded-2xl">
                                <p className="text-4xl mb-2">😊</p>
                                <p className="text-2xl font-black text-primary">{summary.difficultyFeedback.easy}</p>
                                <p className="text-sm text-gray-500 font-bold">쉬움</p>
                            </div>
                            <div className="text-center p-6 bg-gray-50 rounded-2xl">
                                <p className="text-4xl mb-2">😐</p>
                                <p className="text-2xl font-black text-navy">{summary.difficultyFeedback.medium}</p>
                                <p className="text-sm text-gray-500 font-bold">보통</p>
                            </div>
                            <div className="text-center p-6 bg-secondary/5 rounded-2xl">
                                <p className="text-4xl mb-2">😰</p>
                                <p className="text-2xl font-black text-secondary">{summary.difficultyFeedback.hard}</p>
                                <p className="text-sm text-gray-500 font-bold">어려움</p>
                            </div>
                        </div>
                    </div>

                    {/* 문항별 정답/오답 분석 */}
                    <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                        <h3 className="text-lg font-black text-navy mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">leaderboard</span>
                            문항별 정답/오답 분석
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100">
                                        <th className="text-left py-3 px-2 font-bold text-gray-400 text-xs uppercase">카테고리</th>
                                        <th className="text-left py-3 px-2 font-bold text-gray-400 text-xs uppercase">문항 ID</th>
                                        <th className="text-center py-3 px-2 font-bold text-gray-400 text-xs uppercase">정답 수</th>
                                        <th className="text-center py-3 px-2 font-bold text-gray-400 text-xs uppercase">오답 수</th>
                                        <th className="text-center py-3 px-2 font-bold text-gray-400 text-xs uppercase">정답률</th>
                                        <th className="text-center py-3 px-2 font-bold text-gray-400 text-xs uppercase">난이도</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        // Aggregate per-question stats from all sessions
                                        const questionStats: Record<number, { category: string; correct: number; incorrect: number }> = {};
                                        sessions.forEach(session => {
                                            session.questionLogs?.forEach(log => {
                                                if (!questionStats[log.questionId]) {
                                                    questionStats[log.questionId] = { category: log.category, correct: 0, incorrect: 0 };
                                                }
                                                if (log.isCorrect) {
                                                    questionStats[log.questionId].correct++;
                                                } else {
                                                    questionStats[log.questionId].incorrect++;
                                                }
                                            });
                                        });

                                        const sortedQuestions = Object.entries(questionStats)
                                            .map(([id, stats]) => ({
                                                id: parseInt(id),
                                                ...stats,
                                                total: stats.correct + stats.incorrect,
                                                rate: stats.correct + stats.incorrect > 0
                                                    ? Math.round((stats.correct / (stats.correct + stats.incorrect)) * 100)
                                                    : 0
                                            }))
                                            .sort((a, b) => a.rate - b.rate); // 정답률 낮은 순 (어려운 문항 먼저)

                                        if (sortedQuestions.length === 0) {
                                            return (
                                                <tr>
                                                    <td colSpan={6} className="text-center py-8 text-gray-400">
                                                        아직 분석할 문항 데이터가 없습니다.
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        return sortedQuestions.slice(0, 20).map(q => (
                                            <tr key={q.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                                                <td className="py-3 px-2">
                                                    <span className={`inline-block px-2 py-1 rounded-lg text-xs font-bold ${q.category.includes('어휘') ? 'bg-blue-100 text-blue-600' :
                                                        q.category.includes('사실') ? 'bg-green-100 text-green-600' :
                                                            q.category.includes('추론') ? 'bg-purple-100 text-purple-600' :
                                                                q.category.includes('구조') ? 'bg-amber-100 text-amber-600' :
                                                                    'bg-red-100 text-red-600'
                                                        }`}>
                                                        {q.category}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-2 font-bold text-navy">Q{q.id}</td>
                                                <td className="py-3 px-2 text-center font-bold text-primary">{q.correct}</td>
                                                <td className="py-3 px-2 text-center font-bold text-red-400">{q.incorrect}</td>
                                                <td className="py-3 px-2 text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                            <div className={`h-full rounded-full ${q.rate >= 70 ? 'bg-primary' : q.rate >= 40 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${q.rate}%` }} />
                                                        </div>
                                                        <span className="font-black text-navy">{q.rate}%</span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-2 text-center">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${q.rate < 40 ? 'bg-red-100 text-red-600' :
                                                        q.rate < 70 ? 'bg-amber-100 text-amber-600' :
                                                            'bg-green-100 text-green-600'
                                                        }`}>
                                                        {q.rate < 40 ? '상' : q.rate < 70 ? '중' : '하'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ));
                                    })()}
                                </tbody>
                            </table>
                        </div>
                        <p className="mt-4 text-xs text-gray-400">
                            * 정답률 낮은 순으로 정렬됩니다. 정답률 40% 미만: 상급, 40-70%: 중급, 70% 이상: 하급
                        </p>
                    </div>
                </div>
            )}

            {/* 이탈 분석 탭 */}
            {selectedTab === 'dropoff' && (
                <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm">
                    <h3 className="text-lg font-black text-navy mb-6 flex items-center gap-2">
                        <span className="material-symbols-outlined text-red-400">exit_to_app</span>
                        이탈 세션 분석
                    </h3>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="p-6 bg-red-50 rounded-2xl text-center">
                            <p className="text-3xl font-black text-red-500">{summary?.dropOffSessions || 0}</p>
                            <p className="text-sm text-gray-500 font-bold">이탈 세션 수</p>
                        </div>
                        <div className="p-6 bg-gray-50 rounded-2xl text-center">
                            <p className="text-3xl font-black text-navy">
                                {summary && summary.totalSessions > 0 ? Math.round((summary.dropOffSessions / summary.totalSessions) * 100) : 0}%
                            </p>
                            <p className="text-sm text-gray-500 font-bold">이탈률</p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <h4 className="font-bold text-navy">이탈 세션 목록</h4>
                        {sessions.filter(s => s.dropOff).length === 0 ? (
                            <p className="text-gray-400 text-sm p-4 bg-gray-50 rounded-xl">이탈 세션이 없습니다.</p>
                        ) : (
                            sessions.filter(s => s.dropOff).slice(0, 10).map(session => (
                                <div key={session.sessionId} className="p-4 bg-gray-50 rounded-xl flex justify-between items-center">
                                    <div>
                                        <p className="font-bold text-navy text-sm">{session.userInfo.grade}</p>
                                        <p className="text-xs text-gray-400">{session.dropOff?.reason} - 문항 {session.dropOff?.questionId}에서 이탈</p>
                                    </div>
                                    <p className="text-xs text-gray-400">{new Date(session.dropOff?.timestamp || '').toLocaleDateString('ko-KR')}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* 피드백 탭 */}
            {selectedTab === 'feedback' && summary && (
                <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center">
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">평균 난이도</p>
                            <p className="text-3xl font-black text-navy">{summary.surveyStats.avgDifficulty}/5</p>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center">
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">추천 의향 (NPS)</p>
                            <p className="text-3xl font-black text-primary">{summary.surveyStats.recommendRate}/5</p>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm text-center">
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-2">학습 가이드 요청</p>
                            <p className="text-3xl font-black text-secondary">{summary.surveyStats.needsGuidanceCount}명</p>
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-secondary/10 to-primary/10 p-8 rounded-3xl border border-gray-100">
                        <h4 className="font-black text-navy mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined text-secondary">lightbulb</span>
                            비즈니스 인사이트
                        </h4>
                        <ul className="space-y-3 text-sm text-gray-700">
                            {summary.surveyStats.needsGuidanceCount > 0 && (
                                <li className="flex items-start gap-2">
                                    <span className="text-primary">→</span>
                                    <span><strong>{summary.surveyStats.needsGuidanceCount}명</strong>이 학습 방향 추천을 원합니다. 상담 전환 대상!</span>
                                </li>
                            )}
                            {summary.surveyStats.avgDifficulty >= 4 && (
                                <li className="flex items-start gap-2">
                                    <span className="text-secondary">→</span>
                                    <span>평균 난이도가 높습니다. 문항 난이도 조정을 검토하세요.</span>
                                </li>
                            )}
                            {summary.surveyStats.recommendRate >= 4 && (
                                <li className="flex items-start gap-2">
                                    <span className="text-primary">→</span>
                                    <span>추천 의향이 높습니다! 바이럴 마케팅에 활용하세요.</span>
                                </li>
                            )}
                        </ul>
                    </div>
                </div>
            )}

            {/* 데이터 없음 */}
            {!summary && (
                <div className="text-center py-16">
                    <span className="material-symbols-outlined text-6xl text-gray-300">inbox</span>
                    <p className="mt-4 text-gray-400 font-bold">아직 수집된 데이터가 없습니다.</p>
                    <p className="text-sm text-gray-300">테스트가 완료되면 여기서 분석 결과를 확인할 수 있습니다.</p>
                </div>
            )}
        </div>
    );
};

export default AdminAnalytics;
