// Character passwords: FR-60 to FR-66.
import { expect, test, type Page } from "@playwright/test";
import { countRandom, randomCounts, removeRandom, seedRandom } from "../support/browser.ts";
import {
  generateMany,
  generateManyWords,
  liveHistory,
  openPlayground,
  part,
  readPassword,
  readState,
  setProperty,
  watchLiveRegion,
} from "../support/component.ts";
import { englishText, readWordlist } from "../support/env.ts";
import { characterEntropy, chiSquareUniform } from "../support/maths.ts";

const SETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!#$%&*+-=?@^_~:;",
} as const;
type SetName = keyof typeof SETS;
const SET_NAMES = Object.keys(SETS) as SetName[];

const WORD_PARTS = [
  "language",
  "words",
  "separator",
  "capitalization",
  "number",
  "symbol",
  "ascii-only",
];
const CHARACTER_PARTS = ["length", "charsets", "charset", "avoid-similar"];

test.describe("FR-60 mode", () => {
  test("FR-60 the default is Words and the UI shows the options of the selected mode only", async ({
    page,
  }) => {
    await openPlayground(page);
    expect((await readState(page)).mode).toBe("words");
    await expect(page.getByRole("radio", { name: "Words" })).toBeChecked();
    for (const name of WORD_PARTS) await expect(part(page, name).first(), name).toBeVisible();
    for (const name of CHARACTER_PARTS) await expect(part(page, name), name).toHaveCount(0);

    await page.getByRole("radio", { name: "Characters" }).click();
    await expect.poll(async () => (await readState(page)).mode).toBe("characters");
    for (const name of CHARACTER_PARTS) await expect(part(page, name).first(), name).toBeVisible();
    for (const name of WORD_PARTS) await expect(part(page, name), name).toHaveCount(0);
    await expect(page.getByRole("radio", { name: "Characters" })).toBeChecked();

    await page.getByRole("radio", { name: "Words" }).click();
    await expect.poll(async () => (await readState(page)).mode).toBe("words");
    for (const name of WORD_PARTS) await expect(part(page, name).first(), name).toBeVisible();
  });

  test("FR-60 the attribute mode=characters starts in character mode", async ({ page }) => {
    await openPlayground(page, { mode: "characters" });
    await expect(page.getByRole("radio", { name: "Characters" })).toBeChecked();
    expect(await readPassword(page)).toHaveLength(20);
  });
});

test.describe("FR-61 length", () => {
  const slider = "[part=length] [role=slider]";

  test("FR-61 the control accepts only values from 8 to 64 and the default is 20", async ({
    page,
  }) => {
    await openPlayground(page, { mode: "characters" });
    expect((await readState(page)).length).toBe(20);
    await expect(part(page, "length")).toHaveAttribute("min", "8");
    await expect(part(page, "length")).toHaveAttribute("max", "64");
    await page.locator(slider).focus();
    for (const [key, expected] of [
      ["Home", 8],
      ["ArrowLeft", 8],
      ["ArrowRight", 9],
      ["End", 64],
      ["ArrowRight", 64],
      ["ArrowLeft", 63],
    ] as const) {
      await page.keyboard.press(key);
      await expect.poll(async () => (await readState(page)).length).toBe(expected);
      expect(Array.from(await readPassword(page))).toHaveLength(expected);
    }
  });

  test("FR-61 with 11 characters the warning shows, with 12 it does not, and the live region announces it", async ({
    page,
  }) => {
    await openPlayground(page, { mode: "characters" });
    await watchLiveRegion(page);
    const warning = page.locator("#length-warning");
    await expect(warning).toHaveCount(0);
    await page.locator(slider).focus();
    await page.keyboard.press("Home");
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await readState(page)).length).toBe(11);
    await expect(warning).toBeVisible();
    await expect(warning).toHaveText(englishText("length.warning"));
    await expect.poll(() => liveHistory(page)).toContain(englishText("length.warning"));
    await page.keyboard.press("ArrowRight");
    await expect.poll(async () => (await readState(page)).length).toBe(12);
    await expect(warning).toHaveCount(0);
  });
});

test.describe("FR-62 character sets", () => {
  test("FR-62 all four sets are on by default and the UI does not let the user turn off the last set", async ({
    page,
  }) => {
    await openPlayground(page, { mode: "characters" });
    expect((await readState(page)).charsets).toEqual(["lower", "upper", "digits", "symbols"]);
    const boxes = part(page, "charset");
    await expect(boxes).toHaveCount(4);
    for (const index of [0, 1, 2]) {
      await boxes.nth(index).click();
      await expect.poll(async () => (await readState(page)).charsets.length).toBe(3 - index);
    }
    expect((await readState(page)).charsets).toEqual(["symbols"]);
    // The last set cannot be turned off.
    await expect(boxes.nth(3)).toHaveJSProperty("disabled", true);
    await boxes.nth(3).click({ force: true });
    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
    expect((await readState(page)).charsets).toEqual(["symbols"]);
    // The password has symbols only.
    expect(await readPassword(page)).toMatch(/^[!#$%&*+\-=?@^_~:;]{20}$/);
  });

  test("FR-62 all characters of 15 option sets come from the selected sets", async ({ page }) => {
    await openPlayground(page, { mode: "characters" });
    for (let mask = 1; mask < 16; mask++) {
      const chosen = SET_NAMES.filter((_, i) => mask & (1 << i));
      await setProperty(page, "charsets", chosen);
      const allowed = new Set(chosen.flatMap((name) => [...SETS[name]]));
      const passwords = await generateMany(page, 400);
      for (const password of passwords) {
        expect(password).toHaveLength(20);
        for (const character of password) {
          if (!allowed.has(character)) {
            throw new Error(
              `"${character}" in "${password}" is not in the sets ${chosen.join(",")}`,
            );
          }
        }
      }
    }
  });
});

test.describe("FR-63 all selected sets are present", () => {
  test("FR-63 10,000 passwords with the four real sets contain each set", async ({ page }) => {
    await openPlayground(page, { mode: "characters", length: "8" });
    const passwords = await generateMany(page, 10_000);
    const missing = passwords.filter((password) =>
      SET_NAMES.some((name) => ![...password].some((character) => SETS[name].includes(character))),
    );
    expect(missing).toEqual([]);
  });

  test("FR-63 every combination of 2 and 3 sets gives passwords that contain every selected set", async ({
    page,
  }) => {
    await openPlayground(page, { mode: "characters", length: "8" });
    for (let mask = 1; mask < 16; mask++) {
      const chosen = SET_NAMES.filter((_, i) => mask & (1 << i));
      await setProperty(page, "charsets", chosen);
      const passwords = await generateMany(page, 1000);
      for (const password of passwords) {
        for (const name of chosen) {
          if (![...password].some((character) => SETS[name].includes(character))) {
            throw new Error(`"${password}" has no character of ${name}`);
          }
        }
      }
    }
  });
});

test.describe("FR-64 avoid similar characters", () => {
  test("FR-64 10,000 passwords with the option on and all four sets contain none of 0 O 1 l I", async ({
    page,
  }) => {
    await openPlayground(page, { mode: "characters", length: "20", "avoid-similar": "true" });
    const passwords = await generateMany(page, 10_000);
    expect(passwords.filter((password) => /[0O1lI]/.test(password))).toEqual([]);
    // Every other character of the sets still appears: the option removes only these five.
    const seen = new Set(passwords.join(""));
    for (const character of "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!#$%&*+-=?@^_~:;") {
      expect(seen.has(character), character).toBe(true);
    }
  });

  test("FR-64 the entropy is the value of Appendix A.2 for the sizes 25, 24, 8 and 16", async ({
    page,
  }) => {
    await openPlayground(page, { mode: "characters", length: "20", "avoid-similar": "true" });
    const text = (await page.locator("#entropy").textContent()) ?? "";
    const bits = Number(/([\d.]+)/.exec(text)?.[1]);
    expect(Math.abs(bits - characterEntropy(20, [25, 24, 8, 16]))).toBeLessThanOrEqual(0.05);
    await part(page, "avoid-similar").click();
    await expect.poll(async () => (await readState(page)).avoidSimilar).toBe(false);
    const normal = Number(
      /([\d.]+)/.exec((await page.locator("#entropy").textContent()) ?? "")?.[1],
    );
    expect(Math.abs(normal - characterEntropy(20, [26, 26, 10, 16]))).toBeLessThanOrEqual(0.05);
    expect(normal).toBeGreaterThan(bits);
  });
});

test.describe("FR-66 no same character twice in a row (character mode)", () => {
  test("FR-66 with no-repeat on, 1,000 character passwords have no character twice in a row and the entropy is 125.0 bits", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openPlayground(page, { mode: "characters", length: "20", "no-repeat": "true" });
    // Appendix A.2: 20 characters, all four sets, no-repeat give 125.02 bits.
    const shown = (await page.locator("#entropy").textContent()) ?? "";
    expect(Math.abs(Number(/([\d.]+)/.exec(shown)?.[1]) - 125.02)).toBeLessThanOrEqual(0.05);
    const passwords = await generateMany(page, 1000);
    expect(passwords).toHaveLength(1000);
    for (const password of passwords) {
      expect(password, password).not.toMatch(/(.)\1/i);
    }
  });
});

// --- FR-65: SR-1, SR-2, SR-3 in both modes --------------------------------------------------

async function srOneAndTwo(page: Page, mode: "words" | "characters"): Promise<void> {
  await seedRandom(page);
  await countRandom(page);
  if (mode === "words") {
    await openPlayground(page, {
      language: "en-US",
      separator: "space",
      capitalization: "lower",
    });
    const size = readWordlist("en-US", false).length;
    const index = new Map(readWordlist("en-US", false).map((word, i) => [word, i]));
    const before = await randomCounts(page);
    const passwords = await generateManyWords(page, 40_000);
    const after = await randomCounts(page);
    // SR-1: random numbers come from crypto.getRandomValues, never from Math.random.
    expect(after.crypto).toBeGreaterThan(before.crypto);
    expect(after.math).toBe(before.math);
    // SR-2: the words are not biased (100 bins of the list, 200,000 words).
    const bins = new Array<number>(100).fill(0);
    for (const words of passwords) {
      for (const word of words) {
        bins[Math.floor(((index.get(word) ?? 0) * 100) / size)] =
          (bins[Math.floor(((index.get(word) ?? 0) * 100) / size)] ?? 0) + 1;
      }
    }
    const result = chiSquareUniform(bins);
    expect(result.p, `chi-square ${result.statistic.toFixed(1)}, df ${result.df}`).toBeGreaterThan(
      0.001,
    );
  } else {
    await openPlayground(page, { mode: "characters", length: "8", charsets: "digits" });
    const before = await randomCounts(page);
    const passwords = await generateMany(page, 12_500);
    const after = await randomCounts(page);
    expect(after.crypto).toBeGreaterThan(before.crypto);
    expect(after.math).toBe(before.math);
    // SR-2: the 100,000 digits are not biased.
    const counts = new Array<number>(10).fill(0);
    for (const password of passwords) {
      for (const digit of password) counts[Number(digit)] = (counts[Number(digit)] ?? 0) + 1;
    }
    const result = chiSquareUniform(counts);
    expect(result.p, `chi-square ${result.statistic.toFixed(1)}, df ${result.df}`).toBeGreaterThan(
      0.001,
    );
  }
}

test.describe("FR-65 security of character mode", () => {
  for (const mode of ["words", "characters"] as const) {
    test(`FR-65 SR-1, SR-2 and SR-3 hold in ${mode} mode`, async ({ page, browser }) => {
      test.setTimeout(180_000);
      // SR-1 and SR-2.
      await srOneAndTwo(page, mode);
      // SR-3: without crypto.getRandomValues there is an error and no password.
      const context = await browser.newContext();
      const broken = await context.newPage();
      await removeRandom(broken);
      await openPlayground(
        broken,
        mode === "words" ? { language: "en-US" } : { mode: "characters" },
        {
          waitForPassword: false,
        },
      );
      await expect(broken.locator("#error")).toBeVisible();
      await expect(broken.locator("#error")).toHaveText(englishText("error.noRandom"));
      await expect(broken.locator("#strength-label")).toHaveCount(0);
      await context.close();
    });
  }
});
