import { inject, Injectable } from '@angular/core';
import { GeminiPart, GeminiService } from '../../../core/ai/gemini.service';

export interface AiFlashcard {
  question: string;
  answer: string;
}

export interface AiQuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface AiWeekPlanDay {
  day: string;
  blocks: { title: string; minutes: number; kind: 'estudo' | 'revisão' | 'leitura' }[];
  note: string;
}

export interface AiActiveReviewResult {
  items: { score: number; feedback: string; missing: string }[];
  overall: number;
  summary: string;
}

export interface AiMindMap {
  center: string;
  branches: { label: string; children: string[] }[];
}

export interface AiWeekPlan {
  summary: string;
  days: AiWeekPlanDay[];
}

const imagePart = (dataUrl: string): GeminiPart | null => {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  return match ? { inlineData: { mimeType: match[1], data: match[2] } } : null;
};

/** Academia Arcana features backed by Gemini (all answers in pt-BR). */
@Injectable({ providedIn: 'root' })
export class AcademyAiService {
  private readonly gemini = inject(GeminiService);

  /** Transcribes a (handwritten) notebook page. */
  async readPhoto(dataUrl: string): Promise<string> {
    const image = imagePart(dataUrl);
    if (!image) throw new Error('Imagem inválida.');
    const text = await this.gemini.generate([
      image,
      {
        text:
          'Transcreva fielmente todo o texto desta foto de anotações (pode ser ' +
          'manuscrito, em português). Mantenha a estrutura com quebras de linha, ' +
          'listas e títulos em Markdown simples. Descreva diagramas em uma linha ' +
          'entre colchetes. Responda só com a transcrição.',
      },
    ]);
    return text.trim();
  }

  /** 5 flashcards from a piece of text and/or a page image. */
  async flashcards(
    topic: string,
    source: { text?: string; imageDataUrl?: string },
    avoid: string[] = [],
  ): Promise<AiFlashcard[]> {
    const parts: GeminiPart[] = [];
    const image = source.imageDataUrl ? imagePart(source.imageDataUrl) : null;
    if (image) parts.push(image);
    parts.push({
      text:
        `Assunto: "${topic}".\n` +
        (source.text ? `Conteúdo:\n${source.text.slice(0, 12000)}\n` : '') +
        `Crie 7 flashcards em português para revisão ativa, baseados SÓ neste ` +
        `conteúdo${image ? ' (e na imagem)' : ''}. Quero cards elaborados, não ` +
        `decoreba: misture tipos - "por que...", "como...", "qual a diferença ` +
        `entre...", "dê um exemplo de...", "o que acontece se...". Cada pergunta ` +
        `cobre uma ideia diferente. Respostas de 2 a 4 frases, explicando o ` +
        `raciocínio e, quando couber, com um exemplo concreto.\n` +
        (avoid.length
          ? `JÁ EXISTEM estes flashcards - não repita nem reformule nenhum deles, ` +
            `cubra outros pontos:\n${avoid
              .slice(-120)
              .map((question) => `- ${question}`)
              .join('\n')}\n`
          : '') +
        `Responda só JSON: {"cards": [{"question": string, "answer": string}]}`,
    });
    const result = await this.gemini.generateJson<{ cards: AiFlashcard[] }>(parts);
    // 7 asked so the caller still has 5 after dropping near-duplicates.
    return (result.cards ?? []).filter((card) => card.question && card.answer);
  }

  /** 5 multiple-choice questions about a finished subject. */
  async quiz(
    topic: string,
    content: string,
    images: string[],
  ): Promise<AiQuizQuestion[]> {
    const parts: GeminiPart[] = images
      .slice(0, 3)
      .map(imagePart)
      .filter((part): part is GeminiPart => !!part);
    parts.push({
      text:
        `Assunto concluído: "${topic}".\n` +
        (content ? `Material do aluno:\n${content.slice(0, 15000)}\n` : '') +
        `Crie um quiz de 10 questões de múltipla escolha em português para verificar ` +
        `se o aluno aprendeu este assunto${content ? ', baseado principalmente no material' : ''}. ` +
        `4 alternativas cada, só uma correta, dificuldade média. ` +
        `Responda só JSON: {"questions": [{"question": string, "options": string[4], ` +
        `"correctIndex": number (0-3), "explanation": string (1 frase)}]}`,
    });
    const result = await this.gemini.generateJson<{ questions: AiQuizQuestion[] }>(parts);
    return (result.questions ?? [])
      .filter(
        (item) =>
          item.question &&
          item.options?.length >= 2 &&
          item.correctIndex >= 0 &&
          item.correctIndex < item.options.length,
      )
      .slice(0, 10);
  }

  /** Tutor chat grounded on the student's own material, citing the source. */
  async tutor(
    topic: string,
    material: string,
    history: { role: 'user' | 'tutor'; text: string }[],
    question: string,
  ): Promise<string> {
    const conversation = history
      .slice(-8)
      .map((turn) => `${turn.role === 'user' ? 'Aluno' : 'Tutor'}: ${turn.text}`)
      .join('\n');
    const text = await this.gemini.generate([
      {
        text:
          `Você é um tutor paciente. Assunto: "${topic}".\n` +
          `MATERIAL DO ALUNO (cada parte marcada com [fonte]):\n${material.slice(0, 30000) || '(vazio)'}\n\n` +
          (conversation ? `Conversa até aqui:\n${conversation}\n\n` : '') +
          `Pergunta do aluno: ${question}\n\n` +
          `Regras: responda em português, baseado PRINCIPALMENTE no material. ` +
          `Cite a fonte entre colchetes, ex.: [foto 2 · Seção 1] ou [anotações · Variáveis]. ` +
          `Se o material não cobrir, diga "Isso não está no seu material" e então ` +
          `explique mesmo assim, marcando como [conhecimento geral]. Use exemplos ` +
          `simples, no máximo 3 parágrafos curtos ou uma lista.`,
      },
    ]);
    return text.trim();
  }

  /** 3 open questions for an active (written) review. */
  async activeReviewQuestions(topic: string, material: string): Promise<string[]> {
    const result = await this.gemini.generateJson<{ questions: string[] }>([
      {
        text:
          `Assunto: "${topic}".\nMaterial:\n${material.slice(0, 20000) || '(só o título)'}\n\n` +
          `Crie 3 perguntas ABERTAS em português para o aluno responder de memória, com ` +
          `as próprias palavras: 1 de conceito, 1 de "por que/como funciona" e 1 de ` +
          `aplicação ou exemplo. Responda só JSON: {"questions": string[3]}`,
      },
    ]);
    return (result.questions ?? []).filter(Boolean).slice(0, 3);
  }

  /** Grades written answers; rating maps to the spaced-repetition buttons. */
  async gradeActiveReview(
    topic: string,
    material: string,
    answers: { question: string; answer: string }[],
  ): Promise<AiActiveReviewResult> {
    const result = await this.gemini.generateJson<AiActiveReviewResult>([
      {
        text:
          `Assunto: "${topic}".\nMaterial de referência:\n${material.slice(0, 20000)}\n\n` +
          `Corrija as respostas do aluno (escritas de memória), em português, com ` +
          `justiça: valorize a ideia certa mesmo com palavras simples.\n` +
          answers
            .map(
              (item, index) =>
                `${index + 1}. Pergunta: ${item.question}\n   Resposta: ${item.answer || '(em branco)'}`,
            )
            .join('\n') +
          `\n\nResponda só JSON: {"items": [{"score": number (0-100), "feedback": string ` +
          `(1-2 frases), "missing": string (o que faltou; "" se nada)}], "overall": ` +
          `number (0-100), "summary": string (1-2 frases)}`,
      },
    ]);
    return {
      items: result.items ?? [],
      overall: Math.max(0, Math.min(100, Math.round(Number(result.overall) || 0))),
      summary: result.summary ?? '',
    };
  }

  /** One-page Markdown summary of a module's material. */
  async summary(topic: string, material: string): Promise<string> {
    const text = await this.gemini.generate([
      {
        text:
          `Faça um resumo de 1 página em Markdown, em português, do assunto "${topic}" ` +
          `usando o material abaixo. Estrutura: "### Ideia central" (2-3 frases), ` +
          `"### Conceitos-chave" (lista com definição curta), "### Exemplos" (curtos, ` +
          `com código se o material tiver), "### Erros comuns", "### Para revisar" ` +
          `(3 perguntas). Não invente o que não está no material.\n\nMaterial:\n` +
          material.slice(0, 30000),
      },
    ]);
    return text.replace(/^```(markdown|md)?\s*|\s*```$/g, '').trim();
  }

  /** Mind map structure: center → 3-7 branches → 0-5 leaves each. */
  async mindMap(topic: string, material: string): Promise<AiMindMap> {
    return this.gemini.generateJson<AiMindMap>([
      {
        text:
          `Monte um mapa mental em português do assunto "${topic}" a partir do ` +
          `material. Centro = o assunto (curto). 3 a 7 ramos principais, cada um com ` +
          `0 a 5 folhas. Rótulos curtos (no máximo 6 palavras).\nMaterial:\n` +
          `${material.slice(0, 25000) || '(só o título)'}\n` +
          `Responda só JSON: {"center": string, "branches": [{"label": string, ` +
          `"children": string[]}]}`,
      },
    ]);
  }

  async weekPlan(context: string, minutesPerDay: number): Promise<AiWeekPlan> {
    return this.gemini.generateJson<AiWeekPlan>([
      {
        text:
          `Monte um plano de estudo para os próximos 7 dias, em português, seguindo ` +
          `estas regras:\n` +
          `1. ESTUDO: blocos de 50 min, tirados SÓ da "FILA DE ESTUDO", na ordem ` +
          `dada. Continue o mesmo item em dias seguidos até avançar bem antes de ` +
          `pular para o próximo (no máximo 2 itens diferentes por dia). Escreva o ` +
          `título do bloco com o caminho curto (ex.: "Curso X › Seção 2").\n` +
          `2. REVISÃO: no máximo UM bloco de 25 min por dia, juntando 2-4 revisões ` +
          `pendentes no mesmo bloco (ex.: "Revisão: A, B e C"). Comece pelos itens ` +
          `com nota abaixo de 70%. Não precisa zerar todas as revisões na semana.\n` +
          `3. LEITURA: só os livros da lista "LIVROS DE DATA SCIENCE"; se estiver ` +
          `vazia, não coloque leitura. No máximo 1 bloco de leitura por dia.\n` +
          `4. Não invente assuntos que não estejam nas listas.\n` +
          `5. LIMITE DE TEMPO: cada dia soma NO MÁXIMO ${minutesPerDay} min no total ` +
          `(estudo + revisão + leitura). Ex.: com 100 min, 50 de estudo + 25 de ` +
          `revisão + 25 de leitura, ou 2 blocos de 50. Prefira encher o dia com estudo ` +
          `da fila; revisão e leitura entram quando couberem. Deixe 1 dia mais leve.\n\n` +
          `Dados:\n${context}\n\n` +
          `Responda só JSON: {"summary": string (2 frases), "days": [{"day": string ` +
          `(ex.: "Seg 06/10"), "blocks": [{"title": string, "minutes": number, ` +
          `"kind": "estudo"|"revisão"|"leitura"}], "note": string (curta)}]}`,
      },
    ]);
  }
}
