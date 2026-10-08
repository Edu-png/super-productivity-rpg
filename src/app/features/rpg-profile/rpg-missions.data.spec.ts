import { RpgMission } from './rpg-profile.model';
import {
  isMissionComplete,
  isMissionRepeatable,
  missionNextReward,
  RPG_MISSION_ICONS,
  RPG_MISSION_SEEDS,
} from './rpg-missions.data';

const mission = (stages: number[], claimCount: number): RpgMission => ({
  id: 'm',
  title: 'Teste',
  description: '',
  icon: 'moon',
  stages,
  unit: 'dias',
  xpReward: 50,
  coinsReward: 20,
  claims: Array.from({ length: claimCount }, () => ({ at: 0, xp: 0, coins: 0 })),
  createdAt: 0,
});

describe('rpg missions', () => {
  it('pays the base reward times the milestone number on evolution lines', () => {
    expect(missionNextReward(mission([3, 7, 14], 0))).toEqual({ xp: 50, coins: 20 });
    expect(missionNextReward(mission([3, 7, 14], 2))).toEqual({ xp: 150, coins: 60 });
  });

  it('completes an evolution line once every milestone is claimed', () => {
    expect(isMissionComplete(mission([3, 7, 14], 2))).toBeFalse();
    expect(isMissionComplete(mission([3, 7, 14], 3))).toBeTrue();
  });

  it('never completes a repeatable mission and always pays the base reward', () => {
    const repeatable = mission([], 5);
    expect(isMissionRepeatable(repeatable)).toBeTrue();
    expect(isMissionComplete(repeatable)).toBeFalse();
    expect(missionNextReward(repeatable)).toEqual({ xp: 50, coins: 20 });
  });

  it('seeds only icons that exist and ascending milestones', () => {
    const icons = new Set(RPG_MISSION_ICONS.map((icon) => icon.id));
    for (const seed of RPG_MISSION_SEEDS) {
      expect(icons.has(seed.icon)).withContext(seed.title).toBeTrue();
      expect([...seed.stages].sort((a, b) => a - b))
        .withContext(seed.title)
        .toEqual(seed.stages);
    }
  });
});
