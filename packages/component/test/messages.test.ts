import { describe, expect, test, vi } from "vitest";
import en from "../locales/en.json";
import {
  createTranslator,
  defaultUiLocale,
  formatMessage,
  matchLocale,
  type Catalog,
} from "../src/messages.ts";
import { formatCrackTime } from "../src/crack-time.ts";

const english = en as Catalog;
const t = createTranslator(english, english, "en");

describe("FR-72 plurals and numbers", () => {
  const message = { one: "{count} word", other: "{count} words" };

  test("FR-72 1 word uses the one form and 5 words use the other form", () => {
    expect(formatMessage(message, { count: 1 }, "en")).toBe("1 word");
    expect(formatMessage(message, { count: 5 }, "en")).toBe("5 words");
  });

  test("FR-72 the pseudo-locale uses the plural rules of English", () => {
    expect(formatMessage({ one: "[a {count}]", other: "[b {count}]" }, { count: 1 }, "en")).toBe(
      "[a 1]",
    );
    expect(formatMessage({ one: "[a {count}]", other: "[b {count}]" }, { count: 5 }, "en")).toBe(
      "[b 5]",
    );
  });

  test("FR-72 with the UI language de, 64.6 bits shows as 64,6", () => {
    expect(formatMessage(english["entropy.value"] as never, { count: 64.6 }, "de")).toContain(
      "64,6",
    );
    expect(formatMessage(english["entropy.value"] as never, { count: 64.6 }, "en")).toContain(
      "64.6",
    );
  });

  test("FR-72 a placeholder with no value stays in the text", () => {
    expect(formatMessage("a {b}", {}, "en")).toBe("a {b}");
  });

  test("FR-72 a plural message without a form for the count uses other", () => {
    expect(formatMessage({ other: "x" }, { count: 1 }, "en")).toBe("x");
  });

  test("FR-72 a missing message is read from English", () => {
    const translate = createTranslator({}, english, "en");
    expect(translate("action.copied")).toBe("Copied");
  });

  test("FR-72 a message that does not exist gives the key and a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(createTranslator({}, {}, "en")("no.such.key")).toBe("no.such.key");
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("FR-21 time to crack", () => {
  test("FR-21 5 words from 7,776 words show ~45 years", () => {
    const bits = 5 * Math.log2(7776);
    const seconds = 2 ** (bits - 1) / 1e10;
    expect(formatCrackTime(seconds, "en", t)).toBe("~45 years");
  });

  test("FR-21 30 bits show less than 1 second", () => {
    expect(formatCrackTime(2 ** 29 / 1e10, "en", t)).toBe("less than 1 second");
  });

  test("FR-21 the largest unit that gives a value of 1 or more is used", () => {
    expect(formatCrackTime(1, "en", t)).toBe("~1 second");
    expect(formatCrackTime(30, "en", t)).toBe("~30 seconds");
    expect(formatCrackTime(90, "en", t)).toBe("~1.5 minutes");
    expect(formatCrackTime(7200, "en", t)).toBe("~2 hours");
    expect(formatCrackTime(3 * 86_400, "en", t)).toBe("~3 days");
    expect(formatCrackTime(400 * 86_400, "en", t)).toBe("~1.1 years");
  });

  test("FR-21 the value has 2 significant digits", () => {
    expect(formatCrackTime(123_456, "en", t)).toBe("~1.4 days");
  });

  test("FR-21 a value that rounds up to the next unit uses that unit", () => {
    expect(formatCrackTime(59.7, "en", t)).toBe("~1 minute");
  });

  test("FR-21 very large times stay short", () => {
    const text = formatCrackTime(2 ** 124 / 1e10, "en", t);
    expect(text.length).toBeLessThan(30);
    expect(text.startsWith("~")).toBe(true);
    expect(formatCrackTime(5e15, "en", t)).toContain("million");
  });

  test("FR-21 the note text is in the message file", () => {
    expect(t("crack.note")).toBe(
      "The time assumes an attacker who makes 10 billion guesses per second.",
    );
  });

  test("FR-72 the time uses Intl: with the UI language de the unit is German", () => {
    const de = createTranslator({ "crack.approx": "~{value}" }, english, "de");
    expect(formatCrackTime(2 ** 63.6 / 1e10, "de", de)).toBe("~44 Jahre");
  });
});

describe("FR-71 UI language", () => {
  const available = ["en", "de", "qps"];

  test("FR-71 the first entry with a translation is used", () => {
    expect(defaultUiLocale(["xx", "de-AT", "en"], available)).toBe("de");
  });

  test("FR-71 an entry matches by language, and ignores case", () => {
    expect(defaultUiLocale(["DE-ch"], available)).toBe("de");
    expect(matchLocale("QPS", available)).toBe("qps");
  });

  test("FR-71 English is used when no entry has a translation", () => {
    expect(defaultUiLocale(["xx", "yy"], available)).toBe("en");
    expect(defaultUiLocale([], available)).toBe("en");
  });

  test("FR-71 an English entry ends the search with English", () => {
    expect(defaultUiLocale(["en-GB", "de"], available)).toBe("en");
  });
});
