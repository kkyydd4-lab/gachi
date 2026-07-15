// 학생 글 AI 루브릭 분석 — 제출 직후 자동 실행, 실패 시 화면에서 재시도 가능
import { generateContent, generateContentDetailed, Type, ImageInput } from './gemini';
import { Writing, WritingAiReview, WRITING_RUBRIC_CRITERIA } from '../types';
import { getStorageInstance } from './firebase';
import type { CompressedImage } from '../utils/imageCompress';

// 손글씨 판독 모델 우선순위. 앞쪽일수록 품질↑(단, 프리미엄/프리뷰 모델은 무료 티어에서
// 요청 제한이 강함). 앞 모델이 rate-limit 등으로 실패하면 순서대로 다음 모델로 강등.
// gemini-2.5-flash는 GA라 무료 티어에서도 비교적 여유가 있어 최후 보루로 둔다.
// 실제 학생 손글씨 비교 결과 pro가 흘림 구간 판독 정확도에서 뚜렷이 우위(문해력 평가는
// 원문 정확도가 신뢰와 직결). 속도는 병렬 처리 + 진행 표시로 완화. flash를 폴백으로 둠.
const OCR_MODEL_CHAIN = [
    'google/gemini-3.1-pro-preview', // 최상 정확도 (기본)
    'google/gemini-3.5-flash',       // 실패 시 빠른 모델로
    'google/gemini-2.5-flash',       // 최후 보루
];

export interface TranscriptionResult {
    text: string;
    servedModel?: string; // 실제로 응답한 모델 (폴백 진단용)
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// 한 장을 판독. 모델 체인을 순서대로 시도하다 첫 성공을 반환.
async function transcribeOnePage(prompt: string, img: ImageInput): Promise<{ text: string; servedModel?: string }> {
    let lastErr: any = null;
    for (const model of OCR_MODEL_CHAIN) {
        try {
            const r = await generateContentDetailed<string>(
                prompt,
                { temperature: 0.1, maxOutputTokens: 8192, model, fallbackModels: [] },
                [img]
            );
            const text = (typeof r.data === 'string' ? r.data : String(r.data)).trim();
            if (text) return { text, servedModel: r.servedModel || model };
        } catch (e) {
            lastErr = e;
            // rate-limit이면 잠깐 쉬고 다음(더 여유로운) 모델로
            await sleep(600);
        }
    }
    throw lastErr || new Error('판독 실패');
}

// 손글씨 사진 → 텍스트 판독 (학생이 확인·수정 후 제출하는 초안)
// 페이지를 병렬로 판독한다(유료 크레딧이면 rate-limit 여유가 커 5장도 ~20~30초).
// 각 페이지는 개별 요청이라 순서·집중도 유지되고, 실패 시 페이지별 모델 강등이 걸린다.
// onProgress로 "n/total" 진행을 알려 대기 UX를 개선한다.
export async function transcribeHandwriting(
    images: ImageInput[],
    onProgress?: (done: number, total: number) => void
): Promise<TranscriptionResult> {
    const buildPrompt = (pageNo: number, total: number) =>
        `이 사진은 학생이 손으로 쓴 글의 ${total > 1 ? `${total}장 중 ${pageNo}번째 장` : '한 장'}입니다. 사진 속 손글씨를 한 글자도 빠짐없이 정확하게 옮겨 적어주세요.

[규칙]
1. 맞춤법·띄어쓰기를 교정하지 말고 학생이 쓴 그대로 옮길 것 (평가를 위해 원문 보존이 중요합니다)
2. 연필로 흐리게 쓴 글씨, 공책 줄 위의 작은 글씨도 최대한 읽어낼 것
3. 문단·줄 구분이 보이면 줄바꿈으로 반영
4. 정말 판독이 불가능한 글자만 □로 표시하고, 그 외에는 가장 가능성 높은 글자로 적기
5. 사진에 글이 아닌 부분(공책 줄, 낙서, 그림)은 무시
6. 이 사진에 보이는 본문만 출력 — 설명·주석·페이지 번호 붙이지 말 것`;

    const total = images.length;
    let done = 0;
    onProgress?.(0, total);

    const pages = await Promise.all(images.map(async (img, i) => {
        const r = await transcribeOnePage(buildPrompt(i + 1, total), img);
        done += 1;
        onProgress?.(done, total);
        return r;
    }));

    return {
        text: pages.map(p => p.text).filter(Boolean).join('\n\n'),
        servedModel: pages[0]?.servedModel,
    };
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
