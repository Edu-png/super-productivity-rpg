import {
  CareerCodeLanguage,
  CareerContent,
  CareerContentBlock,
  CareerContentSection,
} from '../career-quest.model';

/**
 * Tiny, safe markup for the quest builder → structured content blocks.
 * Nothing here produces HTML: the result is rendered by Angular templates,
 * which escape every string, so user content can never inject markup or code.
 *
 *   # Seção           → collapsible section (long content)
 *   ## Título         → heading
 *   - item / * item   → bullet list        1. item → numbered list
 *   ```python … ```   → code block (any supported language)
 *   > texto           → quote               !! texto → warning callout
 *   !i texto          → info callout        !t texto → tip callout
 *   ---               → divider             anything else → paragraph
 */

export const CAREER_CODE_LANGUAGES: CareerCodeLanguage[] = [
  'python',
  'sql',
  'bash',
  'shell',
  'json',
  'yaml',
  'dockerfile',
  'javascript',
  'typescript',
  'text',
];

const LANGUAGE_ALIASES = new Map<string, CareerCodeLanguage>([
  ['py', 'python'],
  ['sh', 'shell'],
  ['zsh', 'shell'],
  ['yml', 'yaml'],
  ['docker', 'dockerfile'],
  ['js', 'javascript'],
  ['ts', 'typescript'],
  ['', 'text'],
]);

export const normalizeLanguage = (raw: string): CareerCodeLanguage => {
  const value = raw.trim().toLowerCase();
  if ((CAREER_CODE_LANGUAGES as string[]).includes(value)) {
    return value as CareerCodeLanguage;
  }
  return LANGUAGE_ALIASES.get(value) ?? 'text';
};

export const parseCareerMarkup = (text: string): CareerContent => {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const sections: CareerContentSection[] = [];
  let blocks: CareerContentBlock[] = [];
  let paragraph: string[] = [];
  let list: { items: string[]; ordered: boolean } | null = null;

  const flushParagraph = (): void => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };
  const flushList = (): void => {
    if (list) blocks.push({ type: 'list', items: list.items, ordered: list.ordered });
    list = null;
  };
  const flush = (): void => {
    flushParagraph();
    flushList();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const fence = trimmed.match(/^```\s*([\w+-]*)\s*$/);
    if (fence) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(lines[i]);
        i++;
      }
      // Code keeps its exact indentation and line breaks.
      blocks.push({
        type: 'code',
        language: normalizeLanguage(fence[1]),
        code: code.join('\n'),
      });
      continue;
    }

    if (!trimmed) {
      flush();
      continue;
    }
    if (/^#\s+/.test(trimmed)) {
      flush();
      if (blocks.length || sections.length) {
        if (sections.length) sections[sections.length - 1].blocks = blocks;
        else if (blocks.length) sections.push({ title: 'Introdução', blocks });
      }
      sections.push({ title: trimmed.replace(/^#\s+/, ''), blocks: [] });
      blocks = [];
      continue;
    }
    if (/^#{2,}\s+/.test(trimmed)) {
      flush();
      blocks.push({ type: 'heading', text: trimmed.replace(/^#{2,}\s+/, '') });
      continue;
    }
    if (trimmed === '---') {
      flush();
      blocks.push({ type: 'divider' });
      continue;
    }
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = !!numbered;
      const item = (bullet ?? numbered)![1];
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { items: [], ordered };
      }
      list.items.push(item);
      continue;
    }
    if (trimmed.startsWith('> ')) {
      flush();
      blocks.push({ type: 'quote', text: trimmed.slice(2) });
      continue;
    }
    const callout = trimmed.match(/^!([!it])\s+(.*)$/);
    if (callout) {
      flush();
      const tone = callout[1] === '!' ? 'warning' : callout[1] === 'i' ? 'info' : 'tip';
      blocks.push({ type: 'callout', tone, text: callout[2] });
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flush();

  if (sections.length) {
    sections[sections.length - 1].blocks = blocks;
    return { sections };
  }
  return { blocks };
};
