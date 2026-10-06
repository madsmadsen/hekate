// Web Awesome for the FR-50 test pages. The files come from the package of the component
// (`dist-cdn` has no bare imports), and `page.route()` serves them. The network is never used.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { repoRoot } from "./env.ts";

export const WA_PREFIX = "/__e2e/wa/";

const WA_DIR = path.join(
  repoRoot,
  "packages/component/node_modules/@awesome.me/webawesome/dist-cdn",
);

export const waAvailable = existsSync(path.join(WA_DIR, "components/button/button.js"));

/** All `wa-*` tag names of Web Awesome. */
export const WA_TAGS: string[] = waAvailable
  ? readdirSync(path.join(WA_DIR, "components"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `wa-${entry.name}`)
  : [];

/** Serves the Web Awesome files under `http://localhost:8080/__e2e/wa/`. */
export async function serveWebAwesome(page: Page): Promise<void> {
  await page.route(`**${WA_PREFIX}**`, async (route) => {
    const relative = new URL(route.request().url()).pathname.slice(WA_PREFIX.length);
    const file = path.join(WA_DIR, relative);
    if (!file.startsWith(WA_DIR) || !existsSync(file)) {
      await route.fulfill({ status: 404, body: "not found" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: file.endsWith(".css") ? "text/css" : "text/javascript",
      headers: { "cache-control": "no-store" },
      body: readFileSync(file),
    });
  });
}
