# 가치인 문해력 평가

초·중등 학생의 문해력을 진단·관리하는 학원용 웹 앱.

## 핵심 기능

1. **문해력 평가** — AI가 생성한 지문·문항으로 진단, 역량별(어휘력/사실적·추론적·구조적·비판적 이해) 리포트
2. **글쓰기 노트** — 학생 글 제출(직접 입력 또는 손글씨 사진 OCR) → AI 루브릭 분석 → 교사 확인
3. **독서 기록장** — 읽은 책 + 별점 + 한줄평
4. **개인 리포트** — 평가·글·독서 데이터를 종합한 월간 성장 리포트
5. **성장 대시보드** — 회차별 점수 추이 등 성장 시각화

## 기술 구조

- **프론트엔드**: React 19 + Vite + Tailwind CSS 4, `react-router-dom`
- **백엔드**: Firebase (Auth / Firestore / Storage) — 서버 없이 클라이언트 SDK + 보안 규칙
- **AI 생성**: Vercel 함수 `api/gemini.ts` → **Vercel AI Gateway** 경유 (모델 슬러그는 `api/_lib/generate.ts`)
  - 클라이언트에 AI API 키가 노출되지 않음. 로그인한 Firebase 사용자만 호출 가능 (`api/_lib/verifyAuth.ts`)
  - 로컬 개발 시에는 `vite.config.ts`의 미들웨어가 동일 로직 처리
- **배포**: Vercel (SPA rewrite는 `vercel.json`)

## 로컬 실행

필요한 것: Node.js 20+

```bash
npm install
npm run dev        # http://localhost:3000
```

환경변수 (`.env` 또는 `.env.local`):

| 변수 | 용도 |
|---|---|
| `VITE_FIREBASE_*` | Firebase 프로젝트 설정 (7개) |
| `AI_GATEWAY_API_KEY` | AI Gateway 인증 (로컬 개발용 — Vercel 배포에서는 OIDC 자동) |

`vercel env pull`로 받으면 민감 값이 자리표시자로 내려올 수 있으니 실제 키는 Vercel 대시보드에서 확인.

## 검사·테스트·빌드

```bash
npx tsc -b         # 타입 체크
npm run test:run   # vitest
npm run build      # 프로덕션 빌드
```

## Firebase 보안 규칙 배포

규칙 파일이 접근 제어의 실체다 — 수정 후 반드시 배포할 것.

```bash
firebase deploy --only firestore:rules   # firestore.rules
firebase deploy --only storage           # storage.rules
```

## 관리자 계정

관리자는 일반 Firebase 계정 + Firestore `users` 문서의 `role: 'ADMIN'`으로 결정된다.
최초 1회 부트스트랩: `node scripts/setup-admin.mjs <이메일> <비밀번호> "<이름>"`
(보안 규칙 배포 **전에** 실행해야 role 설정이 가능)
