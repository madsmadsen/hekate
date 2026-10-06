#!/usr/bin/env node
// NFR-1: gzip size limits for the files in dist/<version>/.
//   hekate.wasm        100 KB or less
//   words*.txt         40 KB or less (each word list file)
//
// Usage: node scripts/check-sizes.mjs [DIST_VERSION_DIR]
// Without an argument, it uses the newest folder in dist/.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

export const WASM_LIMIT = 100 * 1024;
export const WORDLIST_LIMIT = 40 * 1024;

export function gzipSize(file) {
  return gzipSync(readFileSync(file), { level: 9 }).length;
}

/** Return [{ file, size, limit }] for each file that the limits cover. */
export function measure(versionDir) {
  const items = [];
  const wasm = path.join(versionDir, "hekate.wasm");
  if (existsSync(wasm)) items.push({ file: wasm, limit: WASM_LIMIT });
  const lists = path.join(versionDir, "wordlists");
  if (existsSync(lists)) {
    for (const lang of readdirSync(lists).sort()) {
      const dir = path.join(lists, lang);
      if (!statSync(dir).isDirectory()) continue;
      for (const name of readdirSync(dir).sort()) {
        if (/^words.*\.txt$/.test(name))
          items.push({ file: path.join(dir, name), limit: WORDLIST_LIMIT });
      }
    }
  }
  return items.map((item) => ({ ...item, size: gzipSize(item.file) }));
}

/** Find the newest folder in dist/. */
export function newestVersion(distDir) {
  if (!existsSync(distDir)) return null;
  const versions = readdirSync(distDir)
    .filter((name) => statSync(path.join(distDir, name)).isDirectory())
    .sort();
  return versions.length > 0 ? path.join(distDir, versions[versions.length - 1]) : null;
}

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const versionDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : newestVersion(path.resolve(here, "../dist"));
  if (!versionDir || !existsSync(versionDir)) {
    console.error("NFR-1: no dist/<version>/ folder found. Run `cargo xtask dist` first.");
    process.exit(2);
  }
  const items = measure(versionDir);
  if (!items.some((item) => item.file.endsWith("hekate.wasm"))) {
    console.error(`NFR-1: ${versionDir} has no hekate.wasm.`);
    process.exit(1);
  }
  if (!items.some((item) => item.file.endsWith(".txt"))) {
    console.error(`NFR-1: ${versionDir} has no word list files.`);
    process.exit(1);
  }
  let failed = false;
  for (const item of items) {
    const over = item.size > item.limit;
    failed ||= over;
    const name = path.relative(versionDir, item.file);
    console.log(`${over ? "FAIL" : "ok  "} ${name}: ${item.size} bytes gzip (limit ${item.limit})`);
  }
  if (failed) {
    console.error("NFR-1: at least one file is larger than its limit.");
    process.exit(1);
  }
  console.log(`NFR-1: ${items.length} files are within the limits.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
