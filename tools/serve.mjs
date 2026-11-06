// Локальный сервер, похожий на GitHub Pages (gzip + кэш), для честного Lighthouse: node tools/serve.mjs [port]
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(fileURLToPath(import.meta.url), '..', '..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json' };
const port = Number(process.argv[2] || 8090);
http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(root, p));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  try {
    let body = await readFile(file);
    const type = types[extname(file)] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': extname(file) === '.html' ? 'max-age=600' : 'max-age=31536000' };
    if (/text|javascript|svg|json/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '')) { body = gzipSync(body); headers['Content-Encoding'] = 'gzip'; }
    res.writeHead(200, headers); res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}).listen(port, () => console.log('http://localhost:' + port + '/'));
