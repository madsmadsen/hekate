// Writes files that people can look at after a run.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Reference screenshots go to `tests/e2e/__screenshots__/<project>/`. */
export function saveScreenshot(project: string, name: string, bytes: Buffer): void {
  const folder = path.join(here, "..", "__screenshots__", project);
  mkdirSync(folder, { recursive: true });
  writeFileSync(path.join(folder, `${name}.png`), bytes);
}
