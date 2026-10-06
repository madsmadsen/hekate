import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const SRC = join(import.meta.dirname, "../src");

function sources(dir = SRC): Array<{ file: string; text: string }> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith(".ts")
      ? [{ file: path.slice(SRC.length + 1), text: readFileSync(path, "utf8") }]
      : [];
  });
}

/** The code of a file without comments, so a rule text in a comment is not a hit. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("SR-1 and SR-8 forbidden APIs", () => {
  const FORBIDDEN = [
    "Math.random",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "document.cookie",
    "serviceWorker",
    "caches.",
    "Date.now",
    "performance.now",
  ];

  test.each(FORBIDDEN)("SR-1 SR-8 the TypeScript code does not use %s", (api) => {
    const hits = sources()
      .filter(({ text }) => code(text).includes(api))
      .map(({ file }) => file);
    expect(hits).toEqual([]);
  });

  test("SR-8 the component writes no data to a URL, a log or an event", () => {
    const hits = sources()
      .filter(({ text }) =>
        /\bdispatchEvent\b|\bCustomEvent\b|history\.(push|replace)State|location\.(hash|search)\s*=/.test(
          code(text),
        ),
      )
      .map(({ file }) => file);
    expect(hits).toEqual([]);
  });
});

describe("SR-6 constructed stylesheets only", () => {
  test("SR-6 the code writes no <style> element", () => {
    const hits = sources()
      .filter(({ text }) => /<style\b|createElement\(\s*["']style["']\s*\)/.test(code(text)))
      .map(({ file }) => file);
    expect(hits).toEqual([]);
  });

  test("SR-6 the templates have no style attribute", () => {
    const hits = sources()
      .filter(({ text }) => /\sstyle=["$]|setAttribute\(\s*["']style["']/.test(code(text)))
      .map(({ file }) => file);
    expect(hits).toEqual([]);
  });

  test("SR-6 the styles are Lit static styles", () => {
    expect(readFileSync(join(SRC, "element.ts"), "utf8")).toContain(
      "static override styles = styles",
    );
  });
});

describe("SR-7 no icon or file from a CDN", () => {
  test("SR-7 the source has no URL of another server", () => {
    const hits = sources()
      .filter(({ text }) => /https?:\/\/(?!www\.w3\.org\/2000\/svg)/.test(code(text)))
      .map(({ file }) => file);
    expect(hits).toEqual([]);
  });
});

test("FR-70 the code has no UI text: every message key that the code uses is in en.json", () => {
  const english = JSON.parse(readFileSync(join(SRC, "../locales/en.json"), "utf8")) as Record<
    string,
    unknown
  >;
  const used = new Set<string>();
  for (const { text } of sources()) {
    for (const match of code(text).matchAll(/\bt\(\s*"([a-zA-Z.-]+)"/g))
      used.add(match[1] as string);
    for (const match of code(text).matchAll(
      /"((?:error|action|announce|mode|language|words|separator|capitalization|number|symbol|ascii|length|charsets?|avoidSimilar|strength|entropy|crack|password|credits)\.[a-zA-Z.-]+)"/g,
    )) {
      used.add(match[1] as string);
    }
  }
  const missing = [...used].filter((key) => !key.endsWith(".txt") && !(key in english));
  expect(missing).toEqual([]);
});
