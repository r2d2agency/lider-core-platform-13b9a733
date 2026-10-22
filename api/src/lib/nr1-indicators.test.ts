/**
 * Testes do cálculo de indicadores do NR-1.
 *
 * Rodar com: npx tsx src/lib/nr1-indicators.test.ts
 */
import assert from "node:assert/strict";
import {
  nr1FactorHistory,
  nr1IndicatorSnapshot,
  pickNr1ComparisonSurveys,
  type Nr1SurveyInput,
} from "./nr1-indicators.js";
import { NR1_QUESTIONS, type NR1Answers } from "./nr1-instrument.js";

let passed = 0;
function check(label: string, fn: () => void) {
  fn();
  passed += 1;
  console.log("  ok —", label);
}

/** Respostas todas iguais a `value` (1–5) para todas as perguntas. */
function answers(value: number): NR1Answers {
  const out: NR1Answers = {};
  for (const q of NR1_QUESTIONS) out[q.id] = value;
  return out;
}

function survey(
  id: string,
  value: number,
  opts: { teamId?: string | null; createdAt?: Date; respondents?: number } = {},
): Nr1SurveyInput {
  const respondents = opts.respondents ?? 3;
  return {
    id,
    title: `Rodada ${id}`,
    teamId: opts.teamId ?? null,
    createdAt: opts.createdAt ?? new Date("2026-01-15T00:00:00Z"),
    answers: Array.from({ length: respondents }, () => answers(value)),
  };
}

console.log("nr1-indicators:");

check("rodada com menos de 3 respostas não vira indicador", () => {
  const s = survey("a", 5, { respondents: 2 });
  const { current, insufficientCount } = pickNr1ComparisonSurveys([s]);
  assert.equal(current, null);
  assert.equal(insufficientCount, 1);
});

check("a rodada mais recente é a de referência", () => {
  const older = survey("a", 3, { createdAt: new Date("2026-01-01") });
  const newer = survey("b", 5, { createdAt: new Date("2026-06-01") });
  const { current, previous } = pickNr1ComparisonSurveys([newer, older]);
  assert.equal(current?.id, "b");
  assert.equal(previous?.id, "a");
});

check("a comparação usa a rodada anterior da mesma equipe", () => {
  const t1a = survey("a1", 3, { teamId: "t1", createdAt: new Date("2026-01-01") });
  const t1b = survey("b1", 5, { teamId: "t1", createdAt: new Date("2026-06-01") });
  const t2 = survey("c", 1, { teamId: "t2", createdAt: new Date("2026-03-01") });
  const { current, previous } = pickNr1ComparisonSurveys([t1b, t2, t1a]);
  assert.equal(current?.id, "b1");
  assert.equal(previous?.id, "a1");
});

check("percentual segue ((média − 1) ÷ 4) × 100", () => {
  const snap = nr1IndicatorSnapshot([survey("a", 5)]);
  const f = snap.factors[0];
  assert.equal(f.percent, 100);
  assert.equal(f.classification, "muito_favoravel");
});

check("fator com 50% fica em atenção e abaixo de 50% em prioridade", () => {
  const snap = nr1IndicatorSnapshot([survey("a", 3)]);
  assert.equal(snap.factors[0].percent, 50);
  assert.equal(snap.factors[0].classification, "atencao");

  const low = nr1IndicatorSnapshot([survey("a", 2)]);
  assert.equal(low.factors[0].percent, 25);
  assert.equal(low.factors[0].classification, "prioridade");
});

check("o delta é a diferença de pontos percentuais entre as rodadas", () => {
  const older = survey("a", 3, { createdAt: new Date("2026-01-01") });
  const newer = survey("b", 4, { createdAt: new Date("2026-06-01") });
  const snap = nr1IndicatorSnapshot([newer, older]);
  const f = snap.factors[0];
  assert.equal(f.previousPercent, 50);
  assert.equal(f.percent, 75);
  assert.equal(f.delta, 25);
});

check("sem rodada anterior, o delta fica nulo em vez de zero", () => {
  const snap = nr1IndicatorSnapshot([survey("a", 4)]);
  assert.equal(snap.factors[0].previousPercent, null);
  assert.equal(snap.factors[0].delta, null);
});

check("as 13 perguntas do instrumento geram os 13 fatores", () => {
  const snap = nr1IndicatorSnapshot([survey("a", 4)]);
  assert.equal(snap.factors.length, 13);
});

check("a série histórica tem um ponto por rodada e por fator", () => {
  const older = survey("a", 3, { createdAt: new Date("2026-01-15T00:00:00Z") });
  const newer = survey("b", 4, { createdAt: new Date("2026-06-15T00:00:00Z") });
  const history = nr1FactorHistory([newer, older]);
  assert.equal(history.length, 26);
  const periods = new Set(history.map((p) => `${p.periodYear}-${p.periodMonth}`));
  assert.deepEqual([...periods].sort(), ["2026-1", "2026-6"]);
});

check("rodada abaixo do mínimo não entra na série", () => {
  const history = nr1FactorHistory([survey("a", 4, { respondents: 2 })]);
  assert.equal(history.length, 0);
});

console.log(`OK — nr1-indicators: ${passed} asserções passaram`);
