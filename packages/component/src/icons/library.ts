// SR-7: every icon is inside the component script. No icon file is fetched.
//
// Web Awesome loads an icon with `fetch(url)`. A `data:` URL for each icon would be
// blocked by a strict `connect-src` rule (SR-6), and the default library loads from
// a CDN. So Hekate uses the "sprite sheet" mode of the Web Awesome icon library:
// the resolver gives a fragment-only URL, and the mutator puts the SVG shapes into the
// icon element. The build replaces the two icon libraries of Web Awesome with this one.
import { FA_FREE, type IconData } from "./fa-free.generated.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

// Icons that Hekate draws itself (24 x 24 box, stroke only).
const OWN_ICONS: Record<string, IconData> = {
  copy: {
    viewBox: "0 0 24 24",
    body: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></g>',
  },
  refresh: {
    viewBox: "0 0 24 24",
    body: '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></g>',
  },
};

const parser = typeof DOMParser === "function" ? new DOMParser() : null;

export function findIcon(name: string, variant: string): IconData | undefined {
  return (
    FA_FREE[variant]?.[name] ?? FA_FREE.regular?.[name] ?? FA_FREE.solid?.[name] ?? OWN_ICONS[name]
  );
}

interface IconHost extends Element {
  name?: string;
  variant?: string;
}

/** Fills the `<svg>` of an icon element with the shapes of the icon. */
export function drawIcon(svg: SVGElement, host: IconHost): void {
  const icon = findIcon(host.name ?? "", host.variant ?? "solid");
  if (!icon) {
    console.warn(`Hekate: there is no icon named "${host.name ?? ""}".`);
    svg.replaceChildren();
    return;
  }
  if (svg.getAttribute("data-icon") === `${host.variant ?? ""}/${host.name ?? ""}`) return;
  svg.setAttribute("viewBox", icon.viewBox);
  if (!svg.hasAttribute("fill")) svg.setAttribute("fill", "currentColor");
  svg.setAttribute("data-icon", `${host.variant ?? ""}/${host.name ?? ""}`);
  const doc = parser?.parseFromString(`<svg xmlns="${SVG_NS}">${icon.body}</svg>`, "image/svg+xml");
  const shapes = doc ? Array.from(doc.documentElement.childNodes) : [];
  svg.replaceChildren(...shapes.map((node) => document.importNode(node, true)));
}

export const systemLibrary = {
  name: "system",
  spriteSheet: true,
  resolver: (name: string, _family?: string, variant = "solid") =>
    `#hekate-icon-${variant}-${name}`,
  mutator: (svg: SVGElement, host: HTMLElement) => drawIcon(svg, host),
};

/** The library that replaces the Web Awesome "default" library (a CDN library). */
export const defaultLibrary = {
  name: "default",
  resolver: () => "",
  mutator: () => {},
};
