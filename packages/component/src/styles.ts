// SR-6: styles are Lit `static styles`. Lit puts them in constructed stylesheets
// (`adoptedStyleSheets`). The component has no <style> element and no style attribute.
// FR-73: the rules use logical properties (inline-size, margin-inline, padding-block, ...).
import { css, unsafeCSS, type CSSResultGroup } from "lit";
import themeCss from "virtual:hekate-theme";
import { DARK, LIGHT, TOKEN_FONT_WEIGHT, WORD_FONT_WEIGHT } from "./theme-colors.ts";

function palette(colors: typeof LIGHT) {
  return unsafeCSS(`
    --_surface: ${colors.surface};
    --_text: ${colors.text};
    --_separator: ${colors.separator};
    --_number: ${colors.number};
    --_symbol: ${colors.symbol};
    --_digit: ${colors.digit};
  `);
}

const component = css`
  :host {
    /* Values that the page sets on a parent element must not reach the component (FR-41). */
    all: initial;
    display: block;
    line-height: 1.4;
  }

  :host([hidden]) {
    display: none;
  }

  .light {
    ${palette(LIGHT)}
  }

  .dark {
    ${palette(DARK)}
  }

  .root {
    container-type: inline-size;
    container-name: hekate;
    box-sizing: border-box;
    display: grid;
    gap: var(--hekate-gap, 1rem);
    padding: var(--hekate-gap, 1rem);
    font-family: var(--hekate-font-family, var(--wa-font-family-body));
    color: var(--hekate-color-text, var(--_text));
    background-color: var(--hekate-color-surface, var(--_surface));
    --wa-color-brand-fill-loud: var(--hekate-color-brand, var(--wa-color-brand-50));
    --strength-weak: var(--hekate-color-strength-weak, var(--wa-color-danger-fill-loud));
    --strength-fair: var(--hekate-color-strength-fair, var(--wa-color-warning-fill-loud));
    --strength-strong: var(--hekate-color-strength-strong, var(--wa-color-success-fill-loud));
    --strength-very-strong: var(
      --hekate-color-strength-very-strong,
      var(--wa-color-brand-fill-loud)
    );
  }

  .root *,
  .root *::before,
  .root *::after {
    box-sizing: border-box;
  }

  .main {
    display: grid;
    gap: var(--hekate-gap, 1rem);
    min-inline-size: 0;
  }

  .visually-hidden {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  /* The password */
  .password-block {
    display: grid;
    gap: 0.25rem;
    min-inline-size: 0;
  }

  .field-label {
    font-size: var(--wa-font-size-s, 0.875rem);
    color: var(--hekate-color-text-quiet, var(--wa-color-text-quiet));
  }

  .password {
    min-inline-size: 0;
    min-block-size: 3.5rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--hekate-color-border, var(--wa-color-surface-border));
    border-radius: var(--hekate-radius, var(--wa-border-radius-m));
    font-family: var(
      --hekate-password-font-family,
      ui-monospace,
      "SF Mono",
      Menlo,
      Consolas,
      monospace
    );
    font-size: var(--hekate-password-font-size, 1.25rem);
    font-weight: ${unsafeCSS(WORD_FONT_WEIGHT)};
    line-height: 1.5;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    user-select: all;
    -webkit-user-select: all;
    cursor: text;
  }

  .password:focus-visible {
    outline: var(--wa-focus-ring, 3px solid var(--wa-color-focus));
    outline-offset: var(--wa-focus-ring-offset, 2px);
  }

  .password[aria-busy="true"] {
    opacity: 0.6;
  }

  .token-separator,
  .token-number,
  .token-symbol,
  .token-digit {
    font-weight: ${unsafeCSS(TOKEN_FONT_WEIGHT)};
  }

  .token-separator {
    color: var(--hekate-color-separator, var(--_separator));
  }

  .token-number {
    color: var(--hekate-color-number, var(--_number));
  }

  .token-symbol {
    color: var(--hekate-color-symbol, var(--_symbol));
  }

  .token-digit {
    color: var(--hekate-color-digit, var(--_digit));
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
  }

  .copy-status {
    min-inline-size: 0;
    font-size: var(--wa-font-size-s, 0.875rem);
    overflow-wrap: anywhere;
  }

  /* The strength estimate */
  .strength {
    display: grid;
    gap: 0.5rem;
    min-inline-size: 0;
  }

  .strength-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.75rem;
  }

  .strength-weak hekate-wa-progress-bar {
    --indicator-color: var(--strength-weak);
  }

  .strength-fair hekate-wa-progress-bar {
    --indicator-color: var(--strength-fair);
  }

  .strength-strong hekate-wa-progress-bar {
    --indicator-color: var(--strength-strong);
  }

  .strength-very-strong hekate-wa-progress-bar {
    --indicator-color: var(--strength-very-strong);
  }

  .note,
  .facts {
    margin: 0;
    font-size: var(--wa-font-size-s, 0.875rem);
    overflow-wrap: anywhere;
  }

  .note {
    color: var(--hekate-color-text-quiet, var(--wa-color-text-quiet));
  }

  /* The options */
  .options {
    display: grid;
    gap: var(--hekate-gap, 1rem);
    grid-template-columns: minmax(0, 1fr);
    min-inline-size: 0;
  }

  .option-group {
    display: grid;
    gap: 0.5rem;
    min-inline-size: 0;
  }

  .switches,
  .checks {
    display: grid;
    gap: 0.5rem;
  }

  .slider-value {
    justify-self: end;
    font-size: var(--wa-font-size-s, 0.875rem);
    font-variant-numeric: tabular-nums;
  }

  hekate-wa-select,
  hekate-wa-slider,
  hekate-wa-radio-group,
  hekate-wa-progress-bar,
  hekate-wa-callout {
    inline-size: 100%;
    min-inline-size: 0;
  }

  hekate-wa-radio-group::part(form-control-input) {
    flex-wrap: wrap;
  }

  hekate-wa-callout::part(message) {
    overflow-wrap: anywhere;
  }

  .callout-actions {
    margin-block-start: 0.5rem;
  }

  /* The Credits link. It is not a part, so a page cannot style it away (FR-30). */
  .footer {
    display: flex !important;
    justify-content: flex-end;
  }

  .credits-link {
    display: inline-block !important;
    visibility: visible !important;
    opacity: 1 !important;
    padding: 0.25rem 0.5rem;
    border: 0;
    background: none;
    font: inherit;
    font-size: var(--wa-font-size-s, 0.875rem);
    color: var(--wa-color-text-link);
    text-decoration: underline;
    cursor: pointer;
  }

  .credits-link:focus-visible {
    outline: var(--wa-focus-ring, 3px solid var(--wa-color-focus));
    outline-offset: 2px;
  }

  /* The Credits dialog */
  .credits {
    display: grid;
    gap: 1rem;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }

  .credits h3,
  .credits h4,
  .credits p,
  .credits ul {
    margin: 0;
  }

  .credits h3 {
    font-size: var(--wa-font-size-l, 1.125rem);
  }

  .credits h4 {
    font-size: var(--wa-font-size-m, 1rem);
  }

  .credits ul {
    padding-inline-start: 1.25rem;
    display: grid;
    gap: 0.75rem;
  }

  .credits a {
    color: var(--wa-color-text-link);
  }

  .credits details {
    border: 1px solid var(--wa-color-surface-border);
    border-radius: var(--wa-border-radius-m);
    padding: 0.5rem 0.75rem;
  }

  .credits summary {
    cursor: pointer;
    font-weight: 600;
  }

  .credits .hash {
    font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    font-size: var(--wa-font-size-xs, 0.75rem);
  }

  /* Wider parents: a container query reads the width of the parent, not of the screen (FR-49). */
  @container hekate (min-width: 30rem) {
    .options {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .options > .wide {
      grid-column: 1 / -1;
    }
  }

  @container hekate (min-width: 40rem) {
    .password {
      font-size: var(--hekate-password-font-size, 1.5rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    * {
      transition-duration: 0.01ms !important;
      animation-duration: 0.01ms !important;
    }
  }
`;

export const styles: CSSResultGroup = [unsafeCSS(themeCss), component];
