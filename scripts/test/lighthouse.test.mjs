import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { failures, scores } from "../check-lighthouse.mjs";
import { makeTree } from "./helpers.mjs";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../check-lighthouse.mjs");

const report = (p, a, b, formFactor = "mobile") => ({
  configSettings: { formFactor },
  categories: {
    performance: { score: p },
    accessibility: { score: a },
    "best-practices": { score: b },
  },
});

test("NFR-2 scores of 95 or more pass and 94 fails", () => {
  assert.deepEqual(failures(report(0.95, 1, 0.96)), []);
  assert.deepEqual(
    failures(report(0.94, 1, 1)).map((f) => f.category),
    ["performance"],
  );
  assert.deepEqual(scores(report(0.954, 1, 1))[0], { category: "performance", score: 95 });
});

test("NFR-2 a missing category fails", () => {
  const missing = { categories: { performance: { score: 1 }, accessibility: { score: 1 } } };
  assert.deepEqual(
    failures(missing).map((f) => f.category),
    ["best-practices"],
  );
});

test("NFR-2 the command accepts only a mobile report", () => {
  const run = (data) => {
    const root = makeTree({ "r.json": JSON.stringify(data) });
    return spawnSync("node", [script, path.join(root, "r.json")], { encoding: "utf8" });
  };
  assert.equal(run(report(1, 1, 1)).status, 0);
  assert.equal(run(report(1, 1, 1, "desktop")).status, 1);
  assert.equal(run(report(1, 0.9, 1)).status, 1);
  assert.equal(spawnSync("node", [script], { encoding: "utf8" }).status, 2);
});
