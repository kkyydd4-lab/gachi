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
