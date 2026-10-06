import { describe, expect, test } from "vitest";
import {
  DARK,
  LIGHT,
  TOKEN_FONT_WEIGHT,
  WORD_FONT_WEIGHT,
  type TokenColors,
} from "../src/theme-colors.ts";

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
}

describe("NFR-8 colors", () => {
  test.each([
    ["light", LIGHT],
    ["dark", DARK],
  ] as Array<[string, TokenColors]>)(
    "NFR-8 in the %s theme each colored text has a contrast ratio of 4.5:1 or more",
    (_name, colors) => {
      for (const key of ["text", "separator", "number", "symbol", "digit"] as const) {
        expect(contrast(colors[key], colors.surface), key).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  test("NFR-8 tokens differ from words in color and in font weight", () => {
    expect(TOKEN_FONT_WEIGHT).toBeGreaterThan(WORD_FONT_WEIGHT);
    for (const colors of [LIGHT, DARK]) {
      for (const key of ["separator", "number", "symbol"] as const) {
        expect(colors[key]).not.toBe(colors.text);
      }
    }
  });
});
