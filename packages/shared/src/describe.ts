import type { LocatorCandidate, Step } from './types';

function targetName(candidates: LocatorCandidate[]): string {
  const c = candidates[0];
  if (!c) return 'element';
  switch (c.kind) {
    case 'role':
      return c.name ? `${c.value} "${c.name}"` : c.value;
    case 'testId':
      return `[data-testid=${c.value}]`;
    case 'label':
    case 'placeholder':
    case 'text':
      return `"${c.value}"`;
    case 'css':
      return c.value;
  }
}

export function describeStep(step: Step): string {
  if (step.description) return step.description;
  switch (step.type) {
    case 'goto':
      return `Go to ${step.url}`;
    case 'click':
      return `Click ${targetName(step.locator)}`;
    case 'dblclick':
      return `Double-click ${targetName(step.locator)}`;
    case 'fill':
      return `Type "${step.value}" into ${targetName(step.locator)}`;
    case 'press':
      return `Press ${step.key} in ${targetName(step.locator)}`;
    case 'select':
      return `Select ${step.values.map((v) => `"${v}"`).join(', ')} in ${targetName(step.locator)}`;
    case 'check':
      return `Check ${targetName(step.locator)}`;
    case 'uncheck':
      return `Uncheck ${targetName(step.locator)}`;
    case 'upload':
      return `Upload "${step.fileName}" to ${targetName(step.locator)}`;
  }
}
