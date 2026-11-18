/* ============================================================================
   TELA 3 — BRIEFING
   ========================================================================== */

import { state } from '../core/state.js';

export function renderBriefing() {
  const m = state.mission;
  document.getElementById('briefing-crumb').textContent = `${m.code} · ${m.title}`;
  document.getElementById('briefing-title').textContent = m.title;

  document.getElementById('briefing-narrative').innerHTML =
    m.narrative.map((p) => `<p>${p}</p>`).join('');
  document.getElementById('briefing-hint').innerHTML = `💡 ${m.hint}`;

  document.getElementById('briefing-specs').innerHTML = `
    <li><span class="label">Código</span><span class="value">${m.code}</span></li>
    <li><span class="label">Terreno</span><span class="value">${m.terrain}</span></li>
    <li><span class="label">Distância</span><span class="value">${m.distance}</span></li>
    <li><span class="label">Orçamento</span><span class="value">${m.budget} créditos</span></li>
    <li><span class="label">Mín. robôs</span><span class="value">${m.requirements.minTotalRobots}</span></li>
  `;

  // Riscos ordenados do mais provável ao menos provável
  const sortedRisks = [...m.risks].sort((a, b) => b.probability - a.probability);
  document.getElementById('briefing-risks').innerHTML = sortedRisks.map((r) => {
    const probPct = Math.round(r.probability * 100);
    const probClass = probPct >= 60 ? 'high' : probPct >= 40 ? 'med' : 'low';
    return `
      <div class="risk-row">
        <span>${r.desc}</span>
        <span class="risk-prob ${probClass}">${probPct}%</span>
      </div>
    `;
  }).join('');
}
