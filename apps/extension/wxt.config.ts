import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Retrace — Playwright Recorder",
    description:
      "Record browser flows and retrace them as Playwright tests from the Retrace app.",
    permissions: [
      "activeTab",
      "offscreen",
      "scripting",
      "sidePanel",
      "storage",
      "tabCapture",
      "tabs",
      "webNavigation",
    ],
    // captureVisibleTab requires the literal <all_urls> pattern (or an
    // activeTab grant, which only lasts for the toolbar-click gesture)
    host_permissions: ["<all_urls>"],
    action: {
      default_title: "Retrace",
      default_icon: { 16: "icon/16.png", 32: "icon/32.png", 48: "icon/48.png" },
    },
  },
});
