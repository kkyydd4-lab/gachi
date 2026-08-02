// 차시 번호를 다시 매긴다.
//
// 규칙 (services/api.ts의 LearningSessionService.renumberByGrade와 동일하게 유지할 것):
//   "차시 번호는 승인된 차시만 갖는다."
//     · APPROVED → "{학년군} N차시"   (생성일 순으로 1부터, 항상 연속)
//     · DRAFT    → "{학년군} 검토대기 N"
//     · ARCHIVED → "{학년군} 반려 N"
//   반려하면 그 번호를 즉시 반납하므로 승인된 차시 번호가 꼬이지 않는다.
//
// 사용법:
//   node scripts/renumber-sessions.mjs           미리보기 (변경 없음)
//   node scripts/renumber-sessions.mjs --apply   실제 반영
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';

function loadEnv() {
  const o = {};
  for (const f of ['.env.local', '.env']) {
    try {
      for (const l of readFileSync(f, 'utf-8').split('\n')) {
        const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in o)) o[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch { }
  }
  return o;
}

const env = loadEnv();
const APPLY = process.argv.includes('--apply');
const GRADES = ['초등 저학년', '초등 중학년', '초등 고학년', '중등'];

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app), db = getFirestore(app);

async function main() {
  const adminPw = env.ADMIN_PW || process.env.ADMIN_PW;
  if (!adminPw) { console.error('✖ .env.local 에 ADMIN_ID / ADMIN_PW 를 설정하세요.'); process.exit(1); }
  const adminId = env.ADMIN_ID || 'admin';
  await signInWithEmailAndPassword(auth, adminId.includes('@') ? adminId : `${adminId}@gachi.in`, adminPw);

  const snap = await getDocs(collection(db, 'learning_sessions'));
  const sessions = snap.docs.map(d => d.data());
  const byDate = (a, b) => String(a.createdAt).localeCompare(String(b.createdAt));

  const changes = [];
  for (const grade of GRADES) {
    const list = sessions.filter(s => s.gradeGroup === grade);
    if (!list.length) continue;

    const want = new Map();
    list.filter(s => s.status === 'APPROVED').sort(byDate)
      .forEach((s, i) => want.set(s.sessionId, `${grade} ${i + 1}차시`));
    list.filter(s => s.status === 'DRAFT').sort(byDate)
      .forEach((s, i) => want.set(s.sessionId, `${grade} 검토대기 ${i + 1}`));
    list.filter(s => s.status === 'ARCHIVED').sort(byDate)
      .forEach((s, i) => want.set(s.sessionId, `${grade} 반려 ${i + 1}`));

    console.log(`\n【${grade}】`);
    const order = { APPROVED: 0, DRAFT: 1, ARCHIVED: 2 };
    [...list].sort((a, b) => (order[a.status] - order[b.status]) || byDate(a, b)).forEach(s => {
      const t = want.get(s.sessionId);
      const same = s.title === t;
      console.log(`  ${same ? ' ' : '→'} ${String(s.title).padEnd(18)} [${s.status}]${same ? '' : `  ⇒ ${t}`}`);
      if (!same) changes.push({ sessionId: s.sessionId, from: s.title, to: t });
    });
  }

  console.log(`\n변경 대상 ${changes.length}개`);
  if (changes.length === 0) { console.log('이미 정리되어 있습니다.'); process.exit(0); }

  if (!APPLY) {
    console.log('[미리보기 — 아무것도 변경하지 않았습니다]');
    console.log('실제 반영하려면 --apply 를 붙이세요.');
    process.exit(0);
  }

  for (const c of changes) {
    await updateDoc(doc(db, 'learning_sessions', c.sessionId), { title: c.to });
    console.log(`  ✔ ${c.from} → ${c.to}`);
  }
  console.log(`\n완료 — ${changes.length}개 차시 번호 재배정`);
  process.exit(0);
}

main().catch(e => { console.error('실패:', e.message || e); process.exit(1); });
