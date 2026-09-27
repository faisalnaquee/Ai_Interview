import http from 'http';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import dotenv from 'dotenv';
import WebSocket from 'ws';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const app = require('./Server/src/app.js');
const setupInterviewSocket = require('./Server/src/websocket/interviewSocket.js');
const connectDb = require('./Server/src/db/db.js');

const port = 3000;
const server = http.createServer(app);

const wss = new WebSocket.Server({ server });
setupInterviewSocket(wss);

async function start() {
  try {
    await connectDb();
  } catch (err: any) {
    console.warn('[MockHire] Database initialization warning:', err?.message);
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(__dirname, 'dist');
  const clientDistDir = path.resolve(__dirname, 'Client/dist');

  if (isProduction && (fs.existsSync(distDir) || fs.existsSync(clientDistDir))) {
    const serveDir = fs.existsSync(distDir) ? distDir : clientDistDir;
    const express = require('express');
    app.use(express.static(serveDir));
    app.get('*', (_req: any, res: any) => {
      res.sendFile(path.join(serveDir, 'index.html'));
    });
    console.log(`[MockHire] Serving production build from ${serveDir}`);
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      configFile: path.resolve(__dirname, 'Client/vite.config.ts'),
      root: path.resolve(__dirname, 'Client'),
      server: {
        middlewareMode: true,
        host: '0.0.0.0',
        port,
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('[MockHire] Vite development middleware attached');
  }

  server.listen(port, '0.0.0.0', () => {
    console.log(`[MockHire] Server running on http://0.0.0.0:${port}`);
  });
}

start().catch((err) => {
  console.error('[MockHire] Fatal startup error:', err);
  process.exit(1);
});
