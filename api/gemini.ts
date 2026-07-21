import type { VercelRequest, VercelResponse } from '@vercel/node';
// Vercel의 Node ESM 런타임은 상대 경로 import에 확장자를 요구한다 (.js가 컴파일된 _lib/generate.ts로 매핑됨)
import { runGeneration, toCleanErrorMessage } from './_lib/generate.js';
import { verifyFirebaseToken } from './_lib/verifyAuth.js';

const FIREBASE_PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'gachiic';

// AI Gateway 경유 생성 프록시
// - Vercel 배포: OIDC 자동 인증 (프로젝트 설정에서 AI Gateway 활성화 필요)
// - 그 외 환경: AI_GATEWAY_API_KEY 환경변수 사용
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 인증: 로그인한 Firebase 사용자만 호출 가능 (유료 크레딧 무단 소진 방지)
  const user = await verifyFirebaseToken(req.headers.authorization, FIREBASE_PROJECT_ID);
  if (!user) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }

  const { prompt, options = {}, images = [] } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }
  if (!Array.isArray(images) || images.length > 5) {
    return res.status(400).json({ error: '이미지는 최대 5장까지 전송할 수 있습니다.' });
  }

  try {
    const result = await runGeneration(prompt, options, images);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('[api/gemini] generation failed:', error?.message);
    return res.status(502).json({ error: toCleanErrorMessage(error) });
  }
}
