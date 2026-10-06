// Copies the demo pages to apps/demo/out/ and fills in the version and the SRI value.
// The version is HEKATE_VERSION, or the newest folder in dist/.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const root = import.meta.dirname;
const dist = join(root, "../../dist");
const out = join(root, "out");

function newestVersion() {
  if (process.env.HEKATE_VERSION) return process.env.HEKATE_VERSION;
  if (!existsSync(dist)) throw new Error("dist/ does not exist. Run `cargo xtask dist` first.");
  const versions = readdirSync(dist, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const newest = versions.at(-1);
  if (!newest) throw new Error("dist/ has no version folder. Run `cargo xtask dist` first.");
  return newest;
}

const version = newestVersion();
const sriFile = join(dist, version, "sri.txt");
const sri = existsSync(sriFile) ? readFileSync(sriFile, "utf8").trim() : "";
if (!sri) console.warn(`No sri.txt for ${version}. The script tags get no integrity attribute.`);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const name of readdirSync(root)) {
  const source = join(root, name);
  if (name.endsWith(".html")) {
    let html = readFileSync(source, "utf8").replaceAll("__VERSION__", version);
    html = sri
      ? html.replaceAll("__SRI__", sri)
      : html.replaceAll(' integrity="__SRI__"', "").replaceAll(' crossorigin="anonymous"', "");
    writeFileSync(join(out, name), html);
  } else if (name === "demo.js") {
    writeFileSync(join(out, name), readFileSync(source, "utf8").replaceAll("__VERSION__", version));
  } else if (name === "demo.css" || name === "hostile.css") {
    copyFileSync(source, join(out, name));
  }
}
console.log(`Demo pages for version ${version} are in ${out}`);
