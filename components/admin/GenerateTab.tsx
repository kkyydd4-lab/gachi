/**
 * GenerateTab - 원스톱 문항 생성 허브
 * 
 * 학년 선택, 토픽 선택, 카테고리별 문항 수 조정, AI 프롬프트 편집까지
 * 모든 생성 관련 설정을 한 화면에서 처리합니다.
 */

import React, { useState, useEffect } from 'react';
import { useContentGenerator } from '../../hooks/useContentGenerator';
import { GradeGroupType, Asset, GradeCurriculumConfig, LearningSession } from '../../types';
import { AssetService, CurriculumService, LearningSessionService } from '../../services/api';

interface GenerateTabProps {
    onRefreshAssets: () => void;
    onRefreshSessions: () => void;
}

// Gemini initialization removed - handled by hook

// --- [Fallback] 초기 마이그레이션용 데이터 ---
const INITIAL_DATA: Record<GradeGroupType, GradeCurriculumConfig> = {
    '초등 저학년': {
        gradeGroup: '초등 저학년',
        topics: ['동물의 한살이', '계절 변화', '물의 순환', '우리 동네 직업', '안전한 생활', '가족의 소중함', '친구와 우정', '자연 보호', '건강한 식습관', '교통 규칙'],
        config: { charCount: '250자', style: '대화체 또는 동화체', generateCount: 4 },
        categories: { '어휘력': 5, '사실적 이해': 5, '추론적 이해': 3, '구조적 이해': 0, '비판적 이해': 0 }
    },
    '초등 중학년': {
        gradeGroup: '초등 중학년',
        topics: ['우리 고장의 전설', '공공기관의 역할', '지도 보는 법', '민속놀이', '지진과 화산', '태양계', '날씨와 기후', '동식물의 한살이', '분수와 소수', '조선 시대 생활'],
        config: { charCount: '400자', style: '정보 전달 글', generateCount: 4 },
        categories: { '어휘력': 5, '사실적 이해': 5, '추론적 이해': 4, '구조적 이해': 2, '비판적 이해': 2 }
    },
    '초등 고학년': {
        gradeGroup: '초등 고학년',
        topics: ['고조선부터 조선까지', '일제강점기 독립운동', '문화유산 보호', '인권 존중', '경제의 기본 개념', '지구 온난화', '에너지 절약', '민주주의와 선거', '세계의 다양한 문화', '과학 기술 발전'],
        config: { charCount: '600자', style: '논설문/설명문', generateCount: 4 },
        categories: { '어휘력': 4, '사실적 이해': 5, '추론적 이해': 5, '구조적 이해': 3, '비판적 이해': 3 }
    },
    '중등': {
        gradeGroup: '중등',
        topics: ['자아정체성', '삶과 죽음의 의미', '동서양 철학자 사상', '언어와 사고의 관계', '기후변화와 지속가능성', '4차 산업혁명', '인공지능 윤리', '세계화와 문화 다양성', '민주주의의 발전', '현대 사회 문제'],
        config: { charCount: '900자', style: '논설/비평문', generateCount: 4 },
        categories: { '어휘력': 4, '사실적 이해': 4, '추론적 이해': 6, '구조적 이해': 5, '비판적 이해': 6 }
    }
};

// Helper function removed - handled by hook

// 4개 지문에 영역별 문항을 균등 분배하는 함수
const distributeQuestionsToPassages = (categories: Record<string, number>, passageCount: number = 4): Record<string, number>[] => {
    const passages: Record<string, number>[] = Array.from({ length: passageCount }, () => ({}));

    // 각 영역별로 문항 수를 지문에 분배 (나머지를 회전 오프셋으로 분산)
    let offsetAccumulator = 0;
    Object.entries(categories).forEach(([category, totalCount]) => {
        if (totalCount === 0) return;

        const perPassage = Math.floor(totalCount / passageCount);
        const remainder = totalCount % passageCount;

        for (let i = 0; i < passageCount; i++) {
            // 나머지 문항을 특정 지문에 몰리지 않게 오프셋 회전
            const adjustedIndex = (i + offsetAccumulator) % passageCount;
            const count = perPassage + (i < remainder ? 1 : 0);
            if (count > 0) {
                passages[adjustedIndex][category] = count;
            }
        }
        offsetAccumulator += remainder; // 다음 영역의 나머지는 다른 지문부터 시작
    });

    return passages;
};

const GenerateTab: React.FC<GenerateTabProps> = ({ onRefreshAssets, onRefreshSessions }) => {
    // State
    const [selectedGrade, setSelectedGrade] = useState<GradeGroupType>('초등 중학년');
    const [localIsGenerating, setLocalIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [generatedCount, setGeneratedCount] = useState(0);
    const [localError, setLocalError] = useState<string | null>(null);

    // Hook
    const { generatePassage, generateQuestions, isLoading: isHookLoading, error: hookError } = useContentGenerator();
    const isGenerating = localIsGenerating || isHookLoading;

    // Sync hook error to local error display
    useEffect(() => {
        if (hookError) setLocalError(hookError);
    }, [hookError]);

    // Config State
    const [isLoadingConfig, setIsLoadingConfig] = useState(true);
    const [curriculumConfig, setCurriculumConfig] = useState<GradeCurriculumConfig | null>(null);
    const [selectedTopicsList, setSelectedTopicsList] = useState<string[]>([]);

    // Advanced Settings Panel
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [additionalInstructions, setAdditionalInstructions] = useState('');

    // Difficulty Selection
    const [selectedDifficulty, setSelectedDifficulty] = useState<'하' | '중' | '상'>('중');

    // [Phase 2] Agentic Workflow 상태
    type AgentStep = 'IDLE' | 'PLANNING' | 'WRITING';
    const [agentStep, setAgentStep] = useState<AgentStep>('IDLE');

    const agentStepLabels: Record<AgentStep, string> = {
        'IDLE': '',
        'PLANNING': '🔍 출제 전략 수립 중...',
        'WRITING': '✍️ 고급 문항 작성 중...'
    };



    // [Phase 1] 학년별 문장 길이 가이드
    const sentenceLengthGuide: Record<GradeGroupType, { min: number; max: number; avg: string }> = {
        '초등 저학년': { min: 8, max: 20, avg: '10~15자' },
        '초등 중학년': { min: 12, max: 30, avg: '15~25자' },
        '초등 고학년': { min: 15, max: 40, avg: '20~30자' },
        '중등': { min: 20, max: 50, avg: '25~35자' }
    };

    // [Phase 1] 개선된 난이도별 프롬프트 지침 (함수로 변경)
    const getDifficultyInstructions = (difficulty: '하' | '중' | '상', grade: GradeGroupType): string => {
        const guide = sentenceLengthGuide[grade];
        const instructions: Record<'하' | '중' | '상', string> = {
            '하': `[난이도: 하 (기초)]
📖 지문 기준:
- 문장 길이: 평균 ${guide.avg}, 최대 ${guide.max}자
- 문장 구조: 단문 위주 (80%), 접속사 '그리고', '그래서', '하지만' 정도만 사용
- 어휘: 해당 학년 기본 교과서 수준, 어려운 단어는 괄호로 쉬운 설명 추가

📝 문항 기준:
- 정답: 지문에서 1문장 내에서 직접 찾을 수 있음
- 오답: 지문에 없는 명백히 다른 정보 (매력적 오답 0개)
- 추론: 불필요, 사실 확인 위주`,
            '중': `[난이도: 중 (표준)]
📖 지문 기준:
- 문장 길이: 평균 ${guide.avg}, 최대 ${guide.max + 5}자
- 문장 구조: 단문 60% + 복문 40%, 다양한 접속사 사용
- 어휘: 학년 교과서 수준 + 문맥에서 유추 가능한 어휘 일부 포함

📝 문항 기준:
- 정답: 지문 전체를 읽어야 파악 가능
- 오답: 지문 정보를 사용하되 질문과 약간 어긋난 '매력적 오답' 1개 포함
- 추론: 1단계 추론 문제 포함 가능`,
            '상': `[난이도: 상 (심화)]
📖 지문 기준:
- 문장 길이: 평균 ${guide.avg}, 복문 비율 높음
- 문장 구조: 복문 60% 이상, 인과/조건/양보 등 다양한 관계 표현
- 어휘: 주제 관련 전문 용어 사용 (단, 금지 어휘 제외)

📝 문항 기준:
- 정답: 여러 문장의 정보를 종합해야 파악 가능
- 오답: 부분적으로 맞는 '매력적 오답' 2개 포함
- 추론: 2단계 이상 추론 또는 비판적 사고 필요`
        };
        return instructions[difficulty];
    };

    // Load Config on Grade Change
    useEffect(() => {
        const loadConfig = async () => {
            setIsLoadingConfig(true);
            try {
                const config = await CurriculumService.getConfig(selectedGrade);
                if (config) {
                    setCurriculumConfig(config);
                } else {
                    setCurriculumConfig(INITIAL_DATA[selectedGrade]);
                }
                setSelectedTopicsList([]);
            } catch (err) {
                console.error("Config load failed", err);
                setCurriculumConfig(INITIAL_DATA[selectedGrade]);
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
        setLocalIsGenerating(true);
        try {
            for (const grade of Object.keys(INITIAL_DATA) as GradeGroupType[]) {
                await CurriculumService.saveConfig(INITIAL_DATA[grade]);
            }
            alert('마이그레이션 완료! 페이지를 새로고침하세요.');
            window.location.reload();
        } catch (e) {
            alert('오류 발생: ' + e);
        } finally {
            setLocalIsGenerating(false);
        }
    };

    const generateSeedQuestions = async () => {

        if (!curriculumConfig) {
            setLocalError("설정을 불러오지 못했습니다.");
            return;
        }

        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
            setLocalError("API 키가 설정되지 않았습니다. .env 파일을 확인하고 서버를 재시작해주세요.");
            return;
        }

        // setIsGenerating(true); // Handled by hook
        setProgress(0);
        setGeneratedCount(0);
        setAgentStep('IDLE');
        setLocalError(null);

        const { config, categories, topics } = curriculumConfig;

        // Session Generation Strategy: 1 Session = 4 Passages
        const SESSION_SIZE = 4;
        let targetTopics: string[] = [];

        if (selectedTopicsList.length > 0) {
            targetTopics = selectedTopicsList;
        } else {
            const existingAssets = await AssetService.getAllAssets();
            const usedTopics = new Set(
                existingAssets.filter(a => a.gradeGroup === selectedGrade).map(a => a.subject)
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

        try {
            const totalToGenerate = targetTopics.length;
            const newAssets: Asset[] = [];

            // 4개 지문에 영역별 문항 분배
            const distributedQuestions = distributeQuestionsToPassages(categories, targetTopics.length);

            for (let i = 0; i < targetTopics.length; i++) {
                const subject = targetTopics[i];
                const passageCategories = distributedQuestions[i];

                // 이 지문에 할당된 문항 수 계산
                const passageQuestionCount = Object.values(passageCategories).reduce((a, b) => a + b, 0);
                const questionDistribution = Object.entries(passageCategories)
                    .filter(([_, count]) => count > 0)
                    .map(([cat, count]) => `${cat}: ${count}문항`)
                    .join(', ');

                // Step 1: Generate Passage
                const detailedPassagePrompt = `
[주제]: ${subject}
[글자 수]: 반드시 ${config.charCount} 이상 (절대 짧게 쓰지 마세요!)
[문체]: ${config.style}
[문장 길이]: 평균 ${sentenceLengthGuide[selectedGrade].avg}, 최대 ${sentenceLengthGuide[selectedGrade].max}자

${getDifficultyInstructions(selectedDifficulty, selectedGrade)}
${additionalInstructions ? `[추가 지침]: ${additionalInstructions}` : ''}

⚠️ 중요: 지문은 반드시 ${config.charCount} 이상이어야 합니다. 
짧은 지문(300자 미만)은 거부됩니다. 충분히 상세하고 풍부한 내용을 포함하세요.`;

                // [Phase 2] Step 1: Planning (지문 생성 = 기획 단계)
                setAgentStep('PLANNING');

                const passageResult = await generatePassage(subject, selectedGrade, {
                    length: config.charCount,
                    difficulty: selectedDifficulty,
                    additionalPrompt: detailedPassagePrompt
                });

                if (!passageResult) {
                    console.error('Passage generation failed');
                    continue;
                }

                // Step 2: Generate Questions
                const examinerPrompt = `
[이 지문에서 출제할 문항 구성]: ${questionDistribution} (총 ${passageQuestionCount}문항)
${getDifficultyInstructions(selectedDifficulty, selectedGrade)}

## 📖 역량별 조작적 정의 (문항 분류 기준)
각 역량이 측정하는 것을 정확히 이해하고, 해당 역량에 맞는 문항만 분류하세요:

| 역량 | 측정 대상 | 문항 예시 패턴 |
|------|----------|--------------|
| **어휘력** | 문맥 속에서 단어·관용구의 의미를 파악하는 능력 | "밑줄 친 ㉠의 의미와 가장 가까운 것은?", "다음 중 '~'와 바꿔 쓸 수 있는 말은?" |
| **사실적 이해** | 지문에 **명시적으로** 드러난 정보를 정확히 찾고 확인하는 능력 | "이 글에 따르면 ~한 것은?", "다음 중 글의 내용과 일치하는 것은?" |
| **추론적 이해** | 지문에 **직접 드러나지 않은** 의미를 논리적으로 유추하는 능력 | "이 글에서 알 수 있는 것은?", "빈칸에 들어갈 말로 적절한 것은?", "~의 원인으로 추측할 수 있는 것은?" |
| **구조적 이해** | 글의 전체 **짜임새**(서론·본론·결론, 원인·결과, 비교·대조 등)와 **중심 내용**을 파악하는 능력 | "이 글의 중심 내용은?", "문단 ②의 역할은?", "글의 전개 방식은?" |
| **비판적 이해** | 글쓴이의 **의도·관점·논리적 타당성**을 평가하는 능력 | "글쓴이의 주장에 대한 반론으로 적절한 것은?", "이 주장의 전제는?", "필자의 태도로 적절한 것은?" |

## 📊 문항 난이도 분포
전체 ${passageQuestionCount}문항 중 난이도를 다음 비율로 배분하세요:
- **쉬움 (하)**: 약 30% — 지문을 읽으면 바로 알 수 있는 문항
- **보통 (중)**: 약 40% — 약간의 사고가 필요한 문항  
- **어려움 (상)**: 약 30% — 깊은 사고가 필요한 변별력 있는 문항

## 📋 고급 문항 유형 (다양하게 섞어서 출제)
### 유형 1: 밑줄/표식 문항 (UNDERLINE_INTENT)
- 지문의 특정 단어나 문장에 표식을 할 때 **반드시** 다음 형식을 사용:
  - 단어/어구 밑줄: ㉠[밑줄:솔솔 나서] → ㉠ 마커 + "솔솔 나서"에 밑줄 표시
  - 문장 밑줄: ㉡[문장밑줄:우리 동네에는 많은 사람들이 살고 있어요] → ㉡ 마커 + 문장 전체에 밑줄 표시
- 예시: "빵 냄새가 ㉠[밑줄:솔솔] 나서 너무 좋아요" → 문항에서 "밑줄 친 ㉠'솔솔'의 의미는?"
- ⚠️ 절대 HTML 태그(<u>, </u> 등) 사용 금지!
- ⚠️ ㉠만 단독으로 쓰지 마세요! 반드시 ㉠[밑줄:대상텍스트] 형식으로 작성!
- ⚠️ 표식할 텍스트의 위치를 정확히 지키세요. 표식 대상이 "솔솔"이면 "솔솔" 바로 앞에 ㉠[밑줄:솔솔]을 넣어야 합니다.

### 유형 2: 빈칸 추론 문항 (BLANK_INFERENCE)  
- 지문의 핵심 단어나 접속사를 [빈칸] 또는 (   ㉮   )로 비우고 추론
- "빈칸에 들어갈 말로 적절한 것은?" 형식

### 유형 3: 일반 문항 (NORMAL)
- 기존 방식의 사실적/추론적/비판적 이해 문항
- 표식 없이 지문 전체를 대상으로 출제

## ⚠️ 필수 준수 사항:
1. **문항 수 엄격 준수**: 정확히 ${passageQuestionCount}개 문항만 출제
2. **5지선다형 필수**: 모든 문항은 반드시 선택지 5개(①②③④⑤)를 제시해야 합니다. 4지선다 절대 금지!
3. **HTML 태그 절대 금지**: <u>, </u>, <b>, </b> 등 HTML 태그 사용 금지
4. **표식 형식 필수**: 밑줄/강조 시 반드시 ㉠[밑줄:대상텍스트] 형식 사용. ㉠만 단독 사용 금지!
5. 3가지 유형을 골고루 섞어서 출제
6. 난이도 '${selectedDifficulty}'에 맞춰 문제와 선택지 난이도 조절
7. **지문 길이 보존**: modified_content는 원본 지문과 동일한 내용을 유지. 표식(㉠[밑줄:...])과 [빈칸]만 추가하고 내용 삭제 금지!
8. **category 필드 필수 규칙**: 각 문항의 category 필드에는 반드시 다음 5가지 한국어 이름 중 하나만 정확히 사용하세요:
   '어휘력' | '사실적 이해' | '추론적 이해' | '구조적 이해' | '비판적 이해'
   ⚠️ 영어(Facts, Inference 등)나 다른 표현 절대 금지!

${additionalInstructions ? `[추가 지침]: ${additionalInstructions}` : ''}`;

                // [Phase 2] Step 2: Writing (문항 작성 단계)
                setAgentStep('WRITING');

                const questionResult = await generateQuestions(passageResult.content, passageQuestionCount, selectedGrade, {
                    instructions: examinerPrompt
                });

                if (!questionResult || !questionResult.questions) {
                    console.error('Question generation failed');
                    continue;
                }

                const newAsset: Asset = {
                    assetId: crypto.randomUUID(),
                    gradeGroup: selectedGrade,
                    subject: subject,
                    title: passageResult.title || "제목 없음",
                    content: questionResult.modified_content || passageResult.content,
                    difficulty: selectedDifficulty,
                    questions: (questionResult.questions || []).map((q: any) => ({
                        ...q,
                        // ID is now guaranteed to be integer by schema, but safe check
                        id: typeof q.id === 'number' ? q.id : (Number(q.id) || Math.floor(Math.random() * 10000)),
                        options: (q.options || []).map((opt: string) =>
                            opt.replace(/^[①-⑮0-9.\s]+/, '').trim()
                        ),
                        rationale: q.rationale || null
                    })),
                    createdAt: new Date().toISOString(),
                    status: 'CANDIDATE',
                    feedback: null
                };

                await AssetService.createAsset(newAsset);
                newAssets.push(newAsset);
                setGeneratedCount(prev => prev + 1);
                setProgress(Math.round(((i + 1) / totalToGenerate) * 100));
            }

            // Create LearningSession
            if (newAssets.length > 0) {
                const allSessions = await LearningSessionService.getAllSessions();
                const sessionCount = allSessions.filter(s => s.gradeGroup === selectedGrade).length;
                const newSession: LearningSession = {
                    sessionId: crypto.randomUUID(),
                    gradeGroup: selectedGrade,
                    title: `${selectedGrade} ${sessionCount + 1}차시`,
                    difficulty: selectedDifficulty,
                    assetIds: newAssets.map(a => a.assetId),
                    status: 'DRAFT',
                    createdAt: new Date().toISOString()
                };
                await LearningSessionService.createSession(newSession);
                console.log("LearningSession Created:", newSession.title);
            }

            onRefreshAssets();
            onRefreshSessions();
        } catch (err: any) {
            console.error('Generation Detail Error:', err);
            setLocalError(`생성 중 오류가 발생했습니다: ${err?.message || err}`);
        } finally {
            // setIsGenerating(false); // Handled by hook, but we need to ensure agentStep is reset.
            // Actually hook doesn't reset 'isGenerating' until promise resolves.
            // But we are using hookLoading as isGenerating.
            setAgentStep('IDLE');
        }
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
                            // 학년 변경 시 이전 생성 결과 초기화
                            setGeneratedCount(0);
                            setProgress(0);
                            setLocalError(null);
                            setAgentStep('IDLE');
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
                                                평균 <span className="font-bold">{sentenceLengthGuide[selectedGrade].avg}</span>,
                                                최대 <span className="font-bold">{sentenceLengthGuide[selectedGrade].max}자</span>
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
                onClick={generateSeedQuestions}
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
