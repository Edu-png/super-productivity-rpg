import { CodeLabChallenge } from '../code-lab/code-lab.model';

export type CareerAttribute = 'technical' | 'english' | 'evidence' | 'interview';
export type CareerSkillClass = 'core' | 'important' | 'supporting' | 'awareness';
export type CareerAiPolicy = 'no-ai' | 'ai-limited' | 'ai-allowed';
export type CareerQuestType = 'micro' | 'quest' | 'project' | 'boss';
export type CareerQuestStatus = 'todo' | 'doing' | 'done';
/** When a skill matters: NOW = current focus, NEXT = next 3–6 months, LATER = future. */
export type CareerHorizon = 'now' | 'next' | 'later';

// ---- structured quest content (rendered without innerHTML: always text) ----
export type CareerCodeLanguage =
  | 'python'
  | 'sql'
  | 'bash'
  | 'shell'
  | 'json'
  | 'yaml'
  | 'dockerfile'
  | 'javascript'
  | 'typescript'
  | 'text';

export type CareerContentBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'code'; language: CareerCodeLanguage; code: string; title?: string }
  | { type: 'callout'; tone: 'info' | 'warning' | 'tip'; text: string }
  | { type: 'divider' }
  | { type: 'quote'; text: string }
  /** Runnable exercise: editor + tests (see code-lab). */
  | { type: 'challenge'; challenge: CodeLabChallenge };

/** A titled part of long content; rendered as a collapsible section. */
export interface CareerContentSection {
  title: string;
  blocks: CareerContentBlock[];
}

export interface CareerContent {
  /** Long content: collapsible sections (first two open). */
  sections?: CareerContentSection[];
  /** Short content: plain blocks, no collapsibles. */
  blocks?: CareerContentBlock[];
}

/** What the player sees, how it's graded and the answer - kept apart on purpose. */
export interface CareerQuestContent {
  promptContent: CareerContent;
  evaluationRubric?: CareerContent;
  solutionContent?: CareerContent;
  /** In-app self-grading: one group per skill the test settles. */
  grading?: CareerQuestGrading;
}

export type CareerSelfGrade = 'solo' | 'doc' | 'fail';

export interface CareerGradingItem {
  id: string;
  label: string;
  /** What the answer must meet to count as done. */
  criteria: string[];
}

export interface CareerGradingGroup {
  skillId: string;
  level: number;
  label: string;
  /** Items needed to pass. */
  passMin: number;
  /** Whether "done with the docs" counts (true) or only "done alone" (false). */
  countsDoc: boolean;
  items: CareerGradingItem[];
}

export interface CareerQuestGrading {
  groups: CareerGradingGroup[];
}

// ---- capstones ----
export interface CareerCapstoneDef {
  id: string;
  title: string;
  summary: string;
  /** Skills this project validates (evidence for them). */
  skillIds: string[];
  /** Capstones that should be done first + skill levels expected before starting. */
  prerequisites: string[];
  expectedLevel: number;
  aiPolicy: CareerAiPolicy;
  aiNote: string;
  deliverables: string[];
  evidence: string[];
  checklist: string[];
  xp: number;
  coins: number;
}

export interface CareerCapstoneState {
  status: CareerQuestStatus;
  checked: number[];
  completedAt?: number;
  /** Last AI code review of the project. */
  codeReview?: CareerCodeReview;
}

export interface CareerCodeReview {
  at: number;
  score: number;
  summary: string;
  issues: { severity: string; where: string; problem: string; suggestion: string }[];
  readability: string;
  recruiter: string;
  nextSteps: string[];
}

/** Static definition of a skill (catalog - generic, no personal data). */
export interface CareerSkillDef {
  id: string;
  attribute: CareerAttribute;
  group: string;
  name: string;
  skillClass: CareerSkillClass;
  /** Target level after 12 and 24 months. */
  target12: number;
  target24: number;
  /** Roadmap month when the skill becomes a focus. */
  startMonth: number;
  /** Skills that must reach a level before this one should be started. */
  prerequisites: { id: string; level: number }[];
  /** criteria[0] = what Level 1 means ... criteria[4] = Level 5. */
  criteria: string[];
  /** Default timing; the player can override it per skill. */
  horizon: CareerHorizon;
}

/** One piece of proof for a skill at a given level. */
export interface CareerEvidence {
  id: string;
  skillId: string;
  level: number;
  kind: 'artifact' | 'explanation' | 'test';
  title: string;
  url: string;
  note: string;
  aiPolicy: CareerAiPolicy;
  /** Tests only: whether it was passed. A failed test keeps the skill where it is. */
  passed?: boolean;
  at: number;
}

export interface CareerQuest {
  id: string;
  type: CareerQuestType;
  title: string;
  skillIds: string[];
  level: number;
  objective: string;
  /** 1 (easy) .. 5 (very hard). */
  difficulty: number;
  aiPolicy: CareerAiPolicy;
  deliverable: string;
  evidence: string;
  estimatedHours: number;
  prerequisites: string;
  /** Roadmap week (1-based) for planned quests; undefined for custom/boss ones. */
  week?: number;
  status: CareerQuestStatus;
  completedAt?: number;
  /** Custom quests: content written in the builder's simple markup. */
  content?: string;
  /** Self-grading answers per grading item, and when the result was recorded. */
  selfGrade?: Record<string, CareerSelfGrade>;
  gradedAt?: number;
  /** What was sent to the AI grader (kept so it can be re-graded/reviewed). */
  aiSubmission?: string;
  /** Whether the documentation was consulted (passed items count as "doc"). */
  aiUsedDocs?: boolean;
  aiReview?: CareerAiReview;
}

export interface CareerAiReview {
  at: number;
  /** Per grading item (or "geral" for quests without a rubric). */
  items: Record<string, { passed: boolean; feedback: string }>;
  score: number;
  summary: string;
  strengths: string[];
  improve: string[];
}

export interface CareerSkillState {
  level: number;
  /** True until the level is backed by a recorded test (entrance or level test). */
  provisional: boolean;
  /** Academia Arcana node used as this skill's study playlist. */
  academyNodeId?: string | null;
  levelChangedAt?: number;
}

/** Per-character Career Quest progress, stored inside the RPG character. */
export interface CareerQuestState {
  skills: Record<string, CareerSkillState>;
  evidence: CareerEvidence[];
  quests: CareerQuest[];
  /** Skills the player added on top of the catalog. */
  customSkills?: CareerSkillDef[];
  /** Player renames of catalog skills (custom skills are edited in place). */
  skillNameOverrides?: Record<string, string>;
  /** Player renames of the four attributes. */
  attributeLabels?: Partial<Record<CareerAttribute, string>>;
  /** Pace targets (hours per day/week, quests and evidence per week). */
  paceTargets?: CareerPaceTargets;
  /** Active Focus: the few skills competing for attention right now. */
  focus?: string[];
  /** Player changes to a skill's NOW/NEXT/LATER timing. */
  horizonOverrides?: Record<string, CareerHorizon>;
  /** Progress on the integrating Capstone Projects. */
  capstones?: Record<string, CareerCapstoneState>;
  seededAt: number;
}

/** Concrete rhythm goals shown under the Career Quest header. */
export interface CareerPaceTargets {
  dailyStudyMinutes: number;
  weeklyStudyMinutes: number;
  weeklyQuests: number;
  weeklyEvidence: number;
  /** Count Academia Arcana study sessions as study time. */
  countAcademy: boolean;
  /** Projects whose tracked task time also counts as study. */
  studyProjectIds: string[];
}
