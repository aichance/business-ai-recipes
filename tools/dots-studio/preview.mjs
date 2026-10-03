import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.DOTS_STUDIO_PORT ?? 8782);
const files = new Set(["scenario", "evidence", "run", "proof"]);
createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const kind = url.pathname.replace(/^\//, "") || "scenario";
  if (!files.has(kind)) { res.writeHead(404); return res.end("Not found"); }
  try {
    const data = await readFile(join(root, "dist", `${kind}.html`));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff" });
    res.end(data);
  } catch { res.writeHead(503); res.end("Run npm run build first"); }
}).listen(port, "127.0.0.1", () => console.error(`Dots Studio local preview: http://127.0.0.1:${port}/scenario?preview=1`));
