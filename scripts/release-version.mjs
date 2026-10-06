#!/usr/bin/env node
// FR-51: print the version of a commit. The version is the UTC time of the
// commit in the form YYYY.MM.DD-HHMM, for example 2026.10.06-1432.
//
// Usage: node scripts/release-version.mjs [REV]   (default: HEAD)
//        node scripts/release-version.mjs --tag vYYYY.MM.DD-HHMM
//   --tag  Fail if the tag is not `v` plus the version of HEAD (FR-51).
//   HEKATE_VERSION overrides the result. Tests use it.

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const VERSION_PATTERN = /^\d{4}\.\d{2}\.\d{2}-\d{4}$/;

/** Convert a Unix time in seconds to a version string. */
export function versionFromUnixTime(seconds) {
  const date = new Date(seconds * 1000);
  const pad = (value, width = 2) => String(value).padStart(width, "0");
  return (
    `${pad(date.getUTCFullYear(), 4)}.${pad(date.getUTCMonth() + 1)}.${pad(date.getUTCDate())}` +
    `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`
  );
}

export function isVersion(text) {
  return VERSION_PATTERN.test(text);
}

export function releaseVersion(rev = "HEAD", env = process.env) {
  if (env.HEKATE_VERSION) {
    if (!isVersion(env.HEKATE_VERSION)) {
      throw new Error(`HEKATE_VERSION '${env.HEKATE_VERSION}' is not in the form YYYY.MM.DD-HHMM.`);
    }
    return env.HEKATE_VERSION;
  }
  const seconds = Number(
    execFileSync("git", ["show", "-s", "--format=%ct", rev], { encoding: "utf8" }).trim(),
  );
  if (!Number.isInteger(seconds)) throw new Error(`Cannot read the commit time of ${rev}.`);
  return versionFromUnixTime(seconds);
}

/** The tag of a version is `v<version>`. Throws if the tag differs. */
export function assertTagMatches(tag, version) {
  if (tag !== `v${version}`) {
    throw new Error(`The tag is '${tag}', but the commit time gives the version 'v${version}'.`);
  }
}

function main() {
  try {
    const args = process.argv.slice(2);
    if (args[0] === "--tag") {
      if (!args[1]) throw new Error("--tag needs a tag name.");
      const version = releaseVersion("HEAD");
      assertTagMatches(args[1], version);
      console.log(version);
      return;
    }
    console.log(releaseVersion(args[0] ?? "HEAD"));
  } catch (error) {
    console.error(`release-version: ${error.message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
