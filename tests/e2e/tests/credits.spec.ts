// Credits dialog: FR-30 (and the version of FR-51).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { servePage } from "../support/browser.ts";
import { openPlayground } from "../support/component.ts";
import {
  DEMO_ORIGIN,
  assetsBase,
  distFile,
  englishText,
  manifests,
  scriptUrl,
  version,
} from "../support/env.ts";
import { PARTS_FROM_README } from "../support/readme.ts";

const CHANGED_NOTE =
  "Hekate changed this source. Hekate filtered the words and shortened the list.";

test.describe("FR-30 credits dialog", () => {
  for (const manifest of manifests) {
    test(`FR-30 ${manifest.code}: the dialog shows each item of manifest.json`, async ({
      page,
    }) => {
      await openPlayground(page, { language: manifest.code });
      await page.locator("#credits-link").click();
      await expect(page.locator("#credits-version")).toBeVisible();
      const root = page.locator(`#credits-${manifest.code}`);
      await expect(root).toHaveCount(1);
      await expect(root.locator("summary")).toHaveText(manifest.name);
      const sources = root.locator("ul > li");
      await expect(sources).toHaveCount(manifest.sources.length);
      for (const [index, source] of manifest.sources.entries()) {
        const item = sources.nth(index);
        // 1. The name of the source, with a link.
        await expect(item.locator("a.source-name")).toHaveText(source.name);
        await expect(item.locator("a.source-name")).toHaveAttribute(
          "href",
          new URL(source.url).href,
        );
        // 2. The version or the copy date.
        await expect(item).toContainText(
          englishText("credits.sourceVersion").replace("{version}", source.version),
        );
        // 3. The license, with a link to the license text.
        await expect(item.locator("a.source-license")).toHaveText(source.license);
        await expect(item.locator("a.source-license")).toHaveAttribute(
          "href",
          new URL(source.license_url).href,
        );
        // 5. The exact credit text.
        await expect(item.locator(".source-credit")).toHaveText(
          englishText("credits.credit").replace("{credit}", source.credit),
        );
      }
      // 4. The note of CC BY.
      await expect(root.locator(".changed-note")).toHaveText(manifest.changed_note);
      expect(manifest.changed_note).toBe(CHANGED_NOTE);
      // 6. The SHA-256 hash of the list, and of the ASCII list when it is another file.
      await expect(root.locator(".words-hash")).toHaveText(
        englishText("credits.hashWords").replace("{hash}", manifest.sha256.words),
      );
      if (manifest.ascii_same) {
        await expect(root.locator(".ascii-hash")).toHaveCount(0);
      } else {
        await expect(root.locator(".ascii-hash")).toHaveText(
          englishText("credits.hashAscii").replace("{hash}", manifest.sha256.words_ascii),
        );
      }
      // The hash in the dialog is the hash of the file on the asset host.
      const hash = (name: string) =>
        createHash("sha256")
          .update(readFileSync(distFile("wordlists", manifest.code, name)))
          .digest("hex");
      expect(hash("words.txt")).toBe(manifest.sha256.words);
      expect(hash("words-ascii.txt")).toBe(manifest.sha256.words_ascii);
    });
  }

  test("FR-30 the dialog shows the version, the commit and a link to the license report", async ({
    page,
    request,
  }) => {
    await openPlayground(page);
    await page.locator("#credits-link").click();
    await expect(page.locator("#credits-version")).toHaveText(
      englishText("credits.version").replace("{version}", version),
    );
    await expect(page.locator("#credits-commit")).toHaveText(/^Commit \S+$/);
    const link = page.locator("#license-report");
    await expect(link).toHaveText(englishText("credits.licenseReport"));
    await expect(link).toHaveAttribute("href", `${assetsBase}THIRD-PARTY-LICENSES.html`);
    const report = await request.get(`${assetsBase}THIRD-PARTY-LICENSES.html`);
    expect(report.status()).toBe(200);
  });

  const HOSTILE =
    "display: none !important; visibility: hidden !important; opacity: 0 !important; " +
    "width: 0 !important; height: 0 !important; font-size: 0 !important; " +
    "position: absolute !important; left: -9999px !important; pointer-events: none !important;";

  test("FR-30 the Credits link is visible on a page that sets every attribute and hostile CSS on every part", async ({
    page,
  }) => {
    const attributes = [
      'mode="characters"',
      'language="en-US"',
      'words="3"',
      'separator="space"',
      'capitalization="random"',
      'number="true"',
      'symbol="true"',
      'ascii-only="true"',
      'length="8"',
      'charsets="lower"',
      'avoid-similar="true"',
      'no-repeat="true"',
      'ui-language="en"',
      'theme="dark"',
      `assets-url="${assetsBase}"`,
    ].join(" ");
    const rules = PARTS_FROM_README.map((name) => `hekate-generator::part(${name}) { ${HOSTILE} }`);
    await servePage(
      page,
      `${DEMO_ORIGIN}/__e2e/hostile-credits.html`,
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${rules.join("\n")}</style></head><body>` +
        `<script type="module" src="${scriptUrl}"></script>` +
        `<hekate-generator ${attributes}>fallback</hekate-generator></body></html>`,
    );
    await page.goto("/__e2e/hostile-credits.html");
    const link = page.locator("#credits-link");
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(box?.width).toBeGreaterThan(10);
    expect(box?.height).toBeGreaterThan(10);
    // It also works: a click opens the dialog.
    await link.click();
    await expect(page.locator("#credits-version")).toBeVisible();
  });

  test("FR-30 the Credits link stays visible when the page hides any one part", async ({
    page,
  }) => {
    await servePage(
      page,
      `${DEMO_ORIGIN}/__e2e/hostile-part.html`,
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><style id="hostile"></style></head><body>` +
        `<script type="module" src="${scriptUrl}"></script>` +
        `<hekate-generator>fallback</hekate-generator></body></html>`,
    );
    await page.goto("/__e2e/hostile-part.html");
    const link = page.locator("#credits-link");
    await expect(link).toBeVisible();
    const hidden: string[] = [];
    for (const name of PARTS_FROM_README) {
      await page.evaluate(
        ([partName, declarations]) => {
          const style = document.getElementById("hostile") as HTMLStyleElement;
          style.textContent = `hekate-generator::part(${partName}) { ${declarations} }`;
        },
        [name, HOSTILE] as const,
      );
      if (!(await link.isVisible())) hidden.push(name);
    }
    expect(hidden, "parts that hide the Credits link").toEqual([]);
  });
});
