import React, { useState, useEffect, useCallback } from 'react';
import { generateContent } from '../services/gemini';
import { UserAccount, DiagnosticPassage, AdminConfig, GradeGroupType, Asset, TestSession, QuestionLog, AgentStatus, BlueprintDebugInfo, WrongAnswerRecord, LearningSession } from '../types';
import { AssetService, ConfigService, CurriculumService, LearningSessionService } from '../services/api';
import * as Analytics from '../services/analytics';
import { QuickFeedback, FeedbackButtons } from './MicroSurvey';

// Sub-components
import DiagnosticLoading from './diagnostic/DiagnosticLoading';
import DiagnosticTest from './diagnostic/DiagnosticTest';
import DiagnosticResults from './diagnostic/DiagnosticResults';

interface DiagnosticViewProps {
  user: UserAccount | null;
  onComplete: (result: NonNullable<UserAccount['testResult']>) => void;
  onCancel: () => void;
}

// --- Constants & Configs ---
const GRADE_ARCHITECTURES: Record<GradeGroupType, Record<string, number>> = {
  '초등 저학년': { '어휘력': 5, '사실적 이해': 5, '추론적 이해': 3, '구조적 이해': 0, '비판적 이해': 0 },
  '초등 중학년': { '어휘력': 5, '사실적 이해': 5, '추론적 이해': 4, '구조적 이해': 2, '비판적 이해': 2 },
  '초등 고학년': { '어휘력': 4, '사실적 이해': 5, '추론적 이해': 5, '구조적 이해': 3, '비판적 이해': 3 },
  '중등': { '어휘력': 4, '사실적 이해': 4, '추론적 이해': 6, '구조적 이해': 5, '비판적 이해': 6 },
};

const GRADE_SUBJECTS: Record<GradeGroupType, string[]> = {
  '초등 저학년': [
    '나의 몸과 마음', '이름의 의미', '가족 구성원의 역할', '집안일 돕기',
    '등굣길 풍경', '교실 규칙', '친구와 화해하기', '학교 탐험',
    '올바른 양치질', '골고루 먹기', '손 씻기의 중요성', '일찍 자고 일찍 일어나기',
    '횡단보도 건너기', '놀이터 안전 수칙', '낯선 사람 주의하기',
    '주변의 꽃과 나무', '좋아하는 동물 이야기', '날씨의 변화', '계절의 특징',
    '해와 달이 된 오누이', '이솝 우화 이야기', '의인화된 동물 동화',
    '재미있는 끝말잇기', '의성어와 의태어', '수수께끼 놀이'
  ],
  '초등 중학년': [
    '우리 고장의 전설', '공공기관의 역할(우체국, 소방서)', '지도 보는 법',
    '민속놀이(제기차기, 널뛰기)', '전통 한복과 음식', '조상들의 지혜가 담긴 도구',
    '식물의 한살이', '동물의 서식지', '자석의 성질', '소리의 성질',
    '용돈 아껴 쓰기', '저금하는 이유', '필요한 것과 갖고 싶은 것',
    '정직과 책임', '배려와 나눔', '다문화 가정 친구',
    '인물의 성격 파악하기', '이야기의 배경 이해', '시의 비유적 표현',
    '메모하는 습관', '독서 기록장 쓰기', '스마트폰 사용 규칙'
  ],
  '초등 고학년': [
    '고조선부터 조선까지', '일제강점기 독립운동', '문화유산 보호',
    '인권 존중', '성평등의 의미', '저작권 보호', '동물권과 채식',
    '기후 위기와 지구 온난화', '플라스틱 문제', '에너지 절약', '생태계 평형',
    '광고의 유혹과 허위 광고', '4차 산업혁명(로봇, 드론)', '인공지능의 명과 암',
    '가짜 뉴스 구별하기', 'SNS 사용법과 사이버 폭력', '매체별 특성',
    '진정한 우정', '행복의 기준', '실패를 대하는 자세', '자존감 높이기',
    '타당한 근거 제시하기', '토론의 예절', '제안하는 글쓰기',
    '홍길동전의 교훈', '현대 소설의 갈등 구조', '시의 상징성 분석'
  ],
  '중등': [
    '자아정체성', '삶과 죽음의 의미', '동서양 철학자 사상', '언어와 사고의 관계',
    '법의 목적과 정의', '민주주의와 선거', '세계화의 영향', '소수자 차별과 역차별',
    '수요와 공급의 법칙', '인플레이션과 경제 공황', '기업의 사회적 책임', '기회비용',
    '우주의 기원과 빅뱅', '유전공학과 윤리', '열역학 법칙', '생물 다양성',
    '딥페이크와 윤리', '자율주행 자동차', '블록체인과 가상화폐', '나노 기술',
    '회화의 기법(원근법)', '건축에 담긴 철학', '대중문화 비평', '고전 음악의 구조',
    '국어의 역사와 변천', '한글 창제 원리', '매체 언어의 복합성', '표준어와 방언',
    '리얼리즘 문학', '내재적/외재적 감상', '고전 시가(시조, 가사)'
  ]
};

// Gemini AI는 services/gemini.ts를 통해 사용

const DiagnosticView: React.FC<DiagnosticViewProps> = ({ user, onComplete, onCancel }) => {
  const [loading, setLoading] = useState(true);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('PLANNING');
  const [passages, setPassages] = useState<DiagnosticPassage[]>([]);
  const [currentPassageIdx, setCurrentPassageIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [finalResult, setFinalResult] = useState<NonNullable<UserAccount['testResult']> | null>(null);

  // Debug & Inspection State
  const [blueprintInfo, setBlueprintInfo] = useState<BlueprintDebugInfo | null>(null);
  const [showInspector, setShowInspector] = useState(false);

  // Analytics State
  const [session, setSession] = useState<TestSession | null>(null);
  const [questionStartTime, setQuestionStartTime] = useState<number>(Date.now());
  const [testStartTime] = useState<number>(Date.now());
  const [currentQuestionId, setCurrentQuestionId] = useState<number | null>(null);

  // Micro Survey State
  const [showQuickFeedback, setShowQuickFeedback] = useState(false);
  const [feedbackQuestionId, setFeedbackQuestionId] = useState<number | null>(null);

  const FEEDBACK_TRIGGER_QUESTIONS = [3, 5, 8, 12];

  // ========================================
  // Session Initialization & Recovery
  // ========================================
  useEffect(() => {
    if (!user) return;

    const recovered = Analytics.recoverSession();
    if (recovered && recovered.userId === user.id) {
      setSession(recovered);
      const savedAnswers: Record<number, number> = {};
      recovered.questionLogs.forEach(log => {
        if (log.userChoice !== null) {
          savedAnswers[log.questionId] = log.userChoice;
        }
      });
      if (Object.keys(savedAnswers).length > 0) {
        setAnswers(savedAnswers);
      }
    } else {
      const newSession = Analytics.startSession(user.id, user.grade, user.school);
      setSession(newSession);
    }
  }, [user]);

  // ========================================
  // Drop-off Logging
  // ========================================
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (session && !isAnalyzing && !showResult && passages.length > 0) {
        const currentQ = passages[currentPassageIdx]?.questions[0];
        Analytics.logDropOff(
          session,
          currentQ?.id || 0,
          currentPassageIdx,
          'CLOSE'
        );
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [session, currentPassageIdx, passages, isAnalyzing, showResult]);

  const handleCancelClick = useCallback(() => {
    if (session && passages.length > 0 && !showResult) {
      const currentQ = passages[currentPassageIdx]?.questions[0];
      Analytics.logDropOff(
        session,
        currentQ?.id || 0,
        currentPassageIdx,
        'CANCEL'
      );
    }
    Analytics.clearSession();
    onCancel();
  }, [session, currentPassageIdx, passages, onCancel, showResult]);

  // ========================================
  // Answer Handler
  // ========================================
  const handleAnswerSelect = useCallback((questionId: number, choice: number, category: string, correctAnswer: number) => {
    const timeSpent = Date.now() - questionStartTime;

    setAnswers(prev => ({ ...prev, [questionId]: choice }));

    if (session) {
      const updatedSession = Analytics.logQuestionAnswer(
        session,
        questionId,
        category,
        choice,
        correctAnswer,
        timeSpent
      );
      setSession(updatedSession);
    }

    setQuestionStartTime(Date.now());
    setCurrentQuestionId(questionId);

    const answeredCount = Object.keys(answers).length + 1;
    if (FEEDBACK_TRIGGER_QUESTIONS.includes(answeredCount)) {
      setFeedbackQuestionId(questionId);
      setShowQuickFeedback(true);
    }
  }, [session, questionStartTime, answers]);

  const handleQuickFeedback = useCallback((difficulty: 1 | 2 | 3 | 4 | 5) => {
    if (session && feedbackQuestionId !== null) {
      const log = session.questionLogs.find(l => l.questionId === feedbackQuestionId);
      if (log) {
        log.difficultyFeedback = difficulty;
        Analytics.updateSessionProgress(session);
      }
    }
    setShowQuickFeedback(false);
    setFeedbackQuestionId(null);
  }, [session, feedbackQuestionId]);

  const determineGradeGroup = (gradeStr: string): GradeGroupType => {
    if (gradeStr.includes('초등 1') || gradeStr.includes('초등 2')) return '초등 저학년';
    if (gradeStr.includes('초등 3') || gradeStr.includes('초등 4')) return '초등 중학년';
    if (gradeStr.includes('초등 5') || gradeStr.includes('초등 6')) return '초등 고학년';
    return '중등';
  };

  // Adaptive Testing State
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const handleNextPassage = () => {
    if (currentPassageIdx < passages.length - 1) {
      setCurrentPassageIdx(curr => curr + 1);
    } else {
      calculateResults();
    }
  };

  // ========================================
  // Agent Logic (Generation) - Modified for Pool
  // ========================================
  useEffect(() => {
    const runAgentSystem = async () => {
      if (!user) return;
      setLoading(true);
      setAgentStatus('PLANNING');

      try {
        const userGradeGroup = determineGradeGroup(user.grade);

        // 1. Fetch Approved Sessions
        const approvedSessions = await LearningSessionService.getApprovedSessions(userGradeGroup);

        // 2. Fetch Past User Sessions to find used learningSessionIds
        const pastSessions = await import('../services/api').then(m => m.SessionService.getSessionsByUser(user.id));
        const usedSessionIds = new Set(pastSessions.map(s => s.learningSessionId).filter(Boolean));

        // 3. Find first unused session
        const currentSession = approvedSessions.find(s => !usedSessionIds.has(s.sessionId)) || approvedSessions[0];

        if (!currentSession) {
          alert("준비된 학습 차시가 없습니다. 관리자에게 문의하세요.");
          onCancel();
          return;
        }

        console.log(`[Session Delivery] Selected: ${currentSession.title}`);
        setCurrentSessionId(currentSession.sessionId);

        // 4. Load all assets for this session
        const allAssets = await AssetService.getApprovedAssets(userGradeGroup);
        const sessionAssets = currentSession.assetIds
          .map(id => allAssets.find(a => a.assetId === id))
          .filter(Boolean) as Asset[];

        if (sessionAssets.length === 0) {
          alert("차시 정보를 불러오는 데 실패했습니다.");
          onCancel();
          return;
        }

        // 5. Transform Assets to DiagnosticPassages and set initial state
        let globalQId = 1;
        const loadedPassages: DiagnosticPassage[] = sessionAssets.map(asset => {
          const p: DiagnosticPassage = {
            subject: asset.subject,
            title: asset.title,
            content: asset.content,
            difficulty: asset.difficulty,
            questions: asset.questions.map(q => ({ ...q, id: globalQId++ }))
          };
          (p as any).assetId = asset.assetId; // This casting is for adding assetId to DiagnosticPassage type
          return p;
        });

        setPassages(loadedPassages);
        setLoading(false);

      } catch (error) {
        console.error("Session loading error", error);
        onCancel();
      } finally {
        setLoading(false);
      }
    };

    runAgentSystem();
  }, [user, onCancel]);

  const generatePrescription = async (weakestCompetency: string, grade: string): Promise<any> => {
    try {
      const competencyGuide: Record<string, string> = {
        '어휘력': '문맥 속 어휘 추론, 유의어/반의어 구별, 관용 표현 이해에 어려움을 보이는',
        '사실적 이해': '지문에 명시된 정보를 정확하게 찾고 파악하는 데 어려움을 보이는',
        '추론적 이해': '글에 직접 드러나지 않은 의미를 유추하고 원인·결과를 파악하는 데 어려움을 보이는',
        '구조적 이해': '글의 전체 구조, 문단 간 관계, 주제 파악에 어려움을 보이는',
        '비판적 이해': '글쓴이의 의도나 관점을 평가하고 논증의 타당성을 판단하는 데 어려움을 보이는',
      };

      const prompt = `당신은 20년 경력의 한국어 문해력 교육 전문가이자 독서 지도사입니다.

다음 조건에 맞는 맞춤형 처방전을 JSON 형식으로 작성하세요.

[학생 정보]
- 학년: ${grade}
- 약점 역량: ${weakestCompetency}
- 상세: ${competencyGuide[weakestCompetency] || weakestCompetency + '에 어려움을 보이는'} 학생

[처방전 작성 규칙]
1. **추천 도서 2권**: 
   - 반드시 한국에서 실제 출판된 도서만 추천하세요 (ISBN이 존재하는 도서)
   - 학년 수준에 맞는 도서 (너무 쉽거나 어렵지 않게)
   - 각 도서가 해당 역량 향상에 도움이 되는 이유를 구체적으로 설명
   - 유명 출판사(창비, 문학동네, 비룡소, 사계절, 웅진 등)의 도서 우선
2. **성장 미션 1개**:
   - ${weakestCompetency} 역량을 직접적으로 훈련하는 구체적 활동
   - 학부모가 가정에서 지도할 수 있는 실천 가능한 미션
   - 기간: 1~2주 단위

[출력 JSON 형식]
{
  "targetCompetency": "${weakestCompetency}",
  "recommendedBooks": [
    { "title": "도서명", "author": "저자명", "reason": "이 도서가 ${weakestCompetency} 향상에 도움이 되는 구체적 이유" }
  ],
  "mission": {
    "title": "미션 제목",
    "description": "구체적인 활동 설명 (기간, 방법, 기대효과 포함)"
  }
}`;
      const result = await generateContent(prompt, {
        responseMimeType: "application/json"
      });
      return result;
    } catch (e) { return null; }
  };

  const calculateResults = async () => {
    if (passages.length === 0 || !user) return;
    setIsAnalyzing(true);

    const allQuestions = passages.flatMap(p => p.questions);
    const totalQuestionsAll = allQuestions.length;
    const totalCorrectAll = allQuestions.filter(q => answers[q.id] === q.answer).length;

    const categories = ['어휘력', '사실적 이해', '추론적 이해', '비판적 이해', '구조적 이해'];
    // 역량별 참조 평균 (실제 응시자 데이터 축적 전까지 교육학 연구 기반 차등값 사용)
    const referenceAverages: Record<string, number> = {
      '어휘력': 72,       // 가장 친숙한 영역, 평균 높음
      '사실적 이해': 70,   // 직접적 정보 확인, 비교적 쉬움
      '추론적 이해': 58,   // 고차 사고력 필요, 평균 낮음
      '구조적 이해': 55,   // 글의 구조 파악, 훈련 필요
      '비판적 이해': 52,   // 가장 어려운 역량, 평균 최저
    };
    const competencyResults = categories.map(cat => {
      const catQuestions = allQuestions.filter(q => q.category.includes(cat));
      const totalCount = catQuestions.length;
      const correctCount = catQuestions.filter(q => answers[q.id] === q.answer).length;
      const score = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;
      return { label: cat, score: Math.round(score), average: referenceAverages[cat] || 60, correct: correctCount, total: totalCount };
    });

    const totalScore = Math.round(competencyResults.reduce((acc, c) => acc + c.score, 0) / competencyResults.length);

    const weakest = [...competencyResults].sort((a, b) => a.score - b.score)[0];
    let prescription = undefined;
    if (weakest.score < 80) {
      prescription = await generatePrescription(weakest.label, user.grade);
    }

    const wrongAnswers: WrongAnswerRecord[] = allQuestions
      .filter(q => answers[q.id] !== q.answer)
      .map(q => {
        const passage = passages.find(p => p.questions.some(pq => pq.id === q.id));
        return {
          questionId: q.id,
          passageTitle: passage?.title || '',
          category: q.category,
          question: q.question,
          options: q.options,
          userAnswer: answers[q.id] || 0,
          correctAnswer: q.answer,
          rationale: q.rationale || ''
        };
      });

    // 5단계 레벨 체계 (교육학적 세분화)
    const getLevelInfo = (score: number): { level: string; percentile: number } => {
      if (score >= 90) return { level: '가치 Grand Master', percentile: 3 };
      if (score >= 80) return { level: '가치 Master', percentile: 10 };
      if (score >= 70) return { level: '가치 Expert', percentile: 25 };
      if (score >= 55) return { level: '가치 Challenger', percentile: 45 };
      return { level: '가치 Explorer', percentile: 65 };
    };
    const { level, percentile } = getLevelInfo(totalScore);

    const resultObj: NonNullable<UserAccount['testResult']> = {
      totalScore,
      competencies: competencyResults,
      level,
      percentile,
      generatedAt: new Date().toISOString(),
      wrongAnswers,
      prescription
    };

    if (session) {
      const categoryScores: Record<string, { correct: number; total: number; rate: number }> = {};
      competencyResults.forEach(comp => {
        categoryScores[comp.label] = { correct: comp.correct, total: comp.total, rate: comp.score };
      });

      const usedAssetIds = passages.map(p => (p as any).assetId).filter(Boolean);

      const updatedSession: TestSession = {
        ...session,
        learningSessionId: currentSessionId || undefined,
        assetIds: usedAssetIds, // [Duplicate Prevention] Save used assets
        summary: {
          ...session.summary,
          totalScore,
          totalQuestions: totalQuestionsAll,
          correctCount: totalCorrectAll,
          durationSec: Math.round((Date.now() - testStartTime) / 1000),
          completedAt: new Date().toISOString(),
          categoryScores
        }
      };

      Analytics.saveSessionToFirebase(updatedSession).then(success => {
        if (success) Analytics.clearSession();
      });
    }

    setFinalResult(resultObj);
    setIsAnalyzing(false);
    setShowResult(true);
    user.testResult = resultObj;
  };

  const handleHomeClick = () => {
    if (finalResult) onComplete(finalResult);
    else onCancel();
  };

  // --- RENDER ---
  if (loading) {
    return (
      <DiagnosticLoading
        status={agentStatus}
        debugInfo={blueprintInfo}
        showInspector={showInspector}
        onShowInspector={setShowInspector}
      />
    );
  }

  if (showResult && finalResult && user) {
    return (
      <DiagnosticResults
        result={finalResult}
        user={user}
        onHome={handleHomeClick}
      />
    );
  }

  return (
    <>
      <DiagnosticTest
        passages={passages}
        currentPassageIdx={currentPassageIdx}
        answers={answers}
        onAnswer={handleAnswerSelect}
        onNextPassage={handleNextPassage}
        onPrevPassage={() => setCurrentPassageIdx(p => Math.max(0, p - 1))}
        onSubmit={calculateResults}
      />

      {showQuickFeedback && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center animate-fade-in px-6">
          <div className="bg-white rounded-[2rem] p-6 w-full max-w-sm">
            <FeedbackButtons
              onSelect={(difficulty) => {
                handleQuickFeedback(difficulty);
              }}
            />
          </div>
        </div>
      )}

      {isAnalyzing && (
        <div className="fixed inset-0 z-[70] bg-white/90 backdrop-blur flex flex-col items-center justify-center animate-fade-in">
          <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-4" />
          <h3 className="text-xl font-black text-navy">결과를 분석하고 있습니다...</h3>
          <p className="text-gray-500">AI가 {user?.name}님의 문해력을 다각도로 진단 중입니다.</p>
        </div>
      )}
    </>
  );
};

export default DiagnosticView;
