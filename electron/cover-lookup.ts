import { ipcMain } from 'electron';
import { IPC } from './shared-with-frontend/ipc-events.const';
import { error, log } from 'electron-log/main';
import { generate } from './gemini';

/**
 * Finds cover images in free public catalogs (no API key): Open Library,
 * Google Books and Wikipedia (pt/en) for books; Steam and Wikipedia for games.
 * Candidates are ranked by how well their title matches - a result carrying a
 * sequel number the searched title doesn't have ("Some Game 2" for
 * "Some Game") is rejected. Runs in the main process so the
 * renderer's CORS rules don't apply; only these fixed hosts are contacted.
 */
const TIMEOUT_MS = 10_000;

interface Candidate {
  url: string;
  label: string;
  source: string;
  score: number;
}

export interface CoverResult {
  dataUrl: string;
  label: string;
  source: string;
}

const getJson = async <T>(url: string): Promise<T | null> => {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'SuperProductivityRPG/1.0 (cover lookup)' },
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
};

const toDataUrl = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'SuperProductivityRPG/1.0 (cover lookup)' },
    });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') ?? 'image/jpeg';
    if (!type.startsWith('image/')) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    // Placeholders ("no cover" gifs) are tiny.
    if (buffer.length < 3_000) return null;
    return `data:${type};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
};

const normalize = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const SEQUEL = /^(\d{1,2}|ii|iii|iv|v|vi|vii|viii|ix|x)$/;
const STOP = new Set([
  'the',
  'a',
  'o',
  'os',
  'as',
  'de',
  'do',
  'da',
  'e',
  'and',
  'of',
  'um',
  'uma',
]);

/** 0..1 title similarity; 0 when the candidate is a different numbered entry. */
const titleScore = (wanted: string, candidate: string): number => {
  const wantedWords = normalize(wanted).split(' ').filter(Boolean);
  const candidateWords = normalize(candidate).split(' ').filter(Boolean);
  const wantedNumbers = new Set(wantedWords.filter((word) => SEQUEL.test(word)));
  const candidateNumbers = candidateWords.filter((word) => SEQUEL.test(word));
  if (candidateNumbers.some((word) => !wantedNumbers.has(word))) return 0;
  if ([...wantedNumbers].some((word) => !candidateWords.includes(word))) return 0;
  const a = new Set(wantedWords.filter((word) => !STOP.has(word)));
  const b = new Set(candidateWords.filter((word) => !STOP.has(word)));
  if (!a.size || !b.size) return normalize(wanted) === normalize(candidate) ? 1 : 0;
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared / (a.size + b.size - shared);
};

const wikipedia = async (
  lang: 'pt' | 'en',
  search: string,
  wanted: string,
  source: string,
): Promise<Candidate[]> => {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: search,
    gsrlimit: '4',
    prop: 'pageimages',
    piprop: 'original',
    format: 'json',
  });
  const result = await getJson<{
    query?: { pages?: Record<string, { title: string; original?: { source?: string } }> };
  }>(`https://${lang}.wikipedia.org/w/api.php?${params}`);
  return Object.values(result?.query?.pages ?? {})
    .filter((page) => page.original?.source && !/\.svg$/i.test(page.original.source))
    .map((page) => ({
      url: page.original!.source!,
      label: page.title,
      source,
      // Wikipedia titles carry "(livro)"/"(video game)" - score the bare title.
      score: titleScore(wanted, page.title.replace(/\s*\(.*\)\s*$/, '')) * 0.9,
    }));
};

const bookCandidates = async (title: string, author: string): Promise<Candidate[]> => {
  const query = `${title} ${author}`.trim();
  const [openLibrary, googleExact, googleLoose, wikiPt, wikiEn] = await Promise.all([
    getJson<{ docs?: { title: string; cover_i?: number; author_name?: string[] }[] }>(
      `https://openlibrary.org/search.json?${new URLSearchParams({
        q: query,
        limit: '10',
        fields: 'title,cover_i,author_name',
      })}`,
    ),
    getJson<{
      items?: { volumeInfo?: { title?: string; imageLinks?: { thumbnail?: string } } }[];
    }>(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
        `intitle:${title}${author ? ` inauthor:${author}` : ''}`,
      )}&maxResults=8`,
    ),
    getJson<{
      items?: { volumeInfo?: { title?: string; imageLinks?: { thumbnail?: string } } }[];
    }>(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=8&langRestrict=pt`,
    ),
    wikipedia('pt', `${title} ${author} livro`, title, 'Wikipédia'),
    wikipedia('en', `${title} ${author} novel`, title, 'Wikipedia'),
  ]);
  const candidates: Candidate[] = [];
  for (const doc of openLibrary?.docs ?? []) {
    if (!doc.cover_i) continue;
    const authorMatch =
      !author || (doc.author_name ?? []).some((name) => titleScore(author, name) > 0.3);
    candidates.push({
      url: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
      label: doc.title,
      source: 'Open Library',
      score: titleScore(title, doc.title) * (authorMatch ? 1 : 0.6),
    });
  }
  for (const item of [...(googleExact?.items ?? []), ...(googleLoose?.items ?? [])]) {
    const thumb = item.volumeInfo?.imageLinks?.thumbnail;
    if (!thumb) continue;
    candidates.push({
      url: thumb.replace('http://', 'https://').replace('&edge=curl', ''),
      label: item.volumeInfo?.title ?? '',
      source: 'Google Books',
      score: titleScore(title, item.volumeInfo?.title ?? '') * 0.95,
    });
  }
  candidates.push(...wikiPt, ...wikiEn);
  if (!candidates.some((candidate) => candidate.score >= 0.5)) {
    candidates.push(...(await originalEditionCandidates(title, author)));
  }
  return candidates;
};

/**
 * Brazilian titles are often missing from the catalogs, which do have the
 * original edition ("Parque Jurássico" -> "Jurassic Park"). Asks Gemini (when
 * configured) for the original title and ISBNs, then searches with those.
 */
const originalEditionCandidates = async (
  title: string,
  author: string,
): Promise<Candidate[]> => {
  let info: { originalTitle?: string; isbns?: string[] } = {};
  try {
    const { text } = await generate(
      [
        {
          text:
            `Livro "${title}"${author ? ` de ${author}` : ''}. Responda só JSON: ` +
            `{"originalTitle": string (título na língua original), "isbns": string[] ` +
            `(até 4 ISBN-13 conhecidos, de preferência edições brasileiras)}`,
        },
      ],
      true,
    );
    info = JSON.parse(text.replace(/^```(json)?\s*|\s*```$/g, ''));
  } catch {
    return [];
  }
  const candidates: Candidate[] = [];
  for (const isbn of (info.isbns ?? []).slice(0, 4)) {
    const digits = String(isbn).replace(/[^0-9X]/gi, '');
    if (digits.length < 10) continue;
    candidates.push({
      url: `https://covers.openlibrary.org/b/isbn/${digits}-L.jpg?default=false`,
      label: `${title} (ISBN ${digits})`,
      source: 'Open Library',
      score: 0.85,
    });
  }
  const original = info.originalTitle?.trim();
  if (original && normalize(original) !== normalize(title)) {
    const result = await getJson<{
      docs?: { title: string; cover_i?: number; author_name?: string[] }[];
    }>(
      `https://openlibrary.org/search.json?${new URLSearchParams({
        q: `${original} ${author}`.trim(),
        limit: '8',
        fields: 'title,cover_i,author_name',
      })}`,
    );
    for (const doc of result?.docs ?? []) {
      if (!doc.cover_i) continue;
      candidates.push({
        url: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
        label: doc.title,
        source: 'Open Library (título original)',
        score: titleScore(original, doc.title) * 0.8,
      });
    }
  }
  return candidates;
};

const gameCandidates = async (title: string): Promise<Candidate[]> => {
  const [steam, wikiEn, wikiPt] = await Promise.all([
    getJson<{ items?: { id: number; name: string }[] }>(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(title)}&l=portuguese&cc=BR`,
    ),
    wikipedia('en', `${title} video game`, title, 'Wikipedia'),
    wikipedia('pt', `${title} jogo eletrônico`, title, 'Wikipédia'),
  ]);
  const candidates: Candidate[] = [];
  for (const item of (steam?.items ?? []).slice(0, 6)) {
    const score = titleScore(title, item.name);
    for (const file of ['library_600x900.jpg', 'header.jpg']) {
      candidates.push({
        url: `https://cdn.akamai.steamstatic.com/steam/apps/${item.id}/${file}`,
        label: item.name,
        source: 'Steam',
        score: file === 'header.jpg' ? score * 0.8 : score,
      });
    }
  }
  candidates.push(...wikiEn, ...wikiPt);
  return candidates;
};

/** Ranked, de-duplicated, downloadable candidates. */
const findCovers = async (
  kind: 'book' | 'game',
  title: string,
  author: string,
  limit: number,
  minScore: number,
): Promise<CoverResult[]> => {
  const all =
    kind === 'game' ? await gameCandidates(title) : await bookCandidates(title, author);
  const seen = new Set<string>();
  const ranked = all
    .filter((candidate) => candidate.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .filter((candidate) => !seen.has(candidate.url) && !!seen.add(candidate.url));
  const results: CoverResult[] = [];
  for (const candidate of ranked) {
    if (results.length >= limit) break;
    const dataUrl = await toDataUrl(candidate.url);
    if (dataUrl)
      results.push({ dataUrl, label: candidate.label, source: candidate.source });
  }
  return results;
};

export const initCoverLookupIpc = (): void => {
  // Best single match (automatic use) - only confident matches.
  ipcMain.handle(
    IPC.COVER_LOOKUP,
    async (_ev, args: { kind: 'book' | 'game'; title: string; author?: string }) => {
      try {
        const title = String(args?.title ?? '').trim();
        if (!title) return null;
        const [best] = await findCovers(
          args.kind === 'game' ? 'game' : 'book',
          title,
          String(args.author ?? '').trim(),
          1,
          0.5,
        );
        return best?.dataUrl ?? null;
      } catch (e) {
        log('COVER_LOOKUP failed');
        error(e);
        return null;
      }
    },
  );
  // Several options for the "Escolher capa" picker - looser matching.
  ipcMain.handle(
    IPC.COVER_CANDIDATES,
    async (_ev, args: { kind: 'book' | 'game'; title: string; author?: string }) => {
      try {
        const title = String(args?.title ?? '').trim();
        if (!title) return [];
        return await findCovers(
          args.kind === 'game' ? 'game' : 'book',
          title,
          String(args.author ?? '').trim(),
          8,
          0.15,
        );
      } catch (e) {
        log('COVER_CANDIDATES failed');
        error(e);
        return [];
      }
    },
  );
};

/** Exposed for a quick manual check outside Electron. */
export const _coverLookupForTest = { findCovers, titleScore };
