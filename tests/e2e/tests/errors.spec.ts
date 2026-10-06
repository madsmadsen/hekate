// Errors: FR-80 to FR-87, SR-3. Faults come from page.route() (network) and addInitScript() (browser).
import { expect, test, type Page } from "@playwright/test";
import {
  WORDLIST_URL,
  changeOneByte,
  failWithStatus,
  removeClipboard,
  removeGlobal,
  removeRandom,
  servePage,
  instrumentWasm,
} from "../support/browser.ts";
import {
  openPlayground,
  part,
  readPassword,
  selectedText,
  waitForPassword,
} from "../support/component.ts";
import { DEMO_ORIGIN, assetsBase, englishText, scriptUrl } from "../support/env.ts";
import { recordConsole } from "../support/network.ts";
import { pseudoText, requirePseudo } from "../support/pseudo.ts";

const WASM_URL = `${assetsBase}hekate.wasm`;
const LOCALE_URL = /\/locales\/qps\.json$/;

async function expectNoPassword(page: Page): Promise<void> {
  await expect(page.locator("#strength-label")).toHaveCount(0);
  await expect(page.locator("#entropy")).toHaveCount(0);
  const field = page.locator("#password");
  if ((await field.count()) > 0) {
    expect(await field.evaluate((element) => (element.textContent ?? "").trim())).toBe("");
  }
}

/** A page with the component, served by page.route(). It has no CSP unless `headers` has one. */
async function componentPage(
  page: Page,
  options: {
    attributes?: string;
    headers?: Record<string, string>;
    fallback?: string;
    url?: string;
    script?: string;
  } = {},
): Promise<string> {
  const url = options.url ?? `${DEMO_ORIGIN}/__e2e/component.html`;
  await servePage(
    page,
    url,
    `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>` +
      `<script type="module" src="${options.script ?? scriptUrl}"></script>` +
      `<hekate-generator ${options.attributes ?? ""}>${options.fallback ?? ""}</hekate-generator></body></html>`,
    options.headers,
  );
  return url;
}

test.describe("FR-80 word list does not load", () => {
  test("FR-80 HTTP 404: the error and the button show and there is no password, then the button gets the password", async ({
    page,
  }) => {
    await page.route(WORDLIST_URL, (route) => failWithStatus(route, 404));
    await openPlayground(page, { language: "en-US" }, { waitForPassword: false });
    const error = page.locator("#error");
    await expect(error).toBeVisible();
    await expect(error).toContainText(englishText("error.wordlist"));
    const retry = part(page, "retry-button");
    await expect(retry).toBeVisible();
    await expect(retry).toContainText(englishText("action.retry"));
    await expectNoPassword(page);
    await expect(part(page, "copy-button")).toHaveJSProperty("disabled", true);
    // The request can succeed now.
    await page.unroute(WORDLIST_URL);
    await retry.click();
    await waitForPassword(page);
    expect(await readPassword(page)).toMatch(/\S/);
    await expect(page.locator("#error")).toHaveCount(0);
  });

  test("FR-80 network error: the error and the button show, and the button sends the request again", async ({
    page,
  }) => {
    await page.route(WORDLIST_URL, (route) => route.abort("failed"));
    await openPlayground(page, { language: "en-US" }, { waitForPassword: false });
    await expect(page.locator("#error")).toContainText(englishText("error.wordlist"));
    await expect(part(page, "retry-button")).toBeVisible();
    await expectNoPassword(page);
    await page.unroute(WORDLIST_URL);
    await part(page, "retry-button").click();
    await waitForPassword(page);
  });

  test("FR-80 HTTP 500 after the start: a language that fails shows the error and Try again works", async ({
    page,
  }) => {
    await openPlayground(page, { language: "en-US" });
    await page.route(/\/wordlists\/en-GB\/words\.txt$/, (route) => failWithStatus(route, 500));
    await page.locator("hekate-generator").evaluate(async (node) => {
      const element = node as HTMLElement & { language: string; updateComplete: Promise<boolean> };
      element.language = "en-GB";
      await element.updateComplete;
    });
    await expect(page.locator("#error")).toContainText(englishText("error.wordlist"));
    await expectNoPassword(page);
    await page.unroute(/\/wordlists\/en-GB\/words\.txt$/);
    await part(page, "retry-button").click();
    await waitForPassword(page);
  });
});

test.describe("FR-81 wrong word list hash", () => {
  for (const ascii of [false, true]) {
    test(`FR-81 one changed byte in ${ascii ? "the ASCII" : "the"} word list: error, no password and no button`, async ({
      page,
    }) => {
      await page.route(WORDLIST_URL, (route) => changeOneByte(route));
      await openPlayground(
        page,
        { language: "en-US", ...(ascii ? { "ascii-only": "true" } : {}) },
        { waitForPassword: false },
      );
      await expect(page.locator("#error")).toContainText(englishText("error.wordlistHash"));
      await expectNoPassword(page);
      await expect(part(page, "retry-button")).toHaveCount(0);
      await expect(page.getByRole("button", { name: englishText("action.retry") })).toHaveCount(0);
    });
  }
});

test.describe("FR-82 WASM module does not load", () => {
  test("FR-82 a CSP without 'wasm-unsafe-eval': error and no password", async ({ page }) => {
    const url = await componentPage(page, {
      headers: {
        "content-security-policy": `script-src 'self' ${new URL(scriptUrl).origin}; connect-src 'self' ${new URL(scriptUrl).origin}`,
      },
    });
    await page.goto(url);
    await expect(page.locator("#error")).toContainText(englishText("error.wasm"));
    await expectNoPassword(page);
  });

  test("FR-82 HTTP 500 for the WASM module: error and no password", async ({ page }) => {
    await page.route(WASM_URL, (route) => failWithStatus(route, 500));
    await openPlayground(page, {}, { waitForPassword: false });
    await expect(page.locator("#error")).toContainText(englishText("error.wasm"));
    await expectNoPassword(page);
  });

  test("FR-82 a network error for the WASM module: error and no password", async ({ page }) => {
    await page.route(WASM_URL, (route) => route.abort("failed"));
    await openPlayground(page, {}, { waitForPassword: false });
    await expect(page.locator("#error")).toContainText(englishText("error.wasm"));
    await expectNoPassword(page);
  });

  test("FR-82 a changed byte in the WASM module (SRI): error and no password", async ({ page }) => {
    await page.route(WASM_URL, (route) => changeOneByte(route, "binary"));
    await openPlayground(page, {}, { waitForPassword: false });
    await expect(page.locator("#error")).toContainText(englishText("error.wasm"));
    await expectNoPassword(page);
  });
});

test.describe("FR-83 translation does not load", () => {
  test.beforeEach(() => requirePseudo());

  test("FR-83 HTTP 404: the UI is in English, the console shows a warning and the component shows a password", async ({
    page,
  }) => {
    const messages = recordConsole(page);
    await page.route(LOCALE_URL, (route) => failWithStatus(route, 404));
    await openPlayground(page, { "ui-language": "qps" });
    await expect(part(page, "new-password-button")).toContainText(englishText("action.new"));
    await expect(page.locator("#error")).toHaveCount(0);
    expect(await readPassword(page)).toMatch(/\S/);
    expect(messages.some((m) => m.type === "warning" && /qps\.json/.test(m.text))).toBe(true);
  });

  test("FR-83 a network error: the UI is in English and the component shows a password", async ({
    page,
  }) => {
    const messages = recordConsole(page);
    await page.route(LOCALE_URL, (route) => route.abort("failed"));
    await openPlayground(page, { "ui-language": "qps" }, { waitForPassword: false });
    await waitForPassword(page);
    await expect(part(page, "new-password-button")).toContainText(englishText("action.new"));
    expect(messages.some((m) => m.type === "warning")).toBe(true);
  });

  test("FR-83 a wrong SRI hash: the component shows an error and no password", async ({ page }) => {
    await page.route(LOCALE_URL, (route) => changeOneByte(route));
    await openPlayground(page, { "ui-language": "qps" }, { waitForPassword: false });
    await expect(page.locator("#error")).toContainText(englishText("error.translation"));
    await expectNoPassword(page);
  });
});

test.describe("FR-84 copy fails", () => {
  const message = englishText("action.copyFailed");

  test("FR-84 without navigator.clipboard the message shows and the selected text is the password", async ({
    page,
  }) => {
    await removeClipboard(page);
    await openPlayground(page);
    const password = await readPassword(page);
    await part(page, "copy-button").click();
    await expect(page.locator("#copy-error")).toHaveText(message);
    expect(message).toBe("Copy failed. Select the password and copy it.");
    expect(await selectedText(page)).toBe(password);
    // The user can still select the text by hand.
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await page.locator("#password").click();
    expect(await selectedText(page)).toBe(password);
  });

  test("FR-84 a clipboard that refuses the write gives the same message", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.reject(new DOMException("denied", "NotAllowedError")) },
      });
    });
    await openPlayground(page, { mode: "characters" });
    await part(page, "copy-button").click();
    await expect(page.locator("#copy-error")).toHaveText(message);
    await expect(part(page, "copy-status")).toHaveText("");
  });
});

test.describe("FR-85 page is not secure", () => {
  test("FR-85 a page over plain HTTP from a host name that is not localhost: error and no password", async ({
    page,
  }) => {
    const url = "http://hekate-insecure.example/page.html";
    await componentPage(page, { url });
    await page.goto(url);
    expect(await page.evaluate(() => window.isSecureContext)).toBe(false);
    await expect(page.locator("#error")).toContainText(englishText("error.insecure"));
    await expectNoPassword(page);
  });

  test("FR-85 localhost is a secure context and shows a password", async ({ page }) => {
    await openPlayground(page);
    await waitForPassword(page);
    expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
  });
});

test.describe("FR-86 browser feature is not present", () => {
  test("FR-86 without customElements the page shows the fallback text", async ({ page }) => {
    await removeGlobal(page, "customElements");
    const url = await componentPage(page, {
      fallback: "Your browser cannot show the password generator.",
    });
    await page.goto(url);
    await expect(page.getByText("Your browser cannot show the password generator.")).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.locator("#password")).toHaveCount(0);
    expect(
      await page.evaluate(() => document.querySelector("hekate-generator")?.shadowRoot),
    ).toBeNull();
  });

  test("FR-86 without WebAssembly the component shows an error and no password", async ({
    page,
  }) => {
    await removeGlobal(page, "WebAssembly");
    const url = await componentPage(page, { fallback: "Fallback" });
    await page.goto(url);
    await expect(page.locator("#error")).toContainText(englishText("error.unsupported"));
    await expectNoPassword(page);
  });
});

test.describe("SR-3 fail closed", () => {
  for (const mode of ["words", "characters"] as const) {
    test(`SR-3 without crypto.getRandomValues the component shows an error and no password in ${mode} mode`, async ({
      page,
    }) => {
      await removeRandom(page);
      await openPlayground(page, { mode }, { waitForPassword: false });
      await expect(page.locator("#error")).toContainText(englishText("error.noRandom"));
      await expectNoPassword(page);
      await expect(page.getByRole("button", { name: englishText("action.new") })).toHaveCount(0);
    });

    test(`SR-3 when crypto.getRandomValues stops working later, the next click shows an error in ${mode} mode`, async ({
      page,
    }) => {
      await openPlayground(page, { mode });
      await page.evaluate(() => {
        Object.defineProperty(crypto, "getRandomValues", {
          configurable: true,
          value: () => {
            throw new DOMException("no entropy", "QuotaExceededError");
          },
        });
      });
      await part(page, "new-password-button").click();
      await expect(page.locator("#error")).toBeVisible();
      await expectNoPassword(page);
    });
  }
});

test.describe("FR-87 error text", () => {
  test.beforeEach(() => requirePseudo());

  const noEnglish = async (page: Page, selector: string, expected: string) => {
    const text = (await page.locator(selector).first().innerText()).replace(/\s+/g, " ").trim();
    expect(text).toContain(expected);
    expect(text.replace(expected, "")).not.toMatch(/[A-Za-z]{2,}/);
    expect(text).not.toMatch(/\b(not|this|the|password|could|make|browser)\b/);
  };

  test("FR-87 wordlist: the error is in the pseudo-locale", async ({ page }) => {
    await page.route(WORDLIST_URL, (route) => failWithStatus(route, 404));
    await openPlayground(page, { "ui-language": "qps" }, { waitForPassword: false });
    await expect(page.locator("#error")).toBeVisible();
    await noEnglish(page, "#error", pseudoText("error.wordlist"));
    await expect(part(page, "retry-button")).toContainText(pseudoText("action.retry"));
  });

  test("FR-87 wordlistHash: the error is in the pseudo-locale", async ({ page }) => {
    await page.route(WORDLIST_URL, (route) => changeOneByte(route));
    await openPlayground(page, { "ui-language": "qps" }, { waitForPassword: false });
    await expect(page.locator("#error")).toBeVisible();
    await noEnglish(page, "#error", pseudoText("error.wordlistHash"));
  });

  test("FR-87 wasm: the error is in the pseudo-locale", async ({ page }) => {
    await page.route(WASM_URL, (route) => failWithStatus(route, 500));
    await openPlayground(page, { "ui-language": "qps" }, { waitForPassword: false });
    await expect(page.locator("#error")).toBeVisible();
    await noEnglish(page, "#error", pseudoText("error.wasm"));
  });

  test("FR-87 translation: the error shows in English, because the translation did not load", async ({
    page,
  }) => {
    await page.route(LOCALE_URL, (route) => changeOneByte(route));
    await openPlayground(page, { "ui-language": "qps" }, { waitForPassword: false });
    await expect(page.locator("#error")).toBeVisible();
    // The message file is the one that failed, so the component has only English text.
    test.info().annotations.push({
      type: "note",
      description: "The translation error cannot be in the pseudo-locale: that file did not load.",
    });
    await expect(page.locator("#error")).toContainText(englishText("error.translation"));
  });

  // These errors come after the start, so the translation is already loaded.
  test("FR-87 insecure after the start: the error is in the pseudo-locale", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "isSecureContext", {
        configurable: true,
        get: () => window.__insecure !== true,
      });
    });
    await openPlayground(page, { "ui-language": "qps" });
    // insecure
    await page.evaluate(() => {
      window.__insecure = true;
    });
    await part(page, "new-password-button").click();
    await expect(page.locator("#error")).toBeVisible();
    await noEnglish(page, "#error", pseudoText("error.insecure"));
  });

  test("FR-87 noRandom after the start: the error is in the pseudo-locale", async ({ page }) => {
    await openPlayground(page, { "ui-language": "qps" });
    await page.evaluate(() => {
      Object.defineProperty(crypto, "getRandomValues", { configurable: true, value: undefined });
    });
    await part(page, "new-password-button").click();
    await expect(page.locator("#error")).toBeVisible();
    await noEnglish(page, "#error", pseudoText("error.noRandom"));
  });

  test("FR-87 unsupported after the start: the error is in the pseudo-locale", async ({ page }) => {
    await openPlayground(page, { "ui-language": "qps" });
    await page.evaluate(() => {
      Object.defineProperty(window, "WebAssembly", { configurable: true, value: undefined });
    });
    await part(page, "new-password-button").click();
    await expect(page.locator("#error")).toBeVisible();
    await noEnglish(page, "#error", pseudoText("error.unsupported"));
  });

  test("FR-87 generate: the error is in the pseudo-locale", async ({ page }) => {
    await instrumentWasm(page);
    await openPlayground(page, { "ui-language": "qps" });
    await page.evaluate(() => {
      if (window.__wasm) window.__wasm.fail = true;
    });
    await part(page, "new-password-button").click();
    await expect(page.locator("#error")).toBeVisible();
    await noEnglish(page, "#error", pseudoText("error.generate"));
  });

  test("FR-87 copy failed: the message is in the pseudo-locale", async ({ page }) => {
    await removeClipboard(page);
    await openPlayground(page, { "ui-language": "qps" });
    await part(page, "copy-button").click();
    await expect(page.locator("#copy-error")).toBeVisible();
    await noEnglish(page, "#copy-error", pseudoText("action.copyFailed"));
  });
});
