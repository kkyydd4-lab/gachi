// dist 폴더를 정적으로 서빙한다 (SPA 폴백 포함).
// PDF 생성(scripts/export-pdf.mjs)에서 개발 서버 대신 쓰면
// 모듈 요청이 번들 몇 개로 줄어 헤드리스 브라우저에서 훨씬 안정적이다.
//
// 사용법: node scripts/serve-dist.mjs --port=4180
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const PORT = Number(process.argv.find(a => a.startsWith('--port='))?.slice(7) ?? 4180);
const ROOT = join(process.cwd(), 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    // 경로 이탈 방지
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(ROOT, rel);

    let ok = false;
    try { ok = (await stat(file)).isFile(); } catch { }
    if (!ok) file = join(ROOT, 'index.html'); // SPA 폴백

    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
}).listen(PORT, () => console.log(`dist 서빙 중 → http://localhost:${PORT}`));
