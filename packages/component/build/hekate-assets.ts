// Build-time data for the component script (one file, SR-13):
//  - virtual:hekate-build      version, commit, SHA-384 (SRI) values of the WASM module and the locales
//  - virtual:hekate-manifests  the manifests of all word lists (FR-30, language names of FR-1)
//  - virtual:hekate-theme      the Web Awesome theme CSS, made for a shadow root (8.1)
// It also fixes three things in third-party code and copies the WASM module and the
// translation files next to the script.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { transformWithEsbuild, type Plugin } from "vite";
import { makeRenamer, webAwesomeDist, webAwesomeTags } from "./wa-rename.ts";

const VIRTUAL = ["virtual:hekate-build", "virtual:hekate-manifests", "virtual:hekate-theme"];

const MANIFEST_KEYS = [
  "code",
  "name",
  "words",
  "ascii_words",
  "ascii_same",
  "entropy_per_word",
  "entropy_per_word_ascii",
  "s",
  "r",
  "sources",
  "changed_note",
  "sha256",
  "build",
] as const;

export interface AssetsOptions {
  /** The folder of the package (packages/component). */
  root: string;
  /** Fail when the WASM module is missing. Unit tests do not need it. */
  strict: boolean;
  /** The folder with the word lists. The default is wordlists/ of the repository. */
  wordlists?: string;
  /** Add test/pseudo-locale.json to the locales (as `qps`). The environment value HEKATE_PSEUDO=1 does the same. */
  pseudo?: boolean;
}

export function sri(bytes: Uint8Array): string {
  return `sha384-${createHash("sha384").update(bytes).digest("base64")}`;
}

function readManifests(wordlistsDir: string, warn: (message: string) => void): unknown[] {
  if (!existsSync(wordlistsDir)) return [];
  const manifests: Array<{ code: string }> = [];
  for (const entry of readdirSync(wordlistsDir, { withFileTypes: true })) {
    const file = join(wordlistsDir, entry.name, "manifest.json");
    if (!entry.isDirectory() || !existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const missing = MANIFEST_KEYS.filter((key) => !(key in manifest));
    if (missing.length > 0) throw new Error(`${file} has no key: ${missing.join(", ")}`);
    manifests.push(manifest as { code: string });
  }
  manifests.sort((a, b) => a.code.localeCompare(b.code));
  if (manifests.length === 0) warn(`No word list manifests found in ${wordlistsDir}.`);
  return manifests;
}

/** Locale files (not English) that the component loads from the asset host. */
function readLocales(root: string, pseudo: boolean): Array<{ locale: string; bytes: Buffer }> {
  const found: Array<{ locale: string; bytes: Buffer }> = [];
  const dir = join(root, "locales");
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json") || name === "en.json") continue;
    found.push({ locale: name.slice(0, -5), bytes: readFileSync(join(dir, name)) });
  }
  // The pseudo-locale is for tests only. It ships only when asked for.
  const pseudoFile = join(root, "test/pseudo-locale.json");
  if (pseudo) {
    if (!existsSync(pseudoFile))
      throw new Error("Run `pnpm --filter @hekate/component pseudo` first.");
    found.push({ locale: "qps", bytes: readFileSync(pseudoFile) });
  }
  return found;
}

function themeCss(rename: (code: string) => string): string {
  const styles = join(webAwesomeDist(), "styles");
  const seen = new Set<string>();
  const inline = (file: string): string => {
    if (seen.has(file)) return "";
    seen.add(file);
    // layers.css also has rules for <wa-page>. Only the layer order is needed.
    if (file.endsWith("layers.css"))
      return readFileSync(file, "utf8").match(/@layer [^;]+;/)?.[0] ?? "";
    return readFileSync(file, "utf8").replace(/@import url\('([^']+)'\);?/g, (_m, path: string) =>
      inline(resolve(dirname(file), path)),
    );
  };
  let css = inline(join(styles, "themes/default.css"));
  // In a shadow root there is no `:root`. The host element takes its place.
  css = css.replaceAll(":where(:root)", ":host");
  // This rule is for pages with <wa-page>. The component does not use it.
  css = css.replace(/:is\(html, body\):has\(wa-page\) \{[^}]*\}/, "");
  if (css.includes("wa-page"))
    throw new Error("Web Awesome theme changed. Update build/hekate-assets.ts.");
  return rename(css);
}

const NANOID_IMPORT = 'import { nanoid } from "nanoid";';

const STYLE_MAP_IMPORT = JSON.stringify("lit/directives/style-map.js");

const WA_ICON_STUBS: Array<{ marker: string; code: (icons: string) => string }> = [
  {
    marker: "// src/components/icon/library.default.ts",
    code: (icons) =>
      `import { defaultLibrary } from ${JSON.stringify(icons)};\n` +
      `export const getIconFolder = () => "";\n` +
      `export const library_default_default = defaultLibrary;\n`,
  },
  {
    marker: "// src/components/icon/library.system.ts",
    code: (icons) =>
      `import { systemLibrary } from ${JSON.stringify(icons)};\n` +
      `export const icons = {};\n` +
      `export const library_system_default = systemLibrary;\n`,
  },
];

export function hekateAssets(options: AssetsOptions): Plugin {
  const { root, strict } = options;
  const wordlists = resolve(
    options.wordlists ?? process.env.HEKATE_WORDLISTS_DIR ?? join(root, "../../wordlists"),
  );
  const pseudo = options.pseudo ?? process.env.HEKATE_PSEUDO === "1";
  const wasmFile = join(root, "wasm/hekate.wasm");
  const iconsModule = join(root, "src/icons/library.ts");
  const styleMapModule = join(root, "src/csp-style-map.ts");
  const rename = makeRenamer(webAwesomeTags());
  let locales: Array<{ locale: string; bytes: Buffer }> = [];
  let wasm: Buffer | null = null;

  return {
    name: "hekate-assets",
    enforce: "pre",
    buildStart() {
      locales = readLocales(root, pseudo);
      wasm = existsSync(wasmFile) ? readFileSync(wasmFile) : null;
      if (strict && !wasm) {
        this.error(`${wasmFile} is missing. Run \`cargo xtask wasm\` first.`);
      }
    },
    resolveId(id) {
      return VIRTUAL.includes(id) ? `\0${id}` : null;
    },
    load(id) {
      if (id === "\0virtual:hekate-build") {
        const localeSri = Object.fromEntries(locales.map((l) => [l.locale, sri(l.bytes)]));
        return (
          `export const VERSION = ${JSON.stringify(process.env.HEKATE_VERSION ?? "dev")};\n` +
          `export const COMMIT = ${JSON.stringify(process.env.HEKATE_COMMIT ?? "dev")};\n` +
          `export const WASM_SRI = ${JSON.stringify(wasm ? sri(wasm) : "")};\n` +
          `export const LOCALE_SRI = ${JSON.stringify(localeSri)};\n`
        );
      }
      if (id === "\0virtual:hekate-manifests") {
        const manifests = readManifests(wordlists, (m) => this.warn(m));
        return `export default ${JSON.stringify(manifests)};\n`;
      }
      if (id === "\0virtual:hekate-theme") {
        return transformWithEsbuild(themeCss(rename), "theme.css", {
          loader: "css",
          minify: true,
        }).then((out) => `export default ${JSON.stringify(out.code)};\n`);
      }
      return null;
    },
    transform(code, id) {
      const file = id.split("?")[0] ?? id;
      // The generated binding file would give the WASM location to Vite as an asset.
      // The component always gives its own `fetch` response (with SRI), so remove it.
      if (file.endsWith("/wasm/hekate_wasm.js")) {
        const from = "new URL('hekate_wasm_bg.wasm', import.meta.url)";
        if (!code.includes(from))
          this.error("wasm-bindgen output changed. Update build/hekate-assets.ts.");
        return {
          code: code.replace(from, "(() => { throw new Error('The WASM source is missing.'); })()"),
          map: null,
        };
      }
      // SR-7: Web Awesome icon libraries fetch icons. Hekate uses its own.
      if (file.includes("/@awesome.me/webawesome/dist/chunks/")) {
        for (const stub of WA_ICON_STUBS) {
          if (code.includes(stub.marker)) return { code: stub.code(iconsModule), map: null };
        }
        // Web Awesome makes element ids with `nanoid`, which calls `crypto.getRandomValues`. When
        // that function is missing, defining the elements would fail (SR-3 needs an error message
        // instead). An id only has to be unique, so a counter is enough.
        if (code.includes(NANOID_IMPORT)) {
          const counter = "const nanoid = ((count) => () => `n${(++count).toString(36)}`)(0);";
          return { code: code.replace(NANOID_IMPORT, counter), map: null };
        }
        // SR-6: the Lit styleMap writes a style attribute on the first render. See src/csp-style-map.ts.
        if (code.includes(STYLE_MAP_IMPORT)) {
          return {
            code: code.replaceAll(STYLE_MAP_IMPORT, JSON.stringify(styleMapModule)),
            map: null,
          };
        }
      }
      return null;
    },
    generateBundle() {
      if (wasm) this.emitFile({ type: "asset", fileName: "hekate.wasm", source: wasm });
      for (const l of locales) {
        this.emitFile({ type: "asset", fileName: `locales/${l.locale}.json`, source: l.bytes });
      }
    },
  };
}
