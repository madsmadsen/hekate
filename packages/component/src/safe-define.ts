// FR-45: a second copy of the script (for example from another URL) must not fail.
//
// The `@customElement` decorator of Lit calls `customElements.define()` and throws when the name
// is taken. The build points the decorator import of Web Awesome here. A name that is already
// defined stays as it is, so the second copy defines nothing and raises no error.
type ElementClass = CustomElementConstructor;

export const customElement =
  (tagName: string) =>
  (target: ElementClass, context?: ClassDecoratorContext): void => {
    const define = (): void => {
      if (!customElements.get(tagName)) customElements.define(tagName, target);
    };
    if (context !== undefined) context.addInitializer(define);
    else define();
  };
