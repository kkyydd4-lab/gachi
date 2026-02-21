import React, { useState, useEffect } from 'react';
import { DiagnosticPassage } from '../../types';
import { renderPassageContent } from '../../utils/renderPassageContent';

interface DiagnosticTestProps {
    passages: DiagnosticPassage[];
    currentPassageIdx: number;
    answers: Record<number, number>;
    onAnswer: (questionId: number, choice: number, category: string, correctAnswer: number) => void;
    onNextPassage: () => void;
    onPrevPassage: () => void;
    onSubmit: () => void;
}

const DiagnosticTest: React.FC<DiagnosticTestProps> = ({
    passages,
    currentPassageIdx,
    answers,
    onAnswer,
    onNextPassage,
    onPrevPassage,
    onSubmit
}) => {
    const [mobileTab, setMobileTab] = useState<'passage' | 'questions'>('passage');
    const [highlightedSentence, setHighlightedSentence] = useState<string | null>(null);

    const currentPassage = passages[currentPassageIdx];
    const progress = Math.round(((currentPassageIdx) / passages.length) * 100);

    // 학년별 테마 색상 (상위 컴포넌트에서 전달받거나 context로 관리하면 좋음, 일단 하드코딩)
    const themeColor = 'text-indigo-600';
    const bgColor = 'bg-indigo-600';

    const renderContent = (content: string) => renderPassageContent(content);

    return (
        <div className="flex flex-col h-screen bg-[#F8FAFC]">
            {/* Header */}
            <header className="px-6 py-4 bg-white/80 backdrop-blur border-b border-gray-100 sticky top-0 z-40">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg flex items-center justify-center text-white font-black text-lg">
                            {currentPassageIdx + 1}
                        </div>
                        <div>
                            <h1 className="text-lg font-black text-navy flex items-center gap-2">
                                지문 읽기 <span className="text-gray-300">|</span> <span className={themeColor}>{currentPassage?.subject}</span>
                            </h1>
                            <div className="flex items-center gap-2 text-xs text-gray-400 font-bold mt-0.5">
                                <span>진행률 {progress}%</span>
                                <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className={`h-full ${bgColor} transition-all duration-500`} style={{ width: `${progress}%` }} />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="hidden md:inline-block px-3 py-1 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold">
                            AI 출제 위원: Google Gemini
                        </span>
                    </div>
                </div>
            </header>

            {/* Main Layout */}
            <main className="flex-1 overflow-auto relative">
                <div className="max-w-7xl mx-auto h-full grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-8 p-0 lg:p-6">

                    {/* Left: Passage (Mobile: Tab 1) */}
                    <div className={`flex flex-col transition-all duration-300 ${mobileTab === 'passage' ? 'flex' : 'hidden lg:flex'}`}>
                        <div className="bg-white lg:rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col relative group">
                            <div className="p-6 lg:p-10 pb-32 lg:pb-10 overflow-y-auto custom-scrollbar">
                                <div className="prose prose-lg max-w-none">
                                    <h2 className="text-2xl font-black text-navy mb-8 leading-snug">{currentPassage?.title}</h2>
                                    <div className="text-[17px] md:text-[19px] leading-[2.2] text-gray-700 font-serif tracking-wide whitespace-pre-line">
                                        {renderContent(currentPassage?.content || '')}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Questions (Mobile: Tab 2) */}
                    <div className={`flex flex-col transition-all duration-300 bg-[#F8FAFC] lg:bg-transparent ${mobileTab === 'questions' ? 'flex' : 'hidden lg:flex'}`}>
                        <div className="p-4 lg:p-0 space-y-6 pb-40 lg:pb-0">
                            {currentPassage?.questions.map((q, idx) => (
                                <div
                                    key={q.id}
                                    id={`q-${q.id}`}
                                    className={`bg-white rounded-[2rem] p-6 lg:p-8 shadow-sm border transition-all duration-300 ${answers[q.id]
                                        ? 'border-indigo-100 ring-2 ring-indigo-50'
                                        : 'border-gray-100 hover:border-gray-200'
                                        }`}
                                >
                                    <div className="flex items-start gap-4 mb-6">
                                        <span className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${answers[q.id] ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'
                                            }`}>
                                            {idx + 1}
                                        </span>
                                        <div className="flex-1">
                                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500 mb-2">
                                                {q.category}
                                            </span>
                                            <h3 className="text-lg font-bold text-navy leading-snug">
                                                {q.question.split(/(\[.*?\])/g).map((part, i) => {
                                                    if (part.match(/\[.*?\]/)) {
                                                        // Extract content inside brackets if needed, for now just remove brackets
                                                        return <span key={i} className="text-primary">{part.replace(/[\[\]]/g, '')}</span>;
                                                    }
                                                    return part;
                                                })}
                                            </h3>
                                            {/* [Phase 2] 보기 박스 렌더링 */}
                                            {q.context && q.context.content && (
                                                <div className="mt-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
                                                    <div className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-sm">article</span>
                                                        &lt;보기&gt;
                                                    </div>
                                                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                                                        {q.context.content}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-3 pl-0 md:pl-12">
                                        {q.options.map((opt, optIdx) => (
                                            <button
                                                key={optIdx}
                                                onClick={() => onAnswer(q.id, optIdx + 1, q.category, q.answer)}
                                                className={`w-full text-left p-4 rounded-xl text-[15px] transition-all duration-200 flex items-start gap-3 group ${answers[q.id] === optIdx + 1
                                                    ? 'bg-indigo-50 text-indigo-700 font-bold ring-1 ring-indigo-200'
                                                    : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                                                    }`}
                                            >
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 transition-colors ${answers[q.id] === optIdx + 1
                                                    ? 'border-indigo-500 bg-indigo-500'
                                                    : 'border-gray-300 group-hover:border-gray-400'
                                                    }`}>
                                                    {answers[q.id] === optIdx + 1 && <div className="w-2 h-2 bg-white rounded-full" />}
                                                </div>
                                                <span className="leading-relaxed">{opt}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            {/* Navigation Buttons for Question Area (Desktop) */}
                            <div className="hidden lg:flex justify-between items-center pt-8 pb-12">
                                <button
                                    onClick={onPrevPassage}
                                    disabled={currentPassageIdx === 0}
                                    className="px-6 py-3 rounded-xl text-sm font-bold text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                                >
                                    이전 지문
                                </button>

                                {currentPassageIdx < passages.length - 1 ? (
                                    <button
                                        onClick={onNextPassage}
                                        className="px-8 py-4 bg-navy text-white rounded-2xl font-black text-lg shadow-xl shadow-navy/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                                    >
                                        다음 지문으로
                                        <span className="material-symbols-outlined">arrow_forward</span>
                                    </button>
                                ) : (
                                    <button
                                        onClick={onSubmit}
                                        className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-500/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                                    >
                                        진단 종료하기
                                        <span className="material-symbols-outlined">check_circle</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Floating Mobile Tabs */}
                <div className="lg:hidden absolute bottom-6 left-6 right-6 z-50">
                    <div className="bg-navy/90 backdrop-blur-md rounded-full shadow-2xl p-1.5 flex mb-4">
                        <button
                            onClick={() => setMobileTab('passage')}
                            className={`flex-1 py-3 rounded-full text-sm font-black transition-all ${mobileTab === 'passage' ? 'bg-white text-navy shadow-lg' : 'text-white/50'
                                }`}
                        >
                            지문 읽기
                        </button>
                        <button
                            onClick={() => setMobileTab('questions')}
                            className={`flex-1 py-3 rounded-full text-sm font-black transition-all ${mobileTab === 'questions' ? 'bg-white text-navy shadow-lg' : 'text-white/50'
                                }`}
                        >
                            문제 풀기
                        </button>
                    </div>

                    {/* Mobile Navigation */}
                    {mobileTab === 'questions' && (
                        <div className="flex gap-2">
                            <button
                                onClick={onPrevPassage}
                                disabled={currentPassageIdx === 0}
                                className="flex-1 bg-white text-gray-500 py-3 rounded-2xl font-bold shadow-lg disabled:opacity-50"
                            >
                                이전
                            </button>
                            {currentPassageIdx < passages.length - 1 ? (
                                <button
                                    onClick={onNextPassage}
                                    className="flex-[2] bg-indigo-600 text-white py-3 rounded-2xl font-bold shadow-lg shadow-indigo-500/30"
                                >
                                    다음 지문
                                </button>
                            ) : (
                                <button
                                    onClick={onSubmit}
                                    className="flex-[2] bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-2xl font-bold shadow-lg"
                                >
                                    제출하기
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default DiagnosticTest;
