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
}

export interface WordOptions {
  language: string;
  ascii: boolean;
  words: number;
  separator: Separator;
  capitalization: Capitalization;
  number: boolean;
  symbol: boolean;
}

export interface CharacterOptions {
  length: number;
  charsets: readonly Charset[];
  avoidSimilar: boolean;
}

export interface Engine {
  loadWordlist(language: string, ascii: boolean, bytes: Uint8Array): void;
  generateWords(options: WordOptions): Generated;
  generateCharacters(options: CharacterOptions): Generated;
}

const MASK: Record<Charset, number> = { lower: 1, upper: 2, digits: 4, symbols: 8 };

interface WasmGenerated {
  readonly password: string;
  readonly kinds: string;
  readonly entropyBits: number;
  readonly crackSeconds: number;
  readonly strength: string;
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
    generateWords: (o) =>
      read(
        wasm.generateWords(
          o.language,
          o.ascii,
          o.words,
          o.separator,
          o.capitalization,
          o.number,
          o.symbol,
        ),
      ),
    generateCharacters: (o) =>
      read(
        wasm.generateCharacters(
          o.length,
          o.charsets.reduce((mask, set) => mask | MASK[set], 0),
          o.avoidSimilar,
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
