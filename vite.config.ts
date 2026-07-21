import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// 로컬 개발 서버에서 /api/gemini를 처리하는 미들웨어
// (프로덕션에서는 동일 로직이 Vercel 함수 api/gemini.ts로 동작)
function devApiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'dev-api-gemini',
    configureServer(server) {
      // ai SDK가 읽는 인증 환경변수를 .env에서 전달
      if (env.AI_GATEWAY_API_KEY && !process.env.AI_GATEWAY_API_KEY) {
        process.env.AI_GATEWAY_API_KEY = env.AI_GATEWAY_API_KEY;
      }
      if (env.VERCEL_OIDC_TOKEN && !process.env.VERCEL_OIDC_TOKEN) {
        process.env.VERCEL_OIDC_TOKEN = env.VERCEL_OIDC_TOKEN;
      }

      server.middlewares.use('/api/gemini', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          // 프로덕션과 동일하게 Firebase ID 토큰 검증
          const { verifyFirebaseToken } = await import('./api/_lib/verifyAuth');
          const projectId = env.VITE_FIREBASE_PROJECT_ID || 'gachiic';
          const authed = await verifyFirebaseToken(req.headers.authorization as string | undefined, projectId);
          if (!authed) {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: '로그인이 필요합니다.' }));
            return;
          }

          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const { prompt, options = {}, images = [] } = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}');

          if (!prompt) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'prompt is required' }));
            return;
          }

          const { runGeneration, toCleanErrorMessage } = await import('./api/_lib/generate');
          try {
            const result = await runGeneration(prompt, options, images);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (error: any) {
            console.error('[dev api/gemini] generation failed:', error?.message);
            res.statusCode = 502;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: toCleanErrorMessage(error) }));
          }
        } catch (error: any) {
          console.error('[dev api/gemini] bad request:', error?.message);
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid request body' }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), devApiPlugin(env)],
    define: {},
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/analytics'],
            recharts: ['recharts'],
            vendor: ['react', 'react-dom', 'react-router-dom'],
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './setupTests.ts',
    }
  };
});
