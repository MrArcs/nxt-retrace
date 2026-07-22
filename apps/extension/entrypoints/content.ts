import type { Step } from '@pwrec/shared';
import { startRecorder } from '@/lib/recorder';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    let detach: (() => void) | null = null;

    const start = () => {
      if (detach) return;
      detach = startRecorder((step: Step) => {
        chrome.runtime.sendMessage({ cmd: 'step', step }).catch(() => {});
      });
    };
    const stop = () => {
      detach?.();
      detach = null;
    };

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.cmd === 'recordingChanged') (msg.recording ? start : stop)();
    });

    // pick up an in-progress recording after a page navigation
    chrome.runtime
      .sendMessage({ cmd: 'isRecording' })
      .then((res) => {
        if (res?.recording) start();
      })
      .catch(() => {});
  },
});
