import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Run from the pinned upstream dx/ directory, or set MISANECO_DX_ROOT.
// Two VM contexts + a minimal DOM + shared Map. This is not a browser test.
const root = resolve(process.env.MISANECO_DX_ROOT || '.');
const key = 'dx-diag-v1';
const hashes = {
  'data.js': '8b81a352f1a0be07b5d274add9fd20461557199d7840f31c210eb595e42ac6f6',
  'logic.js': 'f45ca29bbe47022de38508564d83d1365e77cd7630667235c500f72136c8720c',
  'app.js': '3e064dc2ffd7dfaac7595cbd2aad748e5a31bec10ad290829963277bac335554',
};
const sources = Object.entries(hashes).map(([name, expected]) => {
  const path = resolve(root, 'js', name);
  const bytes = readFileSync(path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), expected,
    `SETUP: ${name} must match upstream 02e7befca9d5e0248f8668adf94607d8c62a9c88`);
  return { path, source: bytes.toString('utf8') };
});

function application(store) {
  const nodes = [];
  const byId = new Map();
  function element(tag) {
    const listeners = new Map();
    const attrs = new Map();
    let text = '';
    const node = {
      tagName: tag, children: [], style: {}, value: '', checked: false,
      hidden: false, disabled: false, open: false,
      appendChild(child) { this.children.push(child); return child; },
      setAttribute(name, value) { attrs.set(name, String(value)); },
      getAttribute(name) { return attrs.get(name) ?? null; },
      removeAttribute(name) { attrs.delete(name); },
      addEventListener(name, fn) {
        if (!listeners.has(name)) listeners.set(name, []);
        listeners.get(name).push(fn);
      },
      fire(name) {
        for (const fn of listeners.get(name) || []) fn.call(this, { currentTarget: this });
      },
      querySelectorAll() { return []; },
      scrollIntoView() {}, focus() {}, remove() {},
    };
    Object.defineProperty(node, 'textContent', {
      get() { return text + node.children.map(child => child.textContent || '').join(''); },
      set(value) { text = String(value); node.children = []; },
    });
    nodes.push(node);
    return node;
  }
  const doc = {
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, element('div'));
      return byId.get(id);
    },
    createElement: element,
    createTextNode(text) { const n = element('#text'); n.textContent = text; return n; },
    createDocumentFragment() { return element('#fragment'); },
    querySelectorAll(selector) {
      if (selector === 'input[data-task]') return nodes.filter(n => n.getAttribute('data-task'));
      return []; // Only the task/industry UI path is modelled.
    },
    body: element('body'),
  };
  const pending = { then() { return this; }, catch() { return this; } };
  const window = {
    DX_CONFIG: { submitUrl: '' }, location: { search: '' }, scrollY: 0,
    localStorage: {
      getItem: name => store.get(String(name)) ?? null,
      setItem: (name, value) => { store.set(String(name), String(value)); },
      removeItem: name => { store.delete(String(name)); },
    },
    sessionStorage: { getItem: () => null, setItem() {} },
    fetch: () => pending, // No analytics, ads, or other external request.
    addEventListener() {}, scrollTo() {}, confirm: () => false,
  };
  window.window = window;
  const context = vm.createContext({ window, document: doc, setTimeout() {},
    URL: {}, Blob: class {} }, { codeGeneration: { strings: false, wasm: false } });
  for (const item of sources) vm.runInContext(item.source, context, {
    filename: item.path, timeout: 1000,
  });
  function find(predicate, description) {
    const node = nodes.find(predicate);
    assert.ok(node, `SETUP: app must render ${description}`);
    return node;
  }
  return {
    selectTask(id) {
      const n = find(n => n.getAttribute('data-task') === id, `task ${id}`);
      n.checked = true;
      n.fire('change'); // Run the original app's registered event handler.
    },
    industry(value) {
      const n = find(n => n.name === 'industry' && n.value === value, `industry ${value}`);
      n.checked = true;
      n.fire('change');
    },
    visibleSelection() { return doc.getElementById('selCount').textContent; },
  };
}

function scenario(mode) {
  const store = new Map();
  const primary = application(store);
  const earlier = mode === 'earlier-state' ? application(store) : null;
  primary.selectTask('invoice');
  primary.selectTask('reconcile');
  const before = JSON.parse(store.get(key));
  assert.deepEqual(before.order, ['invoice', 'reconcile'], 'SETUP: both selections actually saved');
  const other = earlier || (mode === 'fresh-state' ? application(store) : primary);
  other.industry('realestate');
  const after = JSON.parse(store.get(key));
  assert.equal(after.industry, 'realestate', 'SETUP: second operation actually committed');
  const expected = { ...before, industry: 'realestate' };
  const reloaded = application(store);
  console.log('MEASURED', JSON.stringify({ mode, before, after, expected,
    reloadedSelection: reloaded.visibleSelection(),
    preserved: JSON.stringify(after) === JSON.stringify(expected) }));
  assert.deepEqual(after, expected,
    'PRESERVATION: changing industry must retain the complete newer selected-task record');
  assert.equal(reloaded.visibleSelection(), '2件選択中', 'Selections also reload through the original app');
}

test('control: same app state changes industry and retains both saved tasks', () => scenario('same-state'));
test('control: state loaded after saving retains both tasks', () => scenario('fresh-state'));
test('preservation: state loaded before selecting tasks must retain the newer record', () => scenario('earlier-state'));
