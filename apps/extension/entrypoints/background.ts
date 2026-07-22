import type { BugContext, BugEventEntry, BugKind, Step } from "@pwrec/shared";

const APP_URL = "http://localhost:3000";

interface Session {
  recording: boolean;
  tabId: number | null;
  steps: Step[];
  bugRecording: boolean;
  bugTabId: number | null;
  bugStartedAt: number | null;
}

const EMPTY: Session = {
  recording: false,
  tabId: null,
  steps: [],
  bugRecording: false,
  bugTabId: null,
  bugStartedAt: null,
};

type BugBuffer = Pick<BugContext, "console" | "network" | "events">;

type BugProbeEntry =
  | { bucket: "console"; value: BugContext["console"][number] }
  | { bucket: "network"; value: BugContext["network"][number] }
  | { bucket: "events"; value: BugContext["events"][number] };

const bugBuffers = new Map<number, BugBuffer>();

function bufferFor(tabId: number): BugBuffer {
  const current = bugBuffers.get(tabId);
  if (current) return current;
  const next = { console: [], network: [], events: [] };
  bugBuffers.set(tabId, next);
  return next;
}

async function getSession(): Promise<Session> {
  const { session } = await chrome.storage.session.get("session");
  return { ...EMPTY, ...(session ?? {}) };
}

// serialize read-modify-write so rapid step messages don't clobber each other
let queue: Promise<unknown> = Promise.resolve();
function withSession(fn: (s: Session) => Session): Promise<void> {
  const next = queue.then(async () => {
    const s = await getSession();
    await chrome.storage.session.set({ session: fn(s) });
  });
  queue = next.catch(() => {});
  return next;
}

function notifyTab(tabId: number | null, recording: boolean) {
  if (tabId == null) return;
  chrome.tabs
    .sendMessage(tabId, { cmd: "recordingChanged", recording })
    .catch(() => {});
}

function rememberBugEntry(tabId: number | undefined, entry: unknown) {
  if (tabId == null) return;
  const candidate = entry as Partial<BugProbeEntry>;
  if (
    candidate.bucket !== "console" &&
    candidate.bucket !== "network" &&
    candidate.bucket !== "events"
  ) {
    return;
  }
  const buffer = bufferFor(tabId);
  const list = buffer[candidate.bucket] as unknown[];
  list.push(candidate.value);
  if (list.length > 200) list.splice(0, list.length - 200);
}

function installRetraceBugProbe() {
  const w = window as typeof window & {
    __retraceBugProbe?: {
      snapshot: () => unknown;
      emit: (bucket: string, value: unknown) => void;
    };
  };
  if (w.__retraceBugProbe) return;

  const MAX = 200;
  const consoleEntries: unknown[] = [];
  const networkEntries: unknown[] = [];
  const eventEntries: unknown[] = [];
  const push = (list: unknown[], value: unknown) => {
    list.push(value);
    if (list.length > MAX) list.splice(0, list.length - MAX);
  };
  const emit = (bucket: string, value: unknown) => {
    const list =
      bucket === "console"
        ? consoleEntries
        : bucket === "network"
          ? networkEntries
          : eventEntries;
    push(list, value);
    window.postMessage(
      {
        source: "retrace-bug-probe",
        kind: "entry",
        payload: { bucket, value },
      },
      "*",
    );
  };
  const text = (args: unknown[]) =>
    args
      .map((arg) => {
        if (typeof arg === "string") return arg;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(" ");

  (["log", "info", "warn", "error"] as const).forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      emit("console", {
        level,
        text: text(args),
        timestamp: Date.now(),
        url: location.href,
      });
      original(...args);
    };
  });

  window.addEventListener("error", (event) => {
    emit("console", {
      level: "pageerror",
      text: event.message,
      timestamp: Date.now(),
      url: event.filename || location.href,
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    emit("console", {
      level: "unhandledrejection",
      text: String(event.reason),
      timestamp: Date.now(),
      url: location.href,
    });
  });

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = performance.now();
    const method =
      init?.method ??
      (typeof input === "object" && "method" in input ? input.method : "GET");
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    try {
      const response = await originalFetch(input, init);
      emit("network", {
        method,
        url,
        status: response.status,
        durationMs: Math.round(performance.now() - started),
        timestamp: Date.now(),
        resourceType: "fetch",
      });
      return response;
    } catch (error) {
      emit("network", {
        method,
        url,
        status: 0,
        durationMs: Math.round(performance.now() - started),
        timestamp: Date.now(),
        resourceType: "fetch",
        failure: String(error),
      });
      throw error;
    }
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    (
      this as XMLHttpRequest & {
        __retraceRequest?: { method: string; url: string; started: number };
      }
    ).__retraceRequest = {
      method,
      url: String(url),
      started: performance.now(),
    };
    return originalOpen.call(
      this,
      method,
      url,
      ...(rest as [boolean?, string?, string?]),
    );
  };
  XMLHttpRequest.prototype.send = function (...args: unknown[]) {
    const request = (
      this as XMLHttpRequest & {
        __retraceRequest?: { method: string; url: string; started: number };
      }
    ).__retraceRequest;
    if (request) {
      this.addEventListener("loadend", () => {
        emit("network", {
          method: request.method,
          url: request.url,
          status: this.status,
          durationMs: Math.round(performance.now() - request.started),
          timestamp: Date.now(),
          resourceType: "xhr",
        });
      });
    }
    return originalSend.apply(
      this,
      args as [Document | XMLHttpRequestBodyInit | null?],
    );
  };

  const describeTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return "page";
    const label =
      target.getAttribute("aria-label") ||
      target.getAttribute("placeholder") ||
      target.textContent?.trim() ||
      target.getAttribute("name") ||
      target.id ||
      target.tagName.toLowerCase();
    return label.slice(0, 120);
  };
  ["click", "dblclick", "input", "change"].forEach((type) => {
    window.addEventListener(
      type,
      (event) => {
        if (!(event instanceof Event) || !event.isTrusted) return;
        emit("events", {
          type,
          description: `${type} ${describeTarget(event.target)}`,
          timestamp: Date.now(),
          url: location.href,
        });
      },
      true,
    );
  });

  const snapshot = () => ({
    pageUrl: location.href,
    title: document.title,
    timestamp: Date.now(),
    device: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      screen: { width: window.screen.width, height: window.screen.height },
    },
    console: consoleEntries,
    network: [
      ...performance
        .getEntriesByType("resource")
        .slice(-MAX)
        .map((entry) => ({
          method: "GET",
          url: entry.name,
          status: 0,
          durationMs: Math.round(entry.duration),
          timestamp: Date.now(),
          resourceType: entry.initiatorType,
        })),
      ...networkEntries,
    ].slice(-MAX),
    events: eventEntries,
  });

  window.addEventListener("message", (event) => {
    if (
      event.source === window &&
      event.data?.source === "retrace-content" &&
      event.data.kind === "snapshot-request"
    ) {
      window.postMessage(
        {
          source: "retrace-bug-probe",
          kind: "snapshot",
          requestId: event.data.requestId,
          payload: snapshot(),
        },
        "*",
      );
    }
  });
  w.__retraceBugProbe = { snapshot, emit };
}

async function installBugProbe(tabId: number) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: installRetraceBugProbe,
    });
  } catch {
    /* pages like chrome:// cannot be instrumented */
  }
}

async function activeHttpTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("http")) {
    return {
      error: "Open an http(s) page in the active tab first.",
      tab: null,
    };
  }
  return { tab, error: null };
}

function fallbackBugContext(tab: chrome.tabs.Tab): BugContext {
  return {
    pageUrl: tab.url ?? "",
    title: tab.title ?? "Captured bug",
    timestamp: Date.now(),
    device: {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      viewport: { width: 0, height: 0 },
      screen: { width: 0, height: 0 },
    },
    console: [],
    network: [],
    events: [],
  };
}

function mergeBugContext(tabId: number, snapshot: BugContext): BugContext {
  const buffered = bugBuffers.get(tabId);
  if (!buffered) return snapshot;
  const eventKey = (entry: {
    timestamp: number;
    type?: string;
    text?: string;
    url?: string;
  }) =>
    `${entry.timestamp}:${entry.type ?? entry.text ?? ""}:${entry.url ?? ""}`;
  const merge = <
    T extends { timestamp: number; type?: string; text?: string; url?: string },
  >(
    a: T[],
    b: T[],
  ) => {
    const seen = new Set<string>();
    return [...a, ...b].filter((entry) => {
      const key = eventKey(entry);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  return {
    ...snapshot,
    console: merge(buffered.console, snapshot.console).slice(-200),
    network: merge(buffered.network, snapshot.network).slice(-200),
    events: merge(buffered.events, snapshot.events).slice(-200),
  };
}

async function getBugContext(tab: chrome.tabs.Tab): Promise<BugContext> {
  if (!tab.id) return fallbackBugContext(tab);
  const tabId = tab.id;
  await installBugProbe(tabId);
  const request = async () => {
    // hard timeout so a page that never responds can't hang the capture
    const context = (await Promise.race([
      chrome.tabs.sendMessage(tabId, { cmd: "getBugContext" }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("context timeout")), 2000),
      ),
    ])) as BugContext;
    if (!context) throw new Error("empty context");
    return context;
  };
  try {
    return mergeBugContext(tabId, await request());
  } catch {
    // the relay content script is missing on pages loaded before the
    // extension was (re)loaded — inject it and retry once
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content-scripts/content.js"],
      });
      return mergeBugContext(tabId, await request());
    } catch {
      return mergeBugContext(tabId, fallbackBugContext(tab));
    }
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((res) => res.blob());
}

async function uploadBug(kind: BugKind, media: Blob, context: BugContext) {
  const ext = kind === "screenshot" ? "png" : "webm";
  const form = new FormData();
  form.set("kind", kind);
  form.set("title", context.title ? `Bug on ${context.title}` : "Captured bug");
  form.set("pageUrl", context.pageUrl);
  form.set("context", JSON.stringify(context));
  form.set("media", media, `bug.${ext}`);

  const res = await fetch(`${APP_URL}/api/bugs`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    return {
      error: `Upload failed (HTTP ${res.status}). Is the Retrace app running?`,
    };
  }
  return (await res.json()) as { id: string };
}

async function ensureOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: chrome.runtime.getURL("offscreen.html"),
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Record the active tab for a Retrace bug report.",
  });
}

function bugEvent(description: string, tab: chrome.tabs.Tab): BugEventEntry {
  return {
    type: "capture",
    description,
    timestamp: Date.now(),
    url: tab.url ?? "",
  };
}

function sameLocator(a: Step, b: Step): boolean {
  return (
    "locator" in a &&
    "locator" in b &&
    JSON.stringify(a.locator[0]) === JSON.stringify(b.locator[0])
  );
}

function appendStep(steps: Step[], step: Step): Step[] {
  // a dblclick fires after its two click events — collapse them
  if (step.type === "dblclick") {
    let out = [...steps];
    while (
      out.length &&
      out.at(-1)!.type === "click" &&
      sameLocator(out.at(-1)!, step)
    )
      out = out.slice(0, -1);
    return [...out, step];
  }
  return [...steps, step];
}

async function handle(
  msg: { cmd: string; [k: string]: unknown },
  sender: chrome.runtime.MessageSender,
) {
  switch (msg.cmd) {
    case "start": {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id || !tab.url?.startsWith("http")) {
        return {
          error: "Open an http(s) page in the active tab to start recording.",
        };
      }
      const goto: Step = {
        type: "goto",
        url: tab.url,
        description: `Go to ${tab.url}`,
      };
      await withSession(() => ({
        recording: true,
        tabId: tab.id!,
        steps: [goto],
      }));
      notifyTab(tab.id, true);
      return { ok: true };
    }
    case "stop": {
      const s = await getSession();
      await withSession((cur) => ({ ...cur, recording: false }));
      notifyTab(s.tabId, false);
      return { ok: true };
    }
    case "discard": {
      const s = await getSession();
      await withSession(() => EMPTY);
      notifyTab(s.tabId, false);
      return { ok: true };
    }
    case "bugContextEntry": {
      rememberBugEntry(sender.tab?.id, msg.entry);
      return { ok: true };
    }
    case "captureScreenshot": {
      const { tab, error } = await activeHttpTab();
      if (!tab) return { error };
      await installBugProbe(tab.id!);
      let dataUrl: string;
      try {
        dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
          format: "png",
        });
      } catch (captureError) {
        const reason =
          captureError instanceof Error
            ? captureError.message
            : String(captureError);
        return {
          error: `Screenshot failed: ${reason} — open the extension's details in your browser and set "Site access" to "On all sites", then reload the page and try again.`,
        };
      }
      const context = await getBugContext(tab);
      context.events = [
        ...context.events,
        bugEvent("Captured screenshot", tab),
      ].slice(-200);
      try {
        const result = await uploadBug(
          "screenshot",
          await dataUrlToBlob(dataUrl),
          context,
        );
        if ("error" in result) return result;
        chrome.tabs.create({ url: `${APP_URL}/bugs/${result.id}?annotate=1` });
        return { ok: true, id: result.id };
      } catch {
        return {
          error: `Could not reach ${APP_URL}. Start the app with "npm run dev:web".`,
        };
      }
    }
    case "startBugRecording": {
      const { tab, error } = await activeHttpTab();
      if (!tab) return { error };
      await installBugProbe(tab.id!);
      await ensureOffscreenDocument();
      const streamId = await chrome.tabCapture.getMediaStreamId({
        targetTabId: tab.id,
      });
      const started = await chrome.runtime.sendMessage({
        cmd: "offscreenStartRecording",
        streamId,
      });
      if (started?.error) return started;
      await withSession((cur) => ({
        ...cur,
        bugRecording: true,
        bugTabId: tab.id!,
        bugStartedAt: Date.now(),
      }));
      return { ok: true };
    }
    case "stopBugRecording": {
      const s = await getSession();
      if (!s.bugRecording || s.bugTabId == null) {
        return { error: "No bug recording is in progress." };
      }
      const tab = await chrome.tabs.get(s.bugTabId);
      const stopped = await chrome.runtime.sendMessage({
        cmd: "offscreenStopRecording",
      });
      await withSession((cur) => ({
        ...cur,
        bugRecording: false,
        bugTabId: null,
        bugStartedAt: null,
      }));
      if (stopped?.error) return stopped;
      const context = await getBugContext(tab);
      context.events = [
        ...context.events,
        bugEvent("Stopped tab recording", tab),
      ].slice(-200);
      try {
        const result = await uploadBug(
          "recording",
          await dataUrlToBlob(stopped.dataUrl),
          context,
        );
        if ("error" in result) return result;
        chrome.tabs.create({ url: `${APP_URL}/bugs/${result.id}` });
        return { ok: true, id: result.id };
      } catch {
        return {
          error: `Could not reach ${APP_URL}. Start the app with "npm run dev:web".`,
        };
      }
    }
    case "discardBugRecording": {
      await chrome.runtime
        .sendMessage({ cmd: "offscreenDiscardRecording" })
        .catch(() => {});
      await withSession((cur) => ({
        ...cur,
        bugRecording: false,
        bugTabId: null,
        bugStartedAt: null,
      }));
      return { ok: true };
    }
    case "step": {
      const s = await getSession();
      if (sender.tab?.id !== s.tabId) return { ok: false };
      await withSession((cur) => ({
        ...cur,
        steps: appendStep(cur.steps, msg.step as Step),
      }));
      return { ok: true };
    }
    case "isRecording": {
      const s = await getSession();
      return { recording: s.recording && sender.tab?.id === s.tabId };
    }
    case "deleteStep": {
      await withSession((cur) => ({
        ...cur,
        steps: cur.steps.filter((_, i) => i !== msg.index),
      }));
      return { ok: true };
    }
    case "save": {
      const s = await getSession();
      if (!s.steps.length) return { error: "Nothing recorded yet." };
      try {
        const res = await fetch(`${APP_URL}/api/recordings`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: msg.name || "Recorded flow",
            url: s.steps[0].type === "goto" ? s.steps[0].url : "",
            steps: s.steps,
          }),
        });
        if (!res.ok)
          return {
            error: `Save failed (HTTP ${res.status}). Is the Retrace app running?`,
          };
        const data = await res.json();
        await withSession(() => EMPTY);
        notifyTab(s.tabId, false);
        chrome.tabs.create({ url: `${APP_URL}/scripts/${data.id}` });
        return { ok: true, id: data.id };
      } catch {
        return {
          error: `Could not reach ${APP_URL}. Start the app with "npm run dev:web".`,
        };
      }
    }
    default:
      return { error: `Unknown command: ${msg.cmd}` };
  }
}

export default defineBackground(() => {
  chrome.sidePanel
    ?.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {});

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handle(msg, sender)
      .then(sendResponse)
      // an unhandled throw would leave the sender awaiting forever
      .catch((error) =>
        sendResponse({ error: String(error?.message ?? error) }),
      );
    return true;
  });

  // install the debug probe on every page load so console/network/event
  // history is already buffered by the time the user captures a bug
  chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0 || !details.url?.startsWith("http")) return;
    bugBuffers.delete(details.tabId);
    installBugProbe(details.tabId);
  });
  chrome.tabs.onRemoved.addListener((tabId) => bugBuffers.delete(tabId));

  // address-bar navigations while recording become goto steps
  chrome.webNavigation.onCommitted.addListener(async (details) => {
    const s = await getSession();
    if (!s.recording || details.tabId !== s.tabId || details.frameId !== 0)
      return;
    if (
      !["typed", "reload", "auto_bookmark", "generated"].includes(
        details.transitionType,
      )
    )
      return;
    const last = s.steps.at(-1);
    if (last?.type === "goto" && last.url === details.url) return;
    await withSession((cur) => ({
      ...cur,
      steps: [
        ...cur.steps,
        { type: "goto", url: details.url, description: `Go to ${details.url}` },
      ],
    }));
  });
});
