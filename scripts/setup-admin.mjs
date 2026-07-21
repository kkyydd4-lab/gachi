// 관리자 계정 1회 부트스트랩 스크립트
// - 새 관리자 Firebase Auth 계정을 만들고, 그 Firestore users 문서 role을 ADMIN으로 설정
// - ⚠️ 반드시 firestore 보안 규칙을 배포하기 "전에" 실행할 것 (배포 후에는 role 변경이 차단됨)
//
// 사용법 (프로젝트 루트에서):
//   node scripts/setup-admin.mjs <이메일 또는 아이디> <비밀번호> "<관리자 이름>"
//   예) node scripts/setup-admin.mjs admin@gachi.in "강력한비밀번호!" "가치인 본사"
//
// .env.local 또는 .env 의 VITE_FIREBASE_* 값을 사용한다.
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

function loadEnv() {
  const out = {};
  for (const file of ['.env.local', '.env']) {
    try {
      for (const line of readFileSync(file, 'utf-8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in out)) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch { /* 파일 없으면 건너뜀 */ }
  }
  return out;
}

const [, , rawId, password, name = '관리자'] = process.argv;
if (!rawId || !password) {
  console.error('사용법: node scripts/setup-admin.mjs <이메일/아이디> <비밀번호> "<이름>"');
  process.exit(1);
}

const env = loadEnv();
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

const id = rawId.trim().toLowerCase();
const email = id.includes('@') ? id : `${id}@gachi.in`;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  // 1) Auth 계정 로그인 시도 → 없으면 생성
  let uid;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    uid = cred.user.uid;
    console.log('[setup-admin] 기존 계정으로 로그인:', email);
  } catch {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    uid = cred.user.uid;
    console.log('[setup-admin] 새 관리자 계정 생성:', email);
  }

  // 2) Firestore users/{uid} 문서를 ADMIN으로 저장
  const ref = doc(db, 'users', uid);
  const existing = await getDoc(ref);
  const profile = {
    id,
    name,
    role: 'ADMIN',
    school: '관리 본부',
    grade: '-',
    phone: '010-0000-0000',
    academyId: 'ADMIN',
    isAdmin: true,
    signupDate: existing.exists() ? (existing.data().signupDate || new Date().toISOString()) : new Date().toISOString(),
  };
  await setDoc(ref, profile, { merge: true });
  console.log('[setup-admin] 완료 ✅  uid=%s  role=ADMIN', uid);
  console.log('이제 앱에서 아이디 "%s" / 설정한 비밀번호로 로그인하면 관리자로 들어갑니다.', id);
  process.exit(0);
}

main().catch(e => { console.error('[setup-admin] 실패:', e.message); process.exit(1); });
