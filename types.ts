import { z } from 'zod';

export type ViewState = 'LOGIN' | 'SIGNUP' | 'REPORT' | 'GUIDE' | 'PROFILE' | 'DIAGNOSTIC' | 'ADMIN' | 'TEACHER';

export type GradeGroupType = '초등 저학년' | '초등 중학년' | '초등 고학년' | '중등';


export interface Academy {
  id: string;          // 학원 고유 ID (자동생성)
  code: string;        // 가입용 코드 (예: GACHI_TEST)
  name: string;        // 학원명
  region: string;      // 지역
  createdAt: string;   // 생성일
}

export interface CompetencyData {
  label: string;
  score: number;
  average: number;
  correct: number;  // 맞은 개수
  total: number;    // 전체 문제 수
}


export interface Prescription {
  id: string;
  targetCompetency: string; // 취약 역량
  recommendedBooks: {
    title: string;
    author: string;
    reason: string;
  }[];
  mission: {
    title: string;
    description: string;
  };
}

export interface WrongAnswerRecord {
  questionId: number;
  passageTitle: string;  // 어떤 지문에서 틀렸는지
  category: string;
  question: string;
  options: string[];
  userAnswer: number;
  correctAnswer: number;
  rationale: string;
}

export interface TestResult {
  totalScore: number;
  competencies: CompetencyData[];
  level: string;
  percentile: number;
  generatedAt: string;
  wrongAnswers?: WrongAnswerRecord[];
  prescription?: Prescription; // 처방 결과 추가
}

export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN';

export interface UserAccount {
  id: string;
  password: string;
  name: string;
  role: UserRole;          // 역할 추가 (기본값: STUDENT)
  academyId?: string;      // 소속 학원 ID (선생님/학생 공통)
  assignedTeacherId?: string; // 학생인 경우 담당 선생님 ID
  school: string;
  grade: string;
  phone: string;
  signupDate: string;
  isAdmin?: boolean;       // 하위 호환성 유지 (제거 예정)
  testResult?: TestResult;
  testHistory?: TestResult[];
  isAcademyAdmin?: boolean; // 학원 관리자 여부
  uid?: string;       // Firebase Document ID (for updates/deletes)
  parentPhone?: string; // 학부모 연락처
}

export interface Question {
  id: number;
  category: '어휘력' | '사실적 이해' | '추론적 이해' | '비판적 이해' | '구조적 이해';
  question: string;
  options: string[];
  answer: number;
  rationale?: string; // AI가 생성한 출제 의도 및 해설
  // [New] 고급 문항 유형 (하위 호환성을 위해 Optional 처리)
  type?: 'UNDERLINE_INTENT' | 'BLANK_INFERENCE' | 'BOX_EXAMPLE' | 'SENTENCE_INSERTION' | 'NORMAL';
  context?: {
    content: string;     // 보기 박스 내용
    type?: 'BOX' | 'NONE'; // 렌더링 힌트
  };
  reviewStatus?: {
    passed: boolean;
    feedback: string;
  };
}

export interface DiagnosticPassage {
  subject: string;
  title: string;
  content: string;
  difficulty: '하' | '중' | '상';
  questions: Question[];
}

// 생성된 콘텐츠를 관리하기 위한 자산 타입
export type AssetStatus = 'CANDIDATE' | 'APPROVED' | 'REJECTED';

export interface Asset extends DiagnosticPassage {
  assetId: string;
  gradeGroup: GradeGroupType;
  createdAt: string;
  status: AssetStatus; // 후보(검토전), 승인(학습데이터), 반려
  feedback?: string; // 관리자 피드백
}

// --- 차시(Session) 기반 학습 관리 타입 ---
export type LearningSessionStatus = 'DRAFT' | 'APPROVED' | 'ARCHIVED';

export interface LearningSession {
  sessionId: string;
  gradeGroup: GradeGroupType;
  title: string;       // 예: "1차시 - 기초 실력 다지기"
  difficulty: '하' | '중' | '상';  // 난이도
  assetIds: string[];  // 4개의 Asset ID 목록
  status: LearningSessionStatus;
  createdAt: string;
}

export interface AdminConfig {
  gradeGroup: GradeGroupType;
  targetSubject: string;
  difficulty: '하' | '중' | '상';
  countPerCategory: Record<string, number>;
  customInstruction?: string; // 관리자가 추가하는 세부 지침
  promptTemplates?: Record<string, string>; // 학년군별 커스텀 프롬프트 템플릿
}

export interface KnowledgeData {
  id: string;
  gradeGroup: GradeGroupType;
  difficulty: '하' | '중' | '상';
  passage: string;
  sampleQuestions: Question[];
  createdAt: string;
}

export interface GradeCurriculumConfig {
  gradeGroup: GradeGroupType;
  topics: string[];
  config: {
    charCount: string;
    style: string;
    generateCount: number;
    difficulty?: string;
    instruction?: string;
    basePrompt?: string;
  };
  categories: Record<string, number>;
}

export type AgentStatus = 'PLANNING' | 'WRITING' | 'EXAMINING' | 'FINALIZING';

export interface BlueprintDebugInfo {
  source: 'ADMIN_CUSTOM' | 'SYSTEM_DEFAULT';
  gradeGroup: string;
  architecture: Record<string, number>;
  subjects: string[];
  promptUsed: string;
}

// ========================================
// 데이터 수집 및 분석 관련 타입 (MVP v2)
// ========================================

/**
 * 문항별 상세 로그
 * 각 문항에서 유저가 선택한 답안, 소요 시간, 난이도 피드백 등을 기록
 */
export interface QuestionLog {
  questionId: number;           // 문항 번호
  category: string;             // 역량 카테고리 (어휘력, 추론적 이해 등)
  userChoice: number | null;    // 유저가 선택한 답안 (null = 미응답)
  isCorrect: boolean;           // 정오표
  timeSpent: number;            // 해당 문항 체류 시간 (밀리초)
  timestamp: string;            // 문항 완료 시각 (ISO 문자열)
  difficultyFeedback?: 1 | 2 | 3 | 4 | 5;  // 마이크로 서베이: 난이도 피드백 (1=매우 쉬움 ~ 5=매우 어려움)
}

/**
 * 테스트 종료 후 설문
 * 결과 페이지에서 수집하는 유저 피드백
 */
export interface PostTestSurvey {
  overallDifficulty: 1 | 2 | 3 | 4 | 5;    // 전체 난이도 (1=너무 쉬움 ~ 5=너무 어려움)
  wasExplanationClear: boolean;             // 설명이 충분히 이해되었나요?
  wouldRecommend: 1 | 2 | 3 | 4 | 5;       // 친구에게 추천 의향 (NPS)
  needsGuidance?: boolean;                  // 학습 방향 추천 필요 여부
  additionalFeedback?: string;              // 추가 의견 (선택)
}

/**
 * 테스트 세션 전체 데이터
 * 한 번의 테스트 수행에 대한 모든 정보를 담는 최상위 구조
 */
export interface TestSession {
  sessionId: string;           // 고유 세션 ID
  userId: string;              // 유저 ID
  userInfo: {
    grade: string;             // 학년
    school: string;            // 학교
    source?: string;           // 유입 경로 (utm_source)
  };
  summary: {
    totalScore: number;        // 총점
    totalQuestions: number;    // 전체 문항 수
    correctCount: number;      // 정답 수
    durationSec: number;       // 총 소요 시간 (초)
    startedAt: string;         // 테스트 시작 시각
    completedAt?: string;      // 테스트 완료 시각 (이탈 시 없음)
    categoryScores: Record<string, {  // 카테고리별 점수
      correct: number;
      total: number;
      rate: number;            // 정답률 (0-100)
    }>;
  };
  questionLogs: QuestionLog[];  // 문항별 상세 로그
  assetIds?: string[];          // [New] 세션에 사용된 지문 ID 목록 (중복 출제 방지용)
  learningSessionId?: string;   // [New] 할당된 차시 ID
  survey?: PostTestSurvey;      // 종료 후 설문 (선택)
  dropOff?: {                   // 이탈 정보 (완료 시 null)
    questionId: number;         // 이탈 시점 문항 번호
    passageIdx: number;         // 이탈 시점 지문 인덱스
    timestamp: string;          // 이탈 시각
    reason: 'REFRESH' | 'CLOSE' | 'CANCEL' | 'TIMEOUT';  // 이탈 사유
  };
}

// ========================================
// AI Response Validation Schemes (Zod)
// ========================================

export const QuestionSchema = z.object({
  category: z.enum(['어휘력', '사실적 이해', '추론적 이해', '비판적 이해', '구조적 이해']),
  question: z.string().min(1),
  options: z.array(z.string()).length(5),
  answer: z.number().int().min(1).max(5),
  rationale: z.string().optional()
});

export const AIWriterResponseSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(10)
});

export const AIExaminerResponseSchema = z.object({
  modified_content: z.string().optional(),
  questions: z.array(QuestionSchema).min(1)
});
