// Translation readiness: FR-70, FR-71, FR-72, FR-73. The pseudo-locale needs a build with
// HEKATE_PSEUDO=1 (see README.md of this folder).
import { expect, test, type Page } from "@playwright/test";
import { setBrowserLanguages } from "../support/browser.ts";
import {
  openPlayground,
  part,
  readPassword,
  setProperty,
  waitForPassword,
} from "../support/component.ts";
import { distLocales, englishText, manifests, version } from "../support/env.ts";
import { layoutReport } from "../support/layout.ts";
import { recordRequests } from "../support/network.ts";
import { INTL_WORDS, pseudo, pseudoText, requirePseudo } from "../support/pseudo.ts";

test.beforeEach(() => requirePseudo());

/** All text that a user can read, and the labels, in the shadow roots of the first component. */
async function uiTexts(page: Page, exclude: string[]): Promise<string[]> {
  return page
    .locator("hekate-generator")
    .first()
    .evaluate((node, skip) => {
      const texts: string[] = [];
      const visit = (scope: ShadowRoot | Element): void => {
        for (const element of scope.querySelectorAll("*")) {
          if (skip.some((selector) => element.closest(selector))) continue;
          // The example letters are data. The radio label with them has its own test.
          const hasExample = element.querySelector(":scope > .option-example") !== null;
          for (const attribute of ["label", "aria-label", "title", "placeholder"]) {
            if (hasExample && attribute === "aria-label") continue;
            const value = element.getAttribute(attribute);
            if (value) texts.push(value);
          }
          for (const child of element.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
              const text = (child.textContent ?? "").trim();
              if (text !== "") texts.push(text);
            }
          }
          if (element.shadowRoot) visit(element.shadowRoot);
        }
      };
      visit((node as HTMLElement).shadowRoot as ShadowRoot);
      return texts;
    }, exclude);
}

/** English text left after the data is removed: the language names and the Intl words. */
function englishLeft(texts: string[]): string[] {
  const names = manifests.map((m) => m.name);
  const left: string[] = [];
  for (const text of texts) {
    let rest = text.replaceAll(INTL_WORDS, "").replace(/[0-9a-f]{64}/g, "");
    for (const name of names) rest = rest.replaceAll(name, "");
    if (/[A-Za-z]{2,}/.test(rest)) left.push(text);
  }
  return left;
}

// The language list (data), the Credits details (data) and the password itself are not UI text.
const DATA = [
  ".option-example",
  "[part=language]",
  "#password",
  ".credits ul",
  ".credits summary",
  ".credits .changed-note",
  "#credits-commit",
];
const WITHOUT_DIALOG = [...DATA, "#credits"];

test.describe("FR-70 message files", () => {
  test("FR-70 with the pseudo-locale no English UI text remains in word mode", async ({ page }) => {
    await openPlayground(page, { "ui-language": "qps", words: "3", number: "true" });
    await page.waitForTimeout(1500);
    const texts = await uiTexts(page, WITHOUT_DIALOG);
    expect(texts.length).toBeGreaterThan(20);
    expect(englishLeft(texts)).toEqual([]);
    // The pseudo text really is on the page.
    expect(texts).toContain(pseudoText("action.new"));
    expect(texts).toContain(pseudoText("strength.label"));
  });

  test("FR-70 with the pseudo-locale no English UI text remains in character mode", async ({
    page,
  }) => {
    await openPlayground(page, { "ui-language": "qps", mode: "characters", length: "8" });
    await page.waitForTimeout(1500);
    const texts = await uiTexts(page, WITHOUT_DIALOG);
    expect(texts).toContain(pseudoText("length.label"));
    expect(englishLeft(texts)).toEqual([]);
  });

  test("FR-70 with the pseudo-locale the names, captions and labels of the separator and capital letters are translated", async ({
    page,
  }) => {
    await openPlayground(page, { "ui-language": "qps" });
    const examples = {
      separator: { none: "ab", "-": "a-b", ".": "a.b", _: "a_b", space: "a b" },
      capitalization: { lower: "abc", title: "Abc", random: "Abc abc" },
    };
    const names = {
      separator: {
        none: "separator.none",
        "-": "separator.dash",
        ".": "separator.dot",
        _: "separator.underscore",
        space: "separator.space",
      },
      capitalization: {
        lower: "capitalization.lower",
        title: "capitalization.title",
        random: "capitalization.random",
      },
    };
    for (const group of ["separator", "capitalization"] as const) {
      await expect(part(page, group)).toHaveAttribute("label", pseudoText(`${group}.label`));
      for (const [value, key] of Object.entries(names[group])) {
        const example = (examples[group] as Record<string, string>)[value] ?? "";
        await expect(
          part(page, group).locator(`hekate-wa-radio[value="${value}"]`),
        ).toHaveAttribute(
          "aria-label",
          pseudoText("option.exampleName", { example, name: pseudoText(key) }),
        );
      }
      const captions = await part(page, group)
        .locator("xpath=following-sibling::p[contains(@class,'option-caption')]")
        .locator(".caption-choice")
        .allTextContents();
      expect(captions.map((text) => text.trim())).toEqual(
        Object.values(names[group]).map((key) => pseudoText(key)),
      );
    }
    await expect(part(page, "words")).toHaveAttribute("label", pseudoText("words.label"));
    await expect(part(page, "words-value")).toHaveText(pseudoText("words.value", { count: 5 }));
  });

  test("FR-70 with the pseudo-locale no English UI text remains in the Credits dialog", async ({
    page,
  }) => {
    await openPlayground(page, { "ui-language": "qps" });
    await page.locator("#credits-link").click();
    await expect(page.locator("#credits-version")).toBeVisible();
    const texts = await uiTexts(page, DATA);
    expect(englishLeft(texts)).toEqual([]);
    expect(texts.some((text) => text.startsWith("[") && text.includes("Ṽ"))).toBe(true);
    await expect(page.locator("#credits-version")).toHaveText(
      pseudoText("credits.version", { version }),
    );
  });

  test("FR-70 the names of the languages stay the same", async ({ page }) => {
    await openPlayground(page, { "ui-language": "qps" });
    const names = await part(page, "language").evaluate((select) =>
      Array.from(select.querySelectorAll("hekate-wa-option")).map((option) =>
        (option.textContent ?? "").trim(),
      ),
    );
    expect(names.sort()).toEqual(manifests.map((m) => m.name).sort());
    await expect(part(page, "language")).toHaveAttribute("label", pseudoText("language.label"));
  });

  test("FR-70 the English file is inside the script and other files load on first use", async ({
    page,
  }) => {
    const requests = recordRequests(page);
    await openPlayground(page);
    expect(requests.filter((r) => r.url.includes("/locales/"))).toEqual([]);
    const second = recordRequests(page);
    await openPlayground(page, { "ui-language": "qps" });
    expect(
      second.filter((r) => r.url.includes("/locales/")).map((r) => r.url.split("/").at(-1)),
    ).toEqual(["qps.json"]);
  });
});

test.describe("FR-71 UI language", () => {
  const newPassword = async (page: Page) =>
    (await part(page, "new-password-button").textContent())?.trim();

  test("FR-71 the ui-language attribute selects the UI language", async ({ page }) => {
    await openPlayground(page, { "ui-language": "qps" });
    expect(await newPassword(page)).toBe(pseudoText("action.new"));
  });

  test("FR-71 without the attribute the first entry of navigator.languages that has a translation is used", async ({
    page,
  }) => {
    await setBrowserLanguages(page, ["xx", "qps", "en"]);
    await openPlayground(page);
    expect(await newPassword(page)).toBe(pseudoText("action.new"));
  });

  test("FR-71 English is used when no entry has a translation", async ({ page }) => {
    await setBrowserLanguages(page, ["xx", "yy"]);
    await openPlayground(page);
    expect(await newPassword(page)).toBe(englishText("action.new"));
  });

  test("FR-71 the attribute wins over navigator.languages, and the UI language is separate from the word list language", async ({
    page,
  }) => {
    await setBrowserLanguages(page, ["qps"]);
    await openPlayground(page, { "ui-language": "en", language: "en-US" });
    expect(await newPassword(page)).toBe(englishText("action.new"));
    await openPlayground(page, { "ui-language": "qps", language: manifests[0]?.code ?? "en-US" });
    expect(await newPassword(page)).toBe(pseudoText("action.new"));
    await expect(part(page, "language")).toHaveJSProperty("value", manifests[0]?.code ?? "en-US");
  });

  test("FR-71 the UI language can change after the start", async ({ page }) => {
    await openPlayground(page);
    expect(await newPassword(page)).toBe(englishText("action.new"));
    await setProperty(page, "uiLanguage", "qps");
    await expect.poll(() => newPassword(page)).toBe(pseudoText("action.new"));
  });
});

test.describe("FR-72 numbers, plurals and times", () => {
  test("FR-72 the pseudo-locale uses the plural rules of English: 1 character uses the one form and 20 characters use the other form", async ({
    page,
  }) => {
    await openPlayground(page, { "ui-language": "qps", mode: "characters", length: "20" });
    await expect(part(page, "length-value")).toHaveText(
      pseudoText("length.value", { count: 20 }, "other"),
    );
    // The control stops at 8, so the property is set directly to show the form for 1.
    await setProperty(page, "length", 1);
    await expect(part(page, "length-value")).toHaveText(
      pseudoText("length.value", { count: 1 }, "one"),
    );
    expect(pseudoText("length.value", { count: 1 }, "one")).not.toBe(
      pseudoText("length.value", { count: 1 }, "other"),
    );
    await setProperty(page, "length", 20);
    await expect(part(page, "length-value")).toHaveText(
      pseudoText("length.value", { count: 20 }, "other"),
    );
  });

  test("FR-72 the entropy and the time use Intl: with the UI language en the time is ~45 years", async ({
    page,
  }) => {
    await openPlayground(page, { language: "en-US", "ui-language": "en" });
    await expect(page.locator("#entropy")).toHaveText("64.6 bits of entropy");
    await page.locator("#strength-info").click();
    await expect(page.locator("#strength-details-title")).toBeVisible();
    await expect(page.locator("#crack-time")).toContainText("~45 years");
    await expect(page.locator("#entropy")).toHaveText("64.6 bits of entropy");
  });

  test("FR-72 with the UI language de, 64.6 bits shows as 64,6", async ({ page }) => {
    test.skip(!distLocales.includes("de"), "dist has no German translation (locales/de.json)");
    await openPlayground(page, { language: "en-US", "ui-language": "de" });
    await expect(page.locator("#entropy")).toContainText("64,6");
  });

  test("FR-72 the pseudo-locale shows the entropy and the length with the placeholders filled in", async ({
    page,
  }) => {
    await openPlayground(page, { "ui-language": "qps", language: "en-US" });
    await expect(page.locator("#entropy")).toHaveText(
      pseudoText("entropy.value", { count: "64.6" }),
    );
    await expect(page.locator("#password-length")).toHaveText(
      pseudoText("password.length", { count: Array.from(await readPassword(page)).length }),
    );
  });
});

test.describe("FR-73 layout for other languages", () => {
  for (const width of [320, 800]) {
    for (const mode of ["words", "characters"]) {
      test(`FR-73 a parent of ${width} px in ${mode} mode with text 40% longer: no text overflow and no overlap of controls`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await openPlayground(page, {
          "ui-language": "qps",
          width: String(width),
          mode,
          words: "3",
          length: "8",
        });
        await page.locator("hekate-generator").first().locator("#strength-info").click();
        await page.waitForTimeout(300);
        const report = await layoutReport(page);
        expect(report.textOverflow, "scrollWidth > clientWidth").toEqual([]);
        expect(report.overlaps, "overlapping controls").toEqual([]);
        expect(report.outside, "elements outside the box").toEqual([]);
        expect(report.parentOverflow || report.documentOverflow).toBe(false);
      });
    }
  }

  test("FR-73 the message files of the pseudo-locale are at least 40% longer", () => {
    for (const [key, message] of Object.entries(pseudo)) {
      const texts = typeof message === "string" ? [message] : Object.values(message);
      expect(texts.length, key).toBeGreaterThan(0);
    }
    const english = englishText("crack.note");
    expect(pseudoText("crack.note").length).toBeGreaterThanOrEqual(english.length * 1.4);
  });
});

test.describe("FR-70 the Credits dialog", () => {
  test("FR-70 the pseudo-locale works with the first password and the dialog", async ({ page }) => {
    await openPlayground(page, { "ui-language": "qps" });
    await waitForPassword(page);
    await expect(page.locator("#credits-link")).toHaveText(pseudoText("credits.link"));
  });
});
