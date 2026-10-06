// FR-2: choose the default word list language from `navigator.languages` (table 5.1).

/** The 15 languages of PRD 7.5. */
export const LANGUAGE_CODES = [
  "en-US",
  "en-GB",
  "de",
  "fr-FR",
  "fr-CA",
  "es",
  "it",
  "pt-PT",
  "pt-BR",
  "nl",
  "sv",
  "nb",
  "da",
  "fi",
  "pl",
] as const;

export type LanguageCode = (typeof LANGUAGE_CODES)[number];

export const FALLBACK_LANGUAGE: LanguageCode = "en-US";

const BRITISH_REGIONS = new Set(["gb", "ie", "au", "nz", "za", "in"]);

// A language tag is letters and digits in groups of 1 to 8, joined by "-".
const TAG = /^[a-z]{2,3}(-[a-z0-9]{1,8})*$/;

/**
 * Maps one browser language value to a language code of table 5.1.
 * Returns `null` for a value that is not a language tag or that has no row.
 * The match ignores uppercase and lowercase.
 */
export function languageForTag(value: string): LanguageCode | null {
  const tag = value.trim().toLowerCase();
  if (!TAG.test(tag)) return null;
  const [primary = "", ...rest] = tag.split("-");
  // The region is the first part after the language that has 2 letters or 3 digits.
  const region = rest.find((part) => /^([a-z]{2}|\d{3})$/.test(part));
  switch (primary) {
    case "en":
      return region !== undefined && BRITISH_REGIONS.has(region) ? "en-GB" : "en-US";
    case "de":
      return "de";
    case "fr":
      return region === "ca" ? "fr-CA" : "fr-FR";
    case "es":
      return "es";
    case "it":
      return "it";
    case "pt":
      return region === "br" ? "pt-BR" : "pt-PT";
    case "nl":
      return "nl";
    case "sv":
      return "sv";
    case "no":
    case "nb":
      return "nb";
    case "da":
      return "da";
    case "fi":
      return "fi";
    case "pl":
      return "pl";
    default:
      return null;
  }
}

/**
 * Uses the first entry that has a row in table 5.1 and a word list.
 * Entries that do not match are skipped. If none match, uses English (US).
 */
export function defaultLanguage(
  languages: readonly string[],
  available: readonly string[] = LANGUAGE_CODES,
): string {
  for (const entry of languages) {
    const code = languageForTag(entry);
    if (code !== null && available.includes(code)) return code;
  }
  return available.includes(FALLBACK_LANGUAGE)
    ? FALLBACK_LANGUAGE
    : (available[0] ?? FALLBACK_LANGUAGE);
}
