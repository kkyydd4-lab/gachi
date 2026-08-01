// 저장된 지문·문항을 JSON 파일로 내보낸다 (읽기 전용)
//
// 목적: 문항을 파일로 꺼내 검토·수정한 뒤 import-assets.mjs 로 다시 올리는 작업 흐름.
//       Firestore 콘솔에서 하나씩 고치는 것보다 안전하고 빠르며, 변경 내역을 눈으로 볼 수 있다.
//
// 사용법:
//   node scripts/export-assets.mjs                     전체 학년군
//   node scripts/export-assets.mjs --grade="초등 중학년"   특정 학년군만
//
// 인증: .env.local 의 ADMIN_ID / ADMIN_PW 사용 (audit-assets.mjs와 동일)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

function loadEnv() {
  const out = {};
  for (const file of ['.env.local', '.env']) {
    try {
      for (const line of readFileSync(file, 'utf-8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in out)) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch { }
  }
  return out;
}

const env = loadEnv();
const GRADE_FILTER = process.argv.find(a => a.startsWith('--grade='))?.slice(8);
const OUT_DIR = process.argv.find(a => a.startsWith('--out='))?.slice(6) || 'data/exported';

// 파일명은 ASCII로 (한글 파일명은 도구에 따라 깨질 수 있음)
const GRADE_SLUG = {
  '초등 저학년': 'elementary-low',
  '초등 중학년': 'elementary-mid',
  '초등 고학년': 'elementary-high',
  '중등': 'middle',
};

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  const adminId = env.ADMIN_ID || 'admin';
  const adminPw = env.ADMIN_PW || process.env.ADMIN_PW;
  if (!adminPw) {
    console.error('✖ .env.local 에 ADMIN_ID / ADMIN_PW 를 설정하세요.');
    process.exit(1);
  }
  const email = adminId.includes('@') ? adminId : `${adminId}@gachi.in`;
  await signInWithEmailAndPassword(auth, email, adminPw);
  console.log(`✔ 관리자 로그인: ${email}\n`);

  const snap = await getDocs(collection(db, 'assets'));
  let assets = snap.docs.map(d => ({ ...d.data(), assetId: d.id }));
  if (GRADE_FILTER) assets = assets.filter(a => a.gradeGroup === GRADE_FILTER);

  if (assets.length === 0) {
    console.log('내보낼 지문이 없습니다.');
    process.exit(0);
  }

  // 차시 정보도 함께 (지문이 어느 차시에 묶여 있는지 알아야 수정 후 영향 범위를 안다)
  const sessSnap = await getDocs(collection(db, 'learning_sessions'));
  const sessions = sessSnap.docs.map(d => d.data());

  mkdirSync(OUT_DIR, { recursive: true });

  const byGrade = {};
  for (const a of assets) (byGrade[a.gradeGroup] ||= []).push(a);

  for (const [grade, list] of Object.entries(byGrade)) {
    // 제목순 정렬 — 파일 diff가 안정적으로 보이도록
    list.sort((a, b) => String(a.title).localeCompare(String(b.title), 'ko'));

    const slug = GRADE_SLUG[grade] || encodeURIComponent(grade);
    const path = `${OUT_DIR}/${slug}.json`;
    const payload = {
      gradeGroup: grade,
      exportedAt: new Date().toISOString(),
      assetCount: list.length,
      questionCount: list.reduce((s, a) => s + (a.questions?.length || 0), 0),
      assets: list,
    };
    writeFileSync(path, JSON.stringify(payload, null, 2) + '\n', 'utf-8');

    const used = sessions.filter(s => s.gradeGroup === grade).length;
    console.log(`✔ ${path}`);
    console.log(`   지문 ${list.length}개 · 문항 ${payload.questionCount}개 · 이 학년군 차시 ${used}개`);
  }

  console.log('\n수정한 뒤 아래로 검증·업로드하세요:');
  console.log('  node scripts/import-assets.mjs <파일경로>           검증만 (기본)');
  console.log('  node scripts/import-assets.mjs <파일경로> --apply   실제 반영');
  process.exit(0);
}

main().catch(e => { console.error('실패:', e.message || e); process.exit(1); });
