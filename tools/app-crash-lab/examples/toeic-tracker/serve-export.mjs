// Serve the unchanged Next.js static export on loopback; no app source changes.
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

const root = await realpath(resolve(process.argv[2] ?? 'out'));
const port = Number(process.argv[3] ?? 54571);
if (!(await stat(root)).isDirectory() || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Use an existing export directory and a port from 1 to 65535');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.xml': 'application/xml' };
const inside = file => file.startsWith(root + sep);
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    if (path.includes('\0') || path.includes('\\')) throw new Error('path');
    const rel = path === '/' ? '/index.html' : path;
    let file;
    for (const candidate of [resolve(root, '.' + rel), resolve(root, '.' + (rel.endsWith('/') ? rel + 'index.html' : rel + '.html'))]) {
      if (!inside(candidate)) continue;
      try {
        const actual = await realpath(candidate);
        if (inside(actual) && (await stat(actual)).isFile()) { file = actual; break; }
      } catch {}
    }
    if (!file) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    if (req.method === 'HEAD') { res.end(); return; }
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch { res.writeHead(400); res.end('Bad request'); }
});
server.listen(port, '127.0.0.1', () => console.log('Static export ready: http://127.0.0.1:' + port));
for (const name of ['SIGINT', 'SIGTERM']) process.on(name, () => server.close(() => process.exit(0)));
