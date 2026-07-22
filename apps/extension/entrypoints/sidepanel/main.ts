import { describeStep, generateSpec, type Step } from '@pwrec/shared';

interface Session {
  recording: boolean;
  tabId: number | null;
  steps: Step[];
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const toggleBtn = $<HTMLButtonElement>('toggle');
const discardBtn = $<HTMLButtonElement>('discard');
const statusEl = $('status');
const stepsEl = $<HTMLOListElement>('steps');
const emptyEl = $('empty');
const saveBar = $('saveBar');
const nameInput = $<HTMLInputElement>('name');
const errorEl = $('error');

let session: Session = { recording: false, tabId: null, steps: [] };

function render() {
  const { recording, steps } = session;
  statusEl.textContent = recording ? 'recording' : 'idle';
  statusEl.className = `pill ${recording ? 'recording' : 'idle'}`;
  toggleBtn.textContent = recording ? 'Stop recording' : 'Start recording';
  toggleBtn.classList.toggle('recording', recording);
  discardBtn.hidden = !steps.length;
  saveBar.hidden = recording || !steps.length;
  emptyEl.hidden = !!steps.length;

  stepsEl.replaceChildren(
    ...steps.map((step, i) => {
      const li = document.createElement('li');
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = String(i + 1);
      const text = document.createElement('span');
      text.textContent = step.description ?? describeStep(step);
      const x = document.createElement('button');
      x.className = 'x';
      x.textContent = '×';
      x.title = 'Delete step';
      x.onclick = () => chrome.runtime.sendMessage({ cmd: 'deleteStep', index: i });
      li.append(n, text, x);
      return li;
    }),
  );
}

function showError(message: string) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  setTimeout(() => (errorEl.hidden = true), 5000);
}

async function refresh() {
  const { session: s } = await chrome.storage.session.get('session');
  session = s ?? { recording: false, tabId: null, steps: [] };
  render();
}

toggleBtn.onclick = async () => {
  const res = await chrome.runtime.sendMessage({ cmd: session.recording ? 'stop' : 'start' });
  if (res?.error) showError(res.error);
};
discardBtn.onclick = () => chrome.runtime.sendMessage({ cmd: 'discard' });

$('copy').onclick = async () => {
  const { code } = generateSpec(nameInput.value.trim() || 'Recorded flow', session.steps);
  await navigator.clipboard.writeText(code);
  const btn = $<HTMLButtonElement>('copy');
  btn.textContent = 'Copied!';
  setTimeout(() => (btn.textContent = 'Copy code'), 1500);
};

$('save').onclick = async () => {
  const res = await chrome.runtime.sendMessage({ cmd: 'save', name: nameInput.value.trim() });
  if (res?.error) showError(res.error);
};

chrome.storage.session.onChanged.addListener(refresh);
refresh();
