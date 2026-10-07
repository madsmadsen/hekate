// Word passwords: FR-1, FR-2, FR-3, FR-4, FR-10, FR-11, FR-12, NFR-6.
import { expect, test } from "@playwright/test";
import {
  generateMany,
  generateManyWords,
  openPlayground,
  part,
  readPassword,
  readState,
  selectedLanguage,
  waitForPassword,
  watchLiveRegion,
  liveHistory,
  wordsRadio,
} from "../support/component.ts";
import { instrumentWasm, setBrowserLanguages, wasmCalls } from "../support/browser.ts";
import { englishText, languageCodes, manifests, readWordlist } from "../support/env.ts";
import { wordEntropy } from "../support/maths.ts";
import { recordRequests, wordlistRequests } from "../support/network.ts";
import { FR2_LISTS, TABLE_5_1 } from "../support/table51.ts";

test.describe("FR-1 language", () => {
  test("FR-1 the manifests list at least one language", () => {
    expect(manifests.length).toBeGreaterThan(0);
  });

  for (const manifest of manifests) {
    test(`FR-1 ${manifest.code}: all words of 10,000 passwords are in the word list`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const list = new Set(readWordlist(manifest.code, false));
      expect(list.size).toBe(manifest.words);
      const requests = recordRequests(page);
      await openPlayground(page, {
        language: manifest.code,
        separator: "space",
        capitalization: "lower",
      });
      // The words come from the file of this language, and from no other file.
      expect(wordlistRequests(requests)).toEqual([
        expect.stringContaining(`/wordlists/${manifest.code}/words.txt`),
      ]);
      const passwords = await generateManyWords(page, 10_000);
      let count = 0;
      for (const words of passwords) {
        expect(words).toHaveLength(5);
        for (const word of words) {
          if (!list.has(word)) throw new Error(`"${word}" is not in the list of ${manifest.code}`);
          count++;
        }
      }
      expect(count).toBe(50_000);
    });
  }
});

test.describe("FR-2 default language", () => {
  for (const [value, code] of TABLE_5_1) {
    test(`FR-2 navigator.languages ["${value}"] selects ${code}`, async ({ page }) => {
      test.skip(!languageCodes.includes(code), `the word list ${code} is not in wordlists/ yet`);
      const requests = recordRequests(page);
      await setBrowserLanguages(page, [value]);
      await openPlayground(page);
      expect(await selectedLanguage(page)).toBe(code);
      expect(wordlistRequests(requests)).toEqual([
        expect.stringContaining(`/wordlists/${code}/words.txt`),
      ]);
    });

    test(`FR-2 the match ignores case: ["${value.toUpperCase()}"] selects ${code}`, async ({
      page,
    }) => {
      test.skip(!languageCodes.includes(code), `the word list ${code} is not in wordlists/ yet`);
      await setBrowserLanguages(page, [value.toUpperCase()]);
      await openPlayground(page);
      expect(await selectedLanguage(page)).toBe(code);
    });
  }

  for (const [values, code] of FR2_LISTS) {
    test(`FR-2 navigator.languages ${JSON.stringify(values)} selects ${code}`, async ({ page }) => {
      test.skip(!languageCodes.includes(code), `the word list ${code} is not in wordlists/ yet`);
      await setBrowserLanguages(page, values);
      await openPlayground(page);
      expect(await selectedLanguage(page)).toBe(code);
    });
  }

  test("FR-2 language=de selects German, whatever navigator.languages says", async ({ page }) => {
    test.skip(!languageCodes.includes("de"), "the word list de is not in wordlists/ yet");
    await setBrowserLanguages(page, ["fr-FR", "en"]);
    await openPlayground(page, { language: "de" });
    expect(await selectedLanguage(page)).toBe("de");
  });
});

test.describe("FR-3 number of words", () => {
  test("FR-3 the control is a group of 8 radio buttons with the values 3 to 10", async ({
    page,
  }) => {
    await openPlayground(page);
    expect(await readState(page)).toMatchObject({ words: 5 });
    const radios = part(page, "words").getByRole("radio");
    await expect(radios).toHaveCount(8);
    for (let index = 0; index < 8; index++) {
      await expect(radios.nth(index)).toHaveAccessibleName(String(index + 3));
    }
    await expect(wordsRadio(page, 5)).toBeChecked();
    await wordsRadio(page, 3).click();
    await expect.poll(async () => (await readState(page)).words).toBe(3);
    await expect(wordsRadio(page, 3)).toBeChecked();
    await wordsRadio(page, 10).click();
    await expect.poll(async () => (await readState(page)).words).toBe(10);
    await expect(wordsRadio(page, 10)).toBeChecked();
    expect((await readPassword(page)).match(/\p{Lu}/gu)).toHaveLength(10);
  });

  test("FR-3 with 3 words the warning shows, with 4 words it does not, and the live region announces it", async ({
    page,
  }) => {
    await openPlayground(page);
    await watchLiveRegion(page);
    const warning = page.locator("#words-warning");
    await expect(warning).toHaveCount(0);
    await wordsRadio(page, 3).click();
    await expect(warning).toBeVisible();
    await expect(warning).toHaveText(englishText("words.warning"));
    await expect.poll(() => liveHistory(page)).toContain(englishText("words.warning"));
    await wordsRadio(page, 4).click();
    await expect(warning).toHaveCount(0);
    expect((await readState(page)).words).toBe(4);
  });

  test("FR-3 the attribute words=3 shows the warning from the start", async ({ page }) => {
    await openPlayground(page, { words: "3" });
    await expect(page.locator("#words-warning")).toHaveText(englishText("words.warning"));
  });
});

test.describe("FR-11 keep the words", () => {
  test("FR-11 the separator, capital letters, number and symbol keep the words, and no call makes new words", async ({
    page,
  }) => {
    await instrumentWasm(page);
    await openPlayground(page, { language: "en-US" });
    const wordText = async () =>
      (await part(page, "token-word").allTextContents()).join("").toLowerCase();
    const named = async (name: string) =>
      (await wasmCalls(page)).filter((call) => call.name === name).length;
    const before = await wordText();
    expect(before).not.toBe("");
    expect(await named("drawWords")).toBe(1);
    const actions: Array<[string, () => Promise<void>]> = [
      ["separator", () => page.getByRole("radio", { name: "Hyphen (-)" }).click()],
      ["capital letters", () => page.getByRole("radio", { name: "Random" }).click()],
      ["number", () => part(page, "number").click()],
      ["symbol", () => part(page, "symbol").click()],
    ];
    let renders = await named("worddraw_render");
    for (const [label, action] of actions) {
      await action();
      renders += 1;
      await expect.poll(() => named("worddraw_render"), { message: label }).toBe(renders);
      expect(await wordText(), `${label}: the words stay`).toBe(before);
      expect(await named("drawWords"), `${label}: no new words`).toBe(1);
    }
    // The number and the symbol are now in the password.
    await expect(part(page, "token-number")).toHaveCount(1);
    await expect(part(page, "token-symbol")).toHaveCount(1);
  });
});

test.describe("FR-12 no same character twice in a row (word mode)", () => {
  test("FR-12 with no-repeat on, 1,000 word passwords have no character twice in a row", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openPlayground(page, {
      language: "en-US",
      "no-repeat": "true",
      number: "true",
      symbol: "true",
      separator: "-",
    });
    const passwords = await generateMany(page, 1000);
    expect(passwords).toHaveLength(1000);
    for (const password of passwords) {
      expect(password, password).not.toMatch(/(.)\1/i);
    }
  });
});

test.describe("FR-4 separator", () => {
  const separators: Array<[string, string]> = [
    ["none", ""],
    ["-", "-"],
    [".", "."],
    ["_", "_"],
    ["space", " "],
  ];

  for (const [name, character] of separators) {
    test(`FR-4 separator "${name}" is between all tokens`, async ({ page }) => {
      // The symbol can be the same character as the separator, so the test reads the parts.
      await openPlayground(page, {
        language: "en-US",
        separator: name,
        number: "true",
        symbol: "true",
      });
      for (let i = 0; i < 25; i++) {
        await part(page, "new-password-button").click();
        const runs = await page.locator("#password").evaluate((element) =>
          Array.from(element.children).map((child) => ({
            kind: child.getAttribute("part") ?? "",
            text: child.textContent ?? "",
          })),
        );
        if (character === "") {
          expect(runs.filter((run) => run.kind === "token-separator")).toEqual([]);
          continue;
        }
        // 5 words, 1 number and 1 symbol are 7 tokens. A separator is between each two tokens.
        const tokens = runs.filter((run) => run.kind !== "token-separator");
        expect(tokens).toHaveLength(7);
        runs.forEach((run, index) => {
          const isSeparator = run.kind === "token-separator";
          expect(isSeparator).toBe(index % 2 === 1);
          if (isSeparator) expect(run.text).toBe(character);
        });
        expect(runs.at(-1)?.kind).not.toBe("token-separator");
      }
    });
  }

  test("FR-4 the default is none and the default password is in PascalCase", async ({ page }) => {
    await openPlayground(page, { language: "en-US" });
    expect((await readState(page)).separator).toBe("none");
    const samples = await generateMany(page, 200);
    for (const password of samples) {
      expect(password).toMatch(/^(?:\p{Lu}\p{Ll}+){5}$/u);
    }
  });
});

test.describe("FR-10 ASCII-only option", () => {
  for (const manifest of manifests) {
    test(`FR-10 ${manifest.code}: the ASCII list has 4,096 words or more and all characters are printable ASCII`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const asciiList = readWordlist(manifest.code, true);
      expect(asciiList.length).toBeGreaterThanOrEqual(4096);
      expect(asciiList.length).toBe(manifest.ascii_words);
      const set = new Set(asciiList);
      await openPlayground(page, {
        language: manifest.code,
        "ascii-only": "true",
        separator: "space",
        capitalization: "lower",
      });
      const passwords = await generateManyWords(page, 3000);
      for (const words of passwords) {
        for (const word of words) {
          if (!set.has(word)) throw new Error(`"${word}" is not in the ASCII list`);
          expect(word).toMatch(/^[\x20-\x7e]+$/);
        }
      }
      const text = await readPassword(page);
      expect(text).toMatch(/^[\x20-\x7e]+$/);
      // The estimate uses the size of the ASCII list (Appendix A.1).
      const shown = await page.locator("#entropy").textContent();
      const bits = Number(/([\d.]+)/.exec(shown ?? "")?.[1]);
      const expected = wordEntropy({ size: asciiList.length, words: 5 });
      expect(Math.abs(bits - expected)).toBeLessThanOrEqual(0.06);
    });
  }
});

test.describe("NFR-6 NFC", () => {
  for (const manifest of manifests) {
    test(`NFR-6 ${manifest.code}: 10,000 passwords are all in NFC form`, async ({ page }) => {
      test.setTimeout(180_000);
      await openPlayground(page, {
        language: manifest.code,
        number: "true",
        symbol: "true",
        capitalization: "random",
      });
      const passwords = await generateMany(page, 10_000);
      let different = 0;
      for (const password of passwords) {
        if (password !== password.normalize("NFC")) different++;
      }
      expect(different).toBe(0);
      expect(passwords.every((password) => password.length > 0)).toBe(true);
    });
  }

  test("NFR-6 the first password after the start is in NFC form in every browser", async ({
    page,
  }) => {
    await openPlayground(page);
    const text = await readPassword(page);
    expect(text).toBe(text.normalize("NFC"));
    await waitForPassword(page);
  });
});
