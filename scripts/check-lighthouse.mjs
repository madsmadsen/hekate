#!/usr/bin/env node
// NFR-2: the mobile Lighthouse scores for Performance, Accessibility, and
// Best Practices must be 95 or more.
//
// Usage: node scripts/check-lighthouse.mjs <lighthouse-report.json>
// Make the report with: lighthouse <url> --output=json --output-path=report.json

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MINIMUM = 95;
export const CATEGORIES = ["performance", "accessibility", "best-practices"];

/** Return [{ category, score }] with scores from 0 to 100. A missing category has a null score. */
export function scores(report) {
  return CATEGORIES.map((category) => {
    const value = report?.categories?.[category]?.score;
    return { category, score: typeof value === "number" ? Math.round(value * 100) : null };
  });
}

export function failures(report) {
  return scores(report).filter(({ score }) => score === null || score < MINIMUM);
}

function main() {
  const file = process.argv[2];
  if (!file || !existsSync(file)) {
    console.error("Usage: node scripts/check-lighthouse.mjs <lighthouse-report.json>");
    process.exit(2);
  }
  const report = JSON.parse(readFileSync(file, "utf8"));
  const formFactor = report?.configSettings?.formFactor;
  if (formFactor !== "mobile") {
    console.error(`NFR-2: the report is for '${formFactor}'. It must be the mobile preset.`);
    process.exit(1);
  }
  for (const { category, score } of scores(report))
    console.log(`${category}: ${score ?? "missing"}`);
  const bad = failures(report);
  if (bad.length > 0) {
    console.error(`NFR-2: ${bad.map((item) => item.category).join(", ")} below ${MINIMUM}.`);
    process.exit(1);
  }
  console.log(`NFR-2: all scores are ${MINIMUM} or more.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
