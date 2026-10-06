import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { changelogEntry } from "../check-changelog.mjs";
import { checkChecklist, manualIds, rowsForVersion } from "../check-release-checklist.mjs";
import { assertTagMatches, releaseVersion, versionFromUnixTime } from "../release-version.mjs";
import { MINI_PRD, makeTree } from "./helpers.mjs";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const V = "2026.10.06-1432";

test("FR-51 the version is the UTC time of the commit", () => {
  // 2026-10-06 14:32:00 UTC
  assert.equal(versionFromUnixTime(Date.UTC(2026, 9, 6, 14, 32, 59) / 1000), V);
  assert.equal(versionFromUnixTime(Date.UTC(2026, 0, 2, 3, 4) / 1000), "2026.01.02-0304");
  // 23:59 UTC on 31 December. A local time zone must not change the result.
  assert.equal(versionFromUnixTime(Date.UTC(2026, 11, 31, 23, 59) / 1000), "2026.12.31-2359");
});

test("FR-51 HEKATE_VERSION overrides the commit time, and a bad value is an error", () => {
  assert.equal(releaseVersion("HEAD", { HEKATE_VERSION: V }), V);
  assert.throws(() => releaseVersion("HEAD", { HEKATE_VERSION: "1.0.0" }), /YYYY\.MM\.DD-HHMM/);
});

test("FR-51 the release command stops when the tag is different", () => {
  assert.doesNotThrow(() => assertTagMatches(`v${V}`, V));
  assert.throws(() => assertTagMatches("v2026.10.06-1433", V), /v2026\.10\.06-1432/);
  assert.throws(() => assertTagMatches(V, V), /The tag is/);
  const result = spawnSync(
    "node",
    [path.join(dir, "release-version.mjs"), "--tag", "v1999.01.01-0000"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
});

test("FR-51 the changelog needs a non-empty entry for the version", () => {
  const changelog = `# Changelog\n\n## Unreleased\n\n- Next.\n\n## ${V}\n\n- First release.\n\n## 2026.01.01-0000\n\n`;
  assert.deepEqual(changelogEntry(changelog, V).filter(Boolean), ["- First release."]);
  assert.equal(changelogEntry(changelog, "2026.10.06-1433"), null);
  const root = makeTree({ "CHANGELOG.md": changelog });
  const run = (version) =>
    spawnSync(
      "node",
      [path.join(dir, "check-changelog.mjs"), version, "--file", path.join(root, "CHANGELOG.md")],
      { encoding: "utf8" },
    );
  assert.equal(run(V).status, 0);
  assert.equal(run("2026.10.06-1433").status, 1);
  assert.equal(run("2026.01.01-0000").status, 1, "an empty entry fails");
});

const row = (criterion, result = "pass", person = "A. Person", date = "2026-10-05") =>
  `| ${V} | ${criterion} | ${result} | ${person} | ${date} |`;
const HEADER = "| Version | Criterion | Result | Person | Date |\n|---|---|---|---|---|\n";

const FULL = [
  row("FR-74 translation guide"),
  row("SR-11 trust section"),
  row("NFR-3 VoiceOver in Safari"),
  row("NFR-3 NVDA in Firefox"),
  row("WORDLIST-REVIEW en-US"),
].join("\n");

test("TDD-2 the Manual IDs come from the PRD", () => {
  assert.deepEqual(manualIds(MINI_PRD), ["FR-74", "SR-11", "NFR-3"]);
  assert.equal(rowsForVersion(`${HEADER}${FULL}\n`, V).length, 5);
  assert.equal(rowsForVersion(`${HEADER}${FULL}\n`, "2026.01.01-0000").length, 0);
});

test("TDD-2 a complete entry passes", () => {
  const problems = checkChecklist({
    checklist: HEADER + FULL,
    version: V,
    prdText: MINI_PRD,
    languages: ["en-US"],
  });
  assert.deepEqual(problems, []);
});

test("TDD-2 a missing row, a failed result, no person, or a bad date is a problem", () => {
  const check = (lines, languages = ["en-US"]) =>
    checkChecklist({
      checklist: HEADER + lines.join("\n"),
      version: V,
      prdText: MINI_PRD,
      languages,
    }).join("\n");
  const all = FULL.split("\n");
  assert.match(check(all.filter((l) => !l.includes("FR-74"))), /FR-74: no row/);
  assert.match(check(all.filter((l) => !l.includes("NVDA"))), /mentions 'NVDA'/);
  assert.match(check(all.filter((l) => !l.includes("WORDLIST"))), /WORDLIST-REVIEW en-US: no row/);
  assert.match(check(all, ["en-US", "de"]), /WORDLIST-REVIEW de: no row/);
  assert.match(check([...all.slice(1), row("FR-74", "fail")]), /FR-74: the result is 'fail'/);
  assert.match(check([...all.slice(1), row("FR-74", "pass", "")]), /FR-74: the person is missing/);
  assert.match(check([...all.slice(1), row("FR-74", "pass", "<name>")]), /the person is missing/);
  assert.match(
    check([...all.slice(1), row("FR-74", "pass", "B", "5 Oct")]),
    /not in the form YYYY-MM-DD/,
  );
});

test("TDD-2 an entry for another version, or an empty template, is a problem", () => {
  const other = checkChecklist({
    checklist: HEADER + FULL,
    version: "2026.10.07-0000",
    prdText: MINI_PRD,
    languages: [],
  });
  assert.match(other.join("\n"), /no rows for version/);
  const bad = checkChecklist({
    checklist: "",
    version: "latest",
    prdText: MINI_PRD,
    languages: [],
  });
  assert.match(bad.join("\n"), /not a version/);
});

test("TDD-2 the checklist command uses the language folders of wordlists/", () => {
  const root = makeTree({
    "docs/PRD.md": MINI_PRD,
    "docs/release-checklist.md": HEADER + FULL,
    "wordlists/en-US/config.toml": "",
    "wordlists/de/config.toml": "",
    "wordlists/benchmark/results.json": "",
  });
  const result = spawnSync(
    "node",
    [path.join(dir, "check-release-checklist.mjs"), V, "--root", root],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /WORDLIST-REVIEW de/);
  assert.doesNotMatch(result.stderr, /benchmark/);
});
