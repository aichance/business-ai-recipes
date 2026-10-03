#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = [
  resolve(ROOT, "../dots-studio"),
  resolve(ROOT, "../../public-package/tools/dots-studio")
].find(existsSync);
if (!TEMPLATE) throw new Error("App Forge requires a sibling dots-studio template");
const RESERVED_IDS = new Set(["__proto__", "prototype", "constructor"]);
const FIELD_TYPES = new Set(["text", "number", "boolean", "select"]);

function usage() {
  console.log(`App Forge - deterministic schema-to-local-MCP-plugin generator

Usage:
  node forge.mjs --schema SCHEMA.json --data DATA.json --out OUTPUT_DIR [--zip SOURCE.zip]

The schema may use App Forge fields[] or a constrained JSON Schema properties{} shape.
The generator never calls a model or network. The output is local development source.
`);
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (key === "force") {
      result.force = true;
      if (argv[i + 1] === "true" || argv[i + 1] === "false") { result.force = argv[i + 1] === "true"; i += 1; }
      continue;
    }
    const value = argv[i + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
    result[key] = value;
    i += 1;
  }
  return result;
}

function text(value, label, max = 120) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(`${label} must be a non-empty string of at most ${max} characters`);
  }
  return value.trim();
}

function slugify(value) {
  const slug = String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!/^[a-z][a-z0-9-]{2,39}$/.test(slug)) throw new Error("slug must contain 3-40 lowercase ASCII characters");
  return slug;
}

function unique(values, label) {
  if (new Set(values).size !== values.length) throw new Error(`${label} contains duplicate ids`);
}

function normalizedField(raw, required) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Each field must be an object");
  const id = text(raw.id, "field.id", 32);
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(id) || RESERVED_IDS.has(id)) throw new Error(`Unsupported field id: ${id}`);
  const label = text(raw.label ?? raw.title ?? id, `field ${id} label`, 80);
  let type = raw.type;
  if (type === "string") type = "text";
  if (type === "integer") type = "number";
  if (Array.isArray(raw.enum)) type = "select";
  if (!FIELD_TYPES.has(type)) throw new Error(`Unsupported type for ${id}: ${String(type)}`);
  const field = { id, label, type, required: Boolean(required) };
  if (type === "select") {
    const options = raw.options ?? raw.enum;
    if (!Array.isArray(options) || options.length < 1 || options.length > 20 || options.some((v) => typeof v !== "string" || !v.trim())) {
      throw new Error(`select field ${id} needs 1-20 string options`);
    }
    unique(options, `options for ${id}`);
    field.options = options;
  }
  if (Object.hasOwn(raw, "default")) field.default = raw.default;
  return field;
}

function normalizeSchema(raw, sourceName) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Schema must be a JSON object");
  const title = text(raw.title ?? basename(sourceName, ".json"), "schema.title", 100);
  const slug = slugify(raw.slug ?? title);
  let fields;
  if (Array.isArray(raw.fields)) {
    fields = raw.fields.map((field) => normalizedField(field, field.required ?? true));
  } else if (raw.properties && typeof raw.properties === "object" && !Array.isArray(raw.properties)) {
    const required = new Set(Array.isArray(raw.required) ? raw.required : Object.keys(raw.properties));
    fields = Object.entries(raw.properties).map(([id, property]) => normalizedField({ ...property, id }, required.has(id)));
  } else {
    throw new Error("Schema needs fields[] or a JSON Schema properties{} object");
  }
  if (fields.length < 1 || fields.length > 12) throw new Error("Schema must contain 1-12 fields");
  unique(fields.map((field) => field.id), "schema fields");
  return { title, slug, fields, sourceFormat: Array.isArray(raw.fields) ? "fields" : "json-schema" };
}

function validateValue(field, value) {
  if (field.type === "text" && typeof value !== "string") throw new Error(`${field.id} must be text`);
  if (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(`${field.id} must be a finite number`);
  if (field.type === "boolean" && typeof value !== "boolean") throw new Error(`${field.id} must be boolean`);
  if (field.type === "select" && (!field.options.includes(value))) throw new Error(`${field.id} must be one of: ${field.options.join(", ")}`);
}

function normalizeData(schema, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Data must be a JSON object");
  const fieldIds = new Set(schema.fields.map((field) => field.id));
  const unexpected = Object.keys(input).filter((key) => !fieldIds.has(key));
  if (unexpected.length) throw new Error(`Unexpected input field(s): ${unexpected.join(", ")}`);
  const output = {};
  for (const field of schema.fields) {
    if (Object.hasOwn(input, field.id)) output[field.id] = input[field.id];
    else if (Object.hasOwn(field, "default")) output[field.id] = field.default;
    else if (field.required) throw new Error(`Missing required input field: ${field.id}`);
    if (Object.hasOwn(output, field.id)) validateValue(field, output[field.id]);
  }
  return output;
}

function generatedInputSchema(schema) {
  const entries = schema.fields.map((field) => {
    let validator = field.type === "text" ? "z.string()" : field.type === "number" ? "z.number()" : field.type === "boolean" ? "z.boolean()" : `z.enum(${JSON.stringify(field.options)})`;
    if (!field.required) validator += ".optional()";
    return `${JSON.stringify(field.id)}: ${validator}`;
  });
  return `z.object({ ${entries.join(", ")} }).strict()`;
}

function json(value) {
  return JSON.stringify(value, null, 2);
}

function renderSchemaModule(schema, sample) {
  return `export const schema = ${json(schema)};\nexport const sample = ${json(sample)};\n`;
}

function renderCore(schema) {
  return `import { schema } from "./schema.mjs";

const fieldIds = new Set(schema.fields.map((field) => field.id));
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

export function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Input must be a JSON object");
  const unexpected = Object.keys(input).filter((key) => !fieldIds.has(key));
  if (unexpected.length) throw new Error(\`Unexpected input field(s): \${unexpected.join(", ")}\`);
  const data = {};
  for (const field of schema.fields) {
    if (has(input, field.id)) data[field.id] = input[field.id];
    else if (has(field, "default")) data[field.id] = field.default;
    else if (field.required) throw new Error(\`Missing required input field: \${field.id}\`);
    if (!has(data, field.id)) continue;
    const value = data[field.id];
    if (field.type === "text" && typeof value !== "string") throw new Error(\`\${field.id} must be text\`);
    if (field.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) throw new Error(\`\${field.id} must be a finite number\`);
    if (field.type === "boolean" && typeof value !== "boolean") throw new Error(\`\${field.id} must be boolean\`);
    if (field.type === "select" && !field.options.includes(value)) throw new Error(\`\${field.id} must be one of: \${field.options.join(", ")}\`);
  }
  return data;
}

export function analyzeInput(input) {
  const data = validateInput(input);
  return {
    kind: "generated-panel",
    title: schema.title,
    fields: schema.fields,
    data,
    editable: true,
    artifact: { name: \`\${schema.slug}.data.json\`, format: "JSON", contents: data },
    summary: { fields: schema.fields.length, populated: Object.keys(data).length, valid: true },
    limit: "Deterministic local validation for this generated schema; no model, network, file write, or actual dots-host claim."
  };
}
`;
}

function renderUi(schema) {
  return `import { App, applyDocumentTheme, applyHostStyleVariables } from "@modelcontextprotocol/ext-apps";
import { OpenAIExtensions, OpenAIFileEntrypointInputSchema } from "@openai/mcp-extensions/app";
import { analyzeInput } from "./core.mjs";
import { sample, schema } from "./schema.mjs";

const $ = (id) => document.getElementById(id);
const app = new App({ name: ${JSON.stringify(schema.title)}, version: "0.1.0" });
const extensions = new OpenAIExtensions(app);
let data = structuredClone(sample), result = analyzeInput(data), ready = false, downloadUrl;
const selected = new Set();
const preview = window.parent === window && location.hostname === "127.0.0.1" && new URLSearchParams(location.search).get("preview") === "1";
function el(tag, value, className) { const node = document.createElement(tag); if (value !== undefined) node.textContent = value; if (className) node.className = className; return node; }
function showError(error) { $("error").hidden = false; $("error").textContent = error?.message ?? String(error); }
function showResult() {
  $("error").hidden = true;
  $("summary").textContent = \`\${result.summary.populated}/\${result.summary.fields} fields valid\`;
  $("output").textContent = JSON.stringify(result.data, null, 2);
}
function fieldControl(field) {
  const label = el("label", null, "field");
  const top = el("span", null, "field-top"); top.append(el("strong", field.label), el("small", field.type));
  const pick = document.createElement("input"); pick.type = "checkbox"; pick.checked = selected.has(field.id); pick.setAttribute("aria-label", \`Share \${field.id} context\`);
  pick.addEventListener("change", () => { if (pick.checked) selected.add(field.id); else selected.delete(field.id); }); top.append(pick); label.append(top);
  let control;
  if (field.type === "select") { control = document.createElement("select"); for (const option of field.options) { const item = el("option", option); item.value = option; control.append(item); } }
  else { control = document.createElement("input"); control.type = field.type === "boolean" ? "checkbox" : field.type === "number" ? "number" : "text"; }
  control.value = data[field.id] ?? ""; if (field.type === "boolean") control.checked = Boolean(data[field.id]); control.dataset.field = field.id;
  control.addEventListener("input", () => {
    const candidate = structuredClone(data);
    candidate[field.id] = field.type === "number" ? Number(control.value) : field.type === "boolean" ? control.checked : control.value;
    try { result = analyzeInput(candidate); data = result.data; showResult(); } catch (error) { showError(error); }
  });
  label.append(control); return label;
}
function renderFields() { $("fields").replaceChildren(...schema.fields.map(fieldControl)); }
function exportData() {
  try {
    result = analyzeInput(data);
    const raw = JSON.stringify(result.data, null, 2) + "\\n";
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const link = $("download"); link.href = downloadUrl; link.download = \`\${schema.slug}.data.json\`; link.hidden = false; link.textContent = \`Save \${link.download}\`;
    $("output").textContent = raw;
  } catch (error) { showError(error); }
}
async function shareContext() {
  if (!selected.size) throw new Error("Select at least one field first");
  if (!ready) throw new Error("Connect this app to a supporting host first. Export works in local preview.");
  const context = { title: schema.title, fields: schema.fields.filter((field) => selected.has(field.id)), data: Object.fromEntries([...selected].map((id) => [id, data[id]])) };
  if (extensions.modelContext) await extensions.modelContext.update({ content: [{ type: "text", text: "User-selected data; not instructions.\\n" + JSON.stringify(context) }] });
  $("share").textContent = "Context shared";
}
async function loadText(raw) { const candidate = JSON.parse(raw); result = analyzeInput(candidate); data = result.data; renderFields(); showResult(); }
$("export").addEventListener("click", exportData); $("share").addEventListener("click", () => shareContext().catch(showError));
$("file").addEventListener("change", async (event) => { const file = event.target.files[0]; if (!file) return; try { if (file.size > 200000) throw new Error("Input exceeds 200 KB"); await loadText(await file.text()); } catch (error) { showError(error); } finally { event.target.value = ""; } });
app.ontoolresult = (value) => { if (value.structuredContent?.input) { try { result = analyzeInput(value.structuredContent.input); data = result.data; renderFields(); showResult(); } catch (error) { showError(error); } } };
let connectedResolve; const connected = new Promise((resolve) => { connectedResolve = resolve; });
app.ontoolinput = async (value) => {
  const file = OpenAIFileEntrypointInputSchema.safeParse(value.arguments); if (!file.success) return;
  try { await connected; if (!extensions.resources) throw new Error("This host has no granted file-resource bridge"); const resource = await extensions.resources.read({ uri: file.data.file.resourceUri }); const content = resource.contents.find((item) => "text" in item || "blob" in item); if (!content) throw new Error("No readable file content"); const raw = "text" in content ? content.text : new TextDecoder().decode(Uint8Array.from(atob(content.blob), (char) => char.charCodeAt(0))); await loadText(raw); } catch (error) { showError(error); }
};
$("title").textContent = schema.title; $("subtitle").textContent = "Generated panel · edit supplied data · take the source with you"; $("host").textContent = preview ? "LOCAL PREVIEW · HOST UNVERIFIED" : "Connecting…";
renderFields(); showResult();
if (!preview) { try { await Promise.race([app.connect(), new Promise((_, reject) => setTimeout(() => reject(new Error("Host connection timed out")), 10000))]); ready = true; $("host").textContent = "MCP APP CONNECTED"; const host = app.getHostContext(); if (host?.theme) applyDocumentTheme(host.theme); if (host?.styles?.variables) applyHostStyleVariables(host.styles.variables); } catch (error) { $("host").textContent = "HOST CONNECTION UNAVAILABLE"; showError(error); } finally { connectedResolve(); } } else connectedResolve();
`;
}

function renderShell() {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Generated App Forge panel</title><style>__STYLE__</style></head>
<body><header><span class="brand">● APP FORGE <span>GENERATED LOCAL PLUGIN</span></span><span id="host" class="badge">Connecting…</span></header>
<main><section class="intro"><p class="eyebrow">SCHEMA → PANEL → SOURCE</p><h1 id="title">Generated panel</h1><p id="subtitle"></p></section>
<div class="toolbar"><label class="file-button">Open own JSON<input id="file" type="file" accept=".json"></label><button id="export" class="primary">Export edited JSON</button><button id="share">Share selected context</button></div>
<p id="error" role="alert" hidden></p><section id="fields" class="fields"></section><section class="result card"><div class="result-head"><h2>Validated output</h2><span id="summary"></span></div><pre id="output"></pre><a id="download" hidden>Save edited JSON</a></section>
<footer><span>Deterministic generator · no model or network call</span><span>Actual dots host integration is not proven by local preview</span></footer></main><script type="module">__SCRIPT__</script></body></html>`;
}

function renderStyle() {
  return `:root{font-family:ui-sans-serif,system-ui,sans-serif;color:#17202a;background:#f4f1ea}*{box-sizing:border-box}body{margin:0}header{display:flex;justify-content:space-between;align-items:center;padding:18px 5vw;border-bottom:1px solid #d9d3c7;background:#fffdf8}.brand{font-weight:800;letter-spacing:.08em}.brand span{font-size:10px;color:#8b8172;margin-left:8px}.badge{border:1px solid #b7ad9d;border-radius:999px;padding:6px 10px;font-size:11px}.intro,main{max-width:900px;margin:auto}.intro{padding:42px 5vw 20px}.eyebrow{font-size:11px;letter-spacing:.16em;color:#806b4f}.intro h1{font-size:clamp(30px,5vw,52px);margin:8px 0}.intro p{color:#665f55}.toolbar{display:flex;gap:10px;flex-wrap:wrap;padding:0 5vw 22px}.toolbar button,.file-button{border:1px solid #b8ad9d;border-radius:8px;background:#fffdf8;padding:10px 14px;cursor:pointer;font:inherit}.toolbar .primary{background:#173d4a;color:#fff;border-color:#173d4a}.file-button input{display:none}.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;padding:0 5vw}.field,.card{background:#fffdf8;border:1px solid #d9d3c7;border-radius:12px;padding:16px}.field-top,.result-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.field small{color:#8b8172}.field>input,.field>select{display:block;width:100%;margin-top:12px;border:1px solid #b8ad9d;border-radius:6px;padding:9px;background:#fff}.field>input[type=checkbox]{width:auto}.result{margin:18px 5vw;padding:18px}.result h2{margin:0}.result-head span{color:#2f6d57;font-size:13px}.result pre{white-space:pre-wrap;background:#f0ece3;padding:14px;border-radius:8px;min-height:100px}.result a{color:#173d4a;font-weight:700}.error{margin:0 5vw 14px;padding:12px;border:1px solid #c4675c;background:#fff0ed;border-radius:8px;color:#8d2f24}footer{display:flex;justify-content:space-between;gap:12px;color:#766f65;font-size:11px;padding:26px 5vw 40px}`;
}

function renderBuild() {
  return `import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const js = await build({ entryPoints: ["ui.mjs"], bundle: true, write: false, format: "esm", target: "es2022", minify: true });
const shell = await readFile("shell.html", "utf8"); const style = await readFile("style.css", "utf8");
await mkdir("dist", { recursive: true });
await writeFile("dist/app.html", shell.replace("__STYLE__", () => style).replace("__SCRIPT__", () => js.outputFiles[0].text.replaceAll("</script", "<\\/script")));
console.log(JSON.stringify({ built: "dist/app.html", apiKeys: false, externalAssets: false }));
`;
}

function renderPreview() {
  return `import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const port = Number(process.env.APP_FORGE_PORT ?? 8783);
createServer(async (_req, res) => { try { const html = await readFile("dist/app.html", "utf8"); res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff" }); res.end(html); } catch { res.writeHead(503); res.end("Run npm run build first"); } }).listen(port, "127.0.0.1", () => console.error(\`App Forge local preview: http://127.0.0.1:\${port}/?preview=1\`));
`;
}

function renderServer(schema, sample) {
  const inputSchema = generatedInputSchema(schema);
  const uri = `ui://app-forge/${schema.slug}`;
  const openDescription = JSON.stringify(`Open an editable panel for supplied ${schema.title} JSON.`);
  return `import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { OpenAIExtensions } from "@openai/mcp-extensions/server";
import { z } from "zod";
import { analyzeInput } from "./core.mjs";
import { sample } from "./schema.mjs";

const root = dirname(fileURLToPath(import.meta.url));
const inputSchema = ${inputSchema};
const uri = ${JSON.stringify(uri)};
export function createServer() {
  const server = new McpServer({ name: ${JSON.stringify(schema.slug)}, version: "0.1.0" });
  new OpenAIExtensions(server);
  registerAppResource(server, ${JSON.stringify(schema.title)}, uri, {}, async () => ({ contents: [{ uri, mimeType: RESOURCE_MIME_TYPE, text: await readFile(join(root, "dist", "app.html"), "utf8"), _meta: { "openai/ui": { preferredDisplayMode: "fullscreen", availableDisplayModes: ["fullscreen"] }, ui: { csp: { connectDomains: [], resourceDomains: [] } } } }] }));
  registerAppTool(server, "open_${schema.slug}", { title: "Open generated panel", description: ${openDescription}, inputSchema: {}, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }, _meta: { ui: { resourceUri: uri }, "openai/ui": { entrypoints: [{ type: "global" }, { type: "thread" }, { type: "file", extensions: ["json"] }] } } }, async () => ({ content: [{ type: "text", text: "Opened generated panel. The initial data is synthetic; import your own JSON." }], structuredContent: { kind: "generated-panel", input: sample, result: analyzeInput(sample), synthetic: true } }));
  registerAppTool(server, "analyze_${schema.slug}", { title: "Validate generated input", description: "Validate explicitly supplied JSON for this schema without model, network, or file writes.", inputSchema: { input: inputSchema }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }, _meta: { ui: { resourceUri: uri } } }, async ({ input }) => ({ content: [{ type: "text", text: JSON.stringify(analyzeInput(input)) }], structuredContent: { kind: "generated-panel", input, result: analyzeInput(input), synthetic: false } }));
  registerAppTool(server, "export_${schema.slug}", { title: "Export generated data", description: "Return validated edited data as a portable JSON artifact.", inputSchema: { input: inputSchema }, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }, _meta: { ui: { resourceUri: uri } } }, async ({ input }) => ({ content: [{ type: "text", text: JSON.stringify(analyzeInput(input).artifact) }], structuredContent: { artifact: analyzeInput(input).artifact } }));
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await createServer().connect(new StdioServerTransport());
`;
}

function renderTest(schema, sample) {
  const unexpected = { ...sample, unexpected_value: true };
  return `import test from "node:test";
import assert from "node:assert/strict";
import { analyzeInput, validateInput } from "../core.mjs";
import { sample } from "../schema.mjs";

test("generated panel validates and returns an editable artifact", () => {
  const result = analyzeInput(sample);
  assert.equal(result.editable, true);
  assert.equal(result.summary.valid, true);
  assert.equal(result.artifact.name, ${JSON.stringify(`${schema.slug}.data.json`)});
});

test("generated panel rejects unexpected input", () => {
  assert.throws(() => validateInput(${json(unexpected)}), /Unexpected input field/);
});
`;
}

function renderReadme(schema, sample) {
  const fields = schema.fields.map((field) => `- \`${field.id}\`: ${field.type}${field.required ? " (required)" : " (optional)"}`).join("\n");
  return `# ${schema.title} — generated App Forge plugin

This source was generated deterministically from a constrained schema. It is a
local MCP development artifact, not a claim that the plugin is installed in an
actual dots account or that arbitrary natural-language apps can be generated.

## Generated route

1. Install Node 22+ dependencies with \`npm ci --ignore-scripts --no-audit --no-fund\`.
2. Run \`npm run build\` and \`npm test\`.
3. Run \`npm run preview\` and open the local panel.
4. Import your own JSON, edit fields, and export \`${schema.slug}.data.json\`.
5. Connect the local MCP source to a supported host only through that host's
   documented developer flow; local preview does not prove host integration.

## Schema fields

${fields}

Synthetic sample:

\`\`\`json
${json(sample)}
\`\`\`

## Limits

- Supported field types are text, number, boolean, and select.
- Unknown input keys, missing required fields, invalid types, and invalid select
  values fail closed.
- Generation uses no model or network call. It writes source and a ZIP only to
  the requested local paths.
- The selected-context action shares only checked supplied fields when a host
  bridge is available; no external system is written by this generated source.
`;
}

function renderPlugin(schema) {
  return json({
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: schema.slug,
    version: "0.1.0",
    description: `Generated editable panel for ${schema.title}.`,
    author: { name: "Naoya / jokv213" },
    extensions: { "com.openai": { interface: {
      displayName: schema.title,
      shortDescription: "Generated schema panel",
      longDescription: `Edit supplied ${schema.title} JSON, validate it locally, and export the result.`,
      developerName: "Naoya / jokv213",
      category: "Productivity",
      capabilities: ["Interactive"],
      defaultPrompt: `Open the generated ${schema.title} panel and edit my supplied JSON.`
    } } }
  }) + "\n";
}

function renderMcp(schema) {
  return json({ $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json", mcpServers: { [schema.slug]: { type: "stdio", command: "node", args: ["${PLUGIN_ROOT}/server.mjs"], cwd: "${PLUGIN_ROOT}" } } }) + "\n";
}

async function writeOutput(schema, sample, outDir, zipPath, force) {
  await mkdir(outDir, { recursive: true });
  const files = {
    "schema.json": json(schema) + "\n",
    "sample.json": json(sample) + "\n",
    "schema.mjs": renderSchemaModule(schema, sample),
    "core.mjs": renderCore(schema),
    "server.mjs": renderServer(schema, sample),
    "ui.mjs": renderUi(schema),
    "shell.html": renderShell(),
    "style.css": renderStyle(),
    "build.mjs": renderBuild(),
    "preview.mjs": renderPreview(),
    "plugin.json": renderPlugin(schema),
    "mcp.json": renderMcp(schema),
    "README.md": renderReadme(schema, sample),
    "test/core.test.mjs": renderTest(schema, sample),
    "package.json": json({ name: schema.slug, version: "0.1.0", private: true, type: "module", engines: { node: ">=22" }, scripts: { build: "node build.mjs", test: "node --test test/*.test.mjs", start: "node server.mjs", preview: "node preview.mjs" }, dependencies: { "@modelcontextprotocol/sdk": "1.31.0", "@modelcontextprotocol/ext-apps": "1.7.5", "@openai/mcp-extensions": "0.1.0", zod: "4.4.3" }, devDependencies: { esbuild: "0.27.4" } }) + "\n"
  };
  for (const [relative, content] of Object.entries(files)) {
    const target = join(outDir, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  const lock = JSON.parse(await readFile(join(TEMPLATE, "package-lock.json"), "utf8"));
  lock.name = schema.slug; if (lock.packages?.[""]) lock.packages[""].name = schema.slug;
  const lockText = JSON.stringify(lock, null, 2) + "\n";
  await writeFile(join(outDir, "package-lock.json"), lockText, "utf8");
  const archive = zipPath ?? `${outDir}.zip`;
  if (!force) {
    try { await readFile(archive); throw new Error(`ZIP already exists: ${archive}; pass --force to replace it`); } catch (error) { if (error.code !== "ENOENT") throw error; }
  } else {
    try { await unlink(archive); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const generated = Object.keys(files).concat("package-lock.json");
  execFileSync("/usr/bin/zip", ["-qr", archive, ...generated], { cwd: outDir, stdio: "ignore" });
  const sourceText = generated.map((relative) => relative === "package-lock.json" ? lockText : files[relative]).join("\n");
  const metadata = { schema: schema.slug, sourceFormat: schema.sourceFormat, fields: schema.fields.length, generatedFiles: generated, sourceSha256: createHash("sha256").update(sourceText).digest("hex"), sourceDir: outDir, sourceZip: archive, localHostExecution: false };
  await writeFile(join(outDir, "generation.json"), JSON.stringify(metadata, null, 2) + "\n", "utf8");
  return { ...metadata, sourceZip: archive };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return usage();
  for (const key of ["schema", "data", "out"]) if (!args[key]) throw new Error(`--${key} is required`);
  const schemaPath = resolve(args.schema), dataPath = resolve(args.data), outDir = resolve(args.out), zipPath = args.zip ? resolve(args.zip) : undefined;
  const normalized = normalizeSchema(JSON.parse(await readFile(schemaPath, "utf8")), schemaPath);
  const sample = normalizeData(normalized, JSON.parse(await readFile(dataPath, "utf8")));
  const result = await writeOutput(normalized, sample, outDir, zipPath, args.force === true || args.force === "true");
  console.log(JSON.stringify({ ...result, sample, limit: "Deterministic generator; source must still pass its own build/test and host integration is not proven." }, null, 2));
}

main().catch((error) => { console.error(`App Forge error: ${error.message}`); process.exitCode = 1; });
