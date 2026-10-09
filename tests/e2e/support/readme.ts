// The lists of CSS custom properties and parts, read from docs/embedding.md (FR-47).
import { readFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "./env.ts";

const readme = readFileSync(path.join(repoRoot, "docs", "embedding.md"), "utf8");

/** The bullet items below a heading `### <title>`, each in backticks. */
function listBelow(title: string): string[] {
  const start = readme.indexOf(`### ${title}`);
  if (start < 0) throw new Error(`docs/embedding.md has no section "${title}"`);
  const rest = readme.slice(start + title.length + 4);
  const end = rest.search(/\n#{1,4} /);
  const section = end < 0 ? rest : rest.slice(0, end);
  return [...section.matchAll(/^- `([^`]+)`/gm)].map((match) => match[1] ?? "");
}

export const PROPERTIES_FROM_README = listBelow("CSS custom properties");
export const PARTS_FROM_README = listBelow("Parts");
