// 학생 글 AI 루브릭 분석 — 제출 직후 자동 실행, 실패 시 화면에서 재시도 가능
import { generateContent, Type, ImageInput } from './gemini';
import { Writing, WritingAiReview, WRITING_RUBRIC_CRITERIA } from '../types';
import { getStorageInstance } from './firebase';
import type { CompressedImage } from '../utils/imageCompress';

// 손글씨 사진 → 텍스트 판독 (학생이 확인·수정 후 제출하는 초안)
export async function transcribeHandwriting(images: ImageInput[]): Promise<string> {
    const prompt = `다음 사진들은 학생이 손으로 쓴 글입니다. 사진 순서대로 이어지는 하나의 글로 정확하게 옮겨 적어주세요.

[규칙]
1. 맞춤법·띄어쓰기를 교정하지 말고 학생이 쓴 그대로 옮길 것 (평가를 위해 원문 보존이 중요합니다)
2. 문단 구분이 보이면 줄바꿈으로 반영
3. 글자가 흐릿해 확신이 없는 부분은 가장 가능성 높은 글자로 적기
4. 사진에 글이 아닌 부분(공책 줄, 낙서 등)은 무시
5. 옮겨 적은 본문만 출력 — 설명이나 주석 금지`;

    const text = await generateContent<string>(prompt, { temperature: 0.1, maxOutputTokens: 8192 }, images);
    return (typeof text === 'string' ? text : String(text)).trim();
}

// 원본 사진을 Firebase Storage에 업로드하고 다운로드 URL 목록 반환
export async function uploadWritingImages(studentUid: string, writingId: string, images: CompressedImage[]): Promise<string[]> {
    const storage = await getStorageInstance();
    const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');

    return Promise.all(images.map(async (img, i) => {
        const fileRef = ref(storage, `writings/${studentUid}/${writingId}/${i + 1}.jpg`);
        await uploadBytes(fileRef, img.blob, { contentType: img.mediaType });
        return getDownloadURL(fileRef);
    }));
}

const REVIEW_SCHEMA = {
    type: Type.OBJECT,
    properties: {
        rubric: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    criterion: { type: Type.STRING },
                    score: { type: Type.INTEGER },
                    comment: { type: Type.STRING },
                },
                required: ['criterion', 'score', 'comment'],
            },
        },
        overall: { type: Type.STRING },
        strengths: { type: Type.STRING },
        improvements: { type: Type.STRING },
    },
    required: ['rubric', 'overall', 'strengths', 'improvements'],
};

export async function generateWritingReview(writing: Writing): Promise<WritingAiReview> {
    const prompt = `당신은 초중등 글쓰기 지도 경력 20년의 문해력 교육 전문가입니다.
아래 학생의 글을 루브릭 기준으로 평가해주세요.

[학생 정보]
- 학년군: ${writing.gradeGroup}
- 글의 종류: ${writing.genre}

[글 제목]
${writing.title}

[글 본문]
${writing.content}

[평가 루브릭 — 4개 기준, 각 1~5점]
${WRITING_RUBRIC_CRITERIA.map((c, i) => `${i + 1}. ${c}`).join('\n')}
- 내용·생각: 자기 생각이 담겨 있는가, 내용이 구체적인가
- 글의 짜임: 처음-가운데-끝 구조, 문단 구성이 자연스러운가
- 표현력: 어휘 선택, 문장의 다양성, 생생한 표현
- 맞춤법·어법: 맞춤법, 띄어쓰기, 문장 호응

[작성 지침]
1. 점수는 학년군 수준을 기준으로 평가하세요 (${writing.gradeGroup} 평균 수준이면 3점).
2. 각 기준의 comment는 글에서 실제 문장을 근거로 들어 구체적으로 쓰세요.
3. overall(총평)은 학생이 직접 읽는 글입니다 — 따뜻하고 격려하는 어조, 3~4문장.
4. strengths(잘한 점)는 반드시 1가지 이상 구체적으로.
5. improvements(다음에 시도해볼 것)는 "고쳐라"가 아니라 "이렇게 해보면 더 좋아져요" 어조로 1~2가지.
6. criterion 필드는 반드시 다음 4개 문자열 중 하나를 정확히 사용: ${WRITING_RUBRIC_CRITERIA.join(', ')}

JSON으로만 응답하세요.`;

    const result = await generateContent<Omit<WritingAiReview, 'reviewedAt'>>(prompt, {
        temperature: 0.5,
        maxOutputTokens: 4096,
        responseSchema: REVIEW_SCHEMA,
    });

    // 점수 범위 방어 (모델이 0이나 6을 줄 가능성)
    const rubric = (result.rubric || []).map(r => ({
        ...r,
        score: Math.min(5, Math.max(1, Math.round(r.score))),
    }));

    return {
        rubric,
        overall: result.overall || '',
        strengths: result.strengths || '',
        improvements: result.improvements || '',
        reviewedAt: new Date().toISOString(),
    };
}
