/* ============================================================================
   SIMULAÇÃO
   ----------------------------------------------------------------------------
   Ordem de processamento:
     a) monta a frota individual (um objeto por robô, na ordem do mapa)
     b) penalidade por estouro de orçamento
     c) falhas estruturais: AGV sem guia, AGV em terreno aberto,
        frota operacional abaixo do mínimo, montagem sem braço
     d) rolagem dos riscos declarados
     e) fechamento: progresso, eficiência, pontuação e veredito

   Eventos que derrubam robôs carregam "lose: [índices]"; a cena usa isso para
   encenar a perda no robô certo. Robôs marcados com "immobile" nunca se mexem
   na cena (AGV sem trilho não tem o que seguir).
   ========================================================================== */

import { CATALOG_INDEX } from '../data/catalog.js';
import { state, owns } from './state.js';
import { calcTotalCost, OVERBUDGET_EFF_PENALTY } from './budget.js';
import { auditInvestment } from './audit.js';
import { computeScore, computeVerdict } from './scoring.js';

/** Eventos neutros para dar ritmo à timeline. */
const GOOD_EVENTS = [
  'Primeiro waypoint atingido conforme planejado.',
  'Sincronização de frota estável.',
  'Carga transferida sem incidentes.',
  'Rota recalculada automaticamente após leve obstáculo.',
  'Checkpoint intermediário validado.',
  'Retorno à base em andamento.',
  'Telemetria dos robôs ativos dentro do esperado.',
];

/**
 * @returns {true|false|'partial'} true = risco eliminado, 'partial' = chance pela metade
 */
export function isRiskMitigated(risk) {
  const cart = state.cart;

  // Regra especial: atolamento só é evitado se não houver AMR padrão na frota
  if (risk.mitigatedBy && risk.mitigatedBy.includes('amr_offroad_only')) {
    return (cart.robots.amr_padrao || 0) === 0;
  }

  // anyOf: basta UM dos mitigadores
  if (risk.anyOf) return risk.mitigatedBy.some(owns);

  if (risk.mitigatedBy) {
    if (risk.mitigatedBy.every(owns)) return true;
    if (risk.secondary && risk.secondary.some(owns)) return 'partial';
    return false;
  }

  return false;
}

export function runSimulation() {
  const m = state.mission;
  const cart = state.cart;
  const req = m.requirements;

  // --- a) Frota individual -------------------------------------------------
  const fleet = [];
  for (const [id, qty] of Object.entries(cart.robots)) {
    const item = CATALOG_INDEX[id];
    for (let i = 0; i < qty; i++) {
      fleet.push({ type: id, kind: item.kind, alive: true, immobile: false });
    }
  }
  const totalRobots = fleet.length;
  const aliveIdx = () => fleet.map((r, i) => (r.alive ? i : -1)).filter((i) => i >= 0);
  const loseRandom = () => {
    const alive = aliveIdx();
    if (!alive.length) return null;
    const idx = alive[Math.floor(Math.random() * alive.length)];
    fleet[idx].alive = false;
    return idx;
  };

  let progress = 100;
  let processEff = 100;
  const processLog = [{ label: 'Base de processo', delta: 100 }];
  const criticalNotes = [];
  const events = [];

  events.push({
    t: 0, type: 'info', visual: { kind: 'start' },
    text: `Frota de ${totalRobots} robô(s) mobilizada. Iniciando operação ${m.code}.`,
  });

  // --- b) Estouro de orçamento ---------------------------------------------
  const cost = calcTotalCost();
  const overBudget = Math.max(0, cost - m.budget);
  if (overBudget > 0) {
    const overPct = (overBudget / m.budget) * 100;
    const penalty = Math.round(overPct * OVERBUDGET_EFF_PENALTY);
    processEff -= penalty;
    processLog.push({
      label: `Estouro de orçamento (+${overBudget}c, ${overPct.toFixed(1)}%)`,
      delta: -penalty,
    });
    events.push({
      t: 0.5, type: 'warn', visual: { kind: 'overbudget' },
      text: `Operação iniciada ${overBudget} créditos acima do orçamento aprovado. `
          + 'Custos extras pesam na eficiência.',
    });
  }

  // --- c) Falhas estruturais -----------------------------------------------
  // hardFail -> erro de planejamento: a missão era impossível como foi montada
  // softFail -> a operação andou, mas perdeu robôs ou saiu subdimensionada
  let criticalFail = false;
  let hardFail = false;
  let softFail = false;
  let zeroProgress = false;

  const agvIdx = fleet.map((r, i) => (r.kind === 'agv' ? i : -1)).filter((i) => i >= 0);
  const onlyAgvs = agvIdx.length > 0 && agvIdx.length === totalRobots;
  const noRails = agvIdx.length > 0 && !owns('guias');

  if (noRails) {
    // AGV sem guia física não tem o que seguir: não sai do lugar, nem um metro
    agvIdx.forEach((i) => {
      fleet[i].alive = false;
      fleet[i].immobile = true;
    });
    events.push({
      t: 1, type: 'bad', lose: agvIdx, visual: { kind: 'agv_no_rails', robots: agvIdx },
      text: `${agvIdx.length} AGV(s) sem trilha para seguir. Permanecem imóveis na base.`,
    });
    criticalNotes.push('Os AGVs nunca deixaram a base: não havia trilha instalada para guiá-los.');
    if (onlyAgvs) { hardFail = true; zeroProgress = true; }
  } else if (agvIdx.length && req.openTerrain) {
    // AGV em terreno aberto: as guias não cobrem o terreno irregular
    agvIdx.forEach((i) => { fleet[i].alive = false; });
    progress -= 15 * agvIdx.length;
    events.push({
      t: 3, type: 'bad', lose: agvIdx, visual: { kind: 'agv_stuck_open', robots: agvIdx },
      text: `CATÁSTROFE: ${agvIdx.length} AGV(s) perderam a trilha no terreno irregular `
          + 'e ficaram presos.',
    });
    criticalNotes.push('Os AGVs perderam a trilha logo nos primeiros quilômetros e ficaram presos no terreno.');
    if (onlyAgvs) { hardFail = true; zeroProgress = true; }
  }

  const operational = aliveIdx().length;
  if (operational < req.minTotalRobots) {
    criticalFail = true;
    events.push({
      t: 4, type: 'bad', visual: { kind: 'fleet_short' },
      text: `Frota operacional insuficiente: ${operational} robô(s) em ação, `
          + `a missão exige pelo menos ${req.minTotalRobots}.`,
    });
    criticalNotes.push(operational === 0
      ? 'Nenhum robô da frota chegou a operar de fato.'
      : `Com apenas ${operational} robô(s) em operação, a frota não teve capacidade para concluir o trabalho.`);
    if (noRails || (req.requiresArm && !owns('braco')) || operational === 0) hardFail = true;
    else softFail = true;
  }

  if (req.requiresArm && !owns('braco')) {
    criticalFail = true;
    hardFail = true;
    events.push({
      t: 6, type: 'bad', visual: { kind: 'no_arm' },
      text: 'Módulos chegam ao canteiro, mas nenhum robô consegue erguê-los ou acoplá-los.',
    });
    criticalNotes.push('Os módulos chegaram ao canteiro, mas nada na frota era capaz de erguê-los e encaixá-los.');
  }

  // --- d) Riscos declarados -------------------------------------------------
  let t = 7;
  const riskReport = [];
  if (aliveIdx().length > 0) {
    for (const risk of m.risks) {
      const mit = isRiskMitigated(risk);
      const roll = Math.random();
      let realized = false;

      const pool = aliveIdx();
      const actor = pool[Math.floor(Math.random() * pool.length)];
      const nearMiss = { kind: 'nearmiss', riskId: risk.id, robots: [actor] };

      if (mit === true) {
        events.push({
          t, type: 'ok', visual: nearMiss,
          text: `Mitigação ativa contra: ${risk.desc.toLowerCase()}.`,
        });
      } else if (mit === 'partial') {
        if (roll < risk.probability * 0.5) realized = true;
        else events.push({
          t, type: 'warn', visual: nearMiss,
          text: `Mitigação parcial funcionou: ${risk.desc.toLowerCase()}.`,
        });
      } else if (roll < risk.probability) {
        realized = true;
      } else {
        events.push({
          t, type: 'ok', visual: nearMiss,
          text: `Risco evitado por sorte: ${risk.desc.toLowerCase()}.`,
        });
      }

      riskReport.push({
        id: risk.id, desc: risk.desc, probability: risk.probability,
        mitigation: mit === true ? 'mitigado' : mit === 'partial' ? 'parcial' : 'exposto',
        realized,
      });

      if (realized) {
        const evt = { t, type: 'bad', text: `INCIDENTE: ${risk.desc}.` };
        if (risk.impact.progress) progress += risk.impact.progress;
        if (risk.impact.eff) {
          processEff += risk.impact.eff;
          processLog.push({ label: `Risco de processo não mitigado: ${risk.desc}`, delta: risk.impact.eff });
        }

        const lost = [];
        if (risk.impact.robotLost) {
          for (let k = 0; k < risk.impact.robotLost; k++) {
            const idx = loseRandom();
            if (idx !== null) lost.push(idx);
          }
          if (lost.length) {
            evt.lose = lost;
            evt.text += ` ${lost.length} robô(s) fora de operação.`;
          }
        }

        // Elenco da cena: quem caiu; se ninguém cai, o ator sorteado.
        const cast = lost.length ? lost.slice() : [actor];
        if (risk.id === 'colisao') {
          const other = pool.find((i) => !cast.includes(i));
          if (other !== undefined) cast.push(other);
        }
        evt.visual = { kind: risk.id, robots: cast };
        events.push(evt);

        // Frota inteira perdida: aborta, não rola os riscos restantes
        if (aliveIdx().length === 0) {
          criticalFail = true;
          if (!softFail) hardFail = true;
          events.push({
            t: t + 0.5, type: 'bad', visual: { kind: 'wipe' },
            text: 'Toda a frota operacional foi perdida. Operação abortada.',
          });
          criticalNotes.push('A frota inteira foi perdida antes de concluir o objetivo.');
          t += 1;
          break;
        }
      }
      t += 2 + Math.random() * 2;
    }

    // Eventos neutros espalhados ao longo da operação
    const shuffled = [...GOOD_EVENTS].sort(() => Math.random() - 0.5);
    for (let i = 0; i < 3; i++) {
      events.push({
        t: 7 + Math.random() * (t - 7), type: 'info', visual: { kind: 'beat' },
        text: shuffled[i],
      });
    }
  }

  // --- e) Fechamento -------------------------------------------------------
  if (criticalFail) progress = Math.min(progress, 35);
  if (zeroProgress) progress = 0;
  progress = Math.max(0, Math.min(100, progress));

  const robotsLost = fleet.filter((r) => !r.alive).length;
  if (!hardFail && robotsLost > 0) softFail = true;

  // Auditoria do que foi comprado: itens supérfluos e redundantes custam
  // pontos de processo, porque orçamento mal direcionado é má engenharia.
  const audit = auditInvestment(m);
  const wastePenalty = Math.min(50, Math.round((audit.wasted / m.budget) * 100 * 2));
  processEff = Math.max(0, Math.min(100, processEff));
  if (wastePenalty > 0) {
    processLog.push({ label: `Investimento mal direcionado (${audit.wasted}c)`, delta: -wastePenalty });
  }
  processEff = Math.max(0, processEff - wastePenalty);

  const fleetPreserved = totalRobots > 0 ? ((totalRobots - robotsLost) / totalRobots) * 100 : 0;
  const eff = Math.round((progress * 0.5) + (fleetPreserved * 0.3) + (processEff * 0.2));

  let closing;
  let closingType;
  if (criticalFail || progress < 60) {
    closing = 'Operação abortada. Objetivo não cumprido.'; closingType = 'bad';
  } else if (progress >= 100) {
    closing = 'Operação encerrada. Todos os objetivos cumpridos.'; closingType = 'ok';
  } else {
    closing = 'Operação encerrada. Objetivo parcialmente cumprido.'; closingType = 'warn';
  }
  events.push({ t: t + 3, type: closingType, visual: { kind: 'finish' }, text: closing });

  events.sort((a, b) => a.t - b.t);

  const result = {
    progress, eff, processEff, processLog, fleetPreserved,
    criticalFail, criticalNotes, hardFail, softFail,
    audit, wastePenalty,
    robotsLost, totalRobots, fleet,
    riskReport,
    hasArm: owns('braco'),
    events,
    costUsed: cost,
    overBudget,
    budget: m.budget,
    durationMs: state.missionDurationMs,
  };

  const scored = computeScore(result);
  result.score = scored.score;
  result.scoreComponents = scored.components;
  result.verdict = computeVerdict(result);

  state.simResult = result;
  return result;
}
