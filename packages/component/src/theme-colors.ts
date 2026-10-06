// NFR-8: colors of the password tokens. They come from the Web Awesome palette (gray, blue and
// red, steps 40 on white and 70 on gray-05). Each color has a contrast ratio of 4.5:1 or more
// against the surface of its theme. A unit test checks this.
export interface TokenColors {
  surface: string;
  text: string;
  separator: string;
  number: string;
  symbol: string;
  digit: string;
}

export const LIGHT: TokenColors = {
  surface: "#ffffff",
  text: "#1b1d26",
  separator: "#545868",
  number: "#0053c0",
  symbol: "#b30532",
  digit: "#0053c0",
};

export const DARK: TokenColors = {
  surface: "#101219",
  text: "#f1f2f3",
  separator: "#abaeb9",
  number: "#6eb3ff",
  symbol: "#fd8f90",
  digit: "#6eb3ff",
};

/** The password tokens are bold. The other text is regular. NFR-8 */
export const TOKEN_FONT_WEIGHT = 800;
export const WORD_FONT_WEIGHT = 400;
