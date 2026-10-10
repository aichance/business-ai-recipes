import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export async function startDemo(port = 0) {
  const html = await readFile(new URL('./index.html', import.meta.url));
  let stock = { sku: 'COFFEE', quantity: 7, revision: 1 };
  let rejected = false;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/inventory')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(html); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/reset') { stock = { sku: 'COFFEE', quantity: 7, revision: 1 }; rejected = false; send(200, stock); return; }
    if (req.method === 'GET' && url.pathname === '/api/validation') { send(200, { rejected }); return; }
    if (req.method === 'GET' && url.pathname === '/api/stock') { send(200, stock); return; }
    if (req.method === 'PUT' && url.pathname === '/api/stock') {
      if (url.searchParams.get('mode') === 'server-error') { send(500, { error: 'Synthetic service failure' }); return; }
      let raw = '';
      try {
        for await (const chunk of req) { raw += chunk; if (raw.length > 4096) { send(413, { error: 'too large' }); return; } }
        const value = JSON.parse(raw);
        if (!Number.isInteger(value.quantity) || value.quantity < 0) {
          if (url.searchParams.get('mode') === 'broken-reject') stock.quantity = value.quantity;
          rejected = true;
          send(url.searchParams.get('mode') === 'logical-reject' ? 200 : 422, { error: 'Quantity must be a nonnegative integer' }); return;
        }
        rejected = false;
        stock = { ...stock, quantity: value.quantity, revision: stock.revision + 1 }; send(200, stock);
      } catch { send(400, { error: 'Invalid JSON' }); }
      return;
    }
    send(404, { error: 'not found' });
  });
  await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolveListen); });
  return { server, baseURL: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done, reject) => server.close(error => error ? reject(error) : done())) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await startDemo(Number(process.env.PORT ?? 4173));
  console.log(`Synthetic App Crash Lab demo: ${app.baseURL}`);
}
