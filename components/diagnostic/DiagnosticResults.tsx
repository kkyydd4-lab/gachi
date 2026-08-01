import React from 'react';
import { TestResult, UserAccount } from '../../types';
import ReportView from '../ReportView';

interface DiagnosticResultsProps {
    result: TestResult;
    user: UserAccount;
    onHome: () => void;
    saveStatus: 'saving' | 'saved' | 'failed';
    onRetrySave: () => void;
}

const DiagnosticResults: React.FC<DiagnosticResultsProps> = ({ result, user, onHome, saveStatus, onRetrySave }) => {
    return (
        <div className="min-h-screen bg-[#F8FAFC] p-4 lg:p-8 flex flex-col items-center">
            <div className="w-full max-w-4xl relative">
                {/* 저장 상태 배너 — 결과는 계산 즉시 저장되며, 실패 시 여기서 재시도 */}
                <div className={`sticky top-2 z-50 mb-4 rounded-2xl px-5 py-3 flex items-center justify-between gap-3 shadow-md border text-sm font-bold ${
                    saveStatus === 'saved' ? 'bg-primary/10 border-primary/20 text-primary'
                        : saveStatus === 'saving' ? 'bg-white border-gray-200 text-gray-500'
                            : 'bg-red-50 border-red-200 text-red-600'
                }`}>
                    <span className="flex items-center gap-2">
                        <span className={`material-symbols-outlined text-lg ${saveStatus === 'saving' ? 'animate-spin' : ''}`}>
                            {saveStatus === 'saved' ? 'cloud_done' : saveStatus === 'saving' ? 'refresh' : 'cloud_off'}
                        </span>
                        {saveStatus === 'saved' ? '결과가 안전하게 저장되었어요'
                            : saveStatus === 'saving' ? '결과를 저장하고 있어요...'
                                : '결과 저장에 실패했어요 — 화면을 닫기 전에 다시 시도해주세요!'}
                    </span>
                    {saveStatus === 'failed' && (
                        <button
                            onClick={onRetrySave}
                            className="px-4 py-1.5 bg-red-500 text-white rounded-lg text-xs font-black hover:bg-red-600 transition-colors shrink-0"
                        >
                            다시 저장
                        </button>
                    )}
                </div>
                <ReportView
                    user={{ ...user, testResult: result }}
                    onLogout={() => { }} // Not applicable inside results view
                    onStartTest={() => { }} // Not applicable
                    currentView="REPORT"
                    setView={() => { }}
                />

                <div className="mt-8 text-center pb-20">
                    <button
                        onClick={onHome}
                        className="px-8 py-4 bg-white text-navy border border-gray-200 rounded-2xl font-black text-sm hover:bg-gray-50 transition-colors shadow-sm"
                    >
                        홈으로 돌아가기
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DiagnosticResults;
