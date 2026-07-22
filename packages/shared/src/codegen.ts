import type { LocatorCandidate, Step } from "./types";

const q = (s: string): string =>
  `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n")}'`;

/** a nameless role locator that needs .nth() is purely positional — prefer any other candidate */
function isWeak(c: LocatorCandidate): boolean {
  return c.kind === "role" && !c.name && c.nth != null;
}

export function locatorExpr(candidates: LocatorCandidate[]): string {
  const c = candidates.find((cand) => !isWeak(cand)) ?? candidates[0];
  if (!c) throw new Error("Step has no locator candidates");
  let expr: string;
  switch (c.kind) {
    case "testId":
      expr = `page.getByTestId(${q(c.value)})`;
      break;
    case "role":
      expr = c.name
        ? `page.getByRole(${q(c.value)}, { name: ${q(c.name)} })`
        : `page.getByRole(${q(c.value)})`;
      break;
    // exact: true — playwright defaults to substring matching, but the recorder
    // verified uniqueness with exact matches; substring can hit extra elements
    case "label":
      expr = `page.getByLabel(${q(c.value)}, { exact: true })`;
      break;
    case "placeholder":
      expr = `page.getByPlaceholder(${q(c.value)}, { exact: true })`;
      break;
    case "text":
      expr = `page.getByText(${q(c.value)}, { exact: true })`;
      break;
    case "css":
      expr = `page.locator(${q(c.value)})`;
      break;
  }
  if (c.nth != null && c.nth > 0) expr += `.nth(${c.nth})`;
  return expr;
}

function stepStatement(step: Step): string {
  switch (step.type) {
    case "goto":
      return `await page.goto(${q(step.url)});`;
    case "click":
      return `await ${locatorExpr(step.locator)}.click();`;
    case "dblclick":
      return `await ${locatorExpr(step.locator)}.dblclick();`;
    case "fill":
      return `await ${locatorExpr(step.locator)}.fill(${q(step.value)});`;
    case "press":
      return `await ${locatorExpr(step.locator)}.press(${q(step.key)});`;
    case "select":
      return `await ${locatorExpr(step.locator)}.selectOption([${step.values.map(q).join(", ")}]);`;
    case "check":
      return `await ${locatorExpr(step.locator)}.check();`;
    case "uncheck":
      return `await ${locatorExpr(step.locator)}.uncheck();`;
    case "upload":
      return `await ${locatorExpr(step.locator)}.setInputFiles(${q(step.fileName)}); // TODO: replace with a real file path`;
  }
}

export interface GeneratedSpec {
  code: string;
  /** 1-based line number of each step's statement, same order as steps */
  stepLines: number[];
}

export function generateSpec(
  name: string,
  steps: Step[],
  opts: { importFrom?: string; captureStepScreenshots?: boolean } = {},
): GeneratedSpec {
  const importFrom = opts.importFrom ?? "@playwright/test";
  const lines = [
    `import { test, expect } from ${q(importFrom)};`,
    "",
    `test(${q(name)}, async ({ page }) => {`,
  ];
  const stepLines: number[] = [];
  for (const [index, step] of steps.entries()) {
    stepLines.push(lines.length + 1);
    lines.push(`  ${stepStatement(step)}`);
    if (opts.captureStepScreenshots) {
      const name = `step-${String(index + 1).padStart(3, "0")}.png`;
      lines.push(
        `  await page.screenshot({ path: ${q(name)}, fullPage: true });`,
      );
    }
  }
  lines.push("});", "");
  return { code: lines.join("\n"), stepLines };
}
