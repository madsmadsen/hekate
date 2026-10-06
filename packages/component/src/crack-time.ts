// FR-21: shows the time to crack. The number of seconds comes from the WASM module.
import type { Translator } from "./messages.ts";

type Unit = "second" | "minute" | "hour" | "day" | "year";

// A year is 365.25 days.
const UNITS: ReadonlyArray<readonly [Unit, number]> = [
  ["second", 1],
  ["minute", 60],
  ["hour", 3600],
  ["day", 86_400],
  ["year", 31_557_600],
];

const TWO_DIGITS = 2;

function unitFormat(value: number, unit: Unit, locale: string): string {
  // Very large numbers of years would not fit in a narrow box. 1.4 million is short.
  const notation =
    unit === "year" && value >= 1e12
      ? "scientific"
      : unit === "year" && value >= 1e6
        ? "compact"
        : "standard";
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit,
    unitDisplay: "long",
    maximumSignificantDigits: TWO_DIGITS,
    notation,
    compactDisplay: "long",
  }).format(value);
}

function round2(value: number): number {
  return Number(value.toPrecision(TWO_DIGITS));
}

/**
 * Two significant digits, a `~` prefix (from the message), and the largest unit
 * that gives a value of 1 or more. Less than 1 second gives "less than 1 second".
 */
export function formatCrackTime(seconds: number, locale: string, t: Translator): string {
  if (!(seconds >= 1)) {
    return t("crack.lessThan", { value: unitFormat(1, "second", locale) });
  }
  let index = 0;
  for (let i = 1; i < UNITS.length; i++) {
    if (seconds >= (UNITS[i] as readonly [Unit, number])[1]) index = i;
  }
  // 59.6 seconds rounds to 60. That is 1 minute, so use the next unit.
  const next = UNITS[index + 1];
  const current = UNITS[index] as readonly [Unit, number];
  if (next !== undefined && round2(seconds / current[1]) >= next[1] / current[1]) index += 1;
  const [unit, size] = UNITS[index] as readonly [Unit, number];
  // After a bump the value can be 0.99. It is shown as 1.
  return t("crack.approx", { value: unitFormat(Math.max(1, seconds / size), unit, locale) });
}
