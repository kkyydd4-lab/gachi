import React, { useState, useEffect } from 'react';
import { UserAccount, TestResult, GradeGroupType, Asset, ConsultationRequest, OperationManual, ManualCategory, TeacherQualityCheck, QUALITY_CHECK_CRITERIA } from '../types';
import { SessionService, AssetService, ConsultationService, ManualService, TeacherQualityService } from '../services/api';
import { generateContent } from '../services/gemini';
import { getGradeSegment } from '../data/gradeSegments';
import ReportView from './ReportView'; // 상담 모드에서 재사용

interface TeacherDashboardProps {
    user: UserAccount;
    onLogout: () => void;
}

// Mock Data removed
import { AuthService } from '../services/api';

const MANUAL_CATEGORIES: ManualCategory[] = ['신규 상담 대응', '학부모 불만 대응', '모집·홍보', '재등록 관리', '교사 관리', '지점 운영'];

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ user, onLogout }) => {
    const [activeTab, setActiveTab] = useState<'briefing' | 'students' | 'consultation' | 'manuals'>('briefing');
    const [selectedStudent, setSelectedStudent] = useState<UserAccount | null>(null);
    const [students, setStudents] = useState<UserAccount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingRequests, setPendingRequests] = useState<ConsultationRequest[]>([]);
    const [manuals, setManuals] = useState<OperationManual[]>([]);
    const [openManualId, setOpenManualId] = useState<string | null>(null);
    const [myQualityChecks, setMyQualityChecks] = useState<TeacherQualityCheck[]>([]);

    // AI 상담 스크립트 (상담 모드)
    const [consultScript, setConsultScript] = useState('');
    const [isGeneratingScript, setIsGeneratingScript] = useState(false);
    const [scriptError, setScriptError] = useState('');

    const generateConsultScript = async (student: UserAccount) => {
        if (isGeneratingScript) return;
        setIsGeneratingScript(true);
        setScriptError('');
        try {
            const result = student.testResult;
            const segment = getGradeSegment(student.grade || '');
            const competencyLines = result
                ? result.competencies.filter(c => c.total > 0).map(c => `- ${c.label}: ${c.score}점 (평균 ${c.average}점)`).join('\n')
                : '진단 결과 없음';
            const careZones = result ? result.competencies.filter(c => c.total > 0 && c.score < 60).map(c => c.label).join(', ') : '';

            const prompt = `당신은 초중등 문해력 전문 학원의 베테랑 상담 실장입니다. 아래 학생의 진단 데이터를 바탕으로 학부모 상담 스크립트를 작성해주세요.

[학생 정보]
- 이름: ${student.name}
- 학년: ${student.grade || '미상'} (${student.school || '학교 미상'})
${segment ? `- 이 시기 학부모의 대표적 고민: ${segment.concern}\n- 권장 과정: ${segment.product}` : ''}

[진단 결과]
${result ? `- 총점: ${result.totalScore}점 / 레벨: ${result.level}` : '- 아직 진단 미응시'}
${competencyLines}
${careZones ? `- 집중 케어 필요 영역: ${careZones}` : ''}
${result?.teacherNote ? `- 선생님 관찰 노트: ${result.teacherNote}` : ''}

[작성 지침]
1. "말하기"보다 "듣기" 우선: 스크립트 첫 부분은 학부모의 고민을 끌어내는 질문 2~3개로 시작할 것 (예: "혹시 책은 읽는데 글쓰기를 어려워하지 않나요?")
2. 진단 데이터를 근거로 강점 1가지를 먼저 인정한 뒤, 보완점을 부드럽게 전달
3. 보완점은 "문제"가 아니라 "지금 훈련하면 가장 빨리 크는 영역"으로 표현
4. 마지막에 다음 달 학습 방향과 재등록/과정 안내로 자연스럽게 연결
5. 전체 500자 내외, 존댓말, 실제로 소리 내어 읽을 수 있는 구어체

스크립트 본문만 출력하세요 (제목/마크다운 없이).`;

            const text = await generateContent<string>(prompt, { temperature: 0.7, maxOutputTokens: 2048 });
            setConsultScript(typeof text === 'string' ? text.trim() : String(text));
        } catch (e) {
            console.error('Generate consult script error:', e);
            setScriptError('스크립트 생성에 실패했습니다. 잠시 후 다시 시도해주세요.');
        } finally {
            setIsGeneratingScript(false);
        }
    };

    useEffect(() => {
        const loadStudents = async () => {
            setIsLoading(true);
            try {
                // academyId가 없는 선생님 계정은 어느 학원에도 속하지 않으므로 조회하지 않음
                if (!user.academyId) {
                    setStudents([]);
                    return;
                }
                // 서버 사이드에서 내 학원 학생만 조회 (타 학원 데이터가 클라이언트로 전송되지 않음)
                const myStudents = await AuthService.getUsersByAcademy(user.academyId, 'STUDENT');
                setStudents(myStudents);
            } catch (e) {
                console.error("Failed to load students", e);
            } finally {
                setIsLoading(false);
            }
        };

        if (user.role === 'TEACHER') {
            loadStudents();
        }
    }, [user.academyId, user.role]);

    useEffect(() => {
        const loadRequests = async () => {
            if (!user.academyId) return;
            const requests = await ConsultationService.getPendingRequests(user.academyId);
            setPendingRequests(requests);
        };

        if (user.role === 'TEACHER') {
            loadRequests();
        }
    }, [user.academyId, user.role]);

    useEffect(() => {
        const loadManuals = async () => {
            const all = await ManualService.getAll();
            setManuals(all);
        };

        if (user.role === 'TEACHER' && activeTab === 'manuals' && manuals.length === 0) {
            loadManuals();
        }
    }, [user.role, activeTab]);

    useEffect(() => {
        const loadMyQualityChecks = async () => {
            if (!user.uid) return;
            const checks = await TeacherQualityService.getByTeacher(user.uid);
            setMyQualityChecks(checks);
        };

        if (user.role === 'TEACHER') {
            loadMyQualityChecks();
        }
    }, [user.uid, user.role]);

    const openConsultationFromRequest = async (req: ConsultationRequest) => {
        const student = students.find(s => s.uid === req.studentUid);
        if (student) {
            openConsultation(student);
        }
        await ConsultationService.markResolved(req.id);
        setPendingRequests(prev => prev.filter(r => r.id !== req.id));
    };

    // Care Zone 계산 (60점 미만 항목)
    const getCareZones = (result?: TestResult) => {
        if (!result) return [];
        return result.competencies.filter(c => c.score < 60).map(c => c.label);
    };

    const activeCareStudents = students.filter(s => getCareZones(s.testResult).length > 0);

    // 실제 통계 계산
    const studentsWithResults = students.filter(s => s.testResult);
    const averageScore = studentsWithResults.length > 0
        ? Math.round(studentsWithResults.reduce((sum, s) => sum + (s.testResult?.totalScore || 0), 0) / studentsWithResults.length)
        : 0;

    // 레벨업 학생 찾기 (이전 테스트 대비 레벨 상승)
    const levelUpStudents = students.filter(s => {
        if (!s.testHistory || s.testHistory.length < 2) return false;
        const prev = s.testHistory[s.testHistory.length - 2];
        const curr = s.testHistory[s.testHistory.length - 1];
        // Level 문자열에서 숫자 추출 비교
        const prevLevelNum = parseInt(prev?.level?.replace(/\D/g, '') || '0');
        const currLevelNum = parseInt(curr?.level?.replace(/\D/g, '') || '0');
        return currLevelNum > prevLevelNum;
    });

    // 상담 모드 진입
    const openConsultation = (student: UserAccount) => {
        setSelectedStudent(student);
        setConsultScript('');
        setScriptError('');
        setActiveTab('consultation');
    };

    if (activeTab === 'consultation' && selectedStudent) {
        return (
            <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
                <div className="bg-navy text-white p-4 flex justify-between items-center sticky top-0 z-50 shadow-md">
                    <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-secondary">support_agent</span>
                        <h3 className="font-bold text-lg">학부모 상담 모드 ({selectedStudent.name})</h3>
                    </div>
                    <button
                        onClick={() => {
                            setActiveTab('students');
                            setSelectedStudent(null);
                        }}
                        className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors text-sm font-bold"
                    >
                        대시보드로 복귀
                    </button>
                </div>
                {/* AI 상담 스크립트 생성 (진단 데이터 + 학년 세그먼트 기반) */}
                <div className="max-w-4xl mx-auto px-6 pt-6">
                    <div className="bg-indigo-50/60 border border-indigo-100 rounded-3xl p-6">
                        <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
                            <h4 className="font-black text-navy flex items-center gap-2">
                                <span className="material-symbols-outlined text-indigo-500">smart_toy</span>
                                AI 상담 스크립트
                            </h4>
                            <button
                                onClick={() => generateConsultScript(selectedStudent)}
                                disabled={isGeneratingScript}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {isGeneratingScript && <span className="material-symbols-outlined animate-spin text-sm">refresh</span>}
                                {isGeneratingScript ? '생성 중...' : consultScript ? '다시 생성' : '스크립트 생성'}
                            </button>
                        </div>
                        <p className="text-xs text-gray-400 mb-3">진단 결과와 학년 특성을 반영해 상담 도입 질문부터 재등록 안내까지 초안을 만들어 드립니다.</p>
                        {scriptError && <p className="text-sm text-red-500 font-bold">{scriptError}</p>}
                        {consultScript && (
                            <div className="bg-white rounded-2xl p-5 border border-indigo-100">
                                <p className="text-sm text-navy leading-relaxed whitespace-pre-wrap">{consultScript}</p>
                                <button
                                    onClick={() => navigator.clipboard?.writeText(consultScript)}
                                    className="mt-3 text-xs font-bold text-indigo-500 hover:text-indigo-700 flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-sm">content_copy</span>
                                    복사하기
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* ReportView를 상담 모드로 재사용 (여기서는 onStartTest 등 불필요한 prop은 더미로 전달) */}
                <ReportView
                    user={selectedStudent}
                    currentView="REPORT"
                    setView={() => { }}
                    onLogout={() => { }}
                    onStartTest={() => { }}
                    isTeacherView
                />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background-light font-display flex flex-col md:flex-row">
            {/* Sidebar */}
            <aside className="w-full md:w-64 bg-white border-r border-gray-100 p-6 flex-shrink-0">
                <div className="flex items-center gap-3 mb-10">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined">school</span>
                    </div>
                    <div>
                        <h1 className="text-navy font-black text-lg">Gachi Teacher</h1>
                        <p className="text-xs text-gray-400 font-medium">선생님 전용</p>
                    </div>
                </div>

                <nav className="space-y-2">
                    <button
                        onClick={() => setActiveTab('briefing')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-bold ${activeTab === 'briefing' ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-gray-400 hover:bg-gray-50'}`}
                    >
                        <span className="material-symbols-outlined">analytics</span>
                        수업 브리핑
                    </button>
                    <button
                        onClick={() => setActiveTab('students')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-bold ${activeTab === 'students' ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-gray-400 hover:bg-gray-50'}`}
                    >
                        <span className="material-symbols-outlined">groups</span>
                        학생 관리
                    </button>
                    <button
                        onClick={() => setActiveTab('manuals')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-bold ${activeTab === 'manuals' ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-gray-400 hover:bg-gray-50'}`}
                    >
                        <span className="material-symbols-outlined">menu_book</span>
                        운영 매뉴얼
                    </button>
                </nav>

                <div className="mt-auto pt-10 border-t border-gray-100">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                            <span className="material-symbols-outlined text-sm">person</span>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-navy">{user.name} 선생님</p>
                            <p className="text-xs text-gray-400">{user.academyId || '소속 없음'}</p>
                        </div>
                    </div>
                    <button onClick={onLogout} className="text-red-400 text-sm font-bold hover:text-red-500 flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">logout</span>
                        로그아웃
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-6 md:p-10 overflow-y-auto">
                {activeTab === 'briefing' && (
                    <div className="max-w-4xl mx-auto space-y-8">
                        <header className="mb-8">
                            <h2 className="text-2xl font-black text-navy mb-2">오늘의 수업 브리핑 📢</h2>
                            <p className="text-gray-500">수업 들어가시기 전, 3분만 확인하세요!</p>
                        </header>

                        {/* Critical Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group hover:-translate-y-1 transition-transform">
                                <div className="absolute right-0 top-0 w-24 h-24 bg-red-50 rounded-bl-full -mr-4 -mt-4 z-0"></div>
                                <h3 className="text-gray-400 text-sm font-bold mb-2 relative z-10">집중 케어 필요</h3>
                                <div className="flex items-end gap-2 relative z-10">
                                    <span className="text-4xl font-black text-red-500">{activeCareStudents.length}</span>
                                    <span className="text-lg font-bold text-navy mb-1">명</span>
                                </div>
                                <p className="text-xs text-gray-400 mt-2 relative z-10">지난주 대비 +1명 증가 ⚠️</p>
                            </div>
                            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group hover:-translate-y-1 transition-transform">
                                <div className="absolute right-0 top-0 w-24 h-24 bg-green-50 rounded-bl-full -mr-4 -mt-4 z-0"></div>
                                <h3 className="text-gray-400 text-sm font-bold mb-2 relative z-10">레벨 업!</h3>
                                <div className="flex items-end gap-2 relative z-10">
                                    <span className="text-4xl font-black text-green-500">{levelUpStudents.length}</span>
                                    <span className="text-lg font-bold text-navy mb-1">명</span>
                                </div>
                                <p className="text-xs text-gray-400 mt-2 relative z-10">
                                    {levelUpStudents.length > 0 ? levelUpStudents.map(s => s.name).join(', ') : '아직 없음'}
                                </p>
                            </div>
                            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group hover:-translate-y-1 transition-transform">
                                <div className="absolute right-0 top-0 w-24 h-24 bg-blue-50 rounded-bl-full -mr-4 -mt-4 z-0"></div>
                                <h3 className="text-gray-400 text-sm font-bold mb-2 relative z-10">평균 성취도</h3>
                                <div className="flex items-end gap-2 relative z-10">
                                    <span className="text-4xl font-black text-navy">{averageScore}</span>
                                    <span className="text-lg font-bold text-navy mb-1">점</span>
                                </div>
                                <p className="text-xs text-gray-400 mt-2 relative z-10">
                                    {studentsWithResults.length}명 기준 평균
                                </p>
                            </div>
                        </div>

                        {/* 학부모 상담 신청 (ReportView "지금 신청하기" 버튼에서 발생) */}
                        {pendingRequests.length > 0 && (
                            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <h3 className="text-lg font-black text-navy mb-6 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-secondary">support_agent</span>
                                    새로운 상담 신청 ({pendingRequests.length})
                                </h3>
                                <div className="space-y-3">
                                    {pendingRequests.map(req => (
                                        <div key={req.id} className="flex items-center justify-between p-4 bg-secondary/5 border border-secondary/10 rounded-2xl">
                                            <div>
                                                <p className="font-bold text-navy">{req.studentName}</p>
                                                <p className="text-xs text-gray-400">{new Date(req.requestedAt).toLocaleString()} 신청</p>
                                            </div>
                                            <button
                                                onClick={() => openConsultationFromRequest(req)}
                                                className="text-secondary font-bold text-sm bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-secondary hover:text-white hover:border-secondary transition-all shadow-sm"
                                            >
                                                상담 시작
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 본사 수업 품질 피드백 */}
                        {myQualityChecks.length > 0 && (
                            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <h3 className="text-lg font-black text-navy mb-6 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-indigo-500">fact_check</span>
                                    본사 수업 품질 피드백
                                    <span className="text-sm font-bold text-gray-400 ml-auto">{new Date(myQualityChecks[0].checkedAt).toLocaleDateString()}</span>
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                    {QUALITY_CHECK_CRITERIA.map(c => (
                                        <div key={c} className="bg-indigo-50/50 rounded-2xl p-4 text-center">
                                            <p className="text-xs text-gray-400 font-bold mb-1">{c}</p>
                                            <p className="text-2xl font-black text-indigo-600">{myQualityChecks[0].scores[c]}</p>
                                        </div>
                                    ))}
                                </div>
                                {myQualityChecks[0].note && (
                                    <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-4">{myQualityChecks[0].note}</p>
                                )}
                            </div>
                        )}

                        {/* Action Items (Care Zone) */}
                        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                            <h3 className="text-lg font-black text-navy mb-6 flex items-center gap-2">
                                <span className="material-symbols-outlined text-red-500">emergency_home</span>
                                집중 케어 액션 플랜 ({activeCareStudents.length})
                            </h3>

                            <div className="space-y-4">
                                {activeCareStudents.map(student => {
                                    const zones = getCareZones(student.testResult);
                                    return (
                                        <div key={student.id} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-red-50/50 border border-red-100 rounded-2xl gap-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center font-black text-navy shadow-sm border border-gray-100">
                                                    {student.name[0]}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-navy">{student.name}</h4>
                                                    <div className="flex gap-2 mt-1">
                                                        {zones.map(z => (
                                                            <span key={z} className="text-xs font-bold text-red-500 bg-red-100/50 px-2 py-0.5 rounded-md">
                                                                {z}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-sm font-medium text-gray-600 bg-white px-4 py-2 rounded-xl border border-gray-100">
                                                💡 코칭 가이드: "{zones[0]} 문제를 풀 때, 문단의 핵심 문장에 밑줄을 긋게 지도해주세요."
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'students' && (
                    <div className="max-w-5xl mx-auto">
                        <header className="mb-8 flex justify-between items-center">
                            <div>
                                <h2 className="text-2xl font-black text-navy mb-2">담당 학생 관리 👨‍🎓</h2>
                                <p className="text-gray-500">총 {students.length}명의 학생을 관리 중입니다.</p>
                            </div>
                            <button className="bg-navy text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-navy/20 hover:bg-navy/90 transition-all">
                                <span className="material-symbols-outlined">person_add</span>
                                학생 초대
                            </button>
                        </header>

                        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">이름/학교</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">최근 레벨</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">점수</th>
                                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">케어 포인트</th>
                                        <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {students.map(student => (
                                        <tr key={student.id} className="hover:bg-gray-50/50 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-secondary/10 text-secondary rounded-full flex items-center justify-center font-bold">
                                                        {student.name[0]}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-navy">{student.name}</p>
                                                        <p className="text-xs text-gray-400">{student.school} {student.grade}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg text-sm font-black inline-block">
                                                    {student.testResult?.level || 'Level 1'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-navy text-base">{student.testResult?.totalScore}점</span>
                                                    {/* 점수 바 간소화 */}
                                                    <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                        <div className="h-full bg-primary" style={{ width: `${student.testResult?.totalScore}%` }}></div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {getCareZones(student.testResult).length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {getCareZones(student.testResult).map(z => (
                                                            <span key={z} className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-1 rounded-md border border-red-100">
                                                                {z}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-gray-400 font-medium">Clear ✨</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => openConsultation(student)}
                                                    className="text-primary font-bold text-sm bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-primary hover:text-white hover:border-primary transition-all shadow-sm"
                                                >
                                                    학부모 상담
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {activeTab === 'manuals' && (
                    <div className="max-w-4xl mx-auto space-y-8">
                        <header className="mb-2">
                            <h2 className="text-2xl font-black text-navy mb-2">운영 매뉴얼 📖</h2>
                            <p className="text-gray-500">본사에서 정리한 상황별 대응 가이드입니다.</p>
                        </header>

                        {MANUAL_CATEGORIES.map(category => {
                            const items = manuals.filter(m => m.category === category);
                            if (items.length === 0) return null;
                            return (
                                <div key={category}>
                                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-wider mb-3">{category}</h3>
                                    <div className="space-y-3">
                                        {items.map(m => {
                                            const isOpen = openManualId === m.id;
                                            return (
                                                <div key={m.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                                    <button
                                                        onClick={() => setOpenManualId(isOpen ? null : m.id)}
                                                        className="w-full flex items-center justify-between p-5 text-left"
                                                    >
                                                        <span className="font-bold text-navy">{m.title}</span>
                                                        <span className="material-symbols-outlined text-gray-400">{isOpen ? 'expand_less' : 'expand_more'}</span>
                                                    </button>
                                                    {isOpen && (
                                                        <div className="px-5 pb-5 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap border-t border-gray-100 pt-4">
                                                            {m.content || '(내용 없음)'}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}

                        {manuals.length === 0 && (
                            <p className="text-center text-gray-400 py-16">아직 등록된 운영 매뉴얼이 없습니다.</p>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default TeacherDashboard;
