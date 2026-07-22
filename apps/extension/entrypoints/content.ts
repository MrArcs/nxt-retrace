import type { Step } from "@pwrec/shared";
import { startRecorder } from "@/lib/recorder";

interface BugProbeMessage {
  source?: string;
  kind?: string;
  requestId?: string;
  payload?: unknown;
}

function fallbackContext() {
  return {
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
    console: [],
    network: [],
    events: [],
  };
}

function requestProbeSnapshot(): Promise<unknown> {
  return new Promise((resolve) => {
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(fallbackContext());
    }, 500);

    const onMessage = (event: MessageEvent<BugProbeMessage>) => {
      if (
        event.source !== window ||
        event.data?.source !== "retrace-bug-probe" ||
        event.data.kind !== "snapshot" ||
        event.data.requestId !== requestId
      ) {
        return;
      }
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(event.data.payload ?? fallbackContext());
    };

    window.addEventListener("message", onMessage);
    window.postMessage(
      { source: "retrace-content", kind: "snapshot-request", requestId },
      "*",
    );
  });
}

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    let detach: (() => void) | null = null;

    const start = () => {
      if (detach) return;
      detach = startRecorder((step: Step) => {
        chrome.runtime.sendMessage({ cmd: "step", step }).catch(() => {});
      });
    };
    const stop = () => {
      detach?.();
      detach = null;
    };

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.cmd === "recordingChanged") (msg.recording ? start : stop)();
      if (msg?.cmd === "getBugContext") {
        // chrome doesn't support returning a Promise here — must use sendResponse
        requestProbeSnapshot()
          .then(sendResponse)
          .catch(() => sendResponse(fallbackContext()));
        return true;
      }
    });

    window.addEventListener(
      "message",
      (event: MessageEvent<BugProbeMessage>) => {
        if (
          event.source !== window ||
          event.data?.source !== "retrace-bug-probe" ||
          event.data.kind !== "entry"
        ) {
          return;
        }
        chrome.runtime
          .sendMessage({ cmd: "bugContextEntry", entry: event.data.payload })
          .catch(() => {});
      },
    );

    // pick up an in-progress recording after a page navigation
    chrome.runtime
      .sendMessage({ cmd: "isRecording" })
      .then((res) => {
        if (res?.recording) start();
      })
      .catch(() => {});
  },
});
