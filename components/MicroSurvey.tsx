/**
 * MicroSurvey Component
 * 
 * 목적:
 * 1. 테스트 도중: 고난도 문항 후 빠른 난이도 피드백 (이모지 1탭)
 * 2. 테스트 종료 후: 3개 필수 질문 설문
 */

import React, { useState, useEffect } from 'react';
import { PostTestSurvey } from '../types';

// ========================================
// 1. 문항 중간 난이도 피드백 (Quick Feedback)
// ========================================

interface QuickFeedbackProps {
    isVisible: boolean;
    onFeedback: (difficulty: 1 | 2 | 3 | 4 | 5) => void;
    onClose: () => void;
}

export const QuickFeedback: React.FC<QuickFeedbackProps> = ({
    isVisible,
    onFeedback,
    onClose
}) => {
    // 1.5초 후 자동 닫힘
    useEffect(() => {
        if (isVisible) {
            const timer = setTimeout(() => {
                onClose();
            }, 3000);  // 응답 시간 여유를 위해 3초
            return () => clearTimeout(timer);
        }
    }, [isVisible, onClose]);

    if (!isVisible) return null;

    const handleSelect = (difficulty: 1 | 2 | 3 | 4 | 5) => {
        onFeedback(difficulty);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center pb-8 pointer-events-none">
            <div
                className="bg-white rounded-3xl shadow-2xl border border-gray-100 p-6 mx-4 max-w-sm w-full pointer-events-auto animate-slide-up"
                style={{
                    animation: 'slideUp 0.3s ease-out'
                }}
            >
                <p className="text-center text-navy font-bold text-sm mb-4">
                    이 문제는 어땠나요?
                </p>
                <FeedbackButtons onSelect={handleSelect} />
                <button
                    onClick={onClose}
                    className="w-full mt-4 text-gray-300 text-xs font-bold hover:text-gray-500 transition-colors"
                >
                    건너뛰기
                </button>
            </div>
        </div>
    );
};

// ========================================
// 2. 테스트 종료 후 설문 (Post Test Survey)
// ========================================

interface PostTestSurveyProps {
    isVisible: boolean;
    onSubmit: (survey: PostTestSurvey) => void;
    onSkip: () => void;
}

export const PostTestSurveyForm: React.FC<PostTestSurveyProps> = ({
    isVisible,
    onSubmit,
    onSkip
}) => {
    const [difficulty, setDifficulty] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
    const [explanationClear, setExplanationClear] = useState<boolean | null>(null);
    const [recommend, setRecommend] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
    const [needsGuidance, setNeedsGuidance] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isVisible) return null;

    const canSubmit = difficulty !== null && explanationClear !== null && recommend !== null;

    const handleSubmit = () => {
        if (!canSubmit) return;
        setIsSubmitting(true);

        onSubmit({
            overallDifficulty: difficulty,
            wasExplanationClear: explanationClear,
            wouldRecommend: recommend,
            needsGuidance
        });
    };

    return (
        <div className="bg-gradient-to-br from-primary/5 to-secondary/5 rounded-[2.5rem] p-8 md:p-12 border border-gray-100 mt-10">
            <div className="flex items-center gap-3 mb-8">
                <span className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary text-2xl">rate_review</span>
                </span>
                <div>
                    <h3 className="text-xl font-black text-navy">테스트 피드백</h3>
                    <p className="text-gray-400 text-sm font-medium">더 나은 서비스를 위해 의견을 나눠주세요 (30초)</p>
                </div>
            </div>

            <div className="space-y-8">
                {/* Q1: 전체 난이도 */}
                <div className="bg-white rounded-2xl p-6 border border-gray-100">
                    <p className="font-bold text-navy mb-4">1. 전체적인 난이도는 어땠나요?</p>
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-400 font-bold">너무 쉬움</span>
                        <div className="flex gap-2">
                            {([1, 2, 3, 4, 5] as const).map((v) => (
                                <button
                                    key={v}
                                    onClick={() => setDifficulty(v)}
                                    className={`w-10 h-10 rounded-full font-bold text-sm transition-all ${difficulty === v
                                        ? 'bg-primary text-white shadow-lg scale-110'
                                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                        }`}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                        <span className="text-xs text-gray-400 font-bold">너무 어려움</span>
                    </div>
                </div>

                {/* Q2: 설명 이해도 */}
                <div className="bg-white rounded-2xl p-6 border border-gray-100">
                    <p className="font-bold text-navy mb-4">2. 설명이 충분히 이해되었나요?</p>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setExplanationClear(true)}
                            className={`flex-1 py-4 rounded-xl font-bold transition-all ${explanationClear === true
                                ? 'bg-primary text-white shadow-lg'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                        >
                            네, 이해됐어요 👍
                        </button>
                        <button
                            onClick={() => setExplanationClear(false)}
                            className={`flex-1 py-4 rounded-xl font-bold transition-all ${explanationClear === false
                                ? 'bg-secondary text-white shadow-lg'
                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                }`}
                        >
                            조금 어려웠어요 🤔
                        </button>
                    </div>
                </div>

                {/* Q3: 추천 의향 (NPS) */}
                <div className="bg-white rounded-2xl p-6 border border-gray-100">
                    <p className="font-bold text-navy mb-4">3. 이 테스트를 친구에게 추천하고 싶나요?</p>
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-400 font-bold">전혀 아니요</span>
                        <div className="flex gap-2">
                            {([1, 2, 3, 4, 5] as const).map((v) => (
                                <button
                                    key={v}
                                    onClick={() => setRecommend(v)}
                                    className={`w-10 h-10 rounded-full font-bold text-sm transition-all ${recommend === v
                                        ? 'bg-navy text-white shadow-lg scale-110'
                                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                        }`}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                        <span className="text-xs text-gray-400 font-bold">적극 추천!</span>
                    </div>
                </div>

                {/* 추가: 학습 가이드 필요 */}
                <div className="bg-white rounded-2xl p-6 border border-gray-100">
                    <label className="flex items-center gap-4 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={needsGuidance}
                            onChange={(e) => setNeedsGuidance(e.target.checked)}
                            className="w-5 h-5 rounded-lg border-2 border-gray-300 text-primary focus:ring-primary"
                        />
                        <div>
                            <p className="font-bold text-navy">학습 방향 추천이 필요하신가요?</p>
                            <p className="text-xs text-gray-400">체크하시면 맞춤 학습 가이드를 보내드려요</p>
                        </div>
                    </label>
                </div>
            </div>

            <div className="flex gap-4 mt-10">
                <button
                    onClick={onSkip}
                    className="px-8 py-4 rounded-2xl text-gray-400 font-bold hover:bg-gray-100 transition-all"
                >
                    건너뛰기
                </button>
                <button
                    onClick={handleSubmit}
                    disabled={!canSubmit || isSubmitting}
                    className={`flex-1 py-4 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-2 ${canSubmit && !isSubmitting
                        ? 'bg-primary text-white shadow-xl shadow-primary/30 hover:brightness-105 active:scale-[0.98]'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                >
                    {isSubmitting ? (
                        <>
                            <span className="material-symbols-outlined animate-spin">refresh</span>
                            제출 중...
                        </>
                    ) : (
                        <>
                            피드백 제출하기
                            <span className="material-symbols-outlined">send</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
};

// ========================================
// CSS 애니메이션 (index.html에 추가 필요)
// ========================================
// @keyframes slideUp {
//   from { transform: translateY(100%); opacity: 0; }
//   to { transform: translateY(0); opacity: 1; }
// }
// .animate-slide-up { animation: slideUp 0.3s ease-out; }

export const FeedbackButtons: React.FC<{
    onSelect: (difficulty: 1 | 2 | 3 | 4 | 5) => void;
}> = ({ onSelect }) => {
    return (
        <div className="flex justify-center gap-3">
            {[
                { value: 1 as const, emoji: '😊', label: '쉬움' },
                { value: 2 as const, emoji: '🙂', label: '' },
                { value: 3 as const, emoji: '😐', label: '보통' },
                { value: 4 as const, emoji: '😓', label: '' },
                { value: 5 as const, emoji: '😰', label: '어려움' },
            ].map((item) => (
                <button
                    key={item.value}
                    onClick={() => onSelect(item.value)}
                    className="flex flex-col items-center p-2 rounded-xl hover:bg-gray-50 active:scale-95 transition-all"
                >
                    <span className="text-3xl mb-1">{item.emoji}</span>
                    {item.label && (
                        <span className="text-[10px] text-gray-400 font-bold">{item.label}</span>
                    )}
                </button>
            ))}
        </div>
    );
};

export default {
    QuickFeedback,
    PostTestSurveyForm,
    FeedbackButtons
};
