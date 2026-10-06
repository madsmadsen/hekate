import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { plan, spliceRustTests } from "../tdd-plan.mjs";
import { makeTree } from "./helpers.mjs";

const scriptsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

test("TDD-6 a change of documentation only skips the TDD-1 job", () => {
  const result = plan(["README.md", "docs/release-checklist.md", "CONTRIBUTING.md"]);
  assert.equal(result.skip, true);
});

test("TDD-6 a change of word lists only skips the TDD-1 job", () => {
  assert.equal(plan(["wordlists/de/words.txt", "wordlists/de/manifest.json"]).skip, true);
  assert.equal(plan(["wordlists/de/words.txt", "README.md"]).skip, true);
});

test("TDD-6 a change of code does not skip the TDD-1 job", () => {
  assert.equal(plan(["README.md", "crates/hekate-core/src/lib.rs"]).skip, false);
  assert.equal(plan(["wordlists/de/words.txt", "xtask/src/main.rs"]).skip, false);
});

test("TDD-1 the plan sorts changed files into test kinds and crates", () => {
  const result = plan(
    [
      "crates/hekate-core/src/entropy.rs",
      "crates/hekate-core/src/other.rs",
      "crates/hekate-wasm/tests/web.rs",
      "packages/component/test/copy.test.ts",
      "packages/component/src/a.ts",
      "tests/e2e/errors.spec.ts",
      "scripts/test/readme.test.mjs",
    ],
    { hasInlineTests: (file) => file.endsWith("entropy.rs") },
  );
  assert.deepEqual(result.rustUnitTestFiles, ["crates/hekate-core/src/entropy.rs"]);
  assert.deepEqual(result.rustTestFiles, ["crates/hekate-wasm/tests/web.rs"]);
  assert.deepEqual(result.rustCrates, ["crates/hekate-core", "crates/hekate-wasm"]);
  assert.deepEqual(result.tsPackages, ["component"]);
  assert.deepEqual(result.e2eTestFiles, ["tests/e2e/errors.spec.ts"]);
  assert.deepEqual(result.scriptTestFiles, ["scripts/test/readme.test.mjs"]);
  assert.equal(result.hasTests, true);
});

test("TDD-1 a change of code without any test file is reported", () => {
  assert.equal(plan(["crates/hekate-core/src/lib.rs"]).hasTests, false);
});

test("TDD-1 the Rust test module of the new file goes onto the base file", () => {
  const base =
    "pub fn f() -> u32 { 1 }\n\n#[cfg(test)]\nmod tests {\n    #[test]\n    fn old() {}\n}\n";
  const next =
    "pub fn f() -> u32 { 2 }\n\n#[cfg(test)]\nmod tests {\n    #[test]\n    fn fr_1_new() { assert_eq!(super::f(), 2); }\n}\n";
  const result = spliceRustTests(base, next);
  assert.match(result, /fn f\(\) -> u32 \{ 1 \}/, "keeps the base code");
  assert.match(result, /fn fr_1_new/, "has the new test");
  assert.doesNotMatch(result, /fn old/, "drops the old test module");
  assert.equal(
    spliceRustTests("fn a() {}\n", "fn a() {}\n"),
    "fn a() {}\n",
    "no test module in the new file",
  );
  assert.match(
    spliceRustTests("fn a() {}\n", next),
    /fn a\(\) \{\}\n\n#\[cfg\(test\)\]/,
    "base without tests",
  );
});

function repoWith(files) {
  const root = makeTree(files);
  mkdirSync(path.join(root, "scripts"), { recursive: true });
  cpSync(scriptsDir, path.join(root, "scripts"), {
    recursive: true,
    filter: (src) => !src.includes("/test"),
  });
  const git = (...args) =>
    execFileSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@t", ...args], {
      encoding: "utf8",
    });
  git("init", "-q", "-b", "main");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  git("checkout", "-q", "-b", "change");
  return { root, git };
}

function runScript(root, env = {}) {
  // The script starts `node --test`. Node refuses to do this inside another test run.
  const clean = { ...process.env };
  delete clean.NODE_TEST_CONTEXT;
  return spawnSync("sh", [path.join(root, "scripts/tdd-failing-test.sh"), "main"], {
    cwd: root,
    encoding: "utf8",
    env: { ...clean, ...env },
  });
}

test("TDD-6 TDD-1 the script skips a documentation change and stops a code change without a test", () => {
  const { root, git } = repoWith({ "README.md": "a\n", "crates/x/src/lib.rs": "fn a() {}\n" });
  writeFileSync(path.join(root, "README.md"), "b\n");
  git("commit", "-q", "-am", "docs");
  const docs = runScript(root);
  assert.equal(docs.status, 0, docs.stderr);
  assert.match(docs.stdout, /skipped/);

  writeFileSync(path.join(root, "crates/x/src/lib.rs"), "fn b() {}\n");
  git("commit", "-q", "-am", "code");
  const code = runScript(root);
  assert.equal(code.status, 1);
  assert.match(code.stderr, /adds or changes no test/);

  const refactor = runScript(root, { TDD_REFACTOR: "1" });
  assert.equal(refactor.status, 0);
  assert.match(refactor.stdout, /refactor/);
});

test("NFR-7 TDD-1 the script passes when a new script test fails on the base and fails when it passes", () => {
  const { root, git } = repoWith({ "README.md": "a\n" });
  mkdirSync(path.join(root, "scripts/test"), { recursive: true });
  writeFileSync(
    path.join(root, "scripts/test/new.test.mjs"),
    "import test from 'node:test'; import assert from 'node:assert/strict'; import { existsSync } from 'node:fs';\n" +
      "test('FR-1 new file exists', () => assert.ok(existsSync(new URL('../new-feature.txt', import.meta.url))));\n",
  );
  writeFileSync(path.join(root, "scripts/new-feature.txt"), "x\n");
  git("add", "-A");
  git("commit", "-q", "-m", "feature with a test");
  const failing = runScript(root);
  assert.equal(failing.status, 0, failing.stdout + failing.stderr);
  assert.match(failing.stdout, /failed on the base commit, as required/);

  writeFileSync(
    path.join(root, "scripts/test/new.test.mjs"),
    "import test from 'node:test'; test('FR-1 always passes', () => {});\n",
  );
  git("commit", "-q", "-am", "weak test");
  const passing = runScript(root);
  assert.equal(passing.status, 1);
  assert.match(passing.stderr, /no new test failed/);
});
