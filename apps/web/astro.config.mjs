// @ts-check
import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

// OOMPF web index: server-rendered on Cloudflare Workers via Wrangler.
// See ./wrangler.jsonc for the Worker deployment configuration.
export default defineConfig({
  output: "server",
  adapter: cloudflare(),
});
