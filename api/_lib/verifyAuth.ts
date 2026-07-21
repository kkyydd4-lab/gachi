// Firebase ID 토큰 검증 (서비스 계정 불필요)
// Google이 공개하는 JWKS로 ID 토큰 서명·발급자·audience를 검증한다.
// 유료 AI Gateway 크레딧을 쓰므로, 로그인하지 않은 외부 요청이 /api/gemini를
// 임의로 호출해 비용을 발생시키는 것을 막는 게 목적.
import { createRemoteJWKSet, jwtVerify } from 'jose';

// Firebase(Secure Token) ID 토큰용 공개키 (x509 → JWKS 엔드포인트)
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

export interface VerifiedUser {
  uid: string;
  email?: string;
}

/**
 * Authorization: Bearer <Firebase ID 토큰> 검증.
 * 성공 시 { uid }, 실패 시 null.
 */
export async function verifyFirebaseToken(
  authHeader: string | undefined,
  projectId: string
): Promise<VerifiedUser | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    // Firebase ID 토큰은 sub 클레임이 uid
    const uid = typeof payload.sub === 'string' ? payload.sub : undefined;
    if (!uid) return null;
    return { uid, email: typeof payload.email === 'string' ? payload.email : undefined };
  } catch {
    return null;
  }
}
