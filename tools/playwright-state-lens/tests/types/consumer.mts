import { createStateLens, renderTimeline, differences, type StateLensProbe } from '../../lens.mjs';
import { createStateLens as fromPackage } from '@aichance/playwright-state-lens';
import type { Page } from '@playwright/test';
declare const page: Page;
const probes = [
  { name: 'draft', source: 'localStorage', key: 'draft', json: true },
  { name: 'tab', source: 'sessionStorage', key: 'draft' },
  { name: 'record', source: 'indexedDB', database: 'notes', store: 'drafts', key: 1 },
] as const satisfies readonly StateLensProbe[];
const lens = createStateLens(page, { probes, title: 'Existing test', timeoutMs: 750, screenshots: false });
const fromNpm = fromPackage(page, { probes });
const asyncResult: Promise<number> = lens.step('Save', async () => { await page.reload(); return 1; });
const syncResult: Promise<string> = lens.step('Read', () => 'done');
declare const thenable: PromiseLike<number>;
const thenableResult: Promise<number> = lens.step('Thenable', () => thenable);
const schema: 3 = lens.report().schema;
const html: string = renderTimeline(lens.report());
const oldHTML: string = renderTimeline({ schema: 1, title: 'Earlier report', checkpoints: [
  { label: 'Earlier checkpoint', action: { status: 'CHECKPOINT' }, values: { draft: { status: 'OBSERVED', exists: true, value: {} } }, changes: [] },
] });
const deltas = differences({ draft: 1 }, { draft: 2 });
// @ts-expect-error Web Storage keys are strings.
createStateLens(page, { probes: [{ name: 'bad', source: 'localStorage', key: 1 }] });
// @ts-expect-error IndexedDB requires its store.
createStateLens(page, { probes: [{ name: 'bad', source: 'indexedDB', database: 'notes', key: 'draft' }] });
// @ts-expect-error Cookies are outside the selected storage contract.
createStateLens(page, { probes: [{ name: 'bad', source: 'cookie', key: 'draft' }] });
// @ts-expect-error Timeout is numeric; ranges are still checked at runtime.
createStateLens(page, { probes, timeoutMs: '750' });
// @ts-expect-error A callback returning string cannot promise a number.
const wrongResult: Promise<number> = lens.step('Value', () => 'text');
