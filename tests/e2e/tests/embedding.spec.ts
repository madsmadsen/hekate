// Embedding: FR-40, FR-42, FR-43, FR-44, FR-45, FR-46.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  openPlayground,
  part,
  readPassword,
  readState,
  waitForPassword,
  type HekateElement,
} from "../support/component.ts";
import { servePage } from "../support/browser.ts";
import {
  ASSET_ORIGIN,
  DEMO_CSP,
  DEMO_ORIGIN,
  assetsBase,
  distFile,
  distLocales,
  hasPseudoLocale,
  languageCodes,
  manifests,
  repoRoot,
  scriptUrl,
  version,
} from "../support/env.ts";
import { recordConsole, recordRequests, wordlistRequests } from "../support/network.ts";

const failures = (messages: Array<{ type: string; text: string }>) =>
  messages.filter((message) => message.type === "error" || message.type === "pageerror");

test.describe("FR-40 custom element", () => {
  test("FR-40 a page with only the script tag and the component tag shows a 5-word password, the strength label and the copy button", async ({
    page,
  }) => {
    const messages = recordConsole(page);
    await servePage(
      page,
      `${DEMO_ORIGIN}/__e2e/two-tags.html`,
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Two tags</title></head><body>` +
        `<script type="module" src="${scriptUrl}"></script>` +
        `<hekate-generator></hekate-generator></body></html>`,
    );
    await page.goto("/__e2e/two-tags.html");
    await waitForPassword(page);
    // The default is 5 words in PascalCase.
    expect(await readPassword(page)).toMatch(/^(?:\p{Lu}\p{Ll}+){5}$/u);
    await expect(page.locator("#strength-label")).toHaveText(
      /^\s*(Weak|Fair|Strong|Very strong)\s*$/,
    );
    await expect(part(page, "copy-button")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Copy/ })).toBeVisible();
    expect(failures(messages)).toEqual([]);
  });

  test("FR-40 the demo page index.html shows a password and the browser console shows no error", async ({
    page,
  }) => {
    const messages = recordConsole(page);
    await page.goto("/");
    await waitForPassword(page);
    await expect(part(page, "copy-button")).toBeVisible();
    expect(failures(messages)).toEqual([]);
  });
});

// --- FR-42 ---------------------------------------------------------------------------------

interface Case {
  attribute: string;
  value: string;
  /** `undefined`: the value is not valid, so the default is used and there is a warning. */
  expected?: unknown;
  property: string;
}

const SEPARATORS = ["none", "-", ".", "_", "space"];
const booleanCases = (attribute: string, property: string): Case[] => [
  ...["true", "false", "TRUE", "False"].map((value) => ({
    attribute,
    value,
    property,
    expected: value.toLowerCase() === "true",
  })),
  ...["yes", "1", "", "on"].map((value) => ({ attribute, value, property })),
];

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const FR42_CASES: Case[] = [
  ...["words", "characters", "CHARACTERS", "Words"].map((value) => ({
    attribute: "mode",
    property: "mode",
    value,
    expected: value.toLowerCase(),
  })),
  ...["", "x", "word"].map((value) => ({ attribute: "mode", property: "mode", value })),
  ...languageCodes.flatMap((code) => [
    { attribute: "language", property: "language", value: code, expected: code },
    { attribute: "language", property: "language", value: code.toUpperCase(), expected: code },
  ]),
  ...["xx", "english", "de-AT", ""].map((value) => ({
    attribute: "language",
    property: "language",
    value,
  })),
  ...range(3, 10).map((n) => ({
    attribute: "words",
    property: "words",
    value: String(n),
    expected: n,
  })),
  ...["2", "11", "abc", "5.5", "-4", "", "0", "1e1"].map((value) => ({
    attribute: "words",
    property: "words",
    value,
  })),
  ...SEPARATORS.map((value) => ({
    attribute: "separator",
    property: "separator",
    value,
    expected: value,
  })),
  { attribute: "separator", property: "separator", value: "SPACE", expected: "space" },
  ...["comma", "", "--"].map((value) => ({ attribute: "separator", property: "separator", value })),
  ...["lower", "title", "random", "TITLE"].map((value) => ({
    attribute: "capitalization",
    property: "capitalization",
    value,
    expected: value.toLowerCase(),
  })),
  ...["upper", ""].map((value) => ({
    attribute: "capitalization",
    property: "capitalization",
    value,
  })),
  ...booleanCases("number", "number"),
  ...booleanCases("symbol", "symbol"),
  ...booleanCases("ascii-only", "asciiOnly"),
  ...booleanCases("avoid-similar", "avoidSimilar"),
  ...range(8, 64).map((n) => ({
    attribute: "length",
    property: "length",
    value: String(n),
    expected: n,
  })),
  ...["7", "65", "x", "12.5", "", "0"].map((value) => ({
    attribute: "length",
    property: "length",
    value,
  })),
  { attribute: "charsets", property: "charsets", value: "lower", expected: ["lower"] },
  {
    attribute: "charsets",
    property: "charsets",
    value: "upper,digits",
    expected: ["upper", "digits"],
  },
  {
    attribute: "charsets",
    property: "charsets",
    value: "lower,upper,digits,symbols",
    expected: ["lower", "upper", "digits", "symbols"],
  },
  {
    attribute: "charsets",
    property: "charsets",
    value: "Symbols, DIGITS",
    expected: ["digits", "symbols"],
  },
  ...["", "lower,emoji", "abc", ","].map((value) => ({
    attribute: "charsets",
    property: "charsets",
    value,
  })),
  ...["light", "dark", "auto", "DARK"].map((value) => ({
    attribute: "theme",
    property: "theme",
    value,
    expected: value.toLowerCase(),
  })),
  ...["blue", ""].map((value) => ({ attribute: "theme", property: "theme", value })),
  { attribute: "ui-language", property: "uiLanguage", value: "en", expected: "en" },
  ...distLocales
    .filter((locale) => locale !== "qps" || hasPseudoLocale)
    .map((locale) => ({
      attribute: "ui-language",
      property: "uiLanguage",
      value: locale,
      expected: locale,
    })),
  ...["xx", ""].map((value) => ({ attribute: "ui-language", property: "uiLanguage", value })),
  {
    attribute: "assets-url",
    property: "assetsUrl",
    value: assetsBase,
    expected: assetsBase,
  },
  {
    attribute: "assets-url",
    property: "assetsUrl",
    value: assetsBase.slice(0, -1),
    expected: assetsBase,
  },
  ...[
    "ftp://localhost/x/",
    "http://example.com/",
    "/relative/",
    "https://user:pw@example.com/",
    "https://example.com/?q=1",
    "",
  ].map((value) => ({ attribute: "assets-url", property: "assetsUrl", value })),
];

const DEFAULTS: Record<string, unknown> = {
  mode: "words",
  words: 5,
  separator: "none",
  capitalization: "title",
  number: false,
  symbol: false,
  asciiOnly: false,
  length: 20,
  charsets: ["lower", "upper", "digits", "symbols"],
  avoidSimilar: false,
  theme: "auto",
  uiLanguage: undefined,
  assetsUrl: undefined,
};

test.describe("FR-42 start options", () => {
  test("FR-42 each attribute: an allowed value is used, a value that is not valid gives the default and a console warning", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/");
    await waitForPassword(page);
    const results = await page.evaluate(async (cases) => {
      const out: Array<{ props: Record<string, unknown>; warnings: string[] }> = [];
      for (const item of cases) {
        const warnings: string[] = [];
        const original = console.warn;
        console.warn = (...args: unknown[]) => void warnings.push(args.join(" "));
        const element = document.createElement("hekate-generator") as HekateElement;
        // The extra components must not start a word list download for each case.
        element.setAttribute(item.attribute, item.value);
        console.warn = original;
        const props: Record<string, unknown> = {
          mode: element.mode,
          language: element.language,
          words: element.words,
          separator: element.separator,
          capitalization: element.capitalization,
          number: element.number,
          symbol: element.symbol,
          asciiOnly: element.asciiOnly,
          length: element.length,
          charsets: [...element.charsets],
          avoidSimilar: element.avoidSimilar,
          theme: element.theme,
          uiLanguage: element.uiLanguage,
          assetsUrl: element.assetsUrl,
        };
        out.push({ props, warnings });
      }
      return out;
    }, FR42_CASES);
    expect(results).toHaveLength(FR42_CASES.length);
    FR42_CASES.forEach((item, index) => {
      const result = results[index];
      const label = `${item.attribute}="${item.value}"`;
      if (item.expected !== undefined) {
        expect(result?.props[item.property], label).toEqual(item.expected);
        expect(result?.warnings, label).toEqual([]);
      } else {
        const fallback = item.property === "language" ? undefined : DEFAULTS[item.property];
        expect(result?.props[item.property], label).toEqual(fallback);
        expect(result?.warnings, label).toHaveLength(1);
        expect(result?.warnings[0], label).toContain(`"${item.attribute}" attribute`);
      }
    });
  });

  test("FR-42 the limits 3, 10, 2, 11 for words and 8, 64, 7, 65 for length show in the UI", async ({
    page,
  }) => {
    const warnings: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning") warnings.push(message.text());
    });
    for (const [value, words] of [
      ["3", 3],
      ["10", 10],
      ["2", 5],
      ["11", 5],
    ] as const) {
      await openPlayground(page, { words: value });
      expect((await readState(page)).words).toBe(words);
      await expect(part(page, "words-value")).toContainText(String(words));
    }
    for (const [value, length] of [
      ["8", 8],
      ["64", 64],
      ["7", 20],
      ["65", 20],
    ] as const) {
      await openPlayground(page, { mode: "characters", length: value });
      expect((await readState(page)).length).toBe(length);
      await expect(page.locator("#password-length")).toHaveText(`Length: ${length} characters`);
    }
    // Two values of "words" and two of "length" are not valid: 4 warnings.
    expect(warnings.filter((text) => /"(words|length)" attribute/.test(text))).toHaveLength(4);
  });

  test("FR-42 the user can still change all options in the UI", async ({ page }) => {
    await openPlayground(page, { words: "7", separator: "-", number: "true", theme: "dark" });
    expect(await readState(page)).toMatchObject({ words: 7, separator: "-", number: true });
    await page.locator("[part=words] [role=slider]").focus();
    await page.keyboard.press("Home");
    await expect.poll(async () => (await readState(page)).words).toBe(3);
    await part(page, "number").click();
    await expect.poll(async () => (await readState(page)).number).toBe(false);
  });

  test("FR-42 the attributes of the playground page reach the component", async ({ page }) => {
    await openPlayground(page, {
      language: "en-US",
      words: "4",
      separator: "space",
      capitalization: "lower",
    });
    const password = await readPassword(page);
    expect(password).toMatch(/^[a-z]+( [a-z]+){3}$/);
  });
});

// --- FR-43 ---------------------------------------------------------------------------------

test.describe("FR-43 asset location", () => {
  test("FR-43 the component script comes from a second origin and loads all files from that origin", async ({
    page,
  }) => {
    const requests = recordRequests(page);
    await page.goto("/");
    await waitForPassword(page);
    expect(new URL(page.url()).origin).toBe(DEMO_ORIGIN);
    const urls = requests.map((request) => request.url);
    expect(urls).toContain(`${assetsBase}hekate.js`);
    expect(urls).toContain(`${assetsBase}hekate.wasm`);
    expect(wordlistRequests(requests).length).toBeGreaterThan(0);
    for (const url of urls) {
      const origin = new URL(url).origin;
      expect([DEMO_ORIGIN, ASSET_ORIGIN]).toContain(origin);
      // Everything except the page itself and its CSS file comes from the asset host.
      if (origin === DEMO_ORIGIN) expect(url).toMatch(/\/(index\.html|demo\.css)?$/);
    }
    for (const url of urls.filter((u) => /wasm|wordlists/.test(u))) {
      expect(url.startsWith(assetsBase), url).toBe(true);
    }
  });

  test("FR-43 with assets-url set, the component loads all its files from that URL", async ({
    page,
  }) => {
    // A third origin: http://localhost:8082 gives the same files as the asset host, under /assets/.
    const other = "http://localhost:8082/assets/";
    await page.route("http://localhost:8082/**", async (route) => {
      const path = new URL(route.request().url()).pathname.replace(/^\/assets\//, "");
      const response = await route.fetch({ url: `${assetsBase}${path}` });
      await route.fulfill({ response });
    });
    await servePage(
      page,
      `${DEMO_ORIGIN}/__e2e/assets-url.html`,
      `<!doctype html><html lang="en"><body>` +
        `<script type="module" src="${scriptUrl}"></script>` +
        `<hekate-generator assets-url="${other}" ${hasPseudoLocale ? 'ui-language="qps"' : ""}></hekate-generator>` +
        `</body></html>`,
    );
    const requests = recordRequests(page);
    await page.goto("/__e2e/assets-url.html");
    await waitForPassword(page);
    const urls = requests
      .map((request) => request.url)
      .filter((url) => !url.startsWith(DEMO_ORIGIN));
    expect(urls).toContain(scriptUrl);
    const rest = urls.filter((url) => url !== scriptUrl);
    expect(rest.length).toBeGreaterThanOrEqual(2);
    for (const url of rest) expect(url.startsWith(other), url).toBe(true);
    expect(rest).toContain(`${other}hekate.wasm`);
    expect(rest.some((url) => url.includes("/wordlists/"))).toBe(true);
    if (hasPseudoLocale) expect(rest).toContain(`${other}locales/qps.json`);
  });
});

// --- FR-44 ---------------------------------------------------------------------------------

test.describe("FR-44 several components", () => {
  test("FR-44 two components show two different passwords and one request loads each word list", async ({
    page,
  }) => {
    const requests = recordRequests(page);
    await page.goto("/multi.html");
    await waitForPassword(page, 0);
    await waitForPassword(page, 1);
    const first = await readPassword(page, 0);
    const second = await readPassword(page, 1);
    expect(first).not.toBe(second);
    const lists = wordlistRequests(requests);
    expect(lists).toEqual([`${assetsBase}wordlists/en-US/words.txt`]);
    expect(requests.filter((request) => request.url.endsWith("hekate.wasm"))).toHaveLength(1);
  });

  test("FR-44 each component works on its own", async ({ page }) => {
    await page.goto("/multi.html");
    await waitForPassword(page, 0);
    await waitForPassword(page, 1);
    const before = await readPassword(page, 1);
    const hosts = page.locator("hekate-generator");
    await hosts.nth(0).evaluate(async (node) => {
      const element = node as HekateElement;
      element.words = 3;
      element.mode = "characters";
      await element.updateComplete;
    });
    await expect(hosts.nth(0).locator("#password-length")).toBeVisible();
    // The second component keeps its mode and its password.
    expect(await hosts.nth(1).evaluate((node) => (node as HekateElement).mode)).toBe("words");
    expect(await readPassword(page, 1)).toBe(before);
  });

  test("FR-44 a language that the second component selects later loads one time, even for two components", async ({
    page,
  }) => {
    test.skip(!languageCodes.includes("de"), "the word list de is not in wordlists/ yet");
    const requests = recordRequests(page);
    await page.goto("/multi.html");
    await waitForPassword(page, 0);
    await waitForPassword(page, 1);
    await page.locator("hekate-generator").evaluateAll(async (nodes) => {
      for (const node of nodes) (node as HekateElement).language = "de";
      await Promise.all(nodes.map((node) => (node as HekateElement).updateComplete));
    });
    await expect
      .poll(() => wordlistRequests(requests).filter((url) => url.includes("/wordlists/de/")))
      .toHaveLength(1);
    await page.waitForTimeout(500);
    expect(wordlistRequests(requests).filter((url) => url.includes("/wordlists/de/"))).toHaveLength(
      1,
    );
  });
});

// --- FR-45 ---------------------------------------------------------------------------------

test.describe("FR-45 safe registration", () => {
  test("FR-45 loading the component script two times shows no error", async ({ page }) => {
    const messages = recordConsole(page);
    await servePage(
      page,
      `${DEMO_ORIGIN}/__e2e/twice.html`,
      `<!doctype html><html lang="en"><body>` +
        `<script type="module" src="${scriptUrl}"></script>` +
        `<script type="module" src="${scriptUrl}"></script>` +
        `<hekate-generator></hekate-generator></body></html>`,
    );
    await page.goto("/__e2e/twice.html");
    await waitForPassword(page);
    // A later import of the same script.
    await page.evaluate((url) => import(url), scriptUrl);
    await page.waitForTimeout(500);
    expect(failures(messages)).toEqual([]);
    expect(await page.locator("hekate-generator").count()).toBe(1);
    expect(await readPassword(page)).toMatch(/\S/);
  });

  test("FR-45 a second copy of the script from another URL shows no error", async ({ page }) => {
    // Known component bug: the second copy defines the hekate-wa-* elements again and the
    // browser throws NotSupportedError before the check for hekate-generator is reached.
    const messages = recordConsole(page);
    await servePage(
      page,
      `${DEMO_ORIGIN}/__e2e/twice-url.html`,
      `<!doctype html><html lang="en"><body>` +
        `<script type="module" src="${scriptUrl}"></script>` +
        `<script type="module" src="${scriptUrl}?second"></script>` +
        `<hekate-generator></hekate-generator></body></html>`,
    );
    await page.goto("/__e2e/twice-url.html");
    await waitForPassword(page);
    await page.waitForTimeout(500);
    expect(failures(messages)).toEqual([]);
  });

  test("FR-45 a page that defines hekate-generator first keeps its own class and the script raises no error", async ({
    page,
  }) => {
    const messages = recordConsole(page);
    await servePage(
      page,
      `${DEMO_ORIGIN}/__e2e/predefined.html`,
      `<!doctype html><html lang="en"><body>` +
        `<hekate-generator>fallback</hekate-generator>` +
        `<script>customElements.define("hekate-generator", class extends HTMLElement { connectedCallback() { this.dataset.page = "yes"; } });</script>` +
        `<script type="module" src="${scriptUrl}"></script></body></html>`,
    );
    await page.goto("/__e2e/predefined.html");
    await page.waitForTimeout(1500);
    expect(failures(messages)).toEqual([]);
    expect(await page.locator("hekate-generator").getAttribute("data-page")).toBe("yes");
  });
});

// --- FR-46 ---------------------------------------------------------------------------------

test.describe("FR-46 distribution", () => {
  test("FR-46 dist/<version>/ has the script, the WASM module, the word lists, the license files and the SRI value", async () => {
    for (const name of ["hekate.js", "hekate.wasm", "sri.txt", "THIRD-PARTY-LICENSES.html"]) {
      expect(existsSync(distFile(name)), name).toBe(true);
    }
    expect(existsSync(distFile("LICENSES"))).toBe(true);
    for (const manifest of manifests) {
      for (const file of ["words.txt", "words-ascii.txt"]) {
        expect(
          existsSync(distFile("wordlists", manifest.code, file)),
          `${manifest.code}/${file}`,
        ).toBe(true);
      }
      expect(existsSync(distFile("LICENSES", `${manifest.code}.txt`)), manifest.code).toBe(true);
    }
    expect(version).toMatch(/^\d{4}\.\d{2}\.\d{2}-\d{4}$/);
    const sri = readFileSync(distFile("sri.txt"), "utf8").trim();
    const digest = createHash("sha384")
      .update(readFileSync(distFile("hekate.js")))
      .digest("base64");
    expect(sri).toBe(`sha384-${digest}`);
    expect(existsSync(distFile("NOTICE")) || existsSync(`${repoRoot}/NOTICE`)).toBe(true);
  });

  test("FR-46 the development server sends the headers of the README for every file of dist/", async ({
    request,
  }) => {
    const files = [
      "hekate.js",
      "hekate.wasm",
      "sri.txt",
      "THIRD-PARTY-LICENSES.html",
      ...manifests.flatMap((m) => [
        `wordlists/${m.code}/words.txt`,
        `wordlists/${m.code}/words-ascii.txt`,
      ]),
      ...distLocales.map((locale) => `locales/${locale}.json`),
    ];
    for (const file of files) {
      const response = await request.get(`${assetsBase}${file}`);
      expect(response.status(), file).toBe(200);
      const headers = response.headers();
      expect(headers["cache-control"], file).toBe("no-store");
      expect(headers["access-control-allow-origin"], file).toBe("*");
      expect(headers["cross-origin-resource-policy"], file).toBe("cross-origin");
      expect(headers["set-cookie"], file).toBeUndefined();
      if (file.endsWith(".wasm")) expect(headers["content-type"]).toBe("application/wasm");
    }
  });

  test("FR-46 the demo server sends no-store and the CSP of the PRD, and the tests run against nginx", async ({
    request,
  }) => {
    const response = await request.get("/");
    expect(response.headers().server).toContain("nginx");
    expect(response.headers()["cache-control"]).toBe("no-store");
    expect(response.headers()["content-security-policy"]).toBe(DEMO_CSP);
    const sri = readFileSync(distFile("sri.txt"), "utf8").trim();
    const html = await response.text();
    expect(html).toContain(`/${version}/hekate.js`);
    expect(html).toContain(`integrity="${sri}"`);
    expect(html).toContain('crossorigin="anonymous"');
  });
});
