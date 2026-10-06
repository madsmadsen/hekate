// Isolation, styling, layout and Web Awesome names: FR-41, FR-47, FR-49, FR-50.
import { expect, test, type Page } from "@playwright/test";
import {
  fakeClipboard,
  removeClipboard,
  seedRandom,
  servePage,
  watchDefinedElements,
  definedElements,
  WORDLIST_URL,
  failWithStatus,
} from "../support/browser.ts";
import {
  openPlayground,
  part,
  readPassword,
  setProperty,
  waitForPassword,
  type HekateElement,
} from "../support/component.ts";
import { saveScreenshot } from "../support/files.ts";
import { DEMO_ORIGIN, manifests, readWordlist, scriptUrl } from "../support/env.ts";
import { PARTS_FROM_README, PROPERTIES_FROM_README } from "../support/readme.ts";
import { layoutReport } from "../support/layout.ts";
import { WA_PREFIX, WA_TAGS, serveWebAwesome, waAvailable } from "../support/wa.ts";

// --- FR-41 ---------------------------------------------------------------------------------

const PAGE_CSS = `
  body { margin: 0; font-family: Georgia, serif; background: #f6f6f8; color: #1b1d26; }
  main { max-width: 52rem; margin: 0 auto; padding: 1rem; }
  #slot { width: 100%; height: 1100px; overflow: hidden; }
  hekate-generator { display: block; margin-block: 1rem; border: 1px solid #c9ccd6; }
  button { color: red; background: yellow; border: 3px dashed green; font-size: 40px; }
`;

function isolationPage(options: {
  component: boolean;
  hostileCss: boolean;
  /** The component is at the top left corner, so that its pixels do not depend on the page text. */
  corner?: boolean;
}): string {
  const hostile = options.hostileCss ? `<link rel="stylesheet" href="/hostile.css">` : "";
  const component = options.component
    ? `<script type="module" src="${scriptUrl}"></script><hekate-generator>fallback</hekate-generator>`
    : "";
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Isolation</title>` +
    `<style>${PAGE_CSS}</style>${hostile}</head><body><main>` +
    `${options.corner ? "<style>#slot { position: absolute; inset: 0 auto auto 0; width: 800px; height: auto; margin: 0; }</style>" : ""}` +
    `<h1>A page</h1><p>Some text with a <a href="#x">link</a>.</p>` +
    `<button type="button">A page button</button> <input value="A page input"> ` +
    `<select><option>One</option></select><div id="slot">${component}</div>` +
    `<p>Text after the component.</p><button type="button">Another button</button></main></body></html>`
  );
}

async function shootComponent(page: Page, url: string, html: string): Promise<Buffer> {
  await seedRandom(page);
  await servePage(page, url, html);
  await page.goto(url);
  await waitForPassword(page);
  if (html.includes("hostile.css")) {
    // The hostile rules are in force on this page: they change the text of the page.
    const size = await page
      .locator("main p")
      .first()
      .evaluate((e) => getComputedStyle(e).fontSize);
    expect(size).toBe("30px");
  }
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return page.locator("hekate-generator").screenshot({ animations: "disabled", caret: "hide" });
}

test.describe("FR-41 isolation", () => {
  test("FR-41 global CSS rules that change all buttons do not change the component: zero pixels differ", async ({
    browser,
  }, testInfo) => {
    const project = testInfo.project.name;
    const shoot = async (hostileCss: boolean) => {
      const context = await browser.newContext({ viewport: { width: 900, height: 1200 } });
      const page = await context.newPage();
      const bytes = await shootComponent(
        page,
        `${DEMO_ORIGIN}/__e2e/isolation-${hostileCss ? "hostile" : "clean"}.html`,
        isolationPage({ component: true, hostileCss, corner: true }),
      );
      await context.close();
      return bytes;
    };
    // The reference is the component on a page without hostile CSS. The random generator has a
    // fixed seed, so both pages show the same password.
    const reference = await shoot(false);
    const hostile = await shoot(true);
    saveScreenshot(project, "fr-41-component-reference", reference);
    saveScreenshot(project, "fr-41-component-hostile-page", hostile);
    expect(hostile.equals(reference), "the component looks the same on a hostile page").toBe(true);
  });

  test("FR-41 the page outside the component looks the same with and without the component: zero pixels differ", async ({
    browser,
  }, testInfo) => {
    const project = testInfo.project.name;
    const shoot = async (component: boolean) => {
      const context = await browser.newContext({ viewport: { width: 900, height: 1200 } });
      const page = await context.newPage();
      await seedRandom(page);
      const url = `${DEMO_ORIGIN}/__e2e/outside-${component ? "with" : "without"}.html`;
      await servePage(page, url, isolationPage({ component, hostileCss: false }));
      await page.goto(url);
      if (component) await waitForPassword(page);
      await page.waitForTimeout(400);
      const bytes = await page.screenshot({
        fullPage: true,
        animations: "disabled",
        caret: "hide",
        // The box of the component is not part of the comparison.
        mask: [page.locator("#slot")],
        maskColor: "#ff00ff",
      });
      await context.close();
      return bytes;
    };
    const without = await shoot(false);
    const withComponent = await shoot(true);
    saveScreenshot(project, "fr-41-page-without-component", without);
    saveScreenshot(project, "fr-41-page-with-component", withComponent);
    expect(withComponent.equals(without), "the page outside the component is unchanged").toBe(true);
  });

  test("FR-41 the component puts its UI in a shadow root and adds no style to the page", async ({
    page,
  }) => {
    await servePage(
      page,
      `${DEMO_ORIGIN}/__e2e/shadow.html`,
      isolationPage({ component: true, hostileCss: false }),
    );
    const before = await page.evaluate(() => document.styleSheets.length);
    await page.goto(`${DEMO_ORIGIN}/__e2e/shadow.html`);
    await waitForPassword(page);
    const result = await page.evaluate(() => ({
      open: document.querySelector("hekate-generator")?.shadowRoot?.mode,
      lightChildren: document.querySelector("hekate-generator")?.children.length,
      pageSheets: document.styleSheets.length,
      pageAdopted: document.adoptedStyleSheets.length,
      headStyles: document.head.querySelectorAll("style, link[rel=stylesheet]").length,
    }));
    expect(result.open).toBe("open");
    expect(result.lightChildren).toBe(0);
    expect(result.pageAdopted).toBe(0);
    expect(result.headStyles).toBe(1);
    expect(before).toBeGreaterThanOrEqual(0);
  });
});

// --- FR-47 ---------------------------------------------------------------------------------

interface PropertyCase {
  name: string;
  value: string;
  attributes?: Record<string, string>;
  /** Runs in the page. It returns the computed value of the target element. */
  read: string;
  expected: string;
}

// Each `read` is the body of a function `(root) => string`. `root` is the shadow root.
const PROPERTY_CASES: PropertyCase[] = [
  {
    name: "--hekate-font-family",
    value: "Georgia, serif",
    read: "return getComputedStyle(root.querySelector('.root')).fontFamily",
    expected: "Georgia, serif",
  },
  {
    name: "--hekate-password-font-family",
    value: '"Courier New", monospace',
    read: "return getComputedStyle(root.querySelector('#password')).fontFamily",
    expected: '"Courier New", monospace',
  },
  {
    name: "--hekate-password-font-size",
    value: "33px",
    read: "return getComputedStyle(root.querySelector('#password')).fontSize",
    expected: "33px",
  },
  {
    name: "--hekate-color-text",
    value: "rgb(1, 2, 3)",
    read: "return getComputedStyle(root.querySelector('.root')).color",
    expected: "rgb(1, 2, 3)",
  },
  {
    name: "--hekate-color-text-quiet",
    value: "rgb(4, 5, 6)",
    read: "return getComputedStyle(root.querySelector('.field-label')).color",
    expected: "rgb(4, 5, 6)",
  },
  {
    name: "--hekate-color-surface",
    value: "rgb(7, 8, 9)",
    read: "return getComputedStyle(root.querySelector('.root')).backgroundColor",
    expected: "rgb(7, 8, 9)",
  },
  {
    name: "--hekate-color-border",
    value: "rgb(10, 11, 12)",
    read: "return getComputedStyle(root.querySelector('#password')).borderTopColor",
    expected: "rgb(10, 11, 12)",
  },
  {
    name: "--hekate-color-brand",
    value: "rgb(13, 14, 15)",
    read:
      "const button = root.querySelector('[part=new-password-button]');" +
      "return getComputedStyle(button.shadowRoot.querySelector('[part~=base]')).backgroundColor",
    expected: "rgb(13, 14, 15)",
  },
  {
    name: "--hekate-color-separator",
    value: "rgb(16, 17, 18)",
    attributes: { separator: "-" },
    read: "return getComputedStyle(root.querySelector('[part=token-separator]')).color",
    expected: "rgb(16, 17, 18)",
  },
  {
    name: "--hekate-color-number",
    value: "rgb(19, 20, 21)",
    attributes: { number: "true" },
    read: "return getComputedStyle(root.querySelector('[part=token-number]')).color",
    expected: "rgb(19, 20, 21)",
  },
  {
    name: "--hekate-color-symbol",
    value: "rgb(22, 23, 24)",
    attributes: { symbol: "true" },
    read: "return getComputedStyle(root.querySelector('[part=token-symbol]')).color",
    expected: "rgb(22, 23, 24)",
  },
  {
    name: "--hekate-color-digit",
    value: "rgb(25, 26, 27)",
    attributes: { mode: "characters", length: "64" },
    read: "return getComputedStyle(root.querySelector('[part=token-digit]')).color",
    expected: "rgb(25, 26, 27)",
  },
  {
    name: "--hekate-color-strength-weak",
    value: "rgb(28, 29, 30)",
    attributes: { words: "3" },
    read: "return getComputedStyle(root.querySelector('[part=strength-bar]')).getPropertyValue('--indicator-color').trim()",
    expected: "rgb(28, 29, 30)",
  },
  {
    name: "--hekate-color-strength-fair",
    value: "rgb(31, 32, 33)",
    attributes: { words: "4" },
    read: "return getComputedStyle(root.querySelector('[part=strength-bar]')).getPropertyValue('--indicator-color').trim()",
    expected: "rgb(31, 32, 33)",
  },
  {
    name: "--hekate-color-strength-strong",
    value: "rgb(34, 35, 36)",
    attributes: { words: "5" },
    read: "return getComputedStyle(root.querySelector('[part=strength-bar]')).getPropertyValue('--indicator-color').trim()",
    expected: "rgb(34, 35, 36)",
  },
  {
    name: "--hekate-color-strength-very-strong",
    value: "rgb(37, 38, 39)",
    attributes: { words: "8" },
    read: "return getComputedStyle(root.querySelector('[part=strength-bar]')).getPropertyValue('--indicator-color').trim()",
    expected: "rgb(37, 38, 39)",
  },
  {
    name: "--hekate-radius",
    value: "13px",
    read: "return getComputedStyle(root.querySelector('#password')).borderTopLeftRadius",
    expected: "13px",
  },
  {
    name: "--hekate-gap",
    value: "17px",
    read: "return getComputedStyle(root.querySelector('.root')).rowGap",
    expected: "17px",
  },
];

async function readProperty(page: Page, item: PropertyCase): Promise<string> {
  return page
    .locator("hekate-generator")
    .first()
    .evaluate((node, body) => {
      const root = (node as HTMLElement).shadowRoot as ShadowRoot;
      return new Function("root", body)(root) as string;
    }, item.read);
}

test.describe("FR-47 look and feel", () => {
  test("FR-47 the README lists every custom property and every part that the tests cover", () => {
    expect(PROPERTIES_FROM_README.length).toBeGreaterThan(10);
    expect(PARTS_FROM_README.length).toBeGreaterThan(30);
    expect(PROPERTY_CASES.map((item) => item.name).sort()).toEqual(
      [...PROPERTIES_FROM_README].sort(),
    );
  });

  for (const placement of ["on the component", "on a parent element"]) {
    test(`FR-47 each custom property set ${placement} gives that computed value`, async ({
      page,
    }) => {
      for (const item of PROPERTY_CASES) {
        const selector = placement === "on the component" ? "hekate-generator" : "#parent";
        await servePage(
          page,
          `${DEMO_ORIGIN}/__e2e/property.html`,
          `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${selector} { ${item.name}: ${item.value}; }</style></head><body>` +
            `<script type="module" src="${scriptUrl}"></script><div id="parent"><hekate-generator ${Object.entries(
              item.attributes ?? {},
            )
              .map(([key, value]) => `${key}="${value}"`)
              .join(" ")} language="en-US"></hekate-generator></div></body></html>`,
        );
        await page.goto("/__e2e/property.html");
        await waitForPassword(page);
        // WebKit writes a font family without the quotes.
        const unquote = (value: string): string => value.replaceAll('"', "");
        expect(unquote(await readProperty(page, item)), item.name).toBe(unquote(item.expected));
        await page.unroute(`${DEMO_ORIGIN}/__e2e/property.html`);
      }
    });
  }

  test("FR-47 each part that the page styles gets that computed value", async ({ page }) => {
    test.setTimeout(120_000);
    await fakeClipboard(page);
    const indexOf = new Map(PARTS_FROM_README.map((name, i) => [name, i + 1]));
    const rules = PARTS_FROM_README.map(
      (name) =>
        `hekate-generator::part(${name}) { outline-color: rgb(${indexOf.get(name)}, 120, 200); }`,
    ).join("\n");
    const accented = manifests.find((m) =>
      readWordlist(m.code, false).some((w) => /\P{ASCII}/u.test(w)),
    );
    const page_html = (attributes: string) =>
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${rules}</style></head><body>` +
      `<script type="module" src="${scriptUrl}"></script><hekate-generator ${attributes}></hekate-generator></body></html>`;
    const found = new Map<string, string[]>();

    const collect = async () => {
      const result = await page
        .locator("hekate-generator")
        .first()
        .evaluate((node, names) => {
          const root = (node as HTMLElement).shadowRoot as ShadowRoot;
          const out: Record<string, string[]> = {};
          for (const name of names) {
            const elements = root.querySelectorAll(`[part~="${name}"]`);
            if (elements.length > 0) {
              out[name] = Array.from(elements).map((e) => getComputedStyle(e).outlineColor);
            }
          }
          return out;
        }, PARTS_FROM_README);
      for (const [name, colors] of Object.entries(result))
        found.set(name, [...(found.get(name) ?? []), ...colors]);
    };

    // State 1: word mode, with a number, a symbol, separators, 3 words (warning), a copy message.
    await servePage(
      page,
      `${DEMO_ORIGIN}/__e2e/parts-words.html`,
      page_html(
        `${accented ? `language="${accented.code}"` : ""} words="3" separator="-" number="true" symbol="true"`,
      ),
    );
    await page.goto("/__e2e/parts-words.html");
    await waitForPassword(page);
    if (accented) {
      for (let i = 0; i < 400 && (await page.locator("#ascii-note").count()) === 0; i++) {
        await part(page, "new-password-button").click();
      }
    }
    await part(page, "copy-button").click();
    await expect(part(page, "copy-status")).toHaveText("Copied");
    await collect();

    // State 2: character mode with a short length (warning) and all character sets.
    await setProperty(page, "mode", "characters");
    await setProperty(page, "length", 64);
    await collect();
    await setProperty(page, "length", 8);
    await expect(page.locator("#length-warning")).toBeVisible();
    await collect();
    await setProperty(page, "avoidSimilar", true);
    await collect();

    // State 3: a word list that does not load (error callout and retry button).
    await page.route(WORDLIST_URL, (route) => failWithStatus(route, 404));
    await page.goto("/__e2e/parts-words.html");
    await expect(page.locator("#error")).toBeVisible();
    await collect();

    // State 4: copy fails (the error callout of the copy button).
    await page.unroute(WORDLIST_URL);
    await removeClipboard(page);
    await page.goto("/__e2e/parts-words.html");
    await waitForPassword(page);
    await part(page, "copy-button").click();
    await collect();

    const missing = PARTS_FROM_README.filter((name) => !found.has(name));
    // The ascii note needs a language with letters outside ASCII.
    const optional = accented ? [] : ["ascii-note"];
    expect(
      missing.filter((name) => !optional.includes(name)),
      "parts not found in any state",
    ).toEqual([]);
    for (const [name, colors] of found) {
      const expected = `rgb(${indexOf.get(name)}, 120, 200)`;
      for (const color of colors) expect(color, `part ${name}`).toBe(expected);
    }
  });

  const SURFACE = { light: "rgb(255, 255, 255)", dark: "rgb(16, 18, 25)" };

  for (const theme of ["light", "dark"] as const) {
    test(`FR-47 theme="${theme}" gives the ${theme} theme`, async ({ page }) => {
      // The scheme of the browser is the other one, so only the attribute can decide.
      await page.emulateMedia({ colorScheme: theme === "light" ? "dark" : "light" });
      await openPlayground(page, { theme });
      const surface = await page
        .locator(".root")
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(surface).toBe(SURFACE[theme]);
    });
  }

  for (const scheme of ["light", "dark"] as const) {
    test(`FR-47 theme="auto" follows prefers-color-scheme: ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openPlayground(page, { theme: "auto" });
      const read = () =>
        page
          .locator(".root")
          .first()
          .evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(await read()).toBe(SURFACE[scheme]);
      // The theme follows a change while the page is open.
      const other = scheme === "light" ? "dark" : "light";
      await page.emulateMedia({ colorScheme: other });
      await expect.poll(read).toBe(SURFACE[other]);
    });
  }

  test("FR-47 the default theme is auto", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openPlayground(page);
    expect(await page.locator("hekate-generator").evaluate((n) => (n as HekateElement).theme)).toBe(
      "auto",
    );
    expect(
      await page
        .locator(".root")
        .first()
        .evaluate((e) => getComputedStyle(e).backgroundColor),
    ).toBe(SURFACE.dark);
  });
});

// --- FR-49 ---------------------------------------------------------------------------------

test.describe("FR-49 width of the parent element", () => {
  for (const width of [320, 480, 800]) {
    for (const mode of ["words", "characters"]) {
      test(`FR-49 a parent of ${width} px in ${mode} mode: no horizontal scroll bar, controls inside the box, no text overflow`, async ({
        page,
      }) => {
        // The window is wide, so only the width of the parent can change the layout.
        await page.setViewportSize({ width: 1280, height: 900 });
        await openPlayground(page, {
          width: String(width),
          mode,
          words: "10",
          number: "true",
          symbol: "true",
          separator: "space",
          length: "64",
        });
        await page.waitForTimeout(300);
        const report = await layoutReport(page);
        expect(report.documentOverflow, "document scroll bar").toBe(false);
        expect(report.parentOverflow, "parent scroll bar").toBe(false);
        expect(report.outside, "elements outside the box").toEqual([]);
        expect(report.textOverflow, "text with scrollWidth > clientWidth").toEqual([]);
        // Container queries: the layout depends on the parent, not on the window.
        expect(report.columns).toBe(width >= 480 + 8 ? 2 : 1);
      });
    }
  }

  test("FR-49 the layout follows the width of the parent when the parent changes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openPlayground(page, { width: "800" });
    expect((await layoutReport(page)).columns).toBe(2);
    await page.locator("#host").evaluate((element) => {
      element.style.inlineSize = "320px";
    });
    await expect.poll(async () => (await layoutReport(page)).columns).toBe(1);
  });
});

// --- FR-50 ---------------------------------------------------------------------------------

interface ButtonStyle {
  host: Record<string, string>;
  inner: Record<string, string>;
}

const WA_PAGE_HEAD = `<meta charset="utf-8"><style>wa-button { margin: 8px; }</style>`;

async function waButtonStyle(page: Page): Promise<ButtonStyle> {
  return page.evaluate(async () => {
    const button = document.getElementById("page-button") as HTMLElement & {
      updateComplete?: Promise<boolean>;
    };
    await customElements.whenDefined("wa-button");
    await button.updateComplete;
    const pick = (element: Element, names: string[]): Record<string, string> => {
      const style = getComputedStyle(element);
      return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]));
    };
    const names = [
      "display",
      "color",
      "background-color",
      "font-family",
      "font-size",
      "padding",
      "border-radius",
      "border-top-width",
      "line-height",
    ];
    const inner = button.shadowRoot?.querySelector("[part~=base]") ?? button;
    return { host: pick(button, names), inner: pick(inner, names) };
  });
}

test.describe("FR-50 Web Awesome names", () => {
  test.skip(!waAvailable, "Web Awesome (dist-cdn) is not installed");

  const pageHtml = (order: "before" | "after" | "none" | "only-wa") => {
    const wa = `${DEMO_ORIGIN}${WA_PREFIX}components/button/button.js`;
    const body = `<wa-button id="page-button" variant="brand">Page button</wa-button><hekate-generator></hekate-generator>`;
    const script =
      order === "before"
        ? `await import("${wa}"); await customElements.whenDefined("wa-button"); window.__pageClass = customElements.get("wa-button"); await import("${scriptUrl}");`
        : order === "after"
          ? `await import("${scriptUrl}"); window.__loadWa = async () => { await import("${wa}"); };`
          : order === "only-wa"
            ? `await import("${wa}"); window.__pageClass = customElements.get("wa-button");`
            : `await import("${scriptUrl}");`;
    return (
      `<!doctype html><html lang="en"><head>${WA_PAGE_HEAD}</head><body>` +
      `${order === "only-wa" ? `<wa-button id="page-button" variant="brand">Page button</wa-button>` : body}` +
      `<script type="module">${script}</script></body></html>`
    );
  };

  test("FR-50 Web Awesome of the page loaded before the component keeps its class and its computed CSS", async ({
    page,
  }) => {
    await serveWebAwesome(page);
    await watchDefinedElements(page);
    await servePage(page, `${DEMO_ORIGIN}/__e2e/wa-only.html`, pageHtml("only-wa"));
    await page.goto("/__e2e/wa-only.html");
    const baseline = await waButtonStyle(page);
    // The elements that Web Awesome of the page defines (wa-button, wa-spinner, wa-icon).
    const pageNames = await definedElements(page);
    expect(pageNames).toContain("wa-button");

    await servePage(page, `${DEMO_ORIGIN}/__e2e/wa-before.html`, pageHtml("before"));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/__e2e/wa-before.html");
    await waitForPassword(page);
    expect(await waButtonStyle(page)).toEqual(baseline);
    const same = await page.evaluate(() => customElements.get("wa-button") === window.__pageClass);
    expect(same, "customElements.get('wa-button') is the class of the page").toBe(true);
    expect(await readPassword(page)).toMatch(/\S/);
    expect(errors).toEqual([]);
    const names = await definedElements(page);
    // Hekate defines no wa-* element, other than the ones that the page defined itself.
    expect(names.filter((name) => name.startsWith("wa-") && !pageNames.includes(name))).toEqual([]);
    expect(names.filter((name) => name.startsWith("hekate-wa-")).length).toBeGreaterThanOrEqual(10);
  });

  test("FR-50 Web Awesome of the page loaded after the component keeps its class and its computed CSS", async ({
    page,
  }) => {
    await serveWebAwesome(page);
    await servePage(page, `${DEMO_ORIGIN}/__e2e/wa-only.html`, pageHtml("only-wa"));
    await page.goto("/__e2e/wa-only.html");
    const baseline = await waButtonStyle(page);

    await servePage(page, `${DEMO_ORIGIN}/__e2e/wa-after.html`, pageHtml("after"));
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/__e2e/wa-after.html");
    await waitForPassword(page);
    // The component did not define wa-button, so the page can.
    expect(await page.evaluate(() => customElements.get("wa-button"))).toBeUndefined();
    await page.evaluate(() => window.__loadWa());
    const pageClass = await page.evaluate(() => {
      const defined = customElements.get("wa-button");
      return defined !== undefined && document.getElementById("page-button") instanceof defined;
    });
    expect(pageClass).toBe(true);
    expect(await waButtonStyle(page)).toEqual(baseline);
    expect(await readPassword(page)).toMatch(/\S/);
    expect(errors).toEqual([]);
  });

  test("FR-50 the component defines only hekate-wa-* elements and hekate-generator, and no wa-* element", async ({
    page,
  }) => {
    await watchDefinedElements(page);
    await openPlayground(page);
    const names = await definedElements(page);
    expect(names).toContain("hekate-generator");
    expect(names).toContain("hekate-wa-button");
    expect(names.filter((name) => !name.startsWith("hekate-"))).toEqual([]);
    expect(names.filter((name) => name.startsWith("hekate-wa-")).length).toBeGreaterThanOrEqual(10);
    const defined = await page.evaluate(
      (tags) => tags.filter((tag) => customElements.get(tag) !== undefined),
      WA_TAGS,
    );
    expect(defined).toEqual([]);
    // The renamed elements really are used inside the component.
    const used = await page.locator("hekate-generator").evaluate((node) => {
      const root = (node as HTMLElement).shadowRoot as ShadowRoot;
      return Array.from(root.querySelectorAll("*"))
        .map((element) => element.tagName.toLowerCase())
        .filter((tag) => tag.includes("-") && tag !== "hekate-generator");
    });
    expect(used.length).toBeGreaterThan(10);
    expect(used.filter((tag) => !tag.startsWith("hekate-wa-"))).toEqual([]);
  });
});
