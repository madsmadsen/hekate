// The pseudo-locale (qps): a test language that changes all UI text (FR-70).
import { readFileSync } from "node:fs";
import { PSEUDO_HELP, hasPseudoLocale, pseudoFile } from "./env.ts";

type Catalog = Record<string, string | Record<string, string>>;

export const pseudo = JSON.parse(readFileSync(pseudoFile, "utf8")) as Catalog;

/** Fails the test with a clear message when the build has no pseudo-locale. */
export function requirePseudo(): void {
  if (!hasPseudoLocale) throw new Error(PSEUDO_HELP);
}

/** The pseudo message, with the placeholders filled in. A plural message uses `form`. */
export function pseudoText(
  key: string,
  params: Record<string, string | number> = {},
  form = "other",
): string {
  const message = pseudo[key];
  if (message === undefined) throw new Error(`no pseudo message ${key}`);
  const text = typeof message === "string" ? message : (message[form] ?? message.other ?? "");
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => String(params[name] ?? whole));
}

/** Words that `Intl` writes in English, also for the pseudo-locale (units of time). */
export const INTL_WORDS =
  /\b(?:seconds?|minutes?|hours?|days?|years?|thousand|million|billion|trillion|quadrillion|quintillion)\b/gi;
