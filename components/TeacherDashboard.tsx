import React, { useState, useEffect } from 'react';
import { UserAccount, TestResult, GradeGroupType, Asset, ConsultationRequest, OperationManual, ManualCategory, TeacherQualityCheck, QUALITY_CHECK_CRITERIA } from '../types';
import { SessionService, AssetService, ConsultationService, ManualService, TeacherQualityService, AcademyService } from '../services/api';
import { generateContent } from '../services/gemini';
import { getGradeSegment } from '../data/gradeSegments';
import ReportView from './ReportView'; // 상담 모드에서 재사용
import DirectorOpsTab from './DirectorOpsTab';

interface TeacherDashboardProps {
    user: UserAccount;
    onLogout: () => void;
}

// Mock Data removed
import { AuthService } from '../services/api';

const MANUAL_CATEGORIES: ManualCategory[] = ['신규 상담 대응', '학부모 불만 대응', '모집·홍보', '재등록 관리', '교사 관리', '지점 운영'];

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ user, onLogout }) => {
    const [activeTab, setActiveTab] = useState<'briefing' | 'students' | 'consultation' | 'manuals' | 'marketing' | 'director'>('briefing');
    const [selectedStudent, setSelectedStudent] = useState<UserAccount | null>(null);
    const [students, setStudents] = useState<UserAccount[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingRequests, setPendingRequests] = useState<ConsultationRequest[]>([]);
    const [studentsReloadKey, setStudentsReloadKey] = useState(0);
    const [manuals, setManuals] = useState<OperationManual[]>([]);
    const [openManualId, setOpenManualId] = useState<string | null>(null);
    const [myQualityChecks, setMyQualityChecks] = useState<TeacherQualityCheck[]>([]);

    // AI 상담 스크립트 (상담 모드)
    const [consultScript, setConsultScript] = useState('');
    const [isGeneratingScript, setIsGeneratingScript] = useState(false);
    const [scriptError, setScriptError] = useState('');

    // 학생 초대 (학원 가입 코드 안내)
    const [inviteCode, setInviteCode] = useState<string | null>(null);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteCopied, setInviteCopied] = useState(false);

    const openInviteModal = async () => {
        setShowInviteModal(true);
        setInviteCopied(false);
        if (inviteCode || !user.academyId) return;
        const academy = await AcademyService.getAcademyById(user.academyId);
        setInviteCode(academy?.code || null);
    };

    // 홍보문 생성 도구
    const [marketingType, setMarketingType] = useState<'블로그 글' | '학부모 안내 문자' | '설명회 안내문'>('블로그 글');
    const [marketingTopic, setMarketingTopic] = useState('');
    const [marketingDraft, setMarketingDraft] = useState('');
    const [isGeneratingMarketing, setIsGeneratingMarketing] = useState(false);
    const [marketingError, setMarketingError] = useState('');

    const generateMarketingDraft = async () => {
        if (isGeneratingMarketing || !marketingTopic.trim()) return;
        setIsGeneratingMarketing(true);
        setMarketingError('');
        try {
            const formatGuide = marketingType === '블로그 글'
                ? '네이버 블로그용. 제목 1개 + 본문 800자 내외. 학부모가 검색할 법한 표현을 자연스럽게 포함. 문단을 짧게 나누고, 마지막에 상담 문의 유도 문장으로 마무리.'
                : marketingType === '학부모 안내 문자'
                    ? '학부모 대상 안내 문자(LMS)용. 200자 내외. 핵심만 간결하게, 존댓말, 마지막에 회신/문의 방법 포함.'
                    : '오프라인 설명회 안내문. 400자 내외. 설명회에서 다룰 내용 3가지를 항목으로 제시하고, 참석 시 얻어갈 것을 명확히. 일시/장소는 [일시], [장소] 플레이스홀더로 남길 것.';

            const prompt = `당신은 초중등 문해력 전문 학원 "가치인"의 마케팅 담당자입니다.

[작성 요청]
- 유형: ${marketingType}
- 주제: ${marketingTopic.trim()}

[가치인 브랜드 톤]
- 독서·논술·토론을 통합한 문해력 교육, "성과와 사람됨을 동시에"
- 과장 없이 학부모의 실제 고민(글쓰기 걱정, 수행평가 대비, 중등 전환)에 공감하는 어조
- 정보를 쏟아내기보다 "우리 아이 점검이 필요하겠다"는 문제 인식을 이끌어낼 것

[형식]
${formatGuide}

본문만 출력하세요 (설명/마크다운 코드블록 없이).`;

            const text = await generateContent<string>(prompt, { temperature: 0.8, maxOutputTokens: 4096 });
            setMarketingDraft(typeof text === 'string' ? text.trim() : String(text));
        } catch (e) {
            console.error('Generate marketing draft error:', e);
            setMarketingError('생성에 실패했습니다. 잠시 후 다시 시도해주세요.');
        } finally {
            setIsGeneratingMarketing(false);
        }
    };

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
    }, [user.academyId, user.role, studentsReloadKey]);

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

    // 상담 시작: 요청은 대기 목록에 그대로 두고 상담 모드만 연다 (완료 처리는 별도 버튼)
    const openConsultationFromRequest = (req: ConsultationRequest) => {
        const student = students.find(s => s.uid === req.studentUid);
        if (!student) {
            alert(`${req.studentName} 학생을 담당 목록에서 찾을 수 없습니다.\n학생의 소속 학원이 아직 지정되지 않았을 수 있으니 본사에 확인해주세요.`);
            return;
        }
        openConsultation(student);
    };

    // 상담 완료: 요청을 처리 완료로 표시하고 목록에서 제거
    const resolveConsultationRequest = async (req: ConsultationRequest) => {
        const ok = await ConsultationService.markResolved(req.id);
        if (ok) {
            setPendingRequests(prev => prev.filter(r => r.id !== req.id));
        } else {
            alert('완료 처리에 실패했습니다. 잠시 후 다시 시도해주세요.');
        }
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
                        {pendingRequests.length > 0 && (
                            <span className={`ml-auto text-xs font-black min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center ${activeTab === 'briefing' ? 'bg-white text-secondary' : 'bg-secondary text-white'}`}>
                                {pendingRequests.length}
                            </span>
                        )}
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
                    <button
                        onClick={() => setActiveTab('marketing')}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-bold ${activeTab === 'marketing' ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-gray-400 hover:bg-gray-50'}`}
                    >
                        <span className="material-symbols-outlined">campaign</span>
                        홍보 도구
                    </button>
                    {user.isAcademyAdmin && (
                        <button
                            onClick={() => setActiveTab('director')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors font-bold ${activeTab === 'director' ? 'bg-navy text-white shadow-lg shadow-navy/30' : 'text-gray-400 hover:bg-gray-50'}`}
                        >
                            <span className="material-symbols-outlined">storefront</span>
                            지점 운영
                        </button>
                    )}
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
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => openConsultationFromRequest(req)}
                                                    className="text-secondary font-bold text-sm bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-secondary hover:text-white hover:border-secondary transition-all shadow-sm"
                                                >
                                                    상담 시작
                                                </button>
                                                <button
                                                    onClick={() => resolveConsultationRequest(req)}
                                                    className="text-gray-400 font-bold text-sm bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-primary hover:text-white hover:border-primary transition-all shadow-sm"
                                                    title="상담을 마쳤다면 완료 처리하세요"
                                                >
                                                    완료
                                                </button>
                                            </div>
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
                            <button
                                onClick={openInviteModal}
                                className="bg-navy text-white px-5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-navy/20 hover:bg-navy/90 transition-all"
                            >
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

                {activeTab === 'marketing' && (
                    <div className="max-w-3xl mx-auto space-y-6">
                        <header className="mb-2">
                            <h2 className="text-2xl font-black text-navy mb-2">홍보 도구 📣</h2>
                            <p className="text-gray-500">주제만 입력하면 우리 지점용 블로그 글·안내 문자·설명회 안내문 초안을 만들어 드립니다.</p>
                        </header>

                        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm space-y-5">
                            <div>
                                <p className="text-sm font-bold text-navy mb-2">유형</p>
                                <div className="flex gap-2 flex-wrap">
                                    {(['블로그 글', '학부모 안내 문자', '설명회 안내문'] as const).map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setMarketingType(t)}
                                            className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${marketingType === t ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                                        >
                                            {t}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p className="text-sm font-bold text-navy mb-2">주제</p>
                                <input
                                    value={marketingTopic}
                                    onChange={e => setMarketingTopic(e.target.value)}
                                    placeholder="예: 초등 고학년 겨울방학 글쓰기 특강 모집"
                                    className="w-full p-4 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                            <button
                                onClick={generateMarketingDraft}
                                disabled={isGeneratingMarketing || !marketingTopic.trim()}
                                className="w-full py-4 bg-primary text-white rounded-xl font-bold hover:brightness-105 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                            >
                                {isGeneratingMarketing && <span className="material-symbols-outlined animate-spin text-sm">refresh</span>}
                                {isGeneratingMarketing ? '생성 중...' : marketingDraft ? '다시 생성' : '초안 생성'}
                            </button>
                            {marketingError && <p className="text-sm text-red-500 font-bold">{marketingError}</p>}
                        </div>

                        {marketingDraft && (
                            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-black text-navy">{marketingType} 초안</h3>
                                    <button
                                        onClick={() => navigator.clipboard?.writeText(marketingDraft)}
                                        className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1"
                                    >
                                        <span className="material-symbols-outlined text-sm">content_copy</span>
                                        복사하기
                                    </button>
                                </div>
                                <p className="text-sm text-navy leading-relaxed whitespace-pre-wrap">{marketingDraft}</p>
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'director' && user.isAcademyAdmin && (
                    <DirectorOpsTab
                        user={user}
                        students={students}
                        pendingRequests={pendingRequests}
                        onStudentsChanged={() => setStudentsReloadKey(k => k + 1)}
                    />
                )}
            </main>

            {/* 학생 초대 모달: 학원 가입 코드 안내 */}
            {showInviteModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={() => setShowInviteModal(false)}>
                    <div className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-100 bg-navy text-white flex justify-between items-center">
                            <h3 className="font-bold text-lg">학생 초대하기</h3>
                            <button onClick={() => setShowInviteModal(false)}><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-8 text-center space-y-5">
                            {!user.academyId ? (
                                <p className="text-gray-500 font-medium">소속 학원이 지정되지 않은 계정입니다.<br />본사에 학원 지정을 요청해주세요.</p>
                            ) : inviteCode === null ? (
                                <p className="text-gray-400 font-medium">가입 코드를 불러오는 중...</p>
                            ) : (
                                <>
                                    <p className="text-gray-500 font-medium leading-relaxed">
                                        학생(학부모)에게 아래 <b className="text-navy">학원 가입 코드</b>를 전달해주세요.<br />
                                        회원가입 시 이 코드를 입력하면 우리 학원 소속으로 등록됩니다.
                                    </p>
                                    <div className="bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-2xl py-6">
                                        <p className="text-3xl font-black text-indigo-600 tracking-widest font-mono">{inviteCode}</p>
                                    </div>
                                    <button
                                        onClick={() => { navigator.clipboard?.writeText(inviteCode); setInviteCopied(true); }}
                                        className="w-full py-3.5 bg-navy text-white rounded-xl font-bold hover:bg-navy/90 transition-colors flex items-center justify-center gap-2"
                                    >
                                        <span className="material-symbols-outlined text-sm">{inviteCopied ? 'check' : 'content_copy'}</span>
                                        {inviteCopied ? '복사되었습니다' : '코드 복사하기'}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeacherDashboard;
