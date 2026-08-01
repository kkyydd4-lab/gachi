// 저장된 문항의 정답 번호 교정 스크립트
//   기본은 "미리보기"(저장 없음). 실제 반영하려면 --apply
//   사용법:
//     node scripts/repair-answers.mjs            # 미리보기
//     node scripts/repair-answers.mjs --apply    # 실제 교정 (백업 파일 자동 생성)
//
// 판정 방식: 지문 + 문항 + 선택지 + 기존 해설을 AI에 주고 정답 번호를 다시 판정.
// 해설이 이미 정답 근거를 서술하고 있어 신뢰도가 높다.
// (개발 서버 http://localhost:3000 가 떠 있어야 함 — /api/gemini 사용)
import { readFileSync, writeFileSync } from 'node:fs';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';

function loadEnv() {
  const out = {};
  for (const f of ['.env.local', '.env']) {
    try {
      for (const line of readFileSync(f, 'utf-8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !(m[1] in out)) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch { }
  }
  return out;
}
const env = loadEnv();
const APPLY = process.argv.includes('--apply');
const API = 'http://localhost:3000/api/gemini';

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
});
const auth = getAuth(app);
const db = getFirestore(app);

const SCHEMA = {
  type: 'object',
  properties: {
    answers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },        // 문항 순번 (1부터)
          correct: { type: 'integer' },      // 정답 선택지 번호 (1~5)
          confidence: { type: 'string' },    // high | low
        },
        required: ['index', 'correct', 'confidence'],
      },
    },
  },
  required: ['answers'],
};

async function judgeAsset(asset, token) {
  const qs = asset.questions || [];
  const body = qs.map((q, i) => {
    const opts = (q.options || []).map((o, j) => `   ${j + 1}) ${o}`).join('\n');
    return `[문항 ${i + 1}] ${q.question}\n${opts}\n   (출제자 해설: ${q.rationale || '없음'})`;
  }).join('\n\n');

  const prompt = `당신은 국어 문항 검수 전문가입니다. 아래 지문과 문항들을 읽고, 각 문항의 정답이 몇 번 선택지인지 판정하세요.

[지문]
${asset.content}

[문항들]
${body}

[판정 규칙]
1. 선택지 번호는 1부터 시작합니다 (첫 번째 선택지=1, 다섯 번째=5).
2. 출제자 해설이 있으면 그것을 가장 중요한 근거로 삼으세요. 해설이 지목하는 선택지가 정답입니다.
3. 해설이 없거나 모호하면 지문을 근거로 직접 판단하세요.
4. confidence는 해설이 정답을 명확히 지목하면 "high", 추론이 필요하면 "low".
5. 모든 문항(${qs.length}개)에 대해 index 1~${qs.length}로 빠짐없이 답하세요.

JSON으로만 응답하세요.`;

  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      prompt,
      options: { temperature: 0, maxOutputTokens: 4096, responseSchema: SCHEMA, model: 'google/gemini-3.1-pro-preview' },
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const json = await res.json();
  return json.data?.answers || [];
}

async function main() {
  const adminPw = process.argv.find(a => a.startsWith('--pw='))?.slice(5) || 'admin!@#$%^';
  await signInWithEmailAndPassword(auth, 'admin@gachi.in', adminPw);
  const token = await auth.currentUser.getIdToken();
  console.log(`✔ 관리자 인증 완료 (모드: ${APPLY ? '🔴 실제 교정' : '🔵 미리보기'})\n`);

  const snap = await getDocs(collection(db, 'assets'));
  const assets = snap.docs.map(d => ({ ...d.data(), assetId: d.id }));

  // 백업 (실제 적용 시)
  if (APPLY) {
    const file = `backup-assets-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    writeFileSync(file, JSON.stringify(assets, null, 2), 'utf-8');
    console.log(`💾 백업 저장: ${file}\n`);
  }

  let changed = 0, same = 0, lowConf = 0, failed = 0, changedAssets = 0;
  const changeLog = [];

  for (const [n, a] of assets.entries()) {
    process.stdout.write(`[${n + 1}/${assets.length}] ${a.title.slice(0, 28).padEnd(30)} `);
    let judged;
    try {
      judged = await judgeAsset(a, token);
    } catch (e) {
      console.log(`⚠ 실패: ${e.message.slice(0, 50)}`);
      failed++;
      continue;
    }

    const qs = a.questions || [];
    const updated = qs.map((q, i) => {
      const j = judged.find(x => Number(x.index) === i + 1);
      if (!j) return q;
      const correct = Number(j.correct);
      if (!Number.isInteger(correct) || correct < 1 || correct > (q.options || []).length) return q;
      if (j.confidence !== 'high') lowConf++;
      if (Number(q.answer) !== correct) {
        changed++;
        changeLog.push({
          title: a.title, qIndex: i + 1, question: String(q.question).slice(0, 45),
          before: q.answer, after: correct, conf: j.confidence,
          answerText: String((q.options || [])[correct - 1] || '').slice(0, 35),
        });
        return { ...q, answer: correct };
      }
      same++;
      return q;
    });

    const assetChanged = updated.some((q, i) => q.answer !== qs[i].answer);
    if (assetChanged) changedAssets++;

    if (APPLY && assetChanged) {
      await updateDoc(doc(db, 'assets', a.assetId), { questions: updated });
      console.log(`✅ 교정 저장`);
    } else {
      console.log(assetChanged ? '→ 변경 예정' : '· 이상 없음');
    }
  }

  console.log('\n' + '='.repeat(64));
  console.log(`총 문항 판정: ${changed + same}개`);
  console.log(`  🔧 정답 교정: ${changed}개  (지문 ${changedAssets}개)`);
  console.log(`  ✔ 그대로 유지: ${same}개`);
  console.log(`  ⚠ 낮은 확신: ${lowConf}개  |  판정 실패 지문: ${failed}개`);
  console.log('='.repeat(64));

  if (changeLog.length) {
    console.log('\n[교정 목록 — 상위 25건]');
    for (const c of changeLog.slice(0, 25)) {
      console.log(`  ${c.before} → ${c.after} ${c.conf === 'high' ? ' ' : '(확신낮음)'} | ${c.title.slice(0, 18)} Q${c.qIndex}: ${c.question}`);
      console.log(`        정답: "${c.answerText}"`);
    }
    writeFileSync('repair-answers-log.json', JSON.stringify(changeLog, null, 2), 'utf-8');
    console.log(`\n전체 교정 목록 → repair-answers-log.json (${changeLog.length}건)`);
  }

  if (!APPLY) console.log('\n※ 미리보기였습니다. 실제 반영하려면: node scripts/repair-answers.mjs --apply');
  process.exit(0);
}

main().catch(e => { console.error('실패:', e); process.exit(1); });
