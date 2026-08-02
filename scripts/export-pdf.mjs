// 차시별 문제지·정답해설을 PDF로 뽑는다.
//
// 방식: 인쇄 미리보기 경로(/print/sample)에 차시 내용을 window.__PRINT_DATA__ 로 주입하고,
//       설치된 Chrome을 헤드리스로 띄워 DevTools 프로토콜로 인쇄한다.
//       앱의 실제 렌더링·쪽 나눔을 그대로 쓰므로 화면에서 보던 결과와 같다.
//
// ⚠️ 두 가지를 피해야 한다 (둘 다 실제로 빈 PDF가 나왔던 원인):
//   1. Chrome의 --print-to-pdf 옵션 — load 시점에 인쇄해서 React가 그리기 전에 찍힌다.
//      대신 .sheet 가 생길 때까지 기다린 뒤 Page.printToPDF 를 호출한다.
//   2. sampleData.ts 파일을 고쳐 넣는 방식 — 개발 서버 재컴파일과 겹치면 화면이 빈 채로 뜬다.
//      대신 Page.addScriptToEvaluateOnNewDocument 로 데이터를 심는다.
//
// 사전 조건: `npm run dev` 가 떠 있어야 한다.
//
// 사용법:
//   node scripts/export-pdf.mjs --port=3000
//   node scripts/export-pdf.mjs --port=3000 --sessions=1,2 --out=pdf
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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
const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const PORT = arg('port', '3000');
const OUT = arg('out', 'pdf');
const WANT = arg('sessions', '1,2').split(',').map(n => parseInt(n.trim(), 10)).filter(Boolean);
const CDP_PORT = 9333;

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(p => existsSync(p));
if (!CHROME) { console.error('✖ Chrome 또는 Edge를 찾을 수 없습니다.'); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const no = t => { const m = /(\d+)\s*차시/.exec(t || ''); return m ? +m[1] : 999; };

/** 최소 CDP 클라이언트 (Node 내장 WebSocket 사용) */
class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.waiting = new Map(); }
  static async attach(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new Cdp(ws);
    ws.onmessage = e => {
      const msg = JSON.parse(e.data);
      const w = c.waiting.get(msg.id);
      if (w) { c.waiting.delete(msg.id); msg.error ? w.rej(new Error(msg.error.message)) : w.res(msg.result); }
    };
    return c;
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.waiting.set(id, { res, rej }));
  }
  async evaluate(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result?.value;
  }
  close() { this.ws.close(); }
}

async function renderPdf(url, outPath, payload) {
  // 빈 탭을 연 뒤 Page.navigate 로 직접 이동시킨다.
  // /json/new?<url> 은 응답에 URL이 담기지만 실제로는 about:blank 에 머무는 경우가 있다.
  const tab = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const cdp = await Cdp.attach(tab.webSocketDebuggerUrl);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__PRINT_DATA__ = ${JSON.stringify(payload)};`,
    });
    await cdp.send('Page.navigate', { url });

    // .sheet 가 생기고 개수가 안정될 때까지 대기
    // (쪽 나눔은 높이 측정 후 두 번째 렌더에서 확정되므로 같은 값이 연속으로 나와야 완료다)
    let stable = 0, last = -1;
    for (let i = 0; i < 160; i++) {
      const n = await cdp.evaluate('document.querySelectorAll(".sheet").length');
      if (typeof n === 'number' && n > 0 && n === last) { if (++stable >= 3) break; } else { stable = 0; }
      last = n;
      await sleep(250);
    }
    if (typeof last !== 'number' || last < 1) {
      const diag = await cdp.evaluate(
        'JSON.stringify({href:location.href, ready:document.readyState, '
        + 'rootLen:(document.getElementById("root")||{}).innerHTML?.length ?? -1, '
        + 'text:document.body.innerText.slice(0,120)})');
      throw new Error(`렌더링된 쪽을 찾지 못했습니다 — ${diag}`);
    }

    const { data } = await cdp.send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true, // @page 의 A4·여백 설정을 그대로 쓴다
    });
    writeFileSync(outPath, Buffer.from(data, 'base64'));
    return last;
  } finally {
    cdp.close();
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${tab.id}`).catch(() => { });
  }
}

async function main() {
  const adminPw = env.ADMIN_PW || process.env.ADMIN_PW;
  if (!adminPw) { console.error('✖ .env.local 에 ADMIN_ID / ADMIN_PW 를 설정하세요.'); process.exit(1); }
  const adminId = env.ADMIN_ID || 'admin';

  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
  });
  const auth = getAuth(app), db = getFirestore(app);
  await signInWithEmailAndPassword(auth, adminId.includes('@') ? adminId : `${adminId}@gachi.in`, adminPw);

  const aS = await getDocs(collection(db, 'assets'));
  const byId = new Map(aS.docs.map(d => [d.id, { ...d.data(), assetId: d.id }]));
  const sS = await getDocs(collection(db, 'learning_sessions'));
  const GRADES = ['초등 저학년', '초등 중학년', '초등 고학년', '중등'];
  const sessions = sS.docs.map(d => d.data())
    .filter(s => s.status === 'APPROVED' && WANT.includes(no(s.title)))
    .sort((a, b) => GRADES.indexOf(a.gradeGroup) - GRADES.indexOf(b.gradeGroup) || no(a.title) - no(b.title));
  if (!sessions.length) { console.error('✖ 대상 차시가 없습니다.'); process.exit(1); }

  mkdirSync(OUT, { recursive: true });

  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${process.cwd()}/.chrome-pdf-profile`,
    'about:blank',
  ], { stdio: 'ignore' });

  for (let i = 0; i < 60; i++) {
    try { await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(); break; }
    catch { await sleep(300); }
  }

  const DOCS = [{ mode: 'paper', label: '문제지' }, { mode: 'key', label: '정답해설' }];
  const made = [];
  try {
    for (const s of sessions) {
      const assets = (s.assetIds || []).map(x => byId.get(x)).filter(Boolean);
      if (!assets.length) { console.log(`  건너뜀: ${s.title} (지문 없음)`); continue; }
      const payload = { session: { ...s, sessionId: 'sample' }, assets };

      for (const d of DOCS) {
        const file = `${process.cwd()}/${OUT}/${s.title.replace(/\s+/g, '_')}_${d.label}.pdf`;
        const pages = await renderPdf(`http://localhost:${PORT}/print/sample?mode=${d.mode}`, file, payload);
        const kb = Math.round(readFileSync(file).length / 1024);
        console.log(`  ✔ ${s.title} ${d.label} — ${pages}쪽 (${kb}KB)`);
        made.push(file);
      }
    }
  } finally {
    chrome.kill();
  }

  console.log(`\n완료 — PDF ${made.length}개 (${OUT}/)`);
  process.exit(0);
}

main().catch(e => { console.error('실패:', e.message || e); process.exit(1); });
