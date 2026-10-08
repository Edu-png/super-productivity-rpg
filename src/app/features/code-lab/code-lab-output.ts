/**
 * Output comparison forgiving only what interview judges forgive: trailing
 * spaces on each line, Windows line breaks and blank lines at the end.
 * With `ordered` false (SQL without ORDER BY), the line order doesn't count.
 */
export const normalizeOutput = (text: string): string[] => {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines;
};

export const outputMatches = (
  actual: string,
  expected: string,
  ordered = true,
): boolean => {
  const got = normalizeOutput(actual);
  const want = normalizeOutput(expected);
  if (got.length !== want.length) return false;
  if (!ordered) {
    got.sort();
    want.sort();
  }
  return got.every((line, index) => line === want[index]);
};

/** SQL result rows as text: one row per line, values joined by " | ", NULL spelled out. */
export const formatSqlRows = (rows: unknown[][]): string =>
  rows
    .map((row) =>
      row.map((value) => (value === null ? 'NULL' : String(value))).join(' | '),
    )
    .join('\n');
