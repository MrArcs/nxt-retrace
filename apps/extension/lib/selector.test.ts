import { beforeEach, describe, expect, it } from 'vitest';
import { getCandidates } from './selector';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('getCandidates', () => {
  it('prefers data-testid', () => {
    document.body.innerHTML = `<button data-testid="submit-btn">Go</button>`;
    const [first] = getCandidates(document.querySelector('button')!);
    expect(first).toEqual({ kind: 'testId', value: 'submit-btn' });
  });

  it('produces role + accessible name for buttons', () => {
    document.body.innerHTML = `<button>Sign in</button><button>Cancel</button>`;
    const [first] = getCandidates(document.querySelectorAll('button')[0]);
    expect(first).toEqual({ kind: 'role', value: 'button', name: 'Sign in' });
  });

  it('adds nth for ambiguous role+name matches', () => {
    document.body.innerHTML = `<button>Buy</button><button>Buy</button>`;
    const [first] = getCandidates(document.querySelectorAll('button')[1]);
    expect(first).toEqual({ kind: 'role', value: 'button', name: 'Buy', nth: 1 });
  });

  it('uses label text for labelled inputs', () => {
    document.body.innerHTML = `<label for="em">Email</label><input id="em" type="email" />`;
    const candidates = getCandidates(document.querySelector('input')!);
    expect(candidates).toContainEqual({ kind: 'label', value: 'Email' });
  });

  it('falls back to placeholder, then css', () => {
    document.body.innerHTML = `<input type="text" placeholder="Search…" />`;
    const candidates = getCandidates(document.querySelector('input')!);
    expect(candidates).toContainEqual({ kind: 'placeholder', value: 'Search…' });
    expect(candidates.at(-1)!.kind).toBe('css');
  });

  it('always ends with a css candidate that resolves to the element', () => {
    document.body.innerHTML = `<div><section><p>one</p><p>two</p></section></div>`;
    const el = document.querySelectorAll('p')[1];
    const css = getCandidates(el).at(-1)!;
    expect(css.kind).toBe('css');
    expect(document.querySelector(css.value)).toBeDefined();
  });
});
