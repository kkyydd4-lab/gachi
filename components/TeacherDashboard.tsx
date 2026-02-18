import React, { useState, useEffect } from 'react';
import { UserAccount, TestResult, GradeGroupType, Asset } from '../types';
import { SessionService, AssetService } from '../services/api';
import ReportView from './ReportView'; // 상담 모드에서 재사용

interface TeacherDashboardProps {
    user: UserAccount;
    onLogout: () => void;
}

// Mock Data removed
import { AuthService } from '../services/api';

const TeacherDashboard: React.FC<TeacherDashboardProps> = ({ user, onLogout }) => {
    const [activeTab, setActiveTab] = useState<'briefing' | 'students' | 'consultation'>('briefing');
    const [selectedStudent, setSelectedStudent] = useState<UserAccount | null>(null);
    const [students, setStudents] = useState<UserAccount[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadStudents = async () => {
            setIsLoading(true);
            try {
                const allUsers = await AuthService.getAllUsers();
                // 내 학원 ID와 일치하는 학생만 필터링 (선생님에게 academyId가 없다면 모두 보이지 않음)
                // MVP: academyId가 없는 경우 테스트용으로 모든 학생을 보여줄 수도 있지만, 원칙대로 필터링
                const myStudents = allUsers.filter(u =>
                    u.role === 'STUDENT' && u.academyId === user.academyId
                );

                // 만약 선생님이 academyId가 없다면(초기 데이터), 테스트를 위해 demo 모드로 전환 가능
                // 여기서는 일단 필터링만 적용
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
                {/* ReportView를 상담 모드로 재사용 (여기서는 onStartTest 등 불필요한 prop은 더미로 전달) */}
                <ReportView
                    user={selectedStudent}
                    currentView="REPORT"
                    setView={() => { }}
                    onLogout={() => { }}
                    onStartTest={() => { }}
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
            </main>
        </div>
    );
};

export default TeacherDashboard;
