/**
 * GenerateTab - 원스톱 문항 생성 허브
 * 
 * 학년 선택, 토픽 선택, 카테고리별 문항 수 조정, AI 프롬프트 편집까지
 * 모든 생성 관련 설정을 한 화면에서 처리합니다.
 * 
 * [Refactoring] 
 * - 비즈니스 로직: hooks/useSessionGenerator.ts 이동
 * - 상수 데이터: data/curriculum.ts 이동
 * - 타입 정의: types/domain.ts 이동
 */

import React, { useState, useEffect } from 'react';
import { useSessionGenerator, AgentStep } from '../../hooks/useSessionGenerator';
import { GradeGroupType, GradeCurriculumConfig } from '../../types/domain';
import { CurriculumService } from '../../services/api';
import { INITIAL_CURRICULUM_DATA, getDifficultyInstructions, SENTENCE_LENGTH_GUIDE } from '../../data/curriculum';

interface GenerateTabProps {
    onRefreshAssets: () => void;
    onRefreshSessions: () => void;
}

const GenerateTab: React.FC<GenerateTabProps> = ({ onRefreshAssets, onRefreshSessions }) => {
    // State
    const [selectedGrade, setSelectedGrade] = useState<GradeGroupType>('초등 중학년');

    // New Hook Integration
    const {
        isGenerating,
        progress,
        generatedCount,
        error: localError,
        agentStep,
        generateSession
    } = useSessionGenerator(onRefreshAssets, onRefreshSessions);

    const agentStepLabels: Record<AgentStep, string> = {
        'IDLE': '',
        'PLANNING': '🔍 출제 전략 수립 중...',
        'WRITING': '✍️ 고급 문항 작성 중...'
    };

    // Config State
    const [isLoadingConfig, setIsLoadingConfig] = useState(true);
    const [curriculumConfig, setCurriculumConfig] = useState<GradeCurriculumConfig | null>(null);
    const [selectedTopicsList, setSelectedTopicsList] = useState<string[]>([]);
    const [isMigrating, setIsMigrating] = useState(false);

    // Advanced Settings Panel
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [additionalInstructions, setAdditionalInstructions] = useState('');

    // Difficulty Selection
    const [selectedDifficulty, setSelectedDifficulty] = useState<'하' | '중' | '상'>('중');

    // Load Config on Grade Change
    useEffect(() => {
        const loadConfig = async () => {
            setIsLoadingConfig(true);
            try {
                const config = await CurriculumService.getConfig(selectedGrade);
                if (config) {
                    setCurriculumConfig(config);
                } else {
                    setCurriculumConfig(INITIAL_CURRICULUM_DATA[selectedGrade]);
                }
                setSelectedTopicsList([]);
            } catch (err) {
                console.error("Config load failed", err);
                setCurriculumConfig(INITIAL_CURRICULUM_DATA[selectedGrade]);
            } finally {
                setIsLoadingConfig(false);
            }
        };
        loadConfig();
    }, [selectedGrade]);

    const toggleTopic = (topic: string) => {
        setSelectedTopicsList(prev =>
            prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
        );
    };

    const updateCategoryCount = (category: string, delta: number) => {
        if (!curriculumConfig) return;
        const current = (curriculumConfig.categories[category] as number) || 0;
        const newCount = Math.max(0, current + delta);
        setCurriculumConfig({
            ...curriculumConfig,
            categories: { ...curriculumConfig.categories, [category]: newCount }
        });
    };

    const handleMigration = async () => {
        if (!confirm('초기 데이터를 DB에 업로드하시겠습니까? (이미 존재하면 덮어씁니다)')) return;
        setIsMigrating(true);
        try {
            for (const grade of Object.keys(INITIAL_CURRICULUM_DATA) as GradeGroupType[]) {
                await CurriculumService.saveConfig(INITIAL_CURRICULUM_DATA[grade]);
            }
            alert('마이그레이션 완료! 페이지를 새로고침하세요.');
            window.location.reload();
        } catch (e) {
            alert('오류 발생: ' + e);
        } finally {
            setIsMigrating(false);
        }
    };

    const handleGenerate = () => {
        if (!curriculumConfig) return;
        generateSession(
            curriculumConfig,
            selectedGrade,
            selectedDifficulty,
            selectedTopicsList,
            additionalInstructions
        );
    };

    // 4개 지문에 영역별 문항을 균등 분배하는 Helper (Display용)
    const distributeQuestionsToPassages = (categories: Record<string, number>, passageCount: number = 4): Record<string, number>[] => {
        const passages: Record<string, number>[] = Array.from({ length: passageCount }, () => ({}));
        let offsetAccumulator = 0;
        Object.entries(categories).forEach(([category, totalCount]) => {
            if (totalCount === 0) return;
            const perPassage = Math.floor(totalCount / passageCount);
            const remainder = totalCount % passageCount;
            for (let i = 0; i < passageCount; i++) {
                const adjustedIndex = (i + offsetAccumulator) % passageCount;
                const count = perPassage + (i < remainder ? 1 : 0);
                if (count > 0) {
                    passages[adjustedIndex][category] = count;
                }
            }
            offsetAccumulator += remainder;
        });
        return passages;
    };

    // Category Display Labels
    const categoryLabels: Record<string, { icon: string; desc: string }> = {
        '어휘력': { icon: 'spellcheck', desc: '단어의 의미 파악' },
        '사실적 이해': { icon: 'visibility', desc: '명시된 정보 확인' },
        '추론적 이해': { icon: 'psychology', desc: '숨겨진 의미 추론' },
        '구조적 이해': { icon: 'account_tree', desc: '글의 구조 분석' },
        '비판적 이해': { icon: 'rate_review', desc: '논리와 의도 평가' }
    };

    const totalQuestions = curriculumConfig
        ? Object.values(curriculumConfig.categories).reduce((a: number, b) => a + (b as number), 0)
        : 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-gradient-to-r from-primary/10 to-secondary/10 rounded-[2rem] p-6 flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-black text-navy flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">auto_fix_high</span>
                        원스톱 문항 생성
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">학년 선택부터 생성까지 한 화면에서 완료하세요.</p>
                </div>
                <button
                    onClick={handleMigration}
                    disabled={isMigrating}
                    className="text-xs text-gray-300 hover:text-red-400 font-bold px-3 py-1 rounded-lg border border-transparent hover:border-red-200 transition-colors"
                    title="초기 데이터 마이그레이션"
                >
                    DB 초기화
                </button>
            </div>

            {/* Grade Selection */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(['초등 저학년', '초등 중학년', '초등 고학년', '중등'] as GradeGroupType[]).map(grade => (
                    <button
                        key={grade}
                        onClick={() => {
                            setSelectedGrade(grade);
                        }}
                        disabled={isGenerating}
                        className={`p-5 rounded-2xl border-2 text-left transition-all ${selectedGrade === grade
                            ? 'border-primary bg-white shadow-xl'
                            : 'border-gray-100 bg-white/50 hover:border-gray-200'
                            } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        <p className={`text-[10px] font-black uppercase ${selectedGrade === grade ? 'text-primary' : 'text-gray-400'}`}>
                            {grade === '초등 저학년' ? 'Step 1' : grade === '초등 중학년' ? 'Step 2' : grade === '초등 고학년' ? 'Step 3' : 'Step 4'}
                        </p>
                        <p className={`font-black text-lg ${selectedGrade === grade ? 'text-navy' : 'text-gray-500'}`}>{grade}</p>
                    </button>
                ))}
            </div>

            {/* Difficulty Selection */}
            <div className="bg-white rounded-[2rem] p-6 border border-gray-100">
                <h3 className="font-black text-navy flex items-center gap-2 mb-4">
                    <span className="material-symbols-outlined text-secondary">speed</span>
                    난이도 선택
                </h3>
                <div className="grid grid-cols-3 gap-3">
                    {(['하', '중', '상'] as const).map(diff => (
                        <button
                            key={diff}
                            onClick={() => setSelectedDifficulty(diff)}
                            disabled={isGenerating}
                            className={`p-4 rounded-xl border-2 text-center transition-all ${selectedDifficulty === diff
                                ? diff === '하' ? 'border-green-500 bg-green-50 text-green-600'
                                    : diff === '중' ? 'border-amber-500 bg-amber-50 text-amber-600'
                                        : 'border-red-500 bg-red-50 text-red-600'
                                : 'border-gray-100 text-gray-400 hover:border-gray-200'
                                } ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <p className="font-black text-xl mb-1">{diff}</p>
                            <p className="text-xs font-bold">
                                {diff === '하' ? '기초' : diff === '중' ? '표준' : '심화'}
                            </p>
                        </button>
                    ))}
                </div>
                <p className="text-xs text-gray-400 mt-3 text-center">
                    {selectedDifficulty === '하' && '쉬운 어휘, 명확한 답, 추론 최소화'}
                    {selectedDifficulty === '중' && '학년 수준 어휘, 적절한 추론 문제 포함'}
                    {selectedDifficulty === '상' && '고급 어휘, 복합 추론, 매력적인 오답'}
                </p>
            </div>

            {/* Config Loading */}
            {isLoadingConfig ? (
                <div className="h-40 bg-white rounded-[2rem] border border-gray-100 flex items-center justify-center gap-3">
                    <span className="material-symbols-outlined animate-spin text-primary">sync</span>
                    <span className="text-sm font-bold text-gray-400">설정 불러오는 중...</span>
                </div>
            ) : curriculumConfig ? (
                <div className="bg-white rounded-[2rem] p-8 border border-gray-100 space-y-6">
                    {/* Topic Selection */}
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-black text-navy flex items-center gap-2">
                                <span className="material-symbols-outlined text-secondary">topic</span>
                                주제 선택
                            </h3>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-gray-400 font-bold">
                                    {selectedTopicsList.length > 0 ? `${selectedTopicsList.length}개 선택됨` : '랜덤 4개 자동 선택'}
                                </span>
                                <button
                                    onClick={() => setSelectedTopicsList([])}
                                    className="text-xs text-gray-400 underline hover:text-primary"
                                >
                                    초기화
                                </button>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar p-1">
                            {curriculumConfig.topics.map(topic => (
                                <button
                                    key={topic}
                                    onClick={() => toggleTopic(topic)}
                                    className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${selectedTopicsList.includes(topic)
                                        ? 'bg-navy text-white border-navy shadow-md'
                                        : 'bg-gray-50 text-gray-500 border-gray-100 hover:border-gray-300'
                                        }`}
                                >
                                    {topic}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Category Count */}
                    <div>
                        <h3 className="font-black text-navy flex items-center gap-2 mb-3">
                            <span className="material-symbols-outlined text-secondary">tune</span>
                            영역별 문항 수
                            <span className="ml-auto bg-navy text-white px-3 py-1 rounded-full text-xs font-black">
                                총 {totalQuestions}문항
                            </span>
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {Object.entries(curriculumConfig.categories).map(([cat, count]) => (
                                <div key={cat} className="bg-gray-50 rounded-xl p-4 text-center">
                                    <span className="material-symbols-outlined text-primary mb-1 block">{categoryLabels[cat]?.icon || 'check'}</span>
                                    <p className="text-xs font-bold text-navy mb-1">{cat}</p>
                                    <div className="flex items-center justify-center gap-2">
                                        <button
                                            onClick={() => updateCategoryCount(cat, -1)}
                                            className="w-6 h-6 bg-white rounded-lg text-gray-400 hover:text-navy border border-gray-100 font-black text-sm"
                                        >-</button>
                                        <span className="font-black text-navy w-6">{count}</span>
                                        <button
                                            onClick={() => updateCategoryCount(cat, 1)}
                                            className="w-6 h-6 bg-white rounded-lg text-gray-400 hover:text-navy border border-gray-100 font-black text-sm"
                                        >+</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Advanced Settings Toggle */}
                    <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-colors"
                    >
                        <span className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm">settings</span>
                            고급 설정 (AI 프롬프트)
                        </span>
                        <span className="material-symbols-outlined text-sm">{showAdvanced ? 'expand_less' : 'expand_more'}</span>
                    </button>

                    {/* Advanced Panel */}
                    {showAdvanced && (
                        <div className="bg-gray-50 rounded-xl p-6 space-y-5">
                            {/* 현재 프롬프트 미리보기 */}
                            <div>
                                <label className="text-xs font-black text-primary uppercase tracking-widest block mb-2 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">visibility</span>
                                    현재 AI 프롬프트 미리보기
                                </label>
                                <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-600 max-h-96 overflow-y-auto custom-scrollbar space-y-4">
                                    {/* 기본 설정 */}
                                    <div>
                                        <p className="font-bold text-navy mb-2">📝 지문 생성 조건</p>
                                        <ul className="list-disc list-inside space-y-1 text-xs">
                                            <li>학년: <span className="font-bold">{selectedGrade}</span></li>
                                            <li>글자 수: <span className="font-bold">{curriculumConfig?.config.charCount}</span></li>
                                            <li>문체: <span className="font-bold">{curriculumConfig?.config.style}</span></li>
                                            <li>난이도: <span className="font-bold text-primary">{selectedDifficulty} ({selectedDifficulty === '하' ? '기초' : selectedDifficulty === '중' ? '표준' : '심화'})</span></li>
                                        </ul>
                                    </div>

                                    {/* [Phase 1] 문장 길이 가이드 */}
                                    <div>
                                        <p className="font-bold text-navy mb-2">📏 문장 길이 가이드</p>
                                        <div className="bg-blue-50 rounded-lg p-2 text-xs">
                                            <span className="text-blue-700">
                                                평균 <span className="font-bold">{SENTENCE_LENGTH_GUIDE[selectedGrade].avg}</span>,
                                                최대 <span className="font-bold">{SENTENCE_LENGTH_GUIDE[selectedGrade].max}자</span>
                                            </span>
                                        </div>
                                    </div>

                                    {/* 문항 분배 */}
                                    <div>
                                        <p className="font-bold text-navy mb-2">📊 문항 분배 계획 (4개 지문)</p>
                                        <div className="text-xs space-y-1">
                                            {distributeQuestionsToPassages(curriculumConfig?.categories || {}).map((dist, idx) => (
                                                <div key={idx} className="flex items-center gap-2">
                                                    <span className="bg-primary/10 text-primary font-bold px-2 py-0.5 rounded">지문 {idx + 1}</span>
                                                    <span className="text-gray-500">
                                                        {Object.entries(dist).filter(([_, c]) => c > 0).map(([cat, cnt]) => `${cat} ${cnt}개`).join(', ') || '(배정 없음)'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 난이도별 지침 */}
                                    <div>
                                        <p className="font-bold text-navy mb-2">🎯 난이도별 상세 지침</p>
                                        <pre className="whitespace-pre-wrap text-xs text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100">{getDifficultyInstructions(selectedDifficulty, selectedGrade)}</pre>
                                    </div>
                                </div>
                            </div>

                            {/* 추가 지침 입력 */}
                            <div>
                                <label className="text-xs font-black text-secondary uppercase tracking-widest block mb-2 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">edit_note</span>
                                    추가 지침 (선택사항)
                                </label>
                                <textarea
                                    className="w-full h-24 bg-white rounded-xl border border-gray-200 p-4 text-sm focus:ring-2 focus:ring-secondary/20 outline-none resize-none"
                                    placeholder="예시:
• 실생활과 관련된 사례를 포함해주세요
• 아이들이 좋아하는 유튜브/게임 소재를 반영해주세요
• 환경 보호 메시지를 담아주세요"
                                    value={additionalInstructions}
                                    onChange={(e) => setAdditionalInstructions(e.target.value)}
                                />
                                <p className="text-xs text-gray-400 mt-2">
                                    💡 입력한 지침은 지문 생성과 문항 출제 시 AI에게 전달됩니다.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="p-6 bg-red-50 text-red-600 rounded-xl text-sm font-bold text-center">
                    설정을 불러올 수 없습니다. 상단의 'DB 초기화' 버튼을 눌러주세요.
                </div>
            )}

            {/* Progress */}
            {isGenerating && (
                <div className="bg-white rounded-[2rem] p-6 border border-gray-100">
                    <div className="flex justify-between text-sm mb-3">
                        <span className="text-gray-500 font-bold">생성 중... ({generatedCount}/{selectedTopicsList.length > 0 ? selectedTopicsList.length : 4})</span>
                        <span className="text-primary font-black">{progress}%</span>
                    </div>
                    <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-300 rounded-full"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    {/* [Phase 2] Agent Step Display */}
                    {agentStep !== 'IDLE' && (
                        <div className="mt-4 p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl text-sm text-center font-medium text-navy animate-pulse">
                            {agentStepLabels[agentStep]}
                        </div>
                    )}
                </div>
            )}

            {/* Error */}
            {localError && (
                <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold">
                    <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold">
                        {localError}
                    </div>
                </div>
            )}

            {/* Generate Button */}
            <button
                onClick={handleGenerate}
                disabled={isGenerating || !curriculumConfig}
                className={`w-full py-6 rounded-[2rem] font-black text-lg transition-all flex items-center justify-center gap-3 ${isGenerating || !curriculumConfig
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-primary to-secondary text-white shadow-xl shadow-primary/30 hover:brightness-105 active:scale-[0.99]'
                    }`}
            >
                {isGenerating ? (
                    <>
                        <span className="material-symbols-outlined animate-spin">refresh</span>
                        1차시 생성 중...
                    </>
                ) : (
                    <>
                        <span className="material-symbols-outlined">rocket_launch</span>
                        🚀 {selectedGrade} 1차시 문항 생성하기
                    </>
                )}
            </button>

            {/* Result */}
            {!isGenerating && generatedCount > 0 && (
                <div className="p-6 bg-gradient-to-r from-primary/10 to-secondary/10 rounded-[2rem] text-center">
                    <span className="material-symbols-outlined text-primary text-4xl mb-2 block">check_circle</span>
                    <p className="text-navy font-black text-lg">{generatedCount}개의 지문이 생성되었습니다!</p>
                    <p className="text-gray-500 text-sm mt-1">'문항 검토' 탭에서 차시를 승인해주세요.</p>
                </div>
            )}
        </div>
    );
};

export default GenerateTab;
