import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';

// ADAPT: app entry, exact persistence key, UI actions and specific new failure feedback.
const app = new URL(process.env.TASK_PACKING_URL ?? 'http://127.0.0.1:8000/task-packing.html');
const key = 'task-packing:state-v1';
const markerA = 'ACL saved task A', markerB = 'ACL restored task B';
const warning = /not saved|could not save|failed to save|unsaved|memory.only|storage.*(?:unavailable|full|denied)|backup.*(?:cannot|failed|error)|restore.*(?:failed|unable)|読み込めません|保存.*(?:失敗|できません|されていない|未完了)|復元.*(?:失敗|できません)|一時的|メモリ内のみ/iu;

for (const mode of ['save', 'restore', 'denied']) test({
  save: 'control: a real UI task survives reload',
  restore: 'control: a complete JSON restore survives reload',
  denied: 'a rejected restore write must not report ordinary restore success',
}[mode], async ({ browser }, info) => {
  test.setTimeout(60000);
  expect(app.protocol).toBe('http:');
  expect(['127.0.0.1', 'localhost', '[::1]']).toContain(app.hostname);
  expect(app.username + app.password).toBe('');
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] }, serviceWorkers: 'block',
    locale: 'en-US', viewport: { width: 1440, height: 2000 }, acceptDownloads: true,
  });
  await context.route('**/*', route => new URL(route.request().url()).origin === app.origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const dialogs = [], errors = [], evidence = { mode };
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  page.on('pageerror', error => errors.push(error.message));
  const raw = () => page.evaluate(key => localStorage.getItem(key), key);
  const restore = backup => page.locator('#importFile').setInputFiles({
    name: 'acl-synthetic-backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  const exportFile = async name => {
    const pending = page.waitForEvent('download');
    await page.locator('#exportButton').click();
    const download = await pending;
    expect(await download.failure()).toBeNull();
    const path = info.outputPath(name);
    await download.saveAs(path);
    return JSON.parse(await readFile(path, 'utf8'));
  };
  let controller;
  try {
    await page.goto(app.href);
    await expect(page.locator('#addTaskButton')).toBeVisible();
    await page.locator('#addTaskButton').click();
    await expect(page.locator('#taskDialog')).toBeVisible();
    await page.locator('#taskTitleInput').fill(markerA);
    await page.locator('#taskNoteInput').fill('Synthetic saved note A');
    await page.locator('#taskForm button[type="submit"]').click();
    await expect.poll(async () => {
      try { return JSON.parse(await raw()).tasks.some(task => task.title === markerA); }
      catch { return false; }
    }, { message: 'PRECONDITION: the real UI must persist task A' }).toBe(true);
    const savedA = await raw(), stateA = JSON.parse(savedA);
    evidence.before = { raw: savedA, state: stateA };
    await page.reload();
    await expect(page.locator('#tasksPage')).toContainText(markerA);
    expect(await raw(), 'CONTROL: the complete initial record survives reload').toBe(savedA);
    if (mode === 'save') return;

    const backupA = await exportFile('saved-A.json');
    expect(backupA.app).toBe('task-packing');
    expect(backupA.schemaVersion).toBe(1);
    expect(backupA.state).toEqual(stateA);
    const backupB = structuredClone(backupA);
    const taskB = backupB.state.tasks.find(task => task.title === markerA);
    taskB.title = markerB; taskB.note = 'Synthetic restored note B';
    backupB.state.board.rows = stateA.board.rows === 6 ? 7 : 6;
    backupB.state.history.push({
      id: 'acl-history-B', title: 'ACL complete history B', note: 'Synthetic only',
      w: 1, h: 1, important: true, sample: false,
      createdAt: 1700000000000, completedAt: 1700000001000,
    });
    evidence.incoming = backupB;

    if (mode === 'restore') {
      await restore(backupB);
      await expect(page.locator('#tasksPage')).toContainText(markerB);
      await expect.poll(async () => JSON.parse(await raw())).toEqual(backupB.state);
      evidence.afterRestore = JSON.parse(await raw());
      await page.reload();
      await expect(page.locator('#tasksPage')).toContainText(markerB);
      expect(JSON.parse(await raw())).toEqual(backupB.state);
      evidence.afterReload = JSON.parse(await raw());
      return;
    }

    // Learn this app's normal restore message through a successful real import.
    await restore(backupA);
    await expect(page.locator('#appToast.show')).toBeVisible();
    await expect(page.locator('#appToastMessage')).toHaveText(/^(?:Backup restored|バックアップを復元しました)$/u);
    const normalMessage = await page.locator('#appToastMessage').innerText();
    expect(normalMessage, 'PRECONDITION: normal restore has visible feedback').not.toBe('');
    expect(await raw()).toBe(savedA);
    const beforeLines = (await page.locator('body').innerText()).split('\n').map(s => s.trim());
    controller = await page.evaluateHandle(key => {
      const descriptor = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem');
      const original = descriptor.value, attempts = [];
      const probe = { attempted: false, notices: [], settled: false };
      const observer = new MutationObserver(() => {
        const toast = document.querySelector('#appToast');
        if (probe.attempted && toast?.classList.contains('show')) {
          probe.notices.push(document.querySelector('#appToastMessage').textContent);
        }
      });
      observer.observe(document.querySelector('#appToast'), { childList: true, subtree: true, attributes: true });
      function denied(name, value) {
        if (this === localStorage && String(name) === key) {
          probe.attempted = true;
          attempts.push({ key, value: String(value), errorName: 'QuotaExceededError' });
          const channel = new MessageChannel();
          channel.port1.onmessage = () => { probe.settled = true; channel.port1.close(); channel.port2.close(); };
          channel.port2.postMessage(null);
          throw new DOMException('Synthetic exact-key write denial', 'QuotaExceededError');
        }
        return Reflect.apply(original, this, [name, value]);
      }
      Object.defineProperty(Storage.prototype, 'setItem', { ...descriptor, value: denied });
      return {
        attempts, probe, active: () => Storage.prototype.setItem === denied,
        restore: () => { observer.disconnect(); Object.defineProperty(Storage.prototype, 'setItem', descriptor); },
      };
    }, key);
    await restore(backupB);
    await expect.poll(async () => (await controller.evaluate(c => c.attempts)).length, {
      message: 'PRECONDITION: the real import must attempt the denied exact-key write',
    }).toBeGreaterThan(0);
    // The mutation observer records feedback after the attempted write, rather
    // than matching the older control toast or waiting an arbitrary sleep.
    await expect.poll(async () => await controller.evaluate(c => c.probe.settled)).toBe(true);
    const probe = await controller.evaluate(c => ({ active: c.active(), attempts: c.attempts, notices: c.probe.notices }));
    expect(probe.active).toBe(true);
    expect(await raw(), 'PRESERVATION: complete saved A remains byte-identical').toBe(savedA);
    const newLines = (await page.locator('body').innerText()).split('\n').map(s => s.trim()).filter(s => !beforeLines.includes(s));
    const warningSeen = [...probe.notices, ...newLines].some(s => warning.test(s));
    const ordinarySuccessSeen = probe.notices.includes(normalMessage);
    const visibleTaskB = await page.locator('#tasksPage').getByText(markerB, { exact: true }).count();
    evidence.afterDenied = {
      ...probe, raw: await raw(), normalMessage, ordinarySuccessSeen, warningSeen,
      visibleTaskB,
      newVisibleLines: newLines,
    };
    await page.screenshot({ path: info.outputPath('restore-before-reload.png'), fullPage: true });
    evidence.manualRecoveryBackup = await exportFile('manual-recovery-after-denial.json');
    evidence.manualRecoveryContainsCompleteB = isDeepStrictEqual(evidence.manualRecoveryBackup.state, backupB.state);
    await controller.evaluate(c => c.restore()); controller = undefined;
    await page.reload();
    await expect(page.locator('#tasksPage')).toContainText(markerA);
    expect(await raw()).toBe(savedA);
    evidence.afterReload = { raw: await raw(), visibleTaskB: await page.locator('#tasksPage').getByText(markerB, { exact: true }).count() };
    await page.screenshot({ path: info.outputPath('restore-after-reload.png'), fullPage: true });
    expect((ordinarySuccessSeen || visibleTaskB > 0) && !warningSeen,
      'SAVE_COMPLETION: rejected B remained unsaved; ordinary restore success needs a visible persistence warning').toBe(false);
  } finally {
    evidence.dialogs = dialogs; evidence.pageErrors = errors;
    await info.attach('complete-import-and-persistence', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
    try { if (controller) await controller.evaluate(c => c.restore()); }
    finally { await context.close(); }
    expect(dialogs, 'PRECONDITION: unexpected native dialogs').toEqual([]);
    expect(errors, 'PRECONDITION: unexpected application errors').toEqual([]);
  }
});
