/**
 * Indicadores derivados do NR-1.
 *
 * O diagnóstico do NR-1 produz 13 fatores com percentual convertido
 * ((média − 1) ÷ 4 × 100). Até agora esse número vivia só dentro da tela do
 * NR-1, sem virar indicador da organização — sem histórico, sem meta, sem
 * farol, sem comparação com as demais áreas.
 *
 * Aqui o resultado vira série: o fator mais recente, o anterior e a
 * variação. É a mesma matéria-prima do Módulo R (Indicadores), com as
 * regras de privacidade mantidas: só entra no indicador o agregado de uma
 * rodada com o mínimo de respostas válido, nunca respostas individuais.
 */

import {
  NR1_MIN_RESPONSES,
  nr1FactorResults,
  type NR1Answers,
  type NR1FactorResult,
} from "./nr1-instrument.js";

/** Uma rodada considerada no cálculo, com suas respostas agregáveis. */
export type Nr1SurveyInput = {
  id: string;
  title: string;
  teamId: string | null;
  createdAt: Date;
  answers: NR1Answers[];
};

export type Nr1FactorIndicator = {
  id: string;
  name: string;
  /** Percentual do fator na rodada mais recente (0–100). */
  percent: number | null;
  /** Percentual na rodada anterior, para comparação. */
  previousPercent: number | null;
  /** Variação em pontos percentuais (recente − anterior). */
  delta: number | null;
  average: number | null;
  respondentCount: number;
  classification: NR1FactorResult["classification"];
};

export type Nr1IndicatorSnapshot = {
  /** Rodada de referência (a mais recente com resultado válido). */
  survey: { id: string; title: string; teamId: string | null; createdAt: Date } | null;
  previousSurvey: { id: string; title: string; createdAt: Date } | null;
  factors: Nr1FactorIndicator[];
  /** Rodadas descartadas por terem menos de `NR1_MIN_RESPONSES` respostas. */
  insufficientCount: number;
};

/**
 * Escolhe a rodada de referência e a anterior.
 *
 * A referência é a rodada mais recente com resultado válido. A anterior é a
 * rodada imediatamente anterior **da mesma equipe** — comparar rodadas de
 * equipes diferentes não diz nada sobre evolução. Se a organização trabalha
 * com rodadas sem equipe, a comparação cai para a rodada anterior do
 * mesmo recorte (equipe ou organização inteira).
 */
export function pickNr1ComparisonSurveys(surveys: Nr1SurveyInput[]): {
  current: Nr1SurveyInput | null;
  previous: Nr1SurveyInput | null;
  insufficientCount: number;
} {
  const valid = surveys.filter((s) => s.answers.length >= NR1_MIN_RESPONSES);
  const insufficientCount = surveys.length - valid.length;
  if (valid.length === 0) return { current: null, previous: null, insufficientCount };

  const current = valid[0];
  const sameScope = current.teamId
    ? valid.filter((s) => s.teamId === current.teamId)
    : valid.filter((s) => !s.teamId);
  const scope = sameScope.length > 0 ? sameScope : valid;
  const previous = scope.length > 1 ? scope[1] : null;
  return { current, previous, insufficientCount };
}

/** Monta a série de 13 fatores com comparação com a rodada anterior. */
export function nr1IndicatorSnapshot(surveys: Nr1SurveyInput[]): Nr1IndicatorSnapshot {
  const { current, previous, insufficientCount } = pickNr1ComparisonSurveys(surveys);

  const currentFactors = current ? nr1FactorResults(current.answers) : [];
  const previousFactors = previous ? nr1FactorResults(previous.answers) : [];

  const factors: Nr1FactorIndicator[] = currentFactors.map((f) => {
    const prev = previousFactors.find((p) => p.id === f.id);
    const previousPercent = prev?.percent ?? null;
    return {
      id: f.id,
      name: f.name,
      percent: f.percent,
      previousPercent,
      delta: f.percent != null && previousPercent != null ? f.percent - previousPercent : null,
      average: f.average,
      respondentCount: f.respondentCount,
      classification: f.classification,
    };
  });

  return {
    survey: current
      ? {
          id: current.id,
          title: current.title,
          teamId: current.teamId,
          createdAt: current.createdAt,
        }
      : null,
    previousSurvey: previous
      ? { id: previous.id, title: previous.title, createdAt: previous.createdAt }
      : null,
    factors,
    insufficientCount,
  };
}

/**
 * Meta do indicador NR-1 por fator.
 *
 * Faixas do NR-1: ≥ 75% é "muito favorável", 50–74,9% é "atenção", < 50% é
 * "prioridade". O indicador usa 75% como meta — a partir daí o fator entra
 * na faixa favorável e o farol do Módulo R passa a acender.
 */
export const NR1_FACTOR_TARGET = 75;

export const NR1_INDICATOR_TAG = "nr1";

/** Nome estável do indicador de um fator — usado para casar a série. */
export function nr1IndicatorName(factorName: string) {
  return `NR-1 · ${factorName}`;
}

/**
 * Série histórica por fator: uma entrada por rodada válida.
 *
 * É o que dá linha de tempo ao indicador do Módulo R — sem isso, o painel
 * mostraria um único ponto e nenhuma evolução entre ciclos.
 */
export type Nr1FactorPoint = {
  factorId: string;
  factorName: string;
  /** Percentual do fator naquela rodada. */
  percent: number;
  surveyId: string;
  surveyTitle: string;
  /** Período no formato aceito por `IndicatorReading` (YYYY-MM). */
  periodYear: number;
  periodMonth: number;
  createdAt: Date;
};

export function nr1FactorHistory(surveys: Nr1SurveyInput[]): Nr1FactorPoint[] {
  const points: Nr1FactorPoint[] = [];
  for (const survey of surveys) {
    if (survey.answers.length < NR1_MIN_RESPONSES) continue;
    for (const f of nr1FactorResults(survey.answers)) {
      if (f.percent == null) continue;
      points.push({
        factorId: f.id,
        factorName: f.name,
        percent: f.percent,
        surveyId: survey.id,
        surveyTitle: survey.title,
        periodYear: survey.createdAt.getFullYear(),
        periodMonth: survey.createdAt.getMonth() + 1,
        createdAt: survey.createdAt,
      });
    }
  }
  return points;
}
