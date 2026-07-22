import { describeStep, type FillStep, type Step } from '@pwrec/shared';
import { getCandidates } from './selector';

type Emit = (step: Step) => void;

const INTERACTIVE = 'button, a[href], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="option"], [role="checkbox"], [role="radio"], input, select, textarea, label, [data-testid]';

function resolveTarget(raw: EventTarget | null): Element | null {
  if (!(raw instanceof Element)) return null;
  return raw.closest(INTERACTIVE) ?? raw;
}

/** Attach capture-phase listeners; returns a detach function (flushes pending input). */
export function startRecorder(rawEmit: Emit): () => void {
  let pendingFill: { el: Element; step: FillStep } | null = null;

  const emit = (step: Step) => rawEmit({ ...step, description: describeStep(step) });

  // a selector-engine error must never crash the page's event handling mid-recording;
  // worst case we drop one step instead of the whole session
  const safe = <E extends Event>(fn: (e: E) => void) => (e: E) => {
    try {
      fn(e);
    } catch {
      /* step dropped */
    }
  };

  const flush = () => {
    if (pendingFill) {
      emit(pendingFill.step);
      pendingFill = null;
    }
  };

  const onClick = safe((e: MouseEvent) => {
    if (!e.isTrusted) return;
    const el = resolveTarget(e.target);
    if (!el) return;
    // checkbox/radio/select are recorded via the change event instead
    if (el instanceof HTMLSelectElement) return;
    if (el instanceof HTMLInputElement && ['checkbox', 'radio', 'file'].includes(el.type)) return;
    if (pendingFill && pendingFill.el !== el) flush();
    emit({ type: e.type === 'dblclick' ? 'dblclick' : 'click', locator: getCandidates(el) });
  });

  const onInput = safe((e: Event) => {
    if (!e.isTrusted) return;
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    if (el instanceof HTMLInputElement && ['checkbox', 'radio', 'file'].includes(el.type)) return;
    if (pendingFill && pendingFill.el === el) {
      pendingFill = { el, step: { ...pendingFill.step, value: el.value } };
    } else {
      flush();
      pendingFill = { el, step: { type: 'fill', locator: getCandidates(el), value: el.value } };
    }
  });

  const onChange = safe((e: Event) => {
    if (!e.isTrusted) return;
    const el = e.target;
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      emit({ type: el.checked ? 'check' : 'uncheck', locator: getCandidates(el) });
    } else if (el instanceof HTMLInputElement && el.type === 'radio') {
      emit({ type: 'check', locator: getCandidates(el) });
    } else if (el instanceof HTMLInputElement && el.type === 'file') {
      emit({ type: 'upload', locator: getCandidates(el), fileName: el.files?.[0]?.name ?? '' });
    } else if (el instanceof HTMLSelectElement) {
      emit({
        type: 'select',
        locator: getCandidates(el),
        values: [...el.selectedOptions].map((o) => o.value),
      });
    }
  });

  const onKeydown = safe((e: KeyboardEvent) => {
    if (!e.isTrusted || e.key !== 'Enter') return;
    const el = e.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    const locator = pendingFill?.el === el ? pendingFill.step.locator : getCandidates(el);
    flush();
    emit({ type: 'press', locator, key: 'Enter' });
  });

  const onFocusOut = () => flush();

  window.addEventListener('click', onClick, true);
  window.addEventListener('dblclick', onClick, true);
  window.addEventListener('input', onInput, true);
  window.addEventListener('change', onChange, true);
  window.addEventListener('keydown', onKeydown, true);
  window.addEventListener('focusout', onFocusOut, true);

  return () => {
    flush();
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('dblclick', onClick, true);
    window.removeEventListener('input', onInput, true);
    window.removeEventListener('change', onChange, true);
    window.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('focusout', onFocusOut, true);
  };
}
