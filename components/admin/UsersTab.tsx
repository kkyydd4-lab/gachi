import React, { useState } from 'react';
import { UserAccount, Academy, TeacherQualityCheck, QUALITY_CHECK_CRITERIA } from '../../types';
import TeacherQualityModal from './TeacherQualityModal';

interface UsersTabProps {
    users: UserAccount[];
    academies: Academy[];
    openEditModal: (user: UserAccount) => void;
    handleDeleteUser: (user: UserAccount) => void;
    qualityChecks?: TeacherQualityCheck[];
    onSaveQualityCheck?: (check: TeacherQualityCheck) => void;
    adminName?: string;
}

const averageScore = (check: TeacherQualityCheck) =>
    QUALITY_CHECK_CRITERIA.reduce((sum, c) => sum + check.scores[c], 0) / QUALITY_CHECK_CRITERIA.length;

const UsersTab: React.FC<UsersTabProps> = ({
    users,
    academies,
    openEditModal,
    handleDeleteUser,
    qualityChecks = [],
    onSaveQualityCheck,
    adminName = '관리자'
}) => {
    const [qualityModalTeacher, setQualityModalTeacher] = useState<UserAccount | null>(null);

    const latestCheckFor = (teacherUid?: string) => {
        if (!teacherUid) return null;
        const checks = qualityChecks.filter(c => c.teacherUid === teacherUid).sort((a, b) => b.checkedAt.localeCompare(a.checkedAt));
        return checks[0] || null;
    };

    return (
        <div className="space-y-8 animate-fade-in">
            {/* 1. 학원 현황 */}
            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
                <h3 className="text-navy font-black text-xl mb-6 flex items-center gap-2">
                    <span className="material-symbols-outlined text-indigo-500">domain</span>
                    등록 학원 현황
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left border-b border-gray-100">
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest pl-4">학원명</th>
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">지역</th>
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">코드</th>
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">생성일</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {academies.map(a => (
                                <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="py-4 font-bold text-navy pl-4">{a.name}</td>
                                    <td className="py-4 text-sm text-gray-500">{a.region}</td>
                                    <td className="py-4">
                                        <span className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded-md text-xs font-mono font-bold">{a.code}</span>
                                    </td>
                                    <td className="py-4 text-sm text-gray-400">{new Date(a.createdAt).toLocaleDateString()}</td>
                                </tr>
                            ))}
                            {academies.length === 0 && (
                                <tr><td colSpan={4} className="py-8 text-center text-gray-300 font-bold">등록된 학원이 없습니다.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 2. 선생님 현황 */}
            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
                <h3 className="text-navy font-black text-xl mb-6 flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-500">school</span>
                    등록 선생님 현황
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left border-b border-gray-100">
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest pl-4">이름</th>
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">소속 학원</th>
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">연락처</th>
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">가입일</th>
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">품질 점수</th>
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right pr-4">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {users.filter(u => u.role === 'TEACHER').map(u => {
                                const latest = latestCheckFor(u.uid);
                                return (
                                <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="py-4 font-bold text-navy pl-4 flex items-center gap-2">
                                        {u.name}
                                        {u.isAcademyAdmin && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-bold">원장</span>}
                                    </td>
                                    <td className="py-4 text-sm text-navy font-bold">
                                        {academies.find(a => a.id === u.academyId)?.name || <span className="text-gray-400">-</span>}
                                    </td>
                                    <td className="py-4 text-sm text-gray-500">{u.phone}</td>
                                    <td className="py-4 text-sm text-gray-500">{u.signupDate}</td>
                                    <td className="py-4">
                                        {latest ? (
                                            <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${averageScore(latest) < 3 ? 'bg-red-50 text-red-500' : 'bg-indigo-50 text-indigo-600'}`}>
                                                {averageScore(latest).toFixed(1)}점
                                            </span>
                                        ) : <span className="text-gray-300 text-xs">점검 없음</span>}
                                    </td>
                                    <td className="py-4 text-right pr-4">
                                        <div className="flex items-center justify-end gap-2">
                                            <button
                                                onClick={() => setQualityModalTeacher(u)}
                                                className="w-8 h-8 rounded-full bg-gray-50 hover:bg-indigo-50 flex items-center justify-center text-gray-400 hover:text-indigo-500 transition-colors"
                                                title="수업 품질 점검"
                                            >
                                                <span className="material-symbols-outlined text-sm">fact_check</span>
                                            </button>
                                            <button
                                                onClick={() => openEditModal(u)}
                                                className="w-8 h-8 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-blue-500 transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-sm">edit</span>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(u)}
                                                className="w-8 h-8 rounded-full bg-gray-50 hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-sm">delete</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                );
                            })}
                            {users.filter(u => u.role === 'TEACHER').length === 0 && (
                                <tr><td colSpan={6} className="py-8 text-center text-gray-300 font-bold">등록된 선생님이 없습니다.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 3. 학생 현황 */}
            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
                <h3 className="text-navy font-black text-xl mb-6 flex items-center gap-2">
                    <span className="material-symbols-outlined text-green-500">face</span>
                    등록 학생 현황
                </h3>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="text-left border-b border-gray-100">
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest pl-4">학생명</th>
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">학교/학년</th>
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">소속 학원</th>
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">학부모 연락처</th>
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">등록 과정 · 갱신일</th>
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">최근 점수</th>
                                <th className="pb-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right pr-4">관리</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {users.filter(u => !u.isAdmin && u.role !== 'TEACHER').map(u => {
                                const renewal = u.program?.nextRenewalDate;
                                const daysLeft = renewal ? Math.ceil((new Date(renewal).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                                return (
                                    <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="py-4 font-bold text-navy pl-4">{u.name}</td>
                                        <td className="py-4 text-sm text-gray-500">{u.school} {u.grade}</td>
                                        <td className="py-4 text-sm text-navy font-bold">
                                            {academies.find(a => a.id === u.academyId)?.name || <span className="text-gray-400 font-normal">-</span>}
                                        </td>
                                        <td className="py-4 text-sm text-gray-500">{u.parentPhone || '-'}</td>
                                        <td className="py-4 text-sm text-gray-500">
                                            {u.program?.name ? (
                                                <div>
                                                    <p className="text-navy font-bold">{u.program.name}</p>
                                                    {renewal && (
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${daysLeft !== null && daysLeft <= 7 ? 'bg-red-50 text-red-500' : 'text-gray-400'}`}>
                                                            {renewal} 갱신{daysLeft !== null && daysLeft <= 7 ? ` (D-${daysLeft})` : ''}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : <span className="text-gray-300">미등록</span>}
                                        </td>
                                        <td className="py-4">
                                            {u.testResult ? (
                                                <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-black">{u.testResult.totalScore}점</span>
                                            ) : (
                                                <span className="text-gray-300 text-xs font-bold italic">No Data</span>
                                            )}
                                        </td>
                                        <td className="py-4 text-right pr-4">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => openEditModal(u)}
                                                    className="w-8 h-8 rounded-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-blue-500 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-sm">edit</span>
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteUser(u)}
                                                    className="w-8 h-8 rounded-full bg-gray-50 hover:bg-red-50 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-sm">delete</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {users.filter(u => !u.isAdmin && u.role !== 'TEACHER').length === 0 && (
                                <tr><td colSpan={7} className="py-8 text-center text-gray-300 font-bold">등록된 학생이 없습니다.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {qualityModalTeacher && (
                <TeacherQualityModal
                    teacher={qualityModalTeacher}
                    history={qualityChecks.filter(c => c.teacherUid === qualityModalTeacher.uid).sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))}
                    adminName={adminName}
                    onClose={() => setQualityModalTeacher(null)}
                    onSave={(check) => onSaveQualityCheck?.(check)}
                />
            )}
        </div>
    );
};

export default UsersTab;
