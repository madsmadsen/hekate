// The WASM module gives one letter for each code point of the password (`kinds`).
// This file groups equal neighbours, so the UI can style each group (NFR-8).

export interface TokenRun {
  /** The part name and CSS class of the group, for example `token-separator`. */
  name: string;
  text: string;
}

const NAMES: Record<string, string> = {
  w: "token-word",
  s: "token-separator",
  n: "token-number",
  y: "token-symbol",
  l: "token-lower",
  u: "token-upper",
  d: "token-digit",
};

export function tokenRuns(password: string, kinds: string): TokenRun[] {
  const characters = Array.from(password);
  const letters = Array.from(kinds);
  const runs: TokenRun[] = [];
  let last = "";
  characters.forEach((character, index) => {
    const kind = letters[index] ?? "w";
    const previous = runs[runs.length - 1];
    if (previous !== undefined && kind === last) {
      previous.text += character;
      return;
    }
    last = kind;
    runs.push({ name: NAMES[kind] ?? "token-word", text: character });
  });
  return runs;
}
