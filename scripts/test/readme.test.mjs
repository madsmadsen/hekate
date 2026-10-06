import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkReadme, parseStringArray, section } from "../check-readme.mjs";
import { MINI_PRD, makeTree } from "./helpers.mjs";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../check-readme.mjs");

const GOOD_README = `# Hekate

\`\`\`html
<script type="module" src="https://assets.example/1/hekate.js" integrity="sha384-x" crossorigin="anonymous"></script>
\`\`\`

| Attribute | Meaning |
|---|---|
| \`mode\` | Mode |
| \`ascii-only\` | ASCII |

Send \`Cache-Control: no-store\` and \`Access-Control-Allow-Origin: *\`. Use the type application/wasm.

## Trust in the host page

Scripts on the host page can read the password from the component.
Load no third-party scripts, such as analytics or advertisement scripts, on pages with the component.

## Notes

Hekate does not clear the clipboard. A system can use NFD, but Hekate makes NFC.

### CSS custom properties

- \`--hekate-color\`

### Parts

- \`password\`
- \`copy-button\`
`;

const API = `export const CSS_PROPERTIES = [
  "--hekate-color",
] as const;
export const PARTS = ["password", "copy-button"] as const;
`;

test("SR-11 section finds the text under a heading and stops at the next heading", () => {
  const trust = section(GOOD_README, "Trust in the host page");
  assert.match(trust, /analytics/);
  assert.doesNotMatch(trust, /clipboard/);
  assert.equal(section(GOOD_README, "Missing"), null);
});

test("SR-11 NFR-6 SR-8 a correct README has no problems", () => {
  assert.deepEqual(checkReadme({ readme: GOOD_README, prdText: MINI_PRD, apiText: API }), []);
});

test("SR-11 README without the section, or without the two statements, fails", () => {
  const none = GOOD_README.replace("## Trust in the host page", "## Something else");
  assert.match(
    checkReadme({ readme: none, prdText: MINI_PRD }).join("\n"),
    /no section 'Trust in the host page'/,
  );
  const noRead = GOOD_README.replace("can read the password", "are fine");
  assert.match(
    checkReadme({ readme: noRead, prdText: MINI_PRD }).join("\n"),
    /can read the password/,
  );
  const noThird = GOOD_README.replace("third-party scripts", "other scripts");
  assert.match(checkReadme({ readme: noThird, prdText: MINI_PRD }).join("\n"), /third-party/);
});

test("NFR-6 SR-8 README without the NFC note or the clipboard note fails", () => {
  const noNfc = GOOD_README.replace("NFC", "unicode");
  assert.match(checkReadme({ readme: noNfc, prdText: MINI_PRD }).join("\n"), /NFR-6/);
  const noClipboard = GOOD_README.replace("does not clear the clipboard", "is nice");
  assert.match(
    checkReadme({ readme: noClipboard, prdText: MINI_PRD }).join("\n"),
    /SR-8: README must say/,
  );
});

test("SR-8 SR-12 SR-13 README must list the headers and the script tag attributes", () => {
  const noHeader = GOOD_README.replace("Cache-Control: no-store", "nothing");
  assert.match(
    checkReadme({ readme: noHeader, prdText: MINI_PRD }).join("\n"),
    /Cache-Control: no-store/,
  );
  const noSri = GOOD_README.replace('integrity="sha384-x"', "");
  assert.match(checkReadme({ readme: noSri, prdText: MINI_PRD }).join("\n"), /SR-13/);
});

test("FR-42 README must list every attribute of table 5.2", () => {
  const missing = GOOD_README.replace("| `ascii-only` | ASCII |", "");
  assert.match(
    checkReadme({ readme: missing, prdText: MINI_PRD }).join("\n"),
    /attribute 'ascii-only'/,
  );
});

test("FR-47 README lists must equal the CSS_PROPERTIES and PARTS of api.ts", () => {
  assert.deepEqual(parseStringArray(API, "PARTS"), ["password", "copy-button"]);
  const extraPart = GOOD_README.replace("- `copy-button`", "- `copy-button`\n- `old-part`");
  assert.match(
    checkReadme({ readme: extraPart, prdText: MINI_PRD, apiText: API }).join("\n"),
    /Not in api.ts: \[old-part\]/,
  );
  const noProperty = GOOD_README.replace("- `--hekate-color`", "");
  assert.match(
    checkReadme({ readme: noProperty, prdText: MINI_PRD, apiText: API }).join("\n"),
    /Missing in README: \[--hekate-color\]/,
  );
  assert.match(
    checkReadme({ readme: GOOD_README, prdText: MINI_PRD, apiText: "export const X = 1;" }).join(
      "\n",
    ),
    /must export/,
  );
});

test("SR-11 command exits with 0 for a correct README and with 1 for a wrong one", () => {
  const good = makeTree({ "README.md": GOOD_README, "docs/PRD.md": MINI_PRD });
  assert.equal(spawnSync("node", [script, "--root", good], { encoding: "utf8" }).status, 0);
  const bad = makeTree({ "README.md": "# Hekate\n", "docs/PRD.md": MINI_PRD });
  const result = spawnSync("node", [script, "--root", bad], { encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Trust in the host page/);
});
