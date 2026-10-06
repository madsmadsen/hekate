#!/usr/bin/env node
// TDD-1 and TDD-6: decide which tests the TDD job must run on the base branch.
//
// Input: the list of changed files of a pull request (paths with `/`).
// Output (JSON on stdout): what to copy onto the base branch and what to run.
//
// Usage: node scripts/tdd-plan.mjs [BASE_REF]
//   BASE_REF  The branch of the pull request base. Default: origin/main.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const DOC_PATTERNS = [/\.md$/, /^docs\//, /^LICENSE$/, /^NOTICE$/];
const WORDLIST_PATTERN = /^wordlists\//;
// CI and issue-template files cannot have a unit test.
const REPO_PATTERN = /^\.github\//;

export const isDoc = (file) => DOC_PATTERNS.some((pattern) => pattern.test(file));
export const isWordlist = (file) => WORDLIST_PATTERN.test(file);
export const isRepoConfig = (file) => REPO_PATTERN.test(file);

/** A separate Rust test file: crates/<crate>/tests/*.rs */
const RUST_TEST_FILE = /^(crates\/[^/]+|xtask)\/tests\/.+\.rs$/;
/** A Rust source file. Its unit tests are in the same file. */
const RUST_SOURCE_FILE = /^(crates\/[^/]+|xtask)\/src\/.+\.rs$/;
const TS_TEST_FILE = /^packages\/([^/]+)\/test\/.+/;
const E2E_TEST_FILE = /^tests\/e2e\/.+\.(ts|mjs|js)$/;
const SCRIPT_TEST_FILE = /^scripts\/test\/.+\.mjs$/;

export const crateOf = (file) =>
  file
    .split("/")
    .slice(0, file.startsWith("xtask") ? 1 : 2)
    .join("/");

/**
 * Sort the changed files.
 * `skip` is true when the pull request changes only documentation and word
 * list files (TDD-6). Then no test is needed.
 */
export function plan(changed, { hasInlineTests = () => false } = {}) {
  const code = changed.filter((file) => !isDoc(file) && !isWordlist(file) && !isRepoConfig(file));
  if (code.length === 0) {
    return {
      skip: true,
      reason: "Only documentation, word list, or repository files changed (TDD-6).",
      changed,
    };
  }
  const rustTestFiles = changed.filter((file) => RUST_TEST_FILE.test(file));
  const rustUnitTestFiles = changed.filter(
    (file) => RUST_SOURCE_FILE.test(file) && hasInlineTests(file),
  );
  const tsTestFiles = changed.filter((file) => TS_TEST_FILE.test(file));
  const e2eTestFiles = changed.filter((file) => E2E_TEST_FILE.test(file));
  const scriptTestFiles = changed.filter((file) => SCRIPT_TEST_FILE.test(file));
  return {
    skip: false,
    changed,
    rustTestFiles,
    rustUnitTestFiles,
    rustCrates: [...new Set([...rustTestFiles, ...rustUnitTestFiles].map(crateOf))].sort(),
    tsTestFiles,
    tsPackages: [...new Set(tsTestFiles.map((file) => file.match(TS_TEST_FILE)[1]))].sort(),
    e2eTestFiles,
    scriptTestFiles,
    hasTests:
      rustTestFiles.length +
        rustUnitTestFiles.length +
        tsTestFiles.length +
        e2eTestFiles.length +
        scriptTestFiles.length >
      0,
  };
}

/**
 * Put the test module of the new Rust file onto the base file.
 * The convention is: the unit tests are at the end of the file, after a line
 * `#[cfg(test)]`. Returns the new text for the base file.
 * A compile error on the base branch counts as a failing test.
 */
export function spliceRustTests(baseText, newText) {
  const marker = /^#\[cfg\(test\)\]\s*$/m;
  const newMatch = marker.exec(newText);
  if (!newMatch) return baseText;
  const baseMatch = marker.exec(baseText);
  const head = baseMatch
    ? baseText.slice(0, baseMatch.index)
    : `${baseText.replace(/\s*$/, "")}\n\n`;
  return head + newText.slice(newMatch.index);
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--splice") {
    // node scripts/tdd-plan.mjs --splice BASE_FILE NEW_FILE  -> prints the new text
    process.stdout.write(
      spliceRustTests(readFileSync(args[1], "utf8"), readFileSync(args[2], "utf8")),
    );
    return;
  }
  const base = args[0] ?? "origin/main";
  const mergeBase = git("merge-base", base, "HEAD").trim();
  const changed = git("diff", "--name-only", "--diff-filter=ACMR", mergeBase, "HEAD")
    .split("\n")
    .filter(Boolean);
  const result = plan(changed, {
    hasInlineTests: (file) => /^#\[cfg\(test\)\]\s*$/m.test(readFileSync(file, "utf8")),
  });
  console.log(JSON.stringify({ ...result, mergeBase }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
