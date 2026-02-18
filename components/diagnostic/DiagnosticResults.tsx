import React, { useEffect } from 'react';
import { PostTestSurvey, TestResult, UserAccount } from '../../types';
import * as Analytics from '../../services/analytics';
import { QuickFeedback } from '../MicroSurvey';
import ReportView from '../ReportView';

interface DiagnosticResultsProps {
    result: TestResult;
    user: UserAccount;
    onHome: () => void;
}

const DiagnosticResults: React.FC<DiagnosticResultsProps> = ({ result, user, onHome }) => {
    // 결과 화면 진입 시 이탈 방지 로그 전송
    useEffect(() => {
        // 세션 완료 처리 등은 상위에서 이미 수행됨
    }, []);

    const handleSurveySubmit = (surveyData: PostTestSurvey) => {
        const lastSessionId = sessionStorage.getItem('last_session_id');
        if (lastSessionId) {
            Analytics.updateSurvey(lastSessionId, surveyData);
            alert('소중한 의견 감사합니다! 더 좋은 서비스를 만들겠습니다.');
        }
    };

    return (
        <div className="min-h-screen bg-[#F8FAFC] p-4 lg:p-8 flex flex-col items-center">
            <div className="w-full max-w-4xl relative">
                <ReportView
                    user={{ ...user, testResult: result }}
                    onLogout={() => { }} // Not applicable inside results view
                    onStartTest={() => { }} // Not applicable
                    currentView="REPORT"
                    setView={() => { }}
                />

                {/* 하단 마이크로 서베이 (결과 페이지용) */}
                <div className="mt-12 bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 animate-slide-up">
                    <h3 className="text-lg font-black text-navy mb-4 text-center">
                        잠깐! 이번 진단 어떠셨나요?
                    </h3>
                    <QuickFeedback
                        type="post-test"
                        onFeedback={(data) => handleSurveySubmit(data as PostTestSurvey)}
                    />
                </div>

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
