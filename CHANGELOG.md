# Changelog

Each release has one entry. The version is the UTC time of the release commit,
in the form `YYYY.MM.DD-HHMM`.

## Unreleased

- First implementation of the PRD.
- Show the entropy always. An info icon next to it opens a panel on hover, on
  keyboard focus, or on click. The panel has the notes, the time to crack, and
  the length-based comparison.
- The number of words is a slider with the numbers under the track. The
  separator and the capital letters are radio buttons with examples, on one
  row. No option needs a dropdown list.
- Refresh the look: indigo brand color, rounded controls, and a segmented mode
  control.
- Add the custom property `--hekate-color-on-brand`.
- Remove the warning callouts. The strength label is the only signal.
- Keep the layout stable when the user changes an option.
- Update all dependencies and tools to their newest versions. This fixes known
  security problems in the test tools `happy-dom`, `vitest` and `tinypool`.
  Node.js 24.21.0 has the security fixes of 24.17.0 and 24.18.1.
