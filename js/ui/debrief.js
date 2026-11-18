/* ============================================================================
   TELA 6 — DEBRIEF
   ----------------------------------------------------------------------------
   Mostra o veredito, as métricas, a pontuação aberta parcela por parcela
   (o "porquê" da nota) e a auditoria de investimento. Também é aqui que a
   pontuação é enviada para o ranking da rodada.
   ========================================================================== */

import { state } from '../core/state.js';
import { SCORE_MAX } from '../core/scoring.js';
import { buildEntry, submitScore, isConfigured } from '../net/leaderboard.js';
import { currentRound, formatCountdown } from '../net/rounds.js';

export function renderDebrief() {
  const r = state.simResult;
  const m = state.mission;
  const verdict = r.verdict;

  document.getElementById('verdict-box').className = `verdict ${verdict.css}`;
  document.getElementById('verdict-text').textContent = verdict.label;
  document.getElementById('debrief-crumb').textContent = `${m.code} · ${m.title}`;

  const members = state.group.members ? state.group.members.replace(/\n/g, ' · ') : '';
  document.getElementById('verdict-group').innerHTML = `
    <strong class="v-group-name">${escapeHtml(state.group.name)}</strong>
    ${members ? ` · ${escapeHtml(members)}` : ''}
  `;

  renderMetrics(r);
  renderScorePanel(r);
  renderAudit(r);
  document.getElementById('debrief-narrative').innerHTML = buildDebriefNarrative(r, verdict);

  const relevant = r.events.filter((e) => e.type === 'bad' || e.type === 'ok' || e.type === 'warn');
  document.getElementById('debrief-events').innerHTML =
    relevant.map((e) => `<div class="event-item ${e.type}">${e.text}</div>`).join('');

  sendScore(r);
}

/* -------------------------------------------------------------------------- */

function renderMetrics(r) {
  const progressClass = r.progress >= 90 ? 'good' : r.progress >= 60 ? 'warn' : 'bad';
  const lossClass = r.robotsLost === 0 ? 'good' : r.robotsLost <= 1 ? 'warn' : 'bad';
  const effClass = r.eff >= 80 ? 'good' : r.eff >= 50 ? 'warn' : 'bad';
  const costPct = Math.round((r.costUsed / r.budget) * 100);
  const costStyle = r.overBudget > 0 ? 'color: var(--accent-amber);' : 'color: var(--accent-cyan);';

  document.getElementById('metrics-grid').innerHTML = `
    <div class="metric-card ${progressClass}">
      <div class="m-label">Objetivo Cumprido</div>
      <div class="m-value">${Math.round(r.progress)}%</div>
      <div class="m-caption">meta: 100%</div>
    </div>
    <div class="metric-card ${lossClass}">
      <div class="m-label">Robôs Perdidos</div>
      <div class="m-value">${r.robotsLost}/${r.totalRobots}</div>
      <div class="m-caption">${r.robotsLost === 0 ? 'frota preservada' : 'fora de operação'}</div>
    </div>
    <div class="metric-card ${effClass}">
      <div class="m-label">Eficiência Global</div>
      <div class="m-value">${Math.round(r.eff)}%</div>
      <div class="m-caption">Resultado + Frota + Processos</div>
    </div>
    <div class="metric-card">
      <div class="m-label">Orçamento Utilizado</div>
      <div class="m-value" style="${costStyle}">${costPct}%</div>
      <div class="m-caption">${r.costUsed}/${r.budget}c${r.overBudget > 0 ? ' · excedido' : ''}${r.audit.wasted > 0 ? ` · ${r.audit.wasted}c mal usados` : ''}</div>
    </div>
  `;
}

/** Pontuação aberta: cada parcela e o que a derrubou. */
function renderScorePanel(r) {
  const round = currentRound();
  const rows = r.scoreComponents.map((c) => `
    <div class="score-row">
      <div class="s-head">
        <span class="s-label">${c.label}</span>
        <span class="s-points">${c.points}<span class="s-max"> / ${c.max}</span></span>
      </div>
      <div class="s-bar-bg"><div class="s-bar" style="width: ${(c.points / c.max) * 100}%"></div></div>
      <div class="s-detail">${c.detail}</div>
      ${c.log && c.log.length ? `<ul class="s-log">${c.log.map(logLine).join('')}</ul>` : ''}
    </div>
  `).join('');

  document.getElementById('score-panel').innerHTML = `
    <h3>Pontuação da Rodada</h3>
    <div class="score-total">
      <div class="st-value">${r.score}<span class="st-max">/${SCORE_MAX}</span></div>
      <div class="st-caption">
        pontos = eficiência global × 10<br>
        Rodada ${round.label} · reinicia em ${formatCountdown(round.msLeft)}
      </div>
    </div>
    ${rows}
    <div class="score-send" id="score-send">Enviando ao ranking…</div>
  `;
}

function logLine(l) {
  const cls = l.delta >= 0 ? 'up' : 'down';
  const sign = l.delta > 0 ? '+' : '';
  return `<li class="${cls}"><span>${escapeHtml(l.label)}</span><span class="d">${sign}${l.delta}</span></li>`;
}

/* -------------------------------------------------------------------------- */

async function sendScore(r) {
  const box = document.getElementById('score-send');
  if (!box) return;

  if (!isConfigured()) {
    box.className = 'score-send warn';
    box.textContent = '⚠ Ranking não configurado neste site (config.js). A pontuação não foi enviada.';
    return;
  }

  const entry = buildEntry(state.group, state.mission, r);
  const res = await submitScore(entry);
  state.submission = res;

  if (res.ok) {
    box.className = 'score-send ok';
    box.textContent = `✓ ${r.score} pontos enviados ao ranking da rodada ${res.round.label}.`;
  } else if (res.queued) {
    box.className = 'score-send warn';
    box.textContent = '⚠ Sem conexão com o ranking. A pontuação ficou salva e será reenviada na próxima missão.';
  } else {
    box.className = 'score-send warn';
    box.textContent = `⚠ Não foi possível enviar a pontuação (${res.reason}).`;
  }
}

/* -------------------------------------------------------------------------- */

/** Painel de auditoria: o que foi comprado à toa e o que custou em pontos. */
function renderAudit(r) {
  const el = document.getElementById('audit-panel');
  const a = r.audit;

  if (!a.findings.length) {
    el.innerHTML = `<h3>Auditoria de Investimento</h3>
      <div class="audit-clean">✓ Nenhum item supérfluo. Todo o orçamento aplicado atua sobre riscos reais desta missão.</div>`;
    return;
  }

  el.innerHTML = '<h3>Auditoria de Investimento</h3>'
    + a.findings.map((f) => `
      <div class="audit-row ${f.redundant ? 'redundant' : ''}">
        <div>
          <div class="a-name">${f.redundant ? 'Redundante' : 'Desnecessário'} · ${escapeHtml(f.name)}</div>
          <div class="a-reason">${escapeHtml(f.reason)}</div>
        </div>
        <div class="a-cost">−${f.cost}c</div>
      </div>`).join('')
    + `<div class="audit-total">
         <span>Créditos mal direcionados</span>
         <span class="t-val">${a.wasted}c de ${r.budget}c · −${r.wastePenalty} pts de processo</span>
       </div>`;
}

function buildDebriefNarrative(r, verdict) {
  const m = state.mission;
  const g = escapeHtml(state.group.name);
  const parts = [];
  const budgetNote = r.overBudget > 0
    ? ` A operação também consumiu ${r.overBudget} créditos acima do orçamento aprovado.`
    : '';

  if (verdict.key === 'success') {
    parts.push(`<p><b>${m.title}</b> foi encerrada com sucesso. Todos os objetivos atingidos e frota intacta.${budgetNote}</p>`);
    if (r.audit.wasted > 0) {
      parts.push(`<p>O objetivo foi cumprido, mas a auditoria encontrou ${r.audit.wasted} créditos em itens que não atuavam sobre os riscos desta missão. A operação funcionou; o investimento é que poderia ter sido mais enxuto.</p>`);
    }
    parts.push(`<p>O Comando Central registra esta operação como referência para missões futuras de perfil similar. Equipe <b>${g}</b> fica elogiada.</p>`);
  } else if (verdict.key === 'partial') {
    parts.push(`<p><b>${m.title}</b> foi encerrada com objetivos parcialmente atingidos: ${Math.round(r.progress)}% do planejado se concretizou. A operação seguiu em pé, mas com perdas que indicam lacunas na preparação.${budgetNote}</p>`);
    if (r.robotsLost > 0) parts.push(`<p>${r.robotsLost} robô(s) ficaram fora de operação ao longo da missão.</p>`);
    if (r.criticalNotes.length) parts.push(`<p>${r.criticalNotes.join(' ')}</p>`);
    if (r.audit.wasted > 0) parts.push(`<p>A auditoria apontou ${r.audit.wasted} créditos aplicados em itens que não atuavam sobre os riscos desta missão — orçamento que poderia ter coberto o que de fato faltou.</p>`);
    parts.push(`<p>O Comando Central reconhece o esforço da equipe <b>${g}</b> e recomenda revisão da configuração antes da próxima saída.</p>`);
  } else {
    parts.push(`<p><b>${m.title}</b> fracassou. Apenas ${Math.round(r.progress)}% do objetivo foi atingido antes de a operação ser abortada.${r.robotsLost > 0 ? ` ${r.robotsLost} robô(s) fora de operação.` : ''}${budgetNote}</p>`);
    if (r.criticalNotes.length) parts.push(`<p>${r.criticalNotes.join(' ')}</p>`);
    parts.push(`<p>O Comando Central lamenta o resultado. Equipe <b>${g}</b>, releia o briefing com atenção antes de tentar novamente.</p>`);
  }

  return parts.join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
