import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compareTrees, hashTree } from "../compare-dist.mjs";
import { makeTree } from "./helpers.mjs";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../compare-dist.mjs");
const run = (a, b) => spawnSync("node", [script, a, b], { encoding: "utf8" });

test("SR-10 two folders with the same files have no difference", () => {
  const files = { "hekate.js": "a", "wordlists/de/words.txt": "b" };
  const a = makeTree(files);
  const b = makeTree(files);
  assert.deepEqual(compareTrees(hashTree(a), hashTree(b)), []);
  assert.equal(run(a, b).status, 0);
});

test("SR-10 one different file, one missing file, or one extra file stops the release", () => {
  const a = makeTree({ "hekate.js": "a", "x.txt": "1" });
  const changed = makeTree({ "hekate.js": "a", "x.txt": "2" });
  const missing = makeTree({ "hekate.js": "a" });
  const extra = makeTree({ "hekate.js": "a", "x.txt": "1", "y.txt": "1" });
  assert.match(
    compareTrees(hashTree(a), hashTree(changed)).join("\n"),
    /x\.txt: the hash is different/,
  );
  assert.match(
    compareTrees(hashTree(a), hashTree(missing)).join("\n"),
    /x\.txt: only in the first/,
  );
  assert.match(compareTrees(hashTree(a), hashTree(extra)).join("\n"), /y\.txt: only in the second/);
  for (const other of [changed, missing, extra]) assert.equal(run(a, other).status, 1);
});

test("SR-10 an empty folder is an error", () => {
  const empty = makeTree({ "dir/.keep": "" });
  assert.equal(run(empty, empty).status, 0, "one file");
  assert.equal(run(empty, path.join(empty, "missing")).status, 2);
});
