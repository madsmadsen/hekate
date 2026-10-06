import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseAttributes, parseRequirements } from "../lib/prd.mjs";
import { checkIds, hasTestFor, listTestFiles, readAllowlist } from "../check-requirement-ids.mjs";
import { MINI_PRD, makeTree } from "./helpers.mjs";

const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../check-requirement-ids.mjs",
);

test("TDD-2 reads IDs and the Automated and Manual marks from the PRD", () => {
  const reqs = parseRequirements(MINI_PRD);
  assert.deepEqual(
    reqs.map((r) => [r.id, r.automated, r.manual]),
    [
      ["FR-1", true, false],
      ["FR-2", true, false],
      ["FR-74", false, true],
      ["SR-11", true, true],
      ["NFR-3", true, true],
    ],
  );
  assert.deepEqual(parseAttributes(MINI_PRD), ["mode", "ascii-only"]);
});

test("TDD-2 finds the Rust test name form fr_63 and the TypeScript form FR-63", () => {
  assert.equal(hasTestFor("FR-63", "#[test]\nfn fr_63_all_selected_sets_present() {}"), true);
  assert.equal(hasTestFor("FR-63", "fn fr_630_other() {}"), false);
  assert.equal(hasTestFor("FR-6", "fn fr_63_other() {}"), false);
  assert.equal(hasTestFor("FR-63", "// fr_63 only in a comment"), false);
  assert.equal(hasTestFor("FR-63", "test('FR-63 all sets are present', () => {})"), true);
  assert.equal(hasTestFor("FR-63", 'test.describe("Words FR-63", () => {})'), true);
  assert.equal(hasTestFor("FR-6", "test('FR-63 all sets', () => {})"), false);
  assert.equal(hasTestFor("FR-6", "test('NFR-6 all sets', () => {})"), false);
});

test("TDD-2 lists a missing ID and passes when every ID has a test", () => {
  const texts = ["fn fr_1_a() {}", "test('SR-11 trust', () => {})"];
  const result = checkIds({ prdText: MINI_PRD, texts });
  assert.deepEqual(result.required, ["FR-1", "FR-2", "SR-11", "NFR-3"]);
  assert.deepEqual(result.missing, ["FR-2", "NFR-3"]);
  const all = checkIds({
    prdText: MINI_PRD,
    texts: [...texts, "fn fr_2_b() {}", "it('NFR-3 axe', () => {})"],
  });
  assert.deepEqual(all.missing, []);
});

test("TDD-2 allow list lets an ID pass, and flags stale and unknown entries", () => {
  const texts = ["fn fr_1_a() {}"];
  const result = checkIds({ prdText: MINI_PRD, texts, allow: ["FR-2", "FR-1", "FR-99"] });
  assert.deepEqual(result.allowed, ["FR-2"].concat(["SR-11", "NFR-3"].filter(() => false)));
  assert.deepEqual(result.missing, ["SR-11", "NFR-3"]);
  assert.deepEqual(result.staleAllow, ["FR-1"]);
  assert.deepEqual(result.unknownAllow, ["FR-99"]);
});

test("TDD-2 reads the allow list file and ignores comments", () => {
  const root = makeTree({ "allow.txt": "# header\nFR-2 # not written yet\n\nSR-11\n" });
  assert.deepEqual(readAllowlist(path.join(root, "allow.txt")), ["FR-2", "SR-11"]);
  assert.deepEqual(readAllowlist(path.join(root, "missing.txt")), []);
});

test("TDD-2 searches the test folders and skips build folders", () => {
  const root = makeTree({
    "crates/a/src/lib.rs": "fn fr_1_a() {}",
    "crates/a/target/x.rs": "fn fr_2_skip() {}",
    "packages/p/test/a.test.ts": "test('FR-2 x', () => {})",
    "packages/p/src/a.ts": "test('SR-11 not a test file', () => {})",
    "packages/p/node_modules/q/test/a.ts": "test('NFR-3 skip', () => {})",
    "tests/e2e/a.spec.ts": "test('NFR-3 y', () => {})",
    "scripts/test/a.test.mjs": "test('SR-11 z', () => {})",
    "scripts/a.mjs": "test('SR-11 not a test', () => {})",
  });
  const rel = listTestFiles(root)
    .map((f) => path.relative(root, f))
    .sort();
  assert.deepEqual(rel, [
    "crates/a/src/lib.rs",
    "packages/p/test/a.test.ts",
    "scripts/test/a.test.mjs",
    "tests/e2e/a.spec.ts",
  ]);
});

test("TDD-2 command exits with 1 for a missing ID, with 0 in report mode, and with 0 when complete", () => {
  const files = {
    "docs/PRD.md": MINI_PRD,
    "crates/a/src/lib.rs": "fn fr_1_a() {}\nfn fr_2_a() {}\nfn sr_11_a() {}",
  };
  const root = makeTree(files);
  const strict = spawnSync("node", [script, "--root", root], { encoding: "utf8" });
  assert.equal(strict.status, 1);
  assert.match(strict.stderr, /NFR-3/);
  const report = spawnSync("node", [script, "--root", root, "--report"], { encoding: "utf8" });
  assert.equal(report.status, 0);
  assert.match(report.stderr, /NFR-3/);
  const complete = makeTree({ ...files, "tests/e2e/a.spec.ts": "test('NFR-3 axe', () => {})" });
  const ok = spawnSync("node", [script, "--root", complete], { encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
});
