import {
  AcademyBackup,
  AcademyDashboardSnapshot,
  AcademySettings,
  Flashcard,
  FlashcardReview,
  StudyArea,
  StudyMaterial,
  StudyNode,
  StudySession,
} from './academy.models';

export abstract class AcademyRepository {
  abstract listAreas(profileId: string): Promise<StudyArea[]>;
  abstract putArea(area: StudyArea): Promise<void>;
  abstract listNodes(profileId: string, areaId?: string): Promise<StudyNode[]>;
  abstract putNode(node: StudyNode): Promise<void>;
  abstract listMaterials(profileId: string, nodeId: string): Promise<StudyMaterial[]>;
  abstract putMaterial(material: StudyMaterial): Promise<void>;
  abstract putSession(session: StudySession): Promise<void>;
  abstract getSession(id: string): Promise<StudySession | undefined>;
  abstract listSessions(
    profileId: string,
    from: number,
    to: number,
    offset: number,
    limit: number,
  ): Promise<StudySession[]>;
  abstract putFlashcard(card: Flashcard): Promise<void>;
  abstract countFlashcards(profileId: string): Promise<number>;
  abstract countLearnedCards(profileId: string): Promise<number>;
  abstract getDueFlashcards(
    profileId: string,
    before: number,
    limit: number,
  ): Promise<Flashcard[]>;
  abstract putReview(review: FlashcardReview): Promise<void>;
  abstract getFlashcard(id: string): Promise<Flashcard | undefined>;
  abstract dashboard(profileId: string, now: Date): Promise<AcademyDashboardSnapshot>;
  abstract getSettings(profileId: string): Promise<AcademySettings>;
  abstract putSettings(settings: AcademySettings): Promise<void>;
  abstract export(profileId: string, domains?: string[]): Promise<AcademyBackup>;
  abstract import(backup: AcademyBackup): Promise<void>;
}
