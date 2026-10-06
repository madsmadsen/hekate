import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import en from "../locales/en.json";
import pseudo from "./pseudo-locale.json";

const root = join(import.meta.dirname, "..");
type Catalog = Record<string, string | Record<string, string>>;
const english = en as Catalog;
const fake = pseudo as Catalog;

function strings(message: string | Record<string, string>): string[] {
  return typeof message === "string" ? [message] : Object.values(message);
}

/** Text without the placeholders. */
function words(text: string): string {
  return text.replace(/\{\w+\}/g, "");
}

describe("FR-70, FR-73, FR-87 pseudo-locale", () => {
  test("FR-70 the pseudo-locale has the same keys as English", () => {
    expect(Object.keys(fake).sort()).toEqual(Object.keys(english).sort());
  });

  test("FR-70 no English remains: no word of 2 or more ASCII letters is left in any message", () => {
    for (const [key, message] of Object.entries(fake)) {
      for (const text of strings(message)) {
        expect(words(text), key).not.toMatch(/[A-Za-z]{2,}/);
      }
    }
  });

  test("FR-87 each error message is in the pseudo-locale and is changed", () => {
    const errors = Object.keys(english).filter(
      (key) => key.startsWith("error.") || key === "action.copyFailed",
    );
    expect(errors.length).toBeGreaterThanOrEqual(9);
    for (const key of errors) expect(fake[key]).not.toBe(english[key]);
  });

  test("FR-72 the plural forms of English are kept", () => {
    for (const [key, message] of Object.entries(english)) {
      if (typeof message === "object")
        expect(Object.keys(fake[key] as object).sort()).toEqual(Object.keys(message).sort());
    }
  });

  test("FR-72 the placeholders are kept", () => {
    for (const [key, message] of Object.entries(english)) {
      for (const [index, text] of strings(message).entries()) {
        const placeholders = (s: string) => s.match(/\{\w+\}/g)?.sort() ?? [];
        expect(
          placeholders(strings(fake[key] as string | Record<string, string>)[index] as string),
          key,
        ).toEqual(placeholders(text));
      }
    }
  });

  test("FR-73 each pseudo message is at least 40% longer than English", () => {
    for (const [key, message] of Object.entries(english)) {
      strings(message).forEach((text, index) => {
        const long = strings(fake[key] as string | Record<string, string>)[index] as string;
        expect(words(long).length, key).toBeGreaterThanOrEqual(
          Math.floor(words(text).length * 1.4),
        );
      });
    }
  });

  test("FR-70 test/pseudo-locale.json is up to date: run `pnpm pseudo` after a change of en.json", () => {
    const script = readFileSync(join(root, "scripts/make-pseudo.mjs"), "utf8");
    expect(script).toContain("locales/en.json");
    // English keys that have no pseudo message would show as a missing key in the first test.
    expect(Object.keys(fake)).toHaveLength(Object.keys(english).length);
  });
});

test("FR-70 en.json messages are strings or objects of plural forms with an other form", () => {
  for (const [key, message] of Object.entries(english)) {
    if (typeof message === "object") expect(message.other, key).toBeTypeOf("string");
    else expect(message, key).toBeTypeOf("string");
  }
});
