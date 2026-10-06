# Release checklist

This file has the results of all Manual criteria of the [PRD](PRD.md) for each release. The release workflow (`.github/workflows/release.yml`) stops if the entry for the version is not complete. The script `scripts/check-release-checklist.mjs` does this check.

## How to use this file

1. Before a release, copy the table of the section "Template" into a new section `## <version>`. Use the version of the release commit, in the form `YYYY.MM.DD-HHMM`. The new section goes above all older sections.
2. Replace `<version>` in each row with the real version.
3. A person does each check. The person writes the result, the name, and the date.
4. A row is complete when the result is `pass`, the person is a name, and the date is in the form `YYYY-MM-DD`. A check that fails stays in the table with the result `fail` and stops the release. Fix the problem and write a new `pass` result with a note after the criterion.
5. Each language of the release needs a row `WORDLIST-REVIEW <code>`: a native speaker reviews the word list (PRD section 7.3). For a language with two variants, the reviewer comes from the country of the variant, for example a person from Québec for `fr-CA`. The reviewer reads the list for unknown words, rude words, grammar words, spelling errors, and words of the other variant. A language without a `pass` is not released.

The person who reviews a word list must not be the person who wrote its configuration.

## Columns

| Column    | Meaning                                                    |
| --------- | ---------------------------------------------------------- |
| Version   | The version of the release.                                |
| Criterion | The requirement ID and a short name, or `WORDLIST-REVIEW`. |
| Result    | `pass` or `fail`.                                          |
| Person    | The name of the person who did the check.                  |
| Date      | The date of the check, `YYYY-MM-DD`.                       |

## Template

| Version     | Criterion                          | Result | Person | Date |
| ----------- | ---------------------------------- | ------ | ------ | ---- |
| `<version>` | FR-74 Translation guide            |        |        |      |
| `<version>` | SR-11 Trust in the host page       |        |        |      |
| `<version>` | NFR-3 VoiceOver in Safari on macOS |        |        |      |
| `<version>` | NFR-3 NVDA in Firefox on Windows   |        |        |      |
| `<version>` | NFR-7 Development process          |        |        |      |
| `<version>` | TDD-3 Tests before code            |        |        |      |
| `<version>` | TDD-5 Refactors                    |        |        |      |
| `<version>` | WORDLIST-REVIEW en-US              |        |        |      |
| `<version>` | WORDLIST-REVIEW en-GB              |        |        |      |
| `<version>` | WORDLIST-REVIEW de                 |        |        |      |
| `<version>` | WORDLIST-REVIEW fr-FR              |        |        |      |
| `<version>` | WORDLIST-REVIEW fr-CA              |        |        |      |
| `<version>` | WORDLIST-REVIEW es                 |        |        |      |
| `<version>` | WORDLIST-REVIEW it                 |        |        |      |
| `<version>` | WORDLIST-REVIEW pt-PT              |        |        |      |
| `<version>` | WORDLIST-REVIEW pt-BR              |        |        |      |
| `<version>` | WORDLIST-REVIEW nl                 |        |        |      |
| `<version>` | WORDLIST-REVIEW sv                 |        |        |      |
| `<version>` | WORDLIST-REVIEW nb                 |        |        |      |
| `<version>` | WORDLIST-REVIEW da                 |        |        |      |
| `<version>` | WORDLIST-REVIEW fi                 |        |        |      |
| `<version>` | WORDLIST-REVIEW pl                 |        |        |      |

What each check means:

- **FR-74 Translation guide.** A person who did not write the guide follows `CONTRIBUTING.md` "How to add a translation". The person adds a test translation, builds the component, and sees the new text. The person changes no code.
- **SR-11 Trust in the host page.** A person reads the section "Trust in the host page" of the README. It has both statements and is correct.
- **NFR-3 VoiceOver in Safari on macOS.** A person does each action of PRD section 8.4 with VoiceOver in Safari on macOS.
- **NFR-3 NVDA in Firefox on Windows.** A person does each action of PRD section 8.4 with NVDA in Firefox on Windows.
- **NFR-7 Development process.** A reviewer checks that the review items of PRD section 10.1 were done for all pull requests of this release.
- **TDD-3 Tests before code.** A reviewer marked the TDD-3 item in each pull request of this release.
- **TDD-5 Refactors.** A reviewer marked the TDD-5 item in each pull request of this release.
- **WORDLIST-REVIEW `<code>`.** A native speaker approves the word list of the language (PRD section 7.3).

## Releases

No release has been made yet. Add the section of each release below this line, newest first.
