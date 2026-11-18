/* ============================================================================
   ORÇAMENTO E VALIDAÇÃO
   ----------------------------------------------------------------------------
   Bloqueios de lançamento são só dois:
     - nenhum robô na frota (não há o que simular)
     - orçamento excedido em mais de 10%
   Todo o resto (falta de braço, AGV sem guia, frota abaixo do mínimo...) é
   permitido, SEM aviso prévio, e vira consequência na simulação.
   ========================================================================== */

import { CATALOG_INDEX } from '../data/catalog.js';
import { state, countRobots } from './state.js';

export const BUDGET_TOLERANCE = 0.10;      // pode exceder o orçamento em até 10%
export const OVERBUDGET_EFF_PENALTY = 2;   // pontos de processo perdidos por 1% excedido

export function calcTotalCost() {
  let total = 0;
  for (const [id, qty] of Object.entries(state.cart.robots)) {
    total += CATALOG_INDEX[id].cost * qty;
  }
  for (const key of ['modules', 'infra', 'integration']) {
    state.cart[key].forEach((id) => { total += CATALOG_INDEX[id].cost; });
  }
  return total;
}

export function budgetLimit() {
  return Math.floor(state.mission.budget * (1 + BUDGET_TOLERANCE));
}

export function validateCart() {
  const m = state.mission;
  const problems = [];
  const warnings = [];
  const total = calcTotalCost();
  const limit = budgetLimit();

  if (countRobots() === 0) {
    problems.push('Selecione ao menos um robô para compor a frota.');
  }

  if (total > limit) {
    problems.push(`Orçamento excedido além da tolerância. Limite máximo: ${limit} créditos.`);
  } else if (total > m.budget) {
    warnings.push(
      `Orçamento excedido em ${total - m.budget} créditos. É permitido até ${limit}, `
      + 'mas o excesso reduz a eficiência operacional.'
    );
  }

  return { problems, warnings, total, limit };
}
