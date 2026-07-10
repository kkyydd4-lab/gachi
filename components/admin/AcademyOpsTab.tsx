import React from 'react';
import { Academy, UserAccount, ConsultationRequest } from '../../types';

interface AcademyOpsTabProps {
    academies: Academy[];
    users: UserAccount[];
    requests: ConsultationRequest[];
}

interface AcademyStats {
    academyId: string;
    academyName: string;
    studentCount: number;
    teacherCount: number;
    avgScore: number | null;
    careRatio: number | null;      // 집중 케어 필요 학생 비율
    retentionProxy: number | null; // 2회 이상 평가 완료 학생 비율 (프로그램 데이터 없을 때의 재등록 프록시)
    renewalSoon30d: number;        // 실제 등록 프로그램 기준 30일 내 갱신 예정 학생 수
    programTracked: number;        // 등록 프로그램이 입력된 학생 수 (실제 지표 신뢰도 참고용)
    pendingRequests: number;
    newSignups7d: number;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const buildStats = (academies: Academy[], users: UserAccount[], requests: ConsultationRequest[]): AcademyStats[] => {
    // 학생/선생님을 소속 학원 코드(id)별로 그룹화. academyId가 없거나 등록된 학원과 매칭되지 않으면 "미배정"으로 취급.
    const groups = new Map<string, UserAccount[]>();
    users.forEach(u => {
        const key = academies.some(a => a.id === u.academyId) ? (u.academyId as string) : 'UNASSIGNED';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(u);
    });

    const now = Date.now();

    const computeFor = (academyId: string, academyName: string, members: UserAccount[]): AcademyStats => {
        const students = members.filter(m => m.role === 'STUDENT');
        const teachers = members.filter(m => m.role === 'TEACHER');
        const withResult = students.filter(s => s.testResult);

        const avgScore = withResult.length > 0
            ? Math.round(withResult.reduce((sum, s) => sum + (s.testResult?.totalScore || 0), 0) / withResult.length)
            : null;

        const careCount = withResult.filter(s => s.testResult!.competencies.some(c => c.score < 60)).length;
        const careRatio = withResult.length > 0 ? Math.round((careCount / withResult.length) * 100) : null;

        const retestedCount = students.filter(s => (s.testHistory?.length || 0) >= 2).length;
        const retentionProxy = students.length > 0 ? Math.round((retestedCount / students.length) * 100) : null;

        const programTracked = students.filter(s => s.program?.nextRenewalDate).length;
        const renewalSoon30d = students.filter(s => {
            if (!s.program?.nextRenewalDate) return false;
            return new Date(s.program.nextRenewalDate).getTime() - now < THIRTY_DAYS_MS;
        }).length;

        const pendingRequests = requests.filter(r => r.academyId === academyId && r.status === 'PENDING').length;
        const newSignups7d = members.filter(m => now - new Date(m.signupDate).getTime() < SEVEN_DAYS_MS).length;

        return {
            academyId,
            academyName,
            studentCount: students.length,
            teacherCount: teachers.length,
            avgScore,
            careRatio,
            retentionProxy,
            renewalSoon30d,
            programTracked,
            pendingRequests,
            newSignups7d
        };
    };

    const stats = academies
        .filter(a => groups.has(a.id))
        .map(a => computeFor(a.id, a.name, groups.get(a.id)!));

    if (groups.has('UNASSIGNED')) {
        stats.push(computeFor('UNASSIGNED', '미배정', groups.get('UNASSIGNED')!));
    }

    return stats.sort((a, b) => b.studentCount - a.studentCount);
};

const AcademyOpsTab: React.FC<AcademyOpsTabProps> = ({ academies, users, requests }) => {
    const stats = buildStats(academies, users, requests);
    const totalPending = stats.reduce((sum, s) => sum + s.pendingRequests, 0);

    return (
        <div className="animate-fade-in space-y-8">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <h3 className="text-navy font-black text-xl flex items-center gap-2">
                    <span className="material-symbols-outlined text-indigo-500">store</span>
                    가맹 운영 대시보드
                </h3>
                {totalPending > 0 && (
                    <span className="bg-secondary/10 text-secondary px-4 py-2 rounded-xl text-sm font-black">
                        전체 대기 중인 상담 {totalPending}건
                    </span>
                )}
            </div>
            <p className="text-sm text-gray-400 -mt-4">
                * 학생별 "등록 과정"(회원 탭에서 편집)이 입력되면 <b>갱신 임박 인원</b>이 실제 데이터로 계산됩니다. 아직 입력 안 된 학생은 <b>다회 평가 완료 비율</b>(재등록 프록시)로 대신 표기합니다.
            </p>

            <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-x-auto">
                <table className="w-full text-left min-w-[980px]">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="p-6 text-xs font-black text-gray-400 uppercase">지점</th>
                            <th className="p-6 text-xs font-black text-gray-400 uppercase">학생/교사</th>
                            <th className="p-6 text-xs font-black text-gray-400 uppercase">평균 점수</th>
                            <th className="p-6 text-xs font-black text-gray-400 uppercase">집중 케어 비율</th>
                            <th className="p-6 text-xs font-black text-gray-400 uppercase">갱신 임박(30일)</th>
                            <th className="p-6 text-xs font-black text-gray-400 uppercase">재등록 프록시</th>
                            <th className="p-6 text-xs font-black text-gray-400 uppercase">대기 상담</th>
                            <th className="p-6 text-xs font-black text-gray-400 uppercase">최근 7일 신규</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {stats.map(s => (
                            <tr key={s.academyId} className={`hover:bg-gray-50 transition-colors ${s.academyId === 'UNASSIGNED' ? 'bg-amber-50/40' : ''}`}>
                                <td className="p-6 font-bold text-navy">
                                    {s.academyName}
                                    {s.academyId === 'UNASSIGNED' && (
                                        <span className="ml-2 text-[10px] font-black bg-amber-100 text-amber-600 px-2 py-0.5 rounded-full align-middle">학원 미지정</span>
                                    )}
                                </td>
                                <td className="p-6 text-sm text-gray-600">{s.studentCount}명 / {s.teacherCount}명</td>
                                <td className="p-6 font-bold text-navy">{s.avgScore ?? '-'}</td>
                                <td className="p-6">
                                    {s.careRatio !== null ? (
                                        <span className={`px-3 py-1 rounded-lg text-sm font-bold ${s.careRatio >= 30 ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-500'}`}>
                                            {s.careRatio}%
                                        </span>
                                    ) : '-'}
                                </td>
                                <td className="p-6">
                                    {s.programTracked > 0 ? (
                                        <span className={`px-3 py-1 rounded-lg text-sm font-bold ${s.renewalSoon30d > 0 ? 'bg-secondary/10 text-secondary' : 'bg-gray-50 text-gray-500'}`}>
                                            {s.renewalSoon30d}명
                                        </span>
                                    ) : <span className="text-gray-300 text-sm">데이터 없음</span>}
                                </td>
                                <td className="p-6 text-sm text-gray-600">{s.retentionProxy !== null ? `${s.retentionProxy}%` : '-'}</td>
                                <td className="p-6">
                                    {s.pendingRequests > 0 ? (
                                        <span className="bg-secondary/10 text-secondary px-3 py-1 rounded-lg text-sm font-black">{s.pendingRequests}건</span>
                                    ) : <span className="text-gray-300 text-sm">-</span>}
                                </td>
                                <td className="p-6 text-sm text-gray-600">{s.newSignups7d}명</td>
                            </tr>
                        ))}
                        {stats.length === 0 && (
                            <tr>
                                <td colSpan={8} className="p-10 text-center text-gray-400 font-medium">
                                    표시할 학원/사용자 데이터가 없습니다.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AcademyOpsTab;
