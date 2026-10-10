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

async function applySteps(page, contract, steps, phase, events) {
  for (const [index, step] of steps.entries()) {
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
      else if (step.action === 'expectText') await expect(locator).toHaveText(step.value, { timeout: contract.timeoutMs });
      else if (step.action === 'expectValue') await expect(locator).toHaveValue(step.value, { timeout: contract.timeoutMs });
      else if (step.action === 'expectVisible') await expect(locator).toBeVisible({ timeout: contract.timeoutMs });
      else throw new Error(`Unsupported action: ${step.action}`);
    }
    events[events.length - 1].status = 'completed';
  }
}

async function readState(page, contract, probes) {
  const result = {};
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
      value = await page.evaluate(({ source, key }) => window[source].getItem(key), probe);
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
      if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error(`Observation ${name}: JSON path ${JSON.stringify(probe.jsonPath)} is missing`);
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
  let state;
  do {
    state = await readState(page, contract, probes);
    if (isDeepStrictEqual(selected(state, expected), expected)) return { state, matched: true };
    await new Promise(resolve => setTimeout(resolve, 75));
  } while (Date.now() < deadline);
  return { state, matched: false };
}

export async function executeCheck(page, contract, check) {
  const result = { check, status: 'inconclusive', phase: 'reset', before: null, after: null, differences: [], events: [] };
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
      result.phase = 'invalid-update';
      await applySteps(page, contract, invalid.steps, 'invalid-update', result.events);
      if (invalid.observe) {
        result.phase = 'confirm-rejection';
        const rejection = await waitForState(page, contract, invalid.observe, invalid.expected);
        result.rejection = { expected: invalid.expected, actual: rejection.state, confirmed: rejection.matched };
        if (!rejection.matched) {
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
    return result;
  } catch (error) {
    result.status = error.violation ? 'fail' : 'inconclusive';
    result.error = error.message;
    // Preserve observable differences even when the rejection requirement failed.
    if (result.before) {
      try { result.after = await readState(page, contract, contract.observe); result.differences = differences(result.before, result.after); } catch { /* retain original diagnostic */ }
    }
    return result;
  }
}
