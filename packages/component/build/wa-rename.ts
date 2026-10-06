// FR-50: give every Web Awesome element the prefix `hekate-wa-`.
//
// Web Awesome 3.14.0 ships as compiled JavaScript chunks. Each chunk holds the
// tag names inside plain strings: `customElement("wa-button")`, Lit templates
// (`<wa-icon>`), CSS selectors (`::slotted(wa-icon)`) and checks such as
// `closest("wa-radio-group")`. This plugin rewrites every one of them, so the
// bundle never defines a `wa-*` element. CSS custom properties (`--wa-*`) and
// CSS classes (`.wa-*`) are not element names and stay as they are.
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";

export const PREFIX = "hekate-wa-";

const require = createRequire(import.meta.url);

export function webAwesomeDist(): string {
  return join(dirname(require.resolve("@awesome.me/webawesome/package.json")), "dist");
}

/** All Web Awesome tag names, read from the component folders of the package. */
export function webAwesomeTags(): string[] {
  return readdirSync(join(webAwesomeDist(), "components"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `wa-${entry.name}`);
}

/**
 * A tag name is a tag name only when no word character, `.`, `#` or `-` comes
 * before it, and no word character or `-` comes after it. The longest names are
 * tried first, so `wa-radio-group` wins over `wa-radio`.
 */
export function makeRenamer(tags: string[]): (code: string) => string {
  const names = [...tags].sort((a, b) => b.length - a.length).map((t) => t.slice(3));
  const pattern = new RegExp(`(?<![\\w$.#-])wa-(${names.join("|")})(?![\\w-])`, "g");
  return (code) => code.replace(pattern, `${PREFIX}$1`);
}

const WA_FILE = /[\\/]@awesome\.me[\\/]webawesome[\\/]dist[\\/].+\.js$/;

export function waRename(): Plugin {
  const rename = makeRenamer(webAwesomeTags());
  return {
    name: "hekate-wa-rename",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0] ?? id;
      if (!WA_FILE.test(file)) return null;
      return { code: rename(code), map: null };
    },
    // Safety net: fail the build if a `wa-*` element could still be defined.
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== "chunk") continue;
        const defined = [
          ...chunk.code.matchAll(/customElements?\.define\(\s*["'`]([^"'`]+)["'`]/g),
          ...chunk.code.matchAll(/customElement\(\s*["'`]([^"'`]+)["'`]\)/g),
        ].map((m) => m[1] ?? "");
        const bad = defined.filter((name) => !name.startsWith("hekate-"));
        if (bad.length > 0) {
          this.error(`Bundle defines elements without the hekate- prefix: ${bad.join(", ")}`);
        }
        const left = chunk.code.match(/<\/?wa-[a-z-]+/g);
        if (left) {
          this.error(`Bundle still contains wa-* tags: ${[...new Set(left)].join(", ")}`);
        }
      }
    },
  };
}
