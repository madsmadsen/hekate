import { expect, test } from "vitest";
import { tokenRuns } from "../src/tokens.ts";

test("NFR-8 neighbours of one kind form one run", () => {
  expect(tokenRuns("Ab-Cd7!", "wwswwny")).toEqual([
    { name: "token-word", text: "Ab" },
    { name: "token-separator", text: "-" },
    { name: "token-word", text: "Cd" },
    { name: "token-number", text: "7" },
    { name: "token-symbol", text: "!" },
  ]);
});

test("FR-23 one letter of kinds belongs to one code point, also for non-ASCII letters", () => {
  const runs = tokenRuns("Åa-𝒳", "wwsw");
  expect(runs.map((r) => r.text)).toEqual(["Åa", "-", "𝒳"]);
  expect(Array.from("Åa-𝒳").length).toBe(4);
});

test("NFR-8 character mode kinds have their own names", () => {
  expect(tokenRuns("aB3!", "ludy").map((r) => r.name)).toEqual([
    "token-lower",
    "token-upper",
    "token-digit",
    "token-symbol",
  ]);
});
