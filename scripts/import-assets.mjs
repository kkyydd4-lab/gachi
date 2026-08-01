// 수정한 JSON 파일을 검증한 뒤 Firestore에 반영한다.
//
// 기본은 "검증만" (dry run) — 실제 반영은 --apply 를 붙여야 한다.
// 검증에서 심각(critical) 항목이 하나라도 있으면 --apply 여도 중단한다.
//
// 사용법:
//   node scripts/import-assets.mjs data/exported/elementary-mid.json
//   node scripts/import-assets.mjs data/exported/elementary-mid.json --apply
//
// 인증: .env.local 의 ADMIN_ID / ADMIN_PW
import { readFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

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
const APPLY = process.argv.includes('--apply');
const FILE = process.argv.find(a => a.endsWith('.json'));

if (!FILE) {
  console.error('✖ 대상 JSON 파일을 지정하세요.');
  console.error('  예: node scripts/import-assets.mjs data/exported/elementary-mid.json');
  process.exit(1);
}

const VALID_CATEGORIES = ['어휘력', '사실적 이해', '추론적 이해', '구조적 이해', '비판적 이해'];
const VALID_GRADES = ['초등 저학년', '초등 중학년', '초등 고학년', '중등'];
const VALID_DIFF = ['하', '중', '상'];
const VALID_STATUS = ['CANDIDATE', 'APPROVED', 'REJECTED'];

/** 업로드 전 최종 검증 — 하나라도 걸리면 올리지 않는다 */
function validate(assets) {
  const errors = [], warns = [];
  const seenIds = new Set();

  for (const a of assets) {
    const at = `[${a.title || '(제목없음)'}]`;

    if (!a.assetId) errors.push(`${at} assetId 없음`);
    else if (seenIds.has(a.assetId)) errors.push(`${at} assetId 중복: ${a.assetId}`);
    else seenIds.add(a.assetId);

    if (!VALID_GRADES.includes(a.gradeGroup)) errors.push(`${at} gradeGroup 잘못됨: "${a.gradeGroup}"`);
    if (!VALID_DIFF.includes(a.difficulty)) errors.push(`${at} difficulty 잘못됨: "${a.difficulty}"`);
    if (a.status && !VALID_STATUS.includes(a.status)) errors.push(`${at} status 잘못됨: "${a.status}"`);
    if (!a.content || !String(a.content).trim()) errors.push(`${at} 지문 본문 비어 있음`);
    if (/<\/?(u|b|i|strong|em|span|div|br)\b/i.test(a.content || '')) errors.push(`${at} 지문에 HTML 태그 포함`);

    // 마커가 [밑줄:...] 짝 없이 단독으로 쓰였는지 (빈칸 괄호 표기는 정상으로 인정)
    const lone = (a.content || '')
      .replace(/\(\s{2}[㉠-㉯]\s{2}\)/g, '')
      .match(/[㉠-㉭](?!\s*\[)/g);
    if (lone) warns.push(`${at} 표식 마커 ${lone.length}개가 짝 없이 사용됨`);

    const qs = Array.isArray(a.questions) ? a.questions : [];
    if (qs.length === 0) errors.push(`${at} 문항 없음`);

    qs.forEach((q, i) => {
      const qt = `${at} Q${i + 1}`;
      const opts = Array.isArray(q.options) ? q.options : [];

      if (!q.question || !String(q.question).trim()) errors.push(`${qt} 문제 본문 비어 있음`);
      if (opts.length !== 5) errors.push(`${qt} 선택지가 ${opts.length}개 (5개여야 함)`);
      if (opts.some(o => !o || !String(o).trim())) errors.push(`${qt} 빈 선택지 포함`);
      if (new Set(opts.map(o => String(o).trim())).size !== opts.length) errors.push(`${qt} 중복 선택지`);

      const ans = Number(q.answer);
      if (!Number.isInteger(ans) || ans < 1 || ans > opts.length)
        errors.push(`${qt} 정답 번호 이상 (answer=${q.answer}, 선택지 ${opts.length}개)`);

      if (!VALID_CATEGORIES.includes(q.category)) errors.push(`${qt} 역량 이름 잘못됨: "${q.category}"`);
      if (!q.rationale || !String(q.rationale).trim()) warns.push(`${qt} 해설 없음`);
      if (q.context && !String(q.context.content || '').trim()) errors.push(`${qt} 보기 상자가 비어 있음`);
    });
  }
  return { errors, warns };
}

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
  const payload = JSON.parse(readFileSync(FILE, 'utf-8'));
  const assets = payload.assets || payload;
  console.log(`대상 파일: ${FILE}`);
  console.log(`지문 ${assets.length}개 · 문항 ${assets.reduce((s, a) => s + (a.questions?.length || 0), 0)}개\n`);

  const { errors, warns } = validate(assets);

  if (errors.length > 0) {
    console.log(`🔴 심각 ${errors.length}건 — 업로드할 수 없습니다.`);
    errors.slice(0, 30).forEach(e => console.log('  ·', e));
    if (errors.length > 30) console.log(`  ... 외 ${errors.length - 30}건`);
    process.exit(1);
  }
  console.log('✔ 심각 오류 없음');

  if (warns.length > 0) {
    console.log(`\n🟡 경고 ${warns.length}건 (업로드는 가능)`);
    warns.slice(0, 15).forEach(w => console.log('  ·', w));
    if (warns.length > 15) console.log(`  ... 외 ${warns.length - 15}건`);
  }

  if (!APPLY) {
    console.log('\n[검증만 수행했습니다 — 아무것도 변경하지 않았습니다]');
    console.log('실제로 반영하려면 --apply 를 붙여 다시 실행하세요.');
    process.exit(0);
  }

  const adminId = env.ADMIN_ID || 'admin';
  const adminPw = env.ADMIN_PW || process.env.ADMIN_PW;
  if (!adminPw) {
    console.error('✖ .env.local 에 ADMIN_ID / ADMIN_PW 를 설정하세요.');
    process.exit(1);
  }
  const email = adminId.includes('@') ? adminId : `${adminId}@gachi.in`;
  await signInWithEmailAndPassword(auth, email, adminPw);
  console.log(`\n✔ 관리자 로그인: ${email}`);

  let created = 0, updated = 0, unchanged = 0;
  for (const a of assets) {
    const ref = doc(db, 'assets', a.assetId);
    const before = await getDoc(ref);
    if (!before.exists()) {
      await setDoc(ref, a);
      created++;
      console.log(`  + 신규: ${a.title}`);
      continue;
    }
    // 내용이 같으면 건너뛴다 (불필요한 쓰기 방지)
    const prev = { ...before.data(), assetId: before.id };
    if (JSON.stringify(prev) === JSON.stringify(a)) { unchanged++; continue; }
    await setDoc(ref, a);
    updated++;
    console.log(`  ~ 수정: ${a.title}`);
  }

  console.log(`\n완료 — 신규 ${created}개 · 수정 ${updated}개 · 변경없음 ${unchanged}개`);
  process.exit(0);
}

main().catch(e => { console.error('실패:', e.message || e); process.exit(1); });
