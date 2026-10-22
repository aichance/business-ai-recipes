import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRelations } from '../examples/relationship-native/relations.mjs';

const baseline = () => ({ nodes: ['parent', 'reply', 'other'], edges: [
  { type: 'replyTo', from: 'reply', to: 'parent' },
] });
const current = () => ({ nodes: [
  { id: 'new-c', key: 'other' }, { id: 'new-b', key: 'reply' }, { id: 'new-a', key: 'parent' },
], edges: [{ type: 'replyTo', fromId: 'new-b', toId: 'new-a' }] });

test('ID remapping, node ordering and edge ordering do not change semantic relationships', () => {
  const before = baseline(), after = current();
  before.edges.push({ type: 'dependsOn', from: 'other', to: 'reply' });
  after.edges.unshift({ type: 'dependsOn', fromId: 'new-c', toId: 'new-b' });
  assert.equal(compareRelations(before, after).status, 'PASS');
});

test('unchanged semantic nodes with a lost relationship must fail', () => {
  const after = current();
  after.edges = [];
  const result = compareRelations(baseline(), after);
  assert.equal(result.status, 'FAIL');
  assert.deepEqual(result.missingNodes, []);
  assert.deepEqual(result.missingEdges, [{ type: 'replyTo', from: 'reply', to: 'parent', count: 1 }]);
});

test('record values are outside this oracle and require separate complete-value assertions', () => {
  const after = current();
  after.nodes[0].body = 'changed payload';
  assert.equal(compareRelations(baseline(), after).status, 'PASS');
});

test('direction, relationship type and a different existing target are meaningful', () => {
  for (const edge of [
    { type: 'replyTo', fromId: 'new-a', toId: 'new-b' },
    { type: 'dependsOn', fromId: 'new-b', toId: 'new-a' },
    { type: 'replyTo', fromId: 'new-b', toId: 'new-c' },
  ]) {
    const result = compareRelations(baseline(), { ...current(), edges: [edge] });
    assert.equal(result.status, 'FAIL');
    assert.equal(result.missingEdges.length, 1);
    assert.equal(result.unexpectedEdges.length, 1);
  }
});

test('duplicate edges retain multiplicity in both directions', () => {
  const before = baseline(), after = current();
  after.edges.push({ ...after.edges[0] });
  assert.deepEqual(compareRelations(before, after).unexpectedEdges,
    [{ type: 'replyTo', from: 'reply', to: 'parent', count: 1 }]);
  before.edges.push({ ...before.edges[0] }, { ...before.edges[0] });
  assert.deepEqual(compareRelations(before, after).missingEdges,
    [{ type: 'replyTo', from: 'reply', to: 'parent', count: 1 }]);
});

test('valid empty actual data and missing or extra nodes fail rather than passing', () => {
  const empty = compareRelations(baseline(), { nodes: [], edges: [] });
  assert.equal(empty.status, 'FAIL');
  assert.deepEqual(empty.missingNodes, ['other', 'parent', 'reply']);
  const after = current();
  after.nodes.push({ id: 'new-d', key: 'extra' });
  assert.deepEqual(compareRelations(baseline(), after).unexpectedNodes, ['extra']);
});

test('invalid or ambiguous input is inconclusive, never a preservation pass', () => {
  const cases = [
    [null, current()],
    [{ nodes: [], edges: [] }, current()],
    [{ ...baseline(), edges: [] }, current()],
    [{ ...baseline(), nodes: ['parent', 'reply', 'parent'] }, current()],
    [{ ...baseline(), edges: [{ type: 'replyTo', from: 'reply', to: 'absent' }] }, current()],
    [baseline(), { ...current(), nodes: [...current().nodes, { id: 'different', key: 'reply' }] }],
    [baseline(), { ...current(), nodes: [...current().nodes, { id: 'new-a', key: 'different' }] }],
    [baseline(), { ...current(), edges: [{ type: 'replyTo', fromId: 'new-b', toId: 'missing' }] }],
    [baseline(), { ...current(), edges: [{ type: '', fromId: 'new-b', toId: 'new-a' }] }],
    [baseline(), { ...current(), edges: [null] }],
    [baseline(), { ...current(), edges: undefined }],
    [baseline(), { ...current(), nodes: [{ id: 1, key: 'parent' }] }],
    [baseline(), { ...current(), nodes: [{ id: '1', key: '  ' }] }],
    [baseline(), { nodes: [], edges: [{ type: 'replyTo', fromId: 'a', toId: 'b' }] }],
  ];
  for (const [before, after] of cases) {
    const result = compareRelations(before, after);
    assert.equal(result.status, 'INCONCLUSIVE', JSON.stringify({ before, after, result }));
    assert.ok(result.error);
  }
});

test('keys with delimiters and special object-property names do not collide', () => {
  const expected = { nodes: ['__proto__', 'a|b', 'b|c'], edges: [
    { type: 'a|b', from: '__proto__', to: 'b|c' },
    { type: 'a', from: 'a|b', to: '__proto__' },
  ] };
  const actual = { nodes: expected.nodes.map((key, i) => ({ id: `${i}`, key })), edges: [
    { type: 'a', fromId: '1', toId: '0' }, { type: 'a|b', fromId: '0', toId: '2' },
  ] };
  assert.equal(compareRelations(expected, actual).status, 'PASS');
});

test('does not mutate inputs; diff is deterministic across permutations', () => {
  const expected = baseline(), actual = current();
  actual.edges = [{ type: 'linked', fromId: 'new-c', toId: 'new-b' }];
  const saved = JSON.stringify({ expected, actual });
  const first = compareRelations(expected, actual);
  actual.nodes.reverse();
  const second = compareRelations(expected, actual);
  actual.nodes.reverse();
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify({ expected, actual }), saved);
});
