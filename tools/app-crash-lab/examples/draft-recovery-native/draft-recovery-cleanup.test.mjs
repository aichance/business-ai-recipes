import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Run in the upstream uploader/ directory, or set DRAFT_GUARD_SOURCE.
// The original browser IIFE is read unchanged; no app dependency is installed.
const sourcePath = resolve(process.env.DRAFT_GUARD_SOURCE || 'public/draft-guard.js');
const source = readFileSync(sourcePath, 'utf8');
const sourceKey = 'swl:draft:new:app-crash-source';
const restoredKey = 'swl:draft:new:app-crash-restored';

function form(label) {
  return {
    shared: {
      date: '2026-10-19', countryCode: 'GB', region: 'europe',
      coordinates: { lat: 51.5, lng: -0.1 },
      stops: [{ name: label, lat: 51.5, lng: -0.1 }],
      route: 'Synthetic route', categories: ['City'], tags: ['synthetic', label],
    },
    de: { locale: 'de', slug: 'synthetic-de', title: `${label} DE`,
      excerpt: `${label} excerpt DE`, country: 'Synthetic DE',
      bodyMarkdown: `Complete ${label} German body`, images: {}, keyFacts: { Note: label },
      heroImage: { src: 'https://example.invalid/synthetic-de.png', width: 32, height: 32, alt: `${label} image` } },
    en: { locale: 'en', slug: 'synthetic-en', title: `${label} EN`,
      excerpt: `${label} excerpt EN`, country: 'Synthetic EN',
      bodyMarkdown: `Complete ${label} English body`, images: {}, keyFacts: { Note: label },
      heroImage: { src: 'https://example.invalid/synthetic-en.png', width: 32, height: 32, alt: `${label} picture` } },
  };
}

// Shared Map models localStorage only. Each vm has its own guard and timers.
// This is a module-level regression; it does not simulate a browser or server.
function tab(store, key, initial) {
  let current = structuredClone(initial);
  const timers = new Map();
  let nextTimer = 0;
  const storage = {
    getItem: (key) => store.get(String(key)) ?? null,
    setItem: (key, value) => { store.set(String(key), String(value)); },
    removeItem: (key) => { store.delete(String(key)); },
    key: (index) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  };
  const context = {
    localStorage: storage,
    sessionStorage: { getItem: () => null, setItem() {} },
    location: { pathname: '/admin/editor.html', search: '' },
    setTimeout: (fn) => { const id = ++nextTimer; timers.set(id, fn); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    addEventListener() {},
  };
  context.window = context;
  vm.createContext(context, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext(source, context, { filename: sourcePath, timeout: 1000 });
  const guard = context.DraftGuard.createDraftGuard({
    storageKey: key,
    orphanPrefix: 'swl:draft:new:',
    collect: () => current,
  });
  return {
    guard,
    write(value) { current = structuredClone(value); guard.markDirty(); guard.stashNow(); },
  };
}

function restoredPair() {
  const store = new Map();
  const original = form('original');
  const a = tab(store, sourceKey, original);
  a.write(original);
  const b = tab(store, restoredKey, original);
  const stash = b.guard.tryRestore();
  assert.equal(stash.key, sourceKey, 'PRECONDITION: restore must select the actual source');
  assert.deepEqual(JSON.parse(JSON.stringify(stash.payload)), original);
  b.guard.adopt(stash);
  b.guard.markDirty();
  assert.equal(store.get(restoredKey), store.get(sourceKey), 'PRECONDITION: adoption copied the source');
  return { store, a, b, token: b.guard.snapshot() };
}

test('control: completed cleanup removes an unchanged adopted source and its copy', () => {
  const { store, b, token } = restoredPair();
  b.guard.markClean(token); // Model the caller signalling a completed save.
  assert.equal(b.guard.isDirty(), false);
  assert.equal(store.has(restoredKey), false);
  assert.equal(store.has(sourceKey), false, 'Unchanged orphan cleanup must still work');
});

test('control: cleaning an independent tab preserves the entire other stash', () => {
  const store = new Map();
  const a = tab(store, sourceKey, form('other-tab'));
  const b = tab(store, restoredKey, form('independent'));
  a.write(form('other-tab'));
  b.write(form('independent'));
  const before = store.get(sourceKey);
  b.guard.markClean(b.guard.snapshot());
  assert.equal(store.has(restoredKey), false);
  assert.equal(store.get(sourceKey), before);
  assert.deepEqual(JSON.parse(store.get(sourceKey)).payload, form('other-tab'));
});

test('PRESERVATION: adopted-copy cleanup keeps a newer complete source-tab stash', (t) => {
  const { store, a, b, token } = restoredPair();
  const oldRaw = store.get(sourceKey);
  const newer = form('newer-source-edit');
  a.write(newer);
  const committedBeforeCleanup = store.get(sourceKey);
  assert.notEqual(committedBeforeCleanup, oldRaw, 'PRECONDITION: source really changed after adoption');
  assert.deepEqual(JSON.parse(committedBeforeCleanup).payload, newer);
  assert.notEqual(store.get(restoredKey), committedBeforeCleanup, 'PRECONDITION: restored copy is still older');
  b.guard.markClean(token);
  assert.equal(store.has(restoredKey), false, 'The completed copy should be removed');
  t.diagnostic(JSON.stringify({ sourceKey, before: committedBeforeCleanup, after: store.get(sourceKey) ?? null }));
  assert.equal(store.get(sourceKey), committedBeforeCleanup,
    'PRESERVATION: saving the restored copy must not delete another tab\'s later stash');
  assert.deepEqual(JSON.parse(store.get(sourceKey)).payload, newer);
});
