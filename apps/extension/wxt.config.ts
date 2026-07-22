import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Retrace — Playwright Recorder",
    description:
      "Record browser flows and retrace them as Playwright tests from the Retrace app.",
    permissions: ["storage", "tabs", "webNavigation", "sidePanel"],
    host_permissions: ["http://localhost:3000/*"],
    action: {
      default_title: "Retrace",
      default_icon: { 16: "icon/16.png", 32: "icon/32.png", 48: "icon/48.png" },
    },
  },
});
