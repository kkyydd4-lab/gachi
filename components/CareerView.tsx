import React, { useState, useEffect, useCallback } from 'react';
import { UserAccount, CareerReport, Writing, ReadingLog, GradeGroupType } from '../types';
import { WritingService, ReadingLogService, AuthService } from '../services/api';
import { generateContent, Type } from '../services/gemini';

// 진로·적성 리포트 — 역량 프로필 + 글쓰기 + 독서 데이터를 AI가 종합
// 데이터가 부족하면 요건 체크리스트를 보여주고, 충족 시 생성 가능
interface CareerViewProps {
    user: UserAccount;
    onBack: () => void;
    onUserUpdated: (user: UserAccount) => void;
}

const determineGradeGroup = (gradeStr: string): GradeGroupType => {
    if (gradeStr.includes('초등 1') || gradeStr.includes('초등 2')) return '초등 저학년';
    if (gradeStr.includes('초등 3') || gradeStr.includes('초등 4')) return '초등 중학년';
    if (gradeStr.includes('초등 5') || gradeStr.includes('초등 6')) return '초등 고학년';
    return '중등';
};

// 최소 데이터 요건 — 이 이하로는 리포트 품질이 나오지 않음
const REQUIREMENTS = {
    test: 1,     // 진단 1회 이상
    writing: 1,  // 글 1편 이상
    reading: 2,  // 책 2권 이상
};

const REPORT_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        headline: { type: Type.STRING },
        observedInterests: { type: Type.ARRAY, items: { type: Type.STRING } },
        strengthProfile: { type: Type.STRING },
        suggestedFields: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    name: { type: Type.STRING },
                    reason: { type: Type.STRING },
                    activities: { type: Type.STRING },
                },
                required: ['name', 'reason', 'activities'],
            },
        },
        parentGuide: { type: Type.STRING },
    },
    required: ['headline', 'observedInterests', 'strengthProfile', 'suggestedFields', 'parentGuide'],
};

const CareerView: React.FC<CareerViewProps> = ({ user, onBack, onUserUpdated }) => {
    const [writings, setWritings] = useState<Writing[]>([]);
    const [readings, setReadings] = useState<ReadingLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [genError, setGenError] = useState('');
    const [report, setReport] = useState<CareerReport | null>(user.careerReport || null);

    const gradeGroup = determineGradeGroup(user.grade || '');
    const isMiddle = gradeGroup === '중등';
    const frame: CareerReport['frame'] = isMiddle ? '진로 탐색' : '흥미·강점 발견';

    useEffect(() => {
        const load = async () => {
            if (!user.uid) return;
            const [w, r] = await Promise.all([
                WritingService.getByStudent(user.uid),
                ReadingLogService.getByStudent(user.uid),
            ]);
            setWritings(w);
            setReadings(r);
            setIsLoading(false);
        };
        load();
    }, [user.uid]);

    const testCount = (user.testHistory?.length || 0) || (user.testResult ? 1 : 0);
    const checks = [
        { label: `문해력 진단 ${REQUIREMENTS.test}회 이상`, current: testCount, need: REQUIREMENTS.test },
        { label: `글쓰기 노트에 글 ${REQUIREMENTS.writing}편 이상`, current: writings.length, need: REQUIREMENTS.writing },
        { label: `독서 기록장에 책 ${REQUIREMENTS.reading}권 이상`, current: readings.length, need: REQUIREMENTS.reading },
    ];
    const eligible = checks.every(c => c.current >= c.need);

    const generate = useCallback(async () => {
        if (!user.uid || isGenerating) return;
        setIsGenerating(true);
        setGenError('');
        try {
            const competencyLines = user.testResult
                ? user.testResult.competencies.filter(c => c.total > 0).map(c => `- ${c.label}: ${c.score}점`).join('\n')
                : '없음';
            const writingLines = writings.slice(0, 10).map(w =>
                `- [${w.genre}] "${w.title}"${w.aiReview ? ` (AI 총평: ${w.aiReview.overall.slice(0, 80)})` : ''}`
            ).join('\n');
            const readingLines = readings.slice(0, 15).map(r =>
                `- "${r.bookTitle}"${r.author ? ` (${r.author})` : ''} ★${r.rating}${r.review ? ` — "${r.review}"` : ''}`
            ).join('\n');

            const prompt = `당신은 아동·청소년 진로 교육 전문가입니다. 아래 학생의 문해력·글쓰기·독서 데이터를 종합해 "${frame}" 리포트를 작성하세요.

[학생]
- 학년: ${user.grade} (${gradeGroup})

[문해력 역량 점수]
${competencyLines}

[쓴 글 목록]
${writingLines || '없음'}

[읽은 책 기록]
${readingLines || '없음'}

[작성 지침]
1. ${isMiddle
    ? '중학생 대상 진로 탐색: 구체적 직업군·학과 방향까지 제시하되, 단정하지 말고 "탐색해볼 만한 방향"으로 표현. 자유학기제 활동과 연결하면 좋음.'
    : '초등학생 대상: 직업을 단정하지 말 것. "흥미의 씨앗"과 "강점"을 발견하는 관점으로, 아이의 가능성을 넓히는 어조.'}
2. headline: 아이를 한 문장으로 표현 (예: "이야기를 만들고 전달하는 힘이 자라는 아이")
3. observedInterests: 독서·글쓰기 데이터에서 실제로 관찰된 흥미 키워드 3~5개
4. strengthProfile: 역량 점수와 글·책 데이터를 근거로 강점 서술 (3~4문장, 데이터 인용)
5. suggestedFields: ${isMiddle ? '3개' : '2~3개'} — 각각 name(분야), reason(반드시 위 데이터를 근거로), activities(지금 해볼 수 있는 구체적 활동)
6. parentGuide: 학부모가 가정에서 이 흥미를 키워줄 방법 2~3문장
7. 근거 없는 과장 금지 — 데이터에 있는 것만 근거로 사용

JSON으로만 응답하세요.`;

            const result = await generateContent<Omit<CareerReport, 'generatedAt' | 'frame' | 'dataSnapshot'>>(prompt, {
                temperature: 0.6,
                maxOutputTokens: 4096,
                responseSchema: REPORT_SCHEMA,
            });

            const newReport: CareerReport = {
                ...result,
                frame,
                generatedAt: new Date().toISOString(),
                dataSnapshot: { testCount, writingCount: writings.length, readingCount: readings.length },
            };

            const updatedUser: UserAccount = { ...user, careerReport: newReport };
            const ok = await AuthService.updateUser(updatedUser);
            if (!ok) throw new Error('리포트 저장에 실패했습니다.');

            setReport(newReport);
            onUserUpdated(updatedUser);
        } catch (e: any) {
            console.error('Career report generation failed:', e);
            setGenError('리포트 생성에 실패했습니다. 잠시 후 다시 시도해주세요.');
        } finally {
            setIsGenerating(false);
        }
    }, [user, writings, readings, frame, gradeGroup, isMiddle, testCount, isGenerating, onUserUpdated]);

    return (
        <div className="min-h-screen bg-background-light font-display">
            <div className="bg-navy text-white p-4 flex justify-between items-center sticky top-0 z-50 shadow-md">
                <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary">explore</span>
                    <h3 className="font-bold text-lg">{frame} 리포트</h3>
                </div>
                <button onClick={onBack} className="px-4 py-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors text-sm font-bold">
                    리포트로 돌아가기
                </button>
            </div>

            <main className="max-w-3xl mx-auto p-6 pb-24 space-y-6">
                {isLoading ? (
                    <p className="text-center text-gray-400 py-16">데이터를 불러오는 중...</p>
                ) : (
                    <>
                        {/* 데이터 요건 체크리스트 */}
                        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
                            <h2 className="text-xl font-black text-navy mb-1">{user.name}의 {frame} 🧭</h2>
                            <p className="text-gray-500 text-sm mb-6">
                                평가·글쓰기·독서 데이터가 쌓일수록 리포트가 정확해져요.
                            </p>
                            <div className="space-y-3">
                                {checks.map(c => {
                                    const met = c.current >= c.need;
                                    return (
                                        <div key={c.label} className={`flex items-center justify-between p-4 rounded-2xl border ${met ? 'bg-primary/5 border-primary/15' : 'bg-gray-50 border-gray-100'}`}>
                                            <div className="flex items-center gap-3">
                                                <span className={`material-symbols-outlined ${met ? 'text-primary' : 'text-gray-300'}`}>
                                                    {met ? 'check_circle' : 'radio_button_unchecked'}
                                                </span>
                                                <span className={`text-sm font-bold ${met ? 'text-navy' : 'text-gray-400'}`}>{c.label}</span>
                                            </div>
                                            <span className={`text-sm font-black ${met ? 'text-primary' : 'text-gray-400'}`}>{c.current}/{c.need}</span>
                                        </div>
                                    );
                                })}
                            </div>

                            <button
                                onClick={generate}
                                disabled={!eligible || isGenerating}
                                className="mt-6 w-full py-4 bg-primary text-white rounded-xl font-bold text-lg hover:brightness-105 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                            >
                                {isGenerating && <span className="material-symbols-outlined animate-spin text-sm">refresh</span>}
                                {isGenerating ? 'AI가 데이터를 분석하고 있어요...'
                                    : report ? '최신 데이터로 다시 생성'
                                        : eligible ? `${frame} 리포트 생성하기`
                                            : '데이터가 조금 더 필요해요'}
                            </button>
                            {genError && <p className="text-sm text-red-500 font-bold mt-3 text-center">{genError}</p>}
                        </div>

                        {/* 리포트 본문 */}
                        {report && (
                            <div className="space-y-5">
                                <div className="bg-navy rounded-3xl p-8 text-white shadow-xl">
                                    <p className="text-primary text-xs font-black tracking-widest uppercase mb-3">{report.frame} Report</p>
                                    <h3 className="text-2xl font-black leading-snug break-keep">"{report.headline}"</h3>
                                    <p className="text-white/50 text-xs mt-4">
                                        {new Date(report.generatedAt).toLocaleDateString()} 생성 · 진단 {report.dataSnapshot.testCount}회 · 글 {report.dataSnapshot.writingCount}편 · 책 {report.dataSnapshot.readingCount}권 기반
                                    </p>
                                </div>

                                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
                                    <h4 className="font-black text-navy mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-amber-500">interests</span>
                                        관찰된 흥미
                                    </h4>
                                    <div className="flex flex-wrap gap-2">
                                        {report.observedInterests.map(k => (
                                            <span key={k} className="px-4 py-2 bg-amber-50 text-amber-700 rounded-full text-sm font-bold">{k}</span>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
                                    <h4 className="font-black text-navy mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-primary">psychology</span>
                                        강점 프로필
                                    </h4>
                                    <p className="text-navy leading-relaxed">{report.strengthProfile}</p>
                                </div>

                                <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8">
                                    <h4 className="font-black text-navy mb-4 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-indigo-500">route</span>
                                        {isMiddle ? '탐색해볼 만한 방향' : '자라날 수 있는 방향'}
                                    </h4>
                                    <div className="space-y-4">
                                        {report.suggestedFields.map(f => (
                                            <div key={f.name} className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-5">
                                                <p className="font-black text-navy mb-1">{f.name}</p>
                                                <p className="text-sm text-gray-600 leading-relaxed mb-2">{f.reason}</p>
                                                <p className="text-sm text-indigo-600 font-bold">🎯 지금 해볼 것: <span className="font-medium text-gray-600">{f.activities}</span></p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-secondary/5 border border-secondary/15 rounded-3xl p-8">
                                    <h4 className="font-black text-navy mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-secondary">family_restroom</span>
                                        학부모님 가이드
                                    </h4>
                                    <p className="text-navy leading-relaxed">{report.parentGuide}</p>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
};

export default CareerView;
