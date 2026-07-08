import React, { useState, useCallback, useRef } from 'react';
import { ViewState, UserAccount, WrongAnswerRecord, PostTestSurvey } from '../types';
import { SessionService, ConsultationService, AuthService } from '../services/api';
import { PostTestSurveyForm } from './MicroSurvey';
import { getGradeSegment } from '../data/gradeSegments';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

interface ReportViewProps {
  user: UserAccount | null;
  currentView: ViewState;
  setView: (view: ViewState) => void;
  onLogout: () => void;
  onStartTest: () => void;
  isTeacherView?: boolean; // 선생님 상담 모드에서 렌더링될 때 true (코멘트 작성 가능)
}

const LOGO_URL = "https://lh3.googleusercontent.com/u/0/d/16S6A8l-NgtMiOb8mjf1-hLv0AgxnX-dc=w1000-h1000";

const ReportView: React.FC<ReportViewProps> = ({ user, onLogout, onStartTest, isTeacherView = false }) => {
  const hasResult = !!user?.testResult;
  const bookSectionRef = useRef<HTMLDivElement>(null);

  // 월간 리포트: 선생님 코멘트 (상담 모드에서 작성 → 학부모 화면에 노출)
  const [teacherNote, setTeacherNote] = useState(user?.testResult?.teacherNote || '');
  const [noteStatus, setNoteStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const handleSaveNote = async () => {
    if (!user?.uid) return;
    setNoteStatus('saving');
    const ok = await AuthService.updateTestResultNote(user.uid, teacherNote);
    setNoteStatus(ok ? 'saved' : 'idle');
  };

  // 상담 신청 (학부모/학생용)
  const [consultState, setConsultState] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle');

  const handleRequestConsultation = async () => {
    if (!user || consultState === 'submitting' || consultState === 'submitted') return;
    setConsultState('submitting');
    const ok = await ConsultationService.requestConsultation(user);
    setConsultState(ok ? 'submitted' : 'error');
  };

  // MVP v2: 설문 상태 관리
  const [showSurvey, setShowSurvey] = useState(true);
  const [surveySubmitted, setSurveySubmitted] = useState(false);

  // 오답 복습 모드
  const [retryMode, setRetryMode] = useState(false);
  const [retryAnswers, setRetryAnswers] = useState<Record<number, number>>({});
  const [retryRevealed, setRetryRevealed] = useState<Set<number>>(new Set());

  const wrongAnswers = user?.testResult?.wrongAnswers || [];
  const retryCorrectCount = wrongAnswers.filter(w => retryAnswers[w.questionId] === w.correctAnswer).length;
  const retryComplete = Object.keys(retryAnswers).length === wrongAnswers.length;

  const handleRetryAnswer = useCallback((questionId: number, choice: number) => {
    if (retryRevealed.has(questionId)) return; // 이미 확인한 문항은 변경 불가
    setRetryAnswers(prev => ({ ...prev, [questionId]: choice }));
  }, [retryRevealed]);

  const handleReveal = useCallback((questionId: number) => {
    setRetryRevealed(prev => new Set(prev).add(questionId));
  }, []);

  const resetRetry = useCallback(() => {
    setRetryAnswers({});
    setRetryRevealed(new Set());
  }, []);

  // 설문 제출 핸들러
  const handleSurveySubmit = async (survey: PostTestSurvey) => {
    // sessionStorage에서 sessionId 가져오기
    const savedSession = sessionStorage.getItem('last_session_id');
    if (savedSession) {
      await SessionService.addSurvey(savedSession, survey);
    }
    setSurveySubmitted(true);
    setShowSurvey(false);
  };

  const displayCompetencies = user?.testResult?.competencies || [
    { label: '어휘력', score: 0, average: 60, correct: 0, total: 0 },
    { label: '사실적 이해', score: 0, average: 75, correct: 0, total: 0 },
    { label: '추론적 이해', score: 0, average: 70, correct: 0, total: 0 },
    { label: '비판적 이해', score: 0, average: 68, correct: 0, total: 0 },
    { label: '구조적 이해', score: 0, average: 62, correct: 0, total: 0 },
  ];

  // 평가된 역량만 필터링
  const evaluatedCompetencies = displayCompetencies.filter(c => c.total > 0);
  const unevaluatedCompetencies = displayCompetencies.filter(c => c.total === 0);

  // 전문가 종합의견 생성 (역량 조합 패턴 기반 개인화 피드백)
  const generateExpertOpinion = () => {
    if (!hasResult || evaluatedCompetencies.length === 0) return null;

    const totalScore = user?.testResult?.totalScore || 0;
    const strengths = evaluatedCompetencies.filter(c => c.score >= 80).map(c => c.label);
    const careZones = evaluatedCompetencies.filter(c => c.score < 60).map(c => c.label);
    const midZones = evaluatedCompetencies.filter(c => c.score >= 60 && c.score < 80).map(c => c.label);
    const level = user?.testResult?.level || 'Level 1';

    // 1. 역량 조합 패턴 분석 (문해력 전문가 관점)
    const getScoreOf = (label: string) => evaluatedCompetencies.find(c => c.label === label)?.score || 0;
    const vocabScore = getScoreOf('어휘력');
    const factScore = getScoreOf('사실적 이해');
    const inferScore = getScoreOf('추론적 이해');
    const structScore = getScoreOf('구조적 이해');
    const critScore = getScoreOf('비판적 이해');

    // 패턴 진단
    type PatternInfo = { name: string; emoji: string; detail: string; coaching: string };
    let pattern: PatternInfo;

    if (vocabScore >= 80 && factScore >= 80 && inferScore < 60) {
      pattern = {
        name: '기초탄탄·추론약점형',
        emoji: '🔍',
        detail: '어휘력과 사실적 이해의 기초가 탄탄하여 글을 읽는 기본기는 충분합니다. 하지만 행간의 의미를 읽어내는 추론 능력이 아직 발달 중입니다.',
        coaching: '"왜 그럴까?", "다음에 어떤 일이 일어날까?" 같은 질문을 던지며 책을 읽는 습관을 들이면, 기존의 탄탄한 기초 위에 추론력이 빠르게 쌓일 수 있습니다.'
      };
    } else if (vocabScore < 60) {
      pattern = {
        name: '어휘 흔들림형',
        emoji: '📚',
        detail: '어휘력은 모든 문해력의 뿌리입니다. 현재 어휘 기반이 흔들리면서 다른 영역의 점수에도 영향을 주고 있을 가능성이 높습니다.',
        coaching: '매일 10분씩 새 단어 3개를 문맥 속에서 만나고, 직접 문장을 만들어 보는 활동을 4주간 꾸준히 하면 어휘력뿐 아니라 전반적인 독해력이 함께 향상됩니다.'
      };
    } else if (critScore < 60 && structScore < 60) {
      pattern = {
        name: '비판·구조 도전형',
        emoji: '🏗️',
        detail: '글을 읽고 정보를 찾는 능력은 양호하지만, 글의 전체 구조를 파악하고 필자의 주장을 평가하는 고차원적 사고가 아직 발달 중입니다.',
        coaching: '논설문이나 신문 사설을 읽으며 "이 글의 주장은 무엇인가?", "근거는 타당한가?"를 함께 토론하는 활동이 효과적입니다. 글의 뼈대(서론·본론·결론)를 색연필로 표시하는 것도 좋은 훈련법입니다.'
      };
    } else if (totalScore >= 85 && strengths.length >= 4) {
      pattern = {
        name: '올라운더 마스터형',
        emoji: '🏆',
        detail: '5대 역량이 고르게 높은 수준으로, 문해력의 균형 잡힌 발달이 인상적입니다. 학년 대비 매우 우수한 성취도를 보이고 있습니다.',
        coaching: '현재 수준을 유지하면서 더 긴 비문학 텍스트(과학 논문 요약, 경제 기사 등)에 도전하고, 자신의 의견을 200자 이내로 정리하는 비평문 쓰기에 도전해 보세요.'
      };
    } else if (totalScore >= 70 && careZones.length === 0) {
      pattern = {
        name: '안정 성장형',
        emoji: '📈',
        detail: '전 영역에서 기준 이상의 성취를 보이며 안정적으로 성장하고 있습니다. 특별히 취약한 영역 없이 균형 잡힌 발달이 돋보입니다.',
        coaching: `${midZones.length > 0 ? midZones[0] + ' 영역을 80점 이상으로 끌어올리는 데 집중하면' : '현재 강점을 유지하면서 새로운 장르에 도전하면'} 다음 단계 레벨업이 빠르게 이루어질 수 있습니다.`
      };
    } else if (inferScore >= 80 && factScore < 60) {
      pattern = {
        name: '직관형 독자',
        emoji: '💡',
        detail: '글의 숨겨진 의미를 잘 포착하는 뛰어난 직관력을 가지고 있습니다. 다만 지문에 명시된 사실을 꼼꼼히 확인하는 습관이 보완되면 더욱 정확한 독해가 가능합니다.',
        coaching: '글을 읽은 후 "이 글에서 확실히 알 수 있는 사실 3가지"를 적어보는 훈련을 하면, 추론력은 유지하면서 사실적 이해력이 크게 향상됩니다.'
      };
    } else {
      pattern = {
        name: '성장 잠재형',
        emoji: '🌱',
        detail: `${user?.name} 학생은 문해력 성장의 가장 중요한 시기에 있습니다. ${strengths.length > 0 ? strengths.join(', ') + '에서 긍정적인 잠재력이 보입니다.' : '체계적인 훈련을 통해 빠르게 성장할 수 있는 잠재력을 가지고 있습니다.'}`,
        coaching: '전문 선생님과 함께 매주 1편의 글을 깊이 있게 분석하는 정독 훈련을 시작하면, 3개월 내에 눈에 띄는 변화를 경험할 수 있습니다.'
      };
    }

    // 2. 종합 의견 조합
    let overallAssessment = `${pattern.emoji} **[${pattern.name}]** — ${pattern.detail}`;
    let recommendation = pattern.coaching;

    // Care Zone이 있으면 추가 강조
    if (careZones.length > 0 && totalScore < 80) {
      overallAssessment += ` 특히 **[${careZones.join(', ')}]** 영역은 전문가와 함께하는 **집중 케어 구간(Care Zone)**으로, 이 시기에 집중 훈련하면 전체 성취도가 급격히 상승합니다.`;
    }

    // 3. 잠재 점수 계산 (Care Zone 개선 가중 반영)
    const careZonePotential = careZones.length > 0
      ? careZones.reduce((acc, cz) => {
        const czScore = getScoreOf(cz);
        return acc + (70 - czScore) * 0.5; // Care Zone이 70점까지 오르면 얼마나 오르는지
      }, 0) / evaluatedCompetencies.length
      : (100 - totalScore) * 0.2;
    const potentialScore = Math.min(98, Math.round(totalScore + careZonePotential + (100 - totalScore) * 0.15));

    return {
      overallAssessment,
      recommendation,
      level,
      totalScore,
      strengths,
      careZones,
      potentialScore,
      isLevelUpPhase: totalScore < 70,
      patternName: pattern.name
    };
  };

  const expertOpinion = generateExpertOpinion();
  const gradeSegment = getGradeSegment(user?.grade || '');

  // 월간 리포트 항목 6: "글쓰기에서 좋아진 점" — 직전 회차 대비 향상된 역량 (이력이 있을 때만)
  const improvedAreas = (() => {
    if (!user?.testHistory || user.testHistory.length < 2) return null;
    const prev = user.testHistory[user.testHistory.length - 2];
    const curr = user.testHistory[user.testHistory.length - 1];
    return curr.competencies
      .filter(c => {
        const prevScore = prev.competencies.find(p => p.label === c.label)?.score;
        return prevScore !== undefined && c.score > prevScore;
      })
      .map(c => c.label);
  })();

  return (
    <div className="flex min-h-screen w-full bg-background-light font-display">
      {/* Sidebar (Tablet/Desktop) */}
      <aside className="hidden md:flex flex-col w-72 bg-white border-r border-gray-100 p-8 sticky top-0 h-screen">
        <div className="flex items-center gap-3 mb-16">
          <img
            src={LOGO_URL}
            alt="logo"
            className="h-10 w-10 object-contain"
          />
          <h1 className="text-navy font-black text-2xl tracking-tighter uppercase">Gachi In</h1>
        </div>

        <nav className="flex-1 space-y-3">
          {[
            { icon: 'dashboard', label: '성장 대시보드', active: true, onClick: undefined, comingSoon: false },
            { icon: 'quiz', label: '문해력 평가', active: false, onClick: onStartTest, comingSoon: false },
            {
              icon: 'auto_stories', label: 'AI 맞춤 도서', active: false, comingSoon: false,
              onClick: hasResult ? () => bookSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : undefined
            },
            { icon: 'edit_square', label: '수행평가 가이드', active: false, onClick: undefined, comingSoon: true },
            { icon: 'settings', label: '계정 설정', active: false, onClick: undefined, comingSoon: true },
          ].map(item => (
            <div
              key={item.label}
              onClick={item.comingSoon ? undefined : item.onClick}
              className={`flex items-center gap-4 p-4 rounded-2xl transition-all ${item.comingSoon
                ? 'text-gray-300 cursor-not-allowed'
                : `cursor-pointer ${item.active ? 'bg-primary/10 text-primary font-black shadow-sm' : 'text-gray-400 hover:bg-gray-50'}`
                }`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <span className="text-base">{item.label}</span>
              {item.comingSoon && (
                <span className="ml-auto text-[10px] font-black bg-gray-100 text-gray-400 px-2 py-1 rounded-full">준비중</span>
              )}
            </div>
          ))}
        </nav>

        <button
          onClick={onLogout}
          className="mt-auto flex items-center gap-4 p-4 text-red-400 font-bold hover:bg-red-50 rounded-2xl transition-all"
        >
          <span className="material-symbols-outlined">logout</span>
          로그아웃
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-12 lg:p-20 max-w-7xl mx-auto w-full overflow-y-auto custom-scrollbar">
        {/* Profile Section */}
        <section className="bg-white rounded-[3rem] p-10 mb-10 border border-gray-100 shadow-sm flex flex-col md:flex-row items-center gap-8">
          <div
            className="rounded-full h-28 w-28 md:h-36 md:w-36 border-8 border-primary/5 shadow-inner bg-cover bg-center shrink-0"
            style={{ backgroundImage: `url(https://picsum.photos/seed/${user?.id || 'user'}/200/200)` }}
          />
          <div className="text-center md:text-left flex-1">
            <h2 className="text-3xl md:text-4xl font-black text-navy mb-3 tracking-tight">안녕하세요, {user?.name || '가치인'} 학생!</h2>
            <p className="text-gray-400 text-lg font-bold">{user?.school} · {user?.grade}</p>
          </div>
          <div className="flex gap-4">
            <div className="bg-navy/5 px-6 py-4 rounded-3xl text-center min-w-[140px]">
              <p className="text-navy/40 text-[10px] font-black tracking-widest uppercase mb-1">Diagnosis</p>
              <p className="text-navy font-black text-xl">{hasResult ? '분석완료' : '진단대기'}</p>
            </div>
            <div className="bg-primary/5 px-6 py-4 rounded-3xl text-center min-w-[140px]">
              <p className="text-primary/60 text-[10px] font-black tracking-widest uppercase mb-1">Core Level</p>
              <p className="text-navy font-black text-xl">{hasResult ? user.testResult?.level : '-'}</p>
            </div>
          </div>
        </section>

        {!hasResult ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            {/* Promo Card 1: Bloom's Taxonomy */}
            <div className="bg-navy rounded-[3.5rem] p-12 md:p-16 text-white relative overflow-hidden shadow-2xl shadow-navy/30 flex flex-col justify-center min-h-[450px]">
              <div className="absolute top-0 right-0 w-80 h-80 bg-primary/20 rounded-full blur-[100px] -mr-40 -mt-40"></div>
              <p className="text-primary text-sm font-black tracking-[0.3em] uppercase mb-6">Bloom's Taxonomy Based</p>
              <h3 className="text-4xl font-black leading-tight mb-8 break-keep">
                지식에서 평가까지,<br />6단계 정밀 사고력 진단
              </h3>
              <p className="text-white/60 text-lg font-medium leading-relaxed mb-12 break-keep">
                단순히 점수를 매기는 시험이 아닙니다. 아이가 지닌 사고의 깊이를 측정하고, 성취(Gain)를 향한 로드맵을 설계합니다.
              </p>
              <button
                onClick={onStartTest}
                className="w-full md:w-max bg-primary text-white font-black px-12 py-6 rounded-[2rem] shadow-xl shadow-primary/30 hover:brightness-105 active:scale-95 transition-all text-2xl flex items-center justify-center gap-3"
              >
                AI 정밀 진단 시작
                <span className="material-symbols-outlined text-3xl">rocket_launch</span>
              </button>
            </div>

            {/* Promo Card 2: 3-in-1 System */}
            <div className="grid grid-cols-1 gap-6">
              {[
                { icon: 'history_edu', color: 'text-primary', bg: 'bg-primary/5', title: '수행평가 내신 직결', desc: '글쓰기와 토론 과정을 수행평가 기준에 맞춰 설계하여 별도 대비 없이도 만점으로 연결합니다.' },
                { icon: 'hub', color: 'text-secondary', bg: 'bg-secondary/5', title: '올인원 통합 교육', desc: '독서·논술·토론을 한 번에 해결하여 다른 과목까지 확장되는 학습 효과를 누리세요.' },
                { icon: 'verified_user', color: 'text-navy', bg: 'bg-navy/5', title: '가치를 창출하는 사람', desc: '지식 습득을 넘어 좋은 성품과 리더십을 갖춘 가치 있는 인재로 성장시킵니다.' },
              ].map(card => (
                <div key={card.title} className="bg-white p-10 rounded-[2.5rem] border border-gray-50 shadow-sm flex items-start gap-6 group hover:shadow-md transition-shadow">
                  <div className={`w-16 h-16 ${card.bg} rounded-[1.5rem] flex items-center justify-center ${card.color} shrink-0`}>
                    <span className="material-symbols-outlined text-3xl">{card.icon}</span>
                  </div>
                  <div>
                    <h4 className="text-navy font-black text-xl mb-2">{card.title}</h4>
                    <p className="text-gray-400 font-medium leading-relaxed break-keep">{card.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Recharts Graphs */}

            {/* 1. Radar Chart: 5대 역량 분석 */}
            <div className="bg-white rounded-[3.5rem] p-12 md:p-16 border border-gray-100 shadow-sm flex flex-col items-center">
              <h3 className="text-2xl font-black text-navy mb-8 flex items-center gap-4 w-full">
                <span className="material-symbols-outlined text-primary text-4xl">pentagon</span>
                역량 밸런스 분석
              </h3>
              <div className="w-full h-[300px] md:h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart cx="50%" cy="50%" outerRadius="80%" data={evaluatedCompetencies}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="label" tick={{ fill: '#1e293b', fontSize: 14, fontWeight: 'bold' }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} />
                    <Radar
                      name="나의 점수"
                      dataKey="score"
                      stroke="#6366f1"
                      strokeWidth={3}
                      fill="#6366f1"
                      fillOpacity={0.4}
                    />
                    <Radar
                      name="평균 점수"
                      dataKey="average"
                      stroke="#94a3b8"
                      strokeWidth={2}
                      fill="#94a3b8"
                      fillOpacity={0.1}
                      strokeDasharray="4 4"
                    />
                    <Legend />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              <p className="text-gray-400 text-center font-medium mt-4">
                * 파란색 영역이 넓을수록 역량이 고르게 발달한 상태입니다.
              </p>
            </div>

            {/* 2. Growth History Chart (if applicable) */}
            {user?.testHistory && user.testHistory.length >= 2 && (
              <div className="bg-white rounded-[3.5rem] p-12 md:p-16 border border-gray-100 shadow-sm">
                <h3 className="text-2xl font-black text-navy mb-8 flex items-center gap-4">
                  <span className="material-symbols-outlined text-secondary text-4xl">trending_up</span>
                  성장 추이 그래프
                  <span className="text-sm font-bold text-gray-400 ml-auto">{user.testHistory.length}회 평가</span>
                </h3>

                <div className="w-full h-[300px] md:h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={user.testHistory.map((t, i) => ({
                      name: `${i + 1}회차`,
                      score: t.totalScore,
                      date: new Date(t.generatedAt).toLocaleDateString()
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} />
                      <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                        labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                      />
                      <Line type="monotone" dataKey="score" stroke="#6366f1" strokeWidth={4} activeDot={{ r: 8 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}


            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
              {/* Competency Report (Existing logic reinforced with B.I style) */}
              <div className="lg:col-span-2 bg-white rounded-[3.5rem] p-12 md:p-16 border border-gray-100 shadow-sm">
                <h3 className="text-2xl font-black text-navy mb-12 flex items-center gap-4">
                  <span className="material-symbols-outlined text-primary text-4xl">insights</span>
                  역량별 정밀 분석 리포트
                  {user?.testHistory && user.testHistory.length > 1 && (
                    <span className="text-sm font-bold text-gray-400 ml-auto">
                      {user.testHistory.length}회차 결과
                    </span>
                  )}
                </h3>
                <div className="space-y-12">
                  {/* 평가된 역량 */}
                  {evaluatedCompetencies.map((item) => (
                    <div key={item.label} className="space-y-5">
                      <div className="flex justify-between items-end flex-wrap gap-2">
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-black text-navy">{item.label}</span>
                          <span className="bg-navy/5 text-navy/60 px-3 py-1 rounded-full text-sm font-bold">
                            {item.correct}/{item.total}문항 정답
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-3xl font-black text-primary">{item.score}%</span>
                          <span className="text-sm text-gray-300 font-bold uppercase tracking-widest">AVG {item.average}</span>
                        </div>
                      </div>
                      <div className="h-7 w-full bg-gray-50 rounded-full overflow-hidden shadow-inner relative">
                        <div
                          className="absolute h-full border-r-4 border-gray-200 bg-gray-100 z-0"
                          style={{ width: `${item.average}%` }}
                        ></div>
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-[2000ms] shadow-lg relative z-10"
                          style={{ width: `${item.score}%` }}
                        ></div>
                      </div>
                      <p className="text-sm text-gray-400 font-medium">
                        {item.score >= 80 ? '🎯 우수한 성취도를 보이고 있습니다!' :
                          item.score >= 60 ? '📚 꾸준한 학습으로 더 성장할 수 있어요.' :
                            '💪 집중 보완이 필요한 영역입니다.'}
                      </p>
                    </div>
                  ))}

                  {/* 미평가 역량 */}
                  {unevaluatedCompetencies.length > 0 && (
                    <div className="border-t border-gray-100 pt-8 mt-8">
                      <p className="text-sm text-gray-400 font-bold mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg">info</span>
                        해당 학년군 평가 항목 외
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {unevaluatedCompetencies.map((item) => (
                          <span key={item.label} className="bg-gray-100 text-gray-400 px-4 py-2 rounded-full text-sm font-bold">
                            {item.label} - 미평가
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 이달의 성장 리포트 (월간 자동 리포트 — 재등록 이유를 시스템으로 만드는 핵심 화면) */}
                {expertOpinion && (
                  <div className="mt-12 pt-12 border-t border-gray-100">
                    <h4 className="text-xl font-black text-navy mb-6 flex items-center gap-3">
                      <span className="material-symbols-outlined text-secondary text-3xl">calendar_month</span>
                      이달의 성장 리포트
                    </h4>

                    <div className="bg-gradient-to-br from-navy/5 to-primary/5 rounded-3xl p-8 space-y-6">
                      {/* Level Badge Header */}
                      <div className="flex items-center gap-4 mb-4">
                        <span className={`px-4 py-2 rounded-xl text-sm font-black text-white ${expertOpinion.isLevelUpPhase ? 'bg-secondary animate-pulse' : 'bg-primary'}`}>
                          {expertOpinion.isLevelUpPhase ? '🚀 LEVEL UP CHALLENGE' : '🏆 LEVEL MASTER'}
                        </span>
                        <span className="text-navy font-bold text-lg">{expertOpinion.level}</span>
                      </div>

                      <div>
                        <p className="text-sm text-gray-400 font-bold mb-2">📊 종합 평가</p>
                        <p className="text-navy font-medium leading-relaxed whitespace-pre-wrap">{expertOpinion.overallAssessment}</p>
                      </div>

                      {/* 1. 아이가 표현한 생각 (선생님 코멘트) */}
                      <div className="bg-white rounded-2xl p-6 border border-gray-100">
                        <p className="text-sm text-gray-400 font-bold mb-2 flex items-center gap-2">
                          <span className="material-symbols-outlined text-indigo-400">forum</span>
                          아이가 말로 표현한 생각
                        </p>
                        {isTeacherView ? (
                          <div className="space-y-3">
                            <textarea
                              value={teacherNote}
                              onChange={(e) => { setTeacherNote(e.target.value); setNoteStatus('idle'); }}
                              placeholder="상담 중 학생이 이야기한 내용, 인상 깊었던 표현 등을 기록해주세요."
                              className="w-full min-h-[80px] p-3 rounded-xl border border-gray-200 text-navy text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                            <div className="flex items-center gap-3">
                              <button
                                onClick={handleSaveNote}
                                disabled={noteStatus === 'saving'}
                                className="px-4 py-2 bg-navy text-white rounded-xl text-sm font-bold hover:bg-navy/90 transition-colors disabled:opacity-50"
                              >
                                {noteStatus === 'saving' ? '저장 중...' : '저장'}
                              </button>
                              {noteStatus === 'saved' && <span className="text-xs text-primary font-bold">저장되었습니다</span>}
                            </div>
                          </div>
                        ) : (
                          <p className="text-navy font-medium leading-relaxed">
                            {teacherNote || '이번 상담에서 선생님이 기록한 내용이 아직 없어요. 다음 상담 후 채워질 예정입니다.'}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-3">
                        {expertOpinion.strengths.length > 0 && (
                          <div className="flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-bold">
                            <span className="material-symbols-outlined text-lg">trending_up</span>
                            강점: {expertOpinion.strengths.join(', ')}
                          </div>
                        )}
                        {/* Care Zone Visualization */}
                        {expertOpinion.careZones.length > 0 && (
                          <div className="flex items-center gap-2 bg-red-50 text-red-500 px-4 py-2 rounded-full text-sm font-bold border border-red-100 shadow-sm">
                            <span className="material-symbols-outlined text-lg">medical_services</span>
                            아직 부족한 점: {expertOpinion.careZones.join(', ')}
                          </div>
                        )}
                      </div>

                      {/* 2. 글쓰기에서 좋아진 점 */}
                      <div className="bg-white rounded-2xl p-6 border border-gray-100">
                        <p className="text-sm text-gray-400 font-bold mb-2 flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary">auto_awesome</span>
                          글쓰기에서 좋아진 점
                        </p>
                        <p className="text-navy font-medium leading-relaxed">
                          {improvedAreas && improvedAreas.length > 0
                            ? `지난 평가 대비 ${improvedAreas.join(', ')} 영역 점수가 향상되었습니다.`
                            : expertOpinion.strengths.length > 0
                              ? `${expertOpinion.strengths.join(', ')} 영역에서 이미 안정적인 실력을 보이고 있습니다.`
                              : '다음 평가부터 이전 회차와 비교한 성장 포인트를 확인할 수 있어요.'}
                        </p>
                      </div>

                      {/* Potential Score Visualization */}
                      <div className="bg-white/80 p-5 rounded-2xl border border-gray-100">
                        <div className="flex justify-between items-end mb-2">
                          <span className="text-xs font-bold text-gray-400">잠재력 예측 (Potential Score)</span>
                          <span className="text-sm font-black text-primary">훈련 시 예상 {expertOpinion.potentialScore}점</span>
                        </div>
                        <div className="h-4 bg-gray-100 rounded-full overflow-hidden relative">
                          {/* 현재 점수 */}
                          <div
                            className="absolute h-full bg-navy z-10 rounded-full transition-all duration-1000"
                            style={{ width: `${expertOpinion.totalScore}%` }}
                          />
                          {/* 잠재 점수 (흐릿하게) */}
                          <div
                            className="absolute h-full bg-primary/30 z-0 rounded-full transition-all duration-1000"
                            style={{ width: `${expertOpinion.potentialScore}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-2 text-right">
                          * 오답 노트 학습 및 4주 집중 훈련 시 도달 가능한 예측 점수입니다.
                        </p>
                      </div>

                      {/* 3. 가정에서 도와줄 한 가지 */}
                      <div className="bg-white rounded-2xl p-6 border border-gray-100">
                        <p className="text-sm text-gray-400 font-bold mb-2 flex items-center gap-2">
                          <span className="material-symbols-outlined text-yellow-500">home</span>
                          가정에서 도와줄 한 가지
                        </p>
                        <p className="text-navy font-medium leading-relaxed">{expertOpinion.recommendation}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4·5. 추천 도서 & 다음 달 목표 (Prescription) */}
                {user?.testResult?.prescription && (
                  <div ref={bookSectionRef} className="mt-12 pt-12 border-t border-gray-100">
                    <h4 className="text-xl font-black text-navy mb-6 flex items-center gap-3">
                      <span className="material-symbols-outlined text-green-500 text-3xl">medication</span>
                      AI 맞춤 처방전
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* 추천 도서 */}
                      <div className="bg-green-50/50 rounded-3xl p-8 border border-green-100">
                        <p className="text-sm text-green-600 font-bold mb-4 flex items-center gap-2">
                          <span className="material-symbols-outlined">auto_stories</span>
                          이번 달 추천 도서
                        </p>
                        <div className="space-y-4">
                          {user.testResult.prescription.recommendedBooks.map((book, idx) => (
                            <div key={idx} className="bg-white p-4 rounded-2xl border border-green-100 shadow-sm">
                              <p className="text-navy font-black text-lg mb-1">{book.title}</p>
                              <p className="text-gray-400 text-xs font-bold mb-2">{book.author}</p>
                              <p className="text-gray-500 text-sm leading-snug">{book.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* 다음 달 목표 */}
                      <div className="bg-blue-50/50 rounded-3xl p-8 border border-blue-100 flex flex-col">
                        <p className="text-sm text-blue-600 font-bold mb-4 flex items-center gap-2">
                          <span className="material-symbols-outlined">flag</span>
                          다음 달 수업 목표
                        </p>
                        <div className="bg-white p-6 rounded-2xl border border-blue-100 shadow-sm flex-1 flex flex-col justify-center text-center">
                          <span className="material-symbols-outlined text-blue-400 text-5xl mb-4 mx-auto">task_alt</span>
                          <h5 className="text-navy font-black text-xl mb-3">{user.testResult.prescription.mission.title}</h5>
                          <p className="text-gray-500 font-medium leading-relaxed">
                            {user.testResult.prescription.mission.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 오답 복습 섹션 */}
                {wrongAnswers.length > 0 && (
                  <div className="mt-12 pt-12 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-6">
                      <h4 className="text-xl font-black text-navy flex items-center gap-3">
                        <span className="material-symbols-outlined text-red-400 text-3xl">rate_review</span>
                        {retryMode ? '다시 풀기' : '오답 해설'} ({wrongAnswers.length}문항)
                      </h4>
                      <div className="flex items-center gap-2">
                        {retryMode && (
                          <span className="text-sm font-bold text-primary">
                            {retryCorrectCount}/{wrongAnswers.length} 정답
                          </span>
                        )}
                        <button
                          onClick={() => { setRetryMode(!retryMode); resetRetry(); }}
                          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 ${
                            retryMode
                              ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                              : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                          }`}
                        >
                          <span className="material-symbols-outlined text-sm">{retryMode ? 'visibility' : 'refresh'}</span>
                          {retryMode ? '해설 보기' : '다시 풀기'}
                        </button>
                      </div>
                    </div>

                    {/* 다시 풀기 완료 결과 */}
                    {retryMode && retryComplete && (
                      <div className={`mb-6 p-5 rounded-2xl border-2 ${
                        retryCorrectCount === wrongAnswers.length
                          ? 'bg-primary/5 border-primary/30'
                          : 'bg-amber-50 border-amber-200'
                      }`}>
                        <p className="text-lg font-black text-navy">
                          {retryCorrectCount === wrongAnswers.length
                            ? '모든 오답을 정복했어요!'
                            : `${wrongAnswers.length}문항 중 ${retryCorrectCount}문항 정답!`}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                          {retryCorrectCount === wrongAnswers.length
                            ? '완벽합니다. 이 역량들이 확실히 성장했네요.'
                            : '아래에서 틀린 문항의 해설을 확인하고 다시 도전해 보세요.'}
                        </p>
                        {retryCorrectCount < wrongAnswers.length && (
                          <button
                            onClick={resetRetry}
                            className="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-colors"
                          >
                            한 번 더 도전하기
                          </button>
                        )}
                      </div>
                    )}

                    <div className="space-y-4">
                      {wrongAnswers.map((wrong, idx) => {
                        const isRevealed = retryRevealed.has(wrong.questionId);
                        const retryAnswer = retryAnswers[wrong.questionId];
                        const isRetryCorrect = retryAnswer === wrong.correctAnswer;

                        return retryMode ? (
                          /* 다시 풀기 모드 */
                          <div key={wrong.questionId} className={`rounded-2xl border overflow-hidden transition-all ${
                            isRevealed
                              ? isRetryCorrect ? 'bg-primary/5 border-primary/30' : 'bg-red-50/50 border-red-200'
                              : 'bg-white border-gray-200'
                          }`}>
                            <div className="p-5">
                              <div className="flex items-start gap-4 mb-4">
                                <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm shrink-0 ${
                                  isRevealed
                                    ? isRetryCorrect ? 'bg-primary text-white' : 'bg-red-400 text-white'
                                    : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {idx + 1}
                                </span>
                                <div className="flex-1">
                                  <span className="text-xs font-bold text-gray-400 mb-1 block">{wrong.category}</span>
                                  <p className="text-navy font-bold text-sm">{wrong.question}</p>
                                </div>
                              </div>
                              <div className="space-y-2 pl-0 md:pl-12">
                                {wrong.options.map((opt, optIdx) => {
                                  const optNum = optIdx + 1;
                                  const isSelected = retryAnswer === optNum;
                                  const showCorrect = isRevealed && optNum === wrong.correctAnswer;
                                  const showWrong = isRevealed && isSelected && !isRetryCorrect;
                                  return (
                                    <button
                                      key={optIdx}
                                      onClick={() => handleRetryAnswer(wrong.questionId, optNum)}
                                      disabled={isRevealed}
                                      className={`w-full text-left p-3 rounded-xl text-sm font-medium flex items-center gap-2 transition-all ${
                                        showCorrect
                                          ? 'bg-primary/10 text-primary border-2 border-primary'
                                          : showWrong
                                            ? 'bg-red-100 text-red-500 border-2 border-red-300'
                                            : isSelected
                                              ? 'bg-indigo-50 text-indigo-700 ring-2 ring-indigo-200'
                                              : 'bg-gray-50 text-gray-600 hover:bg-gray-100 disabled:hover:bg-gray-50'
                                      }`}
                                    >
                                      <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-black ${
                                        showCorrect ? 'bg-primary text-white'
                                          : showWrong ? 'bg-red-400 text-white'
                                          : isSelected ? 'bg-indigo-500 text-white'
                                          : 'bg-gray-200 text-gray-500'
                                      }`}>{optNum}</span>
                                      {opt}
                                      {showCorrect && <span className="material-symbols-outlined text-primary text-lg ml-auto">check_circle</span>}
                                      {showWrong && <span className="material-symbols-outlined text-red-400 text-lg ml-auto">cancel</span>}
                                    </button>
                                  );
                                })}
                              </div>
                              {/* 확인 버튼 또는 해설 */}
                              {retryAnswer && !isRevealed && (
                                <div className="mt-4 pl-0 md:pl-12">
                                  <button
                                    onClick={() => handleReveal(wrong.questionId)}
                                    className="px-5 py-2.5 bg-navy text-white rounded-xl text-sm font-bold hover:bg-navy/90 transition-colors"
                                  >
                                    정답 확인
                                  </button>
                                </div>
                              )}
                              {isRevealed && (
                                <div className="mt-4 pl-0 md:pl-12 bg-white rounded-xl p-4 border border-gray-100">
                                  <p className="text-xs text-gray-400 font-bold mb-1 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">lightbulb</span>
                                    해설
                                  </p>
                                  <p className="text-navy text-sm font-medium leading-relaxed">{wrong.rationale}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          /* 기존 해설 모드 */
                          <details key={wrong.questionId} className="bg-red-50/50 rounded-2xl border border-red-100 overflow-hidden group">
                            <summary className="p-5 cursor-pointer flex items-center gap-4 hover:bg-red-50 transition-colors list-none">
                              <span className="w-8 h-8 bg-red-100 text-red-500 rounded-lg flex items-center justify-center font-black text-sm shrink-0">
                                {idx + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs text-red-400 font-bold">{wrong.category}</span>
                                  {'passageTitle' in wrong && (
                                    <span className="text-xs text-gray-400 font-medium">
                                      · {(wrong as any).passageTitle}
                                    </span>
                                  )}
                                </div>
                                <p className="text-navy font-bold text-sm truncate">{wrong.question}</p>
                              </div>
                              <span className="material-symbols-outlined text-gray-400 group-open:rotate-180 transition-transform">expand_more</span>
                            </summary>
                            <div className="p-5 pt-0 space-y-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {wrong.options.map((opt, optIdx) => {
                                  const optNum = optIdx + 1;
                                  return (
                                    <div
                                      key={optIdx}
                                      className={`p-3 rounded-xl text-sm font-medium flex items-center gap-2 ${optNum === wrong.correctAnswer
                                        ? 'bg-primary/10 text-primary border-2 border-primary'
                                        : optNum === wrong.userAnswer
                                          ? 'bg-red-100 text-red-500 border-2 border-red-300 line-through'
                                          : 'bg-gray-50 text-gray-400'
                                      }`}
                                    >
                                      <span className={`w-6 h-6 rounded-full text-xs flex items-center justify-center font-black ${optNum === wrong.correctAnswer
                                        ? 'bg-primary text-white'
                                        : optNum === wrong.userAnswer
                                          ? 'bg-red-400 text-white'
                                          : 'bg-gray-200 text-gray-500'
                                      }`}>
                                        {optNum}
                                      </span>
                                      {opt}
                                      {optNum === wrong.correctAnswer && (
                                        <span className="material-symbols-outlined text-primary text-lg ml-auto">check_circle</span>
                                      )}
                                      {optNum === wrong.userAnswer && optNum !== wrong.correctAnswer && (
                                        <span className="material-symbols-outlined text-red-400 text-lg ml-auto">cancel</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="bg-white rounded-xl p-4 border border-gray-100">
                                <p className="text-xs text-gray-400 font-bold mb-1 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-sm">lightbulb</span>
                                  해설
                                </p>
                                <p className="text-navy text-sm font-medium leading-relaxed">{wrong.rationale}</p>
                              </div>
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Call to Action */}
              <div className="flex flex-col gap-8">
                <div className="bg-secondary p-12 rounded-[3.5rem] text-white shadow-xl shadow-secondary/20 flex flex-col justify-center flex-1">
                  <p className="text-white/50 text-[11px] font-black tracking-[0.3em] uppercase mb-4">Guidance Solution</p>
                  <h4 className="text-3xl font-black mb-6 leading-tight">정밀 대면 상담<br />신청하기</h4>
                  <p className="text-white/80 font-medium mb-10 text-lg leading-relaxed">
                    {gradeSegment
                      ? `"${gradeSegment.concern}" 고민, 진단 결과를 바탕으로 ${gradeSegment.product} 방향의 맞춤 커리큘럼을 제안해 드립니다.`
                      : '진단 결과를 바탕으로 학생에게 딱 맞는 초정밀 맞춤형 커리큘럼을 제안해 드립니다.'}
                  </p>
                  <button
                    onClick={handleRequestConsultation}
                    disabled={consultState === 'submitting' || consultState === 'submitted'}
                    className="bg-white text-secondary font-black py-5 rounded-2xl text-xl shadow-lg hover:scale-[1.02] transition-all disabled:opacity-70 disabled:hover:scale-100"
                  >
                    {consultState === 'submitting' ? '신청 중...'
                      : consultState === 'submitted' ? '신청 완료! 곧 연락드릴게요'
                        : consultState === 'error' ? '오류가 발생했어요, 다시 시도'
                          : '지금 신청하기'}
                  </button>
                </div>

                <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm text-center">
                  <img
                    src={LOGO_URL}
                    className="h-20 mx-auto mb-6 object-contain grayscale opacity-20"
                    alt="logo"
                  />
                  <p className="text-gray-400 text-sm font-bold">가치in은 모든 학생이 성과와 사람됨을<br />함께 Gain하는 교육 생태계를 지향합니다.</p>
                </div>
              </div>
            </div>

            {/* MVP v2: 테스트 종료 후 설문 */}
            {hasResult && showSurvey && !surveySubmitted && (
              <PostTestSurveyForm
                isVisible={showSurvey}
                onSubmit={handleSurveySubmit}
                onSkip={() => setShowSurvey(false)}
              />
            )}

            {/* 설문 완료 감사 메시지 */}
            {surveySubmitted && (
              <div className="bg-primary/5 rounded-3xl p-8 text-center border border-primary/20 mt-10">
                <span className="material-symbols-outlined text-primary text-4xl mb-4 block">check_circle</span>
                <p className="text-navy font-bold">피드백 감사합니다!</p>
                <p className="text-gray-400 text-sm mt-2">더 나은 서비스를 만드는 데 큰 도움이 됩니다.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Mobile Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-gray-100 px-10 pb-10 pt-5 flex justify-between items-center z-50 rounded-t-[3rem] shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
        <span className="material-symbols-outlined text-primary text-3xl font-black">dashboard</span>
        <span className="material-symbols-outlined text-gray-300 text-3xl">auto_stories</span>
        <span className="material-symbols-outlined text-gray-300 text-3xl">edit_square</span>
        <span className="material-symbols-outlined text-gray-300 text-3xl">person</span>
      </nav>
    </div>
  );
};

export default ReportView;

