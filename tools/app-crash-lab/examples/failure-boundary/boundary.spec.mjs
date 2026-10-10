import { test, expect } from '@playwright/test';

// Synthetic UI and responses only. No app server or external request is used.
const origin = 'http://127.0.0.1:49741';

async function withExample(page, broken, run) {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let requestSeen;
  const started = new Promise(resolve => { requestSeen = resolve; });
  const events = [];
  const html = `<!doctype html><html lang="en"><meta charset="utf-8">
    <label>Script <input id="script"></label>
    <button id="generate">Generate</button><p role="status">Ready</p>
    <script>
      const input = document.querySelector('#script');
      const status = document.querySelector('[role="status"]');
      document.querySelector('#generate').onclick = async () => {
        status.textContent = 'Generating';
        const response = await fetch('/generate', {method: 'POST'});
        if (!response.ok) {
          if (${broken}) input.value = '';
          status.textContent = 'Generation failed';
        }
      };
    </script></html>`;
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url === origin + '/') {
      return route.fulfill({ contentType: 'text/html', body: html });
    }
    if (url === origin + '/generate' && route.request().method() === 'POST') {
      events.push('request started; response held');
      requestSeen();
      await gate;
      events.push('failure response released');
      return route.fulfill({ status: 422, contentType: 'application/json', body: '{"error":"synthetic failure"}' });
    }
    return route.abort('blockedbyclient');
  });
  try {
    await page.goto(origin);
    await run({ release, started, events });
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
}

async function startGeneration(page) {
  await page.getByRole('textbox', { name: /script|selling point/i }).fill('approved message');
  await page.getByRole('button', { name: /generate/i }).click();
}

test('weak check passes before the failed operation clears the input', async ({ page }, testInfo) => {
  await withExample(page, true, async ({ release, started, events }) => {
    await startGeneration(page);
    await expect(page.getByRole('textbox', { name: /script|selling point/i })).toHaveValue('approved message');
    await started;
    await expect(page.getByRole('status')).toHaveText('Generating');
    events.push('input assertion passed while operation was pending');
    release();
    await expect(page.getByRole('status')).toHaveText('Generation failed');
    await expect(page.getByRole('textbox')).toHaveValue('');
    events.push('failure completed; input is now empty');
    await testInfo.attach('ordering', { body: JSON.stringify(events, null, 2), contentType: 'application/json' });
  });
});

for (const broken of [true, false]) {
  test(`wait for failure first: ${broken ? 'broken UI is caught' : 'fixed UI keeps input'}`, async ({ page }) => {
    await withExample(page, broken, async ({ release, started }) => {
      await startGeneration(page);
      await started;
      release();
      await expect(page.getByRole('status')).toHaveText('Generation failed');
      // Only the final assertion is expected to fail in the broken control.
      // Setup, response and failure-message errors remain unexpected failures.
      test.fail(broken, 'Deliberate fault: the failure handler erases the input.');
      await expect(page.getByRole('textbox', { name: /script|selling point/i })).toHaveValue('approved message');
    });
  });
}
