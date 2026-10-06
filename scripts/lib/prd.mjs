// Read requirement rows from the PRD (docs/PRD.md).
// A requirement row is a table row whose first cell is an ID such as FR-63.

const ID_PATTERN = /^(FR|SR|NFR|TDD)-\d+$/;

/** Split one markdown table row into trimmed cells. */
export function splitRow(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  return trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/**
 * Return every requirement of the PRD.
 * Each item has: id, criteria, automated, manual.
 * The criteria text is the last cell of the row.
 */
export function parseRequirements(prdText) {
  const found = [];
  for (const line of prdText.split("\n")) {
    const cells = splitRow(line);
    if (!cells || cells.length < 3 || !ID_PATTERN.test(cells[0])) continue;
    const criteria = cells[cells.length - 1];
    found.push({
      id: cells[0],
      criteria,
      automated: criteria.includes("Automated:"),
      manual: criteria.includes("Manual:"),
    });
  }
  return found;
}

/** Return the rows of the first table whose header starts with the given first cell. */
export function parseTable(prdText, firstHeader) {
  const lines = prdText.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const header = splitRow(lines[i]);
    if (!header || header[0] !== firstHeader) continue;
    const rows = [];
    for (let j = i + 2; j < lines.length; j += 1) {
      const cells = splitRow(lines[j]);
      if (!cells) break;
      rows.push(cells);
    }
    return rows;
  }
  return [];
}

/** The attribute names of table 5.2, for example `mode` and `ascii-only`. */
export function parseAttributes(prdText) {
  return parseTable(prdText, "Attribute").map((cells) => cells[0].replace(/`/g, ""));
}
