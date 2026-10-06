/** One source of a word list, from `wordlists/<code>/manifest.json` (PRD 7.3). */
export interface ManifestSource {
  name: string;
  role: "frequency" | "lexicon" | "extra";
  version: string;
  license: string;
  license_url: string;
  url: string;
  credit: string;
}

export interface Manifest {
  code: string;
  /** Name of the language in that language, for example "Svenska". */
  name: string;
  words: number;
  ascii_words: number;
  ascii_same: boolean;
  entropy_per_word: number;
  entropy_per_word_ascii: number;
  s: number;
  r: number;
  sources: ManifestSource[];
  changed_note: string;
  sha256: { words: string; words_ascii: string };
  build: { xtask_version: string; built_on: string };
}
