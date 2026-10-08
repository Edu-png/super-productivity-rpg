export type CodeLabLanguage = 'python' | 'sql';

/**
 * One test case, judged by comparing output like interview platforms do.
 * Python: runs the player's code with `stdin`, then `after` (e.g. a call that
 * prints a result) in the same namespace; stdout must equal `expected`.
 * SQL: runs the player's query on the challenge's `setup` database; the rows
 * (one per line, values joined by " | ") must equal `expected`.
 */
export interface CodeLabTest {
  name: string;
  stdin?: string;
  after?: string;
  expected: string;
  /** Hidden cases only show passed/failed, not the expected output. */
  hidden?: boolean;
}

export interface CodeLabChallenge {
  id: string;
  language: CodeLabLanguage;
  /** Problem statement shown above the editor. */
  prompt: string;
  starterCode: string;
  /** SQL: schema + data created before each run. Python: code run before the player's. */
  setup?: string;
  tests: CodeLabTest[];
  /** SQL: whether row order counts (queries with ORDER BY). Default false. */
  ordered?: boolean;
}

export interface CodeLabRun {
  output: string;
  error: string | null;
  timedOut: boolean;
}

export interface CodeLabTestResult {
  test: CodeLabTest;
  passed: boolean;
  output: string;
  error: string | null;
}
