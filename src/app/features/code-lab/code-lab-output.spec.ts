import { formatSqlRows, outputMatches } from './code-lab-output';

describe('code-lab-output', () => {
  it('ignores trailing spaces, CRLF and blank lines at the end', () => {
    expect(outputMatches('oi  \r\n\n', 'oi')).toBe(true);
    expect(outputMatches('oi\n', 'Oi')).toBe(false);
    expect(outputMatches('a\n\nb', 'a\nb')).toBe(false);
  });

  it('only ignores line order when not ordered', () => {
    expect(outputMatches('b\na', 'a\nb')).toBe(false);
    expect(outputMatches('b\na', 'a\nb', false)).toBe(true);
    expect(outputMatches('a\na', 'a\nb', false)).toBe(false);
  });

  it('formats SQL rows with NULL spelled out', () => {
    expect(
      formatSqlRows([
        ['Ana', 3],
        ['Bia', null],
      ]),
    ).toBe('Ana | 3\nBia | NULL');
  });
});
