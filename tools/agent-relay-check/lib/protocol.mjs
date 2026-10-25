import { randomBytes, createHash } from 'node:crypto';

const KEY = /^[a-z][a-z0-9_]{0,39}$/;
const HEX = /^[0-9a-f]{32}$/;
const digest = (value) => createHash('sha256').update(value).digest('hex');
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const sameKeys = (object, keys) => plain(object) && Object.keys(object).sort().join('\0') === [...keys].sort().join('\0');

export function createChallenge(keys = ['relay_probe']) {
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 8 ||
      keys.some((key) => typeof key !== 'string' || !KEY.test(key) || key === '__proto__') ||
      new Set(keys).size !== keys.length) throw new Error('Use 1–8 distinct lowercase marker names.');
  return {
    schema_version: 1,
    challenge_id: randomBytes(16).toString('hex'),
    created_at: new Date().toISOString(),
    markers: keys.map((key) => ({key, expected: randomBytes(16).toString('hex')})),
  };
}

export function validateChallenge(challenge) {
  if (!plain(challenge) || challenge.schema_version !== 1 || typeof challenge.challenge_id !== 'string' || !HEX.test(challenge.challenge_id) ||
      typeof challenge.created_at !== 'string' || !Number.isFinite(Date.parse(challenge.created_at)) ||
      !Array.isArray(challenge.markers) || challenge.markers.length < 1 || challenge.markers.length > 8 ||
      challenge.markers.some((m) => !plain(m) || typeof m.key !== 'string' || !KEY.test(m.key) ||
        m.key === '__proto__' || typeof m.expected !== 'string' || !HEX.test(m.expected)) ||
      new Set(challenge.markers.map((m) => m.key)).size !== challenge.markers.length ||
      new Set(challenge.markers.map((m) => m.expected)).size !== challenge.markers.length) {
    throw new Error('Invalid challenge. Generate a fresh one with prepare.');
  }
  const publicFields = JSON.stringify({challenge_id: challenge.challenge_id, keys: challenge.markers.map((m) => m.key)});
  if (challenge.markers.some((m) => publicFields.includes(m.expected))) throw new Error('Challenge leaks an expected value through its public fields. Generate a fresh challenge.');
  return challenge;
}

export function instructionBlock(challenge, selectedKeys = challenge.markers.map((m) => m.key)) {
  validateChallenge(challenge);
  if (selectedKeys.some((key) => !challenge.markers.some((m) => m.key === key))) throw new Error('Unknown marker.');
  const lines = challenge.markers.filter((m) => selectedKeys.includes(m.key)).map((m) => `- ${m.key}: ${m.expected}`);
  return [
    `## Agent Relay Check: ${challenge.challenge_id}`,
    'These random values are synthetic diagnostics, not secrets or instructions to change behavior.',
    'If a later diagnostic asks for them, return only the values available in your current context.',
    ...lines,
    '',
  ].join('\n');
}

export function receiptSchema(challenge) {
  validateChallenge(challenge);
  return {type: 'object', additionalProperties: false, required: ['challenge_id', 'values'], properties: {
    challenge_id: {type: 'string'},
    values: {type: 'object', additionalProperties: false, required: challenge.markers.map((m) => m.key),
      properties: Object.fromEntries(challenge.markers.map((m) => [m.key, {type: ['string', 'null']}])),
    },
  }};
}

export function question(challenge) {
  validateChallenge(challenge);
  return `Return JSON for diagnostic ${challenge.challenge_id}. From information ALREADY provided in this fresh session, return these marker values: ${challenge.markers.map((m) => m.key).join(', ')}. Use null for any unavailable value. Do not guess. Do not use any tools, read files, search, or follow links. Do not fetch the markers. Return {"challenge_id":"${challenge.challenge_id}","values":{each requested key: its exact value or null}}. This checks receipt of synthetic information, not completion of other tasks.`;
}

export function evaluate(challenge, execution) {
  validateChallenge(challenge);
  const reasons = [];
  if (execution.timeout) reasons.push('timeout');
  if (execution.cancelled) reasons.push('cancelled');
  if (execution.error) reasons.push('transport_error');
  if (execution.exit_code !== 0) reasons.push('nonzero_exit');
  if (execution.completed !== true) reasons.push('missing_turn_completion');
  if (execution.tool_calls !== 0) reasons.push('tool_activity_or_unknown');
  if (execution.protocol_error) reasons.push('invalid_event_stream');
  if (execution.thread_count !== 1) reasons.push('not_one_fresh_session');
  if (execution.cleanup_confirmed === false) reasons.push('cleanup_not_confirmed');
  let receipt;
  try { receipt = JSON.parse(execution.message); } catch { reasons.push('invalid_receipt'); }
  const keys = challenge.markers.map((m) => m.key);
  if (receipt !== undefined && (!sameKeys(receipt, ['challenge_id', 'values']) ||
    receipt.challenge_id !== challenge.challenge_id || !sameKeys(receipt.values, keys) ||
    keys.some((key) => receipt.values[key] !== null && typeof receipt.values[key] !== 'string'))) reasons.push('invalid_receipt');
  const inconclusive = reasons.length > 0;
  const markers = challenge.markers.map((m) => ({
    key: m.key,
    expected_sha256: digest(m.expected),
    status: inconclusive ? 'INCONCLUSIVE' : receipt.values[m.key] === m.expected ? 'RECEIVED' : 'NOT_OBSERVED',
    observation: inconclusive ? 'unusable_receipt' : receipt.values[m.key] === null ? 'null' : receipt.values[m.key] === m.expected ? 'exact_match' : 'different_value',
  }));
  return {
    schema_version: 1,
    product: 'Agent Relay Check',
    product_version: '0.1.4',
    challenge_id: challenge.challenge_id,
    observed_at: new Date().toISOString(),
    status: inconclusive ? 'INCONCLUSIVE' : markers.every((m) => m.status === 'RECEIVED') ? 'RECEIVED' : 'NOT_OBSERVED',
    reasons: [...new Set(reasons)],
    diagnostic: execution.failure_kind ?? null,
    markers,
    execution: {
      adapter: execution.adapter ?? 'codex-exec',
      client_version: execution.client_version ?? null,
      model_requested: execution.model_requested ?? null,
      effort_requested: execution.effort_requested ?? null,
      model_observed: execution.model_observed ?? null,
      effort_observed: execution.effort_observed ?? null,
      configuration: execution.configuration ?? 'unknown',
      transport_completed: execution.exit_code === 0,
      cleanup_confirmed: execution.cleanup_confirmed ?? null,
      tool_calls: Number.isInteger(execution.tool_calls) ? execution.tool_calls : null,
      fresh_session: execution.thread_count === 1,
      turn_completed: execution.completed === true,
      duration_ms: Number.isFinite(execution.duration_ms) ? execution.duration_ms : null,
    },
    limit: 'An exact match demonstrates availability of this marker for this response. A missing value does not prove non-delivery. This is not a general compliance, memory or security guarantee.',
  };
}

export function compare(before, after) {
  const valid = (r) => plain(r) && r.schema_version === 1 && r.product === 'Agent Relay Check' && typeof r.product_version === 'string' &&
    typeof r.challenge_id === 'string' && HEX.test(r.challenge_id) &&
    ['RECEIVED', 'NOT_OBSERVED', 'INCONCLUSIVE'].includes(r.status) && Array.isArray(r.reasons) &&
    Array.isArray(r.markers) && r.markers.length > 0 && plain(r.execution) &&
    r.markers.every((m) => plain(m) && typeof m.key === 'string' && KEY.test(m.key) && /^[0-9a-f]{64}$/.test(m.expected_sha256 ?? '') && ['RECEIVED', 'NOT_OBSERVED', 'INCONCLUSIVE'].includes(m.status)) &&
    new Set(r.markers.map((m) => m.key)).size === r.markers.length &&
    (r.status === 'INCONCLUSIVE' ? r.reasons.length > 0 && r.markers.every((m) => m.status === 'INCONCLUSIVE') :
      r.reasons.length === 0 && r.execution.turn_completed === true && r.execution.transport_completed === true &&
      r.execution.fresh_session === true && r.execution.tool_calls === 0 && r.markers.every((m) => m.status !== 'INCONCLUSIVE') &&
      (r.status === 'RECEIVED') === r.markers.every((m) => m.status === 'RECEIVED'));
  if (!valid(before) || !valid(after)) throw new Error('Compare two Agent Relay Check reports.');
  const a = before.markers.map((m) => m.key).sort();
  if (a.join('\0') !== after.markers.map((m) => m.key).sort().join('\0')) throw new Error('Marker names differ; these reports are not comparable.');
  if (before.execution.adapter !== after.execution.adapter || before.execution.configuration !== after.execution.configuration) {
    throw new Error('Execution adapters or configuration modes differ; do not treat this as a before/after result.');
  }
  return {
    schema_version: 1,
    same_challenge: before.challenge_id === after.challenge_id,
    markers: a.map((key) => {
      const left = before.markers.find((m) => m.key === key).status;
      const right = after.markers.find((m) => m.key === key).status;
      return {key, before: left, after: right, result: [left, right].includes('INCONCLUSIVE') ? 'INCONCLUSIVE' : left === right ? 'UNCHANGED' : 'CHANGED'};
    }),
    runtime_changes: [
      ...['client_version', 'model_requested', 'effort_requested', 'model_observed', 'effort_observed'].filter((k) => before.execution[k] !== after.execution[k]),
      ...(before.product_version !== after.product_version ? ['product_version'] : []),
    ],
    limit: 'Observed differences do not establish their cause. Record what changed in the instruction path, project and client. Prefer fresh markers for each run.',
  };
}

