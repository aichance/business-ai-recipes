export const PACK = 'state-preservation@1';
export const CHECKS = ['reload', 'rejected-update'];
const own = (object, key) => Object.hasOwn(object, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function requireThat(condition, message) { if (!condition) throw new Error(`Invalid contract: ${message}`); }
function text(value) { return typeof value === 'string' && value.length > 0; }
function indexedKey(value, depth = 0) {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value)) ||
    (depth < 16 && Array.isArray(value) && Array.from(value).every(v => indexedKey(v, depth + 1)));
}
function keys(value, allowed, where) {
  requireThat(object(value), `${where} must be an object`);
  for (const key of Object.keys(value)) requireThat(allowed.includes(key), `${where}: unknown field ${key}`);
}

export function localURL(value) {
  const url = new URL(value);
  requireThat(['http:', 'https:'].includes(url.protocol), 'baseURL must use HTTP(S)');
  requireThat(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'use a disposable local app on localhost/127.0.0.1/[::1]');
  requireThat(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'baseURL must be an origin without credentials, query or path');
  return url.origin;
}

function path(value, where) {
  requireThat(text(value) && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\'), `${where} must be an origin-relative path`);
  requireThat(new URL(value, 'http://localhost').origin === 'http://localhost', `${where} changes origin`);
}

function target(value, where) {
  keys(value, ['testId', 'label', 'role', 'name', 'css'], where);
  requireThat(['testId', 'label', 'role', 'css'].filter(k => own(value, k)).length === 1, `${where} needs exactly one testId, label, role or css`);
  for (const v of Object.values(value)) requireThat(text(v), `${where} selectors must be nonempty strings`);
  requireThat(!own(value, 'name') || own(value, 'role'), `${where}.name requires role`);
}

function probe(value, where) {
  keys(value, ['source', 'target', 'attribute', 'key', 'keyFrom', 'keyPrefix', 'parse', 'url', 'field', 'header', 'jsonPath', 'database', 'store', 'keyPath', 'maxEntries', 'maxBytes'], where);
  requireThat(['text', 'value', 'attribute', 'count', 'localStorage', 'sessionStorage', 'indexedDB', 'response'].includes(value.source), `${where}: unsupported source`);
  if (['text', 'value', 'attribute', 'count'].includes(value.source)) target(value.target, `${where}.target`);
  if (value.source === 'attribute') requireThat(text(value.attribute), `${where}.attribute required`);
  if (value.source.endsWith('Storage')) {
    requireThat(own(value, 'key') !== own(value, 'keyFrom'), `${where} needs exactly one key or keyFrom`);
    if (own(value, 'key')) requireThat(text(value.key), `${where}.key required`);
    else requireThat(text(value.keyFrom), `${where}.keyFrom must name a pointer in the same storage`);
    requireThat(value.keyPrefix === undefined || (own(value, 'keyFrom') && typeof value.keyPrefix === 'string'), `${where}.keyPrefix requires keyFrom`);
  } else requireThat(value.keyFrom === undefined && value.keyPrefix === undefined, `${where}: keyFrom/keyPrefix only apply to Web Storage`);
  if (value.source === 'indexedDB') {
    requireThat(text(value.database) && text(value.store), `${where}.database and .store required`);
    requireThat(value.field === undefined || ['entry', 'value', 'exists', 'records'].includes(value.field), `${where}.field must be entry/value/exists/records`);
    if (value.field === 'records') {
      requireThat(!own(value, 'key') && value.parse === undefined && value.jsonPath === undefined, `${where}: records cannot select, parse or project individual values`);
      requireThat(typeof value.keyPath === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value.keyPath) && !['__proto__', 'constructor', 'prototype'].includes(value.keyPath), `${where}.keyPath must be one explicit inline property`);
      requireThat(Number.isInteger(value.maxEntries) && value.maxEntries >= 1 && value.maxEntries <= 4096, `${where}.maxEntries must be 1..4096`);
      requireThat(Number.isInteger(value.maxBytes) && value.maxBytes >= 2 && value.maxBytes <= 1048576, `${where}.maxBytes must be 2..1048576`);
    } else {
      requireThat(own(value, 'key') && indexedKey(value.key), `${where}.key must be a string, finite number or array of keys (at most 16 array levels)`);
      requireThat(value.keyPath === undefined && value.maxEntries === undefined && value.maxBytes === undefined, `${where}: bounds/keyPath require records`);
    }
    requireThat(value.field !== 'exists' || (value.parse === undefined && value.jsonPath === undefined), `${where}: exists cannot be parsed or traversed`);
  } else requireThat(value.database === undefined && value.store === undefined, `${where}: database/store only apply to indexedDB`);
  if (value.source !== 'indexedDB') requireThat(value.keyPath === undefined && value.maxEntries === undefined && value.maxBytes === undefined, `${where}: bounds/keyPath require indexedDB records`);
  if (value.source === 'response') {
    path(value.url, `${where}.url`);
    requireThat(['json', 'text', 'status', 'header'].includes(value.field), `${where}.field required (json/text/status/header)`);
    if (value.field === 'header') requireThat(text(value.header), `${where}.header required`);
  }
  requireThat(value.parse === undefined || value.parse === 'json', `${where}.parse must be json`);
  if (value.jsonPath !== undefined) requireThat(Array.isArray(value.jsonPath) && value.jsonPath.every(k => typeof k === 'string' || (Number.isSafeInteger(k) && k >= 0)), `${where}.jsonPath must be an array of keys`);
}

function probes(value, where) {
  requireThat(object(value) && Object.keys(value).length > 0, `${where} must contain named observations`);
  for (const [name, value2] of Object.entries(value)) {
    requireThat(/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name) && !['constructor', '__proto__', 'prototype'].includes(name), `${where}: invalid observation name`);
    probe(value2, `${where}.${name}`);
  }
  for (const item of Object.values(value).filter(p => p.source === 'indexedDB' && p.field === 'records')) {
    requireThat(Object.values(value).filter(p => p.source === 'indexedDB' && p.database === item.database && p.store === item.store).length === 1, `${where}: records cannot share a store with another observation`);
  }
}

function steps(value, where, nonempty = false) {
  requireThat(Array.isArray(value) && (!nonempty || value.length > 0) && value.length <= 100, `${where} must be an array of up to 100 steps`);
  for (const [i, step] of value.entries()) {
    const at = `${where}[${i}]`;
    keys(step, ['action', 'target', 'value', 'file', 'path', 'method', 'data', 'expectStatus', 'headers', 'save', 'confirm'], at);
    requireThat(['click', 'fill', 'press', 'select', 'check', 'uncheck', 'setFile', 'expectText', 'expectValue', 'expectVisible', 'goto', 'request'].includes(step.action), `${at}: unsupported action`);
    if (['goto', 'request'].includes(step.action)) path(step.path, `${at}.path`);
    else target(step.target, `${at}.target`);
    if (['fill', 'press', 'select', 'expectText', 'expectValue'].includes(step.action)) requireThat(typeof step.value === 'string', `${at}.value must be a string`);
    if (step.action === 'setFile') {
      keys(step.file, ['name', 'mimeType', 'text'], `${at}.file`);
      requireThat(text(step.file.name) && step.file.name.length <= 128 && !/[\\/\x00-\x1f\x7f]/.test(step.file.name) && !['.', '..'].includes(step.file.name), `${at}.file.name must be a filename, not a path`);
      requireThat(typeof step.file.mimeType === 'string' && /^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(step.file.mimeType), `${at}.file.mimeType required`);
      requireThat(typeof step.file.text === 'string' && Buffer.byteLength(step.file.text, 'utf8') <= 65536, `${at}.file.text must be UTF-8 text of at most 65536 bytes`);
    } else requireThat(step.file === undefined, `${at}.file only applies to setFile`);
    if (step.action === 'request') {
      requireThat(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(step.method), `${at}.method required`);
      requireThat(Number.isInteger(step.expectStatus) && step.expectStatus >= 100 && step.expectStatus <= 599, `${at}.expectStatus required`);
      if (step.headers !== undefined) requireThat(object(step.headers) && Object.values(step.headers).every(v => typeof v === 'string'), `${at}.headers must contain strings`);
    }
    if (step.save !== undefined) {
      requireThat(step.save === true, `${at}.save must be true when present`);
      const mutation = ['click', 'fill', 'press', 'select', 'check', 'uncheck', 'setFile'].includes(step.action) || (step.action === 'request' && step.method !== 'GET' && step.expectStatus >= 200 && step.expectStatus < 300);
      requireThat(mutation, `${at}.save must mark an actual save-triggering action or successful HTTP mutation`);
    }
    if (step.confirm !== undefined) {
      requireThat(where === 'rejectedUpdate.steps' && value.length === 1 && step.action === 'setFile', `${at}.confirm requires one setFile invalid-update step`);
      keys(step.confirm, ['message', 'accept'], `${at}.confirm`);
      requireThat(text(step.confirm.message) && step.confirm.accept === true, `${at}.confirm requires an exact nonempty message and accept: true`);
    }
  }
}

export function validateContract(input) {
  keys(input, ['schemaVersion', 'pack', 'name', 'baseURL', 'path', 'timeoutMs', 'stabilityMs', 'reset', 'setup', 'observe', 'expected', 'afterReload', 'rejectedUpdate', 'backupRoundtrip', 'checks'], 'contract');
  requireThat(input.schemaVersion === 1 && input.pack === PACK, `schemaVersion=1 and pack=${PACK} required`);
  requireThat(text(input.name), 'name required');
  localURL(input.baseURL);
  path(input.path, 'path');
  if (input.timeoutMs !== undefined) requireThat(Number.isInteger(input.timeoutMs) && input.timeoutMs >= 100 && input.timeoutMs <= 30000, 'timeoutMs must be 100..30000');
  if (input.stabilityMs !== undefined) requireThat(Number.isInteger(input.stabilityMs) && input.stabilityMs >= 0 && input.stabilityMs <= 5000, 'stabilityMs must be 0..5000');
  steps(input.reset, 'reset');
  steps(input.setup, 'setup', true);
  requireThat(input.setup.filter(s => s.save === true).length === 1, 'setup must explicitly mark one save-triggering step with save: true');
  probes(input.observe, 'observe');
  requireThat(object(input.expected) && Object.keys(input.expected).length > 0, 'expected must contain at least one known baseline value');
  requireThat(Object.keys(input.expected).every(k => own(input.observe, k)), 'expected keys must name observations');
  if (input.afterReload !== undefined) steps(input.afterReload, 'afterReload');
  const checks = input.checks ?? CHECKS;
  requireThat(Array.isArray(checks) && checks.length > 0 && checks.every(c => [...CHECKS, 'backup-roundtrip'].includes(c)) && new Set(checks).size === checks.length, 'checks must contain unique known patterns');
  if (input.backupRoundtrip !== undefined) {
    const backup = input.backupRoundtrip;
    keys(backup, ['isolation', 'export', 'restore'], 'backupRoundtrip');
    requireThat(backup.isolation === 'browser-local', 'backupRoundtrip.isolation must be browser-local; shared server datasets are not supported');
    keys(backup.export, ['steps', 'maxBytes', 'statePaths'], 'backupRoundtrip.export');
    steps(backup.export.steps, 'backupRoundtrip.export.steps', true);
    requireThat(Number.isInteger(backup.export.maxBytes) && backup.export.maxBytes > 0 && backup.export.maxBytes <= 1048576, 'backupRoundtrip.export.maxBytes must be 1..1048576');
    const restore = backup.restore;
    keys(restore, ['path', 'prepare', 'ready', 'empty', 'target', 'fileChooser', 'success', 'after', 'fileName', 'mimeType', 'confirm', 'commit'], 'backupRoundtrip.restore');
    path(restore.path, 'backupRoundtrip.restore.path');
    if (restore.prepare !== undefined) {
      steps(restore.prepare, 'backupRoundtrip.restore.prepare', true);
      requireThat(restore.prepare.length <= 32, 'backup-roundtrip prepare allows at most 32 normal UI steps');
      requireThat(restore.prepare.every(s => ['click', 'fill', 'press', 'select', 'check', 'uncheck', 'expectText', 'expectValue', 'expectVisible'].includes(s.action) && s.confirm === undefined), 'backup-roundtrip prepare only permits normal UI actions and observations');
    }
    steps(restore.ready, 'backupRoundtrip.restore.ready', true);
    requireThat(own(restore, 'target') !== own(restore, 'fileChooser'), 'backupRoundtrip.restore needs exactly one target input or fileChooser trigger');
    if (restore.target !== undefined) target(restore.target, 'backupRoundtrip.restore.target');
    else target(restore.fileChooser, 'backupRoundtrip.restore.fileChooser');
    if (restore.confirm !== undefined) {
      keys(restore.confirm, ['message', 'accept'], 'backupRoundtrip.restore.confirm');
      requireThat(text(restore.confirm.message) && restore.confirm.accept === true, 'backupRoundtrip.restore.confirm requires an exact nonempty message and accept: true');
    }
    if (restore.commit !== undefined) {
      requireThat(restore.confirm === undefined, 'backupRoundtrip.restore.commit cannot be combined with native confirm');
      keys(restore.commit, ['frame', 'target', 'ready'], 'backupRoundtrip.restore.commit');
      target(restore.commit.frame, 'backupRoundtrip.restore.commit.frame');
      target(restore.commit.target, 'backupRoundtrip.restore.commit.target');
      steps(restore.commit.ready, 'backupRoundtrip.restore.commit.ready', true);
      requireThat(restore.commit.ready.every(s => ['expectText', 'expectValue', 'expectVisible'].includes(s.action)), 'backup-roundtrip commit readiness must only observe the import preview');
      requireThat(restore.commit.ready.some(s => ['expectText', 'expectValue'].includes(s.action) && s.value.trim().length > 0), 'backup-roundtrip commit readiness needs a nonblank exact text or value assertion');
      requireThat(!restore.commit.ready.some(s => s.save !== undefined || s.confirm !== undefined), 'backup-roundtrip commit readiness cannot save or accept dialogs');
    }
    const observed = Object.keys(input.observe);
    const stored = observed.filter(name => ['localStorage', 'sessionStorage', 'indexedDB'].includes(input.observe[name].source));
    requireThat(object(restore.empty) && Object.keys(restore.empty).length === observed.length && observed.every(k => own(restore.empty, k)), 'backupRoundtrip.restore.empty must declare every selected observation');
    requireThat(stored.length > 0, 'backup-roundtrip needs a saved browser-storage observation, not only UI counts');
    requireThat(object(backup.export.statePaths) && Object.keys(backup.export.statePaths).length === stored.length && stored.every(k => own(backup.export.statePaths, k)), 'backupRoundtrip.export.statePaths must map every saved browser-storage observation');
    requireThat(Object.values(backup.export.statePaths).every(p => Array.isArray(p) && p.length <= 64 && p.every(k => typeof k === 'string' || (Number.isSafeInteger(k) && k >= 0))), 'backupRoundtrip.export.statePaths values must be arrays of JSON keys');
    requireThat(typeof restore.mimeType === 'string' && /^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(restore.mimeType), 'backupRoundtrip.restore.mimeType must declare the upload file type');
    if (restore.fileName !== undefined) requireThat(text(restore.fileName) && restore.fileName.length <= 255 && !/[\\/\x00-\x1f\x7f]/.test(restore.fileName) && !['.', '..'].includes(restore.fileName), 'backupRoundtrip.restore.fileName must be a filename, not a path');
    requireThat(!Object.values(input.observe).some(p => p.source === 'response'), 'backup-roundtrip does not support server response state');
    keys(restore.success, ['observe', 'expected'], 'backupRoundtrip.restore.success');
    probes(restore.success.observe, 'backupRoundtrip.restore.success.observe');
    requireThat(object(restore.success.expected) && Object.keys(restore.success.expected).length > 0 && Object.keys(restore.success.expected).every(k => own(restore.success.observe, k)), 'backupRoundtrip.restore.success.expected must name success observations');
    if (restore.after !== undefined) steps(restore.after, 'backupRoundtrip.restore.after');
    const readiness = [...restore.ready, ...(input.afterReload ?? [])];
    requireThat(readiness.every(s => ['expectText', 'expectValue', 'expectVisible'].includes(s.action)), 'backup-roundtrip readiness hooks must only observe, never navigate or repair saved state');
    requireThat((restore.after ?? []).every(s => ['goto', 'expectText', 'expectValue', 'expectVisible'].includes(s.action)), 'backup-roundtrip post-restore hooks must only navigate or observe after saved-state comparison');
    requireThat((restore.after ?? []).filter(s => s.action === 'goto').length <= 1, 'backup-roundtrip post-restore hooks allow at most one view navigation');
    const allSteps = [...input.reset, ...input.setup, ...(input.afterReload ?? []), ...backup.export.steps, ...(restore.prepare ?? []), ...restore.ready, ...(restore.after ?? [])];
    requireThat(!allSteps.some(s => s.action === 'request'), 'backup-roundtrip uses browser-local UI steps, not server mutations');
  }
  requireThat(input.backupRoundtrip === undefined || checks.includes('backup-roundtrip'), 'backupRoundtrip settings require checks to include backup-roundtrip');
  requireThat(!checks.includes('backup-roundtrip') || input.backupRoundtrip !== undefined, 'backup-roundtrip requires export and fresh-restore conditions');
  if (input.rejectedUpdate !== undefined) {
    keys(input.rejectedUpdate, ['steps', 'observe', 'expected', 'dialog'], 'rejectedUpdate');
    steps(input.rejectedUpdate.steps, 'rejectedUpdate.steps', true);
    requireThat(input.rejectedUpdate.steps.some(s => ['click', 'fill', 'press', 'select', 'check', 'uncheck', 'setFile'].includes(s.action) || (s.action === 'request' && s.method !== 'GET')), 'rejectedUpdate must perform a mutation');
    requireThat(!input.rejectedUpdate.steps.some(s => s.action === 'request' && s.expectStatus >= 500), 'server errors are inconclusive, not an expected rejection');
    const requestReject = input.rejectedUpdate.steps.some(s => s.action === 'request' && s.method !== 'GET' && s.expectStatus >= 400 && s.expectStatus < 500);
    if (input.rejectedUpdate.dialog !== undefined) {
      keys(input.rejectedUpdate.dialog, ['type', 'message'], 'rejectedUpdate.dialog');
      requireThat(input.rejectedUpdate.dialog.type === 'alert' && text(input.rejectedUpdate.dialog.message), 'rejectedUpdate.dialog requires type=alert and an exact nonempty message');
      requireThat(input.rejectedUpdate.observe === undefined && input.rejectedUpdate.expected === undefined && !requestReject, 'dialog rejection cannot be combined with other rejection signals');
    } else if (input.rejectedUpdate.observe !== undefined) {
      probes(input.rejectedUpdate.observe, 'rejectedUpdate.observe');
      requireThat(object(input.rejectedUpdate.expected) && Object.keys(input.rejectedUpdate.expected).length > 0 && Object.keys(input.rejectedUpdate.expected).every(k => own(input.rejectedUpdate.observe, k)), 'rejectedUpdate.expected must name rejection observations');
    } else requireThat(requestReject && input.rejectedUpdate.expected === undefined, 'rejectedUpdate needs rejection observations or a failing HTTP status');
  }
  requireThat(!checks.includes('rejected-update') || input.rejectedUpdate !== undefined, 'rejected-update requires explicit invalid steps and rejection condition');
  return structuredClone({ ...input, checks, timeoutMs: input.timeoutMs ?? 3000, stabilityMs: input.stabilityMs ?? 250 });
}
