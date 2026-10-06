// SR-6: a replacement for the `styleMap` directive of Lit, only for Web Awesome.
//
// The Lit directive returns a style string on the first render. Lit then writes it with
// `setAttribute("style", ...)`, and a strict CSP (`style-src 'self'`) blocks that. This
// directive always sets each property through the CSSOM (`style.setProperty`), which the CSP
// allows. The build points the `lit/directives/style-map.js` imports of Web Awesome here.
import { noChange } from "lit";
import {
  Directive,
  directive,
  PartType,
  type PartInfo,
  type AttributePart,
} from "lit/directive.js";

export type StyleInfo = { [name: string]: string | number | undefined | null };

class CspStyleMapDirective extends Directive {
  #previous = new Set<string>();

  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ATTRIBUTE || partInfo.name !== "style") {
      throw new Error("The styleMap directive can only be used in the style attribute.");
    }
  }

  // The first argument gives the directive its type in templates. It is not read here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  render(_styles: Readonly<StyleInfo>): unknown {
    return noChange;
  }

  override update(part: AttributePart, [styles]: [Readonly<StyleInfo>]): unknown {
    const style = (part.element as HTMLElement).style;
    for (const name of this.#previous) {
      if (!(name in styles)) {
        if (name.includes("-")) style.removeProperty(name);
        else (style as unknown as Record<string, string>)[name] = "";
      }
    }
    this.#previous = new Set(Object.keys(styles));
    for (const [name, value] of Object.entries(styles)) {
      if (value === undefined || value === null) {
        if (name.includes("-")) style.removeProperty(name);
        else (style as unknown as Record<string, string>)[name] = "";
      } else if (name.includes("-")) {
        style.setProperty(name, String(value));
      } else {
        (style as unknown as Record<string, string>)[name] = String(value);
      }
    }
    return noChange;
  }
}

export const styleMap = directive(CspStyleMapDirective);
