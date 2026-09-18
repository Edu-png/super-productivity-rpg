// Validates the 5x10 tier-achievement ladder (rpg-tier-achievements.data.ts).
// Run with: node --experimental-strip-types scripts/rpg-tier-achievements/test.mjs
import assert from 'node:assert/strict';
import { RPG_TIER_ACHIEVEMENT_SETS } from '../../src/app/features/rpg-profile/rpg-tier-achievements.data.ts';

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('existem exatamente 5 sets (um por tier de título)', () => {
  assert.equal(RPG_TIER_ACHIEVEMENT_SETS.length, 5);
});

test('cada set tem exatamente 10 conquistas', () => {
  for (const [index, set] of RPG_TIER_ACHIEVEMENT_SETS.entries()) {
    assert.equal(set.length, 10, `set ${index} tem ${set.length} itens`);
  }
});

test('50 IDs únicos no total, sem duplicatas entre sets', () => {
  const ids = RPG_TIER_ACHIEVEMENT_SETS.flat().map((a) => a.id);
  assert.equal(ids.length, 50);
  assert.equal(new Set(ids).size, 50, 'há IDs duplicados');
});

test('todo item tem título, descrição, ícone, métrica e alvo válidos', () => {
  for (const achievement of RPG_TIER_ACHIEVEMENT_SETS.flat()) {
    assert.ok(achievement.title?.length > 0, achievement.id);
    assert.ok(achievement.description?.length > 0, achievement.id);
    assert.ok(achievement.icon?.length > 0, achievement.id);
    assert.ok(achievement.target > 0, achievement.id);
  }
});

test('cada uma das 10 métricas aparece exatamente uma vez por set', () => {
  for (const [index, set] of RPG_TIER_ACHIEVEMENT_SETS.entries()) {
    const metrics = set.map((a) => a.metric);
    assert.equal(new Set(metrics).size, 10, `set ${index} repete uma métrica`);
  }
});

test('alvo de cada métrica cresce estritamente a cada tier (progressivamente mais difícil)', () => {
  const metricsByIndex = new Map();
  for (const set of RPG_TIER_ACHIEVEMENT_SETS) {
    for (const achievement of set) {
      const list = metricsByIndex.get(achievement.metric) ?? [];
      list.push(achievement.target);
      metricsByIndex.set(achievement.metric, list);
    }
  }
  for (const [metric, targets] of metricsByIndex) {
    for (let i = 1; i < targets.length; i++) {
      assert.ok(
        targets[i] > targets[i - 1],
        `${metric}: tier ${i} (${targets[i]}) não é maior que tier ${i - 1} (${targets[i - 1]})`,
      );
    }
  }
});

test('a mesma métrica usa o mesmo título-base em todos os tiers (10 conquistas reaproveitadas)', () => {
  const baseTitles = RPG_TIER_ACHIEVEMENT_SETS[0].map((a) => a.title.replace(/ I$/, ''));
  RPG_TIER_ACHIEVEMENT_SETS.forEach((set, tierIndex) => {
    const numeral = ['I', 'II', 'III', 'IV', 'V'][tierIndex];
    set.forEach((achievement, slotIndex) => {
      assert.equal(achievement.title, `${baseTitles[slotIndex]} ${numeral}`);
    });
  });
});

// ---------------------------------------------------------------------------
let failures = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`ok  - ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL - ${name}`);
    console.log(`     ${err.message}`);
  }
}
console.log(`\n${tests.length - failures}/${tests.length} testes passaram.`);
if (failures > 0) process.exit(1);
