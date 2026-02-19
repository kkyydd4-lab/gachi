/**
 * QuestionSeedGenerator Component
 * 
 * 관리자가 학년별 기본 문항을 사전 생성할 수 있는 도구
 * - [24.01.20 Refactor] 하드코딩된 설정 제거 -> Firestore 동적 설정 사용
 */

import React, { useState, useEffect } from 'react';
import { GradeGroupType, Asset, GradeCurriculumConfig, LearningSession } from '../types';
import { AssetService, CurriculumService, LearningSessionService } from '../services/api';
import { useContentGenerator } from '../hooks/useContentGenerator';

interface QuestionSeedGeneratorProps {
    onComplete: () => void;
}



// --- [Fallback] 초기 마이그레이션용 데이터 (DB가 비어있을 때 사용) ---
const INITIAL_DATA: Record<GradeGroupType, GradeCurriculumConfig> = {
    '초등 저학년': {
        gradeGroup: '초등 저학년',
        topics: [
            '나의 몸과 마음', '가족 구성원의 역할', '집안일 돕기', '등굣길 풍경',
            '교실 규칙', '친구와 화해하기', '올바른 양치질', '골고루 먹기',
            '손 씻기의 중요성', '횡단보도 건너기', '놀이터 안전 수칙', '낯선 사람 주의하기',
            '주변의 꽃과 나무', '좋아하는 동물 이야기', '날씨의 변화', '계절의 특징',
            '해와 달이 된 오누이', '이솝 우화 이야기', '의인화된 동물 동화',
            '재미있는 끝말잇기', '의성어와 의태어', '수수께끼 놀이'
        ],
        config: { charCount: '250~300자', style: '단문 중심, 반복 구문, 친숙한 소재', generateCount: 4 },
        // Total 13 (Session Target)
        categories: { '어휘력': 5, '사실적 이해': 5, '추론적 이해': 3, '구조적 이해': 0, '비판적 이해': 0 }
    },
    '초등 중학년': {
        gradeGroup: '초등 중학년',
        topics: [
            '우리 고장의 전설', '공공기관의 역할', '지도 보는 법', '민속놀이',
            '전통 한복과 음식', '조상들의 지혜가 담긴 도구', '식물의 한살이', '동물의 서식지',
            '자석의 성질', '소리의 성질', '용돈 아껴 쓰기', '저금하는 이유',
            '정직과 책임', '배려와 나눔', '다문화 가정 친구', '인물의 성격 파악하기',
            '이야기의 배경 이해', '시의 비유적 표현', '메모하는 습관', '독서 기록장 쓰기'
        ],
        config: { charCount: '400~500자', style: '인과관계 문장, 정보 전달문', generateCount: 4 },
        // Total 18 (Session Target)
        categories: { '어휘력': 5, '사실적 이해': 5, '추론적 이해': 4, '구조적 이해': 2, '비판적 이해': 2 }
    },
    '초등 고학년': {
        gradeGroup: '초등 고학년',
        topics: [
            '고조선부터 조선까지', '일제강점기 독립운동', '문화유산 보호', '인권 존중',
            '성평등의 의미', '저작권 보호', '동물권과 채식', '기후 위기와 지구 온난화',
            '플라스틱 문제', '에너지 절약', '생태계 평형', '광고의 유혹과 허위 광고',
            '4차 산업혁명', '인공지능의 명과 암', '가짜 뉴스 구별하기', 'SNS 사용법',
            '진정한 우정', '행복의 기준', '자존감 높이기', '토론의 예절',
            '홍길동전의 교훈', '현대 소설의 갈등 구조', '시의 상징성 분석'
        ],
        config: { charCount: '600~800자', style: '논설문, 추상적 개념', generateCount: 4 },
        // Total 20 (Session Target)
        categories: { '어휘력': 4, '사실적 이해': 5, '추론적 이해': 5, '구조적 이해': 3, '비판적 이해': 3 }
    },
    '중등': {
        gradeGroup: '중등',
        topics: [
            '자아정체성', '삶과 죽음의 의미', '동서양 철학자 사상', '언어와 사고의 관계',
            '법의 목적과 정의', '민주주의와 선거', '세계화의 영향', '소수자 차별',
            '수요와 공급의 법칙', '인플레이션', '기업의 사회적 책임', '기회비용',
            '우주의 기원과 빅뱅', '유전공학과 윤리', '생물 다양성', '딥페이크와 윤리',
            '자율주행 자동차', '블록체인과 가상화폐', '회화의 기법(원근법)', '건축에 담긴 철학',
            '대중문화 비평', '국어의 역사와 변천', '한글 창제 원리', '리얼리즘 문학'
        ],
        config: { charCount: '900~1200자', style: '비평문, 논증적 구조', generateCount: 4 },
        // Total 25 (Session Target)
        categories: { '어휘력': 4, '사실적 이해': 4, '추론적 이해': 6, '구조적 이해': 5, '비판적 이해': 6 }
    }
};

const QuestionSeedGenerator: React.FC<QuestionSeedGeneratorProps> = ({ onComplete }) => {
    const [selectedGrade, setSelectedGrade] = useState<GradeGroupType>('초등 중학년');
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [generatedCount, setGeneratedCount] = useState(0);
    const [error, setError] = useState<string | null>(null);

    // Dynamic Config State
    const [isLoadingConfig, setIsLoadingConfig] = useState(true);
    const [curriculumConfig, setCurriculumConfig] = useState<GradeCurriculumConfig | null>(null);

    // Topic Selection State
    const [selectedTopicsList, setSelectedTopicsList] = useState<string[]>([]);

    // Config Loading Effect
    useEffect(() => {
        const loadConfig = async () => {
            setIsLoadingConfig(true);
            try {
                const config = await CurriculumService.getConfig(selectedGrade);
                setCurriculumConfig(config);
                // 기본적으로 랜덤 생성이지만, UI에서는 전체 선택 해제 상태로 시작하거나
                // 혹은 문항 생성기 특성상 '전체 주제 중 랜덤 N개'가 기본일 수 있음.
                // 여기서는 User가 '직접 선택' 할 수 있게 초기화는 빈 배열로 두고,
                // 선택 안하면 -> 랜덤, 선택 하면 -> 선택된 것만 생성 로직으로 간다.
                setSelectedTopicsList([]);
            } catch (err) {
                console.error("Config load failed", err);
                // Fallback to initial data if DB fails or empty (for now)
                setCurriculumConfig(INITIAL_DATA[selectedGrade]);
            } finally {
                setIsLoadingConfig(false);
            }
        };

        loadConfig();
    }, [selectedGrade]);

    // [Dev Helper] 마이그레이션 버튼 액션
    const handleMigration = async () => {
        if (!confirm('초기 데이터를 DB에 업로드하시겠습니까? (이미 존재하면 덮어씁니다)')) return;
        setIsGenerating(true);
        try {
            for (const grade of Object.keys(INITIAL_DATA) as GradeGroupType[]) {
                await CurriculumService.saveConfig(INITIAL_DATA[grade]);
            }
            alert('마이그레이션 완료! 페이지를 새로고침하세요.');
            window.location.reload();
        } catch (e) {
            alert('오류 발생: ' + e);
        } finally {
            setIsGenerating(false);
        }
    };

    const toggleTopic = (topic: string) => {
        setSelectedTopicsList(prev =>
            prev.includes(topic)
                ? prev.filter(t => t !== topic)
                : [...prev, topic]
        );
    };

    // Hook
    const { generatePassageWithQuestions, isLoading: isHookLoading, error: hookError } = useContentGenerator();

    // Use local isGenerating for batch process management, but sync error
    // Actually we can just use local state for the loop and call hook methods which are stateless (mostly)
    // The hook 'isLoading' tracks individual requests, but here we run a loop.
    // We will keep 'isGenerating' local state to lock UI during the whole batch.

    const generateSeedQuestions = async () => {
        if (!curriculumConfig) {
            setError("설정을 불러오지 못했습니다.");
            return;
        }

        setIsGenerating(true);
        setProgress(0);
        setGeneratedCount(0);
        setError(null);

        const { config, categories, topics } = curriculumConfig;

        // --- Session Generation Strategy ---
        // 1 Session = 4 Passages
        const SESSION_SIZE = 4;
        let targetTopics: string[] = [];

        if (selectedTopicsList.length > 0) {
            targetTopics = selectedTopicsList;
        } else {
            // Pick 4 unused topics randomly
            const existingAssets = await AssetService.getAllAssets();
            const usedTopics = new Set(
                existingAssets
                    .filter(a => a.gradeGroup === selectedGrade)
                    .map(a => a.subject)
            );
            const availableTopics = topics.filter(t => !usedTopics.has(t));

            if (availableTopics.length < SESSION_SIZE) {
                const pool = availableTopics.length > 0 ? availableTopics : topics;
                const shuffled = [...pool].sort(() => Math.random() - 0.5);
                targetTopics = shuffled.slice(0, SESSION_SIZE);
            } else {
                const shuffled = [...availableTopics].sort(() => Math.random() - 0.5);
                targetTopics = shuffled.slice(0, SESSION_SIZE);
            }
        }

        const totalToGenerate = targetTopics.length;
        const newAssets: Asset[] = [];

        // --- Category Distribution Logic ---
        const distributedCounts: Record<string, number>[] = Array.from({ length: totalToGenerate }, () => ({}));
        let passageIndex = 0;

        Object.entries(categories).forEach(([category, count]) => {
            const numCount = count as number;
            for (let j = 0; j < numCount; j++) {
                const targetP = passageIndex % totalToGenerate;
                distributedCounts[targetP][category] = (distributedCounts[targetP][category] || 0) + 1;
                passageIndex++;
            }
        });

        try {
            // --- 🚀 통합 호출 + 병렬 배치 처리 ---
            // 기존: 주제당 2회 호출 (지문 + 문항) = 8회
            // 개선: 주제당 1회 통합 호출 = 4회 (50% 감소)
            const BATCH_SIZE = 2;
            let completedCount = 0;

            const generateSingleAsset = async (index: number): Promise<Asset | null> => {
                const subject = targetTopics[index];
                const passageCategories = distributedCounts[index];
                if (!passageCategories || Object.keys(passageCategories).length === 0) return null;

                // 🚀 통합 호출: 지문 + 문항을 1번에 생성
                const result = await generatePassageWithQuestions(
                    subject,
                    selectedGrade,
                    passageCategories,
                    {
                        length: config.charCount,
                        difficulty: config.difficulty,
                        style: config.style,
                    }
                );

                if (!result || !result.questions || result.questions.length === 0) {
                    console.error(`Generation failed for topic: ${subject}`);
                    return null;
                }

                const newAsset: Asset = {
                    assetId: crypto.randomUUID(),
                    gradeGroup: selectedGrade,
                    subject: subject,
                    title: result.title,
                    content: result.content,
                    difficulty: (config.difficulty as any) || '중',
                    questions: (result.questions || []).map((q: any) => ({
                        ...q,
                        id: typeof q.id === 'number' ? q.id : (Number(q.id) || Math.floor(Math.random() * 10000)),
                        options: (q.options || []).map((opt: string) =>
                            opt.replace(/^[①-⑮0-9.\s]+/, '').trim()
                        ),
                        rationale: q.rationale || null
                    })),
                    createdAt: new Date().toISOString(),
                    status: 'CANDIDATE'
                };

                await AssetService.createAsset(newAsset);

                // Update progress
                completedCount++;
                setGeneratedCount(completedCount);
                setProgress(Math.round((completedCount / totalToGenerate) * 100));

                return newAsset;
            };

            // Process in batches of BATCH_SIZE (2 at a time)
            for (let batch = 0; batch < totalToGenerate; batch += BATCH_SIZE) {
                const batchIndices = [];
                for (let i = batch; i < Math.min(batch + BATCH_SIZE, totalToGenerate); i++) {
                    batchIndices.push(i);
                }

                setProgress(Math.round((batch / totalToGenerate) * 100));

                const results = await Promise.allSettled(
                    batchIndices.map(idx => generateSingleAsset(idx))
                );

                for (const result of results) {
                    if (result.status === 'fulfilled' && result.value) {
                        newAssets.push(result.value);
                    } else if (result.status === 'rejected') {
                        console.error('Batch item failed:', result.reason);
                    }
                }
            }

            // --- Create LearningSession (Batch 4 as 1 Session) ---
            if (newAssets.length > 0) {
                const allSessions = await LearningSessionService.getAllSessions();
                const sessionCount = allSessions.filter(s => s.gradeGroup === selectedGrade).length;
                const newSession: LearningSession = {
                    sessionId: crypto.randomUUID(),
                    gradeGroup: selectedGrade,
                    title: `${selectedGrade} ${sessionCount + 1}차시`,
                    difficulty: '중',
                    assetIds: newAssets.map(a => a.assetId),
                    status: 'DRAFT',
                    createdAt: new Date().toISOString()
                };
                await LearningSessionService.createSession(newSession);
                console.log("LearningSession Created:", newSession.title);
            }

            onComplete();
        } catch (err: any) {
            console.error('Generation error:', err);
            setError(`생성 중 오류가 발생했습니다: ${err.message || err}`);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="bg-gradient-to-br from-primary/5 to-secondary/5 rounded-3xl p-8 border border-gray-100 relative">
            {/* Admin Migration Tool (Hidden in Production) */}
            <div className="absolute top-4 right-4">
                <button
                    onClick={handleMigration}
                    className="text-xs text-gray-300 hover:text-red-400 font-bold border border-transparent hover:border-red-200 px-2 py-1 rounded-lg transition-colors"
                    title="초기 데이터 마이그레이션 (관리자용)"
                >
                    DB 초기화
                </button>
            </div>

            <h3 className="text-lg font-black text-navy mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">auto_fix_high</span>
                학년별 기본 문항 생성기 V2
            </h3>
            <p className="text-sm text-gray-500 mb-6">
                선택한 학년에 맞는 지문과 문항을 AI가 자동 생성합니다. 생성된 문항은 'Data Lab'에서 검토 후 승인하세요.
            </p>

            {/* Grade Selection */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {(['초등 저학년', '초등 중학년', '초등 고학년', '중등'] as GradeGroupType[]).map(grade => (
                    <button
                        key={grade}
                        onClick={() => setSelectedGrade(grade)}
                        disabled={isGenerating}
                        className={`p-4 rounded-xl border-2 text-sm font-bold transition-all ${selectedGrade === grade
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-gray-200 text-gray-400 hover:border-gray-300'
                            } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {grade}
                    </button>
                ))}
            </div>

            {/* Config Preview / Loader */}
            {isLoadingConfig ? (
                <div className="h-32 bg-white rounded-2xl p-6 mb-6 border border-gray-100 flex items-center justify-center gap-3">
                    <span className="material-symbols-outlined animate-spin text-primary">sync</span>
                    <span className="text-sm font-bold text-gray-400">커리큘럼 설정 불러오는 중...</span>
                </div>
            ) : curriculumConfig ? (
                <div className="bg-white rounded-2xl p-6 mb-6 border border-gray-100">
                    <div className="grid grid-cols-2 gap-4 text-sm">

                        {/* Topic Pool (Selectable) */}
                        <div className="col-span-2 mb-2">
                            <div className="flex justify-between items-center mb-2">
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
                                    주제 선택 ({selectedTopicsList.length > 0 ? `${selectedTopicsList.length}개 선택됨` : `랜덤 ${curriculumConfig.config.generateCount}개 생성`})
                                </p>
                                <button
                                    onClick={() => setSelectedTopicsList([])}
                                    className="text-[10px] text-gray-400 underline hover:text-primary"
                                >
                                    선택 초기화
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto custom-scrollbar p-1">
                                {curriculumConfig.topics.map(topic => (
                                    <button
                                        key={topic}
                                        onClick={() => toggleTopic(topic)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${selectedTopicsList.includes(topic)
                                            ? 'bg-navy text-white border-navy shadow-md'
                                            : 'bg-white text-gray-500 border-gray-100 hover:border-gray-300'
                                            }`}
                                    >
                                        {topic}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">지문 전략 (Strategy)</p>
                            <p className="text-navy font-bold">{curriculumConfig.config.charCount}</p>
                            <p className="text-xs text-gray-500">{curriculumConfig.config.style}</p>
                            {curriculumConfig.config.difficulty && (
                                <span className="inline-block mt-1 bg-red-100 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold">
                                    난이도: {curriculumConfig.config.difficulty}
                                </span>
                            )}
                        </div>
                        <div className="col-span-2">
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-1">문항 구성 (Architecture)</p>
                            <div className="flex flex-wrap gap-2">
                                {Object.entries(curriculumConfig.categories)
                                    .sort(([a], [b]) => {
                                        const order = ['어휘력', '사실적 이해', '추론적 이해', '구조적 이해', '비판적 이해'];
                                        return order.indexOf(a) - order.indexOf(b);
                                    })
                                    .map(([cat, count]) => (
                                        <span key={cat} className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold">
                                            {cat} x{count}
                                        </span>
                                    ))}
                            </div>
                        </div>
                        {curriculumConfig.config.instruction && (
                            <div className="col-span-2 bg-gray-50 p-3 rounded-xl">
                                <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Expert Instruction</p>
                                <p className="text-navy text-xs leading-relaxed">{curriculumConfig.config.instruction}</p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold text-center">
                    설정을 불러올 수 없습니다. (DB 초기화 필요)
                </div>
            )}

            {/* Progress */}
            {isGenerating && (
                <div className="mb-6">
                    <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-500 font-bold">생성 중... ({generatedCount}/{selectedTopicsList.length > 0 ? selectedTopicsList.length : (curriculumConfig?.config.generateCount || 4)})</span>
                        <span className="text-primary font-black">{progress}%</span>
                    </div>
                    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-300 rounded-full"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold">
                    {error}
                </div>
            )}

            {/* Generate Button */}
            <button
                onClick={generateSeedQuestions}
                disabled={isGenerating || !curriculumConfig}
                className={`w-full py-5 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 ${isGenerating || !curriculumConfig
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-primary text-white shadow-lg shadow-primary/30 hover:brightness-105 active:scale-[0.98]'
                    }`}
            >
                {isGenerating ? (
                    <>
                        <span className="material-symbols-outlined animate-spin">refresh</span>
                        생성 중...
                    </>
                ) : (
                    <>
                        <span className="material-symbols-outlined">rocket_launch</span>
                        {selectedGrade} 문항 생성 시작
                    </>
                )}
            </button>

            {/* Result */}
            {!isGenerating && generatedCount > 0 && (
                <div className="mt-6 p-4 bg-primary/10 rounded-xl text-center">
                    <span className="material-symbols-outlined text-primary text-3xl mb-2 block">check_circle</span>
                    <p className="text-primary font-black">{generatedCount}개의 지문이 생성되었습니다!</p>
                    <p className="text-gray-500 text-sm mt-1">Data Lab에서 검토 후 승인해주세요.</p>
                </div>
            )}
        </div>
    );
};

export default QuestionSeedGenerator;
