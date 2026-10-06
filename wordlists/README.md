# Word lists

This folder holds the word lists of Hekate and the files that build them.
The build tool is `cargo xtask`. It follows section 7 of the product requirements (`docs/PRD.md`).

## What is in a language folder

Each language has one folder. The folder name is the language code, for example `en-US`.

| File | Who writes it | Job |
|---|---|---|
| `config.toml` | A person | Sources, download links, hashes, `s`, `r`, `n`, length limits, ASCII rules |
| `blocklist.txt` | A person (native speakers keep it up to date) | Rude and unwanted words. One word per line. Lines that start with `#` are comments |
| `extra-words.txt` | A person (optional) | Words that the team writes by hand, for example Québec words. Needs an `[extra]` table in `config.toml` |
| `words.txt` | `cargo xtask wordlists` | The list. One word per line |
| `words-ascii.txt` | `cargo xtask wordlists` | The ASCII list (PRD 7.4) |
| `manifest.json` | `cargo xtask wordlists` | Counts, entropy, sources, licenses, credit text, SHA-256 hashes |
| `LICENSE` | `cargo xtask wordlists` | The license terms of the list, made from the sources |
| `CREDITS.md` | `cargo xtask wordlists` | The credits, made from the sources |

The built files are in git. CI builds the lists again and compares them byte for byte with the files in git.
`benchmark/` holds the results of the benchmark (see below). `hashes.tsv` is made by `cargo xtask wasm`. It is not in git.

## Commands

Run all commands from the root of the repository.

```text
cargo xtask wordlists [--lang CODE]...     Build the lists. No --lang builds every language.
cargo xtask wordlists --update-hashes ...  Download the sources, record their SHA-256 hashes in config.toml.
cargo xtask benchmark [--lang CODE]...     Measure the S and R values (PRD 7.6).
cargo xtask benchmark select [--lang CODE] Pick S and R from the results and the ratings.
cargo xtask check-manifests                Check licenses, sizes, NFC and hashes (NFR-9).
cargo xtask notice                         Write the root NOTICE file from the manifests.
```

`cargo xtask wordlists` also writes `NOTICE` in the root of the repository.

The build is reproducible. The same inputs give the same bytes. The files hold no dates and no random values.

### How a build works

The build follows the 17 steps of PRD 7.3.

1. It reads `config.toml`, `blocklist.txt` and `extra-words.txt`.
2. For each source file, it looks in the cache `target/wordlist-sources/`. The cache key is the SHA-256 hash of the source file, the counting version, and a short hash of the source settings.
3. If the cache has no result, it streams the file. It downloads, decompresses and counts in one pass. It does not store the whole file. A zip file is the only exception. The zip format needs random access, so the build keeps that one file in memory.
4. It checks the SHA-256 hash of the download. If the hash is wrong, it stops with an error.
5. It makes all words NFC, lowercase and unique. It keeps words with the allowed characters and length. It keeps words that are in the lexicon.
6. It sorts the words by frequency. Rank 1 is the most common word. It skips the top `s` ranks and keeps ranks up to `r`.
7. It removes block list words and takes the next `n - E` words (`E` is the number of extra words). It adds the extra words at the end of the list.
8. It makes the ASCII list and writes all files.

When a language has more than one frequency source, the build adds the relative frequency of each source.
The relative frequency is `count / total count of the source`. Each source can have a `weight` (a whole number, default 1).

### Hashes

Every download link needs a `sha256` in `config.toml`. The build stops if it is missing or wrong.
To record the hashes the first time, or after a source changed on purpose:

1. Run `cargo xtask wordlists --update-hashes --lang CODE`.
2. Read the lines that the command prints. Read the new source file if the hash changed.
3. Review the change in `config.toml` with `git diff`. Commit it.

Local files (`path`) need no hash. The build computes it.

## The `config.toml` schema

All keys are in snake_case. The build stops with an error for an unknown key.

### Top-level keys

| Key | Type | Required | Meaning |
|---|---|---|---|
| `code` | text | yes | Language code. It must match the folder name |
| `name` | text | yes | Name of the language in that language, for example `Svenska` |
| `built_on` | text | yes | Date (`YYYY-MM-DD`) when a person last reviewed and rebuilt the list. It goes into the manifest. It is not a clock, so the build stays reproducible |
| `s` | number | yes | Skip the top `s` ranks |
| `r` | number | yes | Take no word past rank `r` |
| `n` | number | yes | Size of the list. At least 4,096 |
| `min_len`, `max_len` | number | no | Length limits in characters. Defaults 3 and 9. They cannot be wider |
| `alphabet` | text | yes | Allowed characters. A small character class: `a-z` is a range, `\-` is a plain hyphen. Example: `a-zäöüß` |
| `lexicon_case` | `"exact"` or `"fold"` | no | `exact` (default): the lexicon holds the lowercase word. `fold`: the lexicon is lowercased first. Use `fold` for languages with capital nouns, such as German |
| `min_words` | number | fixtures only | Lowers the minimum size. The build accepts it only with `--fixture-dir`. Real languages always need 4,096 words |
| `[ascii]` | table | yes | ASCII rules, see below |
| `[extra]` | table | with `extra-words.txt` | Credit of the extra words: `name`, `version`, `license`, `license_url`, `url`, `credit` |
| `[[sources]]` | list of tables | yes | The sources. At least one frequency source and one lexicon source |

`r - s` must be at least `n`.

### `[ascii]`

| Key | Meaning |
|---|---|
| `strip_accents` | `true`: replace a letter with an accent by the plain letter (`é` becomes `e`) |
| `map` | A table of replacements, applied first. Example: `"ä" = "ae"`. Each key is one character. Each value is ASCII text |

After the conversion, the build removes each word that still has a non-ASCII character.
It removes each word that is longer than `max_len` after the conversion.
If two words become the same, it removes both. The ASCII list needs at least 4,096 words.
If all words of the main list are ASCII, `words-ascii.txt` is a copy of `words.txt` and the manifest has `ascii_same = true`.
Table 7.1 of the PRD lists the rules for each language.

### `[[sources]]`

| Key | Required | Meaning |
|---|---|---|
| `name`, `version`, `license`, `license_url`, `url`, `credit` | yes | Facts for the credits. `url` is the home page, not the download. `version` is the version, tag, commit or copy date. `license` must be on the allowed list of PRD 7.2 (see `cargo xtask check-manifests`) |
| `role` | yes | `frequency` or `lexicon` |
| `format` | yes | How to read the file. See the format table |
| `license_text` | no | A notice that goes into the `LICENSE` file, for example a copyright text |
| `weight` | no | Weight of a frequency source. A whole number. Default 1 |
| `archive` | no | `none` (default), `zip` or `tar`. Gzip and bzip2 compression is found by itself |
| `[[sources.files]]` | yes | The files of the source. See below |

Options of the formats:

| Key | Used by | Meaning |
|---|---|---|
| `year_min`, `year_max` | `ngram-1gram-tsv` | Years to count |
| `min_count` | frequency formats | Drop words with a count below this value in one file. This keeps memory small. Use a value far below the count at rank `r` |
| `delimiter` | `freq-table`, `csv-text`, `table-words` | One character. Default is a tab |
| `header` | the same | `true` if the first row holds column names |
| `word_column`, `count_column`, `text_column` | the same | A column number (the first is 0) or a header name |
| `filters` | the same | A list of `{ column, equals, not_equals, min, max }`. The build keeps only rows that match. `not_equals` drops the rows with this value. Numbers compare as numbers |
| `skip_capitalized` | `freq-table` | `true`: skip rows whose word starts with a capital letter. Use it for a table that keeps the case of base forms, so that names and places do not count as common words |
| `strip_xml` | `text` | Remove XML tags before counting |
| `regex` | `line-regex`, `text` | `line-regex`: group 1 is the word. `text`: the build counts only the words in group 1 of each match, and it decodes XML entities. Use it to read one language from TEI files, for example `<seg [^>]*xml:lang="nl"[^>]*>(.*)</seg>` with `strip_xml` |
| `strip_flags` | `wordlist` | Remove everything from `/` on |
| `latin1` | all formats except `hunspell` | `true` if the file is ISO-8859-1 text, not UTF-8. The build converts it while it reads. `hunspell` reads the `SET` line of the `.aff` file instead |
| `whitespace` | `freq-table` | `true`: fields are separated by runs of spaces or tabs, and leading spaces do not count. The columns must be numbers. No header row and no filters. Use it for the NB N-gram files (`   75045781 og`) |
| `language_qid`, `lang_code`, `exclude_categories` | `wikidata-lexemes` | Language item (for example `Q188`), language code of the words (`de`), item numbers of categories to leave out (for example proper nouns, `Q147276`) |

### `[[sources.files]]`

| Key | Meaning |
|---|---|
| `url` | Download link. `file:///abs/path` also works |
| `path` | A local file, relative to the folder of `config.toml`. Use `url` or `path`, not both |
| `sha256` | SHA-256 of the file as downloaded, before decompression |
| `member` | For `zip` and `tar`: the build reads each member whose path ends with this text |
| `part` | For `hunspell`: `dic` or `aff` |

### Formats

| Format | Role | What it reads |
|---|---|---|
| `ngram-1gram-tsv` | frequency | Google Books Ngram v3 1-gram files. Only plain tokens count. Tokens with a part-of-speech tag (`word_NOUN`) are skipped, because the plain token already holds the total. Tokens are lowercased and joined by NFC |
| `freq-table` | frequency | A table with a word column and an optional count column |
| `ranked-list` | frequency | One word per line, most common first |
| `text` | frequency | Running text. Each word counts once for each occurrence. Use it for ParlaMint text files |
| `csv-text` | frequency | A CSV file with a text column. Use it for ParlaIbero-BR |
| `line-regex` | both | Lines of text. A regular expression picks the words |
| `wordlist` | lexicon | One word per line. Lines that start with `#` are comments |
| `hunspell` | lexicon | A `.dic` and an `.aff` file. The build expands `PFX` and `SFX` rules (strip, append, condition, cross product, continuation flags). It ignores `MAP`, `REP`, `ICONV` and compound rules. It leaves out words with the flags `NOSUGGEST`, `ONLYINCOMPOUND` and `FORBIDDENWORD`. Only UTF-8 and ISO8859-1 files work |
| `wikidata-lexemes` | lexicon | The Wikidata Lexemes JSON dump |
| `table-words` | lexicon | A table with a word column |

Frequency counts are always lowercase. A frequency source needs no lowercase text.

## Annotated example

This is a short version of `en-US/config.toml`.

```toml
code = "en-US"                  # Same as the folder name.
name = "English (US)"           # The language name, in that language.
built_on = "2026-10-07"         # Date of the last review and rebuild.

s = 1000                        # Skip the 1,000 most common words.
r = 30000                       # Do not go past rank 30,000.
n = 7776                        # Make a list of 7,776 words (12.9 bits per word).
min_len = 3
max_len = 9
alphabet = "a-z"                # Only these letters.
lexicon_case = "exact"

[ascii]
strip_accents = true            # English: remove accents.

[[sources]]                     # A frequency source. The counts rank the words.
name = "Google Books Ngram v3, American English (eng-us)"
role = "frequency"
format = "ngram-1gram-tsv"
version = "20200217"
license = "CC BY 3.0"
license_url = "https://creativecommons.org/licenses/by/3.0/"
url = "https://storage.googleapis.com/books/ngrams/books/datasetsv3.html"
credit = "Google Books Ngram Viewer data ... Licensed under CC BY 3.0."
year_min = 1950
year_max = 2019
min_count = 1000

[[sources.files]]               # One entry for each file. The sha256 is filled in by --update-hashes.
url = "https://storage.googleapis.com/books/ngrams/books/20200217/eng-us/1-00000-of-00014.gz"
sha256 = "..."
# ... 13 more files ...

[[sources]]                     # A lexicon. A word must be in it to stay in the list.
name = "SCOWL / ESDB (Hunspell en_US, size 60, American spelling)"
role = "lexicon"
format = "hunspell"
version = "2026.02.25 (tag rel-2026.02.25)"
license = "MIT-style permission"
license_url = "https://github.com/en-wl/wordlist/blob/rel-2026.02.25/Copyright"
url = "https://github.com/en-wl/wordlist"
credit = "SCOWL and Friends. Copyright 2000-2026 by Kevin Atkinson."
archive = "zip"                 # The two files are inside one zip file.

[[sources.files]]
url = "https://github.com/en-wl/wordlist/releases/download/rel-2026.02.25/hunspell-en_US-2026.02.25.zip"
member = "en_US.dic"
part = "dic"
sha256 = "..."

[[sources.files]]
url = "https://github.com/en-wl/wordlist/releases/download/rel-2026.02.25/hunspell-en_US-2026.02.25.zip"
member = "en_US.aff"
part = "aff"
sha256 = "..."
```

## How to add a language

You do not change any code.

1. Make the folder `wordlists/<code>/` with a language code of PRD 7.5.
2. Write `config.toml`. Copy `en-US/config.toml` and change the sources, `alphabet`, `[ascii]` and the credit texts.
3. Check each license against the allowed list of PRD 7.2. Do not use CC BY-SA, NonCommercial or NoDerivatives sources.
4. Write `blocklist.txt`. An empty file is fine for a first build. A native speaker must review it.
5. Optional: write `extra-words.txt` and the `[extra]` table.
6. Run `cargo xtask wordlists --update-hashes --lang <code>`. Review the hashes in `config.toml`.
7. Run `cargo xtask wordlists --lang <code>`. Run it a second time. The files must not change.
8. Run `cargo xtask check-manifests`.
9. Run `cargo xtask benchmark --lang <code>`. Send the sample files to two native speakers. Put their ratings in `benchmark/<code>-ratings.json`. Run `cargo xtask benchmark select --lang <code>`. Set the chosen `s` and `r` in `config.toml`, then build again.
10. Ask a native speaker to review the list (PRD 7.3). Record the review in `docs/release-checklist.md`.

## Benchmark (PRD 7.6)

`cargo xtask benchmark` builds the list size for each combination of S (0, 500, 1,000, 2,000) and R (20,000, 30,000, 50,000).
It writes:

- `benchmark/<code>.json`: the list size and the average word length of each combination, and the selected values.
- `benchmark/<code>/S<s>-R<r>.sample.txt`: 200 words for the speakers to rate "known" or "not known". The sample uses a fixed seed, so it is the same on every run.
- `benchmark/<code>/S<s>.top100.txt`: the 100 most frequent words. The speakers count the grammar words.

The speakers' ratings go into `benchmark/<code>-ratings.json`. Each value is the mean of the two speakers:

```json
{
  "S1000-R30000": { "known_pct": 96.5, "grammar_words": 1 }
}
```

`cargo xtask benchmark select` then applies the rules of PRD 7.6. A combination needs a list size of 7,776 or more
(or the largest list of at least 4,096 words), 95% known words or more, and 2 grammar words or fewer.
It takes the smallest `s`, then the smallest `r`. Without a ratings file, it uses the proposed `s = 1000` and `r = 30000` and says so.

## Tests

`cargo test -p xtask` runs the unit tests and the fixture test of NFR-10.
The fixture is a tiny test language in `xtask/tests/fixtures/xx/`. The test builds it with
`cargo xtask wordlists --fixture-dir DIR` and makes passwords from the result.
Only fixtures may use `min_words`.
