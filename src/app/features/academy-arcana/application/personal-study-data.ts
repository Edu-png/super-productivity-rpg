/**
 * Owner-specific seed data (study history of one real profile). The version in
 * the repository is intentionally EMPTY - personal data never gets committed.
 * The owner keeps the real values only in their local copy of this file
 * (marked with `git update-index --skip-worktree`).
 */
export const PERSONAL_STUDY_DATA: {
  ownerProfileId: string;
  historyAreaTitle: string;
  monthlyMinutes: { year: number; month: number; minutes: number }[];
} = {
  ownerProfileId: '',
  historyAreaTitle: '',
  monthlyMinutes: [],
};
