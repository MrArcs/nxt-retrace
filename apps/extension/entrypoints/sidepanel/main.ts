import { describeStep, generateSpec, type Step } from "@pwrec/shared";

interface Session {
  recording: boolean;
  tabId: number | null;
  steps: Step[];
  bugRecording: boolean;
  bugTabId: number | null;
  bugStartedAt: number | null;
}

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const toggleBtn = $<HTMLButtonElement>("toggle");
const discardBtn = $<HTMLButtonElement>("discard");
const statusEl = $("status");
const stepsEl = $<HTMLOListElement>("steps");
const emptyEl = $("empty");
const saveBar = $("saveBar");
const nameInput = $<HTMLInputElement>("name");
const errorEl = $("error");
const topErrorEl = $("topError");
const screenshotBtn = $<HTMLButtonElement>("captureScreenshot");
const bugRecordingBtn = $<HTMLButtonElement>("toggleBugRecording");
const discardBugRecordingBtn = $<HTMLButtonElement>("discardBugRecording");
const bugRecordingStatusEl = $("bugRecordingStatus");

let session: Session = {
  recording: false,
  tabId: null,
  steps: [],
  bugRecording: false,
  bugTabId: null,
  bugStartedAt: null,
};

function normalizeSession(value: Partial<Session> | null | undefined): Session {
  return {
    recording: value?.recording ?? false,
    tabId: value?.tabId ?? null,
    steps: value?.steps ?? [],
    bugRecording: value?.bugRecording ?? false,
    bugTabId: value?.bugTabId ?? null,
    bugStartedAt: value?.bugStartedAt ?? null,
  };
}

function render() {
  const { recording, steps } = session;
  statusEl.textContent = recording ? "recording" : "idle";
  statusEl.className = `pill ${recording ? "recording" : "idle"}`;
  toggleBtn.textContent = recording ? "Stop recording" : "Start recording";
  toggleBtn.classList.toggle("recording", recording);
  discardBtn.hidden = !steps.length;
  saveBar.hidden = recording || !steps.length;
  emptyEl.hidden = !!steps.length;
  screenshotBtn.disabled = session.bugRecording;
  bugRecordingBtn.textContent = session.bugRecording
    ? "Stop and upload"
    : "Start recording";
  bugRecordingBtn.classList.toggle("recording", session.bugRecording);
  discardBugRecordingBtn.hidden = !session.bugRecording;
  bugRecordingStatusEl.hidden = !session.bugRecording;
  bugRecordingStatusEl.textContent = session.bugRecording
    ? `Recording bug context${session.bugStartedAt ? ` for ${Math.max(1, Math.round((Date.now() - session.bugStartedAt) / 1000))}s` : ""}`
    : "";

  stepsEl.replaceChildren(
    ...steps.map((step, i) => {
      const li = document.createElement("li");
      const n = document.createElement("span");
      n.className = "n";
      n.textContent = String(i + 1);
      const text = document.createElement("span");
      text.textContent = step.description ?? describeStep(step);
      const x = document.createElement("button");
      x.className = "x";
      x.textContent = "×";
      x.title = "Delete step";
      x.onclick = () =>
        chrome.runtime.sendMessage({ cmd: "deleteStep", index: i });
      li.append(n, text, x);
      return li;
    }),
  );
}

function showError(message: string) {
  errorEl.textContent = message;
  topErrorEl.textContent = message;
  errorEl.hidden = false;
  topErrorEl.hidden = false;
  setTimeout(() => {
    errorEl.hidden = true;
    topErrorEl.hidden = true;
  }, 5000);
}

/** Resolve the browser tab the side panel belongs to (not the SW's window). */
async function sidePanelHttpTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("http")) {
    return {
      tab: null as chrome.tabs.Tab | null,
      error:
        "Open an http(s) page in this window first (not chrome:// or the new-tab page).",
    };
  }
  return { tab, error: null as string | null };
}

/**
 * chrome.tabs.captureVisibleTab / chrome.tabCapture.getMediaStreamId only
 * work while Chrome still considers this click a "user gesture" — that
 * transient state is consumed by any await before the call (even a fast
 * chrome.tabs.query round-trip). So these must be the very first awaited
 * call in each click handler, with no other awaits ahead of them.
 */
function explainCaptureError(error: unknown): string {
  const reason = String(error instanceof Error ? error.message : error);
  if (reason.includes("activeTab") || reason.includes("Chrome pages")) {
    return (
      "Chrome didn't recognize this click as a capture gesture. Click the button again " +
      "without switching tabs first. If it keeps happening, open chrome://extensions, " +
      'open Retrace\'s "Details", and set "Site access" to "On all sites".'
    );
  }
  return reason;
}

/**
 * Fallback recorder for when tabCapture is unavailable (no toolbar-click
 * invocation on the tab). getDisplayMedia works from the side panel without
 * activeTab — the browser shows its own share picker.
 * ponytail: recording lives in this page, so closing the side panel
 * mid-recording loses the footage; move to the offscreen doc if that bites.
 */
let localRecorder: MediaRecorder | null = null;
let localStream: MediaStream | null = null;
let localChunks: BlobPart[] = [];

function discardLocalRecording() {
  localStream?.getTracks().forEach((track) => track.stop());
  localStream = null;
  localRecorder = null;
  localChunks = [];
}

async function startLocalRecording() {
  discardLocalRecording();
  localStream = await navigator.mediaDevices.getDisplayMedia({
    audio: false,
    video: true,
  });
  localRecorder = new MediaRecorder(localStream, { mimeType: "video/webm" });
  localRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) localChunks.push(event.data);
  };
  localRecorder.start(1000);
}

function stopLocalRecording(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!localRecorder || localRecorder.state === "inactive") {
      reject(new Error("No recording is in progress."));
      return;
    }
    localRecorder.onstop = () => {
      const blob = new Blob(localChunks, { type: "video/webm" });
      discardLocalRecording();
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    };
    localRecorder.stop();
  });
}

async function refresh() {
  const { session: s } = await chrome.storage.session.get("session");
  session = normalizeSession(s);
  render();
}

toggleBtn.onclick = async () => {
  const { tab, error: tabError } = await sidePanelHttpTab();
  if (!session.recording && !tab) {
    showError(tabError!);
    return;
  }
  const res = await chrome.runtime.sendMessage({
    cmd: session.recording ? "stop" : "start",
    tabId: tab?.id,
  });
  if (res?.error) showError(res.error);
};
discardBtn.onclick = () => chrome.runtime.sendMessage({ cmd: "discard" });

screenshotBtn.onclick = async () => {
  screenshotBtn.disabled = true;
  screenshotBtn.textContent = "Capturing...";

  // Capture first — before any other awaited call — so Chrome still
  // recognizes this as the click's own gesture. No windowId needed: it
  // defaults to the side panel's own window.
  let dataUrl: string;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
  } catch (error) {
    showError(explainCaptureError(error));
    screenshotBtn.disabled = false;
    screenshotBtn.textContent = "Capture screenshot";
    return;
  }

  try {
    const { tab, error: tabError } = await sidePanelHttpTab();
    if (!tab) {
      showError(tabError!);
      return;
    }
    const res = await chrome.runtime.sendMessage({
      cmd: "captureScreenshot",
      tabId: tab.id,
      dataUrl,
    });
    if (res?.error) showError(res.error);
  } catch (error) {
    showError(String(error instanceof Error ? error.message : error));
  } finally {
    screenshotBtn.disabled = false;
    screenshotBtn.textContent = "Capture screenshot";
  }
};

bugRecordingBtn.onclick = async () => {
  bugRecordingBtn.disabled = true;
  bugRecordingBtn.textContent = session.bugRecording
    ? "Uploading..."
    : "Starting...";
  try {
    if (session.bugRecording) {
      // Local (getDisplayMedia) recordings are finalized here; offscreen
      // (tabCapture) recordings are finalized by the background.
      let dataUrl: string | null = null;
      if (localRecorder) {
        try {
          dataUrl = await stopLocalRecording();
        } catch (error) {
          showError(String(error instanceof Error ? error.message : error));
          return;
        }
      }
      const res = await chrome.runtime.sendMessage({
        cmd: "stopBugRecording",
        dataUrl,
      });
      if (res?.error) showError(res.error);
      return;
    }

    // getMediaStreamId first — before any other awaited call — so this
    // click's gesture is still valid. No targetTabId: it defaults to the
    // side panel's own active tab. It only succeeds if the toolbar icon was
    // clicked on this tab (activeTab invocation); otherwise fall back to
    // recording right here via the browser's share picker.
    let streamId: string | null = null;
    try {
      streamId = await chrome.tabCapture.getMediaStreamId({});
    } catch {
      try {
        await startLocalRecording();
      } catch (error) {
        showError(String(error instanceof Error ? error.message : error));
        return;
      }
    }

    const { tab, error: tabError } = await sidePanelHttpTab();
    if (!tab) {
      discardLocalRecording();
      showError(tabError!);
      return;
    }
    const res = await chrome.runtime.sendMessage({
      cmd: "startBugRecording",
      tabId: tab.id,
      streamId,
    });
    if (res?.error) {
      discardLocalRecording();
      showError(res.error);
    }
  } catch (error) {
    showError(String(error instanceof Error ? error.message : error));
  } finally {
    bugRecordingBtn.disabled = false;
    await refresh();
  }
};

discardBugRecordingBtn.onclick = async () => {
  discardLocalRecording();
  const res = await chrome.runtime.sendMessage({ cmd: "discardBugRecording" });
  if (res?.error) showError(res.error);
  await refresh();
};

$("copy").onclick = async () => {
  const { code } = generateSpec(
    nameInput.value.trim() || "Recorded flow",
    session.steps,
  );
  await navigator.clipboard.writeText(code);
  const btn = $<HTMLButtonElement>("copy");
  btn.textContent = "Copied!";
  setTimeout(() => (btn.textContent = "Copy code"), 1500);
};

$("save").onclick = async () => {
  const res = await chrome.runtime.sendMessage({
    cmd: "save",
    name: nameInput.value.trim(),
  });
  if (res?.error) showError(res.error);
};

chrome.storage.session.onChanged.addListener(refresh);
refresh();
setInterval(() => {
  if (session.bugRecording) render();
}, 1000);
