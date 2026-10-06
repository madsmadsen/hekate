// FR-42: the start values come from the attributes of table 5.2.
// A value that is not valid gives the default and one warning in the console.
import { LANGUAGE_CODES } from "./language.ts";

export type Mode = "words" | "characters";
export type Separator = "none" | "-" | "." | "_" | "space";
export type Capitalization = "lower" | "title" | "random";
export type Charset = "lower" | "upper" | "digits" | "symbols";
export type Theme = "light" | "dark" | "auto";

export const MODES = ["words", "characters"] as const;
export const SEPARATORS = ["none", "-", ".", "_", "space"] as const;
export const CAPITALIZATIONS = ["lower", "title", "random"] as const;
export const CHARSETS = ["lower", "upper", "digits", "symbols"] as const;
export const THEMES = ["light", "dark", "auto"] as const;

export const WORDS_MIN = 3;
export const WORDS_MAX = 10;
export const LENGTH_MIN = 8;
export const LENGTH_MAX = 64;

export const DEFAULTS = {
  mode: "words" as Mode,
  words: 5,
  separator: "none" as Separator,
  capitalization: "title" as Capitalization,
  number: false,
  symbol: false,
  asciiOnly: false,
  length: 20,
  charsets: [...CHARSETS] as readonly Charset[],
  avoidSimilar: false,
  theme: "auto" as Theme,
};

/** A parser returns the value, or `undefined` when the text is not allowed. */
export type Parser<T> = (text: string) => T | undefined;

/** Picks one of the allowed values. Uppercase and lowercase do not matter. */
export function oneOf<T extends string>(allowed: readonly T[]): Parser<T> {
  return (text) => allowed.find((value) => value.toLowerCase() === text.toLowerCase());
}

export function intRange(min: number, max: number): Parser<number> {
  return (text) => {
    if (!/^\d+$/.test(text)) return undefined;
    const value = Number(text);
    return value >= min && value <= max ? value : undefined;
  };
}

export const parseBoolean: Parser<boolean> = (text) => {
  const lower = text.toLowerCase();
  return lower === "true" ? true : lower === "false" ? false : undefined;
};

/** A comma-separated list of one or more character sets, for example `lower,digits`. */
export const parseCharsets: Parser<readonly Charset[]> = (text) => {
  const parts = text.split(",").map((part) => part.trim().toLowerCase());
  const chosen = new Set<Charset>();
  for (const part of parts) {
    const found = CHARSETS.find((set) => set === part);
    if (found === undefined) return undefined;
    chosen.add(found);
  }
  // Keep a fixed order, so the same list always gives the same result.
  return CHARSETS.filter((set) => chosen.has(set));
};

/**
 * An absolute https URL of a folder. On `localhost` an http URL is also allowed.
 * The result always ends with `/`.
 */
export const parseAssetsUrl: Parser<string> = (text) => {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return undefined;
  }
  const local = url.protocol === "http:" && url.hostname === "localhost";
  if (url.protocol !== "https:" && !local) return undefined;
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "")
    return undefined;
  return url.href.endsWith("/") ? url.href : `${url.href}/`;
};

/** A language code of PRD 7.5 that has a word list. The result has the usual case, for example `pt-BR`. */
export function languageParser(available: readonly string[]): Parser<string> {
  const known = LANGUAGE_CODES.filter((code) => available.includes(code));
  return oneOf(known);
}

export function describeAllowed(name: string): string {
  switch (name) {
    case "words":
      return `a whole number from ${WORDS_MIN} to ${WORDS_MAX}`;
    case "length":
      return `a whole number from ${LENGTH_MIN} to ${LENGTH_MAX}`;
    case "mode":
      return MODES.join(", ");
    case "separator":
      return SEPARATORS.join(", ");
    case "capitalization":
      return CAPITALIZATIONS.join(", ");
    case "theme":
      return THEMES.join(", ");
    case "charsets":
      return `a comma-separated list of ${CHARSETS.join(", ")}`;
    case "number":
    case "symbol":
    case "ascii-only":
    case "avoid-similar":
      return "true or false";
    case "assets-url":
      return "an absolute https URL of a folder (http is allowed on localhost)";
    case "language":
      return "a language code of the word lists";
    case "ui-language":
      return "a locale code that has a message file";
    default:
      return "a valid value";
  }
}

/**
 * Reads one attribute. `null` means the attribute is not set: use the default, with no warning.
 * A value that is not valid gives the default and a warning.
 */
export function readAttribute<T>(
  name: string,
  raw: string | null,
  parse: Parser<T>,
  fallback: T,
  warn: (message: string) => void = (message) => console.warn(message),
): T {
  if (raw === null) return fallback;
  const value = parse(raw);
  if (value !== undefined) return value;
  warn(
    `Hekate: the "${name}" attribute must be ${describeAllowed(name)}. ` +
      `The value "${raw}" is not valid. Hekate uses the default.`,
  );
  return fallback;
}
