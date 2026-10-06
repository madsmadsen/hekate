import { describe, expect, test } from "vitest";
import { LANGUAGE_CODES, defaultLanguage, languageForTag } from "../src/language.ts";

// Table 5.1: every row of the table.
const ROWS: Array<[string, string]> = [
  ["en-gb", "en-GB"],
  ["en-ie", "en-GB"],
  ["en-au", "en-GB"],
  ["en-nz", "en-GB"],
  ["en-za", "en-GB"],
  ["en-in", "en-GB"],
  ["en", "en-US"],
  ["en-US", "en-US"],
  ["en-CA", "en-US"],
  ["de", "de"],
  ["de-AT", "de"],
  ["fr-ca", "fr-CA"],
  ["fr", "fr-FR"],
  ["fr-BE", "fr-FR"],
  ["es", "es"],
  ["es-MX", "es"],
  ["it", "it"],
  ["it-CH", "it"],
  ["pt-br", "pt-BR"],
  ["pt", "pt-PT"],
  ["pt-AO", "pt-PT"],
  ["nl", "nl"],
  ["nl-BE", "nl"],
  ["sv", "sv"],
  ["sv-FI", "sv"],
  ["no", "nb"],
  ["no-NO", "nb"],
  ["nb", "nb"],
  ["nb-NO", "nb"],
  ["da", "da"],
  ["da-DK", "da"],
  ["fi", "fi"],
  ["fi-FI", "fi"],
  ["pl", "pl"],
  ["pl-PL", "pl"],
];

describe("FR-2 table 5.1", () => {
  test.each(ROWS)("FR-2 %s selects %s", (tag, code) => {
    expect(languageForTag(tag)).toBe(code);
    expect(defaultLanguage([tag])).toBe(code);
  });

  test("FR-2 the match ignores uppercase and lowercase", () => {
    expect(defaultLanguage(["PT-BR"])).toBe("pt-BR");
    expect(defaultLanguage(["EN-gb"])).toBe("en-GB");
  });

  test("FR-2 the first entry that matches wins", () => {
    expect(defaultLanguage(["sv-SE", "en"])).toBe("sv");
  });

  test("FR-2 no match selects English (US)", () => {
    expect(defaultLanguage(["xx"])).toBe("en-US");
    expect(defaultLanguage([])).toBe("en-US");
  });

  test("FR-2 an entry that is not a language tag is skipped", () => {
    expect(defaultLanguage(["not a tag!", "de-AT"])).toBe("de");
    expect(languageForTag("")).toBeNull();
    expect(languageForTag("de_AT")).toBeNull();
  });

  test("FR-2 a language without a word list is skipped", () => {
    expect(defaultLanguage(["de", "fr"], ["en-US", "fr-FR"])).toBe("fr-FR");
  });

  test("FR-2 every language code of section 7.5 is a result of the table", () => {
    const results = new Set(ROWS.map(([, code]) => code));
    expect([...results].sort()).toEqual([...LANGUAGE_CODES].sort());
  });

  test("FR-2 a script subtag does not hide the region", () => {
    expect(languageForTag("en-Latn-GB")).toBe("en-GB");
  });
});
