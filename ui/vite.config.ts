import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

declare const process: { env: Record<string, string | undefined> };

// The gateway port the example boots on (start.js passes VITE_API_PORT).
const apiPort = process.env.VITE_API_PORT || "3007";

// The installed apps' UIs (src/installedApps.tsx) are `file:`-linked sibling
// checkouts (package.json), outside this repo: the dev server must be allowed
// to serve them. Relative paths resolve against this UI's root (ui/).
const appUiDirs = ["../../mdk-app-operation-center", "../../mdk-app-reporting-tool"];

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The app bundles import React and the MDK UI packages as bare specifiers,
    // which would otherwise resolve from their own checkouts' node_modules: a
    // second React ("Invalid hook call") and a second MDK context the apps'
    // pages cannot see. Force this UI's copy of each.
    dedupe: [
      "react",
      "react-dom",
      "react-router",
      "@tanstack/react-query",
      "chart.js",
      "@tetherto/mdk-react-adapter",
      "@tetherto/mdk-react-devkit",
      "@tetherto/mdk-ui-foundation",
    ],
  },
  server: {
    port: Number(process.env.MDK_UI_PORT) || 3040,
    fs: { allow: ["..", ...appUiDirs] },
    proxy: {
      // Forward the site plugin endpoints to the gateway during dev.
      "/site": `http://localhost:${apiPort}`,
      // The installed apps' own routes, which the Gateway forwards to each app.
      "/apps": `http://localhost:${apiPort}`,
    },
  },
});
