import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { ATTRIBUTES, CSS_PROPERTIES, PARTS } from "../src/api.ts";

const root = join(import.meta.dirname, "..");
const readme = readFileSync(join(root, "API.md"), "utf8");

/** The backtick names in the bullet list under a heading. */
function listUnder(heading: string): string[] {
  const start = readme.indexOf(`## ${heading}`);
  const end = readme.indexOf("\n## ", start + 1);
  const section = readme.slice(start, end === -1 ? undefined : end);
  return [...section.matchAll(/^- `([^`]+)`/gm)].map((m) => m[1] as string);
}

describe("FR-47 the documented API is the code API", () => {
  test("FR-47 API.md lists the CSS custom properties of the code", () => {
    expect(listUnder("CSS custom properties").sort()).toEqual([...CSS_PROPERTIES].sort());
  });

  test("FR-47 API.md lists the parts of the code", () => {
    expect(listUnder("Parts").sort()).toEqual([...PARTS].sort());
  });

  test("FR-47 API.md lists the attributes of table 5.2", () => {
    const rows = [...readme.matchAll(/^\| `([a-z-]+)`\s*\|/gm)].map((m) => m[1] as string);
    expect(rows.sort()).toEqual([...ATTRIBUTES].sort());
  });

  test("FR-47 the code uses each custom property", () => {
    const styles = readFileSync(join(root, "src/styles.ts"), "utf8");
    for (const name of CSS_PROPERTIES) expect(styles, name).toContain(name);
  });

  test("FR-47 the code declares each part, except those that exist only in some states", () => {
    const element =
      readFileSync(join(root, "src/element.ts"), "utf8") +
      readFileSync(join(root, "src/tokens.ts"), "utf8");
    for (const name of PARTS) {
      const declared = element.includes(`part="${name}"`) || element.includes(`"${name}"`);
      expect(declared, name).toBe(true);
    }
  });

  test("FR-47 all names start with the right prefix", () => {
    for (const name of CSS_PROPERTIES) expect(name.startsWith("--hekate-")).toBe(true);
    expect(new Set(PARTS).size).toBe(PARTS.length);
  });
});
