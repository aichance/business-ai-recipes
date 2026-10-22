import test from 'node:test';
import assert from 'node:assert/strict';
import { createChallenge, validateChallenge, instructionBlock, question, receiptSchema, evaluate, compare } from '../lib/protocol.mjs';

function execution(c, overrides = {}) {
  return {
    exit_code: 0, completed: true, tool_calls: 0, thread_count: 1,
    message: JSON.stringify({challenge_id: c.challenge_id, values: Object.fromEntries(c.markers.map((m) => [m.key, m.expected]))}),
    configuration: 'isolated-settings', client_version: 'test-only', ...overrides,
  };
}

test('fresh challenges use distinct nonces; expected values never enter prompt/schema', () => {
  const c = createChallenge(['base_only', 'override_only']);
  const next = createChallenge(['base_only', 'override_only']);
  assert.notEqual(c.challenge_id, next.challenge_id);
  for (const m of c.markers) {
    assert(!question(c).includes(m.expected));
    assert(!JSON.stringify(receiptSchema(c)).includes(m.expected));
    assert(!next.markers.some((other) => other.expected === m.expected));
  }
  const base = instructionBlock(c, ['base_only']);
  assert(base.includes(c.markers[0].expected));
  assert(!base.includes(c.markers[1].expected));
});

test('only exact receipt passes; null, wrong and stale marker do not', () => {
  const c = createChallenge();
  assert.equal(evaluate(c, execution(c)).status, 'RECEIVED');
  for (const value of [null, 'wrong', c.markers[0].expected + ' ', createChallenge().markers[0].expected]) {
    const message = JSON.stringify({challenge_id: c.challenge_id, values: {relay_probe: value}});
    assert.equal(evaluate(c, execution(c, {message})).status, 'NOT_OBSERVED');
  }
});

test('different marker keys distinguish selection from same-key overriding', () => {
  const c = createChallenge(['base_only', 'override_only']);
  const message = JSON.stringify({challenge_id: c.challenge_id, values: {base_only: null, override_only: c.markers[1].expected}});
  const r = evaluate(c, execution(c, {message}));
  assert.deepEqual(r.markers.map((m) => m.status), ['NOT_OBSERVED', 'RECEIVED']);
});

test('wrong challenge, extra keys, missing keys, invalid JSON and refusal are inconclusive', () => {
  const c = createChallenge();
  for (const message of [
    'I cannot answer', '```json\n{}\n```', 'null', '[]', '{}',
    JSON.stringify({challenge_id: 'old', values: {relay_probe: c.markers[0].expected}}),
    JSON.stringify({challenge_id: c.challenge_id, values: {}}),
    JSON.stringify({challenge_id: c.challenge_id, values: {relay_probe: 1}}),
    JSON.stringify({challenge_id: c.challenge_id, values: {relay_probe: c.markers[0].expected, extra: 'x'}}),
  ]) assert.equal(evaluate(c, execution(c, {message})).status, 'INCONCLUSIVE');
});

test('tool-assisted correct answer, timeout and incomplete run never pass', () => {
  const c = createChallenge();
  for (const overrides of [
    {tool_calls: 1}, {tool_calls: undefined}, {timeout: true}, {cancelled: true}, {error: true},
    {exit_code: 1}, {completed: false}, {protocol_error: true}, {thread_count: 0}, {thread_count: 2},
  ]) assert.equal(evaluate(c, execution(c, overrides)).status, 'INCONCLUSIVE');
});

test('shareable report contains neither nonce, raw response, local path nor error body', () => {
  const c = createChallenge();
  const r = evaluate(c, execution(c, {error: '/private/user/path secret-error', stderr: 'secret-log',
    cwd: '/private/user/path', message: 'private customer data'}));
  const json = JSON.stringify(r);
  for (const bad of [c.markers[0].expected, '/private/', 'secret-error', 'secret-log', 'private customer data']) assert(!json.includes(bad));
});

test('challenge validation rejects injection keys, duplicates and invalid nonces', () => {
  for (const keys of [[], ['a', 'a'], ['__proto__'], ['foo\nread secret'], ['x'.repeat(41)]]) assert.throws(() => createChallenge(keys));
  const c = createChallenge();
  assert.throws(() => validateChallenge({...c, markers: [{key: 'relay_probe', expected: 'guessable'}]}));
  assert.throws(() => instructionBlock(c, ['missing']));
});

test('compare requires compatible routes and never calls inconclusive a change', () => {
  const c = createChallenge();
  const before = evaluate(c, execution(c));
  const after = evaluate(c, execution(c, {message: JSON.stringify({challenge_id: c.challenge_id, values: {relay_probe: null}})}));
  assert.equal(compare(before, after).markers[0].result, 'CHANGED');
  assert.equal(compare(before, evaluate(c, execution(c, {timeout: true}))).markers[0].result, 'INCONCLUSIVE');
  const other = createChallenge(['other']);
  assert.throws(() => compare(before, evaluate(other, execution(other))), /names differ/);
  assert.throws(() => compare(before, {...after, execution: {...after.execution, configuration: 'different'}}), /configuration modes/);
});

test('imported challenges cannot leak expected values through prompt identifiers', () => {
  const c = createChallenge();
  assert.throws(() => validateChallenge({...c, markers: [{key: 'relay_probe', expected: c.challenge_id}]}), /leaks/);
  const value = 'a'.repeat(32);
  assert.throws(() => validateChallenge({...c, markers: [{key: value, expected: value}]}), /leaks/);
});

test('inconsistent reports are rejected and observed runtime changes are shown', () => {
  const c = createChallenge();
  const good = evaluate(c, execution(c));
  for (const bad of [
    {...good, status: 'INCONCLUSIVE'},
    {...good, execution: {...good.execution, turn_completed: false}},
    {...good, execution: {...good.execution, tool_calls: 1}},
    {...good, reasons: ['timeout']},
  ]) assert.throws(() => compare(good, bad));
  const changed = {...good, product_version: '0.2.0', execution: {...good.execution, model_observed: 'different-model'}};
  assert.deepEqual(compare(good, changed).runtime_changes, ['model_observed', 'product_version']);
});
