import { test, expect } from '@playwright/test';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.env.NAIDAN_STANDALONE_FILE) throw new Error('PRECONDITION: set NAIDAN_STANDALONE_FILE to a disposable Naidan standalone index.html');
const file = resolve(process.env.NAIDAN_STANDALONE_FILE);
if (!existsSync(file) || !statSync(file).isFile()) throw new Error('PRECONDITION: the standalone HTML must exist');
const app = pathToFileURL(file);
app.hash = '/?storage-type=local'; // Official first-run storage selection, no injected records.
const key = 'naidan:lsp:settings';
const baseline = 'App Crash Lab baseline: preserve all unrelated settings.';
const primaryPrompt = 'App Crash Lab NEW primary prompt: preserve this exact text.';

for (const mode of ['single', 'fresh-peer', 'earlier-peer']) {
  test(`${mode === 'earlier-peer' ? 'regression' : 'control'} ${mode}: auto-title must not replace another committed prompt`, async ({ browser }, info) => {
    test.setTimeout(45000);
    const context = await browser.newContext({
      locale: 'en-US', serviceWorkers: 'block', storageState: { cookies: [], origins: [] },
      viewport: { width: 1440, height: 1000 },
    });
    context.setDefaultTimeout(7000);
    const observed = {
      mode, environment: { node: process.version, platform: process.platform, chromium: browser.version() },
      blockedRequests: [], pageErrors: [], nativeDialogs: [],
    };
    context.on('page', page => {
      page.on('pageerror', error => observed.pageErrors.push(error.message));
      page.on('dialog', async dialog => { observed.nativeDialogs.push(dialog.message()); await dialog.dismiss(); });
    });
    await context.route('**/*', route => {
      if (/^https?:/.test(route.request().url())) {
        observed.blockedRequests.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    const primary = await context.newPage();
    const raw = page => page.evaluate(key => localStorage.getItem(key), key);
    const openSettings = async page => {
      await page.goto(app.href);
      await expect(page.getByTestId('sidebar-settings-button'), 'PRECONDITION: app startup').toBeVisible();
      const onboarding = page.getByTestId('onboarding-close-x');
      if (await onboarding.isVisible()) await onboarding.click();
      await page.getByTestId('sidebar-settings-button').click();
      await expect(page.getByTestId('setting-system-prompt-textarea')).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem('naidan:storage_type')), 'PRECONDITION: actual local storage mode').toBe('local');
    };
    const savePrompt = async (page, prompt) => {
      await page.getByTestId('setting-system-prompt-textarea').fill(prompt);
      await page.getByTestId('setting-save-button').click();
      await expect.poll(async () => JSON.parse(await raw(page) || '{}').systemPrompt, {
        message: 'PRECONDITION: the ordinary prompt save must actually commit',
      }).toBe(prompt);
    };
    try {
      await openSettings(primary);
      await savePrompt(primary, baseline);
      let peer = primary;
      if (mode === 'earlier-peer') {
        peer = await context.newPage();
        await openSettings(peer);
        await expect(peer.getByTestId('setting-system-prompt-textarea')).toHaveValue(baseline);
      }
      await savePrompt(primary, primaryPrompt);
      observed.primaryCommitted = JSON.parse(await raw(primary));
      if (mode === 'fresh-peer') {
        peer = await context.newPage();
        await openSettings(peer);
        await expect(peer.getByTestId('setting-system-prompt-textarea')).toHaveValue(primaryPrompt);
      }
      await expect.poll(() => raw(peer), { message: 'PRECONDITION: both documents read the complete actual primary commit' }).toBe(await raw(primary));
      observed.peerPromptBeforeSave = await peer.getByTestId('setting-system-prompt-textarea').inputValue();
      await peer.getByTestId('setting-title-disclosure').click();
      const autoTitle = peer.getByTestId('setting-auto-title-checkbox');
      await expect(autoTitle).toBeChecked();
      // This checkbox is sr-only; click its actual visible label, not a forced hidden input.
      await autoTitle.locator('..').click();
      await expect(autoTitle).not.toBeChecked();
      await expect(peer.getByTestId('setting-save-button')).toBeEnabled();
      await expect(peer.getByTestId('dialog-title')).not.toBeVisible();
      await peer.getByTestId('setting-save-button').click();
      await expect.poll(async () => {
        if (JSON.parse(await raw(peer) || '{}').titleGeneration === 'disabled') return 'settled';
        if (mode === 'earlier-peer' && await peer.getByTestId('dialog-title').isVisible()) {
          const title = await peer.getByTestId('dialog-title').innerText();
          if (/save failed|settings changed|conflict/i.test(title) && await peer.getByTestId('dialog-message').isVisible()) return 'settled';
        }
        return 'pending';
      }, { message: 'PRECONDITION: the real UI must commit the edit or visibly refuse the conflicting save' }).toBe('settled');
      observed.afterPeerSave = JSON.parse(await raw(peer));
      observed.refused = observed.afterPeerSave.titleGeneration !== 'disabled';
      if (observed.refused) {
        observed.refusalMessage = await peer.getByTestId('dialog-message').innerText();
        expect(observed.refusalMessage.trim(), 'PRECONDITION: refusal must explain the failed save').not.toBe('');
      }
      await info.attach('after-save', { body: await peer.screenshot(), contentType: 'image/png' });
      // Reload the document that made the original primary commit.
      await primary.reload();
      await expect(primary.getByTestId('sidebar-settings-button')).toBeVisible();
      observed.afterPrimaryReload = JSON.parse(await raw(primary));
      expect(observed.pageErrors, 'PRECONDITION: no uncaught application error').toEqual([]);
      expect(observed.nativeDialogs, 'PRECONDITION: no native dialog supplied a false success').toEqual([]);
      expect(observed.blockedRequests, 'PRECONDITION: this settings workflow needs no network').toEqual([]);
      const expected = observed.refused ? observed.primaryCommitted : { ...observed.primaryCommitted, titleGeneration: 'disabled' };
      expect({ saved: observed.afterPeerSave, reloaded: observed.afterPrimaryReload },
        'PRESERVATION: changing auto-title must preserve every unrelated committed field, including after primary reload',
      ).toEqual({ saved: expected, reloaded: expected });
    } finally {
      try { await info.attach('complete-settings', { body: JSON.stringify(observed, null, 2), contentType: 'application/json' }); }
      finally { await context.close(); }
    }
  });
}
