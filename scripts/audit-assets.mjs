// 저장된 문항(assets) 품질 점검 스크립트
// 사용법: node scripts/audit-assets.mjs [--full]
//   --full 을 붙이면 문제가 발견된 문항의 상세 내용까지 출력
import { readFileSync } from 'node:fs';
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
const FULL = process.argv.includes('--full');

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

const VALID_CATEGORIES = ['어휘력', '사실적 이해', '추론적 이해', '구조적 이해', '비판적 이해'];
// 학년군별 지문 최소 길이 기준 (data/curriculum 가이드 기반, 여유를 둔 하한)
const MIN_PASSAGE = { '초등 저학년': 200, '초등 중학년': 350, '초등 고학년': 500, '중등': 800 };

async function main() {
  // 관리자 로그인 (Firestore 규칙상 인증 필요)
  // 비밀번호는 코드에 두지 않는다. 아래 세 가지 중 하나로 전달한다.
  //   1) .env.local 에 ADMIN_ID / ADMIN_PW 를 적어둔다 (권장 — 명령 기록에 남지 않음)
  //   2) 환경변수 ADMIN_PW
  //   3) 실행 인자 --pw=
  // .env* 는 .gitignore 대상이라 저장소에 올라가지 않는다.
  const adminId = process.argv.find(a => a.startsWith('--id='))?.slice(5)
    || process.env.ADMIN_ID || env.ADMIN_ID || 'admin';
  const adminPw = process.argv.find(a => a.startsWith('--pw='))?.slice(5)
    || process.env.ADMIN_PW || env.ADMIN_PW;
  if (!adminPw) {
    console.error('✖ 관리자 비밀번호가 필요합니다.');
    console.error('  가장 쉬운 방법: .env.local 파일에 아래 두 줄을 추가하세요.');
    console.error('    ADMIN_ID=admin');
    console.error('    ADMIN_PW=<관리자 비밀번호>');
    console.error('  (또는 실행 시 --id= --pw= 로 직접 전달)');
    process.exit(1);
  }
  const email = adminId.includes('@') ? adminId : `${adminId}@gachi.in`;
  try {
    await signInWithEmailAndPassword(auth, email, adminPw);
    console.log(`✔ 관리자 로그인: ${email}\n`);
  } catch (e) {
    console.error(`✖ 로그인 실패 (${email}): ${e.code || e.message}`);
    console.error('  --id=<아이디> --pw=<비밀번호> 로 지정할 수 있습니다.');
    process.exit(1);
  }

  const snap = await getDocs(collection(db, 'assets'));
  const assets = snap.docs.map(d => ({ ...d.data(), assetId: d.id }));
  console.log(`총 지문(asset): ${assets.length}개`);

  const byGrade = {}, byStatus = {};
  let totalQ = 0;
  const issues = []; // {level, assetId, title, grade, msg, detail}

  const add = (level, a, msg, detail) =>
    issues.push({ level, assetId: a.assetId, title: a.title, grade: a.gradeGroup, msg, detail });

  for (const a of assets) {
    byGrade[a.gradeGroup] = (byGrade[a.gradeGroup] || 0) + 1;
    const st = a.status || '(없음)';
    byStatus[st] = (byStatus[st] || 0) + 1;

    // --- 지문 레벨 점검 ---
    const content = a.content || '';
    if (!content.trim()) add('critical', a, '지문 내용이 비어 있음');
    const min = MIN_PASSAGE[a.gradeGroup];
    if (min && content.length > 0 && content.length < min)
      add('warn', a, `지문이 짧음 (${content.length}자 < 권장 ${min}자)`);
    if (/<\/?(u|b|i|strong|em|span|div|br)\b/i.test(content))
      add('warn', a, 'HTML 태그가 지문에 포함됨 (프롬프트상 금지)');
    // ㉠~㉭ 마커가 [밑줄:...] 형식 없이 단독으로 쓰였는지
    const loneMarkers = content.match(/[㉠-㉭](?!\s*\[)/g);
    if (loneMarkers) add('warn', a, `표식 마커가 단독 사용됨 (${loneMarkers.length}개) — ㉠[밑줄:대상] 형식이어야 함`);

    const qs = Array.isArray(a.questions) ? a.questions : [];
    totalQ += qs.length;
    if (qs.length === 0) { add('critical', a, '문항이 하나도 없음'); continue; }

    const answerCounts = {};
    qs.forEach((q, i) => {
      const label = `Q${i + 1}`;
      const opts = Array.isArray(q.options) ? q.options : [];

      if (!q.question || !String(q.question).trim())
        add('critical', a, `${label}: 문제 본문이 비어 있음`);
      if (opts.length !== 5)
        add('critical', a, `${label}: 선택지가 ${opts.length}개 (5개여야 함)`, q.question);
      if (opts.some(o => !o || !String(o).trim()))
        add('critical', a, `${label}: 빈 선택지 포함`, q.question);

      const uniq = new Set(opts.map(o => String(o).trim()));
      if (opts.length > 0 && uniq.size !== opts.length)
        add('critical', a, `${label}: 중복 선택지 존재`, q.question);

      const ans = Number(q.answer);
      if (!Number.isInteger(ans) || ans < 1 || ans > opts.length)
        add('critical', a, `${label}: 정답 번호 이상 (answer=${q.answer}, 선택지 ${opts.length}개)`, q.question);
      else answerCounts[ans] = (answerCounts[ans] || 0) + 1;

      if (!VALID_CATEGORIES.includes(q.category))
        add('critical', a, `${label}: 역량 분류가 잘못됨 ("${q.category}")`, q.question);

      if (!q.rationale || !String(q.rationale).trim())
        add('warn', a, `${label}: 해설(rationale) 없음`, q.question);

      if (opts.some(o => /<\/?[a-z]+>/i.test(String(o))) || /<\/?[a-z]+>/i.test(String(q.question || '')))
        add('warn', a, `${label}: HTML 태그 포함`, q.question);
    });

    // 정답 쏠림 (문항 4개 이상인데 정답이 한 번호에 몰림)
    if (qs.length >= 4) {
      const maxSame = Math.max(...Object.values(answerCounts), 0);
      if (maxSame === qs.length)
        add('warn', a, `정답이 모두 ${Object.keys(answerCounts)[0]}번에 몰림 (${qs.length}문항)`);
    }
  }

  console.log(`총 문항: ${totalQ}개\n`);
  console.log('학년군별 지문:', byGrade);
  console.log('상태별 지문:', byStatus);

  // ============================================================
  // 문항 유형 다양성 진단
  // "문항이 다 비슷해 보인다"를 감이 아니라 수치로 확인하기 위한 구간.
  // 실제 다양성을 만드는 요소는 세 가지뿐이다 — 발문 문장, 지문 마크업, <보기> 상자.
  // (types/domain.ts의 type 필드는 렌더링에 쓰이지 않으므로 집계 대상이 아니다)
  // ============================================================
  {
    const stems = {};          // 발문 끝맺음 패턴별 개수
    const exactDup = {};       // 완전히 동일한 발문
    const byCategory = {};
    let withBox = 0;           // <보기> 상자를 쓴 문항
    let passageWithUnderline = 0, passageWithBlank = 0;

    for (const a of assets) {
      const c = a.content || '';
      if (/\[밑줄:|\[문장밑줄:/.test(c)) passageWithUnderline++;
      if (/\[빈칸\]|\(   \)/.test(c)) passageWithBlank++;

      for (const q of (a.questions || [])) {
        const text = String(q.question || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;

        // 발문의 끝 12자로 유형을 묶는다 ("~적절한 것은?", "~알 수 있는 것은?" 등)
        const key = text.replace(/\s+/g, '').slice(-12);
        stems[key] = (stems[key] || 0) + 1;
        exactDup[text] = (exactDup[text] || 0) + 1;
        byCategory[q.category] = (byCategory[q.category] || 0) + 1;
        if (q.context && q.context.content) withBox++;
      }
    }

    const stemEntries = Object.entries(stems).sort((a, b) => b[1] - a[1]);
    const pct = (n, d) => d > 0 ? `${Math.round((n / d) * 100)}%` : '0%';

    console.log(`\n${'='.repeat(60)}`);
    console.log('📊 문항 유형 다양성');
    console.log('='.repeat(60));

    console.log('\n[역량별 문항 수]');
    Object.entries(byCategory).sort((a, b) => b[1] - a[1])
      .forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}개 (${pct(v, totalQ).padStart(4)})  ${k}`));

    console.log(`\n[발문 패턴]  서로 다른 패턴 ${stemEntries.length}종 / 전체 ${totalQ}문항`);
    const top = stemEntries.slice(0, 12);
    top.forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}개 (${pct(v, totalQ).padStart(4)})  ...${k}`));
    const top3Share = stemEntries.slice(0, 3).reduce((s, [, v]) => s + v, 0);
    console.log(`\n  → 상위 3개 패턴이 전체의 ${pct(top3Share, totalQ)}를 차지`);
    if (totalQ > 0 && top3Share / totalQ > 0.5) {
      console.log('  ⚠️  절반 이상이 같은 3개 발문에 몰려 있습니다. 발문을 다양화하세요.');
      console.log('     docs/question-types.md 의 유형 카탈로그를 참고하세요.');
    }

    const dups = Object.entries(exactDup).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]);
    if (dups.length > 0) {
      console.log(`\n[완전히 똑같은 발문] ${dups.length}종`);
      dups.slice(0, 8).forEach(([k, v]) => console.log(`  ${v}회  ${k.slice(0, 50)}${k.length > 50 ? '...' : ''}`));
    }

    console.log('\n[문항 형식 활용도]');
    console.log(`  <보기> 상자 사용 문항 : ${withBox}개 (${pct(withBox, totalQ)})`);
    console.log(`  밑줄 마크업 있는 지문 : ${passageWithUnderline}개 (${pct(passageWithUnderline, assets.length)})`);
    console.log(`  빈칸 있는 지문        : ${passageWithBlank}개 (${pct(passageWithBlank, assets.length)})`);
    if (totalQ > 0 && withBox / totalQ < 0.1) {
      console.log('  ⚠️  <보기> 상자를 거의 쓰지 않고 있습니다 — 비판적·구조적 이해 문항에 효과적입니다.');
    }

    // 학년군별 — 학생은 자기 학년군 문항만 보므로 이 수치가 체감 다양성에 가깝다.
    // 전체 합계로는 다양해 보여도 한 학년군 안에서는 같은 발문이 반복될 수 있다.
    console.log('\n[학년군별 다양성]  (학생이 실제로 겪는 단위)');
    for (const grade of ['초등 저학년', '초등 중학년', '초등 고학년', '중등']) {
      const list = assets.filter(a => a.gradeGroup === grade);
      if (list.length === 0) continue;
      const qs = list.flatMap(a => a.questions || []);
      const st = {};
      let box = 0;
      for (const q of qs) {
        const t = String(q.question || '').replace(/\s+/g, '').trim();
        if (!t) continue;
        st[t.slice(-12)] = (st[t.slice(-12)] || 0) + 1;
        if (q.context && q.context.content) box++;
      }
      const ent = Object.entries(st).sort((a, b) => b[1] - a[1]);
      const top3 = ent.slice(0, 3).reduce((s, [, v]) => s + v, 0);
      const flag = qs.length > 0 && top3 / qs.length > 0.4 ? ' ⚠️' : '';
      console.log(`  ${grade.padEnd(7)} 문항 ${String(qs.length).padStart(3)}개 · 발문 ${String(ent.length).padStart(3)}종 · 상위3 ${pct(top3, qs.length).padStart(4)}${flag} · <보기> ${pct(box, qs.length)}`);
      if (ent[0]) console.log(`  ${' '.repeat(7)}   └ 최다: ${ent[0][1]}개 ...${ent[0][0]}`);
    }
  }

  const crit = issues.filter(i => i.level === 'critical');
  const warn = issues.filter(i => i.level === 'warn');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔴 심각(critical): ${crit.length}건   🟡 경고(warn): ${warn.length}건`);
  console.log('='.repeat(60));

  const printGroup = (list, title, limit) => {
    if (list.length === 0) return;
    console.log(`\n## ${title}`);
    // 메시지 유형별 집계
    const byMsg = {};
    for (const i of list) {
      const key = i.msg.replace(/Q\d+: /, '').replace(/\(.*?\)/g, '(…)');
      byMsg[key] = (byMsg[key] || 0) + 1;
    }
    console.log('\n[유형별 집계]');
    Object.entries(byMsg).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v}건  ${k}`));

    const show = FULL ? list : list.slice(0, limit);
    console.log(`\n[개별 항목${FULL ? '' : ` (상위 ${show.length}건, 전체는 --full)`}]`);
    for (const i of show) {
      console.log(`  · [${i.grade}] ${i.title}`);
      console.log(`     ${i.msg}`);
      if (i.detail) console.log(`     └ ${String(i.detail).slice(0, 70)}...`);
    }
  };

  printGroup(crit, '🔴 심각한 문제 (학생에게 나가면 안 되는 문항)', 15);
  printGroup(warn, '🟡 경고 (품질 개선 권장)', 10);

  if (issues.length === 0) console.log('\n✅ 발견된 문제가 없습니다.');
  process.exit(0);
}

main().catch(e => { console.error('실패:', e); process.exit(1); });
