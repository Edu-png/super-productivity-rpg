import { inject, Injectable } from '@angular/core';
import { GeminiService } from './gemini.service';

export interface AiBookInfo {
  author: string;
  pages: number | null;
  genres: string[];
  synopsis: string;
  publicationYear: number | null;
  publisher: string;
  language: string;
}

export interface AiGameInfo {
  developer: string;
  publisher: string;
  genres: string[];
  synopsis: string;
  releaseYear: number | null;
  platforms: string[];
}

export interface AiSuggestion {
  title: string;
  creator: string;
  genre: string;
  reason: string;
}

export interface RatedItem {
  title: string;
  creator: string;
  rating: number | null;
  genres: string[];
  extra?: string;
}

/**
 * Cyrillic, Hebrew/Arabic, Thai, Hangul, Kana, CJK and the replacement char -
 * none belong in a Portuguese title.
 */
const NON_LATIN_SCRIPT = new RegExp(
  `[${[
    [0x0400, 0x04ff],
    [0x0590, 0x06ff],
    [0x0e00, 0x0e7f],
    [0x1100, 0x11ff],
    [0x3040, 0x30ff],
    [0x3130, 0x318f],
    [0x4e00, 0x9fff],
    [0xac00, 0xd7af],
    [0xfffd, 0xfffd],
  ]
    .map(([from, to]) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`)
    .join('')}]`,
);

/** Book/game fact sheets and recommendations through Gemini (pt-BR). */
@Injectable({ providedIn: 'root' })
export class MediaAiService {
  private readonly gemini = inject(GeminiService);

  fillBook(title: string, author: string, genreOptions: string[]): Promise<AiBookInfo> {
    return this.gemini.generateJson<AiBookInfo>([
      {
        text:
          `Você é um bibliotecário. Dados do livro: título "${title}"` +
          `${author ? `, autor "${author}"` : ''}.\n` +
          `Responda só JSON: {"author": string, "pages": number|null, ` +
          `"genres": string[] (1 a 3, escolhidos SÓ desta lista: ${JSON.stringify(genreOptions)}), ` +
          `"synopsis": string (2-4 frases em português, sem spoilers), ` +
          `"publicationYear": number|null, "publisher": string, "language": string}.\n` +
          `Prefira a edição brasileira quando existir. Se não souber um campo, use null ou "".`,
      },
    ]);
  }

  fillGame(title: string, genreOptions: string[]): Promise<AiGameInfo> {
    return this.gemini.generateJson<AiGameInfo>([
      {
        text:
          `Dados do jogo eletrônico "${title}".\n` +
          `Responda só JSON: {"developer": string, "publisher": string, ` +
          `"genres": string[] (1 a 3, escolhidos SÓ desta lista: ${JSON.stringify(genreOptions)}), ` +
          `"synopsis": string (2-3 frases em português, sem spoilers), ` +
          `"releaseYear": number|null, ` +
          `"platforms": string[] (só destes: "pc","playstation","xbox","switch","mobile","other")}.\n` +
          `Se não souber um campo, use null ou "".`,
      },
    ]);
  }

  /**
   * 5 new titles based on how the player rated past ones. Anything already in
   * the library or suggested before (`exclude`) is filtered out here too - the
   * model doesn't always respect the list - so each request brings new ones.
   */
  async suggest(
    kind: 'livros' | 'jogos',
    rated: RatedItem[],
    exclude: string[],
    wishlist: string[] = [],
  ): Promise<AiSuggestion[]> {
    const key = (title: string): string =>
      title
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const excluded = new Set(exclude.map(key));
    // The lite model occasionally emits stray characters from another script
    // in the middle of a Portuguese title ("A Pará승니다...") - drop those.
    const garbled = (text: string): boolean => NON_LATIN_SCRIPT.test(text);
    const fresh: AiSuggestion[] = [];
    // One retry when everything came back repeated or garbled.
    for (let attempt = 0; attempt < 2 && fresh.length < 3; attempt++) {
      const suggestions = await this._askSuggestions(
        kind,
        rated,
        [...exclude, ...fresh.map((item) => item.title)],
        wishlist,
      );
      for (const suggestion of suggestions) {
        const id = key(suggestion.title ?? '');
        if (!id || excluded.has(id)) continue;
        if (garbled(`${suggestion.title} ${suggestion.creator} ${suggestion.reason}`))
          continue;
        excluded.add(id);
        fresh.push(suggestion);
      }
    }
    return fresh.slice(0, 5);
  }

  private _askSuggestions(
    kind: 'livros' | 'jogos',
    rated: RatedItem[],
    exclude: string[],
    wishlist: string[],
  ): Promise<AiSuggestion[]> {
    const lines = rated
      .slice(0, 60)
      .map(
        (item) =>
          `- ${item.title}${item.creator ? ` (${item.creator})` : ''} · nota ${
            item.rating ?? 'sem nota'
          }/5 · ${item.genres.join(', ') || 'sem gênero'}${item.extra ? ` · ${item.extra}` : ''}`,
      )
      .join('\n');
    return this.gemini
      .generateJson<{ suggestions: AiSuggestion[] }>([
        {
          text:
            `Recomende 8 ${kind} para esta pessoa com base nas notas que ela deu ` +
            `(5 = adorou, 1 = não gostou). Valorize o que ela avaliou bem e evite o ` +
            `estilo do que avaliou mal. Varie um pouco os gêneros.\n` +
            `Já avaliados:\n${lines || '(nenhum ainda)'}\n` +
            (wishlist.length
              ? `Lista de desejos (o que ela quer ${kind === 'livros' ? 'ler' : 'jogar'} - forte sinal de interesse; ` +
                `considere continuações/sequências, outros da mesma série ou autor e ` +
                `obras parecidas com estes):\n${wishlist
                  .slice(0, 60)
                  .map((title) => `- ${title}`)
                  .join('\n')}\n`
              : '') +
            `NÃO recomende nenhum destes (já estão na biblioteca ou já foram sugeridos): ` +
            `${JSON.stringify(exclude.slice(-300))}.\n` +
            `Use o título como é conhecido no Brasil.\n` +
            `Responda só JSON: {"suggestions": [{"title": string, "creator": string ` +
            `(autor ou desenvolvedora), "genre": string (em português, ex.: "Ficção ` +
            `científica", "Clássico"), "reason": string (1 frase em ` +
            `português ligando a algo que ela avaliou)}]}`,
        },
      ])
      .then((result) => result.suggestions ?? []);
  }
}
