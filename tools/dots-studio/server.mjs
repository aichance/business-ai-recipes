import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { OpenAIExtensions } from "@openai/mcp-extensions/server";
import { z } from "zod";
import { analyzeEvidence, analyzeRun, analyzeScenario, EvidenceSchema, RunSchema, ScenarioSchema } from "./core.mjs";
import { evidence, run, csv } from "./examples.mjs";

const root = dirname(fileURLToPath(import.meta.url));
export function createServer() {
  const server = new McpServer({ name: "dots-studio", version: "0.1.0" });
  new OpenAIExtensions(server);
  const views = [
    { kind: "scenario", label: "Scenario Lab", extensions: ["csv", "scenario"], schema: ScenarioSchema,
      compute: analyzeScenario, example: { csv, priceDelta: 0, unitsDelta: 0 } },
    { kind: "evidence", label: "Evidence Canvas", extensions: ["evidence"], schema: EvidenceSchema,
      compute: analyzeEvidence, example: evidence },
    { kind: "run", label: "Run Lens / Repair Pack", extensions: ["dotrun"], schema: RunSchema,
      compute: analyzeRun, example: run },
  ];
  for (const view of views) {
    const uri = `ui://dots-studio/${view.kind}`;
    registerAppResource(server, view.label, uri, {}, async () => ({ contents: [{
      uri, mimeType: RESOURCE_MIME_TYPE, text: await readFile(join(root, "dist", `${view.kind}.html`), "utf8"),
      _meta: { "openai/ui": { preferredDisplayMode: "fullscreen", availableDisplayModes: ["fullscreen"] },
        ui: { csp: { connectDomains: [], resourceDomains: [] } } },
    }] }));
    registerAppTool(server, `open_${view.kind}`, {
      title: `Open ${view.label}`,
      description: `Open ${view.label} with synthetic sample data. Select items, inspect changes, and export a replay pack.`,
      inputSchema: {}, annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: { ui: { resourceUri: uri }, "openai/ui": { entrypoints: [
        { type: "global" }, { type: "thread" }, { type: "file", extensions: view.extensions },
      ] } },
    }, async () => ({ content: [{ type: "text", text: `Opened ${view.label}. Initial data is synthetic; import your own file in the panel.` }],
      structuredContent: { kind: view.kind, input: view.example, result: view.compute(view.example), synthetic: true } }));
    registerAppTool(server, `analyze_${view.kind}`, {
      title: `Analyze ${view.label} input`, description: "Analyze explicitly supplied input without reading files or making network requests.",
      inputSchema: { input: view.schema },
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
      _meta: { ui: { resourceUri: uri } },
    }, async ({ input }) => {
      const result = view.compute(input);
      return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: { kind: view.kind, input, result, synthetic: false } };
    });
  }
  server.registerTool("replay_pack", {
    title: "Validate a replay pack", description: "Recompute exported conditions and selections; never execute commands from the input.",
    inputSchema: { pack: z.object({ schemaVersion: z.literal(1), kind: z.enum(["scenario", "evidence", "run"]),
      input: z.unknown(), selectedIds: z.array(z.string()).min(1).max(1000), cursor: z.number().finite().nonnegative().optional(),
      decisions: z.record(z.string(), z.enum(["unreviewed", "accepted-by-user", "rejected-by-user", "needs-check"])).optional() }) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  }, async ({ pack }) => {
    const { replayPack } = await import("./replay.mjs");
    return { content: [{ type: "text", text: JSON.stringify(replayPack(pack)) }] };
  });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await createServer().connect(new StdioServerTransport());
}
