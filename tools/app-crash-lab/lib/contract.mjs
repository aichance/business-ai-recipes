export const PACK = 'state-preservation@1';
export const CHECKS = ['reload', 'rejected-update'];
const own = (object, key) => Object.hasOwn(object, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function requireThat(condition, message) { if (!condition) throw new Error(`Invalid contract: ${message}`); }
function text(value) { return typeof value === 'string' && value.length > 0; }
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
  keys(value, ['source', 'target', 'attribute', 'key', 'keyFrom', 'keyPrefix', 'parse', 'url', 'field', 'header', 'jsonPath'], where);
  requireThat(['text', 'value', 'attribute', 'count', 'localStorage', 'sessionStorage', 'response'].includes(value.source), `${where}: unsupported source`);
  if (['text', 'value', 'attribute', 'count'].includes(value.source)) target(value.target, `${where}.target`);
  if (value.source === 'attribute') requireThat(text(value.attribute), `${where}.attribute required`);
  if (value.source.endsWith('Storage')) {
    requireThat(own(value, 'key') !== own(value, 'keyFrom'), `${where} needs exactly one key or keyFrom`);
    if (own(value, 'key')) requireThat(text(value.key), `${where}.key required`);
    else requireThat(text(value.keyFrom), `${where}.keyFrom must name a pointer in the same storage`);
    requireThat(value.keyPrefix === undefined || (own(value, 'keyFrom') && typeof value.keyPrefix === 'string'), `${where}.keyPrefix requires keyFrom`);
  } else requireThat(value.keyFrom === undefined && value.keyPrefix === undefined, `${where}: keyFrom/keyPrefix only apply to Web Storage`);
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
}

function steps(value, where, nonempty = false) {
  requireThat(Array.isArray(value) && (!nonempty || value.length > 0) && value.length <= 100, `${where} must be an array of up to 100 steps`);
  for (const [i, step] of value.entries()) {
    const at = `${where}[${i}]`;
    keys(step, ['action', 'target', 'value', 'file', 'path', 'method', 'data', 'expectStatus', 'headers', 'save'], at);
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
  }
}

export function validateContract(input) {
  keys(input, ['schemaVersion', 'pack', 'name', 'baseURL', 'path', 'timeoutMs', 'stabilityMs', 'reset', 'setup', 'observe', 'expected', 'afterReload', 'rejectedUpdate', 'checks'], 'contract');
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
  requireThat(Array.isArray(checks) && checks.length > 0 && checks.every(c => CHECKS.includes(c)) && new Set(checks).size === checks.length, 'checks must contain unique known patterns');
  if (input.rejectedUpdate !== undefined) {
    keys(input.rejectedUpdate, ['steps', 'observe', 'expected'], 'rejectedUpdate');
    steps(input.rejectedUpdate.steps, 'rejectedUpdate.steps', true);
    requireThat(input.rejectedUpdate.steps.some(s => ['click', 'fill', 'press', 'select', 'check', 'uncheck', 'setFile'].includes(s.action) || (s.action === 'request' && s.method !== 'GET')), 'rejectedUpdate must perform a mutation');
    requireThat(!input.rejectedUpdate.steps.some(s => s.action === 'request' && s.expectStatus >= 500), 'server errors are inconclusive, not an expected rejection');
    const requestReject = input.rejectedUpdate.steps.some(s => s.action === 'request' && s.method !== 'GET' && s.expectStatus >= 400 && s.expectStatus < 500);
    if (input.rejectedUpdate.observe !== undefined) {
      probes(input.rejectedUpdate.observe, 'rejectedUpdate.observe');
      requireThat(object(input.rejectedUpdate.expected) && Object.keys(input.rejectedUpdate.expected).length > 0 && Object.keys(input.rejectedUpdate.expected).every(k => own(input.rejectedUpdate.observe, k)), 'rejectedUpdate.expected must name rejection observations');
    } else requireThat(requestReject && input.rejectedUpdate.expected === undefined, 'rejectedUpdate needs rejection observations or a failing HTTP status');
  }
  requireThat(!checks.includes('rejected-update') || input.rejectedUpdate !== undefined, 'rejected-update requires explicit invalid steps and rejection condition');
  return structuredClone({ ...input, checks, timeoutMs: input.timeoutMs ?? 3000, stabilityMs: input.stabilityMs ?? 250 });
}
