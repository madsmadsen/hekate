#!/usr/bin/env node
// NFR-9: every source of every word list needs a license that PRD section 7.2 allows.
//
// Allowed: CC0, public domain, MIT, BSD, Apache-2.0, CC BY, GPL, LGPL, MPL, EUPL.
// Not allowed: ShareAlike (SA), NonCommercial (NC), NoDerivatives (ND), research use only,
// and sources without a clear license.
//
// Usage: node scripts/check-wordlist-licenses.mjs [--root DIR]

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ALLOWED = [
  /^CC0/i,
  /^public[ -]domain/i,
  /^MIT/i,
  /^BSD/i,
  /^Apache/i,
  /^CC[ -]BY[ -]\d/i, // CC BY 3.0, CC-BY-4.0
  /^(GPL|LGPL|MPL|EUPL)(?![A-Za-z])/i,
];
const DENIED = [
  /\bCC[ -]BY[ -](SA|NC|ND)\b/i,
  /share[ -]?alike/i,
  /non[ -]?commercial/i,
  /no[ -]?deriv/i,
  /research/i,
  /\b(unknown|none|unclear|custom)\b/i,
];

/** Is one license text allowed? A text with `AND` or `,` lists several licenses. All must be allowed. */
export function isAllowedLicense(text) {
  if (typeof text !== "string" || text.trim() === "") return false;
  // A note in brackets, for example "(choice of GPL, LGPL, or MPL)", is not a license.
  const clean = text.replace(/\([^)]*\)/g, "").trim();
  if (DENIED.some((pattern) => pattern.test(clean))) return false;
  const parts = clean
    .split(/\s+(?:AND|and|OR|or|und|and\/or)\s+|\s*[,;]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => ALLOWED.some((pattern) => pattern.test(part)));
}

/** Return a list of problems for one manifest object. */
export function checkManifest(manifest, label) {
  const problems = [];
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    return [`${label}: the manifest has no sources.`];
  }
  for (const source of manifest.sources) {
    if (!isAllowedLicense(source.license)) {
      problems.push(
        `${label}: the source '${source.name}' has the license '${source.license}'. It is not allowed.`,
      );
    }
  }
  return problems;
}

export function checkAll(root) {
  const dir = path.join(root, "wordlists");
  const manifests = existsSync(dir)
    ? readdirSync(dir)
        .map((name) => path.join(dir, name, "manifest.json"))
        .filter((file) => existsSync(file))
    : [];
  if (manifests.length === 0)
    return { count: 0, problems: ["no wordlists/*/manifest.json found."] };
  const problems = manifests.flatMap((file) => {
    const label = path.relative(root, file);
    try {
      return checkManifest(JSON.parse(readFileSync(file, "utf8")), label);
    } catch (error) {
      return [`${label}: cannot read the manifest: ${error.message}`];
    }
  });
  return { count: manifests.length, problems };
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let root = path.resolve(here, "..");
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root") root = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  const { count, problems } = checkAll(root);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`NFR-9: ${problem}`);
    process.exit(1);
  }
  console.log(`NFR-9: the sources of ${count} word lists have allowed licenses.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
