#!/usr/bin/env node
// SR-10: two builds of one tag must give the same files.
// Compare the SHA-256 hash of every file in two folders. Fail on any difference.
//
// Usage: node scripts/compare-dist.mjs <folder-a> <folder-b>

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Return a Map from relative path to SHA-256 hex for every file in the folder. */
export function hashTree(root) {
  const hashes = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else
        hashes.set(
          path.relative(root, full).split(path.sep).join("/"),
          createHash("sha256").update(readFileSync(full)).digest("hex"),
        );
    }
  };
  walk(root);
  return hashes;
}

/** Return a list of differences. An empty list means that the folders are the same. */
export function compareTrees(a, b) {
  const problems = [];
  for (const [file, hash] of a) {
    if (!b.has(file)) problems.push(`${file}: only in the first folder`);
    else if (b.get(file) !== hash)
      problems.push(`${file}: the hash is different (${hash} and ${b.get(file)})`);
  }
  for (const file of b.keys()) {
    if (!a.has(file)) problems.push(`${file}: only in the second folder`);
  }
  return problems;
}

function main() {
  const [first, second] = process.argv.slice(2);
  if (!first || !second || !existsSync(first) || !existsSync(second)) {
    console.error("Usage: node scripts/compare-dist.mjs <folder-a> <folder-b>");
    process.exit(2);
  }
  const a = hashTree(first);
  const problems = compareTrees(a, hashTree(second));
  if (a.size === 0) problems.push("the first folder has no files");
  if (problems.length > 0) {
    for (const problem of problems) console.error(`SR-10: ${problem}`);
    process.exit(1);
  }
  console.log(`SR-10: ${a.size} files have the same SHA-256 hash in both builds.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
