/* ============================================================================
   PAINEL DE RANKING — uso do docente
   ----------------------------------------------------------------------------
   Mostra a classificação da rodada corrente (ver net/rounds.js: a rodada é
   derivada do relógio, então o painel zera sozinho a cada N minutos) e abre a
   memória de cálculo de cada grupo: de onde veio cada ponto.

   O acesso é protegido por uma senha comparada via SHA-256 com o hash do
   config.js. Em site estático isso é uma cortina para a turma, não um cofre.
   ========================================================================== */

import { RANKING_CONFIG } from '../../config.js';
import { fetchRoundState, pushReset, isConfigured, serverNow } from '../net/leaderboard.js';
import { deriveRound, filterRoundRows, formatCountdown, hhmm } from '../net/rounds.js';
import { SCORE_MAX, verdictByKey } from '../core/scoring.js';

const SESSION_KEY = 'marsops.rankingUnlocked';

/** Lido uma vez: a querystring é limpa assim que a senha do link é aceita. */
const URL_PARAMS = new URLSearchParams(location.search);
const DEMO = URL_PARAMS.get('demo') === '1';

let rows = [];
let groups = [];
let selectedKey = null;
let round = { state: 'waiting', cutAt: 0 };
let lastResetAt = null;
let refreshTimer = null;
let loading = false;

/* --------------------------------------------------------------------------
   Portão de acesso
   -------------------------------------------------------------------------- */

async function sha256Hex(text) {
  if (!window.crypto || !window.crypto.subtle) {
    throw new Error('Este navegador só calcula o hash da senha em HTTPS ou localhost.');
  }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function checkPassword(pass) {
  const hash = await sha256Hex(pass);
  return hash === RANKING_CONFIG.rankingPasswordHash.trim().toLowerCase();
}

function showGateError(msg) {
  const el = document.getElementById('gate-error');
  el.textContent = msg;
  el.hidden = false;
}

function unlock() {
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) { /* ignora */ }
  document.getElementById('gate').classList.remove('active');
  document.getElementById('panel').classList.add('active');
  startPanel();
}

function lock() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignora */ }
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
  document.getElementById('panel').classList.remove('active');
  document.getElementById('gate').classList.add('active');
  document.getElementById('gate-pass').value = '';
}

async function tryUnlockFromUrl() {
  const k = new URLSearchParams(location.search).get('k');
  if (!k) return false;
  try {
    if (await checkPassword(k)) {
      // limpa a senha da barra de endereços para não ficar no projetor
      history.replaceState(null, '', location.pathname);
      return true;
    }
  } catch (e) { /* cai no formulário */ }
  return false;
}

/* --------------------------------------------------------------------------
   Carga e agregação
   -------------------------------------------------------------------------- */

function normalizeKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Melhor pontuação por grupo, com desempate por desperdício e horário. */
function aggregate(list) {
  const byGroup = new Map();
  list.forEach((row) => {
    const key = normalizeKey(row.group_name);
    const cur = byGroup.get(key);
    if (!cur) {
      byGroup.set(key, { key, best: row, attempts: 1 });
      return;
    }
    cur.attempts += 1;
    if (isBetter(row, cur.best)) cur.best = row;
  });

  return [...byGroup.values()].sort((a, b) => (isBetter(a.best, b.best) ? -1 : isBetter(b.best, a.best) ? 1 : 0));
}

function isBetter(a, b) {
  if (a.score !== b.score) return a.score > b.score;
  if ((a.wasted || 0) !== (b.wasted || 0)) return (a.wasted || 0) < (b.wasted || 0);
  return new Date(a.created_at) < new Date(b.created_at);
}

async function load() {
  if (loading) return;
  loading = true;
  const status = document.getElementById('status-box');

  try {
    // ranking.html?demo=1 — preenche o painel com dados fictícios para conferir
    // o layout antes de configurar o Supabase
    if (DEMO) {
      const all = demoRows();
      const times = all.map((r) => Date.parse(r.created_at)).sort((a, b) => a - b);
      round = deriveRound(times, null, Date.now());
      rows = filterRoundRows(all, round);
      status.hidden = false;
      status.className = 'alert amber';
      status.textContent = '⚠ Modo demonstração: dados fictícios, nada vem do banco.';
    } else if (!isConfigured()) {
      status.hidden = false;
      status.className = 'alert red';
      status.textContent = '⚠ Ranking não configurado: preencha supabaseUrl e supabaseAnonKey em config.js.';
      rows = [];
      round = { state: 'waiting', cutAt: 0 };
    } else {
      try {
        const st = await fetchRoundState();
        round = st.round;
        lastResetAt = st.lastResetAt;
        rows = filterRoundRows(st.rows, round);
        status.hidden = true;
      } catch (e) {
        status.hidden = false;
        status.className = 'alert red';
        status.textContent = `⚠ Falha ao ler o ranking: ${e.message}`;
      }
    }

    groups = aggregate(rows);
    if (selectedKey && !groups.some((g) => g.key === selectedKey)) selectedKey = null;
    if (!selectedKey && groups.length) selectedKey = groups[0].key;
    render();
    paintRoundState();
  } finally {
    loading = false;
  }
}

/* --------------------------------------------------------------------------
   Cabeçalho da rodada e botão de zerar
   -------------------------------------------------------------------------- */

function paintRoundState() {
  const clock = document.getElementById('round-clock');
  const title = document.getElementById('round-title');
  const box = document.getElementById('round-state');
  const minutos = RANKING_CONFIG.roundMinutes;

  if (round.state === 'running') {
    const left = Math.max(0, round.endsAt - (DEMO ? Date.now() : serverNow()));
    title.textContent = 'Rodada em curso';
    clock.textContent = `zera em ${formatCountdown(left)}`;
    clock.classList.remove('idle');
    box.className = 'round-state running';
    box.innerHTML = `⏱ Começou às <b>${hhmm(round.startedAt)}</b>, na primeira jogada da rodada. `
      + `Zera sozinho às <b>${hhmm(round.endsAt)}</b> — ou agora, se você apertar "Zerar ranking".`
      + resetNote();
  } else {
    title.textContent = 'Aguardando a primeira jogada';
    clock.textContent = 'cronômetro parado';
    clock.classList.add('idle');
    box.className = 'round-state waiting';
    box.innerHTML = `⏸ Ranking zerado. O cronômetro de <b>${minutos} min</b> só começa a contar `
      + 'quando o primeiro grupo terminar uma missão.'
      + resetNote();
  }
}

function resetNote() {
  if (!lastResetAt) return '';
  return `<span class="rs-note">Último reinício manual às ${hhmm(lastResetAt)}.</span>`;
}

async function doReset() {
  const btn = document.getElementById('btn-reset');
  const quantos = rows.length;
  const aviso = quantos
    ? `Zerar o ranking agora?\n\n${quantos} pontuação(ões) da rodada atual saem da tabela e o cronômetro volta a esperar a próxima jogada.\n\nNada é apagado do banco — o histórico continua lá.`
    : 'Zerar o ranking agora?\n\nO cronômetro volta a esperar a próxima jogada.';
  if (!window.confirm(aviso)) return;

  if (DEMO) {
    window.alert('Modo demonstração: o botão não grava nada.');
    return;
  }

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Zerando…';
  try {
    await pushReset('painel');
    selectedKey = null;
    await load();
  } catch (e) {
    const status = document.getElementById('status-box');
    status.hidden = false;
    status.className = 'alert red';
    status.textContent = `⚠ Não foi possível zerar: ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

/** Linhas fictícias para o modo demonstração. */
function demoRows() {
  const base = (over) => ({
    round_id: 0,
    created_at: new Date(Date.now() - Math.random() * 5 * 60000).toISOString(),
    members: '',
    mission_id: 'logistica',
    mission_code: 'LOG-01',
    mission_title: 'Logística Inter-Bases',
    budget: 1000,
    breakdown: {
      components: [
        { label: 'Objetivo cumprido', detail: `${over.progress}% do objetivo × 5`, points: over.progress * 5, max: 500 },
        { label: 'Frota preservada', detail: `${over.total_robots - over.robots_lost}/${over.total_robots} robôs de volta × 3`, points: Math.round(((over.total_robots - over.robots_lost) / over.total_robots) * 300), max: 300 },
        { label: 'Processo e investimento', detail: `${over.process_eff}% × 2`, points: over.process_eff * 2, max: 200 },
      ],
      processLog: [
        { label: 'Base de processo', delta: 100 },
        { label: 'Investimento mal direcionado', delta: over.process_eff - 100 },
      ],
      audit: over.wasted ? [{ name: 'LiDAR', cost: over.wasted, redundant: true, reason: 'A mesma cobertura já vem de Ultrassônico.' }] : [],
      risks: [],
      notes: [],
      fleet: { amr_padrao: over.total_robots },
    },
    ...over,
  });

  return [
    base({ group_name: 'Esquadrão Ares', score: 842, verdict: 'success', progress: 100, fleet_preserved: 100, process_eff: 71, robots_lost: 0, total_robots: 3, cost_used: 960, wasted: 90 }),
    base({ group_name: 'Fobos Log', score: 714, verdict: 'partial', progress: 90, fleet_preserved: 75, process_eff: 82, robots_lost: 1, total_robots: 4, cost_used: 880, wasted: 40 }),
    base({ group_name: 'Deimos Ops', score: 655, verdict: 'partial', progress: 80, fleet_preserved: 67, process_eff: 77, robots_lost: 1, total_robots: 3, cost_used: 1010, wasted: 0 }),
    base({ group_name: 'Olympus', score: 498, verdict: 'partial', progress: 60, fleet_preserved: 50, process_eff: 65, robots_lost: 2, total_robots: 4, cost_used: 940, wasted: 130 }),
    base({ group_name: 'Olympus', score: 380, verdict: 'fail', progress: 35, fleet_preserved: 50, process_eff: 60, robots_lost: 2, total_robots: 4, cost_used: 940, wasted: 130 }),
    base({ group_name: 'Valles', score: 221, verdict: 'fail', progress: 0, fleet_preserved: 0, process_eff: 55, robots_lost: 2, total_robots: 2, cost_used: 290, wasted: 290 }),
  ];
}

/* --------------------------------------------------------------------------
   Render
   -------------------------------------------------------------------------- */

function render() {
  renderPodium();
  renderTable();
  renderDetail();
  renderAttempts();
}

function renderPodium() {
  const el = document.getElementById('podium');
  const top = groups.slice(0, RANKING_CONFIG.podiumSize);

  if (!top.length) {
    el.innerHTML = '<div class="podium-empty">Ranking zerado. A rodada começa quando o primeiro grupo terminar uma missão — o painel se atualiza sozinho.</div>';
    return;
  }

  el.innerHTML = top.map((g, i) => {
    const r = g.best;
    const v = verdictByKey(r.verdict);
    return `
      <div class="podium-card p${i + 1}">
        <div class="pc-pos">${['1º lugar', '2º lugar', '3º lugar', '4º lugar'][i] || `${i + 1}º lugar`}</div>
        <div class="pc-name">${escapeHtml(r.group_name)}</div>
        <div class="pc-score">${r.score}<span>/${SCORE_MAX}</span></div>
        <div class="pc-meta">
          ${escapeHtml(r.mission_code)} · ${v.name}<br>
          objetivo ${r.progress}% · frota ${r.total_robots - r.robots_lost}/${r.total_robots} · processo ${r.process_eff}%
        </div>
      </div>`;
  }).join('');
}

function renderTable() {
  const body = document.getElementById('rank-body');
  if (!groups.length) {
    body.innerHTML = '<tr class="empty-row"><td colspan="7">Aguardando a primeira missão da rodada…</td></tr>';
    return;
  }

  body.innerHTML = groups.map((g, i) => {
    const r = g.best;
    const members = r.members ? String(r.members).replace(/\n/g, ' · ') : '';
    return `
      <tr data-key="${escapeAttr(g.key)}" class="${g.key === selectedKey ? 'selected' : ''}">
        <td class="pos">${i + 1}</td>
        <td>
          <div class="gname">${escapeHtml(r.group_name)}</div>
          ${members ? `<div class="gmembers">${escapeHtml(members)}</div>` : ''}
        </td>
        <td class="num score">${r.score}</td>
        <td class="num">${r.progress}%</td>
        <td class="num">${r.total_robots - r.robots_lost}/${r.total_robots}</td>
        <td class="num">${r.process_eff}%</td>
        <td class="num">${g.attempts}</td>
      </tr>`;
  }).join('');

  body.querySelectorAll('tr[data-key]').forEach((tr) => {
    tr.addEventListener('click', () => {
      selectedKey = tr.dataset.key;
      render();
    });
  });
}

function renderDetail() {
  const el = document.getElementById('detail-body');
  const g = groups.find((x) => x.key === selectedKey);
  if (!g) {
    el.className = 'detail-empty';
    el.textContent = 'Selecione um grupo na tabela.';
    return;
  }

  el.className = '';
  const r = g.best;
  const v = verdictByKey(r.verdict);
  const bd = r.breakdown || {};
  const components = bd.components || [];
  const processLog = bd.processLog || [];
  const audit = bd.audit || [];
  const risks = bd.risks || [];

  const parts = [];
  parts.push(`
    <div class="detail-group">${escapeHtml(r.group_name)}<span class="verdict-chip ${v.css}">${v.name}</span></div>
    <div class="detail-sub">${escapeHtml(r.mission_code)} · ${escapeHtml(r.mission_title || '')} · ${fmtTime(r.created_at)}</div>
    <div class="detail-total">${r.score}<span>/${SCORE_MAX} pontos</span></div>
  `);

  if (components.length) {
    parts.push('<div class="detail-section"><h4>Parcelas da nota</h4>'
      + components.map((c) => `
        <div class="detail-line pos-points">
          <span>
            <span class="lbl-main">${escapeHtml(c.label)}</span>
            <span class="lbl-sub">${escapeHtml(c.detail)}</span>
          </span>
          <span class="v">+${c.points}</span>
        </div>`).join('')
      + '</div>');
  }

  if (processLog.length) {
    parts.push('<div class="detail-section"><h4>Como o processo chegou a '
      + `${r.process_eff}%</h4>`
      + processLog.map((l) => `
        <div class="detail-line ${l.delta >= 0 ? 'up' : 'down'}">
          <span>${escapeHtml(l.label)}</span>
          <span class="v">${l.delta > 0 ? '+' : ''}${l.delta}</span>
        </div>`).join('')
      + '</div>');
  }

  parts.push(`
    <div class="detail-section">
      <h4>Operação</h4>
      <div class="detail-line"><span>Orçamento usado</span><span class="v">${r.cost_used}/${r.budget}c</span></div>
      <div class="detail-line"><span>Créditos mal direcionados</span><span class="v">${r.wasted || 0}c</span></div>
      <div class="detail-line"><span>Robôs perdidos</span><span class="v">${r.robots_lost}/${r.total_robots}</span></div>
      ${fleetLine(bd.fleet)}
    </div>
  `);

  if (audit.length) {
    parts.push('<div class="detail-section"><h4>Auditoria de investimento</h4>'
      + audit.map((f) => `
        <div class="detail-line down">
          <span>
            <span class="lbl-main">${f.redundant ? 'Redundante' : 'Desnecessário'} · ${escapeHtml(f.name)}</span>
            <span class="lbl-sub">${escapeHtml(f.reason)}</span>
          </span>
          <span class="v">−${f.cost}c</span>
        </div>`).join('')
      + '</div>');
  }

  const realized = risks.filter((x) => x.realized);
  const exposed = risks.filter((x) => !x.realized && x.mitigation === 'exposto');
  if (realized.length || exposed.length) {
    parts.push('<div class="detail-section"><h4>Riscos</h4>'
      + realized.map((x) => `
        <div class="detail-line down">
          <span>${escapeHtml(x.desc)}</span>
          <span class="v">ocorreu</span>
        </div>`).join('')
      + exposed.map((x) => `
        <div class="detail-line">
          <span>${escapeHtml(x.desc)}</span>
          <span class="v">exposto, não ocorreu</span>
        </div>`).join('')
      + '</div>');
  }

  if (bd.notes && bd.notes.length) {
    parts.push(`<div class="detail-section"><h4>Consequências</h4>
      <div class="detail-line"><span>${escapeHtml(bd.notes.join(' '))}</span></div></div>`);
  }

  if (g.attempts > 1) {
    parts.push(`<div class="detail-section"><h4>Tentativas</h4>
      <div class="detail-line"><span>Missões jogadas nesta rodada</span><span class="v">${g.attempts}</span></div>
      <div class="detail-line"><span>Vale a melhor pontuação</span><span class="v">${r.score}</span></div></div>`);
  }

  el.innerHTML = parts.join('');
}

function fleetLine(fleet) {
  if (!fleet || typeof fleet !== 'object') return '';
  const names = {
    agv_simples: 'AGV Simples',
    agv_reforcado: 'AGV Reforçado',
    amr_padrao: 'AMR Padrão',
    amr_offroad: 'AMR Off-road',
  };
  const txt = Object.entries(fleet).map(([k, n]) => `${n}× ${names[k] || k}`).join(', ');
  if (!txt) return '';
  return `<div class="detail-line"><span>Frota montada</span><span class="v">${escapeHtml(txt)}</span></div>`;
}

function renderAttempts() {
  const el = document.getElementById('attempts-body');
  if (!rows.length) {
    el.innerHTML = '<div class="detail-empty">Nenhuma tentativa registrada nesta rodada.</div>';
    return;
  }
  const sorted = [...rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  el.innerHTML = sorted.map((r) => {
    const v = verdictByKey(r.verdict);
    return `
      <div class="attempt-row ${v.css}">
        <span class="at-when">${fmtTime(r.created_at)}</span>
        <span class="at-group">${escapeHtml(r.group_name)}</span>
        <span class="at-mission">${escapeHtml(r.mission_code)} · ${v.name} · objetivo ${r.progress}% · ${r.robots_lost} perdido(s)</span>
        <span class="at-score">${r.score} pts</span>
      </div>`;
  }).join('');
}

/* --------------------------------------------------------------------------
   Relógio da rodada
   -------------------------------------------------------------------------- */

function startPanel() {
  document.getElementById('round-minutes').textContent = RANKING_CONFIG.roundMinutes;
  load();

  // O contador anda a cada segundo com o relógio do servidor; quando a rodada
  // vence, uma recarga mostra a tabela já zerada.
  const tick = () => {
    const venceu = round.state === 'running'
      && (DEMO ? Date.now() : serverNow()) >= round.endsAt;
    if (venceu) load();
    else paintRoundState();
  };
  tick();
  setInterval(tick, 1000);

  refreshTimer = setInterval(load, Math.max(5, RANKING_CONFIG.refreshSeconds) * 1000);
}

/* --------------------------------------------------------------------------
   Utilidades
   -------------------------------------------------------------------------- */

function fmtTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, '&#96;');
}

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

async function boot() {
  document.getElementById('gate-btn').addEventListener('click', async () => {
    const pass = document.getElementById('gate-pass').value;
    if (!pass) { showGateError('Digite a senha.'); return; }
    try {
      if (await checkPassword(pass)) unlock();
      else showGateError('Senha incorreta.');
    } catch (e) {
      showGateError(e.message);
    }
  });

  document.getElementById('gate-pass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('gate-btn').click();
  });

  document.getElementById('btn-refresh').addEventListener('click', load);
  document.getElementById('btn-reset').addEventListener('click', doReset);
  document.getElementById('btn-lock').addEventListener('click', lock);

  let unlocked = false;
  try { unlocked = sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { /* ignora */ }
  if (!unlocked) unlocked = await tryUnlockFromUrl();
  if (unlocked) unlock();
}

boot();
