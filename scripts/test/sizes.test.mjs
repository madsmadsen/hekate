import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { newestVersion, measure } from "../check-sizes.mjs";
import { makeTree } from "./helpers.mjs";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../check-sizes.mjs");
const run = (dir) => spawnSync("node", [script, dir], { encoding: "utf8" });

// Random bytes do not compress, so the gzip size is a little more than the size.
const small = () => randomBytes(1000);

test("NFR-1 files below the limits pass", () => {
  const root = makeTree({
    "v/hekate.wasm": small(),
    "v/wordlists/en-US/words.txt": "word\n".repeat(100),
    "v/wordlists/en-US/words-ascii.txt": "word\n".repeat(100),
  });
  const result = run(path.join(root, "v"));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(measure(path.join(root, "v")).length, 3);
});

test("NFR-1 a WASM module above 100 KB gzip fails", () => {
  const root = makeTree({
    "v/hekate.wasm": randomBytes(101 * 1024),
    "v/wordlists/en-US/words.txt": "word\n",
  });
  const result = run(path.join(root, "v"));
  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL hekate\.wasm/);
});

test("NFR-1 a word list above 40 KB gzip fails, and a list at 39 KB passes", () => {
  const big = makeTree({
    "v/hekate.wasm": small(),
    "v/wordlists/de/words.txt": randomBytes(41 * 1024),
  });
  assert.equal(run(path.join(big, "v")).status, 1);
  const ok = makeTree({
    "v/hekate.wasm": small(),
    "v/wordlists/de/words.txt": randomBytes(39 * 1024),
  });
  assert.equal(run(path.join(ok, "v")).status, 0);
});

test("NFR-1 a folder without hekate.wasm or without word lists fails", () => {
  const noWasm = makeTree({ "v/wordlists/de/words.txt": "a\n" });
  assert.equal(run(path.join(noWasm, "v")).status, 1);
  const noLists = makeTree({ "v/hekate.wasm": small() });
  assert.equal(run(path.join(noLists, "v")).status, 1);
  assert.equal(run(path.join(noLists, "missing")).status, 2);
});

test("NFR-1 newestVersion picks the last version folder by name", () => {
  const root = makeTree({
    "dist/2026.01.01-0000/a": "",
    "dist/2026.10.06-1432/a": "",
    "dist/file": "",
  });
  assert.equal(path.basename(newestVersion(path.join(root, "dist"))), "2026.10.06-1432");
  assert.equal(newestVersion(path.join(root, "nothing")), null);
});
