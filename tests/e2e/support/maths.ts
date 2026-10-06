// Numbers for the tests: the entropy formulas of Appendix A, chi-square, and color contrast.

const log2 = Math.log2;

/** Appendix A.1. `size` is the number of words in the list that Hekate uses. */
export function wordEntropy(options: {
  size: number;
  words: number;
  random?: boolean;
  number?: boolean;
  symbol?: boolean;
}): number {
  let bits = options.words * log2(options.size);
  if (options.random) bits += options.words;
  if (options.number) bits += log2(100);
  if (options.symbol) bits += 4;
  return bits;
}

/** Appendix A.2: log2 of the passwords that contain every selected set (inclusion-exclusion). */
export function characterEntropy(length: number, setSizes: number[]): number {
  const total = setSizes.reduce((sum, size) => sum + size, 0);
  let valid = 0;
  for (let mask = 0; mask < 1 << setSizes.length; mask++) {
    let removed = 0;
    let bits = 0;
    setSizes.forEach((size, index) => {
      if (mask & (1 << index)) {
        removed += size;
        bits += 1;
      }
    });
    valid += (bits % 2 === 0 ? 1 : -1) * (total - removed) ** length;
  }
  return log2(valid);
}

/** The labels of FR-22. */
export function strengthLabel(bits: number): "Weak" | "Fair" | "Strong" | "Very strong" {
  if (bits < 45) return "Weak";
  if (bits < 60) return "Fair";
  if (bits < 80) return "Strong";
  return "Very strong";
}

// --- chi-square ------------------------------------------------------------------------------

function lowerGamma(a: number, x: number): number {
  // Regularized lower incomplete gamma by series.
  let sum = 1 / a;
  let term = sum;
  for (let n = 1; n < 1000; n++) {
    term *= x / (a + n);
    sum += term;
    if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

function upperGamma(a: number, x: number): number {
  // Regularized upper incomplete gamma by continued fraction (Lentz).
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

function logGamma(z: number): number {
  const g = 7;
  const coefficients = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  const x = z - 1;
  let sum = coefficients[0] ?? 0;
  for (let i = 1; i < g + 2; i++) sum += (coefficients[i] ?? 0) / (x + i);
  const t = x + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum);
}

/** The p value of a chi-square statistic with `df` degrees of freedom. */
export function chiSquareP(statistic: number, df: number): number {
  const a = df / 2;
  const x = statistic / 2;
  return x < a + 1 ? 1 - lowerGamma(a, x) : upperGamma(a, x);
}

/** The chi-square statistic for observed counts against equal expected counts. */
export function chiSquareUniform(counts: number[]): { statistic: number; df: number; p: number } {
  const total = counts.reduce((sum, count) => sum + count, 0);
  const expected = total / counts.length;
  const statistic = counts.reduce((sum, count) => sum + (count - expected) ** 2 / expected, 0);
  const df = counts.length - 1;
  return { statistic, df, p: chiSquareP(statistic, df) };
}

// --- color -----------------------------------------------------------------------------------

/** Reads `rgb(...)`, `rgba(...)`, or `color(srgb ...)` from a computed style. */
export function parseColor(text: string): [number, number, number, number] {
  const numbers = text.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
  if (text.startsWith("color(srgb")) {
    const [r = 0, g = 0, b = 0, a = 1] = numbers;
    return [r * 255, g * 255, b * 255, a];
  }
  const [r = 0, g = 0, b = 0, a = 1] = numbers;
  return [r, g, b, a];
}

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance([r, g, b]: [number, number, number, number]): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** The WCAG contrast ratio of two colors that have no transparency. */
export function contrastRatio(a: string, b: string): number {
  const first = luminance(parseColor(a));
  const second = luminance(parseColor(b));
  const [light, dark] = first > second ? [first, second] : [second, first];
  return (light + 0.05) / (dark + 0.05);
}

/** The 95th percentile (nearest rank). */
export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((x, y) => x - y);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1] ?? 0;
}

/** FR-21: the average time to crack, as the English text of the component shows it. */
export function crackTimeText(bits: number): string {
  const seconds = 2 ** (bits - 1) / 1e10;
  if (!(seconds >= 1)) return "less than 1 second";
  const units: Array<[string, number]> = [
    ["second", 1],
    ["minute", 60],
    ["hour", 3600],
    ["day", 86_400],
    ["year", 31_557_600],
  ];
  let index = 0;
  for (let i = 1; i < units.length; i++) if (seconds >= (units[i]?.[1] ?? Infinity)) index = i;
  const round = (value: number) => Number(value.toPrecision(2));
  const next = units[index + 1];
  const current = units[index] as [string, number];
  if (next && round(seconds / current[1]) >= next[1] / current[1]) index += 1;
  const [unit, size] = units[index] as [string, number];
  const value = Math.max(1, seconds / size);
  const text = new Intl.NumberFormat("en", {
    style: "unit",
    unit,
    unitDisplay: "long",
    maximumSignificantDigits: 2,
    notation:
      unit === "year" && value >= 1e12
        ? "scientific"
        : unit === "year" && value >= 1e6
          ? "compact"
          : "standard",
    compactDisplay: "long",
  }).format(value);
  return `~${text}`;
}
