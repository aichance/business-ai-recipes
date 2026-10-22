import test from 'node:test';
import assert from 'node:assert/strict';
import { createChallenge, question, receiptSchema } from '../lib/protocol.mjs';
import { TurnObservation } from '../lib/observation.mjs';
import { DISABLED_FEATURES, probeConfig, threadParams, checkRestrictedConfig, runProcess } from '../lib/codex.mjs';

const event = (method, extra = {}) => ({method, params: {threadId: 'thread', turnId: 'turn', turn: {id: 'turn', status: 'completed'}, ...extra}});
const message = event('item/completed', {item: {id: 'm', type: 'agentMessage', text: '{}'}});

test('ordered turn receipt requires start before response before completion', () => {
  const valid = new TurnObservation('thread');
  [event('turn/started'), message, event('turn/completed')].forEach((e) => valid.accept(e));
  assert.equal(valid.result.completed, true);
  assert.equal(valid.result.protocol_error, false);
  for (const sequence of [
    [event('turn/completed'), message, event('turn/started')],
    [message, event('turn/started'), event('turn/completed')],
    [event('turn/started'), event('turn/completed'), message],
    [event('turn/started'), message, event('turn/completed'), event('turn/started')],
  ]) {
    const o = new TurnObservation('thread');
    sequence.forEach((e) => o.accept(e));
    assert.equal(o.result.protocol_error, true);
  }
});

test('wrong turn, failed turn and tool retrieval cannot produce a clean receipt', () => {
  const o = new TurnObservation('thread');
  o.accept(event('turn/started'));
  o.accept(event('item/started', {item: {id: 'tool', type: 'commandExecution'}}));
  o.accept(event('item/completed', {item: {id: 'tool', type: 'commandExecution'}}));
  o.accept(message);
  o.accept(event('turn/completed', {turn: {id: 'turn', status: 'failed'}}));
  assert.equal(o.result.tool_calls, 1);
  assert.equal(o.result.completed, false);
  o.accept(event('item/completed', {turnId: 'another'}));
  assert.equal(o.result.protocol_error, true);
});

test('all configured MCP names disabled without copying their credentials', () => {
  const config = probeConfig({mcp_servers: {'some.server': {url: 'private', token: 'do-not-copy'}, 'quoted"server': {command: 'private'}}});
  assert.equal(config.mcp_servers['some.server'].enabled, false);
  assert.equal(config.mcp_servers['quoted"server'].enabled, false);
  assert(!JSON.stringify(config).includes('do-not-copy'));
  assert(!JSON.stringify(config).includes('private'));
  for (const feature of DISABLED_FEATURES) assert.equal(config.features[feature], false);
  const effective = {features: Object.fromEntries(DISABLED_FEATURES.map((key) => [key, false])), mcp_servers: {one: {enabled: false}}};
  checkRestrictedConfig(effective);
  assert.throws(() => checkRestrictedConfig({...effective, mcp_servers: {one: {enabled: true}}}));
  assert.throws(() => checkRestrictedConfig({...effective, features: {...effective.features, apps: true}}));
});

test('thread uses required model/effort/read-only, no model fallback, no canary in RPC params', () => {
  const c = createChallenge();
  const p = threadParams('/synthetic/project', {});
  assert.equal(p.model, 'gpt-6.1-sol');
  assert.equal(p.allowProviderModelFallback, false);
  assert.equal(p.config.model_reasoning_effort, 'max');
  assert.equal(p.sandbox, 'read-only');
  assert.equal(p.ephemeral, true);
  assert(!JSON.stringify([p, question(c), receiptSchema(c)]).includes(c.markers[0].expected));
});

test('process timeout is bounded and does not silently retry', async () => {
  const result = await runProcess(process.execPath, ['-e', 'setInterval(()=>{}, 1000)'], {timeoutMs: 200});
  assert.equal(result.timeout, true);
  assert(result.duration_ms < 3000);
});
