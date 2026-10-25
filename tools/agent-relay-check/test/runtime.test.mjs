import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../cli.mjs';
import { createChallenge } from '../lib/protocol.mjs';
import { DISABLED_FEATURES, runtimeSettings, runCodex } from '../lib/codex.mjs';

test('runtime defaults are unchanged; invalid selectors fail without coercion', () => {
  assert.deepEqual(runtimeSettings(), {model: 'gpt-6.1-sol', effort: 'max'});
  assert.deepEqual(runtimeSettings({model: 'offline-fixture/model-1', effort: 'fixture_effort'}),
    {model: 'offline-fixture/model-1', effort: 'fixture_effort'});
  for (const model of ['', ' leading', 'trailing ', 'line\nbreak', '--option', 'x'.repeat(129), null, 42]) {
    assert.throws(() => runtimeSettings({model}), /Model must/);
  }
  for (const effort of ['', 'MAX', ' max', 'max\n', 'x'.repeat(33), null, 42]) {
    assert.throws(() => runtimeSettings({effort}), /Effort must/);
  }
});

test('selectors are run-only and validated before filesystem or process effects', async t => {
  const root = await mkdtemp(join(tmpdir(), 'relay-cli-options-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  for (const command of ['prepare', 'inspect', 'compare']) {
    for (const flag of ['--model', '--effort']) {
      await assert.rejects(main([command, flag, 'offline-fixture']), /Unknown command or option/);
    }
  }
  const out = join(root, 'result');
  const args = ['run', '--project', join(root, 'missing-project'), '--challenge', join(root, 'missing.json'), '--out', out];
  await assert.rejects(main([...args, '--model', 'offline-fixture']), /explicit --live/);
  await assert.rejects(main([...args, '--live', '--model', 'bad\nmodel']), /Model must/);
  await assert.rejects(main([...args, '--live', '--effort', 'BAD']), /Effort must/);
  await assert.rejects(stat(out), {code: 'ENOENT'});
  await assert.rejects(runCodex({project: root, challenge: createChallenge(), binary: join(root, 'does-not-exist'), model: ''}), /Model must/);
});

// A local stdio fixture, not an installed Codex, provider, availability query
// or alternate-model test. It exercises the real adapter/process boundary.
async function fixture(t, options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'relay-runtime-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  await writeFile(join(root, 'package.json'), '{"type":"module"}\n');
  const project = join(root, 'project'); await mkdir(project);
  const challenge = createChallenge();
  const binary = join(root, 'offline-codex.js');
  const code = `#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const log = fileURLToPath(new URL('./requests.jsonl', import.meta.url));
const record = value => appendFileSync(log, JSON.stringify(value) + '\\n');
record({launch: process.argv.slice(2)});
if (process.argv.includes('--version')) { console.log('codex-cli 0.164.0'); process.exit(0); }
const options = ${JSON.stringify(options)};
const features = ${JSON.stringify(Object.fromEntries(DISABLED_FEATURES.map(k => [k, false])))};
const flag = process.argv.find(x => x.startsWith('model_reasoning_effort='));
const effort = flag ? JSON.parse(flag.slice('model_reasoning_effort='.length)) : 'max';
const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
const lines = createInterface({input: process.stdin});
lines.on('line', line => {
  const r = JSON.parse(line); record(r);
  if (r.id === undefined) return;
  let result = {};
  if (r.method === 'config/read') result = {config: {features, model_reasoning_effort: effort,
    mcp_servers: {private_fixture: flag ? {enabled: false} : {enabled: true, url: 'PRIVATE-CONFIG', token: 'PRIVATE-CREDENTIAL'}}}};
  if (r.method === 'thread/start') result = {model: options.wrongModel ? 'COERCED-PRIVATE-MODEL' : r.params.model,
    reasoningEffort: options.wrongEffort ? 'COERCED-PRIVATE-EFFORT' : r.params.config.model_reasoning_effort,
    sandbox: {type: 'readOnly'}, approvalPolicy: 'never', thread: {id: 'offline-fresh'}};
  if (r.method === 'turn/start') {
    if (options.rejectTurn) { send({id: r.id, error: {code: -32000, message: 'PRIVATE-PROVIDER-ERROR'}}); return; }
    send({method: 'turn/started', params: {threadId: 'offline-fresh', turn: {id: 'offline-turn', status: 'inProgress'}}});
    send({id: r.id, result: {turn: {id: 'offline-turn'}}});
    send({method: 'item/completed', params: {threadId: 'offline-fresh', turnId: 'offline-turn',
      item: {id: 'answer', type: 'agentMessage', text: ${JSON.stringify(JSON.stringify({challenge_id: challenge.challenge_id, values: Object.fromEntries(challenge.markers.map(m => [m.key, m.expected]))}))}}}});
    send({method: 'turn/completed', params: {threadId: 'offline-fresh', turn: {id: 'offline-turn', status: 'completed'}}});
    return;
  }
  send({id: r.id, result});
});
`;
  await writeFile(binary, code, {mode: 0o700});
  const requests = async () => (await readFile(join(root, 'requests.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  return {project, challenge, binary, requests};
}

test('stdio transport carries one explicit selection to startup, thread, turn and report', async t => {
  for (const settings of [undefined, {model: 'offline-fixture/model-1', effort: 'fixture_effort'}]) {
    const f = await fixture(t);
    const selected = runtimeSettings(settings);
    const report = await runCodex({...f, ...selected, timeoutMs: 10000});
    assert.equal(report.status, 'RECEIVED');
    assert.equal(report.execution.model_requested, selected.model);
    assert.equal(report.execution.model_observed, selected.model);
    assert.equal(report.execution.effort_requested, selected.effort);
    assert.equal(report.execution.effort_observed, selected.effort);
    assert.equal(report.execution.cleanup_confirmed, true);
    assert.equal(report.execution.tool_calls, 0);
    const records = await f.requests();
    const launches = records.filter(r => r.launch);
    assert.equal(launches.length, 3); // one version check, two app servers; no retries
    assert(launches[2].launch.includes(`model_reasoning_effort=${JSON.stringify(selected.effort)}`));
    assert(launches[2].launch.includes(`model=${JSON.stringify(selected.model)}`));
    const thread = records.filter(r => r.method === 'thread/start');
    const turns = records.filter(r => r.method === 'turn/start');
    assert.equal(thread.length, 1); assert.equal(turns.length, 1);
    assert.equal(thread[0].params.model, selected.model);
    assert.equal(thread[0].params.config.model_reasoning_effort, selected.effort);
    assert.equal(thread[0].params.allowProviderModelFallback, false);
    assert.equal(thread[0].params.ephemeral, true);
    assert.equal(thread[0].params.approvalPolicy, 'never');
    assert.equal(thread[0].params.sandbox, 'read-only');
    assert.equal(thread[0].params.config.mcp_servers.private_fixture.enabled, false);
    for (const feature of DISABLED_FEATURES) assert.equal(thread[0].params.config.features[feature], false);
    assert.equal(turns[0].params.model, selected.model);
    assert.equal(turns[0].params.effort, selected.effort);
    for (const secret of ['PRIVATE-CONFIG', 'PRIVATE-CREDENTIAL', ...f.challenge.markers.map(m => m.expected)]) {
      assert(!JSON.stringify(records).includes(secret));
      assert(!JSON.stringify(report).includes(secret));
    }
    assert(!records.some(r => r.method === 'model/list'));
  }
});

test('coerced settings stop before inference; provider rejection is redacted and never retried', async t => {
  for (const options of [{wrongModel: true}, {wrongEffort: true}, {rejectTurn: true}]) {
    const f = await fixture(t, options);
    const report = await runCodex({...f, model: 'offline-fixture/model-1', effort: 'fixture_effort', timeoutMs: 10000});
    assert.equal(report.status, 'INCONCLUSIVE');
    assert.equal(report.diagnostic, options.rejectTurn ? 'rpc_error' : 'requested_execution_settings_not_honored');
    assert.equal(report.execution.cleanup_confirmed, true);
    const records = await f.requests();
    assert.equal(records.filter(r => r.launch).length, 3);
    assert.equal(records.filter(r => r.method === 'turn/start').length, options.rejectTurn ? 1 : 0);
    for (const secret of ['PRIVATE-PROVIDER-ERROR', 'COERCED-PRIVATE-MODEL', 'COERCED-PRIVATE-EFFORT']) assert(!JSON.stringify(report).includes(secret));
  }
});
