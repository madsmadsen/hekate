// Where the servers are and what the build contains.
// The tests need the servers of dev/ (PRD 9.1): http://localhost:18080 serves apps/demo/out,
// http://localhost:18081 serves dist/. Playwright does not start them.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(here, "../../..");
export const DEMO_ORIGIN = "http://localhost:18080";
export const ASSET_ORIGIN = "http://localhost:18081";

/** One source of a word list, as in `wordlists/<code>/manifest.json`. */
export interface ManifestSource {
  name: string;
  role: string;
  version: string;
  license: string;
  license_url: string;
  url: string;
  credit: string;
}

export interface Manifest {
  code: string;
  name: string;
  words: number;
  ascii_words: number;
  ascii_same: boolean;
  entropy_per_word: number;
  entropy_per_word_ascii: number;
  sources: ManifestSource[];
  changed_note: string;
  sha256: { words: string; words_ascii: string };
}

const distRoot = path.join(repoRoot, "dist");

function newestVersion(): string {
  if (process.env.HEKATE_VERSION) return process.env.HEKATE_VERSION;
  if (!existsSync(distRoot)) {
    throw new Error("dist/ does not exist. Run `cargo xtask dist` first.");
  }
  const versions = readdirSync(distRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const newest = versions.at(-1);
  if (!newest) throw new Error("dist/ has no version folder. Run `cargo xtask dist` first.");
  return newest;
}

/** The version in dist/, the same one that apps/demo/build.mjs puts into the demo pages. */
export const version = newestVersion();
export const versionDir = path.join(distRoot, version);
/** The folder of the component files on the asset host, with `/` at the end. */
export const assetsBase = `${ASSET_ORIGIN}/${version}/`;
export const scriptUrl = `${assetsBase}hekate.js`;

function readManifests(): Manifest[] {
  const dir = path.join(repoRoot, "wordlists");
  const found: Manifest[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name, "manifest.json");
    if (entry.isDirectory() && existsSync(file)) {
      found.push(JSON.parse(readFileSync(file, "utf8")) as Manifest);
    }
  }
  return found.sort((a, b) => a.code.localeCompare(b.code));
}

/** All languages. They come from `wordlists/*\/manifest.json`, never from a fixed list. */
export const manifests: Manifest[] = readManifests();
export const languageCodes: string[] = manifests.map((m) => m.code);

/** The words of a list in dist/, in file order. */
export function readWordlist(code: string, ascii: boolean): string[] {
  const file = path.join(versionDir, "wordlists", code, ascii ? "words-ascii.txt" : "words.txt");
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line !== "");
}

export function distFile(...parts: string[]): string {
  return path.join(versionDir, ...parts);
}

/** The translation files (not English) in dist/. */
export const distLocales: string[] = existsSync(path.join(versionDir, "locales"))
  ? readdirSync(path.join(versionDir, "locales"))
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.slice(0, -5))
      .sort()
  : [];

/** The pseudo-locale is in dist/ only when the build ran with HEKATE_PSEUDO=1. */
export const hasPseudoLocale = distLocales.includes("qps");

export const PSEUDO_HELP =
  "The build has no pseudo-locale. Build with `HEKATE_PSEUDO=1 cargo xtask dist` " +
  "(see tests/e2e/README.md).";

/** The English messages of the component, as a flat catalog. */
export const english = JSON.parse(
  readFileSync(path.join(repoRoot, "packages/component/locales/en.json"), "utf8"),
) as Record<string, string | Record<string, string>>;

/** The pseudo-locale file from the component tests (the same bytes that the build signs). */
export const pseudoFile = path.join(repoRoot, "packages/component/test/pseudo-locale.json");

export function englishText(key: string, count?: number): string {
  const message = english[key];
  if (message === undefined) throw new Error(`en.json has no message ${key}`);
  if (typeof message === "string") return message;
  const form = count === 1 ? "one" : "other";
  return message[form] ?? message.other ?? "";
}

/** The minimum CSP of the README (section "Minimum Content Security Policy"), for the demo hosts. */
export const README_CSP = `script-src 'self' 'wasm-unsafe-eval' ${ASSET_ORIGIN}; connect-src 'self' ${ASSET_ORIGIN}; style-src 'self'`;

/** The CSP of the demo page, from PRD section 6. nginx sends it on http://localhost:18080. */
export const DEMO_CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' http://localhost:18081; style-src 'self'; connect-src 'self' http://localhost:18081; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
