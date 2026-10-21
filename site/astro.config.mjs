// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://docs.pacestreak.com",
  // Must match what Cloudflare Pages serves (`/runbook`, not `/runbook/`), or
  // links and the files on disk disagree.
  trailingSlash: "never",
  build: {
    format: "file",
    // The CSP here is `style-src 'self'` with no 'unsafe-inline' and no hashes,
    // so every stylesheet must be a file. "auto" would inline small ones.
    inlineStylesheets: "never",
  },
  // The Markdown is rendered by src/lib/markdown.ts, not by Astro's pipeline:
  // it needs Shiki's class-based output, link rewriting and link checking.
  // A hover hint, not a script the CSP has to allow separately.
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  devToolbar: { enabled: false },
  vite: {
    // Tailwind v4 compiles through Vite; the play CDN would be blocked by the CSP.
    plugins: [tailwindcss()],
    build: {
      // LOAD-BEARING. Vite inlines assets under 4KB as base64 data: URIs and
      // Astro inlines small scripts; `script-src 'self'` blocks both, silently.
      assetsInlineLimit: 0,
    },
  },
});
