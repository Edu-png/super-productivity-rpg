/**
 * Simplified spaced-repetition scheduler for topic reviews, inspired by FSRS
 * (Free Spaced Repetition Scheduler) - NOT a re-implementation of the full
 * 17-weight FSRS algorithm (those weights are trained on large review
 * datasets and hand-reproducing them from memory risks silently wrong
 * numbers with no way to verify them here). Instead this keeps the same core
 * model FSRS is built on:
 *
 * - each topic has its own `stability` (days) and `difficulty` (1-10),
 *   evolving independently per topic instead of a fixed step ladder shared
 *   by everything (academy-arcana spec explicitly rules out a fixed ladder);
 * - `retrievability` uses FSRS's actual forgetting-curve formula
 *   R = (1 + t / (9 * S)) ^ -1, so recalling something right at the edge of
 *   forgetting counts as stronger evidence than recalling something still
 *   fresh;
 * - the next interval is derived from the new stability at a fixed 90%
 *   target retention, where FSRS's own formula collapses to
 *   interval ≈ stability (t = S * 9 * (1/0.9 - 1) = S).
 *
 * Rating scale matches the UI: 1 Esqueci, 2 Difícil, 3 Bom, 4 Fácil.
 */

const TARGET_RETENTION = 0.9;
const MIN_STABILITY = 0.5;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;

export interface TopicReviewSchedule {
  stability: number;
  difficulty: number;
  intervalDays: number;
}

/** FSRS's power forgetting-curve: probability of recall after `elapsedDays`. */
export function retrievability(stability: number, elapsedDays: number): number {
  if (elapsedDays <= 0) return 1;
  return (1 + elapsedDays / (9 * stability)) ** -1;
}

function clampDifficulty(value: number): number {
  return Math.max(MIN_DIFFICULTY, Math.min(MAX_DIFFICULTY, value));
}

/**
 * Computes the next stability/difficulty/interval for a topic review.
 * `elapsedDays` is the time since the topic was last reviewed (or added to
 * review, for the first review) - used to read retrievability at review time.
 */
export function scheduleNextReview(
  stability: number,
  difficulty: number,
  elapsedDays: number,
  rating: 1 | 2 | 3 | 4,
  // Per-category scale on the interval only (stability is untouched), e.g.
  // mind maps come back sooner - see STUDY_NODE_CATEGORIES.
  intervalFactor = 1,
): TopicReviewSchedule {
  const r = retrievability(stability, elapsedDays);

  // Harder ratings push difficulty up, easier ratings pull it down - same
  // sign convention as the existing flashcard formula, slightly stronger step
  // since topics are broader/coarser-grained than single flashcards.
  const nextDifficulty = clampDifficulty(difficulty + (3 - rating) * 0.8);

  let nextStability: number;
  if (rating === 1) {
    // Forgotten: stability collapses, next review comes back around fast.
    nextStability = Math.max(MIN_STABILITY, stability * 0.2);
  } else {
    const growthByRating = { 2: 1.2, 3: 1.8, 4: 2.5 }[rating];
    // Harder topics grow more slowly, easier ones grow faster.
    const difficultyFactor = Math.max(0.5, Math.min(1.3, 1 - (difficulty - 5) * 0.05));
    // Recalling something close to forgotten (low R) is stronger evidence of
    // durable memory than recalling something still fresh - reward it more.
    const retrievabilityBonus = Math.max(1, Math.min(1.6, 1 + (1 - r) * 0.6));
    nextStability = Math.max(
      stability + 0.5,
      stability * growthByRating * difficultyFactor * retrievabilityBonus,
    );
  }

  // At 90% target retention, FSRS's interval formula reduces to ≈ stability.
  const intervalDays = Math.max(
    1,
    Math.round(nextStability * 9 * (1 / TARGET_RETENTION - 1) * intervalFactor),
  );

  return { stability: nextStability, difficulty: nextDifficulty, intervalDays };
}
