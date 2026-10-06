// FR-70 to FR-72: message files, plural forms and number formatting.
//
// A message is a string with `{placeholders}`, or an object of plural forms
// (`{ "one": "...", "other": "..." }`). The form comes from `Intl.PluralRules` and
// the `count` value. There is no ICU message syntax.

export type Message = string | Readonly<Record<string, string>>;
export type Catalog = Readonly<Record<string, Message>>;
export type Params = Readonly<Record<string, string | number>>;
export type Translator = (key: string, params?: Params) => string;

const PLACEHOLDER = /\{(\w+)\}/g;

export function formatMessage(message: Message, params: Params, locale: string): string {
  let text: string;
  if (typeof message === "string") {
    text = message;
  } else {
    const count = params.count;
    const form = typeof count === "number" ? new Intl.PluralRules(locale).select(count) : "other";
    text = message[form] ?? message.other ?? "";
  }
  const numbers = new Intl.NumberFormat(locale);
  return text.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];
    if (value === undefined) return whole;
    return typeof value === "number" ? numbers.format(value) : value;
  });
}

/** Builds `t(key, params)`. A key that is missing in `catalog` is read from `fallback`. */
export function createTranslator(catalog: Catalog, fallback: Catalog, locale: string): Translator {
  return (key, params = {}) => {
    const message = catalog[key] ?? fallback[key];
    if (message === undefined) {
      console.warn(`Hekate: the message "${key}" does not exist.`);
      return key;
    }
    return formatMessage(message, params, locale);
  };
}

function primarySubtag(tag: string): string {
  return tag.toLowerCase().split("-")[0] ?? "";
}

/** The locale from `available` that matches `tag`, or `null`. Exact match first, then the language part. */
export function matchLocale(tag: string, available: readonly string[]): string | null {
  const lower = tag.trim().toLowerCase();
  const exact = available.find((locale) => locale.toLowerCase() === lower);
  if (exact !== undefined) return exact;
  const primary = primarySubtag(lower);
  return available.find((locale) => primarySubtag(locale) === primary) ?? null;
}

/** FR-71: the UI language when the `ui-language` attribute is not set. */
export function defaultUiLocale(
  languages: readonly string[],
  available: readonly string[],
): string {
  for (const entry of languages) {
    const match = matchLocale(entry, available);
    if (match !== null) return match;
  }
  return "en";
}
