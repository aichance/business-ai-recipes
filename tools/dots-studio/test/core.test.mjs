import test from "node:test";
import assert from "node:assert/strict";
import { analyzeEvidence, analyzeRun, analyzeScenario, parseCSV, selectionContext, replayPack } from "../core.mjs";
import { evidence, run, csv } from "../examples.mjs";

test("scenario preserves exact baseline sums and recomputes changed assumptions", () => {
  const base = analyzeScenario({ csv });
  assert.equal(base.baseline.revenueCents, 971700);
  assert.equal(base.baseline.costCents, 285000);
  assert.equal(base.baseline.marginCents, 686700);
  assert.equal(base.deltaMarginCents, 0);
  const changed = analyzeScenario({ csv, priceDelta: 10, unitsDelta: -20 });
  assert.notEqual(changed.scenario.marginCents, base.baseline.marginCents);
  assert.equal(changed.baseline.marginCents, base.baseline.marginCents);
  assert.equal(changed.adjusted[0].units, 96);
  assert.equal(changed.adjusted[0].priceCents, 3190);
});
test("a different user CSV reproduces three branches, including a loss", () => {
  const own = 'name,unit_price,unit_cost,units\r\n"One, quoted",0.10,0.20,3\r\nTwo,2.50,1.01,10\r\n';
  for (const [priceDelta, unitsDelta] of [[0, 0], [25, -30], [-80, 100]]) {
    const pack = { schemaVersion: 1, kind: "scenario", input: { csv: own, priceDelta, unitsDelta }, selectedIds: ["row-2"] };
    assert.deepEqual(replayPack(JSON.parse(JSON.stringify(pack))).result, analyzeScenario(pack.input));
  }
  assert.equal(parseCSV(own)[0].name, "One, quoted");
  assert(analyzeScenario({ csv: own, priceDelta: -80, unitsDelta: 100 }).scenario.marginCents < 0);
});
test("bad CSV, nonfinite numbers and out-of-range inputs fail explicitly", () => {
  for (const bad of ['name,unit_price,unit_cost,units\nx,NaN,1,2', 'name,unit_price,unit_cost,units\nx,1.001,1,2', 'name,unit_price,unit_cost,units\nx,1,1,-2', 'name,unit_price,unit_cost,units\n"x,1,1,2', 'name,unit_price,unit_cost,units\n"x"oops,1,1,2']) assert.throws(() => analyzeScenario({ csv: bad }));
  assert.throws(() => analyzeScenario({ csv, priceDelta: Infinity }));
  assert.throws(() => analyzeScenario({ csv, unitsDelta: 101 }));
  assert.throws(() => analyzeScenario({ csv: "a,b,c\n1,2,3" }));
  const large = "name,unit_price,unit_cost,units\n" + "Large,9999999.00,4900000.00,900000\n".repeat(10);
  assert.throws(() => analyzeScenario({ csv: large, priceDelta: -80, unitsDelta: 100 }), /exact integer/);
});
test("evidence distinguishes no source, missing reference, and linked excerpt", () => {
  const r = analyzeEvidence(evidence);
  assert.equal(r.summary.linked, 2); assert.equal(r.summary.needsEvidence, 2);
  assert.equal(r.claims[1].status, "unlinked"); assert.equal(r.claims[3].status, "broken-link");
  assert.match(r.limit, /does not mean fact-checked/);
  const selected = selectionContext("evidence", r, ["speed"]);
  assert.equal(selected.structuredContent.selected.length, 1);
  assert.deepEqual(selected.structuredContent.sources.map((s) => s.id), ["local-run"]);
  assert(!selected.content[0].text.includes("ten external users"));
});
test("replacing a source changes only its referenced evidence and rejects unsafe URLs", () => {
  const own = structuredClone(evidence); own.sources[0].excerpt = "The second source version records a failure.";
  const r = analyzeEvidence(own);
  assert.equal(r.sources[0].excerpt, own.sources[0].excerpt);
  assert.equal(r.sources[1].excerpt, evidence.sources[1].excerpt);
  own.sources[0].url = "javascript:alert(1)"; assert.throws(() => analyzeEvidence(own));
  const duplicate = structuredClone(evidence); duplicate.sources.push(duplicate.sources[0]); assert.throws(() => analyzeEvidence(duplicate));
});
test("run validates transitions before replaying prefixes", () => {
  const r = analyzeRun(run);
  assert.equal(r.steps[2].status, "failure"); assert.equal(r.steps[3].status, "blocked");
  const early = analyzeRun(run, 15);
  assert.equal(early.steps[1].status, "running"); assert.equal(early.summary.failure, 0);
  const invalid = structuredClone(run); invalid.events.push({ step: "publish", at: 40, type: "start" });
  assert.throws(() => analyzeRun(invalid, 1), /dependencies/);
});
test("run rejects cycles, unknown dependencies and impossible event orders", () => {
  let r = structuredClone(run); r.steps[0].dependsOn = ["publish"]; assert.throws(() => analyzeRun(r), /Cyclic/);
  r = structuredClone(run); r.steps[0].dependsOn = ["missing"]; assert.throws(() => analyzeRun(r), /Unknown/);
  r = structuredClone(run); r.events[0].type = "success"; assert.throws(() => analyzeRun(r), /running/);
  r = structuredClone(run); r.events[2].at = 1; assert.throws(() => analyzeRun(r), /chronological/);
});
test("repair packs keep different run outcomes, exact prefixes and selected scope", () => {
  const r = structuredClone(run); r.events[5].type = "success";
  const pack = (input) => ({ schemaVersion: 1, kind: "run", input, selectedIds: ["verify"], cursor: 39 });
  assert.equal(replayPack(pack(run)).context.structuredContent.selected[0].status, "failure");
  assert.equal(replayPack(pack(r)).context.structuredContent.selected[0].status, "success");
  assert.throws(() => replayPack({ ...pack(run), cursor: -1 }));
  assert.throws(() => replayPack({ ...pack(run), cursor: 999 }), /duration/);
  assert.throws(() => replayPack({ ...pack(run), selectedIds: ["verify", "verify"] }), /unique/);
  assert.throws(() => replayPack({ ...pack(run), selectedIds: ["unknown"] }));
  assert.throws(() => replayPack({ ...pack(run), selectedIds: [] }));
});
test("large evidence selection asks for a smaller selection instead of sending an oversized context", () => {
  const own = { title: "Large input", claims: [], sources: [] };
  for (let i = 0; i < 20; i++) {
    own.claims.push({ id: `c${i}`, text: `Claim ${i}`, sourceIds: [`s${i}`] });
    own.sources.push({ id: `s${i}`, title: `Source ${i}`, url: "https://example.com", excerpt: "x".repeat(2000) });
  }
  const result = analyzeEvidence(own);
  assert.throws(() => selectionContext("evidence", result, own.claims.map((c) => c.id)), /24 KB/);
  assert.equal(selectionContext("evidence", result, ["c0"]).structuredContent.sources.length, 1);
});
test("replay preserves the user's evidence decision and recomputes next checks without trusting saved prose", () => {
  const pack = { schemaVersion: 1, kind: "evidence", input: evidence, selectedIds: ["adoption"], decisions: { adoption: "needs-check" }, nextChecks: [{ check: "A fabricated saved instruction" }] };
  const c = replayPack(pack).context.structuredContent;
  assert.equal(c.nextChecks[0].decision, "needs-check");
  assert.match(c.nextChecks[0].check, /Attach a source/);
  assert(!JSON.stringify(c).includes("fabricated"));
  assert.throws(() => replayPack({ ...pack, decisions: { adoption: "auto-approved" } }));
  assert.throws(() => replayPack({ ...pack, decisions: { unknown: "unreviewed" } }), /unknown/);
});
