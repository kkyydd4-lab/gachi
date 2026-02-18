/**
 * DashboardTab - 관리자 콘텐츠 현황 대시보드
 * 
 * 학년별/주제별/상태별 문항 현황을 시각화하여
 * 콘텐츠 갭(부족한 영역)을 쉽게 파악할 수 있게 합니다.
 */

import React, { useMemo } from 'react';
import { Asset, LearningSession, GradeGroupType } from '../../types';

interface DashboardTabProps {
    assets: Asset[];
    learningSessions: LearningSession[];
}

const GRADE_GROUPS: GradeGroupType[] = ['초등 저학년', '초등 중학년', '초등 고학년', '중등'];

const DashboardTab: React.FC<DashboardTabProps> = ({ assets, learningSessions }) => {
    // Compute statistics
    const stats = useMemo(() => {
        const gradeStats: Record<GradeGroupType, {
            totalSessions: number;
            approvedSessions: number;
            draftSessions: number;
            archivedSessions: number;
            totalAssets: number;
            topics: Set<string>;
            difficulties: Record<string, number>;
            sessionDifficulties: Record<string, number>;
        }> = {} as any;

        // Initialize
        GRADE_GROUPS.forEach(grade => {
            gradeStats[grade] = {
                totalSessions: 0,
                approvedSessions: 0,
                draftSessions: 0,
                archivedSessions: 0,
                totalAssets: 0,
                topics: new Set(),
                difficulties: { '하': 0, '중': 0, '상': 0 },
                sessionDifficulties: { '하': 0, '중': 0, '상': 0 }
            };
        });

        // Sessions
        learningSessions.forEach(session => {
            const g = session.gradeGroup;
            if (!gradeStats[g]) return;
            gradeStats[g].totalSessions++;
            if (session.status === 'APPROVED') gradeStats[g].approvedSessions++;
            else if (session.status === 'DRAFT') gradeStats[g].draftSessions++;
            else if (session.status === 'ARCHIVED') gradeStats[g].archivedSessions++;
            // Track session difficulty
            const d = session.difficulty || '중';
            gradeStats[g].sessionDifficulties[d] = (gradeStats[g].sessionDifficulties[d] || 0) + 1;
        });

        // Assets
        assets.forEach(asset => {
            const g = asset.gradeGroup;
            if (!gradeStats[g]) return;
            gradeStats[g].totalAssets++;
            gradeStats[g].topics.add(asset.subject);
            const d = asset.difficulty || '중';
            gradeStats[g].difficulties[d] = (gradeStats[g].difficulties[d] || 0) + 1;
        });

        return gradeStats;
    }, [assets, learningSessions]);

    // All topics across all grades
    const allTopics = useMemo(() => {
        const topicMap: Record<string, { count: number; grades: Set<GradeGroupType> }> = {};
        assets.forEach(a => {
            if (!topicMap[a.subject]) {
                topicMap[a.subject] = { count: 0, grades: new Set() };
            }
            topicMap[a.subject].count++;
            topicMap[a.subject].grades.add(a.gradeGroup);
        });
        return Object.entries(topicMap)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 20);
    }, [assets]);

    // Total counts
    const totals = useMemo(() => ({
        sessions: learningSessions.length,
        approved: learningSessions.filter(s => s.status === 'APPROVED').length,
        draft: learningSessions.filter(s => s.status === 'DRAFT').length,
        archived: learningSessions.filter(s => s.status === 'ARCHIVED').length,
        assets: assets.length
    }), [assets, learningSessions]);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="bg-gradient-to-r from-navy to-secondary rounded-[2rem] p-8 text-white">
                <h2 className="text-2xl font-black flex items-center gap-3 mb-2">
                    <span className="material-symbols-outlined">dashboard</span>
                    콘텐츠 현황 대시보드
                </h2>
                <p className="text-white/70 text-sm">학년별/주제별 문항 현황을 파악하고 부족한 영역을 확인하세요.</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <SummaryCard label="전체 차시" value={totals.sessions} icon="layers" color="bg-navy" />
                <SummaryCard label="승인됨" value={totals.approved} icon="check_circle" color="bg-green-500" />
                <SummaryCard label="검토 대기" value={totals.draft} icon="pending" color="bg-amber-500" />
                <SummaryCard label="반려됨" value={totals.archived} icon="cancel" color="bg-red-400" />
                <SummaryCard label="전체 지문" value={totals.assets} icon="description" color="bg-primary" />
            </div>

            {/* Grade Breakdown */}
            <div className="bg-white rounded-[2rem] p-8 border border-gray-100">
                <h3 className="font-black text-navy text-lg flex items-center gap-2 mb-6">
                    <span className="material-symbols-outlined text-secondary">school</span>
                    학년별 현황
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {GRADE_GROUPS.map(grade => {
                        const s = stats[grade];
                        return (
                            <div key={grade} className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                                <h4 className="font-black text-navy mb-3">{grade}</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">총 차시</span>
                                        <span className="font-bold text-navy">{s.totalSessions}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">승인됨</span>
                                        <span className="font-bold text-green-500">{s.approvedSessions}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">검토 대기</span>
                                        <span className="font-bold text-amber-500">{s.draftSessions}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">지문 수</span>
                                        <span className="font-bold text-primary">{s.totalAssets}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">주제 종류</span>
                                        <span className="font-bold text-secondary">{s.topics.size}</span>
                                    </div>
                                </div>
                                {/* Difficulty Bar */}
                                <div className="mt-4 pt-4 border-t border-gray-200">
                                    <p className="text-xs text-gray-400 font-bold mb-2">차시 난이도 분포</p>
                                    <div className="flex gap-1 h-2 rounded-full overflow-hidden bg-gray-200">
                                        {s.totalSessions > 0 ? (
                                            <>
                                                <div
                                                    className="bg-green-400"
                                                    style={{ width: `${(s.sessionDifficulties['하'] / s.totalSessions) * 100}%` }}
                                                    title={`하: ${s.sessionDifficulties['하']}`}
                                                />
                                                <div
                                                    className="bg-amber-400"
                                                    style={{ width: `${(s.sessionDifficulties['중'] / s.totalSessions) * 100}%` }}
                                                    title={`중: ${s.sessionDifficulties['중']}`}
                                                />
                                                <div
                                                    className="bg-red-400"
                                                    style={{ width: `${(s.sessionDifficulties['상'] / s.totalSessions) * 100}%` }}
                                                    title={`상: ${s.sessionDifficulties['상']}`}
                                                />
                                            </>
                                        ) : null}
                                    </div>
                                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                                        <span>하 {s.sessionDifficulties['하']}</span>
                                        <span>중 {s.sessionDifficulties['중']}</span>
                                        <span>상 {s.sessionDifficulties['상']}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Topic Coverage */}
            <div className="bg-white rounded-[2rem] p-8 border border-gray-100">
                <h3 className="font-black text-navy text-lg flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-secondary">topic</span>
                    주제별 현황 (상위 20개)
                </h3>
                <p className="text-sm text-gray-400 mb-6">어떤 주제로 지문이 만들어졌는지 확인하세요. 다양한 주제를 커버하면 학생들에게 더 풍부한 경험을 제공할 수 있습니다.</p>

                {allTopics.length === 0 ? (
                    <div className="text-center py-10 text-gray-300 font-bold">
                        아직 생성된 지문이 없습니다.
                    </div>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {allTopics.map(([topic, data]) => (
                            <div key={topic} className="bg-gray-50 rounded-xl p-4 border border-gray-100 hover:shadow-md transition-shadow">
                                <p className="font-bold text-navy text-sm truncate mb-1" title={topic}>{topic}</p>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-400">{data.count}개 지문</span>
                                    <div className="flex gap-1">
                                        {Array.from(data.grades).map(g => (
                                            <span
                                                key={g}
                                                className="w-2 h-2 rounded-full"
                                                style={{
                                                    backgroundColor: g === '초등 저학년' ? '#22c55e' :
                                                        g === '초등 중학년' ? '#f59e0b' :
                                                            g === '초등 고학년' ? '#3b82f6' : '#8b5cf6'
                                                }}
                                                title={g}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Quick Actions */}
            <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-[2rem] p-6 flex items-center justify-between">
                <div>
                    <h3 className="font-black text-navy">콘텐츠가 부족한 영역이 있나요?</h3>
                    <p className="text-sm text-gray-500">'문항 생성' 탭에서 새로운 차시를 만들어 보세요.</p>
                </div>
                <button
                    onClick={() => {
                        // Navigate to generate tab - handled by parent
                        const btn = document.querySelector('[data-tab="generate"]') as HTMLButtonElement;
                        if (btn) btn.click();
                    }}
                    className="bg-primary text-white px-6 py-3 rounded-2xl font-black shadow-lg hover:brightness-105 transition-all flex items-center gap-2"
                >
                    <span className="material-symbols-outlined">add</span>
                    문항 생성하기
                </button>
            </div>
        </div>
    );
};

// Summary Card Component
const SummaryCard: React.FC<{ label: string; value: number; icon: string; color: string }> = ({ label, value, icon, color }) => (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
        <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center text-white shadow-lg`}>
            <span className="material-symbols-outlined">{icon}</span>
        </div>
        <div>
            <p className="text-2xl font-black text-navy">{value}</p>
            <p className="text-xs text-gray-400 font-bold">{label}</p>
        </div>
    </div>
);

export default DashboardTab;
