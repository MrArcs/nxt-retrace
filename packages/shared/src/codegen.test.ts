import { describe, expect, it } from "vitest";
import { generateSpec, locatorExpr } from "./codegen";
import { describeStep } from "./describe";
import type { Step } from "./types";

const steps: Step[] = [
  { type: "goto", url: "https://example.com/login" },
  {
    type: "fill",
    locator: [{ kind: "label", value: "Email" }],
    value: "a@b.co",
  },
  {
    type: "fill",
    locator: [{ kind: "placeholder", value: "Password" }],
    value: "it's",
  },
  {
    type: "click",
    locator: [{ kind: "role", value: "button", name: "Sign in" }],
  },
];

describe("generateSpec", () => {
  it("generates a runnable playwright spec", () => {
    const { code } = generateSpec("login", steps);
    expect(code).toBe(
      [
        `import { test, expect } from '@playwright/test';`,
        ``,
        `test('login', async ({ page }) => {`,
        `  await page.goto('https://example.com/login');`,
        `  await page.getByLabel('Email', { exact: true }).fill('a@b.co');`,
        `  await page.getByPlaceholder('Password', { exact: true }).fill('it\\'s');`,
        `  await page.getByRole('button', { name: 'Sign in' }).click();`,
        `});`,
        ``,
      ].join("\n"),
    );
  });

  it("maps stepLines to the statement lines", () => {
    const { code, stepLines } = generateSpec("login", steps);
    const lines = code.split("\n");
    expect(stepLines).toEqual([4, 5, 6, 7]);
    expect(lines[stepLines[1] - 1]).toContain("Email");
  });

  it("can capture a screenshot after each generated step", () => {
    const { code, stepLines } = generateSpec("login", steps.slice(0, 2), {
      captureStepScreenshots: true,
    });
    const lines = code.split("\n");

    expect(stepLines).toEqual([4, 6]);
    expect(lines[4]).toBe(
      `  await page.screenshot({ path: 'step-001.png', fullPage: true });`,
    );
    expect(lines[6]).toBe(
      `  await page.screenshot({ path: 'step-002.png', fullPage: true });`,
    );
  });

  it("supports a custom import source and nth", () => {
    const { code } = generateSpec(
      "t",
      [{ type: "click", locator: [{ kind: "css", value: ".item", nth: 2 }] }],
      { importFrom: "./capture" },
    );
    expect(code).toContain(`from './capture'`);
    expect(code).toContain(`page.locator('.item').nth(2).click()`);
  });

  it("throws on empty locator candidates", () => {
    expect(() => locatorExpr([])).toThrow("no locator candidates");
  });

  it("skips nameless positional role candidates when an alternative exists", () => {
    expect(
      locatorExpr([
        { kind: "role", value: "textbox", nth: 1 },
        { kind: "css", value: "#part-search" },
      ]),
    ).toBe(`page.locator('#part-search')`);
    // but still used when it is the only candidate
    expect(locatorExpr([{ kind: "role", value: "textbox", nth: 1 }])).toBe(
      `page.getByRole('textbox').nth(1)`,
    );
  });
});

describe("describeStep", () => {
  it("produces readable repro steps", () => {
    expect(describeStep(steps[0])).toBe("Go to https://example.com/login");
    expect(describeStep(steps[3])).toBe('Click button "Sign in"');
  });
});
