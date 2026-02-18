import React, { useState, useEffect } from 'react';
import { AgentStatus, BlueprintDebugInfo } from '../../types';

interface DiagnosticLoadingProps {
    status: AgentStatus;
    debugInfo: BlueprintDebugInfo | null;
    onShowInspector: (show: boolean) => void;
    showInspector: boolean;
}

const LOGO_URL = "https://lh3.googleusercontent.com/u/0/d/16S6A8l-NgtMiOb8mjf1-hLv0AgxnX-dc=w1000-h1000";

const DiagnosticLoading: React.FC<DiagnosticLoadingProps> = ({
    status,
    debugInfo,
    onShowInspector,
    showInspector
}) => {
    const [trustContentIdx, setTrustContentIdx] = useState(0);

    // 신뢰 콘텐츠 순환 애니메이션
    useEffect(() => {
        const timer = setInterval(() => {
            setTrustContentIdx(prev => (prev + 1) % 4);
        }, 3000);
        return () => clearInterval(timer);
    }, []);

    const getStatusText = (status: AgentStatus) => {
        switch (status) {
            case 'PLANNING': return '학습자의 수준을 분석하고 있어요...';
            case 'WRITING': return '맞춤형 지문을 집필하고 있어요...';
            case 'EXAMINING': return '문해력 평가 문항을 출제하고 있어요...';
            case 'FINALIZING': return '최종 검토를 진행하고 있어요...';
            default: return '준비 중입니다...';
        }
    };

    const getStatusSubText = (status: AgentStatus) => {
        switch (status) {
            case 'PLANNING': return 'AI 교육 전문가들이 커리큘럼을 설계합니다';
            case 'WRITING': return '생성형 AI가 흥미로운 주제의 글을 작성합니다';
            case 'EXAMINING': return '평가 전문가가 5가지 역량별 문항을 구성합니다';
            case 'FINALIZING': return '잠시만 기다려주세요, 거의 다 됐어요!';
            default: return '';
        }
    };

    const steps: AgentStatus[] = ['PLANNING', 'WRITING', 'EXAMINING', 'FINALIZING'];
    const currentStepIdx = steps.indexOf(status);

    return (
        <div className="fixed inset-0 bg-white z-[60] flex flex-col items-center justify-center p-6 animate-fade-in text-center">
            <div className="relative w-32 h-32 mb-8">
                <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-20"></div>
                <div className="absolute inset-0 bg-indigo-50 rounded-full animate-pulse"></div>
                <img
                    src={LOGO_URL}
                    alt="Loading Logic"
                    className="w-full h-full object-contain relative z-10 animate-float"
                />

                {/* Agent Badges */}
                <div className={`absolute -right-4 -top-2 bg-white px-3 py-1.5 rounded-full shadow-lg border border-indigo-100 flex items-center gap-2 transition-all duration-500 ${status === 'PLANNING' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                    <span className="material-symbols-outlined text-indigo-600 text-sm">architecture</span>
                    <span className="text-[10px] font-bold text-gray-600">설계 중</span>
                </div>
                <div className={`absolute -left-4 top-10 bg-white px-3 py-1.5 rounded-full shadow-lg border border-purple-100 flex items-center gap-2 transition-all duration-500 ${status === 'WRITING' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                    <span className="material-symbols-outlined text-purple-600 text-sm">edit_note</span>
                    <span className="text-[10px] font-bold text-gray-600">집필 중</span>
                </div>
                <div className={`absolute -right-6 bottom-0 bg-white px-3 py-1.5 rounded-full shadow-lg border border-blue-100 flex items-center gap-2 transition-all duration-500 ${status === 'EXAMINING' ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                    <span className="material-symbols-outlined text-blue-600 text-sm">quiz</span>
                    <span className="text-[10px] font-bold text-gray-600">출제 중</span>
                </div>
            </div>

            <h2 className="text-2xl font-black text-navy mb-3 transition-all duration-300">
                {getStatusText(status)}
            </h2>
            <p className="text-gray-500 font-medium mb-10 transition-all duration-300">
                {getStatusSubText(status)}
            </p>

            {/* Progress Steps */}
            <div className="flex items-center gap-2 mb-12">
                {steps.map((s, i) => (
                    <div key={s} className="flex items-center">
                        <div className={`w-3 h-3 rounded-full transition-all duration-500 ${i <= currentStepIdx ? 'bg-primary scale-110' : 'bg-gray-200'}`} />
                        {i < steps.length - 1 && (
                            <div className={`w-12 h-1 transition-all duration-500 ${i < currentStepIdx ? 'bg-primary' : 'bg-gray-100'}`} />
                        )}
                    </div>
                ))}
            </div>

            {/* Trust Content Carousel */}
            <div className="bg-gray-50 rounded-2xl p-6 max-w-sm w-full relative overflow-hidden">
                <div className="absolute top-2 left-2 text-primary opacity-20">
                    <span className="material-symbols-outlined text-4xl">format_quote</span>
                </div>

                <div className="relative z-10 h-20 flex items-center justify-center">
                    {trustContentIdx === 0 && (
                        <div className="animate-fade-in space-y-2">
                            <span className="block text-2xl">📚</span>
                            <p className="text-sm font-bold text-gray-600">교과서 수록 도서 기반</p>
                        </div>
                    )}
                    {trustContentIdx === 1 && (
                        <div className="animate-fade-in space-y-2">
                            <span className="block text-2xl">🤖</span>
                            <p className="text-sm font-bold text-gray-600">최신 Google Gemini Pro 엔진</p>
                        </div>
                    )}
                    {trustContentIdx === 2 && (
                        <div className="animate-fade-in space-y-2">
                            <span className="block text-2xl">👨‍🏫</span>
                            <p className="text-sm font-bold text-gray-600">현직 교사 자문 문항 설계</p>
                        </div>
                    )}
                    {trustContentIdx === 3 && (
                        <div className="animate-fade-in space-y-2">
                            <span className="block text-2xl">📊</span>
                            <p className="text-sm font-bold text-gray-600">5가지 핵심 문해 역량 분석</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Debug Inspector Trigger */}
            {debugInfo && (
                <div className="mt-8 relative group">
                    <button
                        onClick={() => onShowInspector(!showInspector)}
                        className="text-[10px] text-gray-300 hover:text-gray-500 font-mono flex items-center gap-1 transition-colors"
                    >
                        <span className="material-symbols-outlined text-xs">terminal</span>
                        Process Inspector
                    </button>

                    {showInspector && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 bg-navy/95 backdrop-blur text-left p-4 rounded-xl shadow-2xl border border-white/10 text-[10px] text-gray-300 font-mono animate-scale-in z-50">
                            <div className="flex justify-between items-start mb-2 pb-2 border-b border-white/10">
                                <span className="text-primary font-bold">Blueprint Debug</span>
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${debugInfo.source === 'ADMIN_CUSTOM' ? 'bg-primary text-white' : 'bg-gray-700'}`}>
                                    {debugInfo.source}
                                </span>
                            </div>
                            <div className="space-y-1">
                                <p><span className="text-gray-500">Target:</span> {debugInfo.gradeGroup}</p>
                                <p><span className="text-gray-500">Subjects:</span> {debugInfo.subjects.join(', ')}</p>
                                <p><span className="text-gray-500">Prompt:</span> <span className="text-gray-400 line-clamp-1">{debugInfo.promptUsed}</span></p>
                                <div className="mt-2 pt-2 border-t border-white/10">
                                    <span className="text-gray-500 block mb-1">Architecture:</span>
                                    <div className="grid grid-cols-2 gap-1">
                                        {Object.entries(debugInfo.architecture).map(([k, v]) => (
                                            <div key={k} className="flex justify-between bg-black/20 px-2 py-0.5 rounded">
                                                <span>{k}</span>
                                                <span className="text-white">{v}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DiagnosticLoading;
