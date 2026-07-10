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
    teacherNote?: string; // 선생님이 남긴 월간 리포트용 코멘트 (상담 모드에서 작성)
}

export type ConsultationRequestStatus = 'PENDING' | 'DONE';

export interface ConsultationRequest {
    id: string;
    studentUid: string;
    studentName: string;
    academyId: string;
    status: ConsultationRequestStatus;
    requestedAt: string;
}

// --- 운영 매뉴얼 (가맹사업 "구조화" 대응: 상황별 대응 문서) ---
export type ManualCategory =
    | '신규 상담 대응'
    | '학부모 불만 대응'
    | '모집·홍보'
    | '재등록 관리'
    | '교사 관리'
    | '지점 운영';

export interface OperationManual {
    id: string;
    category: ManualCategory;
    title: string;       // 예: "재등록 상담 스크립트"
    content: string;     // 본문 (텍스트/마크다운)
    updatedAt: string;
    updatedBy: string;   // 작성/수정한 관리자 이름
}

// --- 교사 품질 점검 (워터폴 2순위: 교사 품질 관리) ---
export const QUALITY_CHECK_CRITERIA = ['수업 준비도', '피드백 충실도', '학생 소통', '진도 관리'] as const;
export type QualityCheckCriterion = typeof QUALITY_CHECK_CRITERIA[number];

export interface TeacherQualityCheck {
    id: string;
    teacherUid: string;
    teacherName: string;
    academyId: string;
    scores: Record<QualityCheckCriterion, number>; // 각 1~5점
    note?: string;
    checkedAt: string;
    checkedBy: string; // 점검한 관리자 이름
}

export type UserRole = 'STUDENT' | 'TEACHER' | 'ADMIN';

// 연간 성장 프로그램 등록 정보 (ABS 관점: "한 달 수업료"가 아니라 "등록된 과정"으로 재등록을 추적하기 위한 데이터)
export interface ProgramEnrollment {
    name: string;              // 예: "초3·4 글쓰기 기초 완성 과정"
    startDate: string;
    nextRenewalDate?: string;  // 다음 갱신(재등록) 예정일 — 실제 재등록률 계산의 기준
}

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
    program?: ProgramEnrollment; // 등록된 연간 성장 프로그램 (학생)
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
