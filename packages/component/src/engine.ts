// The WASM module makes the passwords and the strength numbers (PRD 9, design rules).
// This file only loads it and reads its results.
import type { Charset, Separator, Capitalization } from "./attributes.ts";
import { fetchWasm } from "./assets.ts";

export type Strength = "weak" | "fair" | "strong" | "very-strong";

export interface Generated {
  password: string;
  /** One letter for each code point. Word mode: w word, s separator, n number, y symbol. Character mode: l, u, d, y. */
  kinds: string;
  entropyBits: number;
  crackSeconds: number;
  strength: Strength;
  /** The estimate for an attacker who knows nothing about the password (FR-24). */
  naiveEntropyBits: number;
  naiveCrackSeconds: number;
  naiveStrength: Strength;
}

/** The options that make new words (FR-8). */
export interface DrawOptions {
  language: string;
  ascii: boolean;
  words: number;
  noRepeat: boolean;
}

/** The options that change only how the same words look (FR-11). */
export interface WordStyle {
  separator: Separator;
  capitalization: Capitalization;
  number: boolean;
  symbol: boolean;
}

/** One set of words. Each `render` call gives the same words in the given style. */
export interface WordDraw {
  render(style: WordStyle): Generated;
  free(): void;
}

export interface CharacterOptions {
  length: number;
  charsets: readonly Charset[];
  avoidSimilar: boolean;
  noRepeat: boolean;
}

export interface Engine {
  loadWordlist(language: string, ascii: boolean, bytes: Uint8Array): void;
  drawWords(options: DrawOptions): WordDraw;
  generateCharacters(options: CharacterOptions): Generated;
}

const MASK: Record<Charset, number> = { lower: 1, upper: 2, digits: 4, symbols: 8 };

interface WasmGenerated {
  readonly password: string;
  readonly kinds: string;
  readonly entropyBits: number;
  readonly crackSeconds: number;
  readonly strength: string;
  readonly naiveEntropyBits: number;
  readonly naiveCrackSeconds: number;
  readonly naiveStrength: string;
  free(): void;
}

function read(value: WasmGenerated): Generated {
  try {
    return {
      password: value.password,
      kinds: value.kinds,
      entropyBits: value.entropyBits,
      crackSeconds: value.crackSeconds,
      strength: value.strength as Strength,
      naiveEntropyBits: value.naiveEntropyBits,
      naiveCrackSeconds: value.naiveCrackSeconds,
      naiveStrength: value.naiveStrength as Strength,
    };
  } finally {
    value.free();
  }
}

async function loadWasmEngine(folder: string): Promise<Engine> {
  // The binding file is large, so it loads only when the first component starts.
  const wasm = await import("../wasm/hekate_wasm.js");
  await wasm.default({ module_or_path: fetchWasm(folder) });
  return {
    loadWordlist: (language, ascii, bytes) => wasm.loadWordlist(language, ascii, bytes),
    drawWords: (o) => {
      const draw = wasm.drawWords(o.language, o.ascii, o.words, o.noRepeat);
      return {
        render: (s) => read(draw.render(s.separator, s.capitalization, s.number, s.symbol)),
        free: () => draw.free(),
      };
    },
    generateCharacters: (o) =>
      read(
        wasm.generateCharacters(
          o.length,
          o.charsets.reduce((mask, set) => mask | MASK[set], 0),
          o.avoidSimilar,
          o.noRepeat,
        ),
      ),
  };
}

export type EngineLoader = (folder: string) => Promise<Engine>;

let loader: EngineLoader = loadWasmEngine;
let shared: Promise<Engine> | undefined;

/** All components on a page share one WASM module. A failed load is not kept. */
export function getEngine(folder: string): Promise<Engine> {
  shared ??= loader(folder).catch((error: unknown) => {
    shared = undefined;
    throw error;
  });
  return shared;
}

/** Replaces the WASM module. Unit tests use this to count the calls (FR-8). */
export function setEngineLoader(next: EngineLoader | undefined): void {
  loader = next ?? loadWasmEngine;
  shared = undefined;
}

// Word lists that the WASM module has already checked and kept.
const loadedLists = new Set<string>();

export function isWordlistLoaded(language: string, ascii: boolean): boolean {
  return loadedLists.has(`${language}|${ascii}`);
}

export function markWordlistLoaded(language: string, ascii: boolean): void {
  loadedLists.add(`${language}|${ascii}`);
}

export function forgetLoadedWordlists(): void {
  loadedLists.clear();
}
