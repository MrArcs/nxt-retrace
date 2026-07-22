import type { LocatorCandidate } from '@pwrec/shared';

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** css selectors matching each implicit ARIA role we care about */
const ROLE_SELECTORS: Record<string, string> = {
  button: 'button, [role="button"], input[type="button"], input[type="submit"], input[type="reset"]',
  link: 'a[href], [role="link"]',
  checkbox: 'input[type="checkbox"], [role="checkbox"]',
  radio: 'input[type="radio"], [role="radio"]',
  combobox: 'select:not([multiple]), [role="combobox"]',
  listbox: 'select[multiple], [role="listbox"]',
  textbox:
    'textarea, input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input:not([type]), [role="textbox"]',
  searchbox: 'input[type="search"], [role="searchbox"]',
  spinbutton: 'input[type="number"], [role="spinbutton"]',
  slider: 'input[type="range"], [role="slider"]',
  heading: 'h1, h2, h3, h4, h5, h6, [role="heading"]',
  img: 'img, [role="img"]',
  tab: '[role="tab"]',
  menuitem: '[role="menuitem"]',
  option: 'option, [role="option"]',
};

function roleOf(el: Element): string | null {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;
  for (const [role, sel] of Object.entries(ROLE_SELECTORS)) {
    if (el.matches(sel)) return role;
  }
  return null;
}

function labelText(el: Element): string | null {
  const labels = (el as HTMLInputElement).labels;
  if (labels?.length) return norm(labels[0].textContent ?? '') || null;
  const wrapping = el.closest('label');
  if (wrapping) return norm(wrapping.textContent ?? '') || null;
  return null;
}

function isFormControl(el: Element): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
  );
}

export function accessibleName(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return norm(aria);
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => el.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ');
    if (norm(text)) return norm(text);
  }
  if (isFormControl(el)) {
    if (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type)) {
      return norm(el.value);
    }
    const lbl = labelText(el);
    if (lbl) return lbl;
    return '';
  }
  if (el instanceof HTMLImageElement) return norm(el.alt);
  const text = norm(el.textContent ?? '');
  if (text && text.length <= 80) return text;
  return norm(el.getAttribute('title') ?? '');
}

function withNth(matches: Element[], el: Element, c: LocatorCandidate): LocatorCandidate | null {
  const i = matches.indexOf(el);
  if (i < 0) return null;
  return matches.length === 1 ? c : { ...c, nth: i };
}

function cssPath(el: Element): string {
  const doc = el.ownerDocument;
  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) {
    const sel = `#${el.id}`;
    if (doc.querySelectorAll(sel).length === 1) return sel;
  }
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== doc.documentElement && parts.length < 6) {
    let part = cur.tagName.toLowerCase();
    // ponytail: heuristic "stable class" filter — skips hashed/utility-looking names; css is the last-resort candidate anyway
    const stable = [...cur.classList].filter((c) => /^[A-Za-z][A-Za-z_-]*$/.test(c) && c.length <= 24).slice(0, 2);
    if (stable.length) part += '.' + stable.join('.');
    const parent: Element | null = cur.parentElement;
    if (parent) {
      const sameMatch = [...parent.children].filter((s) => s.matches(part));
      if (sameMatch.length > 1) part += `:nth-child(${[...parent.children].indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    if (doc.querySelectorAll(parts.join(' > ')).length === 1) return parts.join(' > ');
    cur = parent;
  }
  return parts.join(' > ');
}

/**
 * Compute locator candidates for an element, best first, mirroring
 * Playwright's recommended priority: testId > role > label > placeholder > css.
 */
export function getCandidates(el: Element): LocatorCandidate[] {
  const doc = el.ownerDocument;
  const out: LocatorCandidate[] = [];

  const tid = el.getAttribute('data-testid');
  if (tid) {
    const matches = [...doc.querySelectorAll(`[data-testid="${CSS.escape(tid)}"]`)];
    const cand = withNth(matches, el, { kind: 'testId', value: tid });
    if (cand) out.push(cand);
  }

  const role = roleOf(el);
  if (role) {
    const name = accessibleName(el);
    const sel = ROLE_SELECTORS[role] ?? `[role="${role}"]`;
    let matches = [...doc.querySelectorAll(sel)];
    if (name) {
      const lower = name.toLowerCase();
      matches = matches.filter((m) => accessibleName(m).toLowerCase() === lower);
    }
    const cand = withNth(matches, el, { kind: 'role', value: role, name: name || undefined });
    // a nameless role + nth is purely positional — weaker than the css fallback, skip it
    if (cand && (name || cand.nth == null)) out.push(cand);
  }

  if (isFormControl(el)) {
    const lbl = labelText(el);
    if (lbl) {
      // getByLabel also matches aria-label/aria-labelledby, so compare accessible
      // names — not just <label> text — or runtime can find more elements than us
      const lower = lbl.toLowerCase();
      const matches = [...doc.querySelectorAll('input, textarea, select')].filter(
        (m) => (labelText(m) ?? accessibleName(m)).toLowerCase() === lower,
      );
      const cand = withNth(matches, el, { kind: 'label', value: lbl });
      if (cand) out.push(cand);
    }
    const ph = el.getAttribute('placeholder');
    if (ph) {
      const matches = [...doc.querySelectorAll(`[placeholder="${CSS.escape(ph)}"]`)];
      const cand = withNth(matches, el, { kind: 'placeholder', value: ph });
      if (cand) out.push(cand);
    }
  }

  out.push({ kind: 'css', value: cssPath(el) });
  return out;
}
