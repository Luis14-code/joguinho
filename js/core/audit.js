/* ============================================================================
   AUDITORIA DE INVESTIMENTO
   ----------------------------------------------------------------------------
   Percorre o que foi comprado e aponta duas categorias de desperdício:
     - Desnecessário: não atua sobre nenhum risco desta missão
     - Redundante:    cobre apenas riscos que outro item comprado já cobre
   A remoção é gulosa (tenta tirar primeiro quem cobre menos riscos e custa
   mais), para que de um par redundante sobre exatamente um item marcado.
   ========================================================================== */

import { CATALOG_INDEX, STRUCTURAL_ITEMS } from '../data/catalog.js';
import { state } from './state.js';

export function auditInvestment(mission) {
  const cart = state.cart;
  const req = mission.requirements;
  const owned = [...cart.modules, ...cart.infra, ...cart.integration];
  const findings = [];

  const agvCount = (cart.robots.agv_simples || 0) + (cart.robots.agv_reforcado || 0);
  const agvCost = (cart.robots.agv_simples || 0) * CATALOG_INDEX.agv_simples.cost
                + (cart.robots.agv_reforcado || 0) * CATALOG_INDEX.agv_reforcado.cost;

  // Cobertura de cada risco, separando mitigador primário de secundário.
  // Só o primário elimina o risco; o secundário apenas reduz a chance, então
  // ele não torna o primário dispensável (mas o contrário sim).
  const primary = {};
  const secondary = {};
  mission.risks.forEach((risk) => {
    primary[risk.id] = (risk.mitigatedBy || [])
      .filter((x) => x !== 'amr_offroad_only')
      .filter((id) => owned.includes(id));
    secondary[risk.id] = (risk.secondary || []).filter((id) => owned.includes(id));
  });

  const helps = (id) => mission.risks
    .filter((r) => primary[r.id].includes(id) || secondary[r.id].includes(id))
    .map((r) => r.id);

  // --- itens estruturais, julgados pela frota e não pelos riscos ---
  if (owned.includes('guias')) {
    if (req.openTerrain) {
      findings.push({
        name: CATALOG_INDEX.guias.name,
        cost: CATALOG_INDEX.guias.cost,
        reason: 'Não há como instalar trilhos ao longo de um terreno não estruturado.',
      });
    } else if (agvCount === 0) {
      findings.push({
        name: CATALOG_INDEX.guias.name,
        cost: CATALOG_INDEX.guias.cost,
        reason: 'Trilhos instalados, mas não há nenhum AGV na frota para usá-los.',
      });
    }
  }
  if (owned.includes('braco') && !req.requiresArm) {
    findings.push({
      name: CATALOG_INDEX.braco.name,
      cost: CATALOG_INDEX.braco.cost,
      reason: 'Esta missão não envolve manipular e acoplar cargas.',
    });
  }
  if (agvCount > 0 && !cart.infra.has('guias')) {
    findings.push({
      name: `${agvCount}× AGV sem trilhos`,
      cost: agvCost,
      reason: 'AGVs dependem de guia física; sem ela não saíram da base.',
    });
  } else if (agvCount > 0 && req.openTerrain) {
    findings.push({
      name: `${agvCount}× AGV em terreno aberto`,
      cost: agvCost,
      reason: 'AGVs seguem trilha fixa e não operam em terreno não estruturado.',
    });
  }

  // --- itens que não atuam sobre nenhum risco da missão ---
  owned.forEach((id) => {
    if (STRUCTURAL_ITEMS.includes(id)) return;
    if (helps(id).length === 0) {
      const item = CATALOG_INDEX[id];
      findings.push({
        name: item.name,
        cost: item.cost,
        reason: 'Não atua sobre nenhum dos riscos declarados desta missão.',
      });
    }
  });

  // --- redundâncias: remoção gulosa mantendo a cobertura intacta ---
  const kept = new Set(owned);
  owned
    .filter((id) => !STRUCTURAL_ITEMS.includes(id) && helps(id).length > 0)
    .sort((a, b) => (helps(a).length - helps(b).length)
                 || (CATALOG_INDEX[b].cost - CATALOG_INDEX[a].cost))
    .forEach((id) => {
      const rs = helps(id);
      // só é redundante se, sem ele, todo risco que ele toca continuar
      // coberto por um mitigador PRIMÁRIO que permanece na frota
      const aindaCoberto = rs.every((rid) => primary[rid].some((x) => x !== id && kept.has(x)));
      if (!aindaCoberto) return;
      kept.delete(id);
      const item = CATALOG_INDEX[id];
      const outros = [...new Set(
        rs.flatMap((rid) => primary[rid].filter((x) => x !== id && kept.has(x)))
      )].map((x) => CATALOG_INDEX[x].name);
      findings.push({
        name: item.name,
        cost: item.cost,
        redundant: true,
        reason: `A mesma cobertura já vem de ${outros.join(' / ')}.`,
      });
    });

  const wasted = findings.reduce((a, f) => a + f.cost, 0);
  return { findings, wasted };
}
