// @vitest-environment happy-dom
// Component tests. The WASM module is replaced by a test version that counts the calls (FR-8)
// and Web Awesome is replaced by plain tags (see test/stubs/web-awesome.ts).
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import MANIFESTS from "virtual:hekate-manifests";
import pseudo from "./pseudo-locale.json";
import type { ManifestSource } from "../src/manifest.ts";
import { clearLocaleCache, clearWordlistCache } from "../src/assets.ts";
import { formatCrackTime } from "../src/crack-time.ts";
import { createTranslator, type Catalog } from "../src/messages.ts";
import en from "../locales/en.json";
import {
  forgetLoadedWordlists,
  setEngineLoader,
  type CharacterOptions,
  type DrawOptions,
  type Engine,
  type Generated,
  type WordStyle,
} from "../src/engine.ts";
import { HekateGenerator } from "../src/element.ts";

interface Counter {
  /** The calls that make new words. */
  draws: DrawOptions[];
  /** The calls that build a password from the words, with the style of each call. */
  renders: WordStyle[];
  characters: CharacterOptions[];
  lists: string[];
  freed: number;
  engine: Engine;
}

function counter(): Counter {
  const result: Counter = {
    draws: [],
    renders: [],
    characters: [],
    lists: [],
    freed: 0,
    engine: {
      loadWordlist: (language, ascii) => void result.lists.push(`${language}|${ascii}`),
      drawWords(options) {
        result.draws.push(options);
        const number = result.draws.length;
        return {
          render(style) {
            result.renders.push(style);
            const separator = style.separator === "-" ? "-" : "";
            return fake(`Alpha${number}${separator}Bravo`, "w");
          },
          free() {
            result.freed += 1;
          },
        };
      },
      generateCharacters(options) {
        result.characters.push(options);
        return fake(`aB3!${"x".repeat(options.length - 4)}`, "l");
      },
    },
  };
  return result;
}

function fake(password: string, kind: string, extra: Partial<Generated> = {}): Generated {
  return {
    password,
    kinds: kind.repeat(Array.from(password).length),
    entropyBits: 64.6246,
    crackSeconds: 1.4215e9,
    strength: "strong",
    naiveEntropyBits: 142.5,
    naiveCrackSeconds: 1e30,
    naiveStrength: "very-strong",
    ...extra,
  };
}

/** An engine whose words are always the same `password`. */
function fixedWords(password: string, extra: Partial<Generated> = {}): Partial<Engine> {
  return {
    drawWords: () => ({ render: () => fake(password, "w", extra), free() {} }),
  };
}

type Control = HTMLElement & { value?: unknown; checked?: boolean };

class Page {
  readonly element = document.createElement("hekate-generator") as HekateGenerator;
  constructor(attributes: Record<string, string> = {}) {
    for (const [name, value] of Object.entries(attributes)) this.element.setAttribute(name, value);
    document.body.append(this.element);
  }
  get root(): ShadowRoot {
    return this.element.shadowRoot as ShadowRoot;
  }
  $<T extends Element = HTMLElement>(selector: string): T | null {
    return this.root.querySelector<T>(selector);
  }
  text(selector: string): string {
    return (this.$(selector)?.textContent ?? "").trim();
  }
  get password(): string {
    return this.$("#password")?.textContent ?? "";
  }
  get live(): string {
    return this.$("[part=live-region]")?.textContent ?? "";
  }
  async ready(): Promise<void> {
    await vi.waitFor(() => expect(this.$("#password")?.getAttribute("aria-busy")).toBe("false"));
  }
  change(selector: string, props: { value?: unknown; checked?: boolean }): void {
    const control = this.$<Control>(selector) as Control;
    Object.assign(control, props);
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }
  async click(selector: string): Promise<void> {
    this.$(selector)?.dispatchEvent(new Event("click", { bubbles: true }));
    await this.element.updateComplete;
  }
}

let engine: Counter;

beforeAll(() => {
  if (!("adoptedStyleSheets" in Document.prototype)) {
    Object.defineProperty(Document.prototype, "adoptedStyleSheets", {
      value: [],
      configurable: true,
    });
  }
  if (!customElements.get("hekate-generator"))
    customElements.define("hekate-generator", HekateGenerator);
});

beforeEach(() => {
  engine = counter();
  setEngineLoader(async () => engine.engine);
  forgetLoadedWordlists();
  clearWordlistCache();
  clearLocaleCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).endsWith("qps.json")) return new Response(JSON.stringify(pseudo));
      return new Response("alpha\nbravo\n");
    }),
  );
  Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("FR-8 new password", () => {
  test("FR-8 the component shows a password at the start, with one call", async () => {
    const page = new Page();
    await page.ready();
    expect(engine.draws).toHaveLength(1);
    expect(engine.renders).toHaveLength(1);
    expect(page.password).toBe("Alpha1Bravo");
  });

  test("FR-8 one click gives one call and shows the password of that call", async () => {
    const page = new Page();
    await page.ready();
    await page.click("[part=new-password-button]");
    await vi.waitFor(() => expect(page.password).toBe("Alpha2Bravo"));
    expect(engine.draws).toHaveLength(2);
    expect(engine.renders).toHaveLength(2);
  });

  test("FR-8 a change of the language, the number of words, ASCII-only or no-repeat gives new words", async () => {
    const page = new Page();
    await page.ready();
    page.change("[part=ascii-only]", { checked: true });
    await vi.waitFor(() => expect(engine.draws).toHaveLength(2));
    expect(engine.renders).toHaveLength(2);
    expect(engine.draws[1]?.ascii).toBe(true);
    page.change("[part=words]", { value: "7" });
    await vi.waitFor(() => expect(engine.draws).toHaveLength(3));
    expect(engine.renders).toHaveLength(3);
    expect(engine.draws[2]?.words).toBe(7);
    page.change("[part=language]", { value: "sv" });
    await vi.waitFor(() => expect(engine.draws).toHaveLength(4));
    expect(engine.renders).toHaveLength(4);
    expect(engine.draws[3]?.language).toBe("sv");
    page.change("[part=no-repeat]", { checked: true });
    await vi.waitFor(() => expect(engine.draws).toHaveLength(5));
    expect(engine.renders).toHaveLength(5);
    expect(engine.draws[4]?.noRepeat).toBe(true);
    expect(engine.characters).toHaveLength(0);
  });

  test("FR-11 a change of the separator, the capital letters, the number or the symbol keeps the words", async () => {
    const page = new Page();
    await page.ready();
    expect(page.password).toBe("Alpha1Bravo");
    page.change("[part=separator]", { value: "-" });
    await vi.waitFor(() => expect(engine.renders).toHaveLength(2));
    expect(engine.renders[1]?.separator).toBe("-");
    expect(page.password).toBe("Alpha1-Bravo");
    page.change("[part=capitalization]", { value: "random" });
    await vi.waitFor(() => expect(engine.renders).toHaveLength(3));
    expect(engine.renders[2]?.capitalization).toBe("random");
    page.change("[part=number]", { checked: true });
    await vi.waitFor(() => expect(engine.renders).toHaveLength(4));
    expect(engine.renders[3]?.number).toBe(true);
    page.change("[part=symbol]", { checked: true });
    await vi.waitFor(() => expect(engine.renders).toHaveLength(5));
    expect(engine.renders[4]).toEqual({
      separator: "-",
      capitalization: "random",
      number: true,
      symbol: true,
    });
    await page.element.updateComplete;
    expect(engine.draws).toHaveLength(1);
    expect(page.password).toBe("Alpha1-Bravo");
    await vi.waitFor(() => expect(page.live).toBe("Password changed. The words are the same."));
    expect(engine.characters).toHaveLength(0);
  });

  test("FR-11 a new password after a change of the style makes new words with that style", async () => {
    const page = new Page({ separator: "-" });
    await page.ready();
    await page.click("[part=new-password-button]");
    await vi.waitFor(() => expect(page.password).toBe("Alpha2-Bravo"));
    expect(engine.draws).toHaveLength(2);
    expect(engine.freed).toBe(1);
  });

  test("FR-11 a change of the style while the word list loads applies to the new words", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        await gate;
        return String(url).endsWith("words.txt")
          ? new Response("alpha\nbravo\n")
          : new Response("");
      }),
    );
    const page = new Page();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    page.element.separator = "-";
    await page.element.updateComplete;
    release();
    await page.ready();
    expect(engine.draws).toHaveLength(1);
    expect(engine.renders).toEqual([
      { separator: "-", capitalization: "title", number: false, symbol: false },
    ]);
    expect(page.password).toBe("Alpha1-Bravo");
  });

  test("FR-8 each change of an option gives one call, in character mode", async () => {
    const page = new Page({ mode: "characters" });
    await page.ready();
    expect(engine.characters).toHaveLength(1);
    page.change("[part=length]", { value: 30 });
    await vi.waitFor(() => expect(engine.characters).toHaveLength(2));
    expect(engine.characters[1]?.length).toBe(30);
    page.change("[part=avoid-similar]", { checked: true });
    await vi.waitFor(() => expect(engine.characters).toHaveLength(3));
    expect(engine.characters[2]?.avoidSimilar).toBe(true);
    page.change("[part=no-repeat]", { checked: true });
    await vi.waitFor(() => expect(engine.characters).toHaveLength(4));
    expect(engine.characters[3]?.noRepeat).toBe(true);
    page.change("[part=charset]", { checked: false });
    await vi.waitFor(() => expect(engine.characters).toHaveLength(5));
    expect(engine.characters[4]?.charsets).toEqual(["upper", "digits", "symbols"]);
    expect(engine.draws).toHaveLength(0);
  });

  test("FR-8 a change of the mode gives one call", async () => {
    const page = new Page();
    await page.ready();
    page.change("[part=mode]", { value: "characters" });
    await vi.waitFor(() => expect(engine.characters).toHaveLength(1));
    expect(engine.draws).toHaveLength(1);
  });

  test("FR-8 a word list loads one time for each language", async () => {
    const page = new Page();
    await page.ready();
    await page.click("[part=new-password-button]");
    await vi.waitFor(() => expect(engine.draws).toHaveLength(2));
    expect(engine.lists).toEqual(["en-US|false"]);
  });

  test("FR-44 two components load the word list one time", async () => {
    const first = new Page();
    const second = new Page();
    await first.ready();
    await second.ready();
    const urls = vi.mocked(fetch).mock.calls.map((call) => String(call[0]));
    expect(urls.filter((url) => url.endsWith("words.txt"))).toHaveLength(1);
    expect(first.password).not.toBe(second.password);
  });
});

describe("FR-60, FR-62 modes and character sets", () => {
  test("FR-60 the UI shows the options of the selected mode only", async () => {
    const words = new Page();
    await words.ready();
    expect(words.$("[part=language]")).not.toBeNull();
    expect(words.$("[part=length]")).toBeNull();
    const characters = new Page({ mode: "characters" });
    await characters.ready();
    expect(characters.$("[part=language]")).toBeNull();
    expect(characters.$("[part=words]")).toBeNull();
    expect(characters.$("[part=length]")).not.toBeNull();
  });

  test("FR-12 the no-repeat switch shows in both modes and sets noRepeat", async () => {
    const words = new Page();
    await words.ready();
    expect(words.$("[part=no-repeat]")).not.toBeNull();
    expect(words.text("[part=no-repeat]")).toBe("No same character twice in a row (aa, aA, 11)");
    expect(engine.draws[0]?.noRepeat).toBe(false);
    const characters = new Page({ mode: "characters" });
    await characters.ready();
    expect(characters.$("[part=no-repeat]")).not.toBeNull();
    expect(engine.characters[0]?.noRepeat).toBe(false);
    const on = new Page({ "no-repeat": "true" });
    await on.ready();
    expect(engine.draws[1]?.noRepeat).toBe(true);
  });

  test("FR-3 the number of words is a slider from 3 to 10 with a visible count", async () => {
    const page = new Page({ words: "6" });
    await page.ready();
    const slider = page.$<Control & { min?: string; max?: string }>("[part=words]") as Control;
    expect(slider.tagName.toLowerCase()).toBe("hekate-wa-slider");
    expect(slider.getAttribute("min")).toBe("3");
    expect(slider.getAttribute("max")).toBe("10");
    const marks = [...slider.querySelectorAll("[slot=reference]")].map((n) => n.textContent);
    expect(marks).toEqual(["3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(page.text("[part=words-value]")).toBe("6 words");
    page.change("[part=words]", { value: 10 });
    await vi.waitFor(() => expect(engine.draws).toHaveLength(2));
    expect(engine.draws[1]?.words).toBe(10);
    await vi.waitFor(() => expect(page.text("[part=words-value]")).toBe("10 words"));
  });

  test("FR-4, FR-5 separator and capital letters are one radio group each, with a caption of the selected name", async () => {
    const page = new Page();
    await page.ready();
    const radios = (part: string) => [
      ...page.root.querySelectorAll(`[part=${part}] hekate-wa-radio`),
    ];
    expect(radios("separator").map((r) => r.getAttribute("value"))).toEqual([
      "none",
      "-",
      ".",
      "_",
      "space",
    ]);
    expect(radios("separator").map((r) => r.getAttribute("aria-label"))).toEqual([
      "ab, None",
      "a-b, Hyphen (-)",
      "a.b, Dot (.)",
      "a_b, Underscore (_)",
      "a b, Space",
    ]);
    expect(radios("capitalization").map((r) => r.textContent?.trim())).toEqual([
      "abc",
      "Abc",
      "Abc abc",
    ]);
    const shown = (part: string) =>
      page
        .$(`[part=${part}] + .option-caption .caption-choice[data-selected=true]`)
        ?.textContent?.trim();
    expect(shown("separator")).toBe("None");
    expect(shown("capitalization")).toBe("Title case");
    page.change("[part=separator]", { value: "space" });
    page.change("[part=capitalization]", { value: "random" });
    await vi.waitFor(() => expect(shown("separator")).toBe("Space"));
    expect(shown("capitalization")).toBe("Random");
  });

  test("FR-62 the UI does not let the user turn off the last character set", async () => {
    const page = new Page({ mode: "characters", charsets: "digits" });
    await page.ready();
    const boxes = [...page.root.querySelectorAll<Control>("[part=charset]")];
    expect(boxes).toHaveLength(4);
    expect(boxes.filter((box) => box.hasAttribute("disabled")).map((_, i) => i)).toHaveLength(1);
    page.change("[part=charset]", { checked: false });
    await page.element.updateComplete;
    expect(engine.characters.every((call) => call.charsets.length >= 1)).toBe(true);
  });
});

describe("SR-9 live region", () => {
  test("SR-9 after a new password the live region says New password generated", async () => {
    const page = new Page();
    await page.ready();
    await page.click("[part=new-password-button]");
    await vi.waitFor(() => expect(page.live).toBe("New password generated"));
  });

  test("SR-9 the live region never holds the password", async () => {
    const page = new Page();
    await page.ready();
    const seen: string[] = [];
    new MutationObserver(() => seen.push(page.live)).observe(page.$("[part=live-region]") as Node, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    await page.click("[part=new-password-button]");
    await page.click("[part=copy-button]");
    await vi.waitFor(() => expect(page.live).not.toBe(""));
    for (const text of [...seen, page.live]) expect(text).not.toContain("Alpha");
    expect(page.$("[part=live-region]")?.getAttribute("aria-live")).toBe("polite");
  });
});

describe("FR-9, FR-84 copy", () => {
  test("FR-9 the clipboard gets the password and Copied shows for 2 seconds or less", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText }, languages: ["en"] });
    const page = new Page();
    await page.ready();
    vi.useFakeTimers();
    await page.click("[part=copy-button]");
    await vi.advanceTimersByTimeAsync(10);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(page.password);
    expect(page.text("[part=copy-status]")).toBe("Copied");
    await vi.advanceTimersByTimeAsync(2000);
    expect(page.text("[part=copy-status]")).toBe("");
  });

  test("FR-84 without the Clipboard API the component shows the message", async () => {
    vi.stubGlobal("navigator", { languages: ["en"] });
    const page = new Page();
    await page.ready();
    await page.click("[part=copy-button]");
    await vi.waitFor(() =>
      expect(page.$("#copy-error")?.textContent).toBe(
        "Copy failed. Select the password and copy it.",
      ),
    );
    await vi.waitFor(() => expect(page.live).toBe("Copy failed. Select the password and copy it."));
  });

  test("FR-9 a copy that ends after a new password does not mark the new password as copied", async () => {
    let resolve: () => void = () => {};
    const promise = new Promise<void>((done) => (resolve = done));
    const writeText = vi.fn(() => promise);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText }, languages: ["en"] });
    const page = new Page();
    await page.ready();
    await page.click("[part=copy-button]");
    await page.click("[part=new-password-button]");
    await vi.waitFor(() => expect(page.password).toBe("Alpha2Bravo"));
    resolve();
    await promise;
    await page.element.updateComplete;
    expect(page.text("[part=copy-status]")).toBe("");
  });

  test("FR-8 while a word list loads, Copy and New password are disabled and the old password stays", async () => {
    const page = new Page();
    await page.ready();
    const old = page.password;
    let release: () => void = () => {};
    const gate = new Promise<void>((done) => (release = done));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await gate;
        return new Response("alpha\nbravo\n");
      }),
    );
    page.change("[part=language]", { value: "sv" });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    await page.element.updateComplete;
    expect(page.$("[part=copy-button]")?.hasAttribute("disabled")).toBe(true);
    expect(page.$("[part=new-password-button]")?.hasAttribute("disabled")).toBe(true);
    expect(page.password).toBe(old);
    release();
    await page.ready();
    expect(page.$("[part=copy-button]")?.hasAttribute("disabled")).toBe(false);
    expect(page.$("[part=new-password-button]")?.hasAttribute("disabled")).toBe(false);
  });
});

describe("FR-20 to FR-23 strength", () => {
  test("FR-21 the component shows the time and the note from the WASM numbers", async () => {
    const page = new Page();
    await page.ready();
    expect(page.text("#crack-time")).toBe("Estimated time to crack: ~45 years");
    expect(page.text("[part=crack-note]")).toBe(
      "This is an average estimate. It assumes an attacker who has the stored password data and makes 10 billion guesses per second.",
    );
  });

  test("FR-20 the component shows the note about what the attacker knows, in each mode", async () => {
    const words = new Page({ language: "sv" });
    await words.ready();
    expect(words.text("#strength-note")).toBe(
      "This estimate assumes that the attacker knows that Hekate uses random words from the Svenska word list, and knows the selected options.",
    );
    const characters = new Page({ mode: "characters" });
    await characters.ready();
    expect(characters.text("#strength-note")).toBe(
      "This estimate assumes that the attacker knows that Hekate uses random characters, and knows the selected character sets and length.",
    );
  });

  test("FR-24 the component shows the line for an attacker who knows nothing", async () => {
    const t = createTranslator(en as Catalog, en as Catalog, "en");
    const words = new Page();
    await words.ready();
    const time = formatCrackTime(1e30, "en", t);
    const expected = `Length-based comparison: Very strong, 142.5 bits of entropy, estimated time to crack ${time}. This comparison ignores how Hekate made the password. It uses only the length and the character groups, such as lowercase letters or digits.`;
    expect(words.text("#naive-strength")).toBe(expected);
    const characters = new Page({ mode: "characters" });
    await characters.ready();
    expect(characters.text("#naive-strength")).toBe(expected);
    expect(words.text("#strength-label")).toBe("Strong");
  });

  test("FR-20 the component shows the entropy of the WASM module", async () => {
    const page = new Page();
    await page.ready();
    expect(page.text("#entropy")).toBe("64.6 bits of entropy");
  });

  test("FR-22 the label comes from the WASM module", async () => {
    setEngineLoader(async () => ({
      ...engine.engine,
      ...fixedWords("Alpha", { strength: "very-strong" }),
    }));
    const page = new Page();
    await page.ready();
    expect(page.text("#strength-label")).toBe("Very strong");
  });

  test("FR-23 the length is the count of code points", async () => {
    setEngineLoader(async () => ({
      ...engine.engine,
      ...fixedWords("Åa𝒳"),
    }));
    const page = new Page();
    await page.ready();
    expect(page.text("#password-length")).toBe("Length: 3 characters");
  });

  test("NFR-8 the password is shown in runs with a part name for each kind", async () => {
    setEngineLoader(async () => ({
      ...engine.engine,
      ...fixedWords("Ab-9!", { kinds: "wwsny" }),
    }));
    const page = new Page();
    await page.ready();
    expect(page.password).toBe("Ab-9!");
    expect(page.$("[part=token-separator]")?.textContent).toBe("-");
    expect(page.$("[part=token-number]")?.textContent).toBe("9");
    expect(page.$("[part=token-symbol]")?.textContent).toBe("!");
  });

  test("FR-20 the entropy is always visible and the other details are in a closed panel", async () => {
    const page = new Page();
    await page.ready();
    const button = page.$("#strength-info") as HTMLElement;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.getAttribute("aria-controls")).toBe("strength-details");
    const panel = page.$("#strength-details") as HTMLElement;
    expect(panel.hasAttribute("hidden")).toBe(true);
    expect(page.text("#entropy")).toBe("64.6 bits of entropy");
    expect(panel.querySelector("#entropy")).toBeNull();
    for (const selector of [
      "#entropy-note",
      "#strength-note",
      "#crack-time",
      "[part=crack-note]",
      "#naive-strength",
    ]) {
      expect(panel.querySelector(selector), selector).not.toBeNull();
    }
    for (const selector of ["#password-length", "#strength-label"]) {
      expect(panel.querySelector(selector), selector).toBeNull();
      expect(page.$(selector), selector).not.toBeNull();
    }
    // The icon is right after the entropy text.
    expect(page.$("#entropy")?.nextElementSibling?.contains(button)).toBe(true);
  });

  test("FR-20 the details open after a hover, close after the pointer leaves, and close on Escape", async () => {
    const page = new Page();
    await page.ready();
    vi.useFakeTimers();
    const popup = page.$("#strength-popup") as HTMLElement;
    const button = page.$("#strength-info") as HTMLElement;
    popup.dispatchEvent(new Event("pointerenter"));
    await vi.advanceTimersByTimeAsync(100);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    await vi.advanceTimersByTimeAsync(100);
    await page.element.updateComplete;
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(page.$("#strength-details")?.hasAttribute("hidden")).toBe(false);
    popup.dispatchEvent(new Event("pointerleave"));
    await vi.advanceTimersByTimeAsync(250);
    await page.element.updateComplete;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    popup.dispatchEvent(new Event("pointerenter"));
    await vi.advanceTimersByTimeAsync(200);
    await page.element.updateComplete;
    expect(button.getAttribute("aria-expanded")).toBe("true");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await page.element.updateComplete;
    expect(button.getAttribute("aria-expanded")).toBe("false");
    // After Escape the panel stays closed while the pointer stays on the icon.
    popup.dispatchEvent(new Event("pointerenter"));
    await vi.advanceTimersByTimeAsync(300);
    await page.element.updateComplete;
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  test("FR-20 a click on the icon keeps the details open when the pointer leaves", async () => {
    const page = new Page();
    await page.ready();
    vi.useFakeTimers();
    const popup = page.$("#strength-popup") as HTMLElement;
    await page.click("#strength-info");
    expect(page.$("#strength-info")?.getAttribute("aria-expanded")).toBe("true");
    popup.dispatchEvent(new Event("pointerleave"));
    await vi.advanceTimersByTimeAsync(500);
    await page.element.updateComplete;
    expect(page.$("#strength-info")?.getAttribute("aria-expanded")).toBe("true");
    await page.click("#strength-info");
    expect(page.$("#strength-info")?.getAttribute("aria-expanded")).toBe("false");
  });

  test("FR-62 the character sets have a visible label and the hint about the last set", async () => {
    const page = new Page({ mode: "characters" });
    await page.ready();
    expect(page.text("#charsets-label")).toBe("Character sets");
    expect(page.text("#charsets-hint")).toBe("Keep at least one character set on.");
    expect(page.$("[part=charsets]")?.getAttribute("aria-labelledby")).toBe("charsets-label");
  });

  test("FR-71 the UI root has the lang of the UI language", async () => {
    const page = new Page({ language: "sv" });
    await page.ready();
    expect(page.$(".root")?.getAttribute("lang")).toBe("en");
    expect(page.$("#password")?.getAttribute("lang")).toBe("sv");
    const pseudoPage = new Page({ "ui-language": "qps" });
    await pseudoPage.ready();
    expect(pseudoPage.$(".root")?.getAttribute("lang")).toBe("en");
  });
});

describe("FR-42 attributes", () => {
  test("FR-42 attributes set the start values", async () => {
    const page = new Page({
      words: "7",
      separator: "-",
      capitalization: "random",
      number: "true",
      symbol: "true",
      "ascii-only": "true",
      language: "SV",
    });
    await page.ready();
    expect(engine.draws[0]).toEqual({
      language: "sv",
      ascii: true,
      words: 7,
      noRepeat: false,
    });
    expect(engine.renders[0]).toEqual({
      separator: "-",
      capitalization: "random",
      number: true,
      symbol: true,
    });
  });

  test("FR-42 a value that is not valid gives the default and a console warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const page = new Page({ words: "11", separator: "x", length: "7", mode: "nothing" });
    await page.ready();
    expect(engine.draws[0]).toMatchObject({ words: 5 });
    expect(engine.renders[0]).toMatchObject({ separator: "none" });
    expect(warn).toHaveBeenCalledTimes(4);
  });
});

describe("FR-30 credits", () => {
  test("FR-30 the dialog shows version, commit, the license report link and each manifest item", async () => {
    const page = new Page();
    await page.ready();
    await page.click("#credits-link");
    await vi.waitFor(() => expect(page.$("#credits-version")).not.toBeNull());
    expect(page.text("#credits-version")).toBe("Version dev");
    expect(page.text("#credits-commit")).toBe("Commit dev");
    expect(page.$<HTMLAnchorElement>("#license-report")?.getAttribute("href")).toMatch(
      /THIRD-PARTY-LICENSES\.html$/,
    );
    for (const manifest of MANIFESTS) {
      const section = page.$(`#credits-${manifest.code}`) as HTMLElement;
      expect(section.querySelector("summary")?.textContent).toBe(manifest.name);
      const names = [...section.querySelectorAll(".source-name")].map((a) => a.textContent);
      expect(names).toEqual(manifest.sources.map((s: ManifestSource) => s.name));
      const credits = [...section.querySelectorAll(".source-credit")].map((a) => a.textContent);
      expect(credits).toEqual(manifest.sources.map((s: ManifestSource) => `Credit: ${s.credit}`));
      const licenses = [...section.querySelectorAll<HTMLAnchorElement>(".source-license")];
      expect(licenses.map((a) => a.getAttribute("href"))).toEqual(
        manifest.sources.map((s: ManifestSource) => new URL(s.license_url).href),
      );
      expect(section.querySelector(".changed-note")?.textContent).toBe(manifest.changed_note);
      expect(section.querySelector(".words-hash")?.textContent).toContain(manifest.sha256.words);
      expect(section.querySelector(".ascii-hash") !== null).toBe(!manifest.ascii_same);
    }
  });

  test("FR-30 the Credits link and the dialog are in no part, so a page cannot hide them with ::part()", async () => {
    const page = new Page();
    await page.ready();
    const link = page.$("#credits-link") as HTMLElement;
    expect(link.hasAttribute("part")).toBe(false);
    expect(link.closest("[part]")).toBeNull();
    const dialog = page.$("#credits") as HTMLElement;
    expect(dialog.closest("[part]")).toBeNull();
    expect(dialog.hasAttribute("part")).toBe(false);
    expect(page.$("[part=base]")?.contains(link)).toBe(false);
  });

  test("FR-70 the close button of the dialog has its label from the message files", async () => {
    const page = new Page({ "ui-language": "qps" });
    await page.ready();
    const icon = page.$("#credits-close hekate-wa-icon") as HTMLElement;
    expect(icon.getAttribute("label")).toBe(pseudo["credits.close"]);
    expect(page.$("#credits")?.hasAttribute("without-header")).toBe(true);
  });

  test("NFR-3 the Copy button has the visible and accessible text Copy password", async () => {
    const page = new Page();
    await page.ready();
    expect(page.text("[part=copy-button]")).toBe("Copy password");
  });
});

describe("Errors (5.7)", () => {
  test("FR-80 a word list that does not load gives the error and the Try again button, and no password", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("no", { status: 404 })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const page = new Page();
    await vi.waitFor(() => expect(page.$("#error")).not.toBeNull());
    expect(page.$("#error")?.textContent).toContain("could not load the word list");
    expect(page.$("[part=retry-button]")).not.toBeNull();
    expect(page.password).toBe("");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("alpha\nbravo\n")),
    );
    await page.click("[part=retry-button]");
    await vi.waitFor(() => expect(page.password).toBe("Alpha1Bravo"));
    expect(page.$("#error")).toBeNull();
  });

  test("FR-81 a word list with a wrong hash gives the error, no password and no button", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setEngineLoader(async () => ({
      ...engine.engine,
      loadWordlist: () => {
        throw new Error("hash of word list en-US does not match");
      },
    }));
    const page = new Page();
    await vi.waitFor(() => expect(page.$("#error")).not.toBeNull());
    expect(page.$("#error")?.textContent).toContain("not the file that Hekate expects");
    expect(page.$("[part=retry-button]")).toBeNull();
    expect(page.$("#password")?.textContent).toBe("");
  });

  test("FR-82 a WASM module that does not load gives the error and no password", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setEngineLoader(async () => {
      throw new Error("HTTP 500");
    });
    const page = new Page();
    await vi.waitFor(() =>
      expect(page.$("#error")?.textContent).toContain("could not load its password code"),
    );
    expect(page.$("#password")).toBeNull();
  });

  test("FR-85 a page that is not secure gives the error and no password", async () => {
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    const page = new Page();
    await vi.waitFor(() => expect(page.$("#error")?.textContent).toContain("not secure"));
    expect(page.$("#password")).toBeNull();
    expect(engine.draws).toHaveLength(0);
  });

  test("FR-86 a browser without WebAssembly gives the error and no password", async () => {
    vi.stubGlobal("WebAssembly", undefined);
    const page = new Page();
    await vi.waitFor(() =>
      expect(page.$("#error")?.textContent).toContain("does not have a feature"),
    );
    expect(page.$("#password")).toBeNull();
    expect(engine.draws).toHaveLength(0);
  });

  test("SR-3 without crypto.getRandomValues the component gives the error and no password", async () => {
    vi.stubGlobal("crypto", {});
    const page = new Page();
    await vi.waitFor(() =>
      expect(page.$("#error")?.textContent).toContain("secure random numbers"),
    );
    expect(page.$("#password")).toBeNull();
    expect(engine.draws).toHaveLength(0);
  });

  test("SR-3 a call that fails because of the random generator gives the error and no password", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setEngineLoader(async () => ({
      ...engine.engine,
      drawWords: () => {
        throw new Error("secure random numbers are not available");
      },
    }));
    const page = new Page();
    await vi.waitFor(() =>
      expect(page.$("#error")?.textContent).toContain("secure random numbers"),
    );
  });
});

describe("FR-70, FR-71, FR-87 UI language", () => {
  test("FR-71 the ui-language attribute selects the translation", async () => {
    const page = new Page({ "ui-language": "qps" });
    await page.ready();
    expect(page.text("[part=new-password-button]")).toContain(pseudo["action.new"].slice(1, 4));
    expect(page.text("[part=new-password-button]")).not.toContain("New password");
  });

  test("FR-71 without the attribute the first entry of navigator.languages with a translation is used", async () => {
    vi.stubGlobal("navigator", { languages: ["xx", "qps"] });
    const page = new Page();
    await page.ready();
    expect(page.text("[part=new-password-button]")).not.toContain("New password");
  });

  test("FR-71 English is used when no entry has a translation", async () => {
    vi.stubGlobal("navigator", { languages: ["xx"] });
    const page = new Page();
    await page.ready();
    expect(page.text("[part=new-password-button]")).toContain("New password");
  });

  test("FR-83 a translation that does not load gives English, a console warning and a password", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).endsWith("qps.json")
          ? new Response("no", { status: 404 })
          : new Response("alpha\nbravo\n"),
      ),
    );
    const page = new Page({ "ui-language": "qps" });
    await page.ready();
    expect(page.text("[part=new-password-button]")).toContain("New password");
    expect(warn).toHaveBeenCalled();
    expect(page.password).toBe("Alpha1Bravo");
  });

  test("FR-70 with the pseudo-locale no English UI text remains, and the language names stay", async () => {
    const page = new Page({ "ui-language": "qps", words: "3" });
    await page.ready();
    await page.click("#credits-link");
    await vi.waitFor(() => expect(page.$("#credits-version")).not.toBeNull());
    const english = /\b[A-Za-z]{3,}\b/;
    const texts = [
      "[part=new-password-button]",
      "[part=copy-button]",
      "[part=strength-label]",
      "[part=entropy]",
      "[part=crack-note]",
      "#password-length",
      "[part=mode]",
      "[part=separator] + .option-caption",
      "[part=capitalization] + .option-caption",
      "[part=number]",
      "[part=ascii-only]",
      "#credits-link",
    ];
    for (const selector of texts) {
      expect(page.text(selector), selector).not.toMatch(english);
    }
    // The time units come from Intl, so only the start of the line is a message.
    expect(page.text("[part=naive-strength]")).toContain(pseudo["strength.naive"].slice(1, 6));
    expect(page.text("[part=naive-strength]")).not.toContain("If the attacker");
    expect(page.$("[part=language] hekate-wa-option[value=sv]")?.textContent).toBe("Svenska");
    expect(page.$("[part=language] hekate-wa-option[value=en-US]")?.textContent).toBe(
      "English (US)",
    );
  });
});

test("FR-45 the element is defined one time", () => {
  expect(customElements.get("hekate-generator")).toBe(HekateGenerator);
});

test("FR-41 the component has a shadow root", async () => {
  const page = new Page();
  await page.ready();
  expect(page.element.shadowRoot).not.toBeNull();
});
