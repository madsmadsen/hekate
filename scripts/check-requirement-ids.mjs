#!/usr/bin/env node
// TDD-2: every requirement with an Automated criterion needs a test whose
// name contains the requirement ID.
//
// Rust test names use the form `fr_63_...`. TypeScript test titles use `FR-63 ...`.
//
// Usage: node scripts/check-requirement-ids.mjs [--report] [--root DIR] [--prd FILE] [--allow FILE]
//   --report  Print the missing IDs and exit with 0.
//   --allow   A file with one ID per line. These IDs may have no test yet.
//             The file stays empty when all tests exist.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseRequirements } from "./lib/prd.mjs";

const SKIP_DIRS = new Set(["node_modules", "target", "dist", ".git", "out"]);
const SOURCE_EXTENSIONS = new Set([".rs", ".ts", ".tsx", ".js", ".mjs"]);

/** Collect the files that may hold tests. `root` is the repository root. */
export function listTestFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
    }
  };
  const isTestFile = (file) => {
    const rel = path.relative(root, file).split(path.sep);
    const top = rel[0];
    if (top === "crates" || top === "xtask") return file.endsWith(".rs");
    if (top === "packages")
      return rel.slice(1, -1).some((part) => part === "test" || part === "tests");
    if (top === "tests") return true;
    if (top === "scripts") return rel[1] === "test";
    return false;
  };
  for (const top of ["crates", "xtask", "packages", "tests", "scripts"]) {
    const dir = path.join(root, top);
    if (existsSync(dir)) walk(dir);
  }
  return files.filter(isTestFile);
}

/** Does the text of a test file contain a test name with this ID? */
export function hasTestFor(id, text) {
  const rust = id.toLowerCase().replace("-", "_");
  const rustName = new RegExp(`\\b(?:fn|mod)\\s+${rust}(?![0-9])`);
  if (rustName.test(text)) return true;
  const tsName = new RegExp(
    `\\b(?:test|it|describe)(?:\\.\\w+)*\\(\\s*(['"\`])[^'"\`\\n]*(?<![A-Za-z0-9])${id}(?![0-9])`,
  );
  return tsName.test(text);
}

export function readAllowlist(file) {
  if (!file || !existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean);
}

/**
 * Compare the PRD with the tests.
 * Returns { required, missing, allowed, staleAllow, unknownAllow }.
 */
export function checkIds({ prdText, texts, allow = [] }) {
  const required = parseRequirements(prdText)
    .filter((req) => req.automated)
    .map((req) => req.id);
  const allIds = new Set(parseRequirements(prdText).map((req) => req.id));
  const has = (id) => texts.some((text) => hasTestFor(id, text));
  const without = required.filter((id) => !has(id));
  const allowed = without.filter((id) => allow.includes(id));
  const missing = without.filter((id) => !allow.includes(id));
  const staleAllow = allow.filter((id) => required.includes(id) && has(id));
  const unknownAllow = allow.filter((id) => !allIds.has(id));
  return { required, missing, allowed, staleAllow, unknownAllow };
}

function parseArgs(argv) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const args = { report: false, root: path.resolve(here, "..") };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--report") args.report = true;
    else if (argv[i] === "--root") args.root = path.resolve(argv[++i]);
    else if (argv[i] === "--prd") args.prd = path.resolve(argv[++i]);
    else if (argv[i] === "--allow") args.allow = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  args.prd ??= path.join(args.root, "docs/PRD.md");
  args.allow ??= path.join(args.root, "scripts/requirement-ids.allow");
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!existsSync(args.prd) || !statSync(args.prd).isFile()) {
    console.error(`TDD-2: cannot read the PRD at ${args.prd}`);
    process.exit(2);
  }
  const result = checkIds({
    prdText: readFileSync(args.prd, "utf8"),
    texts: listTestFiles(args.root).map((file) => readFileSync(file, "utf8")),
    allow: readAllowlist(args.allow),
  });
  console.log(`TDD-2: ${result.required.length} requirements have an Automated criterion.`);
  if (result.allowed.length > 0) {
    console.log(
      `TDD-2: ${result.allowed.length} IDs are on the allow list: ${result.allowed.join(", ")}`,
    );
  }
  const problems = [];
  if (result.missing.length > 0) {
    problems.push(`${result.missing.length} IDs have no test: ${result.missing.join(", ")}`);
  }
  if (result.staleAllow.length > 0) {
    problems.push(
      `These IDs have a test now. Remove them from the allow list: ${result.staleAllow.join(", ")}`,
    );
  }
  if (result.unknownAllow.length > 0) {
    problems.push(
      `The allow list has IDs that are not in the PRD: ${result.unknownAllow.join(", ")}`,
    );
  }
  if (problems.length === 0) {
    console.log("TDD-2: every ID has a test.");
    return;
  }
  for (const problem of problems) console.error(`TDD-2: ${problem}`);
  if (args.report) return;
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
