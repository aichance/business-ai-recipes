import { expect } from '@playwright/test';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';

// Also copied into generated standalone specs: keep helpers self-contained.
export function differences(before, after, at = '$') {
  if (isDeepStrictEqual(before, after)) return [];
  if (before && after && typeof before === 'object' && typeof after === 'object' && Array.isArray(before) === Array.isArray(after)) {
    const result = [];
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!Object.hasOwn(before, key) || !Object.hasOwn(after, key)) result.push({ path: `${at}[${JSON.stringify(key)}]`, before: Object.hasOwn(before, key) ? before[key] : null, after: Object.hasOwn(after, key) ? after[key] : null, change: Object.hasOwn(before, key) ? 'removed' : 'added' });
      else result.push(...differences(before[key], after[key], `${at}[${JSON.stringify(key)}]`));
    }
    return result;
  }
  return [{ path: at, before, after, change: 'changed' }];
}

function locate(page, selector) {
  if (selector.testId !== undefined) return page.getByTestId(selector.testId);
  if (selector.label !== undefined) return page.getByLabel(selector.label, { exact: true });
  if (selector.role !== undefined) return page.getByRole(selector.role, { name: selector.name, exact: true });
  return page.locator(selector.css);
}

function scopedURL(baseURL, path) {
  const url = new URL(path, baseURL);
  if (url.origin !== new URL(baseURL).origin) throw new Error('Operation leaves the configured origin');
  return url.href;
}

export async function confineContext(context, baseURL) {
  const origin = new URL(baseURL).origin;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin ? route.continue() : route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*', socket => {
    const url = new URL(socket.url());
    url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
    if (url.origin === origin) socket.connectToServer();
    else socket.close();
  });
}

async function applySteps(page, contract, steps, phase, events, dialogs = null, scope = null) {
  for (const [index, step] of steps.entries()) {
    if (dialogs) dialogs.confirmation = step.confirm ? { message: step.confirm.message, seen: false, deadline: Date.now() + contract.timeoutMs } : null;
    events.push({ phase, step: index + 1, action: step.action, ...(step.save ? { save: true } : {}), status: 'started' });
    if (step.action === 'goto') await page.goto(scopedURL(contract.baseURL, step.path), { waitUntil: 'domcontentloaded' });
    else if (step.action === 'request') {
      const response = await page.context().request.fetch(scopedURL(contract.baseURL, step.path), { method: step.method, data: step.data, headers: step.headers, maxRedirects: 0, timeout: contract.timeoutMs });
      const status = response.status();
      await response.dispose();
      if (status !== step.expectStatus) {
        const error = new Error(`HTTP ${status}; expected ${step.expectStatus} during ${phase}`);
        if (phase === 'invalid-update' && status < 500) error.violation = true;
        throw error;
      }
    } else {
      const raw = locate(page, step.target);
      const locator = scope ? raw.and(scope.locator('*')) : raw;
      if (step.action === 'fill') await locator.fill(step.value);
      else if (step.action === 'click') await locator.click();
      else if (step.action === 'press') await locator.press(step.value);
      else if (step.action === 'select') await locator.selectOption(step.value);
      else if (step.action === 'check') await locator.check();
      else if (step.action === 'uncheck') await locator.uncheck();
      else if (step.action === 'setFile') await locator.setInputFiles({ name: step.file.name, mimeType: step.file.mimeType, buffer: Buffer.from(step.file.text, 'utf8') });
      else if (step.action === 'expectText') await expect(locator).toHaveText(step.value, { timeout: contract.timeoutMs });
      else if (step.action === 'expectValue') await expect(locator).toHaveValue(step.value, { timeout: contract.timeoutMs });
      else if (step.action === 'expectVisible') await expect(locator).toBeVisible({ timeout: contract.timeoutMs });
      else throw new Error(`Unsupported action: ${step.action}`);
    }
    if (step.confirm) {
      const deadline = dialogs.confirmation.deadline;
      while (!dialogs.confirmation.seen && Date.now() < deadline) {
        assertSupportedDialogs(dialogs);
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      await Promise.all(dialogs.pending);
      assertSupportedDialogs(dialogs);
      const seen = dialogs.confirmation.seen;
      dialogs.confirmation = null;
      if (!seen) {
        const error = new Error(`Required confirmation was not observed during ${phase} step ${index + 1}`);
        error.violation = true;
        throw error;
      }
    }
    if (dialogs) { dialogs.confirmation = null; assertSupportedDialogs(dialogs); }
    events[events.length - 1].status = 'completed';
  }
}

function recordKeyToken(key, depth = 0) {
  if (typeof key === 'string') return JSON.stringify(['s', key]);
  if (typeof key === 'number' && Number.isFinite(key) && !Object.is(key, -0)) return JSON.stringify(['n', key]);
  if (depth < 16 && Array.isArray(key)) return JSON.stringify(['a', Array.from(key, part => recordKeyToken(part, depth + 1))]);
  throw new Error('Unsupported IndexedDB record key');
}

// This mode certifies complete keyed record sets, not application array order.
// IDs and every record field remain intact; only their comparison order changes.
function canonicalRecords(records, probe) {
  if (!Array.isArray(records) || records.length > probe.maxEntries) throw new Error('IndexedDB records shape or entry limit');
  const seen = new Set();
  const rows = records.map(record => {
    if (!record || typeof record !== 'object' || Array.isArray(record) || !Object.hasOwn(record, probe.keyPath)) throw new Error('IndexedDB record has no declared identity property');
    const token = recordKeyToken(record[probe.keyPath]);
    if (seen.has(token)) throw new Error('Duplicate IndexedDB record identity');
    seen.add(token);
    return { token, record };
  });
  if (Buffer.byteLength(JSON.stringify(records), 'utf8') > probe.maxBytes) throw new Error('IndexedDB records byte limit');
  rows.sort((a, b) => a.token < b.token ? -1 : a.token > b.token ? 1 : 0);
  return rows.map(row => row.record);
}

function comparisonExpected(probes, expected) {
  return Object.fromEntries(Object.entries(expected).map(([name, value]) => [name,
    probes[name]?.source === 'indexedDB' && probes[name].field === 'records' ? canonicalRecords(value, probes[name]) : value]));
}

async function readIndexedDB(page, entries, timeoutMs) {
  if (!entries.length) return {};
  const outcome = await page.evaluate(async ({ entries, timeoutMs }) => {
    const deadline = Date.now() + timeoutMs;
    const pending = message => Object.assign(new Error(message), { observationPending: true });
    function jsonValue(value, seen = new Set(), strictRecords = false) {
      if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
      if (typeof value === 'number' && Number.isFinite(value)) {
        if (strictRecords && Object.is(value, -0)) throw new Error('IndexedDB records contain a number not preserved by JSON serialization');
        return value;
      }
      if (typeof value !== 'object' || seen.has(value)) throw new Error('IndexedDB value is not acyclic JSON data');
      if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('IndexedDB value is not plain JSON data');
      seen.add(value);
      try {
        return Array.isArray(value) ? Array.from(value, v => jsonValue(v, seen, strictRecords)) :
          Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jsonValue(v, seen, strictRecords)]));
      } finally { seen.delete(value); }
    }
    function keyToken(key, depth = 0) {
      if (typeof key === 'string') return JSON.stringify(['s', key]);
      if (typeof key === 'number' && Number.isFinite(key) && !Object.is(key, -0)) return JSON.stringify(['n', key]);
      if (depth < 16 && Array.isArray(key)) return JSON.stringify(['a', Array.from(key, part => keyToken(part, depth + 1))]);
      throw new Error('Unsupported IndexedDB record key');
    }
    async function existingDatabases() {
      let timer;
      try {
        return await Promise.race([indexedDB.databases(), new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('IndexedDB database listing timed out')), Math.max(1, deadline - Date.now()));
        })]);
      } finally { clearTimeout(timer); }
    }
    function readDatabase(database, group) {
      return new Promise((resolve, reject) => {
        let db, transaction, finished = false;
        const finish = (error, values) => {
          if (finished) return;
          if (!error && Date.now() >= deadline) error = new Error(`IndexedDB ${database}: read timed out`);
          finished = true;
          clearTimeout(timer);
          if (error && transaction) { try { transaction.abort(); } catch {} }
          if (db) db.close();
          error ? reject(error) : resolve(values);
        };
        const timer = setTimeout(() => finish(new Error(`IndexedDB ${database}: read timed out`)), Math.max(1, deadline - Date.now()));
        let opening;
        try { opening = indexedDB.open(database); } catch (error) { finish(error); return; }
        // Enumeration is a snapshot: deletion can race it. Never create/upgrade a DB.
        opening.onupgradeneeded = () => {
          // This event can arrive after timeout/blocked finished the promise.
          // Close the transient connection even when finish() would be a no-op.
          const transient = opening.result;
          let failure = pending(`IndexedDB ${database}: database disappeared before open`);
          try { opening.transaction.abort(); }
          catch { failure = new Error(`IndexedDB ${database}: upgrade could not be aborted`); }
          try { transient.close(); }
          catch { failure = new Error(`IndexedDB ${database}: transient connection could not close`); }
          finish(failure);
        };
        opening.onerror = () => finish(opening.error ?? new Error(`IndexedDB ${database}: open failed`));
        opening.onblocked = () => finish(new Error(`IndexedDB ${database}: open blocked`));
        opening.onsuccess = () => {
          db = opening.result;
          if (finished) { db.close(); return; }
          db.onversionchange = () => db.close();
          try {
            const stores = [...new Set(group.map(([, p]) => p.store))];
            for (const store of stores) if (!db.objectStoreNames.contains(store)) throw pending(`IndexedDB ${database}: store ${store} is missing`);
            // Queue every get/getKey/cursor in one readonly transaction.
            transaction = db.transaction(stores, 'readonly');
            const records = group.map(([name, probe]) => {
              const store = transaction.objectStore(probe.store);
              if (probe.field === 'records') {
                if (probe.keyMode === 'out-of-line') {
                  if (store.keyPath !== null || store.autoIncrement) throw new Error('IndexedDB out-of-line records require a store without keyPath or autoIncrement');
                } else if (typeof store.keyPath !== 'string' || store.keyPath !== probe.keyPath) throw new Error('IndexedDB inline keyPath does not match its declaration');
                const record = { name, probe, data: [], bytes: 2, complete: false };
                const request = store.openCursor();
                request.onerror = () => finish(new Error('IndexedDB record cursor failed'));
                request.onsuccess = () => {
                  if (finished) return;
                  try {
                    if (Date.now() >= deadline) throw new Error('IndexedDB record cursor timed out');
                    const cursor = request.result;
                    if (!cursor) { record.complete = true; return; }
                    if (record.data.length >= probe.maxEntries) throw new Error('IndexedDB records entry limit');
                    const value = jsonValue(cursor.value, new Set(), true);
                    if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.hasOwn(value, probe.keyPath) || keyToken(cursor.primaryKey) !== keyToken(value[probe.keyPath])) throw new Error('IndexedDB record does not retain its primary key');
                    record.bytes += (record.data.length ? 1 : 0) + new TextEncoder().encode(JSON.stringify(value)).length;
                    if (record.bytes > probe.maxBytes) throw new Error('IndexedDB records byte limit');
                    record.data.push(value);
                    cursor.continue();
                  } catch (error) { finish(error); }
                };
                return record;
              }
              return { name, probe, value: store.get(probe.key), key: store.getKey(probe.key) };
            });
            transaction.onabort = () => finish(transaction.error ?? new Error(`IndexedDB ${database}: read aborted`));
            transaction.onerror = () => finish(transaction.error ?? new Error(`IndexedDB ${database}: read failed`));
            transaction.oncomplete = () => {
              try {
                const values = Object.fromEntries(records.map(({ name, probe, value, key, data: recordData, complete }) => {
                  if (probe.field === 'records') {
                    if (!complete) throw new Error('IndexedDB record cursor did not complete');
                    return [name, recordData];
                  }
                  const exists = key.result !== undefined;
                  if (probe.field === 'exists') return [name, exists];
                  let data = exists ? jsonValue(value.result) : null;
                  if (exists && probe.parse === 'json') {
                    if (typeof data !== 'string') throw new Error(`IndexedDB observation ${name}: parse requires a JSON string`);
                    data = JSON.parse(data);
                  }
                  return [name, probe.field === 'value' ? data : { exists, value: data }];
                }));
                finish(null, values);
              } catch (error) { finish(error); }
            };
          } catch (error) { finish(error); }
        };
      });
    }
    try {
      if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') throw new Error('IndexedDB database enumeration is unavailable');
      const available = await existingDatabases();
      const values = {};
      for (const database of new Set(entries.map(([, p]) => p.database))) {
        if (!available.some(d => d.name === database)) throw pending(`IndexedDB ${database}: database is missing`);
        if (Date.now() >= deadline) throw new Error('IndexedDB observation timed out');
        Object.assign(values, await readDatabase(database, entries.filter(([, p]) => p.database === database)));
      }
      return { values };
    } catch (error) { return { error: error.message, pending: error.observationPending === true }; }
  }, { entries, timeoutMs });
  if (outcome.error) throw Object.assign(new Error(outcome.error), { observationPending: outcome.pending });
  return Object.fromEntries(entries.map(([name, probe]) => [name, probe.field === 'records' ? canonicalRecords(outcome.values[name], probe) : outcome.values[name]]));
}

async function readState(page, contract, probes) {
  const result = {};
  const storageProbes = Object.entries(probes).filter(([, probe]) => probe.source.endsWith('Storage'));
  // A delayed save must not split one snapshot into old and new storage values.
  const storageValues = storageProbes.length ? await page.evaluate(entries => Object.fromEntries(entries.map(([name, { source, key, keyFrom, keyPrefix = '' }]) => {
    const storage = window[source];
    const suffix = keyFrom === undefined ? null : storage.getItem(keyFrom);
    return [name, keyFrom !== undefined && suffix === null ? null : storage.getItem(keyFrom === undefined ? key : keyPrefix + suffix)];
  })), storageProbes) : {};
  const indexedValues = await readIndexedDB(page, Object.entries(probes).filter(([, p]) => p.source === 'indexedDB'), contract.timeoutMs);
  for (const [name, probe] of Object.entries(probes)) {
    let value;
    if (['text', 'value', 'attribute', 'count'].includes(probe.source)) {
      const locator = locate(page, probe.target);
      if (probe.source === 'count') value = await locator.count();
      else {
        await locator.waitFor({ state: 'attached' });
        if (probe.source === 'text') value = await locator.textContent();
        else if (probe.source === 'value') value = await locator.inputValue();
        else value = await locator.getAttribute(probe.attribute);
      }
    } else if (probe.source.endsWith('Storage')) {
      value = storageValues[name];
    } else if (probe.source === 'indexedDB') {
      value = indexedValues[name];
    } else {
      const response = await page.context().request.get(scopedURL(contract.baseURL, probe.url), { maxRedirects: 0, timeout: contract.timeoutMs });
      try {
        if (probe.field === 'status') value = response.status();
        else {
          if (!response.ok()) throw new Error(`Observation ${name} returned HTTP ${response.status()}`);
          if (probe.field === 'json') value = await response.json();
          else if (probe.field === 'header') value = response.headers()[probe.header.toLowerCase()] ?? null;
          else value = await response.text();
        }
      } finally { await response.dispose(); }
    }
    if (probe.parse === 'json' && value !== null && probe.source !== 'indexedDB') value = JSON.parse(value);
    for (const key of probe.jsonPath ?? []) {
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) {
        const error = new Error(`Observation ${name}: JSON path ${JSON.stringify(probe.jsonPath)} is missing`);
        error.observationPending = true;
        throw error;
      }
      value = value[key];
    }
    if (value === undefined) throw new Error(`Observation ${name} is undefined`);
    result[name] = value;
  }
  return result;
}

function selected(state, expected) { return Object.fromEntries(Object.keys(expected).map(key => [key, state[key]])); }

async function waitForState(page, contract, probes, expected) {
  expected = comparisonExpected(probes, expected);
  const deadline = Date.now() + contract.timeoutMs;
  let state, pending;
  do {
    try {
      state = await readState(page, contract, probes);
      pending = null;
      if (isDeepStrictEqual(selected(state, expected), expected)) return { state, matched: true };
    } catch (error) {
      if (!error.observationPending) throw error;
      pending = error;
    }
    await new Promise(resolve => setTimeout(resolve, 75));
  } while (Date.now() < deadline);
  if (pending) throw pending;
  return { state, matched: false };
}

function captureDialogs(page, allowAlerts) {
  const capture = { events: [], accepted: new Set(), confirmation: null, pending: new Set(), error: null, allowAlerts };
  capture.listener = dialog => {
    const event = { type: dialog.type(), message: dialog.message() };
    const index = capture.events.push(event) - 1;
    const accept = event.type === 'confirm' && capture.confirmation && !capture.confirmation.seen && Date.now() < capture.confirmation.deadline && event.message === capture.confirmation.message;
    if (accept) { capture.confirmation.seen = true; capture.accepted.add(index); }
    // Handling is required: an unhandled modal would stall the triggering action.
    const pending = (accept ? dialog.accept() : dialog.dismiss()).catch(error => { capture.error = error; });
    capture.pending.add(pending);
    pending.finally(() => capture.pending.delete(pending));
  };
  page.on('dialog', capture.listener);
  return capture;
}

function assertSupportedDialogs(capture) {
  if (capture.error) throw new Error(`Could not handle native dialog: ${capture.error.message}`);
  if (capture.events.some((event, index) => !(event.type === 'alert' && capture.allowAlerts) && !capture.accepted.has(index))) throw new Error('Unexpected native dialog; no rejection verdict');
}

async function waitForDialog(capture, start, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    assertSupportedDialogs(capture);
    if (capture.events.slice(start).some((_, i) => !capture.accepted.has(start + i)) && capture.pending.size === 0) break;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  await Promise.all(capture.pending);
  assertSupportedDialogs(capture);
}

function dialogRejection(capture, start, expected) {
  const actual = capture.events.slice(start).filter((_, i) => !capture.accepted.has(start + i));
  return { expected, actual, confirmed: actual.length === 1 && isDeepStrictEqual(actual[0], expected) };
}

export async function executeCheck(page, contract, check) {
  const result = { check, status: 'inconclusive', phase: 'reset', before: null, after: null, differences: [], events: [] };
  const dialogs = check === 'rejected-update' && (contract.rejectedUpdate.dialog || contract.rejectedUpdate.steps.some(step => step.confirm)) ? captureDialogs(page, Boolean(contract.rejectedUpdate.dialog)) : null;
  let dialogStart;
  if (dialogs) result.dialogs = dialogs.events;
  page.setDefaultTimeout(contract.timeoutMs);
  page.setDefaultNavigationTimeout(contract.timeoutMs);
  try {
    await page.goto(scopedURL(contract.baseURL, contract.path), { waitUntil: 'domcontentloaded' });
    await applySteps(page, contract, contract.reset, 'reset', result.events);
    // Reset may change server state. Reload so setup starts from its current view.
    if (contract.reset.length) await page.reload({ waitUntil: 'domcontentloaded' });
    result.phase = 'baseline';
    await applySteps(page, contract, contract.setup, 'setup', result.events);
    const baseline = await waitForState(page, contract, contract.observe, contract.expected);
    result.before = baseline.state;
    if (!baseline.matched) throw new Error('Known-good baseline did not match expected values; no preservation verdict');
    if (check === 'reload') {
      result.phase = 'reload';
      await page.reload({ waitUntil: 'domcontentloaded' });
      await applySteps(page, contract, contract.afterReload ?? [], 'after-reload', result.events);
    } else {
      result.phase = 'rejection-precondition';
      const invalid = contract.rejectedUpdate;
      if (invalid.observe) {
        const previous = await readState(page, contract, invalid.observe);
        if (isDeepStrictEqual(selected(previous, invalid.expected), invalid.expected)) throw new Error('Rejection condition was already true before the invalid update');
      }
      if (dialogs) {
        await Promise.all(dialogs.pending);
        assertSupportedDialogs(dialogs);
        if (dialogs.events.some(event => isDeepStrictEqual(event, invalid.dialog))) throw new Error('Rejection alert was already shown before the invalid update');
        dialogStart = dialogs.events.length;
      }
      result.phase = 'invalid-update';
      await applySteps(page, contract, invalid.steps, 'invalid-update', result.events, dialogs);
      if (invalid.observe || invalid.dialog) {
        result.phase = 'confirm-rejection';
        if (invalid.dialog) {
          await waitForDialog(dialogs, dialogStart, contract.timeoutMs);
          result.rejection = dialogRejection(dialogs, dialogStart, invalid.dialog);
        } else {
          const rejection = await waitForState(page, contract, invalid.observe, invalid.expected);
          result.rejection = { expected: invalid.expected, actual: rejection.state, confirmed: rejection.matched };
        }
        if (!result.rejection.confirmed) {
          result.status = 'fail';
          result.error = 'Configured rejection was not observed';
          result.after = await readState(page, contract, contract.observe);
          result.differences = differences(result.before, result.after);
          return result;
        }
      } else result.rejection = { confirmed: true, evidence: 'expected HTTP rejection status' };
    }
    result.phase = 'compare';
    const final = await waitForState(page, contract, contract.observe, result.before);
    if (final.matched) {
      const until = Date.now() + contract.stabilityMs;
      while (Date.now() < until) {
        await new Promise(resolve => setTimeout(resolve, Math.min(75, until - Date.now())));
        final.state = await readState(page, contract, contract.observe);
        if (!isDeepStrictEqual(final.state, result.before)) { final.matched = false; break; }
      }
    }
    result.after = final.state;
    result.differences = differences(result.before, result.after);
    result.status = final.matched ? 'pass' : 'fail';
    if (!final.matched) result.error = 'Selected saved state changed';
    if (dialogs) {
      await Promise.all(dialogs.pending);
      assertSupportedDialogs(dialogs);
      if (contract.rejectedUpdate.dialog) {
        result.rejection = dialogRejection(dialogs, dialogStart, contract.rejectedUpdate.dialog);
        if (!result.rejection.confirmed) { result.status = 'fail'; result.error = 'Expected exactly one matching rejection alert'; }
      }
    }
    return result;
  } catch (error) {
    if (dialogs) dialogs.confirmation = null;
    result.status = error.violation ? 'fail' : 'inconclusive';
    result.error = error.message;
    // Preserve observable differences even when the rejection requirement failed.
    if (result.before) {
      try { result.after = await readState(page, contract, contract.observe); result.differences = differences(result.before, result.after); } catch { /* retain original diagnostic */ }
    }
    return result;
  } finally {
    if (dialogs) {
      dialogs.confirmation = null;
      page.off('dialog', dialogs.listener);
      await Promise.all(dialogs.pending);
      // A dialog may arrive during observation before an early failure return.
      // It invalidates that verdict just as it does the normal comparison path.
      try { assertSupportedDialogs(dialogs); }
      catch (error) { result.status = 'inconclusive'; result.error = error.message; }
      if (dialogs.accepted.size) result.confirmations = [...dialogs.accepted].map(index => dialogs.events[index]);
    }
  }
}

function backupError(code, violation = false) {
  return Object.assign(new Error(code), { backupCode: code, violation });
}

async function bounded(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(backupError('OPERATION_TIMED_OUT')), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

async function downloadBytes(download, maxBytes, timeoutMs) {
  const stream = await bounded(download.createReadStream(), timeoutMs);
  if (!stream) throw backupError('DOWNLOAD_UNAVAILABLE');
  let size = 0;
  const chunks = [];
  try {
    await bounded((async () => {
      for await (const chunk of stream) {
        size += chunk.length;
        if (size > maxBytes) throw backupError('DOWNLOAD_SIZE_LIMIT');
        chunks.push(chunk);
      }
    })(), timeoutMs);
  } finally { stream.destroy(); }
  if (await bounded(download.failure(), timeoutMs)) throw backupError('DOWNLOAD_FAILED');
  const bytes = Buffer.concat(chunks);
  let payload;
  try {
    payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (payload === null || typeof payload !== 'object') throw new Error('not a JSON object or array');
  } catch { throw backupError('EXPORT_IS_NOT_UTF8_JSON_OBJECT_OR_ARRAY', true); }
  return { bytes, payload };
}

async function stableState(page, contract, probes, expected) {
  expected = comparisonExpected(probes, expected);
  const result = await waitForState(page, contract, probes, expected);
  if (result.matched) {
    const until = Date.now() + contract.stabilityMs;
    while (Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, Math.min(75, until - Date.now())));
      result.state = await readState(page, contract, probes);
      if (!isDeepStrictEqual(selected(result.state, expected), expected)) { result.matched = false; break; }
    }
  }
  return result;
}

// Captured state and download bytes remain internal. Do not add raw exceptions,
// dialog text, filenames, screenshots or trace snapshots to this result.
async function deliverBackupFile(capture, confirmation, timeoutMs, action, result) {
  if (!confirmation) { await action(); return; }
  const armed = { message: confirmation.message, seen: false, deadline: Date.now() + timeoutMs };
  const acceptedBefore = capture.accepted.size;
  capture.confirmation = armed;
  try {
    await action();
    while (!armed.seen && Date.now() < armed.deadline) {
      assertSupportedDialogs(capture);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    await Promise.all(capture.pending);
    assertSupportedDialogs(capture);
    if (!armed.seen) throw backupError('IMPORT_CONFIRMATION_NOT_OBSERVED');
  } finally {
    // Never carry permission into success checks, navigation or reload.
    capture.confirmation = null;
    result.importConfirmation = { required: true, observed: armed.seen, acceptedCount: capture.accepted.size - acceptedBefore };
  }
}

async function requireInactiveImportCommit(page, commit) {
  if (!commit) return;
  try {
    const frame = locate(page, commit.frame);
    const count = await frame.count();
    if (count > 1) throw backupError('IMPORT_COMMIT_AMBIGUOUS');
    if (count === 1 && await frame.isVisible()) throw backupError('IMPORT_COMMIT_ALREADY_VISIBLE');
    if (await locate(frame, commit.target).and(frame.locator('*')).count() > 1) throw backupError('IMPORT_COMMIT_AMBIGUOUS');
  } catch (error) {
    if (error.backupCode) throw error;
    throw backupError('IMPORT_COMMIT_PRECONDITION_UNAVAILABLE');
  }
}

async function commitBackupImport(page, contract, savedProbes, success, result) {
  const restore = contract.backupRoundtrip.restore;
  const commit = restore.commit;
  if (!commit) return;
  result.phase = 'import-commit';
  const receipt = result.importCommit = { required: true, ready: false, attemptedCount: 0, clicked: false };
  const frame = locate(page, commit.frame);
  try {
    await expect(frame).toBeVisible({ timeout: contract.timeoutMs });
    if (await frame.count() !== 1) throw backupError('IMPORT_COMMIT_AMBIGUOUS');
    await applySteps(frame, contract, commit.ready, 'import-commit-ready', result.events, null, frame);
    const button = locate(frame, commit.target).and(frame.locator('*'));
    if (await button.count() > 1) throw backupError('IMPORT_COMMIT_AMBIGUOUS');
    await expect(button).toBeVisible({ timeout: contract.timeoutMs });
    if (await button.count() !== 1) throw backupError('IMPORT_COMMIT_AMBIGUOUS');
    await expect(button).toBeEnabled({ timeout: contract.timeoutMs });
  } catch (error) {
    if (error.backupCode) throw error;
    throw backupError('IMPORT_COMMIT_NOT_READY');
  }
  receipt.ready = true;
  // A preview/confirmation must not disguise an import that already completed
  // or a later click that repairs data. Check storage before the one UI commit.
  const previous = await readState(page, contract, success.observe);
  if (isDeepStrictEqual(selected(previous, success.expected), success.expected)) throw backupError('IMPORT_SUCCESS_BEFORE_COMMIT');
  const expected = Object.fromEntries(Object.keys(savedProbes).map(name => [name, restore.empty[name]]));
  let pending;
  try {
    const state = await readState(page, contract, savedProbes);
    // Do not wait for already changed storage to become empty again.
    pending = { state, matched: isDeepStrictEqual(state, expected) };
    if (pending.matched) pending = await stableState(page, contract, savedProbes, expected);
  }
  catch { throw backupError('IMPORT_STATE_UNAVAILABLE_BEFORE_COMMIT'); }
  const changedObservations = Object.keys(savedProbes).filter(name => !isDeepStrictEqual(expected[name], pending.state[name]));
  result.comparisons.beforeCommit = { matched: pending.matched, changedObservations };
  if (!pending.matched) throw backupError('IMPORT_STATE_CHANGED_BEFORE_COMMIT');
  const latest = await readState(page, contract, success.observe);
  if (isDeepStrictEqual(selected(latest, success.expected), success.expected)) throw backupError('IMPORT_SUCCESS_BEFORE_COMMIT');
  receipt.attemptedCount = 1;
  try { await locate(frame, commit.target).and(frame.locator('*')).click({ timeout: contract.timeoutMs }); }
  catch { throw backupError('IMPORT_COMMIT_CLICK_FAILED'); }
  receipt.clicked = true;
}

export async function executeBackupRoundtrip(browser, contract) {
  const result = { check: 'backup-roundtrip', status: 'inconclusive', phase: 'source-setup', before: null, after: null, differences: [], events: [], capture: 'metadata-only', comparisons: {} };
  const contexts = [], dialogs = [];
  const downloads = [];
  const backup = contract.backupRoundtrip;
  try {
    async function localPage() {
      const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1120, height: 760 }, acceptDownloads: true });
      contexts.push(context);
      await confineContext(context, contract.baseURL);
      const page = await context.newPage();
      page.setDefaultTimeout(contract.timeoutMs);
      page.setDefaultNavigationTimeout(contract.timeoutMs);
      dialogs.push({ page, capture: captureDialogs(page, false) });
      return page;
    }
    const source = await localPage();
    await source.goto(scopedURL(contract.baseURL, contract.path), { waitUntil: 'domcontentloaded' });
    await applySteps(source, contract, contract.reset, 'reset', result.events);
    if (contract.reset.length) await source.reload({ waitUntil: 'domcontentloaded' });
    await applySteps(source, contract, contract.setup, 'setup', result.events);
    result.phase = 'source-baseline';
    const baseline = await waitForState(source, contract, contract.observe, contract.expected);
    if (!baseline.matched) throw backupError('SOURCE_BASELINE_NOT_CONFIRMED');
    const sourceStable = await stableState(source, contract, contract.observe, baseline.state);
    if (!sourceStable.matched) throw backupError('SOURCE_BASELINE_NOT_STABLE');
    const storedNames = Object.keys(contract.observe).filter(name => ['localStorage', 'sessionStorage', 'indexedDB'].includes(contract.observe[name].source));
    if (storedNames.every(name => isDeepStrictEqual(baseline.state[name], backup.restore.empty[name]))) throw backupError('SOURCE_HAS_NO_SELECTED_SAVED_DATA');

    result.phase = 'export';
    source.context().on('page', page => page.on('download', download => downloads.push(download)));
    source.on('download', download => downloads.push(download));
    await applySteps(source, contract, backup.export.steps, 'export', result.events);
    // Observe the full declared window after export steps, then keep listening
    // through restoration. Later events outside the check are not covered.
    const deadline = Date.now() + contract.timeoutMs;
    while (downloads.length <= 1 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    if (!downloads.length) throw backupError('NO_EXPORT_DOWNLOAD');
    if (downloads.length !== 1) throw backupError('MULTIPLE_EXPORT_DOWNLOADS');
    const { bytes, payload } = await downloadBytes(downloads[0], backup.export.maxBytes, contract.timeoutMs);
    result.backup = { format: 'utf8-json', sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    for (const [name, path] of Object.entries(backup.export.statePaths)) {
      let value = payload;
      for (const key of path) {
        if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw backupError('EXPORT_STATE_PATH_MISSING', true);
        value = value[key];
      }
      if (contract.observe[name].source === 'indexedDB' && contract.observe[name].field === 'records') {
        try { value = canonicalRecords(value, contract.observe[name]); }
        catch { throw backupError('EXPORT_RECORD_SET_INVALID', true); }
      }
      if (!isDeepStrictEqual(value, baseline.state[name])) throw backupError('EXPORT_STATE_DIFFERS', true);
    }
    result.comparisons.export = { matched: true };
    result.phase = 'source-after-export';
    const savedProbes = Object.fromEntries(storedNames.map(name => [name, contract.observe[name]]));
    const savedBaseline = Object.fromEntries(storedNames.map(name => [name, baseline.state[name]]));
    let preserved;
    try { preserved = await stableState(source, contract, savedProbes, savedBaseline); }
    catch { throw backupError('SOURCE_STATE_UNAVAILABLE_AFTER_EXPORT', true); }
    if (!preserved.matched) throw backupError('SOURCE_CHANGED_DURING_EXPORT', true);
    result.comparisons.sourceAfterExport = { matched: true };

    result.phase = 'target-empty';
    const target = await localPage();
    await target.goto(scopedURL(contract.baseURL, backup.restore.path), { waitUntil: 'domcontentloaded' });
    const targetDialogs = dialogs.find(entry => entry.page === target).capture;
    if (backup.restore.prepare) {
      result.phase = 'target-prepare';
      await applySteps(target, contract, backup.restore.prepare, 'target-prepare', result.events, targetDialogs);
    }
    result.phase = 'target-empty';
    await applySteps(target, contract, backup.restore.ready, 'target-ready', result.events);
    const empty = await stableState(target, contract, contract.observe, backup.restore.empty);
    if (!empty.matched) throw backupError('FRESH_TARGET_NOT_EMPTY');
    const success = backup.restore.success;
    const previous = await readState(target, contract, success.observe);
    if (isDeepStrictEqual(selected(previous, success.expected), success.expected)) throw backupError('IMPORT_SUCCESS_ALREADY_TRUE');
    await requireInactiveImportCommit(target, backup.restore.commit);

    if (backup.restore.confirm) {
      for (const { capture } of dialogs) {
        await Promise.all(capture.pending);
        assertSupportedDialogs(capture);
      }
    }
    result.phase = 'import';
    // Upload the actual unedited bytes. Never JSON.stringify the parsed export.
    const fileName = backup.restore.fileName ?? downloads[0].suggestedFilename();
    if (!fileName || fileName.length > 255 || /[\\/\x00-\x1f\x7f]/.test(fileName) || ['.', '..'].includes(fileName)) throw backupError('DOWNLOAD_FILENAME_UNSUPPORTED');
    const upload = { name: fileName, mimeType: backup.restore.mimeType, buffer: bytes };
    if (backup.restore.fileChooser) {
      // Some apps create an unattached input only when Import is clicked.
      // Listen first; never manufacture/append an input into the app's DOM.
      const choosing = target.waitForEvent('filechooser', { timeout: contract.timeoutMs })
        .then(chooser => ({ chooser }), () => ({ chooser: null }));
      try { await locate(target, backup.restore.fileChooser).click(); }
      catch {
        await choosing;
        throw backupError('IMPORT_FILE_CHOOSER_TRIGGER_FAILED');
      }
      const { chooser } = await choosing;
      if (!chooser) throw backupError('IMPORT_FILE_CHOOSER_NOT_OBSERVED');
      await requireInactiveImportCommit(target, backup.restore.commit);
      // A dialog while opening the chooser is outside the upload permission.
      if (backup.restore.confirm) {
        await Promise.all(targetDialogs.pending);
        assertSupportedDialogs(targetDialogs);
      }
      await deliverBackupFile(targetDialogs, backup.restore.confirm, contract.timeoutMs, async () => {
        await chooser.setFiles(upload, { timeout: contract.timeoutMs });
        result.uploadTransport = 'file-chooser';
        result.uploadedOriginalBytes = true;
        result.uploadNameSource = backup.restore.fileName === undefined ? 'download' : 'contract';
      }, result);
    } else {
      await deliverBackupFile(targetDialogs, backup.restore.confirm, contract.timeoutMs, async () => {
        await locate(target, backup.restore.target).setInputFiles(upload);
        result.uploadTransport = 'input';
        result.uploadedOriginalBytes = true;
        result.uploadNameSource = backup.restore.fileName === undefined ? 'download' : 'contract';
      }, result);
    }
    await commitBackupImport(target, contract, savedProbes, success, result);
    const imported = await waitForState(target, contract, success.observe, success.expected);
    if (!imported.matched && backup.restore.commit) {
      result.phase = 'import-commit-result';
      let actual;
      try { actual = await readState(target, contract, savedProbes); }
      catch { throw backupError('IMPORT_STATE_UNAVAILABLE_AFTER_COMMIT'); }
      const changedObservations = storedNames.filter(name => !isDeepStrictEqual(savedBaseline[name], actual[name]));
      const sameAsEmpty = storedNames.every(name => isDeepStrictEqual(backup.restore.empty[name], actual[name]));
      result.comparisons.restoration = { matched: changedObservations.length === 0, changedObservations };
      if (!sameAsEmpty && changedObservations.length) throw backupError('RESTORED_STATE_DIFFERS_WITHOUT_COMPLETION', true);
      throw backupError('IMPORT_COMMIT_COMPLETION_NOT_OBSERVED');
    }
    if (!imported.matched) throw backupError('IMPORT_SUCCESS_NOT_OBSERVED', true);
    if (backup.restore.after?.some(step => step.action === 'goto')) {
      // Check every selected saved value before view navigation can run code
      // that repairs an import failure. UI probes may require the next view.
      result.phase = 'compare-before-navigation';
      let actual;
      try { actual = await stableState(target, contract, savedProbes, savedBaseline); }
      catch { throw backupError('RESTORED_STATE_UNAVAILABLE_BEFORE_NAVIGATION', true); }
      const changedObservations = storedNames.filter(name => !isDeepStrictEqual(savedBaseline[name], actual.state[name]));
      result.comparisons.beforeNavigation = { matched: actual.matched, changedObservations };
      if (!actual.matched) throw backupError('RESTORED_STATE_DIFFERS_BEFORE_NAVIGATION', true);
    }
    await applySteps(target, contract, backup.restore.after ?? [], 'after-import', result.events);
    for (const { capture } of dialogs) assertSupportedDialogs(capture);
    for (const [phase, steps] of [['restoration', []], ['reload', contract.afterReload ?? []]]) {
      result.phase = `compare-${phase}`;
      if (phase === 'reload') {
        await target.reload({ waitUntil: 'domcontentloaded' });
        await applySteps(target, contract, steps, 'after-reload', result.events);
      }
      let actual;
      try { actual = await stableState(target, contract, contract.observe, baseline.state); }
      catch { throw backupError('RESTORED_STATE_UNAVAILABLE', true); }
      const changedObservations = Object.keys(contract.observe).filter(name => !isDeepStrictEqual(baseline.state[name], actual.state[name]));
      result.comparisons[phase] = { matched: actual.matched, changedObservations };
      if (!actual.matched) throw backupError(phase === 'reload' ? 'STATE_CHANGED_AFTER_RELOAD' : 'RESTORED_STATE_DIFFERS', true);
    }
    result.phase = 'complete';
    if (downloads.length !== 1) throw backupError('MULTIPLE_EXPORT_DOWNLOADS');
    result.status = 'pass';
  } catch (error) {
    result.status = error.violation ? 'fail' : 'inconclusive';
    result.error = error.backupCode ?? 'CHECK_COULD_NOT_BE_COMPLETED';
  } finally {
    for (const { page, capture } of dialogs) {
      page.off('dialog', capture.listener);
      await Promise.all(capture.pending);
      try { assertSupportedDialogs(capture); }
      catch { result.status = 'inconclusive'; result.error = 'UNEXPECTED_NATIVE_DIALOG'; }
    }
    const cleanup = await Promise.allSettled(contexts.map(context => context.close()));
    if (cleanup.some(r => r.status === 'rejected')) { result.status = 'inconclusive'; result.error = 'CONTEXT_CLEANUP_FAILED'; }
    result.downloadCount = downloads.length;
    if (result.status === 'pass' && downloads.length !== 1) { result.status = 'inconclusive'; result.error = 'MULTIPLE_EXPORT_DOWNLOADS'; }
  }
  return result;
}
