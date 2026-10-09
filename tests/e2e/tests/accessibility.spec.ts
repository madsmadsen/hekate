// Accessibility and browsers: NFR-3, NFR-4. The keyboard actions are the ones of PRD section 8.4.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  WORDLIST_URL,
  failWithStatus,
  fakeClipboard,
  instrumentWasm,
  removeClipboard,
  servePage,
  wasmCalls,
} from "../support/browser.ts";
import {
  focusedId,
  openPlayground,
  part,
  readPassword,
  readState,
  selectedLanguage,
  selectedText,
  waitForPassword,
} from "../support/component.ts";
import { clipboardWrites } from "../support/browser.ts";
import { DEMO_ORIGIN, languageCodes } from "../support/env.ts";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

async function axeViolations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page })
    .include("hekate-generator")
    .withTags(WCAG)
    .analyze();
  // axe must have looked at the component: it checks the rules of the controls in the shadow roots.
  expect(result.passes.length, "axe checked the component").toBeGreaterThan(10);
  return result.violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n  ` +
      violation.nodes
        .slice(0, 3)
        .map((node) => node.html.slice(0, 120))
        .join("\n  "),
  );
}

test.describe("NFR-3 axe", () => {
  for (const theme of ["light", "dark"]) {
    test(`NFR-3 axe reports no violation in word mode, ${theme} theme`, async ({ page }) => {
      await openPlayground(page, { theme, number: "true", symbol: "true" });
      expect(await axeViolations(page)).toEqual([]);
    });

    test(`NFR-3 axe reports no violation in character mode, ${theme} theme`, async ({ page }) => {
      await openPlayground(page, { theme, mode: "characters", length: "8" });
      expect(await axeViolations(page)).toEqual([]);
    });
  }

  test("NFR-3 axe reports no violation with the strength popover open", async ({ page }) => {
    await fakeClipboard(page);
    await openPlayground(page);
    await part(page, "copy-button").click();
    await expect(part(page, "copy-status")).toHaveText("Copied");
    await page.locator("#strength-info").click();
    await expect(page.locator("#strength-details-title")).toBeVisible();
    // The popover fades in. axe reads the colours, so wait until the animation has ended.
    await expect.poll(() => axeViolations(page), { timeout: 5000 }).toEqual([]);
  });

  test("NFR-3 axe reports no violation with the error callout", async ({ page }) => {
    await page.route(WORDLIST_URL, (route) => failWithStatus(route, 404));
    await openPlayground(page, {}, { waitForPassword: false });
    await expect(page.locator("#error")).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);
  });

  test("NFR-3 axe reports no violation with the Credits dialog open", async ({ page }) => {
    await openPlayground(page);
    await page.locator("#credits-link").click();
    await expect(page.locator("#credits-version")).toBeVisible();
    // The dialog fades in. axe reads the colours, so wait until the animation has ended.
    await expect.poll(() => axeViolations(page), { timeout: 5000 }).toEqual([]);
  });
});

test.describe("NFR-3 labels of PRD 8.4", () => {
  test("NFR-3 each control of word mode has the label of section 8.4", async ({ page }) => {
    await openPlayground(page);
    await expect(page.getByRole("textbox", { name: "Password", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "New password", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy password", exact: true })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Password type" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Word language" })).toBeVisible();
    await expect(page.getByRole("slider", { name: "Number of words" })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Separator" })).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Capital letters" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "a-b, Hyphen (-)" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Abc abc, Random" })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Add a number" })).toBeVisible();
    await expect(page.getByRole("switch", { name: "Add a symbol" })).toBeVisible();
    await expect(
      page.getByRole("switch", { name: "Basic English letters only (ASCII)" }),
    ).toBeVisible();
    await expect(
      page.getByRole("switch", { name: /No same character twice in a row/ }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Credits", exact: true })).toBeVisible();
  });

  test("NFR-3 each control of character mode has the label of section 8.4", async ({ page }) => {
    await openPlayground(page, { mode: "characters" });
    await expect(page.getByRole("slider", { name: "Length" })).toBeVisible();
    for (const name of [/Lowercase letters/, /Capital letters \(A/, /Digits/, /Symbols/]) {
      await expect(page.getByRole("checkbox", { name })).toBeVisible();
    }
    await expect(page.getByRole("switch", { name: /Avoid similar characters/ })).toBeVisible();
    await expect(
      page.getByRole("switch", { name: /No same character twice in a row/ }),
    ).toBeVisible();
    const charsets = page.getByRole("group", { name: "Character sets" });
    await expect(charsets).toBeVisible();
    await expect(charsets).toHaveAttribute("aria-labelledby", "charsets-label");
    await expect(charsets).not.toHaveAttribute("aria-label", /.*/);
    await expect(page.locator("#charsets-label")).toHaveText("Character sets");
  });
});

async function deepFocus(page: Page): Promise<{ role: string; label: string }> {
  return page.evaluate(() => {
    let element: Element | null = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    if (!element) return { role: "", label: "" };
    const host =
      element.getRootNode() instanceof ShadowRoot
        ? (element.getRootNode() as ShadowRoot).host
        : null;
    const own = element.getAttribute("role") ?? element.tagName.toLowerCase();
    const label = element.getAttribute("aria-label") ?? (element.id ? element.id : "") ?? "";
    const text = (
      host?.getAttribute("label") ??
      host?.textContent ??
      element.textContent ??
      ""
    ).trim();
    return { role: own, label: `${label} ${text}`.trim().slice(0, 60) };
  });
}

test.describe("NFR-3 keyboard actions of PRD 8.4", () => {
  test("NFR-3 Tab reaches every control of word mode", async ({ page }) => {
    await openPlayground(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    const seen: Array<{ role: string; label: string }> = [];
    for (let i = 0; i < 15; i++) {
      await page.keyboard.press("Tab");
      seen.push(await deepFocus(page));
    }
    // The order of the page: field, 2 buttons, the strength info button, the Close button of the
    // strength panel (the keyboard focus on the info button opens it), mode, language, number of
    // words, separator, capital letters, 4 switches and the Credits link. A radio group has one
    // stop: its checked radio. The words slider has one stop.
    expect(seen.map((s) => s.role)).toEqual([
      "textbox",
      "button",
      "button",
      "button",
      "button",
      "radio",
      "combobox",
      "slider",
      "radio",
      "radio",
      "switch",
      "switch",
      "switch",
      "switch",
      "button",
    ]);
    expect(seen[1]?.label).toContain("New password");
    expect(seen[2]?.label).toContain("Copy");
    expect(seen[3]?.label).toContain("About password strength");
    expect(seen[14]?.label).toContain("credits-link");
  });

  /** Moves the focus to the info button with the Tab key, so that the focus ring shows. */
  async function tabToInfo(page: Page): Promise<void> {
    await part(page, "copy-button").focus();
    await page.keyboard.press("Tab");
    await expect.poll(() => focusedId(page)).toBe("strength-info");
  }

  test("NFR-3 strength info: the keyboard focus opens the panel, the focus stays on the button", async ({
    page,
  }) => {
    await openPlayground(page);
    const info = page.locator("#strength-info");
    await expect(info).toHaveAttribute("aria-expanded", "false");
    await tabToInfo(page);
    await expect(info).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#strength-details-title")).toBeVisible();
    expect(await focusedId(page)).toBe("strength-info");
    // Tab goes to Close. Tab out of the panel closes it.
    await page.keyboard.press("Tab");
    await expect.poll(() => focusedId(page)).toBe("strength-details-close");
    await expect(info).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Tab");
    await expect(info).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#strength-details-title")).toBeHidden();
  });

  test("NFR-3 strength info: Enter or Space pins the panel and focuses the heading; Escape and Close close it and focus the button", async ({
    page,
  }) => {
    await openPlayground(page);
    const info = page.locator("#strength-info");
    const heading = page.locator("#strength-details-title");
    for (const key of ["Enter", "Space"]) {
      await tabToInfo(page);
      await page.keyboard.press(key);
      await expect(info).toHaveAttribute("aria-expanded", "true");
      await expect(heading).toBeVisible();
      await expect.poll(() => focusedId(page)).toBe("strength-details-title");
      await page.keyboard.press("Escape");
      await expect(info).toHaveAttribute("aria-expanded", "false");
      await expect(heading).toBeHidden();
      await expect.poll(() => focusedId(page)).toBe("strength-info");
      // The focus is still on the button, and the panel does not open again.
      await page.waitForTimeout(400);
      await expect(info).toHaveAttribute("aria-expanded", "false");
    }
    await tabToInfo(page);
    await page.keyboard.press("Enter");
    await expect.poll(() => focusedId(page)).toBe("strength-details-title");
    await page.locator("#strength-details-close").click();
    await expect(info).toHaveAttribute("aria-expanded", "false");
    await expect(heading).toBeHidden();
    await expect.poll(() => focusedId(page)).toBe("strength-info");
  });

  test("NFR-3 strength info: a click opens and pins the panel, a second click closes it", async ({
    page,
  }) => {
    await openPlayground(page);
    const info = page.locator("#strength-info");
    const heading = page.locator("#strength-details-title");
    await info.click();
    await expect(info).toHaveAttribute("aria-expanded", "true");
    await expect.poll(() => focusedId(page)).toBe("strength-details-title");
    // A pinned panel stays open when the pointer leaves.
    await page.mouse.move(2, 2);
    await page.waitForTimeout(500);
    await expect(info).toHaveAttribute("aria-expanded", "true");
    await info.click();
    await expect(info).toHaveAttribute("aria-expanded", "false");
    await expect(heading).toBeHidden();
    await expect.poll(() => focusedId(page)).toBe("strength-info");
  });

  test("NFR-3 strength info: the pointer opens the panel without moving the focus, and closes it when it leaves", async ({
    page,
  }) => {
    await openPlayground(page);
    const info = page.locator("#strength-info");
    await part(page, "copy-button").focus();
    const before = await focusedId(page);
    expect(before).not.toBeNull();
    await info.hover();
    await expect.poll(() => info.getAttribute("aria-expanded")).toBe("true");
    await expect(page.locator("#strength-details-title")).toBeVisible();
    expect(await focusedId(page)).toBe(before);
    // Escape closes it, and it stays closed while the pointer stays.
    await page.keyboard.press("Escape");
    await expect(info).toHaveAttribute("aria-expanded", "false");
    await page.waitForTimeout(500);
    await expect(info).toHaveAttribute("aria-expanded", "false");
    // The pointer leaves. Then it can open the panel again.
    await page.mouse.move(2, 2);
    await page.waitForTimeout(400);
    await info.hover();
    await expect.poll(() => info.getAttribute("aria-expanded")).toBe("true");
    await page.mouse.move(2, 2);
    await expect.poll(() => info.getAttribute("aria-expanded")).toBe("false");
    expect(await focusedId(page)).toBe(before);
  });

  test("NFR-3 password field: Tab moves the focus to the field and the user can select the text", async ({
    page,
  }) => {
    await openPlayground(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("Tab");
    expect(await focusedId(page)).toBe("password");
    const password = await readPassword(page);
    await page.locator("#password").click({ clickCount: 3 });
    expect(await selectedText(page)).toBe(password);
  });

  test("NFR-3 new password button: Enter or Space makes a new password", async ({ page }) => {
    await instrumentWasm(page);
    await openPlayground(page);
    const button = part(page, "new-password-button");
    await button.focus();
    const before = (await wasmCalls(page)).length;
    await page.keyboard.press("Enter");
    // Each click makes new words and builds the password: 2 calls.
    await expect.poll(async () => (await wasmCalls(page)).length).toBe(before + 2);
    await page.keyboard.press("Space");
    await expect.poll(async () => (await wasmCalls(page)).length).toBe(before + 4);
  });

  test("NFR-3 copy button: Enter or Space copies the password", async ({ page }) => {
    await fakeClipboard(page);
    await openPlayground(page);
    const password = await readPassword(page);
    await part(page, "copy-button").focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => clipboardWrites(page)).toEqual([password]);
    await page.keyboard.press("Space");
    await expect.poll(async () => (await clipboardWrites(page)).length).toBe(2);
  });

  test("NFR-3 mode: the arrow keys select Words or Characters", async ({ page }) => {
    await openPlayground(page);
    await page.getByRole("radio", { name: "Words" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await readState(page)).mode).toBe("characters");
    await expect(page.getByRole("radio", { name: "Characters" })).toBeChecked();
    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await readState(page)).mode).toBe("words");
  });

  test("NFR-3 language: Enter or Space opens the list, the arrow keys move and Enter selects", async ({
    page,
  }) => {
    test.skip(languageCodes.length < 3, "needs at least 3 word lists");
    await openPlayground(page, { language: languageCodes[0] ?? "en-US" });
    const select = page.getByRole("combobox", { name: "Word language" });
    const start = await selectedLanguage(page);
    for (const key of ["Enter", "Space"]) {
      await select.focus();
      await page.keyboard.press(key);
      await expect(part(page, "language")).toHaveJSProperty("open", true);
      await page.keyboard.press("Escape");
      await expect(part(page, "language")).toHaveJSProperty("open", false);
    }
    await select.focus();
    await page.keyboard.press("Enter");
    await expect(part(page, "language")).toHaveJSProperty("open", true);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect.poll(() => selectedLanguage(page)).not.toBe(start);
    await waitForPassword(page);
    expect((await readState(page)).language).toBe(await selectedLanguage(page));
  });

  test("NFR-3 number of words: Arrow keys, Home and End change the slider", async ({ page }) => {
    await openPlayground(page);
    const slider = page.getByRole("slider", { name: "Number of words" });
    await slider.focus();
    const words = async () => (await readState(page)).words;
    await page.keyboard.press("ArrowRight");
    await expect.poll(words).toBe(6);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect.poll(words).toBe(4);
    await page.keyboard.press("End");
    await expect.poll(words).toBe(10);
    await page.keyboard.press("Home");
    await expect.poll(words).toBe(3);
    await expect(part(page, "words-value")).toHaveText("3 words");
  });

  test("NFR-3 separator and capital letters: the arrow keys select a value", async ({ page }) => {
    await openPlayground(page);
    await page.getByRole("radio", { name: "ab, None" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await readState(page)).separator).toBe("-");
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await readState(page)).separator).toBe(".");
    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await readState(page)).separator).toBe("-");
    await page.getByRole("radio", { name: "Abc, Title case" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await readState(page)).capitalization).toBe("random");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect.poll(async () => (await readState(page)).capitalization).toBe("lower");
  });

  test("NFR-3 number, symbol, ASCII-only and no-repeat: Space turns the option on or off", async ({
    page,
  }) => {
    await openPlayground(page);
    for (const [name, key] of [
      ["Add a number", "number"],
      ["Add a symbol", "symbol"],
      ["Basic English letters only (ASCII)", "asciiOnly"],
      ["No same character twice in a row", "noRepeat"],
    ] as const) {
      await page.getByRole("switch", { name }).focus();
      await page.keyboard.press("Space");
      await expect.poll(async () => (await readState(page))[key]).toBe(true);
      await page.keyboard.press("Space");
      await expect.poll(async () => (await readState(page))[key]).toBe(false);
    }
  });

  test("NFR-3 length: arrow keys change the value by 1, Home selects 8 and End selects 64", async ({
    page,
  }) => {
    await openPlayground(page, { mode: "characters" });
    await page.locator("[part=length] [role=slider]").focus();
    const length = async () => (await readState(page)).length;
    await page.keyboard.press("ArrowRight");
    await expect.poll(length).toBe(21);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect.poll(length).toBe(19);
    await page.keyboard.press("Home");
    await expect.poll(length).toBe(8);
    await page.keyboard.press("End");
    await expect.poll(length).toBe(64);
  });

  test("NFR-3 character sets and avoid similar characters: Space turns the set or the option on or off", async ({
    page,
  }) => {
    await openPlayground(page, { mode: "characters" });
    const names = [/Lowercase letters/, /Capital letters \(A/, /Digits/];
    for (const [index, name] of names.entries()) {
      await page.getByRole("checkbox", { name }).focus();
      await page.keyboard.press("Space");
      await expect.poll(async () => (await readState(page)).charsets.length).toBe(3 - index);
    }
    await page.getByRole("checkbox", { name: names[0] as RegExp }).focus();
    await page.keyboard.press("Space");
    await expect.poll(async () => (await readState(page)).charsets.length).toBe(2);
    await page.getByRole("switch", { name: /Avoid similar characters/ }).focus();
    await page.keyboard.press("Space");
    await expect.poll(async () => (await readState(page)).avoidSimilar).toBe(true);
  });

  test("NFR-3 Credits link: Enter opens the dialog, Escape closes it and the focus goes back to the link", async ({
    page,
  }) => {
    await openPlayground(page);
    await page.locator("#credits-link").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#credits-version")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#credits-version")).toBeHidden();
    await expect.poll(() => focusedId(page)).toBe("credits-link");
  });

  test("NFR-3 the focus is visible on each control", async ({ page }) => {
    await openPlayground(page);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    let visible = 0;
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const outlined = await page.evaluate(() => {
        let element: Element | null = document.activeElement;
        while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
        if (!element) return false;
        const style = getComputedStyle(element);
        const outline = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0;
        const shadow = style.boxShadow !== "none";
        // A focus ring can be on the host of the control (Web Awesome) instead.
        const root = element.getRootNode();
        const host = root instanceof ShadowRoot ? getComputedStyle(root.host) : null;
        return outline || shadow || (host !== null && host.outlineStyle !== "none");
      });
      if (outlined) visible++;
    }
    expect(visible).toBeGreaterThanOrEqual(8);
  });
});

test.describe("NFR-4 browsers", () => {
  test("NFR-4 the browser has every feature that Hekate needs", async ({ page }, testInfo) => {
    await servePage(
      page,
      `${DEMO_ORIGIN}/__e2e/features.html`,
      `<!doctype html><html lang="en"><body><script type="module">window.__metaUrl = import.meta.url;</script></body></html>`,
    );
    await page.goto("/__e2e/features.html");
    const features = await page.evaluate(() => {
      return {
        webAssembly:
          typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function",
        webCrypto: typeof crypto?.getRandomValues === "function",
        customElements: typeof customElements?.define === "function",
        shadowDom: typeof HTMLElement.prototype.attachShadow === "function",
        containerQueries: CSS.supports("container-type: inline-size"),
        intl:
          typeof Intl.NumberFormat === "function" &&
          typeof Intl.PluralRules === "function" &&
          new Intl.NumberFormat("en", { style: "unit", unit: "year" }).format(1).includes("yr"),
        clipboard: typeof navigator.clipboard?.writeText === "function",
        part: CSS.supports("selector(::part(x))"),
        importMetaUrl: typeof window.__metaUrl === "string" && window.__metaUrl.startsWith("http"),
        adoptedStyleSheets:
          "adoptedStyleSheets" in Document.prototype && "replaceSync" in CSSStyleSheet.prototype,
        secureContext: window.isSecureContext,
      };
    });
    testInfo.annotations.push({ type: "browser", description: testInfo.project.name });
    expect(features).toEqual({
      webAssembly: true,
      webCrypto: true,
      customElements: true,
      shadowDom: true,
      containerQueries: true,
      intl: true,
      clipboard: true,
      part: true,
      importMetaUrl: true,
      adoptedStyleSheets: true,
      secureContext: true,
    });
  });

  test("NFR-4 the component shows the first password in this browser", async ({
    page,
    browserName,
  }) => {
    await openPlayground(page);
    expect(["chromium", "firefox", "webkit"]).toContain(browserName);
    expect(await readPassword(page)).toMatch(/\S/);
    await expect(page.locator("#strength-label")).toBeVisible();
  });

  test("NFR-4 without a Clipboard API the component still shows a password", async ({ page }) => {
    await removeClipboard(page);
    await openPlayground(page);
    await expect(page.locator("#strength-label")).toBeVisible();
  });
});
