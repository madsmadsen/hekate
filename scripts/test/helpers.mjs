import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** Make a temporary folder and write the given files into it. */
export function makeTree(files) {
  const root = mkdtempSync(path.join(tmpdir(), "hekate-script-test-"));
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
  }
  return root;
}

/** A small PRD with one table of each kind that the scripts read. */
export const MINI_PRD = `# PRD

| ID | Priority | Requirement | Acceptance criteria |
|---|---|---|---|
| FR-1 | P0 | First. | Automated: a test checks it. |
| FR-2 | P0 | Second. | Automated: a test checks it. |
| FR-74 | P1 | Guide. | Manual: a person follows it. |
| SR-11 | P0 | Trust. | Automated: a CI test. Manual: a person reads it. |
| NFR-3 | P0 | Access. | Automated: axe. Manual: VoiceOver and NVDA. |

Table 5.2: Attributes.

| Attribute | Allowed values | Default |
|---|---|---|
| \`mode\` | \`words\`, \`characters\` | \`words\` |
| \`ascii-only\` | \`true\`, \`false\` | \`false\` |
`;
