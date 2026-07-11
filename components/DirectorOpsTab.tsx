import React, { useState, useEffect } from 'react';
import { UserAccount, ConsultationRequest, TeacherQualityCheck, QUALITY_CHECK_CRITERIA, ProgramEnrollment } from '../types';
import { AuthService, TeacherQualityService } from '../services/api';

// 원장(isAcademyAdmin) 전용 지점 운영 탭
// 본사 가맹 운영 대시보드의 우리 지점 버전 + 등록 과정(프로그램) 직접 관리
interface DirectorOpsTabProps {
    user: UserAccount;               // 원장 본인
    students: UserAccount[];
    pendingRequests: ConsultationRequest[];
    onStudentsChanged: () => void;   // 프로그램 저장 후 목록 갱신
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const checkAverage = (check: TeacherQualityCheck) =>
    QUALITY_CHECK_CRITERIA.reduce((sum, c) => sum + check.scores[c], 0) / QUALITY_CHECK_CRITERIA.length;

const daysUntil = (dateStr: string) => Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

const DirectorOpsTab: React.FC<DirectorOpsTabProps> = ({ user, students, pendingRequests, onStudentsChanged }) => {
    const [teachers, setTeachers] = useState<UserAccount[]>([]);
    const [qualityChecks, setQualityChecks] = useState<TeacherQualityCheck[]>([]);
    const [editingStudent, setEditingStudent] = useState<UserAccount | null>(null);
    const [draft, setDraft] = useState<ProgramEnrollment>({ name: '', startDate: '' });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const load = async () => {
            if (!user.academyId) return;
            const [teacherList, checks] = await Promise.all([
                AuthService.getUsersByAcademy(user.academyId, 'TEACHER'),
                TeacherQualityService.getByAcademy(user.academyId),
            ]);
            setTeachers(teacherList);
            setQualityChecks(checks);
        };
        load();
    }, [user.academyId]);

    const renewalSoon = students
        .filter(s => s.program?.nextRenewalDate && new Date(s.program.nextRenewalDate).getTime() - Date.now() < THIRTY_DAYS_MS)
        .sort((a, b) => (a.program!.nextRenewalDate!).localeCompare(b.program!.nextRenewalDate!));
    const untracked = students.filter(s => !s.program?.name);

    const latestCheckFor = (teacherUid?: string) => {
        if (!teacherUid) return null;
        const list = qualityChecks.filter(c => c.teacherUid === teacherUid).sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
        return list[0] || null;
    };

    const openProgramEditor = (student: UserAccount) => {
        setEditingStudent(student);
        setDraft({
            name: student.program?.name || '',
            startDate: student.program?.startDate || new Date().toISOString().slice(0, 10),
            nextRenewalDate: student.program?.nextRenewalDate || ''
        });
    };

    const saveProgram = async () => {
        if (!editingStudent || !draft.name.trim()) return;
        setIsSaving(true);
        const ok = await AuthService.updateUser({ ...editingStudent, program: { ...draft, name: draft.name.trim() } });
        setIsSaving(false);
        if (ok) {
            setEditingStudent(null);
            onStudentsChanged();
        } else {
            alert('저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-8">
            <header className="mb-2">
                <h2 className="text-2xl font-black text-navy mb-2">지점 운영 🏫</h2>
                <p className="text-gray-500">우리 학원의 재등록·상담·수업 품질을 한눈에 관리하세요.</p>
            </header>

            {/* 핵심 지표 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <h3 className="text-gray-400 text-sm font-bold mb-2">전체 학생</h3>
                    <p className="text-3xl font-black text-navy">{students.length}<span className="text-base ml-1">명</span></p>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <h3 className="text-gray-400 text-sm font-bold mb-2">갱신 임박 (30일)</h3>
                    <p className={`text-3xl font-black ${renewalSoon.length > 0 ? 'text-secondary' : 'text-navy'}`}>{renewalSoon.length}<span className="text-base ml-1">명</span></p>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <h3 className="text-gray-400 text-sm font-bold mb-2">과정 미등록</h3>
                    <p className={`text-3xl font-black ${untracked.length > 0 ? 'text-amber-500' : 'text-navy'}`}>{untracked.length}<span className="text-base ml-1">명</span></p>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <h3 className="text-gray-400 text-sm font-bold mb-2">대기 상담</h3>
                    <p className={`text-3xl font-black ${pendingRequests.length > 0 ? 'text-secondary' : 'text-navy'}`}>{pendingRequests.length}<span className="text-base ml-1">건</span></p>
                </div>
            </div>

            {/* 갱신 임박 학생 */}
            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                <h3 className="text-lg font-black text-navy mb-1 flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary">event_repeat</span>
                    재등록 갱신 임박
                </h3>
                <p className="text-xs text-gray-400 mb-5">갱신일 30일 전 학생입니다. 재등록 상담을 먼저 제안하세요.</p>
                {renewalSoon.length === 0 ? (
                    <p className="text-sm text-gray-400 py-4">30일 내 갱신 예정 학생이 없습니다.</p>
                ) : (
                    <div className="space-y-3">
                        {renewalSoon.map(s => {
                            const d = daysUntil(s.program!.nextRenewalDate!);
                            return (
                                <div key={s.uid} className="flex items-center justify-between p-4 bg-secondary/5 border border-secondary/10 rounded-2xl flex-wrap gap-2">
                                    <div>
                                        <p className="font-bold text-navy">{s.name} <span className="text-xs text-gray-400 font-medium">{s.grade}</span></p>
                                        <p className="text-xs text-gray-500">{s.program!.name} · {s.program!.nextRenewalDate} 갱신</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${d <= 7 ? 'bg-red-50 text-red-500' : 'bg-white text-secondary border border-secondary/20'}`}>
                                            {d < 0 ? `${-d}일 지남` : `D-${d}`}
                                        </span>
                                        <button
                                            onClick={() => openProgramEditor(s)}
                                            className="text-xs font-bold text-navy bg-white border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                                        >
                                            과정 수정
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 과정 미등록 학생 */}
            {untracked.length > 0 && (
                <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                    <h3 className="text-lg font-black text-navy mb-1 flex items-center gap-2">
                        <span className="material-symbols-outlined text-amber-500">assignment_late</span>
                        등록 과정 미입력 ({untracked.length}명)
                    </h3>
                    <p className="text-xs text-gray-400 mb-5">과정을 입력해야 갱신일 기준 재등록 관리가 가능합니다.</p>
                    <div className="flex flex-wrap gap-2">
                        {untracked.map(s => (
                            <button
                                key={s.uid}
                                onClick={() => openProgramEditor(s)}
                                className="px-4 py-2 bg-amber-50 border border-amber-100 text-navy rounded-xl text-sm font-bold hover:bg-amber-100 transition-colors"
                            >
                                {s.name} <span className="text-amber-500 ml-1">+ 과정 등록</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* 교사 품질 현황 */}
            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                <h3 className="text-lg font-black text-navy mb-1 flex items-center gap-2">
                    <span className="material-symbols-outlined text-indigo-500">fact_check</span>
                    교사 수업 품질 현황
                </h3>
                <p className="text-xs text-gray-400 mb-5">본사 품질 점검의 최근 결과입니다.</p>
                <div className="space-y-3">
                    {teachers.map(t => {
                        const latest = latestCheckFor(t.uid);
                        return (
                            <div key={t.uid} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                                <p className="font-bold text-navy">
                                    {t.name}
                                    {t.isAcademyAdmin && <span className="ml-2 text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold">원장</span>}
                                </p>
                                {latest ? (
                                    <div className="text-right">
                                        <span className={`text-sm font-black px-2.5 py-1 rounded-lg ${checkAverage(latest) < 3 ? 'bg-red-50 text-red-500' : 'bg-indigo-50 text-indigo-600'}`}>
                                            {checkAverage(latest).toFixed(1)}점
                                        </span>
                                        <p className="text-[10px] text-gray-400 mt-1">{new Date(latest.checkedAt).toLocaleDateString()} 점검</p>
                                    </div>
                                ) : <span className="text-xs text-gray-300 font-bold">점검 기록 없음</span>}
                            </div>
                        );
                    })}
                    {teachers.length === 0 && <p className="text-sm text-gray-400 py-4">등록된 교사가 없습니다.</p>}
                </div>
            </div>

            {/* 과정 등록/수정 모달 */}
            {editingStudent && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4" onClick={() => setEditingStudent(null)}>
                    <div className="bg-white rounded-[2rem] w-full max-w-md overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-100 bg-navy text-white flex justify-between items-center">
                            <h3 className="font-bold text-lg">{editingStudent.name} · 등록 과정</h3>
                            <button onClick={() => setEditingStudent(null)}><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-navy mb-1">과정명</label>
                                <input
                                    value={draft.name}
                                    onChange={e => setDraft({ ...draft, name: e.target.value })}
                                    placeholder="예: 초3·4 글쓰기 기초 완성 과정"
                                    className="w-full p-3 rounded-xl border border-gray-200"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-bold text-navy mb-1">시작일</label>
                                    <input
                                        type="date"
                                        value={draft.startDate}
                                        onChange={e => setDraft({ ...draft, startDate: e.target.value })}
                                        className="w-full p-3 rounded-xl border border-gray-200"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-navy mb-1">다음 갱신일</label>
                                    <input
                                        type="date"
                                        value={draft.nextRenewalDate || ''}
                                        onChange={e => setDraft({ ...draft, nextRenewalDate: e.target.value })}
                                        className="w-full p-3 rounded-xl border border-gray-200"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-100 flex gap-2">
                            <button
                                onClick={saveProgram}
                                disabled={isSaving || !draft.name.trim()}
                                className="flex-1 bg-navy text-white font-bold py-3 rounded-xl hover:bg-navy/90 transition-colors disabled:opacity-40"
                            >
                                {isSaving ? '저장 중...' : '저장하기'}
                            </button>
                            <button
                                onClick={() => setEditingStudent(null)}
                                className="flex-1 bg-gray-100 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors"
                            >
                                취소
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DirectorOpsTab;
