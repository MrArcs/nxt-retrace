let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: BlobPart[] = [];

function cleanup() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  recorder = null;
  chunks = [];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function startRecording(streamId: string) {
  cleanup();
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: "tab",
        chromeMediaSourceId: streamId,
      },
    } as MediaTrackConstraints,
  });
  chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(1000);
}

async function stopRecording() {
  if (!recorder || recorder.state === "inactive") {
    throw new Error("No recording is in progress.");
  }
  const done = new Promise<Blob>((resolve) => {
    recorder!.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
  });
  recorder.stop();
  const blob = await done;
  cleanup();
  return blobToDataUrl(blob);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.cmd === "offscreenStartRecording") {
    startRecording(msg.streamId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({ error: String(error?.message ?? error) }),
      );
    return true;
  }
  if (msg?.cmd === "offscreenStopRecording") {
    stopRecording()
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((error) =>
        sendResponse({ error: String(error?.message ?? error) }),
      );
    return true;
  }
  if (msg?.cmd === "offscreenDiscardRecording") {
    cleanup();
    sendResponse({ ok: true });
  }
  return false;
});
