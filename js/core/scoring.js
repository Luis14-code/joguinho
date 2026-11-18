/* ============================================================================
   PONTUAÇÃO E VEREDITO
   ----------------------------------------------------------------------------
   Uma única fórmula, usada tanto no debrief quanto no painel de ranking, para
   que a nota mostrada ao grupo seja exatamente a nota que entra na competição.

   EFICIÊNCIA GLOBAL (Output/Input, visão de engenharia de produção):
     50% Resultado   -> objetivo cumprido
     30% Preservação -> frota que voltou viva
     20% Processo    -> integração + disciplina de orçamento

   PONTOS = eficiência global × 10  (0 a 1000), quebrada em três parcelas:
     Objetivo   = progresso        × 5   (0 a 500)
     Frota      = frota preservada × 3   (0 a 300)
     Processo   = processo         × 2   (0 a 200)
   ========================================================================== */

export const SCORE_WEIGHTS = { objetivo: 5, frota: 3, processo: 2 };
export const SCORE_MAX = 1000;

/**
 * Quebra a pontuação em parcelas explicáveis.
 * @param {object} r resultado da simulação
 */
export function computeScore(r) {
  const alive = r.totalRobots - r.robotsLost;
  const components = [
    {
      key: 'objetivo',
      label: 'Objetivo cumprido',
      detail: `${Math.round(r.progress)}% do objetivo × ${SCORE_WEIGHTS.objetivo}`,
      points: Math.round(r.progress * SCORE_WEIGHTS.objetivo),
      max: 100 * SCORE_WEIGHTS.objetivo,
    },
    {
      key: 'frota',
      label: 'Frota preservada',
      detail: `${alive}/${r.totalRobots} robôs de volta (${Math.round(r.fleetPreserved)}%) × ${SCORE_WEIGHTS.frota}`,
      points: Math.round(r.fleetPreserved * SCORE_WEIGHTS.frota),
      max: 100 * SCORE_WEIGHTS.frota,
    },
    {
      key: 'processo',
      label: 'Processo e investimento',
      detail: `${Math.round(r.processEff)}% de disciplina de processo × ${SCORE_WEIGHTS.processo}`,
      points: Math.round(r.processEff * SCORE_WEIGHTS.processo),
      max: 100 * SCORE_WEIGHTS.processo,
      log: r.processLog || [],
    },
  ];

  const score = components.reduce((a, c) => a + c.points, 0);
  return { score: Math.max(0, Math.min(SCORE_MAX, score)), components };
}

/**
 * Três vereditos possíveis:
 *   fail    -> erro de planejamento (hardFail) ou objetivo muito baixo
 *   partial -> objetivo parcial, OU baixo por quebra de robô / frota curta
 *   success -> objetivo alto, frota quase intacta, eficiência boa
 */
export function computeVerdict(r) {
  const robotLossPct = r.totalRobots > 0 ? r.robotsLost / r.totalRobots : 1;

  if (r.hardFail) return VERDICTS.fail;
  if (r.progress >= 90 && robotLossPct <= 0.2 && r.eff >= 70) return VERDICTS.success;
  if (r.progress >= 60 && robotLossPct < 0.5 && r.eff >= 40) return VERDICTS.partial;
  if (r.softFail && r.progress > 0) return VERDICTS.partial;
  return VERDICTS.fail;
}

export const VERDICTS = {
  success: { key: 'success', name: 'Sucesso Total', label: 'MISSÃO BEM-SUCEDIDA', css: 'success' },
  partial: { key: 'partial', name: 'Sucesso Parcial', label: 'MISSÃO PARCIALMENTE COMPLETA', css: 'partial' },
  fail: { key: 'fail', name: 'Missão Fracassada', label: 'MISSÃO FRACASSADA', css: 'fail' },
};

export function verdictByKey(key) {
  return VERDICTS[key] || VERDICTS.fail;
}
