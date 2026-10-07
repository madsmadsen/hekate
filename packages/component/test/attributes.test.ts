import { describe, expect, test, vi } from "vitest";
import {
  DEFAULTS,
  CAPITALIZATIONS,
  MODES,
  SEPARATORS,
  THEMES,
  intRange,
  languageParser,
  oneOf,
  parseAssetsUrl,
  parseBoolean,
  parseCharsets,
  readAttribute,
} from "../src/attributes.ts";
import { LANGUAGE_CODES } from "../src/language.ts";

describe("FR-42 attribute values", () => {
  test("FR-42 words accepts 3 and 10 and refuses 2 and 11", () => {
    const parse = intRange(3, 10);
    expect([parse("3"), parse("10")]).toEqual([3, 10]);
    expect([parse("2"), parse("11")]).toEqual([undefined, undefined]);
  });

  test("FR-42 length accepts 8 and 64 and refuses 7 and 65", () => {
    const parse = intRange(8, 64);
    expect([parse("8"), parse("64")]).toEqual([8, 64]);
    expect([parse("7"), parse("65")]).toEqual([undefined, undefined]);
  });

  test("FR-42 an integer attribute refuses text that is not a whole number", () => {
    const parse = intRange(3, 10);
    for (const text of ["5.5", "abc", "", " 5", "5e0", "-5", "+5", "0x5"]) {
      expect(parse(text), text).toBeUndefined();
    }
  });

  test("FR-42 each enumerated attribute accepts all allowed values in any case", () => {
    for (const [allowed, parse] of [
      [MODES, oneOf(MODES)],
      [SEPARATORS, oneOf(SEPARATORS)],
      [CAPITALIZATIONS, oneOf(CAPITALIZATIONS)],
      [THEMES, oneOf(THEMES)],
    ] as const) {
      for (const value of allowed) {
        expect(parse(value)).toBe(value);
        expect(parse(value.toUpperCase())).toBe(value);
      }
      expect(parse("bogus")).toBeUndefined();
    }
  });

  test("FR-42 boolean attributes accept true and false only", () => {
    expect([parseBoolean("true"), parseBoolean("FALSE")]).toEqual([true, false]);
    for (const text of ["", "yes", "1", "on"]) expect(parseBoolean(text), text).toBeUndefined();
  });

  test("FR-42 charsets accepts a list of one or more of the four sets", () => {
    expect(parseCharsets("lower,digits")).toEqual(["lower", "digits"]);
    expect(parseCharsets("digits, LOWER")).toEqual(["lower", "digits"]);
    expect(parseCharsets("symbols")).toEqual(["symbols"]);
    for (const text of ["", "lower,", "lower,other", "all"])
      expect(parseCharsets(text), text).toBeUndefined();
  });

  test("FR-42 language accepts the codes of section 7.5 in any case, with the usual case in the result", () => {
    const parse = languageParser(LANGUAGE_CODES);
    expect(parse("pt-br")).toBe("pt-BR");
    expect(parse("DE")).toBe("de");
    expect(parse("xx")).toBeUndefined();
    expect(languageParser(["de"])("fr-FR")).toBeUndefined();
  });

  test("FR-42 assets-url accepts https, and http only on localhost", () => {
    expect(parseAssetsUrl("https://assets.example.com/1/")).toBe("https://assets.example.com/1/");
    expect(parseAssetsUrl("https://assets.example.com/1")).toBe("https://assets.example.com/1/");
    expect(parseAssetsUrl("http://localhost:18081/x/")).toBe("http://localhost:18081/x/");
    for (const text of [
      "http://example.com/",
      "/relative/",
      "ftp://example.com/",
      "javascript:alert(1)",
      "https://u:p@example.com/",
      "https://example.com/?q=1",
      "",
    ]) {
      expect(parseAssetsUrl(text), text).toBeUndefined();
    }
  });

  test("FR-42 a value that is not valid gives the default and one warning", () => {
    const warn = vi.fn();
    expect(readAttribute("words", "11", intRange(3, 10), DEFAULTS.words, warn)).toBe(5);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('"words"');
  });

  test("FR-42 an allowed value is used and gives no warning", () => {
    const warn = vi.fn();
    expect(readAttribute("words", "10", intRange(3, 10), DEFAULTS.words, warn)).toBe(10);
    expect(warn).not.toHaveBeenCalled();
  });

  test("FR-42 a missing attribute gives the default and no warning", () => {
    const warn = vi.fn();
    expect(readAttribute("words", null, intRange(3, 10), DEFAULTS.words, warn)).toBe(5);
    expect(warn).not.toHaveBeenCalled();
  });

  test("FR-42 the defaults are the defaults of table 5.2", () => {
    expect(DEFAULTS).toMatchObject({
      mode: "words",
      words: 5,
      separator: "none",
      capitalization: "title",
      number: false,
      symbol: false,
      asciiOnly: false,
      length: 20,
      avoidSimilar: false,
      noRepeat: false,
      theme: "auto",
    });
    expect(DEFAULTS.charsets).toEqual(["lower", "upper", "digits", "symbols"]);
  });
});
