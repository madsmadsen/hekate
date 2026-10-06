// Helpers to open pages with the component and to read its state.
// Playwright CSS selectors pierce open shadow roots, so `#password` finds the field.
import { expect, type Locator, type Page } from "@playwright/test";

/** The public properties of the element that the tests read. */
export interface HekateElement extends HTMLElement {
  updateComplete: Promise<boolean>;
  mode: string;
  language: string | undefined;
  words: number;
  separator: string;
  capitalization: string;
  number: boolean;
  symbol: boolean;
  asciiOnly: boolean;
  length: number;
  charsets: string[];
  avoidSimilar: boolean;
  uiLanguage: string | undefined;
  theme: string;
  assetsUrl: string | undefined;
}

/** The state that is ready when the first password is on the screen. */
export async function waitForPassword(page: Page, index = 0): Promise<void> {
  await expect(page.locator("hekate-generator").nth(index).locator("#strength-label")).toBeVisible({
    timeout: 20_000,
  });
}

/** Opens playground.html of the demo. The query string becomes attributes of the component. */
export async function openPlayground(
  page: Page,
  attributes: Record<string, string> = {},
  options: { waitForPassword?: boolean } = {},
): Promise<void> {
  const query = new URLSearchParams(attributes).toString();
  await page.goto(`/playground.html${query ? `?${query}` : ""}`);
  if (options.waitForPassword !== false) await waitForPassword(page);
}

/** The text of the password field, exactly. */
export async function readPassword(page: Page, index = 0): Promise<string> {
  return page
    .locator("hekate-generator")
    .nth(index)
    .locator("#password")
    .evaluate((element) => element.textContent ?? "");
}

/** A locator for a part of the component, for example `part("language")`. */
export function part(page: Page, name: string, index = 0): Locator {
  return page.locator("hekate-generator").nth(index).locator(`[part="${name}"]`);
}

/** The element that has the focus inside the shadow root of the component. */
export async function focusedId(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const host = document.querySelector("hekate-generator");
    return host?.shadowRoot?.activeElement?.id ?? null;
  });
}

/** Read properties of the first component. */
export async function readState(page: Page): Promise<{
  mode: string;
  language: string | undefined;
  words: number;
  separator: string;
  capitalization: string;
  number: boolean;
  symbol: boolean;
  asciiOnly: boolean;
  length: number;
  charsets: string[];
  avoidSimilar: boolean;
  theme: string;
}> {
  return page
    .locator("hekate-generator")
    .first()
    .evaluate((node) => {
      const element = node as HekateElement;
      return {
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
      };
    });
}

/** The value of the language list of the first component, for example `sv`. */
export async function selectedLanguage(page: Page): Promise<string> {
  return part(page, "language").evaluate((element) => String((element as HTMLInputElement).value));
}

/** Clicks "New password" many times inside the page and returns each password. It is fast. */
export async function generateMany(page: Page, count: number): Promise<string[]> {
  return page
    .locator("hekate-generator")
    .first()
    .evaluate(async (node, total) => {
      const element = node as HekateElement;
      const root = element.shadowRoot as ShadowRoot;
      const button = root.querySelector("[part=new-password-button]") as HTMLElement;
      const field = root.querySelector("#password") as HTMLElement;
      const out: string[] = [];
      for (let i = 0; i < total; i++) {
        button.click();
        await element.updateComplete;
        out.push(field.textContent ?? "");
      }
      return out;
    }, count);
}

/** Like generateMany, but returns the text of each word (word mode, separator `space`). */
export async function generateManyWords(page: Page, count: number): Promise<string[][]> {
  return page
    .locator("hekate-generator")
    .first()
    .evaluate(async (node, total) => {
      const element = node as HekateElement;
      const root = element.shadowRoot as ShadowRoot;
      const button = root.querySelector("[part=new-password-button]") as HTMLElement;
      const field = root.querySelector("#password") as HTMLElement;
      const out: string[][] = [];
      for (let i = 0; i < total; i++) {
        button.click();
        await element.updateComplete;
        out.push(
          Array.from(field.querySelectorAll("[part=token-word]")).map((e) => e.textContent ?? ""),
        );
      }
      return out;
    }, count);
}

/** Set an option of the first component the way a user does: the property, then wait for the render. */
export async function setProperty(page: Page, name: string, value: unknown): Promise<void> {
  await page
    .locator("hekate-generator")
    .first()
    .evaluate(
      async (node, [key, next]) => {
        const element = node as unknown as Record<string, unknown> & HekateElement;
        element[key as string] = next;
        await element.updateComplete;
      },
      [name, value] as const,
    );
}

/** Reads all text that the live region of SR-9 shows over time. Call it before the action. */
export async function watchLiveRegion(page: Page, index = 0): Promise<void> {
  await page
    .locator("hekate-generator")
    .nth(index)
    .evaluate((node) => {
      const root = (node as HTMLElement).shadowRoot as ShadowRoot;
      const region = root.querySelector("[part=live-region]") as HTMLElement;
      const seen: string[] = [];
      window.__live = seen;
      const observer = new MutationObserver(() => {
        const text = (region.textContent ?? "").trim();
        const last = seen.at(-1);
        if (text !== "" && text !== last) seen.push(text);
        else if (text === "" && last !== "") seen.push("");
      });
      observer.observe(region, { childList: true, characterData: true, subtree: true });
    });
}

export async function liveHistory(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__live ?? []);
}

/** The current text of the live region. */
export async function liveText(page: Page, index = 0): Promise<string> {
  return page
    .locator("hekate-generator")
    .nth(index)
    .locator("[part=live-region]")
    .evaluate((element) => (element.textContent ?? "").trim());
}
