import { expect } from '@playwright/test';
import { isDeepStrictEqual } from 'node:util';

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

async function applySteps(page, contract, steps, phase, events, dialogs = null) {
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
      const locator = locate(page, step.target);
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

async function readState(page, contract, probes) {
  const result = {};
  const storageProbes = Object.entries(probes).filter(([, probe]) => probe.source.endsWith('Storage'));
  // A delayed save must not split one snapshot into old and new storage values.
  const storageValues = storageProbes.length ? await page.evaluate(entries => Object.fromEntries(entries.map(([name, { source, key, keyFrom, keyPrefix = '' }]) => {
    const storage = window[source];
    const suffix = keyFrom === undefined ? null : storage.getItem(keyFrom);
    return [name, keyFrom !== undefined && suffix === null ? null : storage.getItem(keyFrom === undefined ? key : keyPrefix + suffix)];
  })), storageProbes) : {};
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
    if (probe.parse === 'json' && value !== null) value = JSON.parse(value);
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
