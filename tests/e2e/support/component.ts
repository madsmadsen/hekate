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
  noRepeat: boolean;
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

/**
 * The text that the user has selected in the component. WebKit does not give text in a shadow
 * root from `toString()`, so the helper uses `getComposedRanges()` when `toString()` is empty.
 */
export async function selectedText(page: Page, index = 0): Promise<string> {
  return page
    .locator("hekate-generator")
    .nth(index)
    .evaluate((host) => {
      const selection = window.getSelection();
      if (!selection) return "";
      const direct = selection.toString();
      if (direct) return direct;
      const shadowRoots = [(host as HTMLElement).shadowRoot as ShadowRoot];
      return selection
        .getComposedRanges({ shadowRoots })
        .map((composed) => {
          const range = new Range();
          range.setStart(composed.startContainer, composed.startOffset);
          range.setEnd(composed.endContainer, composed.endOffset);
          return range.toString();
        })
        .join("");
    });
}

/** A locator for a part of the component, for example `part("language")`. */
export function part(page: Page, name: string, index = 0): Locator {
  return page.locator("hekate-generator").nth(index).locator(`[part="${name}"]`);
}

/** Chooses an option of the language select, the way a user does, and checks the value. */
export async function choose(
  page: Page,
  name: "language",
  value: string,
  index = 0,
): Promise<void> {
  const select = part(page, name, index);
  await select.click();
  await select.locator(`hekate-wa-option[value="${value}"]`).click();
  await expect(select).toHaveJSProperty("value", value);
}

/** The number of words (FR-3): one click on the track of the slider, where the number is. */
export async function chooseWords(page: Page, count: number, index = 0): Promise<void> {
  const slider = part(page, "words", index);
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.evaluate((element) => {
    const track = element.shadowRoot?.querySelector("[part~=track]") as HTMLElement;
    const rect = track.getBoundingClientRect();
    return { left: rect.left, width: rect.width, top: rect.top, height: rect.height };
  });
  const x = box.left + ((count - 3) / 7) * box.width;
  await page.mouse.click(x, box.top + box.height / 2);
  await expect(slider).toHaveJSProperty("value", count);
}

/** A radio button of the separator or capital letters group, by value. */
export function segment(
  page: Page,
  name: "separator" | "capitalization",
  value: string,
  index = 0,
): Locator {
  return part(page, name, index).locator(`hekate-wa-radio[value="${value}"]`);
}

/** Chooses a separator with one click: none, -, ., _ or space. */
export async function chooseSeparator(page: Page, value: string, index = 0): Promise<void> {
  await segment(page, "separator", value, index).click();
  await expect(part(page, "separator", index)).toHaveJSProperty("value", value);
}

/** Chooses the capital letters with one click: lower, title or random. */
export async function chooseCapitalization(page: Page, value: string, index = 0): Promise<void> {
  await segment(page, "capitalization", value, index).click();
  await expect(part(page, "capitalization", index)).toHaveJSProperty("value", value);
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
  noRepeat: boolean;
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
        noRepeat: element.noRepeat,
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
