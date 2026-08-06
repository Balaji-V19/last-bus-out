import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

function googleAnalyticsConfiguration(): Plugin {
  return {
    name: "blackout-at-st-orison-ga4-configuration",
    transformIndexHtml() {
      const measurementId = process.env.GA_MEASUREMENT_ID?.trim().toUpperCase();
      if (!measurementId) return [];
      if (!/^G-[A-Z0-9]{6,20}$/.test(measurementId)) {
        throw new Error(
          "GA_MEASUREMENT_ID must be a valid GA4 web measurement ID beginning with G-.",
        );
      }

      return [
        {
          tag: "meta",
          attrs: {
            name: "blackout-ga4-measurement-id",
            content: measurementId,
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
  plugins: [react(), googleAnalyticsConfiguration()],
  build: {
    outDir: "../dist-pages",
    emptyOutDir: true,
  },
});
