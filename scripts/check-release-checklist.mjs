#!/usr/bin/env node
// TDD-2, FR-51: the release needs a result for every Manual criterion.
//
// docs/release-checklist.md has one section for each version: `## <version>`.
// The section has a table with the columns: version, criterion, result,
// person, date. A row is complete when the result is `pass`, and the person
// and the date (YYYY-MM-DD) are filled in.
//
// These rows are required for a version:
//   - one row for each requirement ID whose criteria contain `Manual:` in the PRD
//   - one row `WORDLIST-REVIEW <code>` for each language folder in wordlists/
//     (native-speaker review, PRD section 7.3)
//
// Usage: node scripts/check-release-checklist.mjs <version> [--root DIR]

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseRequirements, splitRow } from "./lib/prd.mjs";
import { isVersion } from "./release-version.mjs";

/** Criteria that need more than one row. Each text must appear in a row. */
export const REQUIRED_PARTS = { "NFR-3": ["VoiceOver", "NVDA"] };

export function manualIds(prdText) {
  return parseRequirements(prdText)
    .filter((req) => req.manual)
    .map((req) => req.id);
}

export function languageCodes(root) {
  const dir = path.join(root, "wordlists");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => statSync(path.join(dir, name)).isDirectory())
    .filter(
      (name) =>
        existsSync(path.join(dir, name, "config.toml")) ||
        existsSync(path.join(dir, name, "manifest.json")),
    )
    .sort();
}

/** The rows of the checklist table that belong to the version. */
export function rowsForVersion(checklist, version) {
  const rows = [];
  for (const line of checklist.split("\n")) {
    const cells = splitRow(line);
    if (cells && cells.length >= 5 && cells[0] === version) {
      rows.push({ criterion: cells[1], result: cells[2], person: cells[3], date: cells[4] });
    }
  }
  return rows;
}

function rowProblem(row) {
  if (!/^pass$/i.test(row.result)) return `the result is '${row.result}', not 'pass'`;
  if (!row.person || /^<.*>$/.test(row.person)) return "the person is missing";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date))
    return `the date '${row.date}' is not in the form YYYY-MM-DD`;
  return null;
}

/** Return a list of problems. An empty list means that the entry is complete. */
export function checkChecklist({ checklist, version, prdText, languages }) {
  const problems = [];
  if (!isVersion(version)) return [`'${version}' is not a version in the form YYYY.MM.DD-HHMM.`];
  const rows = rowsForVersion(checklist, version);
  if (rows.length === 0) return [`docs/release-checklist.md has no rows for version ${version}.`];

  const keys = [...manualIds(prdText), ...languages.map((code) => `WORDLIST-REVIEW ${code}`)];
  for (const key of keys) {
    const matching = rows.filter(
      (row) => row.criterion === key || row.criterion.startsWith(`${key} `),
    );
    if (matching.length === 0) {
      problems.push(`${key}: no row for version ${version}.`);
      continue;
    }
    for (const row of matching) {
      const problem = rowProblem(row);
      if (problem) problems.push(`${row.criterion}: ${problem}.`);
    }
    for (const part of REQUIRED_PARTS[key] ?? []) {
      if (!matching.some((row) => row.criterion.includes(part))) {
        problems.push(`${key}: no row that mentions '${part}'.`);
      }
    }
  }
  return problems;
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  let root = path.resolve(here, "..");
  let version;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--root") root = path.resolve(argv[++i]);
    else if (!version) version = argv[i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!version) {
    console.error("Usage: node scripts/check-release-checklist.mjs <version> [--root DIR]");
    process.exit(2);
  }
  const checklistPath = path.join(root, "docs/release-checklist.md");
  const prdPath = path.join(root, "docs/PRD.md");
  if (!existsSync(checklistPath) || !existsSync(prdPath)) {
    console.error("Release checklist: docs/release-checklist.md or docs/PRD.md is missing.");
    process.exit(2);
  }
  const problems = checkChecklist({
    checklist: readFileSync(checklistPath, "utf8"),
    version,
    prdText: readFileSync(prdPath, "utf8"),
    languages: languageCodes(root),
  });
  if (problems.length > 0) {
    for (const problem of problems) console.error(`Release checklist: ${problem}`);
    process.exit(1);
  }
  console.log(`Release checklist: the entry for ${version} is complete.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
