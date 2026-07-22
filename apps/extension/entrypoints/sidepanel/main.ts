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
    : "Record tab";
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

async function refresh() {
  const { session: s } = await chrome.storage.session.get("session");
  session = normalizeSession(s);
  render();
}

toggleBtn.onclick = async () => {
  const res = await chrome.runtime.sendMessage({
    cmd: session.recording ? "stop" : "start",
  });
  if (res?.error) showError(res.error);
};
discardBtn.onclick = () => chrome.runtime.sendMessage({ cmd: "discard" });

screenshotBtn.onclick = async () => {
  screenshotBtn.disabled = true;
  screenshotBtn.textContent = "Capturing...";
  try {
    const res = await chrome.runtime.sendMessage({ cmd: "captureScreenshot" });
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
    const res = await chrome.runtime.sendMessage({
      cmd: session.bugRecording ? "stopBugRecording" : "startBugRecording",
    });
    if (res?.error) showError(res.error);
  } catch (error) {
    showError(String(error instanceof Error ? error.message : error));
  } finally {
    bugRecordingBtn.disabled = false;
    await refresh();
  }
};

discardBugRecordingBtn.onclick = async () => {
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
