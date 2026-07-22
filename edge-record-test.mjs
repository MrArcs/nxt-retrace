import { chromium } from "playwright";

const EXT = new URL("./apps/extension/.output/edge-mv3", import.meta.url)
  .pathname;
const TITLE = "RETRACE-TEST-TAB";
const PORT = 9333;
const log = (...a) => console.log("[test]", ...a);

const ctx = await chromium.launchPersistentContext("/tmp/edge-retrace-e2e2", {
  channel: "msedge",
  headless: false,
  viewport: { width: 1280, height: 800 },
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    `--auto-select-tab-capture-source-by-title=${TITLE}`,
    `--remote-debugging-port=${PORT}`,
  ],
});

const appPage = await ctx.newPage();
await appPage.goto("http://localhost:3000");
await appPage.waitForLoadState("networkidle").catch(() => {});
await appPage.evaluate((t) => {
  document.title = t;
  new MutationObserver(() => {
    if (document.title !== t) document.title = t;
  }).observe(document.head, {
    subtree: true,
    childList: true,
    characterData: true,
  });
}, TITLE);

let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 10000 });

// open the REAL side panel: trusted Playwright click -> content script msg ->
// sidePanel.open() inside the gesture context
await sw.evaluate(() => {
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg?.cmd === "__openPanel" && sender.tab) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});
    }
  });
});
const [tabInfo] = await sw.evaluate(() =>
  chrome.tabs.query({ active: true, currentWindow: true }),
);
await sw.evaluate(
  (tabId) =>
    chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        document.addEventListener(
          "click",
          () => chrome.runtime.sendMessage({ cmd: "__openPanel" }),
          { once: true },
        );
      },
    }),
  tabInfo.id,
);
await appPage.mouse.click(600, 400);
await appPage.waitForTimeout(2000);

// attach to the side panel target over raw CDP
const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const panelTarget = targets.find((t) => t.url.includes("sidepanel.html"));
if (!panelTarget) {
  log("side panel target not found; targets:", targets.map((t) => t.url));
  await ctx.close();
  process.exit(1);
}
log("panel target:", panelTarget.url);

const ws = new WebSocket(panelTarget.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
const cdp = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evalInPanel = async (expr) => {
  const r = await cdp("Runtime.evaluate", {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
  });
  return r.result?.result?.value ?? r.result?.exceptionDetails?.text;
};

await cdp("Page.bringToFront");
log("panel focused:", await evalInPanel("(window.focus(), document.hasFocus())"));

// click the real Record tab button
await evalInPanel(`document.getElementById("toggleBugRecording").click()`);
await appPage.waitForTimeout(2500);
const state1 = await evalInPanel(`(async () => ({
  btn: document.getElementById("toggleBugRecording").textContent.trim(),
  err: document.getElementById("topError")?.textContent?.trim() || null,
  session: (await chrome.storage.session.get("session")).session?.bugRecording,
}))()`);
log("after start click:", JSON.stringify(state1));
if (!state1?.session) {
  await ctx.close();
  process.exit(1);
}

// activity in the recorded tab
await appPage.mouse.move(300, 300);
await appPage.mouse.wheel(0, 400);
await appPage.waitForTimeout(3000);
await appPage.mouse.wheel(0, -400);
await appPage.waitForTimeout(1500);

// stop -> upload -> extension opens /bugs/<id>
const bugPagePromise = ctx.waitForEvent("page", { timeout: 25000 });
await evalInPanel(`document.getElementById("toggleBugRecording").click()`);
const bugPage = await bugPagePromise;
await bugPage.waitForLoadState("networkidle").catch(() => {});
log("bug page:", bugPage.url());

const video = await bugPage
  .locator("video")
  .first()
  .evaluate(
    (v) =>
      new Promise((res) => {
        const done = () =>
          res({ duration: v.duration, size: `${v.videoWidth}x${v.videoHeight}` });
        v.readyState >= 1 ? done() : (v.onloadedmetadata = done);
        setTimeout(done, 5000);
      }),
  )
  .catch((e) => String(e));
log("video:", JSON.stringify(video));
await bugPage.screenshot({ path: "/tmp/edge-retrace-e2e-bug.png" });

const panelErr = await evalInPanel(
  `document.getElementById("topError")?.textContent?.trim() || "none"`,
);
log("panel error after stop:", panelErr);
ws.close();
await ctx.close();
log("done");
