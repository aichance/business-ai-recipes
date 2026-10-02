import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { csv } from "../examples.mjs";

test("official MCP Client discovers the extensions, HTML resources, and analyzes own input", async () => {
  const client = new Client({ name: "dots-studio-test", version: "1.0.0" });
  const root = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
  const plugin = JSON.parse(await readFile(new URL("../plugin.json", import.meta.url), "utf8"));
  const config = JSON.parse(await readFile(new URL("../mcp.json", import.meta.url), "utf8")).mcpServers[plugin.name];
  assert.equal(plugin.name, "dots-studio");
  assert(plugin.extensions["com.openai"].interface.shortDescription.length <= 30);
  assert.equal(config.type, "stdio"); assert.equal(config.command, "node");
  const transport = new StdioClientTransport({ command: config.command,
    args: config.args.map((v) => v.replaceAll("${PLUGIN_ROOT}", root)), cwd: config.cwd.replaceAll("${PLUGIN_ROOT}", root) });
  await client.connect(transport);
  try {
    const tools = await client.listTools(); assert.equal(tools.tools.length, 7);
    for (const kind of ["scenario", "evidence", "run"]) {
      const opener = tools.tools.find((v) => v.name === `open_${kind}`);
      assert(opener._meta["openai/ui"].entrypoints.some((v) => v.type === "file"));
      assert(opener._meta["openai/ui"].entrypoints.some((v) => v.type === "global"));
      const opened = await client.callTool({ name: opener.name, arguments: {} });
      assert.equal(opened.structuredContent.kind, kind); assert.equal(opened.structuredContent.synthetic, true);
      const html = await client.readResource({ uri: `ui://dots-studio/${kind}` });
      assert.equal(html.contents[0]._meta["openai/ui"].preferredDisplayMode, "fullscreen");
      assert(html.contents[0].text.includes('type="module"')); assert(!html.contents[0].text.includes("__SCRIPT__"));
    }
    const result = await client.callTool({ name: "analyze_scenario", arguments: { input: { csv, priceDelta: 10, unitsDelta: 0 } } });
    assert.equal(result.isError ?? false, false); assert(result.structuredContent.result.deltaMarginCents > 0);
    const bad = await client.callTool({ name: "analyze_scenario", arguments: { input: { csv: "wrong" } } });
    assert.equal(bad.isError, true);
    const replay = await client.callTool({ name: "replay_pack", arguments: { pack: { schemaVersion: 1, kind: "scenario", input: { csv, priceDelta: 10 }, selectedIds: ["row-2"] } } });
    assert.equal(replay.isError ?? false, false);
  } finally { await client.close(); }
});
