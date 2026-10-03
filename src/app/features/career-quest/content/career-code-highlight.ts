import { CareerCodeLanguage } from '../career-quest.model';

/**
 * Lightweight syntax highlighting: splits code into typed tokens that the
 * template renders as text inside <span>s. No HTML string is ever built, so
 * highlighted code can't inject markup.
 */
export type CodeTokenKind = 'keyword' | 'string' | 'comment' | 'number' | 'plain';

export interface CodeToken {
  text: string;
  kind: CodeTokenKind;
}

const words = (list: string): Set<string> => new Set(list.split(/\s+/).filter(Boolean));

const KEYWORDS: Partial<Record<CareerCodeLanguage, Set<string>>> = {
  python: words(`and as assert async await break class continue def del elif else except
    False finally for from global if import in is lambda None nonlocal not or pass raise
    return True try while with yield self`),
  sql: words(`select from where join left right inner outer full on group by order having
    limit offset as and or not in is null like between case when then else end with union
    all distinct insert into values update set delete create table index primary key
    foreign references over partition row_number rank dense_rank lag lead sum count avg
    min max desc asc coalesce exists`),
  bash: words(`if then else elif fi for while do done case esac function in export
    echo cd ls grep find cat chmod sudo git python pip`),
  javascript: words(`const let var function return if else for while do break continue
    new class extends import export from default async await try catch finally throw
    typeof instanceof null undefined true false this`),
  typescript: words(`const let var function return if else for while do break continue
    new class extends implements interface type enum import export from default async
    await try catch finally throw typeof instanceof null undefined true false this
    public private protected readonly`),
  dockerfile: words(`FROM RUN CMD COPY ADD WORKDIR ENV EXPOSE ENTRYPOINT ARG USER VOLUME
    LABEL HEALTHCHECK AS`),
  yaml: words('true false null yes no'),
  json: words('true false null'),
};
KEYWORDS.shell = KEYWORDS.bash;

const COMMENT_PREFIX: Partial<Record<CareerCodeLanguage, RegExp>> = {
  python: /^#.*/,
  bash: /^#.*/,
  shell: /^#.*/,
  yaml: /^#.*/,
  dockerfile: /^#.*/,
  sql: /^--.*/,
  javascript: /^\/\/.*/,
  typescript: /^\/\/.*/,
};

const STRING =
  /^("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)/;
const NUMBER = /^\d+(?:\.\d+)?/;
const WORD = /^[A-Za-z_][\w]*/;

export const highlightCode = (
  code: string,
  language: CareerCodeLanguage,
): CodeToken[] => {
  if (language === 'text') return [{ text: code, kind: 'plain' }];
  const keywords = KEYWORDS[language] ?? new Set<string>();
  const caseInsensitive = language === 'sql';
  const comment = COMMENT_PREFIX[language];
  const tokens: CodeToken[] = [];
  const push = (text: string, kind: CodeTokenKind): void => {
    const last = tokens[tokens.length - 1];
    if (last && last.kind === kind && kind === 'plain') last.text += text;
    else tokens.push({ text, kind });
  };

  let rest = code;
  while (rest.length) {
    const commentMatch = comment ? rest.match(comment) : null;
    if (commentMatch) {
      push(commentMatch[0], 'comment');
      rest = rest.slice(commentMatch[0].length);
      continue;
    }
    const stringMatch = rest.match(STRING);
    if (stringMatch) {
      push(stringMatch[0], 'string');
      rest = rest.slice(stringMatch[0].length);
      continue;
    }
    const numberMatch = rest.match(NUMBER);
    if (numberMatch) {
      push(numberMatch[0], 'number');
      rest = rest.slice(numberMatch[0].length);
      continue;
    }
    const wordMatch = rest.match(WORD);
    if (wordMatch) {
      const word = wordMatch[0];
      const isKeyword = keywords.has(caseInsensitive ? word.toLowerCase() : word);
      push(word, isKeyword ? 'keyword' : 'plain');
      rest = rest.slice(word.length);
      continue;
    }
    // Comments only start a line or follow whitespace/code; walk one char.
    const char = rest[0];
    push(char, 'plain');
    rest = rest.slice(1);
  }
  return tokens;
};
