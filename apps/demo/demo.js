// Reads the query string and makes the component with those attributes.
// Everything is external: the page has no inline script and no inline style (SR-6).
const params = new URLSearchParams(location.search);
const host = document.getElementById("host");

const width = params.get("width");
if (width !== null && /^\d+$/.test(width)) host.style.inlineSize = `${width}px`;

const assets = params.get("assets") ?? document.documentElement.dataset.assets ?? "";
const src = params.get("src") ?? "http://localhost:8081/__VERSION__/hekate.js";
await import(src);

const component = document.createElement("hekate-generator");
for (const [name, value] of params) {
  if (!["width", "assets", "src"].includes(name)) component.setAttribute(name, value);
}
if (assets) component.setAttribute("assets-url", assets);
host.append(component);
