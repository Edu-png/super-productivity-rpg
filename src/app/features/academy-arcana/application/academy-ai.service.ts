import { inject, Injectable } from '@angular/core';
import { GeminiPart, GeminiService } from '../../../core/ai/gemini.service';
import { CodeLabRunnerService } from '../../code-lab/code-lab-runner.service';
import { outputMatches } from '../../code-lab/code-lab-output';
import { CodeLabChallenge, CodeLabTest } from '../../code-lab/code-lab.model';

export interface AiFlashcard {
  question: string;
  answer: string;
}

export interface AiQuizQuestion {
  /** "code": an exercise judged by its tests (options/correctIndex unused). */
  kind: 'choice' | 'code';
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  challenge?: CodeLabChallenge;
  /** Reference solution, shown after the quiz is graded. */
  solution?: string;
}

/** Quiz question as the model returns it, before validation. */
interface AiRawQuizQuestion {
  kind?: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  language?: string;
  starterCode?: string;
  solution?: string;
  setup?: string;
  ordered?: boolean;
  tests?: CodeLabTest[];
}

export interface AiWeekPlanDay {
  day: string;
  blocks: {
    title: string;
    minutes: number;
    kind: 'estudo' | 'revisão' | 'leitura' | 'sugestão' | 'carreira';
    /** Where to find a suggested content (e.g. a YouTube search). */
    hint?: string;
    /** Ticked off by the user in the plan. */
    done?: boolean;
  }[];
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
  /** 3-4 concrete outcomes the week should deliver. */
  goals?: string[];
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
  private readonly codeRunner = inject(CodeLabRunnerService);

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

  /**
   * 10 questions about a finished subject. Programming subjects (Python/SQL)
   * get 5 interview-style coding exercises (half the quiz) among them; each exercise's
   * tests are checked against the AI's own reference solution and the ones it
   * fails are dropped, so a wrong test never fails the student.
   */
  async quiz(
    topic: string,
    content: string,
    images: string[],
  ): Promise<{ questions: AiQuizQuestion[]; droppedCode: number }> {
    const parts: GeminiPart[] = images
      .slice(0, 3)
      .map(imagePart)
      .filter((part): part is GeminiPart => !!part);
    parts.push({
      text:
        `Assunto concluído: "${topic}".
` +
        (content
          ? `Material do aluno:
${content.slice(0, 15000)}
`
          : '') +
        `Crie um quiz de 10 questões em português para verificar se o aluno aprendeu ` +
        `este assunto${content ? ', baseado principalmente no material e completando com o que o tema pede' : ''}. ` +
        `Dificuldade média.
` +
        `Questões de múltipla escolha: {"kind": "choice", "question": string, "options": string[4], ` +
        `"correctIndex": number (0-3), "explanation": string (1 frase)}.
` +
        `SE o assunto envolver programação em Python ou SQL, faça EXATAMENTE 5 das 10 como exercícios de ` +
        `código estilo entrevista (fácil a médio), na linguagem do assunto: {"kind": "code", ` +
        `"question": string (enunciado claro, com exemplo de entrada e saída), "language": "python" | "sql", ` +
        `"starterCode": string (esqueleto, ex. a assinatura da função), "solution": string (solução correta), ` +
        `"tests": [{"name": string, "stdin": string?, "after": string?, "expected": string}] (3 a 5, ` +
        `com casos de borda), "setup": string?, "ordered": boolean?, "explanation": string}.
` +
        `Regras dos testes de Python: o código do aluno roda, depois "after" (no mesmo escopo), e a ` +
        `SAÍDA (stdout) inteira é comparada com "expected". Prefira pedir uma função e testar com ` +
        `after = "print(funcao(args))"; se pedir um programa que lê input(), use "stdin" (uma linha por input). ` +
        `"expected" é exatamente o que o print mostraria (repr do Python para listas/dicts, True/False).
` +
        `Regras de SQL (SQLite): "setup" cria as tabelas e insere os dados (CREATE TABLE + INSERT, poucos ` +
        `registros); o aluno escreve UMA consulta; "expected" tem uma linha por registro do resultado, ` +
        `valores separados por " | ", NULL escrito como NULL, sem cabeçalho; "ordered": true só se o ` +
        `enunciado exige ORDER BY. Evite resultados com casas decimais longas.
` +
        `Se o assunto NÃO for de programação, faça as 10 de múltipla escolha.
` +
        (content
          ? ''
          : `O aluno não tem anotações deste assunto: pesquise na web o conteúdo que ele ` +
            `costuma cobrir (cursos, documentação) e baseie as questões nisso.
`) +
        `Responda só JSON: {"questions": [...]}`,
    });
    // Without notes the quiz is grounded on a web search instead.
    const result = await this.gemini.generateJson<
      { questions?: AiRawQuizQuestion[] } | AiRawQuizQuestion[]
    >(parts, { search: !content });
    // The model sometimes answers with the bare array instead of {questions}.
    const raw = Array.isArray(result) ? result : (result.questions ?? []);
    const questions: AiQuizQuestion[] = [];
    let droppedCode = 0;
    for (const item of raw) {
      if (item?.kind === 'code') {
        const code = await this.validCodeQuestion(item, questions.length);
        if (code) questions.push(code);
        else droppedCode++;
      } else if (
        item.question &&
        item.options?.length >= 2 &&
        item.correctIndex >= 0 &&
        item.correctIndex < item.options.length
      ) {
        questions.push({
          kind: 'choice',
          question: item.question,
          options: item.options,
          correctIndex: item.correctIndex,
          explanation: item.explanation ?? '',
        });
      }
    }
    return { questions: questions.slice(0, 10), droppedCode };
  }

  /** Keeps only the tests the reference solution passes; null when none survive. */
  private async validCodeQuestion(
    item: AiRawQuizQuestion,
    index: number,
  ): Promise<AiQuizQuestion | null> {
    const language =
      item.language === 'sql' ? 'sql' : item.language === 'python' ? 'python' : null;
    if (!language || !item.question || !item.solution || !item.tests?.length) return null;
    const tests: CodeLabTest[] = [];
    for (const test of item.tests) {
      if (!test?.name || typeof test.expected !== 'string') continue;
      const run = await this.codeRunner.run(language, item.solution, {
        stdin: test.stdin,
        setup: item.setup,
        after: test.after,
      });
      const ordered = language === 'python' || !!item.ordered;
      if (!run.error && outputMatches(run.output, test.expected, ordered))
        tests.push(test);
    }
    if (!tests.length) return null;
    return {
      kind: 'code',
      question: item.question,
      options: [],
      correctIndex: -1,
      explanation: item.explanation ?? '',
      solution: item.solution,
      challenge: {
        id: `quiz-${Date.now()}-${index}`,
        language,
        prompt: item.question,
        starterCode: item.starterCode ?? '',
        setup: item.setup,
        tests,
        ordered: item.ordered,
      },
    };
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

  async weekPlan(
    context: string,
    minutesPerDay: number,
    careerMinutes: number,
  ): Promise<AiWeekPlan> {
    return this.gemini.generateJson<AiWeekPlan>([
      {
        text:
          `Monte um plano de estudo para os dias úteis listados, em português, ` +
          `seguindo estas regras:\n` +
          `1. ESTUDO: blocos de 50 min, tirados SÓ da "FILA DE ESTUDO", na ordem ` +
          `dada - cada item já é o conteúdo concreto a estudar (os marcados ` +
          `CONTINUAR foram estudados por último e vêm primeiro). Use o conteúdo ` +
          `exato da fila, nunca só o nome do curso ou da área. O item principal ` +
          `continua em dias seguidos até avançar bem (no máximo 2 itens de estudo ` +
          `diferentes por dia). Título do bloco = os 2-3 últimos níveis do caminho ` +
          `(ex.: "Python › Seção 1: Lógica de Programação").\n` +
          `2. MISTURA: nunca coloque 2 blocos seguidos do mesmo assunto no dia - ` +
          `intercale estudo, revisão e leitura, e assuntos diferentes (Python, AWS, ` +
          `ML...). Quando houver um segundo item de estudo no dia, alterne-o entre ` +
          `os itens da fila ao longo da semana, em vez de repetir o mesmo.\n` +
          `3. REVISÃO: TODAS as revisões da lista "REVISÕES" precisam entrar no ` +
          `plano, cada uma com tempo reservado. As ATRASADAS vão nos primeiros dias; ` +
          `as que vencem na semana, no dia do vencimento (ou no dia seguinte, se o ` +
          `dia lotar). Blocos de 25 min com no máximo 2 revisões cada (ex.: ` +
          `"Revisão: A e B"); pode haver mais de um bloco de revisão no dia. ` +
          `Revisão tem prioridade sobre leitura. Itens com nota abaixo de 70% primeiro.\n` +
          `4. LEITURA: só os livros da lista "LIVROS DE DATA SCIENCE"; se estiver ` +
          `vazia, não coloque leitura. No máximo 1 bloco de leitura por dia.\n` +
          `5. Não invente assuntos que não estejam nas listas. O plano é só de ` +
          `Ciência de Dados.\n` +
          `6. LIMITE DE TEMPO: cada dia soma NO MÁXIMO ${minutesPerDay} min no total ` +
          `(estudo + revisão + leitura). Ex.: com 100 min, 50 de estudo + 25 de ` +
          `revisão + 25 de leitura. Ordem de prioridade dentro do dia: revisões ` +
          `que vencem/estão atrasadas, depois estudo da fila, depois leitura.\n` +
          (careerMinutes
            ? `7. CARREIRA: além do limite, cada dia ganha UM bloco extra kind ` +
              `"carreira" de até ${careerMinutes} min com a próxima ação do "PLANO DE ` +
              `CARREIRA", na ordem de prioridade. Continue a mesma ação nos dias ` +
              `seguintes até cobrir as horas estimadas dela. Se a lista estiver ` +
              `vazia, não coloque carreira.\n`
            : `7. Não coloque blocos de carreira.\n`) +
          `8. Use exatamente os rótulos de "DIAS DO PLANO", um dia para cada (só dias ` +
          `úteis; sábado e domingo ficam livres).\n` +
          `9. METAS: 3 metas concretas e verificáveis do que a semana entrega se o ` +
          `plano for cumprido (ex.: "Zerar as 3 revisões atrasadas", "Concluir ` +
          `Semana 01 de ML Specialist", "Avançar Python POO até o fim da seção 2").\n\n` +
          `Dados:\n${context}\n\n` +
          `Responda só JSON: {"summary": string (2 frases), "goals": string[3], ` +
          `"days": [{"day": string (ex.: "Seg 06/10"), "blocks": [{"title": string, ` +
          `"minutes": number, "kind": "estudo"|"revisão"|"leitura"|"carreira"}], ` +
          `"note": string (curta)}]}`,
      },
    ]);
  }

  /** Lighter plan for several side areas, suggesting topics where nothing is in progress. */
  async otherAreasWeekPlan(context: string, minutesPerDay: number): Promise<AiWeekPlan> {
    return this.gemini.generateJson<AiWeekPlan>([
      {
        text:
          `Monte um plano de estudo para os dias úteis listados, em português, para ` +
          `áreas variadas (o aluno estuda vários temas, um pouco de cada). Regras:\n` +
          `1. Só as áreas de "ÁREAS DO PLANO". UMA ÁREA POR DIA: todos os blocos do ` +
          `dia (estudo, sugestão e revisão) são da mesma área - nunca misture áreas ` +
          `no mesmo dia. Distribua as áreas pelos dias da semana; se houver mais ` +
          `áreas que dias, priorize as que têm revisões e conteúdo em andamento.\n` +
          `2. ESTUDO: se a área tem conteúdo na "FILA DE ESTUDO", use esse conteúdo ` +
          `exato (os marcados CONTINUAR primeiro), kind "estudo". Título = os 2-3 ` +
          `últimos níveis do caminho.\n` +
          `3. SUGESTÃO: para as áreas em "ÁREAS SEM NADA EM ANDAMENTO", sugira um ` +
          `tema concreto e introdutório para a semana (kind "sugestão"), ex.: ` +
          `"Psicologia: córtex pré-frontal e tomada de decisão". Prefira algo do ` +
          `backlog dela, se houver. Siga o "FOCO E PREFERÊNCIAS DO ALUNO". Só ` +
          `conteúdo gratuito, fácil de achar (YouTube, artigos abertos); em "hint" ` +
          `diga onde achar, ex.: 'YouTube: "dopamina e motivação"'. Se a área ` +
          `aparecer em mais de um dia, continue o mesmo tema, aprofundando.\n` +
          `4. REVISÃO: TODAS as revisões da lista entram, cada uma com tempo ` +
          `reservado (blocos de 15-25 min, no máximo 2 revisões por bloco). ` +
          `Cada revisão vai no dia da área dela; a área com revisões ATRASADAS ` +
          `ganha um dos primeiros dias. Revisão tem prioridade sobre o resto do ` +
          `dia. Itens com nota abaixo de 70% primeiro.\n` +
          `5. LIMITE DE TEMPO: cada dia soma NO MÁXIMO ${minutesPerDay} min no ` +
          `total. Blocos de estudo/sugestão de 20 a 45 min.\n` +
          `6. Use exatamente os rótulos de "DIAS DO PLANO", um dia para cada.\n` +
          `7. METAS: 3 metas concretas e verificáveis do que a semana entrega.\n\n` +
          `Dados:\n${context}\n\n` +
          `Responda só JSON: {"summary": string (2 frases), "goals": string[3], ` +
          `"days": [{"day": string, "blocks": [{"title": string, "minutes": number, ` +
          `"kind": "estudo"|"revisão"|"sugestão", "hint": string (só em sugestão)}], ` +
          `"note": string (curta)}]}`,
      },
    ]);
  }
}
