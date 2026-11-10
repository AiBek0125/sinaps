// Автономный сервер Node.js для запуска «Синапс» без Netlify и без VPN (например, на российском хостинге или локально)
// Запуск: npm run build && node server.js

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import askHandler from './api/ask.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 3000);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

const server = http.createServer(async (nodeReq, nodeRes) => {
  try {
    const reqUrl = new URL(nodeReq.url || '/', `http://${nodeReq.headers.host || 'localhost'}`);

    // Проксируем /api/ask в единый обработчик api/ask.js
    if (reqUrl.pathname === '/api/ask' || reqUrl.pathname === '/.netlify/functions/ask') {
      const chunks = [];
      for await (const chunk of nodeReq) chunks.push(chunk);
      const bodyBuffer = Buffer.concat(chunks);

      const webReq = new Request(reqUrl.toString(), {
        method: nodeReq.method,
        headers: nodeReq.headers,
        body: nodeReq.method !== 'GET' && nodeReq.method !== 'HEAD' ? bodyBuffer : undefined
      });

      const webRes = await askHandler(webReq);
      const resHeaders = {};
      webRes.headers.forEach((v, k) => {
        resHeaders[k] = v;
      });
      nodeRes.writeHead(webRes.status, resHeaders);
      const buf = Buffer.from(await webRes.arrayBuffer());
      nodeRes.end(buf);
      return;
    }

    // Отдаём статику из dist/
    let relPath = decodeURIComponent(reqUrl.pathname);
    if (relPath === '/') relPath = '/index.html';
    const safePath = path.normalize(relPath).replace(/^(\.\.[/\\])+/, '');
    let filePath = path.join(DIST_DIR, safePath);

    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
    } catch {
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const data = await fs.readFile(filePath);

    nodeRes.writeHead(200, {
      'Content-Type': contentType,
      ...(safePath === '/sw.js' ? { 'Cache-Control': 'no-cache, no-store, must-revalidate' } : {})
    });
    nodeRes.end(data);
  } catch (err) {
    nodeRes.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    nodeRes.end(`Server error: ${err?.message || 'unknown'}`);
  }
});

server.listen(PORT, () => {
  console.log(`[Синапс] Сервер запущен на http://localhost:${PORT} (без VPN)`);
});
