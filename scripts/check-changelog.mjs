#!/usr/bin/env node
// FR-51: CHANGELOG.md must have an entry `## <version>` for the release.
//
// Usage: node scripts/check-changelog.mjs <version> [--file CHANGELOG.md] [--print]
//   --print  Print the text of the entry. The release workflow uses it as the release notes.

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { isVersion } from "./release-version.mjs";

/** Return the lines of the entry for the version, or null if there is no entry. */
export function changelogEntry(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex(
    (line) => line.replace(/\s+$/, "") === `## ${version}` || line.startsWith(`## ${version} `),
  );
  if (start < 0) return null;
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^## /.test(line)) break;
    body.push(line);
  }
  return body;
}

function main() {
  const argv = process.argv.slice(2);
  let file = "CHANGELOG.md";
  let print = false;
  let version;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--file") file = argv[++i];
    else if (argv[i] === "--print") print = true;
    else if (!version) version = argv[i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!version || !isVersion(version)) {
    console.error(
      "Usage: node scripts/check-changelog.mjs <YYYY.MM.DD-HHMM> [--file CHANGELOG.md]",
    );
    process.exit(2);
  }
  if (!existsSync(file)) {
    console.error(`Changelog: ${file} does not exist.`);
    process.exit(2);
  }
  const entry = changelogEntry(readFileSync(file, "utf8"), version);
  if (entry === null) {
    console.error(`Changelog: ${file} has no entry '## ${version}'.`);
    process.exit(1);
  }
  if (entry.every((line) => line.trim() === "")) {
    console.error(`Changelog: the entry '## ${version}' is empty.`);
    process.exit(1);
  }
  if (print) console.log(entry.join("\n").trim());
  else console.log(`Changelog: the entry for ${version} exists.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
