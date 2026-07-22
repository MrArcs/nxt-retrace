/** playwright config written into each run workspace */
export const PLAYWRIGHT_CONFIG = `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  outputDir: './artifacts',
  timeout: 120_000,
  reporter: [['json', { outputFile: 'report.json' }]],
  use: {
    // an action that can't proceed should fail (with its step location) long
    // before the whole-test timeout, so reports can name the failing step
    actionTimeout: 15_000,
    // headed + slowMo so the user watches every step execute live;
    // set PWREC_HEADLESS=1 on the app to run invisibly (e.g. on CI)
    headless: !!process.env.PWREC_HEADLESS,
    launchOptions: { slowMo: process.env.PWREC_HEADLESS ? 0 : 500 },
    trace: 'on',
    screenshot: 'only-on-failure',
    video: 'off',
  },
});
`

/**
 * test fixture that records console + network activity to json files in the
 * run workspace — teardown runs even when the test fails.
 */
export const CAPTURE_FIXTURE = `import fs from 'node:fs';
import path from 'node:path';
import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const consoleLogs = [];
    const network = [];
    page.on('console', (m) =>
      consoleLogs.push({ type: m.type(), text: m.text(), url: m.location().url }),
    );
    page.on('pageerror', (e) => consoleLogs.push({ type: 'pageerror', text: String(e) }));
    page.on('response', (r) => {
      const req = r.request();
      network.push({
        method: req.method(),
        url: r.url(),
        status: r.status(),
        resourceType: req.resourceType(),
      });
    });
    page.on('requestfailed', (req) =>
      network.push({
        method: req.method(),
        url: req.url(),
        status: 0,
        resourceType: req.resourceType(),
        failure: req.failure()?.errorText ?? 'failed',
      }),
    );
    await use(page);
    const dir = path.dirname(testInfo.config.configFile ?? '.');
    fs.writeFileSync(path.join(dir, 'console.json'), JSON.stringify(consoleLogs, null, 2));
    fs.writeFileSync(path.join(dir, 'network.json'), JSON.stringify(network, null, 2));
  },
});

export { expect };
`
