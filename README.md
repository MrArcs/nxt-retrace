# Retrace — record browser flows, replay them as Playwright tests

A jam.dev-style tool for test automation:

- **Chrome/Edge extension** records your clicks, typing and navigation and turns them into a Playwright TypeScript test — copy it, or save it to your library.
- **Local Next.js app** stores every script in SQLite, runs any of them with one ▶ Play click via real Playwright, and shows a failure report with console errors, network failures, repro steps, screenshots, and a downloadable trace.

```
apps/extension   WXT (Manifest V3) extension — recorder, selector engine, side panel
apps/web         Next.js 16 app — script library, runner, reports, SQLite (Drizzle + better-sqlite3)
packages/shared  Step model + Playwright code generator shared by both
```

Data lives in `~/.pwrec/` (SQLite db + run artifacts). Override with `PWREC_DATA_DIR`.

## Setup

```bash
npm install
npx -w apps/web playwright install chromium   # browser used for replays
```

## Run

```bash
npm run dev:web        # app on http://localhost:3000
npm run build -w apps/extension
```

Then load the extension:

1. Chrome/Edge → `chrome://extensions` → enable Developer mode.
2. **Load unpacked** → select `apps/extension/.output/chrome-mv3`.
3. Click the Retrace toolbar icon to open the side panel.

## Use

1. Open the site you want to test, hit **Start recording** in the side panel.
2. Click through your flow — steps appear live; delete any you don't want.
3. **Stop**, then **Copy code** or **Save to library** (opens the script in the app).
4. In the app, hit **▶ Play** anytime. Failed runs get a report: failing step, console errors, failed network requests, screenshots, and a `trace.zip` for `npx playwright show-trace`.

## Tests

```bash
npm test               # codegen + selector engine unit tests
```
