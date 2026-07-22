export type LocatorKind =
  "testId" | "role" | "label" | "placeholder" | "text" | "css";

export interface LocatorCandidate {
  kind: LocatorKind;
  /** testId/label/placeholder/text value, role name, or css selector */
  value: string;
  /** accessible name — role locators only */
  name?: string;
  /** disambiguation index when the locator matches multiple elements */
  nth?: number;
}

interface BaseStep {
  /** human-readable description, shown as repro step */
  description?: string;
}

export interface GotoStep extends BaseStep {
  type: "goto";
  url: string;
}

export interface LocatorStep extends BaseStep {
  /** best candidate first */
  locator: LocatorCandidate[];
}

export interface ClickStep extends LocatorStep {
  type: "click" | "dblclick";
}
export interface FillStep extends LocatorStep {
  type: "fill";
  value: string;
}
export interface PressStep extends LocatorStep {
  type: "press";
  key: string;
}
export interface SelectStep extends LocatorStep {
  type: "select";
  values: string[];
}
export interface CheckStep extends LocatorStep {
  type: "check" | "uncheck";
}
export interface UploadStep extends LocatorStep {
  type: "upload";
  fileName: string;
}

export type Step =
  | GotoStep
  | ClickStep
  | FillStep
  | PressStep
  | SelectStep
  | CheckStep
  | UploadStep;

export type RunStatus = "running" | "passed" | "failed" | "error";

export interface ConsoleEntry {
  type: string;
  text: string;
  url?: string;
}

export interface NetworkEntry {
  method: string;
  url: string;
  status: number;
  resourceType: string;
  failure?: string;
}

export type BugKind = "screenshot" | "recording";
export type BugStatus = "open" | "in_progress" | "resolved";

export interface BugConsoleEntry {
  level: "log" | "info" | "warn" | "error" | "pageerror" | "unhandledrejection";
  text: string;
  timestamp: number;
  url?: string;
}

export interface BugNetworkEntry {
  method: string;
  url: string;
  status: number;
  durationMs: number;
  timestamp: number;
  resourceType?: string;
  failure?: string;
}

export interface BugEventEntry {
  type: string;
  description: string;
  timestamp: number;
  url: string;
}

export interface BugDeviceInfo {
  userAgent: string;
  platform: string;
  language: string;
  viewport: {
    width: number;
    height: number;
  };
  screen: {
    width: number;
    height: number;
  };
}

export interface BugContext {
  pageUrl: string;
  title: string;
  timestamp: number;
  device: BugDeviceInfo;
  console: BugConsoleEntry[];
  network: BugNetworkEntry[];
  events: BugEventEntry[];
}

export type AnnotationShapeType =
  "rect" | "ellipse" | "arrow" | "pen" | "highlight" | "text";

export interface AnnotationShape {
  id: string;
  type: AnnotationShapeType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  x2?: number;
  y2?: number;
  points?: { x: number; y: number }[];
  text?: string;
  color: string;
  strokeWidth: number;
}

export interface BugAnnotations {
  version: 1;
  shapes: AnnotationShape[];
}
