import type { Step } from "@pwrec/shared";

const APP_URL = "http://localhost:3000";

interface Session {
  recording: boolean;
  tabId: number | null;
  steps: Step[];
}

const EMPTY: Session = { recording: false, tabId: null, steps: [] };

async function getSession(): Promise<Session> {
  const { session } = await chrome.storage.session.get("session");
  return session ?? EMPTY;
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
    handle(msg, sender).then(sendResponse);
    return true;
  });

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
