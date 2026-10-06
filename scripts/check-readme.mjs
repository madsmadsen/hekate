#!/usr/bin/env node
// Check that README.md has the text that the PRD requires.
//   SR-11  The section "Trust in the host page" with two statements.
//   NFR-6  The NFC note.
//   SR-8   The clipboard note and the required response headers.
//   FR-47  The CSS properties and parts match packages/component/src/api.ts.
//   FR-42  Every attribute of table 5.2.
//
// Usage: node scripts/check-readme.mjs [--root DIR]

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseAttributes } from "./lib/prd.mjs";

/** Return the text under a heading, up to the next heading of the same or a higher level. */
export function section(markdown, title) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => new RegExp(`^#{1,6}\\s+${title}\\s*$`, "i").test(line));
  if (start < 0) return null;
  const level = lines[start].match(/^#+/)[0].length;
  const body = [];
  for (const line of lines.slice(start + 1)) {
    const heading = line.match(/^(#+)\s/);
    if (heading && heading[1].length <= level) break;
    body.push(line);
  }
  return body.join("\n");
}

/** Read a string array such as `export const PARTS = ["a", "b"] as const;`. */
export function parseStringArray(source, name) {
  const match = source.match(new RegExp(`\\b${name}\\b[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) return null;
  return [...match[1].matchAll(/(['"`])([^'"`]+)\1/g)].map((m) => m[2]);
}

/** Names in backticks, for example `--hekate-color`. */
function backticked(text) {
  return [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
}

function sameSet(a, b) {
  return a.length === b.length && a.every((item) => b.includes(item));
}

/** Return a list of problems. An empty list means that the README is correct. */
export function checkReadme({ readme, prdText, apiText }) {
  const problems = [];

  const trust = section(readme, "Trust in the host page");
  if (trust === null) {
    problems.push("SR-11: README has no section 'Trust in the host page'.");
  } else {
    if (!/scripts? on the host page can read the password/i.test(trust)) {
      problems.push(
        "SR-11: the section must say that scripts on the host page can read the password.",
      );
    }
    if (
      !/third-party scripts/i.test(trust) ||
      !/analytics/i.test(trust) ||
      !/advertis/i.test(trust)
    ) {
      problems.push(
        "SR-11: the section must tell website owners to load no third-party scripts, such as analytics or advertisement scripts.",
      );
    }
  }

  if (!/\bNFC\b/.test(readme) || !/\bNFD\b/.test(readme)) {
    problems.push("NFR-6: README must have the NFC note. It must name NFC and NFD.");
  }

  if (!/does not clear the clipboard/i.test(readme)) {
    problems.push("SR-8: README must say that Hekate does not clear the clipboard.");
  }

  for (const header of [
    "Cache-Control: no-store",
    "Access-Control-Allow-Origin: *",
    "application/wasm",
  ]) {
    if (!readme.includes(header))
      problems.push(`SR-8/SR-12: README must list the header or type '${header}'.`);
  }

  if (!/integrity=/.test(readme) || !/crossorigin="anonymous"/.test(readme)) {
    problems.push(
      'SR-13: README must show a script tag with integrity and crossorigin="anonymous".',
    );
  }

  const attributes = parseAttributes(prdText);
  if (attributes.length === 0) problems.push("FR-42: cannot read table 5.2 from the PRD.");
  const named = new Set(backticked(readme));
  for (const attribute of attributes) {
    if (!named.has(attribute))
      problems.push(`FR-42: README does not list the attribute '${attribute}'.`);
  }

  if (apiText) {
    const properties = parseStringArray(apiText, "CSS_PROPERTIES");
    const parts = parseStringArray(apiText, "PARTS");
    if (!properties || !parts) {
      problems.push("FR-47: api.ts must export the string arrays CSS_PROPERTIES and PARTS.");
    } else {
      const propertySection = section(readme, "CSS custom properties");
      const partSection = section(readme, "Parts");
      if (propertySection === null)
        problems.push("FR-47: README has no section 'CSS custom properties'.");
      else
        compare(
          "CSS custom properties",
          properties,
          backticked(propertySection).filter((n) => n.startsWith("--")),
        );
      if (partSection === null) problems.push("FR-47: README has no section 'Parts'.");
      else
        compare(
          "parts",
          parts,
          backticked(partSection).filter((n) => /^[a-z][a-z0-9-]*$/.test(n)),
        );
    }
  }

  function compare(label, expected, listed) {
    if (sameSet(expected, [...new Set(listed)])) return;
    const missing = expected.filter((item) => !listed.includes(item));
    const extra = listed.filter((item) => !expected.includes(item));
    problems.push(
      `FR-47: README ${label} differ from api.ts. Missing in README: [${missing.join(", ")}]. Not in api.ts: [${[...new Set(extra)].join(", ")}].`,
    );
  }

  return problems;
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let root = path.resolve(here, "..");
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root") root = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  const readmePath = path.join(root, "README.md");
  const prdPath = path.join(root, "docs/PRD.md");
  const apiPath = path.join(root, "packages/component/src/api.ts");
  if (!existsSync(readmePath) || !existsSync(prdPath)) {
    console.error("README check: README.md or docs/PRD.md is missing.");
    process.exit(2);
  }
  const problems = checkReadme({
    readme: readFileSync(readmePath, "utf8"),
    prdText: readFileSync(prdPath, "utf8"),
    apiText: existsSync(apiPath) ? readFileSync(apiPath, "utf8") : null,
  });
  if (problems.length > 0) {
    for (const problem of problems) console.error(`README check: ${problem}`);
    process.exit(1);
  }
  console.log(
    `README check: passed${existsSync(apiPath) ? "" : " (api.ts not found, so FR-47 lists were not compared)"}.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
