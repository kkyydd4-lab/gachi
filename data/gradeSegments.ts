// 학년대별 고객 세그먼트 (가치인 방향.txt의 "트랜치" 개념 적용)
// 같은 상품을 모든 학년에 동일하게 보여주지 않고, 학부모의 고민 단계에 맞춰 다르게 안내한다.

export interface GradeSegment {
    rangeLabel: string;
    concern: string; // 학부모가 느끼는 고민
    product: string; // 이 시기에 안내할 상품/반
}

const LOWER_ELEM: GradeSegment = { rangeLabel: '초등 1~3학년', concern: '책 읽기 습관과 표현력', product: '독서·말하기 기초반' };
const MID_ELEM: GradeSegment = { rangeLabel: '초등 4~5학년', concern: '글쓰기 자신감', product: '문해력 레벨업 정규반' };
const UPPER_ELEM: GradeSegment = { rangeLabel: '초등 6학년', concern: '중등 대비', product: '수행평가 글쓰기·중등 준비반' };
const MIDDLE: GradeSegment = { rangeLabel: '중등 1~3학년', concern: '학교 수행평가와 실제 점수', product: '학교 글쓰기·토론·보고서 대비반' };

export const getGradeSegment = (grade: string): GradeSegment | null => {
    if (!grade) return null;
    const num = parseInt(grade.replace(/\D/g, ''), 10);

    if (grade.includes('초등')) {
        if (num <= 3) return LOWER_ELEM;
        if (num <= 5) return MID_ELEM;
        return UPPER_ELEM;
    }
    if (grade.includes('중등')) return MIDDLE;
    return null;
};
