import type { VercelRequest, VercelResponse } from '@vercel/node';
// Vercel의 Node ESM 런타임은 상대 경로 import에 확장자를 요구한다 (.js가 컴파일된 _lib/generate.ts로 매핑됨)
import { runGeneration, toCleanErrorMessage } from './_lib/generate.js';

// AI Gateway 경유 생성 프록시
// - Vercel 배포: OIDC 자동 인증 (프로젝트 설정에서 AI Gateway 활성화 필요)
// - 그 외 환경: AI_GATEWAY_API_KEY 환경변수 사용
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, options = {} } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' });
  }

  try {
    const result = await runGeneration(prompt, options);
    return res.status(200).json(result);
  } catch (error: any) {
    console.error('[api/gemini] generation failed:', error?.message);
    return res.status(502).json({ error: toCleanErrorMessage(error) });
  }
}
