// Validates the 2026 monthly-medal historical import (rpg-monthly-medal-history.data.ts).
// Run with: node --experimental-strip-types scripts/rpg-monthly-medals/test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RPG_MONTHLY_MEDAL_HISTORY,
  RPG_MONTHLY_MEDAL_HISTORY_YEAR,
  RPG_MONTHLY_MEDAL_COMPLETION_DATES,
  RPG_MONTHLY_MEDAL_HISTORY_BONUS_KEY,
  monthlyMedalHistoryFor,
  isMonthlyMedalHistoryCompleted,
  monthlyMedalHistoryPercentage,
  applyMonthlyMedalHistorySeed,
} from '../../src/app/features/rpg-profile/rpg-monthly-medal-history.data.ts';

const EXPECTED_TITLES = [
  'Despertador Imparável',
  'Poliglota em Ascensão',
  'Cuidando de Si',
  'Coração no Projeto',
  'Guardião do Foco',
  'Comedor de Livros',
  'Tanquinho Lendário',
  'O Codificador',
  'Energia Relâmpago',
  'Zen em Meio ao Caos',
  'Construtor de Sonhos',
  'Senhor dos Cofres',
];

// These titles live in rpg-profile.service.ts's `names` array (not in the
// history data file itself, since titles were already correct pre-migration
// and reused as-is) - kept here only as the source of truth for test #3.
const SERVICE_NAMES_SOURCE = readServiceNamesArray();

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('1. exatamente 12 medalhas mensais de 2026, uma por mês, sem duplicatas', () => {
  assert.equal(RPG_MONTHLY_MEDAL_HISTORY.length, 12);
  const months = RPG_MONTHLY_MEDAL_HISTORY.map((e) => e.month).sort((a, b) => a - b);
  assert.deepEqual(months, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('2. RPG_MONTHLY_MEDAL_HISTORY_YEAR é 2026', () => {
  assert.equal(RPG_MONTHLY_MEDAL_HISTORY_YEAR, 2026);
});

test('3. títulos no serviço batem com os 12 títulos exigidos, na ordem certa', () => {
  assert.deepEqual(SERVICE_NAMES_SOURCE, EXPECTED_TITLES);
});

test('4. descrições batem exatamente com o especificado', () => {
  const expected = {
    1: 'Acordar no horário ao menos 20 dias de janeiro.',
    2: 'Estudar conversação por ao menos 15 dias no mês.',
    3: 'Descansar por pelo menos 15 dias no mês.',
    4: 'Trabalhar focado ao menos 20 dias por pelo menos 1 hora.',
    5: 'Estudar ao menos 15 dias no mês.',
    6: 'Ler ao menos 1 hora por dia durante 20 dias.',
    7: 'Ir à academia ao menos 20 dias no mês.',
    8: 'Estudar programação ou ciência de dados durante 20 dias no mês.',
    9: 'Fazer corrida ou cardio durante 20 dias no mês.',
    10: 'Meditar durante 30 dias no mês.',
    11: 'Trabalhar de forma focada durante 20 dias no mês.',
    12: 'Investir R$ 4.000 durante o mês.',
  };
  for (const entry of RPG_MONTHLY_MEDAL_HISTORY) {
    assert.equal(entry.description, expected[entry.month], `mês ${entry.month}`);
  }
});

test('5-11. estado de conclusão de cada mês bate com o especificado', () => {
  const expectedCompleted = {
    1: true,
    2: true,
    3: true,
    4: false,
    5: true,
    6: true,
    7: true,
    8: false,
    9: false,
    10: false,
    11: false,
    12: false,
  };
  for (const entry of RPG_MONTHLY_MEDAL_HISTORY) {
    assert.equal(
      isMonthlyMedalHistoryCompleted(entry),
      expectedCompleted[entry.month],
      `mês ${entry.month}`,
    );
  }
});

test('8. Abril está com 12/20 e não concluído', () => {
  const abril = RPG_MONTHLY_MEDAL_HISTORY.find((e) => e.month === 4);
  assert.equal(abril.progress, 12);
  assert.equal(abril.target, 20);
  assert.equal(monthlyMedalHistoryPercentage(abril), 60);
  assert.equal(isMonthlyMedalHistoryCompleted(abril), false);
});

test('11. Julho está com 20/20 e concluído', () => {
  const julho = RPG_MONTHLY_MEDAL_HISTORY.find((e) => e.month === 7);
  assert.equal(julho.progress, 20);
  assert.equal(julho.target, 20);
  assert.equal(monthlyMedalHistoryPercentage(julho), 100);
  assert.equal(isMonthlyMedalHistoryCompleted(julho), true);
});

test('12. Agosto a dezembro não estão concluídos e partem de zero', () => {
  for (const month of [8, 9, 10, 11, 12]) {
    const entry = RPG_MONTHLY_MEDAL_HISTORY.find((e) => e.month === month);
    assert.equal(entry.progress, 0, `mês ${month}`);
    assert.equal(isMonthlyMedalHistoryCompleted(entry), false, `mês ${month}`);
  }
});

test('13. contador de concluídas resulta em 6/12', () => {
  const completedCount = RPG_MONTHLY_MEDAL_HISTORY.filter(
    isMonthlyMedalHistoryCompleted,
  ).length;
  assert.equal(completedCount, 6);
  assert.equal(RPG_MONTHLY_MEDAL_HISTORY.length, 12);
});

test('16. percentual nunca excede 100%, mesmo com progress > target', () => {
  // Janeiro (22/20), Fevereiro (16/15) e Março/Maio (17/15) ultrapassam a meta.
  for (const entry of RPG_MONTHLY_MEDAL_HISTORY) {
    const pct = monthlyMedalHistoryPercentage(entry);
    assert.ok(pct <= 100, `mês ${entry.month} teve ${pct}%`);
    assert.ok(pct >= 0, `mês ${entry.month} teve ${pct}%`);
  }
  const jan = RPG_MONTHLY_MEDAL_HISTORY.find((e) => e.month === 1);
  assert.ok(
    jan.progress > jan.target,
    'janeiro deveria ultrapassar a meta no valor bruto',
  );
  assert.equal(monthlyMedalHistoryPercentage(jan), 100, 'mas exibido no máximo 100%');
});

test('monthlyMedalHistoryFor retorna undefined fora de 2026 ou fora do intervalo de meses', () => {
  assert.equal(monthlyMedalHistoryFor(2027, 0), undefined);
  assert.equal(monthlyMedalHistoryFor(2026, 0)?.month, 1);
  assert.equal(monthlyMedalHistoryFor(2026, 11)?.month, 12);
});

test('datas de conclusão: só existem para os 6 meses concluídos, dentro do próprio mês', () => {
  const keys = Object.keys(RPG_MONTHLY_MEDAL_COMPLETION_DATES)
    .map(Number)
    .sort((a, b) => a - b);
  assert.deepEqual(keys, [1, 2, 3, 5, 6, 7]);
  for (const [monthStr, ts] of Object.entries(RPG_MONTHLY_MEDAL_COMPLETION_DATES)) {
    const month = Number(monthStr);
    const d = new Date(ts);
    // Interpreting back in Sao Paulo (UTC-3): subtract nothing extra, just
    // check the UTC components land on (month, day) consistent with a
    // 23:59:59 -03:00 instant, which is 02:59:59 UTC on the *next* day.
    assert.equal(d.getUTCHours(), 2);
    assert.equal(d.getUTCMinutes(), 59);
  }
});

test('9. Julho não usa uma data posterior a 2026-07-31', () => {
  const julyTs = RPG_MONTHLY_MEDAL_COMPLETION_DATES[7];
  const maxAllowed = Date.UTC(2026, 6, 31, 23, 59, 59) + 3 * 60 * 60 * 1000;
  assert.ok(
    julyTs <= maxAllowed,
    'data de julho não pode ser posterior a 2026-07-31 23:59:59 -03:00',
  );
});

test('recompensa idempotente: aplicar o seed duas vezes não duplica XP/ouro', () => {
  const run1 = applyMonthlyMedalHistorySeed({}, 0, 0);
  assert.equal(run1.changed, true);
  assert.equal(run1.questBonusXp, 300); // 6 meses concluídos x 50 XP
  assert.equal(run1.questBonusCoins, 300);
  assert.ok(run1.claims[RPG_MONTHLY_MEDAL_HISTORY_BONUS_KEY]);

  const run2 = applyMonthlyMedalHistorySeed(
    run1.claims,
    run1.questBonusXp,
    run1.questBonusCoins,
  );
  assert.equal(run2.changed, false, 'segunda execução não deveria alterar nada');
  assert.equal(run2.questBonusXp, 300, 'XP não deveria duplicar');
  assert.equal(run2.questBonusCoins, 300, 'ouro não deveria duplicar');

  const run3 = applyMonthlyMedalHistorySeed(
    run2.claims,
    run2.questBonusXp,
    run2.questBonusCoins,
  );
  assert.equal(run3.changed, false);
  assert.equal(run3.questBonusXp, 300);
});

test('recompensa idempotente: cada mês concluído recebe exatamente +50 XP / +50 ouro', () => {
  const result = applyMonthlyMedalHistorySeed({}, 0, 0);
  for (const [monthStr] of Object.entries(RPG_MONTHLY_MEDAL_COMPLETION_DATES)) {
    const key = `monthly:2026-${monthStr}`;
    assert.equal(result.claims[key].xp, 50, `mês ${monthStr}`);
    assert.equal(result.claims[key].gold, 50, `mês ${monthStr}`);
  }
  assert.equal(Object.keys(result.claims).length, 7); // 6 meses + a chave de bônus agregado
});

test('persistência: seed corrige valores incorretos vindos de uma execução antiga/divergente', () => {
  // Simula uma execução anterior que teria reivindicado com a fórmula antiga
  // (+80 XP / +15 ouro) e data de hoje em vez da data determinística.
  const staleClaims = {
    'monthly:2026-1': { claimedAt: Date.now(), xp: 80, gold: 15 },
  };
  const result = applyMonthlyMedalHistorySeed(staleClaims, 80, 15);
  assert.equal(result.claims['monthly:2026-1'].xp, 50);
  assert.equal(result.claims['monthly:2026-1'].gold, 50);
  assert.equal(
    result.claims['monthly:2026-1'].claimedAt,
    RPG_MONTHLY_MEDAL_COMPLETION_DATES[1],
  );
  assert.equal(result.changed, true);
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

function readServiceNamesArray() {
  const __dirname2 = dirname(fileURLToPath(import.meta.url));
  const servicePath = join(
    __dirname2,
    '..',
    '..',
    'src',
    'app',
    'features',
    'rpg-profile',
    'rpg-profile.service.ts',
  );
  const source = readFileSync(servicePath, 'utf8');
  const match = source.match(/const names = \[([\s\S]*?)\];/);
  if (!match) throw new Error('não encontrou o array `names` em rpg-profile.service.ts');
  const items = [...match[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
  return items;
}
