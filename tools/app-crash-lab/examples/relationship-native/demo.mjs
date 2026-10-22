import assert from 'node:assert/strict';
import { compareRelations } from './relations.mjs';

// Authored synthetic controls, not an actual migration or backup run.
// In your test, capture this expectation once through reviewed normal API/UI.
const expected = {
  nodes: ['parent', 'reply'],
  edges: [{ type: 'replyTo', from: 'reply', to: 'parent' }],
};
const current = {
  nodes: [{ id: 'new-41', key: 'parent' }, { id: 'new-72', key: 'reply' }],
  edges: [{ type: 'replyTo', fromId: 'new-72', toId: 'new-41' }],
};
const cases = [
  ['IDs changed; relationship retained', 'PASS', current],
  ['Same nodes; reply relationship lost', 'FAIL', { ...current, edges: [] }],
  ['Target ID cannot be resolved', 'INCONCLUSIVE', {
    ...current, edges: [{ type: 'replyTo', fromId: 'new-72', toId: 'unknown' }],
  }],
];
for (const [scenario, wanted, observed] of cases) {
  const result = compareRelations(expected, observed);
  assert.equal(result.status, wanted, scenario);
  console.log(JSON.stringify({ scenario, synthetic: true, ...result }));
}
// Exit0 means the comparator produced all three expected verdicts, not that an app passed.
