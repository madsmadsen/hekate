#!/usr/bin/env node
// TDD-4: every mutant must fail a test. The only exceptions are the mutants in
// crates/hekate-core/mutants-equivalent.txt, each with a reason.
//
// `cargo mutants` writes the mutants that no test caught to mutants.out/missed.txt.
// Each line looks like this:
//   crates/hekate-core/src/chars.rs:48:5: replace selected_sets -> Vec<Set> with vec![]
// The equivalents file lists the same text without the line and column:
//   crates/hekate-core/src/chars.rs: replace selected_sets -> Vec<Set> with vec![]  # reason
//
// Usage: node scripts/check-mutants.mjs <missed.txt> <mutants-equivalent.txt>

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Remove `:line:column` after the file name. */
export function normalize(mutant) {
  return mutant
    .replace(/^([^:\s]+):\d+:\d+:/, "$1:")
    .replace(/\s+/g, " ")
    .trim();
}

/** Read the equivalents file. Returns { entries: Set, problems: [] }. */
export function parseEquivalents(text) {
  const entries = new Set();
  const problems = [];
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const hash = line.lastIndexOf("  #");
    const mutant = hash >= 0 ? line.slice(0, hash) : line;
    const reason = hash >= 0 ? line.slice(hash + 3).trim() : "";
    if (reason === "")
      problems.push(`line ${index + 1}: the entry has no reason. Add '  # <reason>'.`);
    entries.add(normalize(mutant));
  });
  return { entries, problems };
}

/** Return the missed mutants that are not equivalent. */
export function unexplained(missedText, entries) {
  return missedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !entries.has(normalize(line)));
}

function main() {
  const [missedFile, equivalentsFile] = process.argv.slice(2);
  if (!missedFile || !equivalentsFile) {
    console.error("Usage: node scripts/check-mutants.mjs <missed.txt> <mutants-equivalent.txt>");
    process.exit(2);
  }
  const { entries, problems } = parseEquivalents(
    existsSync(equivalentsFile) ? readFileSync(equivalentsFile, "utf8") : "",
  );
  // No missed.txt means that cargo mutants found no mutant to test, or that none survived.
  const missed = existsSync(missedFile)
    ? unexplained(readFileSync(missedFile, "utf8"), entries)
    : [];
  for (const problem of problems) console.error(`TDD-4: ${equivalentsFile}: ${problem}`);
  for (const mutant of missed) console.error(`TDD-4: no test fails for this mutant: ${mutant}`);
  if (problems.length > 0 || missed.length > 0) {
    console.error(
      "TDD-4: write a test that fails for each mutant, or explain it in mutants-equivalent.txt.",
    );
    process.exit(1);
  }
  console.log("TDD-4: every mutant fails a test, or is in mutants-equivalent.txt with a reason.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
