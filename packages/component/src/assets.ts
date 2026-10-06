// FR-43, FR-44, SR-4, SR-13: where the files come from and how the component fetches them.
import { LOCALE_SRI, WASM_SRI } from "virtual:hekate-build";
import type { Catalog } from "./messages.ts";

/** The folder of this script, with a `/` at the end. FR-43 */
export function scriptFolder(): string {
  const url = import.meta.url;
  return url.slice(0, url.lastIndexOf("/") + 1);
}

/** The folder for all asset files: the `assets-url` attribute, or the folder of the script. */
export function assetsFolder(assetsUrl: string | undefined): string {
  return assetsUrl ?? scriptFolder();
}

export class AssetError extends Error {
  readonly kind: "http" | "network" | "integrity";
  constructor(kind: "http" | "network" | "integrity", url: string, detail: string) {
    super(`Hekate: could not load ${url} (${detail}).`);
    this.name = "AssetError";
    this.kind = kind;
  }
}

const REQUEST_BASE: RequestInit = {
  credentials: "omit",
  mode: "cors",
  referrerPolicy: "no-referrer",
};

async function load(url: string, integrity?: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, integrity ? { ...REQUEST_BASE, integrity } : REQUEST_BASE);
  } catch (error) {
    throw new AssetError("network", url, error instanceof Error ? error.message : "network error");
  }
  if (!response.ok) throw new AssetError("http", url, `HTTP ${response.status}`);
  return response;
}

/** The WASM module, loaded with its SRI value. SR-13 */
export function fetchWasm(folder: string): Promise<Response> {
  return load(`${folder}hekate.wasm`, WASM_SRI || undefined);
}

// FR-44: all components on a page share the word lists that are loaded or loading.
const wordlistRequests = new Map<string, Promise<Uint8Array>>();

export function wordlistUrl(folder: string, language: string, ascii: boolean): string {
  return `${folder}wordlists/${language}/${ascii ? "words-ascii.txt" : "words.txt"}`;
}

/**
 * Fetches a word list one time per page. A failed request is not kept,
 * so the "Try again" button (FR-80) sends it again.
 */
export function fetchWordlist(url: string): Promise<Uint8Array> {
  let request = wordlistRequests.get(url);
  if (request === undefined) {
    request = load(url)
      .then(async (response) => new Uint8Array(await response.arrayBuffer()))
      .catch((error: unknown) => {
        wordlistRequests.delete(url);
        throw error;
      });
    wordlistRequests.set(url, request);
  }
  return request;
}

/** Forgets the shared word lists. Tests use this. */
export function clearWordlistCache(): void {
  wordlistRequests.clear();
}

export class TranslationIntegrityError extends Error {
  constructor(locale: string) {
    super(`Hekate: the translation file for "${locale}" does not match its SRI value.`);
    this.name = "TranslationIntegrityError";
  }
}

/**
 * Fetches a translation file with its SRI value (FR-83).
 * - An HTTP error or a network error gives `null`. The caller uses English.
 * - A wrong SRI value throws `TranslationIntegrityError`.
 * A failed SRI check and a network error both reject the request, so after a rejection the
 * component asks again, without the SRI value, and ignores the body. If that works, the file is wrong.
 */
export async function fetchLocale(folder: string, locale: string): Promise<unknown | null> {
  const url = `${folder}locales/${locale}.json`;
  const integrity = LOCALE_SRI[locale];
  if (integrity === undefined) return null;
  try {
    const response = await load(url, integrity);
    return await response.json();
  } catch (error) {
    if (error instanceof AssetError && error.kind === "network") {
      try {
        const probe = await load(url);
        void probe.body?.cancel();
      } catch {
        console.warn(`${(error as Error).message} Hekate uses English.`);
        return null;
      }
      throw new TranslationIntegrityError(locale);
    }
    console.warn(`${(error as Error).message} Hekate uses English.`);
    return null;
  }
}

// FR-83: all components share the translation files that are loaded or loading.
const localeRequests = new Map<string, Promise<Catalog | null>>();

/** The message file of a locale, or `null` when it does not load. Fetched one time per page. */
export function loadLocale(folder: string, locale: string): Promise<Catalog | null> {
  let request = localeRequests.get(locale);
  if (request === undefined) {
    request = fetchLocale(folder, locale)
      .then((data) => (data !== null && typeof data === "object" ? (data as Catalog) : null))
      .catch((error: unknown) => {
        localeRequests.delete(locale);
        throw error;
      });
    localeRequests.set(locale, request);
  }
  return request;
}

/** Forgets the shared translation files. Tests use this. */
export function clearLocaleCache(): void {
  localeRequests.clear();
}
