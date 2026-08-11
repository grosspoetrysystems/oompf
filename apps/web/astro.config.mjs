// @ts-check

import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";

// OOMPF web index: server-rendered on Cloudflare Workers via Wrangler.
// See ./wrangler.jsonc for the Worker deployment configuration.
export default defineConfig({
  adapter: cloudflare(),
  // Code samples in /docs are syntax-highlighted with the same gruvbox palette
  // the rest of the interface uses, so YAML in the docs matches YAML on a
  // profile page and in the reader's own terminal.
  markdown: {
    shikiConfig: { theme: "gruvbox-dark-hard" },
  },
  output: "server",
  site: "https://oompf.run",
});
