// Makes test/pseudo-locale.json from locales/en.json (FR-70, FR-73).
// Every letter becomes an accented letter, the text is 40% longer, and each message
// is wrapped in [ ]. Placeholders like {count} stay as they are. Run: pnpm pseudo
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const english = JSON.parse(readFileSync(join(root, "locales/en.json"), "utf8"));

const FROM = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const TO = "àƀçðéƒĝĥíĵķļḿñöþǫŕšťûṽŵẋýžÀƁÇÐÉƑĜĤÍĴĶĻḾÑÖÞǪŔŠŤÛṼŴẊÝŽ";
const map = new Map([...FROM].map((letter, index) => [letter, [...TO][index]]));

function accent(text) {
  return [...text].map((character) => map.get(character) ?? character).join("");
}

function pseudo(text) {
  // Split so that placeholders are not changed.
  const parts = text
    .split(/(\{\w+\})/)
    .map((part) => (/^\{\w+\}$/.test(part) ? part : accent(part)));
  const body = parts.join("");
  const plain = text.replace(/\{\w+\}/g, "");
  const extra = Math.ceil(plain.length * 0.4);
  // The extra text repeats the first words, so it can wrap like real text.
  const words = parts
    .filter((part) => !/^\{\w+\}$/.test(part))
    .join("")
    .trim();
  const padding =
    extra > 0 && words
      ? ` ${words
          .repeat(Math.ceil(extra / words.length) + 1)
          .slice(0, extra)
          .trim()}`
      : "";
  return `[${body}${padding}]`;
}

const result = {};
for (const [key, message] of Object.entries(english)) {
  result[key] =
    typeof message === "string"
      ? pseudo(message)
      : Object.fromEntries(Object.entries(message).map(([form, text]) => [form, pseudo(text)]));
}

writeFileSync(join(root, "test/pseudo-locale.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(`Wrote test/pseudo-locale.json with ${Object.keys(result).length} messages.`);
