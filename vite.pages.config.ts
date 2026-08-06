import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function umamiAnalytics(): Plugin {
  return {
    name: "blackout-at-st-orison-umami-analytics",
    transformIndexHtml() {
      const websiteId = process.env.UMAMI_WEBSITE_ID?.trim();
      if (!websiteId) return [];
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(websiteId)) {
        throw new Error("UMAMI_WEBSITE_ID must be a valid Umami website UUID.");
      }

      const scriptUrl =
        process.env.UMAMI_SCRIPT_URL?.trim() ||
        "https://cloud.umami.is/script.js";
      const parsedScriptUrl = new URL(scriptUrl);
      if (parsedScriptUrl.protocol !== "https:") {
        throw new Error("UMAMI_SCRIPT_URL must use HTTPS for GitHub Pages.");
      }

      const domains = process.env.UMAMI_DOMAINS?.trim();
      return [
        {
          tag: "script",
          attrs: {
            defer: true,
            src: parsedScriptUrl.toString(),
            "data-website-id": websiteId,
            "data-do-not-track": "true",
            "data-performance": "true",
            ...(domains ? { "data-domains": domains } : {}),
          },
          injectTo: "head",
        },
      ];
    },
  };
}

export default defineConfig({
  root: "static-game",
  base: "/blackout-at-st-orison/",
  publicDir: "../public",
  plugins: [react(), umamiAnalytics()],
  build: {
    outDir: "../dist-pages",
    emptyOutDir: true,
  },
});
