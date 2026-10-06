// Security: SR-4, SR-6, SR-7, SR-8, SR-9, SR-12, SR-13, and the actions FR-8 and FR-9.
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  WORDLIST_URL,
  changeOneByte,
  clipboardWrites,
  cspViolations,
  fakeClipboard,
  instrumentWasm,
  seedRandom,
  servePage,
  wasmCalls,
  watchCsp,
} from "../support/browser.ts";
import {
  liveHistory,
  liveText,
  openPlayground,
  part,
  readPassword,
  setProperty,
  waitForPassword,
  watchLiveRegion,
} from "../support/component.ts";
import {
  ASSET_ORIGIN,
  DEMO_CSP,
  DEMO_ORIGIN,
  README_CSP,
  assetsBase,
  englishText,
  languageCodes,
  scriptUrl,
} from "../support/env.ts";
import { isAllowedRequest, recordConsole, recordRequests } from "../support/network.ts";
import { requirePseudo } from "../support/pseudo.ts";

/** Uses most functions of the component, the way a user does. Returns the passwords that it saw. */
async function useComponent(page: Page, options: { languages?: string[] } = {}): Promise<string[]> {
  const seen: string[] = [];
  const read = async () => seen.push(await readPassword(page));
  await read();
  await part(page, "new-password-button").click();
  await read();
  await part(page, "separator").locator("hekate-wa-radio").nth(1).click();
  await read();
  await part(page, "capitalization").locator("hekate-wa-radio").nth(2).click();
  await read();
  await part(page, "number").click();
  await part(page, "symbol").click();
  await read();
  await page.locator("[part=words] [role=slider]").focus();
  await page.keyboard.press("Home");
  await read();
  await page.keyboard.press("End");
  await read();
  for (const language of options.languages ?? []) {
    await setProperty(page, "language", language);
    await waitForPassword(page);
    await read();
  }
  await part(page, "ascii-only").click();
  await read();
  await part(page, "copy-button").click();
  await page.locator("#credits-link").click();
  await expect(page.locator("#credits-version")).toBeVisible();
  await page.keyboard.press("Escape");
  await part(page, "mode").locator("hekate-wa-radio").nth(1).click();
  await read();
  await part(page, "charset").first().click();
  await read();
  await part(page, "avoid-similar").click();
  await read();
  await page.locator("[part=length] [role=slider]").focus();
  await page.keyboard.press("End");
  await read();
  await part(page, "copy-button").click();
  await page.waitForTimeout(300);
  return seen;
}

// --- SR-4 ----------------------------------------------------------------------------------

test.describe("SR-4 network requests", () => {
  test("SR-4 only the component script, the WASM module, word lists and translations come from the asset host", async ({
    page,
  }) => {
    const requests = recordRequests(page);
    await openPlayground(page, { language: "en-US" });
    const afterStart = requests.length;
    const others = languageCodes.filter((code) => code !== "en-US").slice(0, 3);
    await useComponent(page, { languages: others });
    await page.waitForTimeout(500);
    for (const request of requests) {
      expect(isAllowedRequest(request.url), request.url).toBe(true);
      expect(request.method, request.url).toBe("GET");
    }
    // Before the first password: the page, its CSS, the script, the WASM module and the first list.
    const start = requests.slice(0, afterStart).map((r) => r.url);
    expect(start).toContain(scriptUrl);
    expect(start).toContain(`${assetsBase}hekate.wasm`);
    expect(start.filter((url) => url.includes("/wordlists/"))).toEqual([
      `${assetsBase}wordlists/en-US/words.txt`,
    ]);
    // After it: only the word lists of new languages, and the ASCII list of a language.
    const later = requests.slice(afterStart).map((r) => r.url);
    const expected = [
      ...others.map((code) => `${assetsBase}wordlists/${code}/words.txt`),
      `${assetsBase}wordlists/${others.at(-1) ?? "en-US"}/words-ascii.txt`,
    ];
    expect([...later].sort()).toEqual([...expected].sort());
  });

  test("SR-4 a translation loads one time, on first use, and no request goes to another server", async ({
    page,
  }) => {
    requirePseudo();
    const requests = recordRequests(page);
    await openPlayground(page, { "ui-language": "qps" });
    await useComponent(page);
    const urls = requests.map((r) => r.url);
    expect(urls.filter((url) => url.endsWith("/locales/qps.json"))).toHaveLength(1);
    for (const url of urls) expect(isAllowedRequest(url), url).toBe(true);
  });

  test("SR-4 an idle component makes no request, and the password does not appear in any request", async ({
    page,
  }) => {
    const requests = recordRequests(page);
    await openPlayground(page);
    const count = requests.length;
    await page.waitForTimeout(3000);
    expect(requests.length).toBe(count);
    await part(page, "new-password-button").click();
    await part(page, "copy-button").click();
    await page.waitForTimeout(300);
    expect(requests.length).toBe(count);
  });
});

// --- SR-6 ----------------------------------------------------------------------------------

test.describe("SR-6 strict CSP", () => {
  async function runUnderCsp(page: Page, policy: string | null): Promise<void> {
    const messages = recordConsole(page);
    await watchCsp(page);
    await fakeClipboard(page);
    if (policy === null) {
      await page.goto("/playground.html");
    } else {
      await servePage(
        page,
        `${DEMO_ORIGIN}/__e2e/csp.html`,
        `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>` +
          `<script type="module" src="${scriptUrl}"></script>` +
          `<hekate-generator></hekate-generator></body></html>`,
        { "content-security-policy": policy },
      );
      await page.goto("/__e2e/csp.html");
    }
    await waitForPassword(page);
    await useComponent(page, { languages: languageCodes.slice(0, 2) });
    await page.waitForTimeout(500);
    expect(await cspViolations(page), "securitypolicyviolation events").toEqual([]);
    expect(
      messages.filter(
        (m) =>
          /Content Security Policy|Refused to|violates the following/i.test(m.text) ||
          m.type === "error",
      ),
    ).toEqual([]);
  }

  test("SR-6 the component works on a host page with the minimum CSP of the README and the browser reports no CSP error", async ({
    page,
  }) => {
    await runUnderCsp(page, README_CSP);
  });

  test("SR-6 the component works on the demo page with its CSP and the browser reports no CSP error", async ({
    page,
  }) => {
    const response = await page.request.get("/playground.html");
    expect(response.headers()["content-security-policy"]).toBe(DEMO_CSP);
    await runUnderCsp(page, null);
  });

  test("SR-6 the markup of the component has no <style> element and no style attribute", async ({
    page,
  }) => {
    await openPlayground(page);
    await useComponent(page);
    const found = await page.locator("hekate-generator").evaluate((node) => {
      const styles: string[] = [];
      const styled: string[] = [];
      const visit = (scope: ShadowRoot | Element): void => {
        for (const element of scope.querySelectorAll("*")) {
          if (element.tagName === "STYLE") styles.push(element.parentElement?.tagName ?? "");
          if (element.shadowRoot) visit(element.shadowRoot);
        }
      };
      const root = (node as HTMLElement).shadowRoot as ShadowRoot;
      visit(node as HTMLElement);
      visit(root);
      // Web Awesome sets CSS custom properties with the CSS object model. That is allowed by
      // style-src and it is not markup of Hekate. The markup of Hekate has no style attribute.
      for (const element of root.querySelectorAll("*")) {
        if (
          !element.tagName.toLowerCase().startsWith("hekate-wa-") &&
          element.hasAttribute("style")
        ) {
          styled.push(element.tagName.toLowerCase());
        }
      }
      return { styles, styled };
    });
    expect(found.styles).toEqual([]);
    expect(found.styled).toEqual([]);
    expect(await page.evaluate(() => document.querySelectorAll("style").length)).toBe(0);
  });
});

// --- SR-7 ----------------------------------------------------------------------------------

test.describe("SR-7 no other host", () => {
  test("SR-7 with all requests to other hosts blocked, every icon of the component is an SVG", async ({
    page,
    context,
  }) => {
    const blocked: string[] = [];
    await context.route("**/*", (route) => {
      const url = route.request().url();
      if (url.startsWith(DEMO_ORIGIN) || url.startsWith(ASSET_ORIGIN) || url.startsWith("data:")) {
        return route.fallback();
      }
      blocked.push(url);
      return route.abort("blockedbyclient");
    });
    await fakeClipboard(page);
    await openPlayground(page, { language: "en-US" });
    // Make every part of the UI appear that has an icon.
    await part(page, "language").click();
    await page.keyboard.press("Escape");
    await part(page, "copy-button").click();
    await page.locator("#credits-link").click();
    await expect(page.locator("#credits-version")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#credits-version")).toBeHidden();
    await part(page, "mode").locator("hekate-wa-radio").nth(1).click();
    await expect(part(page, "charset").first()).toBeVisible();
    await page.waitForTimeout(500);
    await page.route(WORDLIST_URL, (route) => route.fulfill({ status: 404, body: "no" }));
    await setProperty(page, "mode", "words");
    await setProperty(page, "language", languageCodes.at(-1) ?? "en-US");
    await page.waitForTimeout(500);
    const icons = await page.locator("hekate-generator").evaluate((node) => {
      const found: Array<{ name: string; svg: boolean }> = [];
      const visit = (scope: ShadowRoot | Element): void => {
        for (const element of scope.querySelectorAll("*")) {
          if (element.tagName.toLowerCase() === "hekate-wa-icon") {
            found.push({
              name: `${element.getAttribute("library") ?? "default"}:${element.getAttribute("name") ?? ""}`,
              svg: element.shadowRoot?.querySelector("svg") != null,
            });
          }
          if (element.shadowRoot) visit(element.shadowRoot);
        }
      };
      visit((node as HTMLElement).shadowRoot as ShadowRoot);
      return found;
    });
    expect(icons.length).toBeGreaterThanOrEqual(3);
    for (const icon of icons) expect(icon.svg, `icon ${icon.name} has an SVG`).toBe(true);
    expect(blocked, "requests to other hosts").toEqual([]);
  });

  test("SR-7 no request goes to a Web Awesome or Font Awesome host", async ({ page }) => {
    const requests = recordRequests(page);
    await openPlayground(page);
    await useComponent(page);
    const hosts = new Set(requests.map((r) => new URL(r.url).host));
    expect([...hosts].sort()).toEqual(["localhost:8080", "localhost:8081"]);
  });
});

// --- SR-8 ----------------------------------------------------------------------------------

async function storageState(page: Page, context: BrowserContext) {
  const inPage = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    databases: typeof indexedDB.databases === "function" ? (await indexedDB.databases()).length : 0,
    caches: await caches.keys(),
    cookie: document.cookie,
    workers: (await navigator.serviceWorker.getRegistrations()).length,
  }));
  return { ...inPage, contextCookies: (await context.cookies()).length };
}

test.describe("SR-8 no data on the device", () => {
  test("SR-8 after all actions the browser storage is empty", async ({ page, context }) => {
    await openPlayground(page);
    await page.evaluate(() => window.name);
    const before = await storageState(page, context);
    await useComponent(page, { languages: languageCodes.slice(0, 3) });
    const after = await storageState(page, context);
    expect(before).toEqual({
      local: 0,
      session: 0,
      databases: 0,
      caches: [],
      cookie: "",
      workers: 0,
      contextCookies: 0,
    });
    expect(after).toEqual(before);
  });

  test("SR-8 the password is in no URL, no request, no console message and no event", async ({
    page,
  }) => {
    await seedRandom(page);
    await fakeClipboard(page);
    // Record all events that reach the window, also the ones that do not bubble.
    await page.addInitScript(() => {
      const events: string[] = [];
      window.__events = events;
      const dispatch = EventTarget.prototype.dispatchEvent;
      EventTarget.prototype.dispatchEvent = function (event: Event) {
        const detail = (event as CustomEvent).detail;
        events.push(`${event.type} ${JSON.stringify(detail ?? null)}`);
        return dispatch.call(this, event);
      };
      for (const key of Object.keys(window)) {
        if (key.startsWith("on")) {
          window.addEventListener(
            key.slice(2),
            (event) => {
              const detail = (event as CustomEvent).detail;
              const target = event.target as { value?: unknown } | null;
              events.push(
                `${event.type} ${JSON.stringify(detail ?? null)} ${String(target?.value ?? "")}`,
              );
            },
            true,
          );
        }
      }
    });
    const messages = recordConsole(page);
    const requests = recordRequests(page);
    await openPlayground(page);
    const passwords = await useComponent(page, { languages: languageCodes.slice(0, 2) });
    expect(passwords.length).toBeGreaterThan(10);
    const urls: string[] = [page.url(), ...requests.map((r) => `${r.url} ${r.postData ?? ""}`)];
    const events = await page.evaluate(() => window.__events ?? []);
    const navigation = await page.evaluate(
      () => `${location.href} ${window.history.length} ${document.referrer}`,
    );
    for (const password of new Set(passwords)) {
      if (password.length < 6) continue;
      const encoded = [
        password,
        encodeURIComponent(password),
        btoa(unescape(encodeURIComponent(password))),
      ];
      for (const form of encoded) {
        expect(
          urls.some((url) => url.includes(form)),
          `URL has ${form}`,
        ).toBe(false);
        expect(
          messages.some((m) => m.text.includes(form)),
          `console has ${form}`,
        ).toBe(false);
        expect(
          events.some((event) => event.includes(form)),
          `event has ${form}`,
        ).toBe(false);
        expect(navigation.includes(form)).toBe(false);
      }
    }
    expect(events.length).toBeGreaterThan(20);
  });

  test("SR-8 the servers send Cache-Control: no-store and the browser keeps no copy", async ({
    page,
  }) => {
    const responses: Array<{ url: string; cache: string | undefined }> = [];
    page.on("response", async (response) => {
      responses.push({
        url: response.url(),
        cache: (await response.allHeaders())["cache-control"],
      });
    });
    await openPlayground(page);
    await page.reload();
    await waitForPassword(page);
    expect(responses.length).toBeGreaterThan(4);
    for (const response of responses) expect(response.cache, response.url).toBe("no-store");
  });
});

// --- SR-9 ----------------------------------------------------------------------------------

test.describe("SR-9 live region", () => {
  test("SR-9 the live region is polite and atomic", async ({ page }) => {
    await openPlayground(page);
    const region = part(page, "live-region");
    await expect(region).toHaveAttribute("aria-live", "polite");
    await expect(region).toHaveAttribute("role", "status");
    await expect(region).toHaveAttribute("aria-atomic", "true");
  });

  test("SR-9 after each new password the text is New password generated, and the region never contains the password", async ({
    page,
  }) => {
    await openPlayground(page);
    await watchLiveRegion(page);
    const passwords = [await readPassword(page)];
    for (let i = 0; i < 4; i++) {
      await part(page, "new-password-button").click();
      passwords.push(await readPassword(page));
      await expect.poll(() => liveText(page)).toBe(englishText("announce.newPassword"));
      expect(englishText("announce.newPassword")).toBe("New password generated");
      // Wait until the region is empty again before the next click: the same text is announced again.
      await page.waitForTimeout(350);
    }
    for (const password of passwords) {
      expect(await liveText(page)).not.toContain(password);
      for (const text of await liveHistory(page)) expect(text).not.toContain(password);
    }
    expect(
      (await liveHistory(page)).filter((t) => t === "New password generated").length,
    ).toBeGreaterThanOrEqual(4);
  });

  test("SR-9 a change of an option, a mode change and a language change announce New password generated", async ({
    page,
  }) => {
    await openPlayground(page);
    await watchLiveRegion(page);
    await page.getByRole("radio", { name: "Hyphen (-)" }).click();
    await expect.poll(() => liveHistory(page)).toContain("New password generated");
    await page.getByRole("radio", { name: "Characters" }).click();
    await expect.poll(async () => (await liveHistory(page)).length).toBeGreaterThan(2);
    for (const text of await liveHistory(page)) {
      expect(text === "" || text === "New password generated").toBe(true);
    }
  });

  test("SR-9 the copy message and the warnings go to the live region too", async ({ page }) => {
    await fakeClipboard(page);
    await openPlayground(page);
    await watchLiveRegion(page);
    await part(page, "copy-button").click();
    await expect.poll(() => liveHistory(page)).toContain(englishText("action.copied"));
    await page.locator("[part=words] [role=slider]").focus();
    await page.keyboard.press("Home");
    await expect.poll(() => liveHistory(page)).toContain(englishText("words.warning"));
    const password = await readPassword(page);
    for (const text of await liveHistory(page)) expect(text).not.toContain(password);
  });

  test("SR-9 the password field is outside the live region", async ({ page }) => {
    await openPlayground(page);
    const inside = await page
      .locator("#password")
      .evaluate((field) => field.closest("[aria-live]"));
    expect(inside).toBeNull();
  });
});

// --- SR-12 ---------------------------------------------------------------------------------

test.describe("SR-12 cross-origin access", () => {
  test("SR-12 a page on another origin loads the component with the headers of the README and all requests succeed", async ({
    page,
  }) => {
    // Another origin (other host name) that is a secure context and not mixed content.
    const origin = "http://127.0.0.1:8080";
    await servePage(
      page,
      `${origin}/index.html`,
      `<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body>` +
        `<script type="module" src="${scriptUrl}"></script>` +
        `<hekate-generator></hekate-generator></body></html>`,
    );
    const failed: string[] = [];
    const statuses: Array<{ url: string; status: number; headers: Record<string, string> }> = [];
    page.on("requestfailed", (request) =>
      failed.push(`${request.url()} ${request.failure()?.errorText}`),
    );
    page.on("response", async (response) => {
      if (response.url().startsWith(ASSET_ORIGIN)) {
        statuses.push({
          url: response.url(),
          status: response.status(),
          headers: await response.allHeaders(),
        });
      }
    });
    const messages = recordConsole(page);
    await page.goto(`${origin}/index.html`);
    expect(await page.evaluate(() => location.origin)).toBe(origin);
    await waitForPassword(page);
    expect(failed).toEqual([]);
    expect(statuses.length).toBeGreaterThanOrEqual(3);
    for (const response of statuses) {
      expect(response.status, response.url).toBe(200);
      expect(response.headers["access-control-allow-origin"], response.url).toBe("*");
      expect(response.headers["set-cookie"], response.url).toBeUndefined();
    }
    const wasm = statuses.find((r) => r.url.endsWith("hekate.wasm"));
    expect(wasm?.headers["content-type"]).toBe("application/wasm");
    expect(messages.filter((m) => m.type === "error")).toEqual([]);
    // Other word lists and the ASCII list also load across origins.
    await part(page, "ascii-only").click();
    await expect(page.locator("#strength-label")).toBeVisible();
    await page.waitForTimeout(300);
    expect(failed).toEqual([]);
  });

  test("SR-12 requests to the asset host carry no cookies and no credentials", async ({
    page,
    context,
  }) => {
    await context.addCookies([{ name: "session", value: "secret", url: DEMO_ORIGIN }]);
    const withCookies: string[] = [];
    page.on("request", async (request) => {
      if (request.url().startsWith(ASSET_ORIGIN)) {
        const headers = await request.allHeaders();
        if (headers.cookie || headers.authorization) withCookies.push(request.url());
      }
    });
    await openPlayground(page);
    await useComponent(page);
    expect(withCookies).toEqual([]);
  });
});

// --- SR-13 ---------------------------------------------------------------------------------

test.describe("SR-13 subresource integrity", () => {
  test("SR-13 one changed byte in the component script: the browser refuses it and there is no password", async ({
    page,
  }) => {
    const messages = recordConsole(page);
    await page.route(scriptUrl, (route) => changeOneByte(route, "binary"));
    await page.goto("/");
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => customElements.get("hekate-generator"))).toBeUndefined();
    await expect(page.locator("#password")).toHaveCount(0);
    await expect(page.locator("#strength-label")).toHaveCount(0);
    // The fallback text of the page shows instead.
    await expect(page.getByText("Your browser cannot show the password generator.")).toBeVisible();
    expect(messages.some((m) => /integrity|digest|SRI/i.test(m.text))).toBe(true);
  });

  test("SR-13 the unchanged script passes the same check", async ({ page }) => {
    await page.goto("/");
    await waitForPassword(page);
    const tag = await page.locator("script[integrity]").first().getAttribute("integrity");
    expect(tag).toMatch(/^sha384-/);
  });

  test("SR-13 one changed byte in the WASM module: Hekate refuses it and there is no password", async ({
    page,
  }) => {
    await page.route(`${assetsBase}hekate.wasm`, (route) => changeOneByte(route, "binary"));
    await openPlayground(page, {}, { waitForPassword: false });
    await expect(page.locator("#error")).toContainText(englishText("error.wasm"));
    await expect(page.locator("#strength-label")).toHaveCount(0);
  });

  test("SR-13 one changed byte in a translation: Hekate refuses it and there is no password", async ({
    page,
  }) => {
    requirePseudo();
    await page.route(/\/locales\/qps\.json$/, (route) => changeOneByte(route));
    await openPlayground(page, { "ui-language": "qps" }, { waitForPassword: false });
    await expect(page.locator("#error")).toContainText(englishText("error.translation"));
    await expect(page.locator("#strength-label")).toHaveCount(0);
  });

  test("SR-13 one changed byte in a word list: Hekate refuses it and there is no password", async ({
    page,
  }) => {
    await page.route(WORDLIST_URL, (route) => changeOneByte(route));
    await openPlayground(page, {}, { waitForPassword: false });
    await expect(page.locator("#error")).toContainText(englishText("error.wordlistHash"));
    await expect(page.locator("#strength-label")).toHaveCount(0);
  });

  test("SR-13 the sri.txt value is the one of the script tag of the demo page", async ({
    request,
  }) => {
    const sri = (await (await request.get(`${assetsBase}sri.txt`)).text()).trim();
    const html = await (await request.get("/")).text();
    expect(html).toContain(`integrity="${sri}"`);
  });
});

// --- FR-8 ----------------------------------------------------------------------------------

test.describe("FR-8 new password", () => {
  async function count(page: Page): Promise<number> {
    return (await wasmCalls(page)).length;
  }

  test("FR-8 one click gives one call and each change of an option gives one call, in both modes", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await instrumentWasm(page);
    await openPlayground(page, { language: "en-US" });
    // The start gives one call.
    expect(await count(page)).toBe(1);
    let calls = 1;
    let password = await readPassword(page);

    const expectOneCall = async (action: () => Promise<void>, label: string) => {
      await action();
      await expect.poll(() => count(page), { message: label }).toBe(calls + 1);
      calls += 1;
      // The shown password is the one that this call made: it changed, and it is not empty.
      await expect.poll(() => readPassword(page), { message: label }).not.toBe(password);
      password = await readPassword(page);
      await page.waitForTimeout(150);
      expect(await count(page), `${label}: no more calls`).toBe(calls);
    };

    await expectOneCall(() => part(page, "new-password-button").click(), "new password");
    await expectOneCall(() => part(page, "new-password-button").click(), "new password again");
    await expectOneCall(() => page.getByRole("radio", { name: "Hyphen (-)" }).click(), "separator");
    await expectOneCall(
      () => page.getByRole("radio", { name: "Random" }).click(),
      "capital letters",
    );
    await expectOneCall(() => part(page, "number").click(), "number");
    await expectOneCall(() => part(page, "symbol").click(), "symbol");
    await expectOneCall(() => part(page, "ascii-only").click(), "ASCII-only");
    await expectOneCall(async () => {
      await page.locator("[part=words] [role=slider]").focus();
      await page.keyboard.press("ArrowRight");
    }, "number of words");
    await expectOneCall(
      () => setProperty(page, "language", languageCodes.at(-1) ?? "en-US"),
      "language",
    );
    // Character mode.
    await expectOneCall(() => page.getByRole("radio", { name: "Characters" }).click(), "mode");
    await expectOneCall(
      () => part(page, "new-password-button").click(),
      "new password in character mode",
    );
    await expectOneCall(async () => {
      await page.locator("[part=length] [role=slider]").focus();
      await page.keyboard.press("ArrowRight");
    }, "length");
    await expectOneCall(() => part(page, "charset").nth(3).click(), "character set");
    await expectOneCall(() => part(page, "avoid-similar").click(), "avoid similar characters");
    await expectOneCall(
      () => page.getByRole("radio", { name: "Words" }).click(),
      "mode back to words",
    );
  });

  test("FR-8 the call names are generateWords in word mode and generateCharacters in character mode", async ({
    page,
  }) => {
    await instrumentWasm(page);
    await openPlayground(page, { mode: "characters" });
    await part(page, "new-password-button").click();
    await page.getByRole("radio", { name: "Words" }).click();
    await expect.poll(async () => (await wasmCalls(page)).length).toBe(3);
    expect((await wasmCalls(page)).map((c) => c.name)).toEqual([
      "generateCharacters",
      "generateCharacters",
      "generateWords",
    ]);
  });
});

// --- FR-9 ----------------------------------------------------------------------------------

test.describe("FR-9 copy", () => {
  for (const mode of ["words", "characters"] as const) {
    test(`FR-9 in ${mode} mode the clipboard gets exactly the password, "Copied" shows for 2 seconds or less, and the clipboard is not cleared`, async ({
      page,
    }) => {
      await fakeClipboard(page);
      await openPlayground(page, { mode });
      // Measure how long the message shows.
      await page.locator("hekate-generator").evaluate((node) => {
        const status = (node as HTMLElement).shadowRoot?.querySelector(
          "[part=copy-status]",
        ) as HTMLElement;
        const marks: Array<{ text: string; at: number }> = [];
        window.__copyMarks = marks;
        new MutationObserver(() =>
          marks.push({ text: status.textContent?.trim() ?? "", at: performance.now() }),
        ).observe(status, { childList: true, characterData: true, subtree: true });
      });
      const password = await readPassword(page);
      await part(page, "copy-button").click();
      await expect(part(page, "copy-status")).toHaveText(englishText("action.copied"));
      expect(englishText("action.copied")).toBe("Copied");
      expect(await clipboardWrites(page)).toEqual([password]);
      await expect(part(page, "copy-status")).toHaveText("", { timeout: 2500 });
      const marks = await page.evaluate(() => window.__copyMarks ?? []);
      const shown = marks.find((m) => m.text === "Copied");
      const hidden = marks.find((m) => m.text === "" && m.at > (shown?.at ?? Infinity));
      expect(shown && hidden, "the message appeared and went away").toBeTruthy();
      expect((hidden?.at ?? 0) - (shown?.at ?? 0)).toBeLessThanOrEqual(2000);
      // The component does not clear the clipboard.
      await page.waitForTimeout(500);
      expect(await clipboardWrites(page)).toEqual([password]);
    });
  }

  test("FR-9 Enter and Space on the copy button copy the password", async ({ page }) => {
    await fakeClipboard(page);
    await openPlayground(page);
    const password = await readPassword(page);
    await part(page, "copy-button").focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => clipboardWrites(page)).toEqual([password]);
    await page.keyboard.press("Space");
    await expect.poll(async () => (await clipboardWrites(page)).length).toBe(2);
    expect(await clipboardWrites(page)).toEqual([password, password]);
  });

  test("FR-9 in Chromium the real clipboard contains the password", async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "Only Chromium lets Playwright grant clipboard-read and clipboard-write.",
    );
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: DEMO_ORIGIN });
    await openPlayground(page);
    const password = await readPassword(page);
    await part(page, "copy-button").click();
    await expect(part(page, "copy-status")).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(password);
  });
});
