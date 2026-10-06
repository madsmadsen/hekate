import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkManifest, isAllowedLicense } from "../check-wordlist-licenses.mjs";
import { makeTree } from "./helpers.mjs";

const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../check-wordlist-licenses.mjs",
);

test("NFR-9 the licenses of PRD section 7.2 are allowed", () => {
  for (const license of [
    "CC0",
    "CC0-1.0",
    "Public domain",
    "MIT",
    "MIT-style permission",
    "BSD-3-Clause",
    "Apache-2.0 (choice of GPL, LGPL, MPL, CC BY, or Apache)",
    "CC BY 3.0",
    "CC BY 4.0",
    "CC-BY-4.0",
    "GPL-3.0",
    "GPL-2.0-or-later",
    "LGPL-3.0",
    "MPL-1.1 (choice of GPL, LGPL, or MPL)",
    "MPL-2.0",
    "EUPL-1.2",
    "CC0 and CC BY 4.0",
  ]) {
    assert.equal(isAllowedLicense(license), true, license);
  }
});

test("NFR-9 ShareAlike, NonCommercial, NoDerivatives, research, and unclear licenses are not allowed", () => {
  for (const license of [
    "CC BY-SA 4.0",
    "CC-BY-SA-3.0",
    "CC BY-NC-SA 4.0",
    "CC BY-NC 4.0",
    "CC BY-ND 4.0",
    "Research use only",
    "Unknown",
    "none",
    "Custom license",
    "AGPL-3.0",
    "Proprietary",
    "",
    undefined,
    "MIT and CC BY-SA 4.0",
  ]) {
    assert.equal(isAllowedLicense(license), false, String(license));
  }
});

test("NFR-9 a manifest fails when one source has a license that is not allowed", () => {
  const good = {
    sources: [
      { name: "A", license: "CC BY 4.0" },
      { name: "B", license: "MPL-2.0" },
    ],
  };
  assert.deepEqual(checkManifest(good, "x"), []);
  const bad = {
    sources: [
      { name: "A", license: "CC BY 4.0" },
      { name: "B", license: "CC BY-SA 4.0" },
    ],
  };
  assert.match(checkManifest(bad, "x").join("\n"), /source 'B'/);
  assert.match(checkManifest({ sources: [] }, "x").join("\n"), /no sources/);
});

test("NFR-9 the command reads each wordlists/<lang>/manifest.json", () => {
  const manifest = (license) => JSON.stringify({ sources: [{ name: "S", license }] });
  const run = (root) => spawnSync("node", [script, "--root", root], { encoding: "utf8" });
  const good = makeTree({
    "wordlists/de/manifest.json": manifest("CC BY 3.0"),
    "wordlists/sv/manifest.json": manifest("CC0"),
  });
  assert.equal(run(good).status, 0);
  const bad = makeTree({
    "wordlists/de/manifest.json": manifest("CC BY 3.0"),
    "wordlists/sv/manifest.json": manifest("CC BY-SA 4.0"),
  });
  const result = run(bad);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /wordlists\/sv\/manifest\.json/);
  assert.equal(run(makeTree({ "README.md": "" })).status, 1, "no manifest at all fails closed");
});
