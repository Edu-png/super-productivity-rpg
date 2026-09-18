import snapshot from './rpg-emergency-recovery-snapshot.json';
import { RpgProfileState } from './rpg-profile.model';

// One-time recovery of a real character lost to a startup race condition on
// 2026-07-31 (see _healPhantomDefaultCharacter). Recovered from a surviving
// pre-migration localStorage snapshot dated 2026-07-30, so it reflects that
// point in time, not the exact moment of the incident - restoring a known
// real character beats leaving the account on the blank default. Re-keyed to
// the id Academy Arcana's migrated study data is actually indexed under
// (features there load by `profile.state().id`, i.e. whichever RPG character
// is active), so re-activating the character reconnects that data too.
export const RPG_EMERGENCY_RECOVERY_FLAG = 'rpg-emergency-recovery-2026-07-31-v2';

export function getEmergencyRecoveryCharacter(): RpgProfileState {
  const parsed = snapshot as { characters: Record<string, RpgProfileState> };
  const id = Object.keys(parsed.characters)[0];
  return parsed.characters[id];
}
