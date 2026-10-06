import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalize, parseEquivalents, unexplained } from "../check-mutants.mjs";
import { makeTree } from "./helpers.mjs";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../check-mutants.mjs");
const MISSED =
  "crates/hekate-core/src/chars.rs:48:5: replace selected_sets -> Vec<Set> with vec![]\n";

test("TDD-4 the line and the column are not part of the mutant name", () => {
  assert.equal(
    normalize("crates/hekate-core/src/chars.rs:48:5: replace f -> bool with true"),
    "crates/hekate-core/src/chars.rs: replace f -> bool with true",
  );
});

test("TDD-4 an equivalent mutant with a reason is accepted, and one without a reason is not", () => {
  const good = parseEquivalents(
    "# header\n\ncrates/hekate-core/src/chars.rs: replace selected_sets -> Vec<Set> with vec![]  # same result\n",
  );
  assert.deepEqual(good.problems, []);
  assert.deepEqual(unexplained(MISSED, good.entries), []);
  const bad = parseEquivalents(
    "crates/hekate-core/src/chars.rs: replace selected_sets -> Vec<Set> with vec![]\n",
  );
  assert.match(bad.problems.join("\n"), /no reason/);
});

test("TDD-4 a missed mutant that is not in the file is reported", () => {
  const { entries } = parseEquivalents("# nothing\n");
  assert.equal(unexplained(MISSED, entries).length, 1);
});

test("TDD-4 the command fails for a missed mutant and passes without one", () => {
  const run = (files) => {
    const root = makeTree(files);
    return spawnSync("node", [script, path.join(root, "missed.txt"), path.join(root, "eq.txt")], {
      encoding: "utf8",
    });
  };
  const failing = run({ "missed.txt": MISSED, "eq.txt": "# empty\n" });
  assert.equal(failing.status, 1);
  assert.match(failing.stderr, /selected_sets/);
  assert.equal(run({ "missed.txt": "", "eq.txt": "# empty\n" }).status, 0);
  assert.equal(run({ "eq.txt": "# empty\n" }).status, 0, "no missed.txt means no missed mutant");
  const explained = run({
    "missed.txt": MISSED,
    "eq.txt":
      "crates/hekate-core/src/chars.rs: replace selected_sets -> Vec<Set> with vec![]  # reason\n",
  });
  assert.equal(explained.status, 0, explained.stderr);
});
