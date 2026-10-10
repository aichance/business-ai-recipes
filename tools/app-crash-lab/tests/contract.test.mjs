import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateContract } from '../lib/contract.mjs';
import { differences } from '../lib/protocol.mjs';
import { renderReport } from '../lib/report.mjs';

const sample = JSON.parse(await readFile(new URL('../examples/notes.json', import.meta.url)));
test('explicit contract validates and is copied', () => {
  const result = validateContract(sample);
  assert.deepEqual(result.checks, ['reload', 'rejected-update']);
  result.setup[0].value = 'other';
  assert.equal(sample.setup[0].value, 'Buy coffee');
});
for (const [label, edit] of [
  ['empty observations', c => c.observe = {}],
  ['no expected baseline', c => c.expected = {}],
  ['typo in expected baseline', c => c.expected = { typo: 'value' }],
  ['unknown pattern version', c => c.pack = 'state-preservation@2'],
  ['unknown option typo', c => c.expecetd = c.expected],
  ['missing rejection confirmation', c => delete c.rejectedUpdate.observe],
  ['unknown pattern', c => c.checks = ['magic']],
  ['duplicate pattern', c => c.checks = ['reload', 'reload']],
  ['unsafe remote app', c => c.baseURL = 'https://example.com'],
  ['userinfo', c => c.baseURL = 'http://person:pass@localhost:4173'],
  ['protocol-relative navigation', c => c.path = '//example.com'],
  ['backslash navigation', c => c.path = '/\\example.com'],
  ['missing expected status', c => c.setup = [{ action: 'request', path: '/write', method: 'POST' }]],
  ['missing selector', c => delete c.setup[0].target],
  ['no marked save', c => delete c.setup[1].save],
  ['GET masquerading as a save', c => c.setup = [{ action: 'request', method: 'GET', path: '/', expectStatus: 200, save: true }]],
  ['5xx masquerading as rejection', c => c.rejectedUpdate = { steps: [{ action: 'request', method: 'PUT', path: '/', expectStatus: 500 }] }],
  ['multiple selectors', c => c.setup[0].target = { label: 'Note', css: '#note' }],
  ['storage key and pointer together', c => c.observe.savedNote = { source: 'localStorage', key: 'document', keyFrom: 'current' }],
  ['empty storage pointer name', c => c.observe.savedNote = { source: 'localStorage', keyFrom: '' }],
  ['storage prefix without pointer', c => c.observe.savedNote = { source: 'localStorage', key: 'document', keyPrefix: 'doc.' }],
  ['storage pointer on DOM probe', c => c.observe.savedNote.keyFrom = 'current'],
  ['file field on click', c => c.setup[1].file = { name: 'x.json', mimeType: 'application/json', text: '{}' }],
]) {
  test(`refuses ${label}`, () => { const c = structuredClone(sample); edit(c); assert.throws(() => validateContract(c)); });
}
test('literal file and same-storage pointer validate without filesystem access', () => {
  const c = structuredClone(sample);
  c.setup = [{ action: 'setFile', target: { css: '#file' }, file: { name: '合成.json', mimeType: 'application/json', text: '{"title":"テスト"}' }, save: true }];
  c.observe.savedNote = { source: 'localStorage', keyFrom: 'current', keyPrefix: 'doc.', parse: 'json' };
  assert.equal(validateContract(c).setup[0].file.text, '{"title":"テスト"}');
  for (const file of [
    { name: '../private.json', mimeType: 'application/json', text: '{}' },
    { name: 'dir\\private.json', mimeType: 'application/json', text: '{}' },
    { name: 'x\n.json', mimeType: 'application/json', text: '{}' },
    { name: '..', mimeType: 'application/json', text: '{}' },
    { name: 'x'.repeat(129), mimeType: 'application/json', text: '{}' },
    { name: 'x.json', mimeType: 'invalid', text: '{}' },
    { name: 'x.json', mimeType: 'application/json', text: 'あ'.repeat(21846) },
    { name: 'x.json', mimeType: 'application/json', text: 123 },
    { name: 'x.json', mimeType: 'application/json', text: '{}', path: '/private' },
  ]) {
    const bad = structuredClone(c); bad.setup[0].file = file;
    assert.throws(() => validateContract(bad));
  }
  c.setup[0].file.text = 'x'.repeat(65536);
  assert.equal(validateContract(c).setup[0].file.text.length, 65536);
});
test('diff keeps types, order and absent values meaningful', () => {
  assert.equal(differences({ n: 2 }, { n: '2' }).length, 1);
  assert.equal(differences({ values: ['a', 'b'] }, { values: ['b', 'a'] }).length, 2);
  assert.equal(differences({ x: null }, {}).at(0).change, 'removed');
  assert.deepEqual(differences({ a: 1, b: 2 }, { b: 2, a: 1 }), []);
});
test('report escapes app values and never calls infrastructure failure a pass', () => {
  const html = renderReport({ name: '<script>alert(1)</script>', pack: 'pack', version: 'test', baseURL: 'local', createdAt: 'now', contractHash: 'test', infrastructureError: 'no browser <script>', results: [] });
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('Some checks could not be verified'));
  assert.ok(html.includes('Infrastructure error:'));
});
