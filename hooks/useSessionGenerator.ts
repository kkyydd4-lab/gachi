import { useState } from 'react';
import { AssetService, LearningSessionService } from '../services/api';
import { useContentGenerator } from './useContentGenerator';
import { Asset, LearningSession, GradeCurriculumConfig, GradeGroupType } from '../types/domain';
import { getDifficultyInstructions, SENTENCE_LENGTH_GUIDE } from '../data/curriculum';

export type AgentStep = 'IDLE' | 'PLANNING' | 'WRITING';

export const useSessionGenerator = (
    onRefreshAssets: () => void,
    onRefreshSessions: () => void
) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [generatedCount, setGeneratedCount] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [agentStep, setAgentStep] = useState<AgentStep>('IDLE');

    // Hook
    const { generatePassage, generateQuestions } = useContentGenerator();

    const generateSession = async (
        curriculumConfig: GradeCurriculumConfig,
        selectedGrade: GradeGroupType,
        selectedDifficulty: '하' | '중' | '상',
        selectedTopicsList: string[],
        additionalInstructions: string
    ) => {
        setIsGenerating(true);
        setProgress(0);
        setGeneratedCount(0);
        setAgentStep('IDLE');
        setError(null);

        const { config, categories, topics } = curriculumConfig;
        const SESSION_SIZE = 4;
        let targetTopics: string[] = [];

        // 1. 토픽 선정 로직
        if (selectedTopicsList.length > 0) {
            targetTopics = selectedTopicsList;
        } else {
            try {
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
            } catch (err) {
                console.error("Failed to fetch assets for topic filtering", err);
                const shuffled = [...topics].sort(() => Math.random() - 0.5);
                targetTopics = shuffled.slice(0, SESSION_SIZE);
            }
        }

        try {
            const totalToGenerate = targetTopics.length;
            const newAssets: Asset[] = [];

            // 4개 지문에 영역별 문항 분배 helper
            const distributeQuestions = (cats: Record<string, number>, count: number) => {
                const passages: Record<string, number>[] = Array.from({ length: count }, () => ({}));
                let offsetAccumulator = 0;
                Object.entries(cats).forEach(([category, totalCount]) => {
                    if (totalCount === 0) return;
                    const perPassage = Math.floor(totalCount / count);
                    const remainder = totalCount % count;
                    for (let i = 0; i < count; i++) {
                        const adjustedIndex = (i + offsetAccumulator) % count;
                        passages[adjustedIndex][category] = perPassage + (i < remainder ? 1 : 0);
                    }
                    offsetAccumulator += remainder;
                });
                return passages;
            };

            const distributedQuestions = distributeQuestions(categories, targetTopics.length);

            // 병렬 생성을 위한 단위 함수
            const generateAssetForTopic = async (subject: string, index: number): Promise<Asset | null> => {
                try {
                    const passageCategories = distributedQuestions[index];
                    const passageQuestionCount = Object.values(passageCategories).reduce((a, b) => a + b, 0);
                    const questionDistribution = Object.entries(passageCategories)
                        .filter(([_, count]) => count > 0)
                        .map(([cat, count]) => `${cat}: ${count}문항`)
                        .join(', ');

                    const guide = SENTENCE_LENGTH_GUIDE[selectedGrade];
                    const detailedPassagePrompt = `
[주제]: ${subject}
[글자 수]: 반드시 ${config.charCount} 이상 (절대 짧게 쓰지 마세요!)
[문체]: ${config.style}
[문장 길이]: 평균 ${guide.avg}, 최대 ${guide.max}자

${getDifficultyInstructions(selectedDifficulty, selectedGrade)}
${additionalInstructions ? `[추가 지침]: ${additionalInstructions}` : ''}

⚠️ 중요: 지문은 반드시 ${config.charCount} 이상이어야 합니다. 
짧은 지문(300자 미만)은 거부됩니다. 충분히 상세하고 풍부한 내용을 포함하세요.`;

                    // 지문 생성
                    const passageResult = await generatePassage(subject, selectedGrade, {
                        length: config.charCount,
                        difficulty: selectedDifficulty,
                        additionalPrompt: detailedPassagePrompt
                    });

                    if (!passageResult) {
                        console.error(`Passage generation failed for topic: ${subject}`);
                        return null;
                    }

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

                    // 문항 생성
                    // 병렬 실행 중이므로 상태 업데이트는 개별 진행
                    const questionResult = await generateQuestions(passageResult.content, passageQuestionCount, selectedGrade, {
                        instructions: examinerPrompt
                    });

                    if (!questionResult || !questionResult.questions) {
                        console.error(`Question generation failed for topic: ${subject}`);
                        return null;
                    }

                    // Asset 생성
                    const newAsset: Asset = {
                        assetId: crypto.randomUUID(),
                        gradeGroup: selectedGrade,
                        subject: subject,
                        title: passageResult.title || "제목 없음",
                        content: questionResult.modified_content || passageResult.content,
                        difficulty: selectedDifficulty,
                        questions: (questionResult.questions || []).map((q: any) => ({
                            ...q,
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

                    // 개별 진행상황 업데이트
                    setGeneratedCount(prev => prev + 1);
                    setProgress(prev => Math.min(prev + Math.round(100 / targetTopics.length), 100));

                    return newAsset;

                } catch (error) {
                    console.error(`Error generating asset for topic ${subject}:`, error);
                    return null;
                }
            };

            // Main Generator Logic - Sequential Execution (Gemini rate limit 대응)
            setAgentStep('WRITING');
            const MAX_RETRY = 2;
            const failedTopics: string[] = [];

            for (let i = 0; i < targetTopics.length; i++) {
                let asset: Asset | null = null;
                for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
                    if (attempt > 0) {
                        console.log(`🔄 재시도 ${attempt}/${MAX_RETRY}: ${targetTopics[i]}`);
                        await new Promise(r => setTimeout(r, 2000 * attempt)); // 2초, 4초 대기
                    }
                    asset = await generateAssetForTopic(targetTopics[i], i);
                    if (asset) break;
                }
                if (asset) {
                    newAssets.push(asset);
                } else {
                    console.error(`❌ ${targetTopics[i]} 최종 실패 (${MAX_RETRY}회 재시도 후)`);
                    failedTopics.push(targetTopics[i]);
                }
            }

            // 이전에는 실패한 주제가 콘솔에만 남고 화면에는 아무 안내가 없었음
            if (failedTopics.length > 0) {
                setError(
                    newAssets.length > 0
                        ? `일부 주제 생성에 실패했습니다: ${failedTopics.join(', ')} — 성공한 ${newAssets.length}개 지문만 차시로 저장됩니다.`
                        : `모든 주제(${failedTopics.join(', ')}) 생성에 실패했습니다. 잠시 후 다시 시도해주세요.`
                );
            }

            // 일괄 저장 (DB 부하 고려 시 개별 저장도 괜찮지만, 트랜잭션 관점에서는 일괄이 나음)
            if (newAssets.length > 0) {
                await Promise.all(newAssets.map(asset => AssetService.createAsset(asset)));

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
            setError(`생성 중 오류가 발생했습니다: ${err?.message || err}`);
        } finally {
            setIsGenerating(false);
            setAgentStep('IDLE');
        }
    };

    return {
        isGenerating,
        progress,
        generatedCount,
        error,
        agentStep,
        generateSession
    };
};
