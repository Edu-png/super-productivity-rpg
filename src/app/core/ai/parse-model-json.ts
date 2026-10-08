/**
 * Parses the JSON inside a model answer. JSON mode returns it bare, but a
 * searched (grounded) answer comes as text: usually wrapped in a ```json
 * fence, sometimes with a sentence around it - and the JSON strings may hold
 * their own ```python fences, so the first closing fence isn't the end.
 * Tries, in order: the whole text, the outermost fence, and the span from the
 * first { or [ to the last } or ].
 */
export const parseModelJson = <T>(text: string): T => {
  const trimmed = text.trim();
  const candidates = [trimmed];
  const fenced = /^```(?:json)?\s*([\s\S]*)```$/.exec(trimmed);
  if (fenced) candidates.push(fenced[1].trim());
  const start = trimmed.search(/[[{]/);
  const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
  if (start >= 0 && end > start) candidates.push(trimmed.slice(start, end + 1));
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
};
