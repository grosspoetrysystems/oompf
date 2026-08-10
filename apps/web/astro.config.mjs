// @ts-check

import cloudflare from "@astrojs/cloudflare";
import { defineConfig } from "astro/config";

// OOMPF web index: server-rendered on Cloudflare Workers via Wrangler.
// See ./wrangler.jsonc for the Worker deployment configuration.
export default defineConfig({
  adapter: cloudflare(),
  output: "server",
});
