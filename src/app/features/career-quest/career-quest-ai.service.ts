import { inject, Injectable } from '@angular/core';
import { GeminiPart, GeminiService } from '../../core/ai/gemini.service';
import {
  CareerAiReview,
  CareerCodeReview,
  CareerContent,
  CareerContentBlock,
  CareerGradingGroup,
  CareerQuest,
  CareerQuestContent,
  CareerSkillDef,
} from './career-quest.model';

export interface CareerInterviewResult {
  items: { score: number; feedback: string; ideal: string }[];
  score: number;
  verdict: string;
  summary: string;
  english: string;
}

export interface CareerAiQuestDraft {
  title: string;
  objective: string;
  deliverable: string;
  estimatedHours: number;
  /** Builder markup (see career-content-markup). */
  content: string;
}

export interface CareerAiSyllabus {
  modules: {
    title: string;
    description: string;
    topics: { title: string; search: string }[];
  }[];
}

const blockText = (block: CareerContentBlock): string => {
  switch (block.type) {
    case 'heading':
      return `## ${block.text}`;
    case 'paragraph':
    case 'quote':
      return block.text;
    case 'callout':
      return `(${block.tone}) ${block.text}`;
    case 'list':
      return block.items
        .map((item, i) => (block.ordered ? `${i + 1}. ` : '- ') + item)
        .join('\n');
    case 'code':
      return `\`\`\`${block.language}\n${block.code}\n\`\`\``;
    default:
      return '';
  }
};

/** Structured quest content → plain text for prompts. */
export const careerContentToText = (content: CareerContent | undefined): string => {
  if (!content) return '';
  const parts = [
    ...(content.sections ?? []).map(
      (section) => `# ${section.title}\n${section.blocks.map(blockText).join('\n')}`,
    ),
    ...(content.blocks ?? []).map(blockText),
  ];
  return parts.join('\n\n');
};

const imagePart = (dataUrl: string): GeminiPart | null => {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  return match ? { inlineData: { mimeType: match[1], data: match[2] } } : null;
};

/** Career Quest features backed by Gemini (answers in pt-BR). */
@Injectable({ providedIn: 'root' })
export class CareerQuestAiService {
  private readonly gemini = inject(GeminiService);

  /**
   * Grades a submission against the test's statement, rubric and solution.
   * Strict: an item only passes when every one of its criteria is met.
   */
  async grade(
    quest: CareerQuest,
    content: CareerQuestContent,
    submission: string,
    images: string[],
  ): Promise<CareerAiReview> {
    const groups: CareerGradingGroup[] = content.grading?.groups ?? [];
    const items = groups.flatMap((group) =>
      group.items.map((item) => ({
        id: item.id,
        label: item.label,
        criteria: item.criteria,
      })),
    );
    const parts: GeminiPart[] = images
      .slice(0, 4)
      .map(imagePart)
      .filter((part): part is GeminiPart => !!part);
    parts.push({
      text:
        `Você é um corretor técnico exigente e justo. Corrija a entrega do aluno ` +
        `para o teste abaixo, em português.\n\n` +
        `# TESTE: ${quest.title}\nObjetivo: ${quest.objective}\n` +
        `Entregável: ${quest.deliverable}\n\n` +
        `# ENUNCIADO\n${careerContentToText(content.promptContent).slice(0, 15000)}\n\n` +
        (content.evaluationRubric
          ? `# RUBRICA\n${careerContentToText(content.evaluationRubric).slice(0, 6000)}\n\n`
          : '') +
        (content.solutionContent
          ? `# GABARITO (referência, não é a única solução válida)\n${careerContentToText(
              content.solutionContent,
            ).slice(0, 10000)}\n\n`
          : '') +
        (items.length
          ? `# ITENS A CORRIGIR (cada item só passa se cumprir TODOS os critérios)\n${items
              .map(
                (item) =>
                  `- id "${item.id}": ${item.label}\n${item.criteria
                    .map((criterion) => `  * ${criterion}`)
                    .join('\n')}`,
              )
              .join('\n')}\n\n`
          : `# Não há itens: avalie a entrega como um todo com o id "geral".\n\n`) +
        `# ENTREGA DO ALUNO\n${submission.slice(0, 40000) || '(só imagens anexadas)'}\n\n` +
        `Regras: analise o código/texto de verdade (simule a execução mentalmente, ` +
        `procure bugs e casos de borda). Item não respondido = reprovado. ` +
        `Feedback de 1-3 frases por item, dizendo o que faltou ou o que estava certo.\n` +
        `Responda só JSON: {"items": [{"id": string, "passed": boolean, ` +
        `"feedback": string}], "score": number (0-100), "summary": string (2-3 ` +
        `frases), "strengths": string[] (até 3), "improve": string[] (até 3, ` +
        `concretos)}`,
    });
    const result = await this.gemini.generateJson<{
      items: { id: string; passed: boolean; feedback: string }[];
      score: number;
      summary: string;
      strengths: string[];
      improve: string[];
    }>(parts);
    const byId: CareerAiReview['items'] = {};
    for (const item of result.items ?? []) {
      byId[item.id] = { passed: !!item.passed, feedback: item.feedback ?? '' };
    }
    return {
      at: Date.now(),
      items: byId,
      score: Math.max(0, Math.min(100, Math.round(Number(result.score) || 0))),
      summary: result.summary ?? '',
      strengths: result.strengths ?? [],
      improve: result.improve ?? [],
    };
  }

  /** Technical interview questions for a skill at a level (pt or en). */
  async interviewQuestions(
    skill: CareerSkillDef,
    level: number,
    lang: 'pt' | 'en',
  ): Promise<string[]> {
    const result = await this.gemini.generateJson<{ questions: string[] }>([
      {
        text:
          `You are a technical interviewer for a junior/mid Data Science / Data ` +
          `Engineering role. Skill: "${skill.id} · ${skill.name}" (${skill.group}), ` +
          `target level ${level}: ${skill.criteria[level - 1] ?? ''}.\n` +
          `Write 5 interview questions ${lang === 'en' ? 'IN ENGLISH' : 'EM PORTUGUÊS'}: ` +
          `1 concept, 1 "explain how/why", 1 practical scenario, 1 trade-off, 1 about ` +
          `a past project/experience. Return only JSON: {"questions": string[5]}`,
      },
    ]);
    return (result.questions ?? []).filter(Boolean).slice(0, 5);
  }

  async gradeInterview(
    skill: CareerSkillDef,
    level: number,
    lang: 'pt' | 'en',
    answers: { question: string; answer: string }[],
  ): Promise<CareerInterviewResult> {
    const result = await this.gemini.generateJson<CareerInterviewResult>([
      {
        text:
          `Avalie esta entrevista técnica (skill "${skill.id} · ${skill.name}", nível ` +
          `${level}). Seja um entrevistador realista: técnica correta, clareza, ` +
          `exemplos concretos. Feedback em português.` +
          (lang === 'en'
            ? ` As respostas foram em inglês: avalie também o inglês (gramática, ` +
              `vocabulário, naturalidade) em "english", com correções de frases.`
            : '') +
          `\n` +
          answers
            .map(
              (item, index) =>
                `${index + 1}. P: ${item.question}\n   R: ${item.answer || '(em branco)'}`,
            )
            .join('\n') +
          `\n\nResponda só JSON: {"items": [{"score": number (0-100), "feedback": ` +
          `string, "ideal": string (resposta modelo curta${lang === 'en' ? ', in English' : ''})}], ` +
          `"score": number (0-100), "verdict": "aprovado"|"no limite"|"reprovado", ` +
          `"summary": string, "english": string ("" se não se aplica)}`,
      },
    ]);
    return {
      items: result.items ?? [],
      score: Math.max(0, Math.min(100, Math.round(Number(result.score) || 0))),
      verdict: result.verdict ?? 'no limite',
      summary: result.summary ?? '',
      english: result.english ?? '',
    };
  }

  /** Pull-request style review of a capstone's code. */
  async codeReview(
    title: string,
    goal: string,
    code: string,
    images: string[],
  ): Promise<CareerCodeReview> {
    const parts: GeminiPart[] = images
      .slice(0, 4)
      .map(imagePart)
      .filter((part): part is GeminiPart => !!part);
    parts.push({
      text:
        `Faça um code review estilo pull request, em português, do projeto ` +
        `"${title}" (objetivo: ${goal}). Seja específico: cite arquivo/função/linha ` +
        `quando possível. Procure bugs, problemas de dados (vazamento, NaN, tipos), ` +
        `legibilidade, estrutura, testes, reprodutibilidade e segurança.\n\n` +
        `CÓDIGO:\n${code.slice(0, 60000)}\n\n` +
        `Responda só JSON: {"score": number (0-100), "summary": string (2-3 frases), ` +
        `"issues": [{"severity": "alta"|"média"|"baixa", "where": string, "problem": ` +
        `string, "suggestion": string}] (até 10, mais graves primeiro), ` +
        `"readability": string, "recruiter": string (o que um recrutador/tech lead ` +
        `notaria no portfólio), "nextSteps": string[] (até 4)}`,
    });
    const result = await this.gemini.generateJson<CareerCodeReview>(parts);
    return {
      at: Date.now(),
      score: Math.max(0, Math.min(100, Math.round(Number(result.score) || 0))),
      summary: result.summary ?? '',
      issues: result.issues ?? [],
      readability: result.readability ?? '',
      recruiter: result.recruiter ?? '',
      nextSteps: result.nextSteps ?? [],
    };
  }

  /** A complete quest (statement in builder markup) to reach `level` in a skill. */
  draftQuest(
    skill: CareerSkillDef,
    level: number,
    existing: string[],
  ): Promise<CareerAiQuestDraft> {
    return this.gemini.generateJson<CareerAiQuestDraft>([
      {
        text:
          `Crie uma quest prática (exercício/miniprojeto) em português para a skill ` +
          `"${skill.id} · ${skill.name}" (grupo ${skill.group}), para provar o nível ${level}.\n` +
          `O que o nível ${level} significa: ${skill.criteria[level - 1] ?? ''}\n` +
          `Quests que já existem (não repita): ${JSON.stringify(existing.slice(0, 40))}\n` +
          `O enunciado ("content") deve usar este markup simples: "# Seção" para seções, ` +
          `"## Título", listas com "- ", blocos de código com crases triplas e a ` +
          `linguagem, "!i" para dica, "!!" para aviso. Inclua: contexto, tarefas ` +
          `numeradas, dados de exemplo quando fizer sentido, critérios de aceite e ` +
          `um desafio extra. Sem solução.\n` +
          `Responda só JSON: {"title": string, "objective": string (1 frase), ` +
          `"deliverable": string, "estimatedHours": number, "content": string}`,
      },
    ]);
  }

  /** Study outline (modules → topics with search terms) for a skill's next level. */
  syllabus(
    skill: CareerSkillDef,
    fromLevel: number,
    toLevel: number,
  ): Promise<CareerAiSyllabus> {
    return this.gemini.generateJson<CareerAiSyllabus>([
      {
        text:
          `Monte uma trilha de estudo em português para a skill "${skill.id} · ${skill.name}", ` +
          `do nível ${fromLevel} ao ${toLevel}.\n` +
          `Nível ${toLevel} significa: ${skill.criteria[toLevel - 1] ?? ''}\n` +
          `4 a 7 módulos em ordem de estudo, cada um com 3 a 6 tópicos. Para cada ` +
          `tópico, um termo de busca curto (para YouTube/Google/documentação), sem URLs.\n` +
          `Responda só JSON: {"modules": [{"title": string, "description": string (1 ` +
          `frase), "topics": [{"title": string, "search": string}]}]}`,
      },
    ]);
  }
}
