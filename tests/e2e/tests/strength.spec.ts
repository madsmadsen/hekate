// Strength estimate and display: FR-20, FR-21, FR-22, FR-23, FR-24, NFR-8.
import { expect, test, type Page } from "@playwright/test";
import {
  openPlayground,
  readPassword,
  readState,
  setProperty,
  waitForPassword,
} from "../support/component.ts";
import { englishText, manifests, readWordlist } from "../support/env.ts";
import {
  characterEntropy,
  contrastRatio,
  crackTimeText,
  naiveEntropy,
  strengthLabel,
  wordEntropy,
} from "../support/maths.ts";

const SET_SIZE = { lower: 26, upper: 26, digits: 10, symbols: 16 } as const;

async function shownBits(page: Page): Promise<number> {
  const text = (await page.locator("#entropy").textContent()) ?? "";
  return Number(/([\d.]+)/.exec(text)?.[1]);
}

const enUs = manifests.find((m) => m.code === "en-US");

test.describe("FR-21 time to crack", () => {
  test("FR-21 5 words from the en-US list show the time of the PRD example", async ({ page }) => {
    test.skip(!enUs, "no en-US word list");
    await openPlayground(page, { language: "en-US" });
    const size = readWordlist("en-US", false).length;
    const bits = wordEntropy({ size, words: 5 });
    const shown = await page.locator("#crack-time").textContent();
    expect(shown?.trim()).toBe(englishText("crack.label").replace("{time}", crackTimeText(bits)));
    if (size === 7776) {
      // 7,776 words, 64.6 bits: "~45 years".
      expect(shown).toContain("~45 years");
    }
  });

  test("FR-21 about 30 bits show less than 1 second", async ({ page }) => {
    // 9 digits are 29.9 bits, the nearest value to 30 bits that the options can make.
    await openPlayground(page, { mode: "characters", length: "9", charsets: "digits" });
    expect(Math.abs((await shownBits(page)) - 29.9)).toBeLessThanOrEqual(0.06);
    await expect(page.locator("#crack-time")).toHaveText("Time to crack: less than 1 second");
  });

  test("FR-21 the note text is present", async ({ page }) => {
    await openPlayground(page);
    await expect(page.locator("[part=crack-note]")).toHaveText(englishText("crack.note"));
    expect(englishText("crack.note")).toBe(
      "The time assumes an attacker who makes 10 billion guesses per second.",
    );
  });

  test("FR-21 the time has 2 significant digits, the largest unit, and a ~ prefix for 40 option sets", async ({
    page,
  }) => {
    await openPlayground(page, { mode: "characters" });
    const sets: Array<Array<keyof typeof SET_SIZE>> = [
      ["digits"],
      ["lower", "digits"],
      ["lower", "upper"],
      ["lower", "upper", "digits", "symbols"],
    ];
    let checked = 0;
    for (const charsets of sets) {
      for (const length of [8, 9, 10, 11, 12, 14, 16, 20, 24, 30]) {
        await setProperty(page, "charsets", charsets);
        await setProperty(page, "length", length);
        const bits = characterEntropy(
          length,
          charsets.map((name) => SET_SIZE[name]),
        );
        const expected = englishText("crack.label").replace("{time}", crackTimeText(bits));
        await expect(page.locator("#crack-time")).toHaveText(expected);
        checked++;
      }
    }
    expect(checked).toBe(40);
  });
});

test.describe("FR-20 what the attacker knows", () => {
  test("FR-20 the note says what the attacker knows, in each mode", async ({ page }) => {
    const manifest = manifests.find((m) => m.code === "en-US") ?? manifests[0];
    test.skip(!manifest, "no word list");
    await openPlayground(page, { language: manifest?.code ?? "en-US" });
    await expect(page.locator("#strength-note")).toHaveText(
      englishText("strength.assumeWords").replace("{language}", manifest?.name ?? ""),
    );
    await setProperty(page, "mode", "characters");
    await waitForPassword(page);
    await expect(page.locator("#strength-note")).toHaveText(
      englishText("strength.assumeCharacters"),
    );
  });
});

test.describe("FR-24 attacker who knows nothing", () => {
  for (const [mode, attributes] of [
    ["words", { language: "en-US", separator: "-", number: "true", symbol: "true" }],
    ["characters", { mode: "characters", length: "20" }],
  ] as const) {
    test(`FR-24 in ${mode} mode the second line shows the estimate of Appendix A.3, its label and its time`, async ({
      page,
    }) => {
      await openPlayground(page, attributes);
      const bits = naiveEntropy(await readPassword(page));
      const count = Math.round(bits * 10) / 10;
      const entropy = englishText("entropy.value", 2).replace(
        "{count}",
        new Intl.NumberFormat("en").format(count),
      );
      const expected = englishText("strength.naive")
        .replace("{strength}", strengthLabel(bits))
        .replace("{entropy}", entropy)
        .replace("{time}", crackTimeText(bits));
      await expect(page.locator("#naive-strength")).toHaveText(expected);
      // The bar and the main label keep the safe estimate of FR-20.
      expect(await shownBits(page)).toBeLessThan(bits);
    });
  }
});

test.describe("FR-22 strength label", () => {
  test("FR-22 the label follows the entropy: Weak, Fair, Strong, Very strong", async ({ page }) => {
    await openPlayground(page, { language: "en-US" });
    const size = readWordlist("en-US", false).length;
    const seen = new Set<string>();
    for (const words of [3, 4, 5, 6, 7, 8, 10]) {
      for (const random of [false, true]) {
        for (const extra of [
          { number: false, symbol: false },
          { number: true, symbol: true },
        ]) {
          await setProperty(page, "words", words);
          await setProperty(page, "capitalization", random ? "random" : "title");
          await setProperty(page, "number", extra.number);
          await setProperty(page, "symbol", extra.symbol);
          const bits = wordEntropy({ size, words, random, ...extra });
          const label = strengthLabel(bits);
          await expect(page.locator("#strength-label")).toHaveText(label);
          expect(Math.abs((await shownBits(page)) - bits)).toBeLessThanOrEqual(0.06);
          seen.add(label);
        }
      }
    }
    expect([...seen].sort()).toEqual(["Fair", "Strong", "Very strong", "Weak"]);
  });

  test("FR-22 the examples of Appendix A.1 and A.2 show their labels", async ({ page }) => {
    await openPlayground(page, { mode: "characters" });
    for (const [length, charsets, label] of [
      [8, ["lower", "digits"], "Weak"],
      [12, ["lower", "upper", "digits", "symbols"], "Strong"],
      [20, ["lower", "upper", "digits", "symbols"], "Very strong"],
    ] as const) {
      await setProperty(page, "charsets", charsets);
      await setProperty(page, "length", length);
      await expect(page.locator("#strength-label")).toHaveText(label);
    }
    await setProperty(page, "length", 20);
    // 125.6 bits (A.2).
    await setProperty(page, "charsets", ["lower", "upper", "digits", "symbols"]);
    expect(Math.abs((await shownBits(page)) - 125.6)).toBeLessThanOrEqual(0.06);
  });
});

test.describe("FR-23 length", () => {
  test("FR-23 the number is the count of code points and agrees with the password", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openPlayground(page);
    let withNonAscii = 0;
    for (const manifest of manifests) {
      await setProperty(page, "language", manifest.code);
      await waitForPassword(page);
      const result = await page
        .locator("hekate-generator")
        .first()
        .evaluate(async (node) => {
          const element = node as unknown as HTMLElement & { updateComplete: Promise<boolean> };
          const root = element.shadowRoot as ShadowRoot;
          const button = root.querySelector("[part=new-password-button]") as HTMLElement;
          const wrong: string[] = [];
          let nonAscii = 0;
          for (let i = 0; i < 300; i++) {
            button.click();
            await element.updateComplete;
            const password = root.querySelector("#password")?.textContent ?? "";
            const shown = root.querySelector("#password-length")?.textContent ?? "";
            const count = Number(/(\d+)/.exec(shown)?.[1]);
            if (count !== Array.from(password).length) wrong.push(`${password}: ${shown}`);
            if (/\P{ASCII}/u.test(password)) nonAscii++;
          }
          return { wrong, nonAscii };
        });
      expect(result.wrong, manifest.code).toEqual([]);
      withNonAscii += result.nonAscii;
    }
    // The test is only strong when some passwords have letters outside ASCII.
    const hasAccents = manifests.some(
      (m) => !m.ascii_same || readWordlist(m.code, false).some((w) => /\P{ASCII}/u.test(w)),
    );
    if (hasAccents) expect(withNonAscii).toBeGreaterThan(0);
  });

  test("FR-23 the text is Length: N characters in English", async ({ page }) => {
    await openPlayground(page, { mode: "characters", length: "20" });
    await expect(page.locator("#password-length")).toHaveText("Length: 20 characters");
    expect(Array.from(await readPassword(page))).toHaveLength(20);
    await openPlayground(page, { mode: "characters", length: "8" });
    await expect(page.locator("#password-length")).toHaveText("Length: 8 characters");
  });
});

test.describe("NFR-8 color", () => {
  interface TokenStyle {
    part: string;
    weight: number;
    color: string;
  }

  async function tokenStyles(page: Page): Promise<{ surface: string; tokens: TokenStyle[] }> {
    return page
      .locator("hekate-generator")
      .first()
      .evaluate((node) => {
        const root = (node as HTMLElement).shadowRoot as ShadowRoot;
        const tokens: TokenStyle[] = [];
        for (const element of root.querySelectorAll("#password > span[part]")) {
          const style = getComputedStyle(element);
          tokens.push({
            part: element.getAttribute("part") ?? "",
            weight: Number(style.fontWeight),
            color: style.color,
          });
        }
        const surface = getComputedStyle(root.querySelector(".root") as Element).backgroundColor;
        return { surface, tokens };
      });
  }

  for (const theme of ["light", "dark"]) {
    test(`NFR-8 word mode, ${theme} theme: separators, numbers and symbols differ in weight and have a contrast ratio of 4.5:1 or more`, async ({
      page,
    }) => {
      await openPlayground(page, { theme, separator: "-", number: "true", symbol: "true" });
      const seen = new Set<string>();
      for (let i = 0; i < 10; i++) {
        await page.getByRole("button", { name: "New password" }).click();
        const { surface, tokens } = await tokenStyles(page);
        const word = tokens.find((t) => t.part === "token-word");
        expect(word, "a word").toBeDefined();
        for (const token of tokens) {
          seen.add(token.part);
          if (token.part === "token-word") continue;
          expect(token.weight, token.part).not.toBe(word?.weight);
          expect(contrastRatio(token.color, surface), token.part).toBeGreaterThanOrEqual(4.5);
        }
        expect(contrastRatio(word?.color ?? "", surface)).toBeGreaterThanOrEqual(4.5);
      }
      expect([...seen].sort()).toEqual([
        "token-number",
        "token-separator",
        "token-symbol",
        "token-word",
      ]);
    });

    test(`NFR-8 character mode, ${theme} theme: digits and symbols differ in weight and have a contrast ratio of 4.5:1 or more`, async ({
      page,
    }) => {
      await openPlayground(page, { theme, mode: "characters", length: "64" });
      const { surface, tokens } = await tokenStyles(page);
      const letters = tokens.find((t) => t.part === "token-lower" || t.part === "token-upper");
      expect(letters, "letters").toBeDefined();
      const seen = new Set(tokens.map((t) => t.part));
      expect(seen.has("token-digit") && seen.has("token-symbol")).toBe(true);
      for (const token of tokens) {
        expect(contrastRatio(token.color, surface), token.part).toBeGreaterThanOrEqual(4.5);
        if (token.part === "token-digit" || token.part === "token-symbol") {
          expect(token.weight, token.part).not.toBe(letters?.weight);
        }
      }
      expect((await readState(page)).theme).toBe(theme);
    });
  }
});
