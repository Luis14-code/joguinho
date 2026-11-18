/* ============================================================================
   PAINEL DE RANKING — uso do docente
   ----------------------------------------------------------------------------
   Classificação da rodada corrente (ver net/rounds.js: a rodada vale até o
   botão "Zerar ranking"). O grupo é ranqueado pela SOMA dos pontos de todas as
   missões que jogou na rodada, e o painel abre a memória de cálculo de cada
   jogo separadamente, em abas.

   O acesso é protegido por uma senha comparada via SHA-256 com o hash do
   config.js. Em site estático isso é uma cortina para a turma, não um cofre.
   ========================================================================== */

import { RANKING_CONFIG } from '../../config.js';
import { fetchRoundState, pushReset, isConfigured } from '../net/leaderboard.js';
import { deriveRound, filterRoundRows, hhmm } from '../net/rounds.js';
import { SCORE_MAX, verdictByKey } from '../core/scoring.js';
import { formatDuration, durationOf } from '../core/format.js';
import { startVersionCheck } from '../ui/versioncheck.js';

const SESSION_KEY = 'marsops.rankingUnlocked';

/** Lido uma vez: a querystring é limpa assim que a senha do link é aceita. */
const URL_PARAMS = new URLSearchParams(location.search);
const DEMO = URL_PARAMS.get('demo') === '1';

let rows = [];
let groups = [];
let selectedKey = null;
let selectedTab = 'resumo';     // 'resumo' ou o índice da tentativa
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
  const k = URL_PARAMS.get('k');
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
   Agregação: o grupo soma os pontos de todas as missões da rodada
   -------------------------------------------------------------------------- */

function normalizeKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function aggregate(list) {
  const byGroup = new Map();

  list.forEach((row) => {
    const key = normalizeKey(row.group_name);
    if (!byGroup.has(key)) byGroup.set(key, { key, name: row.group_name, members: '', rows: [] });
    const g = byGroup.get(key);
    g.rows.push(row);
    g.name = row.group_name;                    // vale o último nome escrito
    if (row.members) g.members = row.members;
  });

  const out = [...byGroup.values()].map((g) => {
    g.rows.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    g.attempts = g.rows.length;
    g.total = g.rows.reduce((a, r) => a + (r.score || 0), 0);
    g.best = g.rows.reduce((a, r) => Math.max(a, r.score || 0), 0);
    g.avg = Math.round(g.total / g.attempts);
    g.missions = new Set(g.rows.map((r) => r.mission_code)).size;
    const ds = g.rows.map(durationOf).filter((d) => d !== null);
    g.totalDuration = ds.length === g.rows.length ? ds.reduce((a, b) => a + b, 0) : null;
    g.firstAt = Date.parse(g.rows[0].created_at);
    // rótulo de cada aba: código da missão, com (2), (3)… se repetir
    const seen = {};
    g.rows.forEach((r) => {
      seen[r.mission_code] = (seen[r.mission_code] || 0) + 1;
      r._tabLabel = seen[r.mission_code] > 1
        ? `${r.mission_code} (${seen[r.mission_code]})`
        : r.mission_code;
    });
    return g;
  });

  // soma desc → tempo total asc (mais rápido na frente) → quem chegou antes
  out.sort((a, b) => (b.total - a.total)
    || ((a.totalDuration === null ? Infinity : a.totalDuration) - (b.totalDuration === null ? Infinity : b.totalDuration))
    || (a.firstAt - b.firstAt));
  return out;
}

/* --------------------------------------------------------------------------
   Carga
   -------------------------------------------------------------------------- */

async function load() {
  if (loading) return;
  loading = true;
  const status = document.getElementById('status-box');

  try {
    if (DEMO) {
      const all = demoRows();
      const times = all.map((r) => Date.parse(r.created_at)).sort((a, b) => a - b);
      round = deriveRound(times, null);
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
        if (st.resetsAvailable) {
          status.hidden = true;
        } else {
          status.hidden = false;
          status.className = 'alert amber';
          status.textContent = '⚠ O botão de zerar ainda não funciona: rode sql/migracao-rodadas.sql no SQL Editor do Supabase.';
        }
      } catch (e) {
        status.hidden = false;
        status.className = 'alert red';
        status.textContent = `⚠ Falha ao ler o ranking: ${e.message}`;
      }
    }

    groups = aggregate(rows);
    if (selectedKey && !groups.some((g) => g.key === selectedKey)) {
      selectedKey = null;
      selectedTab = 'resumo';
    }
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

  if (round.state === 'running') {
    const pontos = groups.reduce((a, g) => a + g.total, 0);
    title.textContent = 'Rodada em disputa';
    clock.textContent = `${rows.length} jogada(s) · ${pontos} pts`;
    clock.classList.remove('idle');
    box.className = 'round-state running';
    box.innerHTML = `⏱ Aberta às <b>${hhmm(round.startedAt)}</b>, na primeira jogada depois do último reinício. `
      + 'Cada grupo soma os pontos de todas as missões que jogar; a rodada vale até você apertar <b>Zerar ranking</b>.'
      + resetNote();
  } else {
    title.textContent = 'Aguardando a primeira jogada';
    clock.textContent = 'ranking zerado';
    clock.classList.add('idle');
    box.className = 'round-state waiting';
    box.innerHTML = '⏸ Ranking zerado. A próxima rodada começa quando o primeiro grupo terminar uma missão.'
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
    ? `Zerar o ranking agora?\n\n${quantos} pontuação(ões) da rodada atual saem da tabela e a próxima rodada começa na jogada seguinte.\n\nNada é apagado do banco — o histórico continua lá.`
    : 'Zerar o ranking agora?\n\nO ranking já está vazio; isso só marca um novo começo.';
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
    selectedTab = 'resumo';
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

/* --------------------------------------------------------------------------
   Render
   -------------------------------------------------------------------------- */

function render() {
  renderPodium();
  renderTable();
  renderDetail();
  renderFastest();
  renderAttempts();
}

function renderPodium() {
  const el = document.getElementById('podium');
  const top = groups.slice(0, RANKING_CONFIG.podiumSize);

  if (!top.length) {
    el.innerHTML = '<div class="podium-empty">Ranking zerado. A rodada começa quando o primeiro grupo terminar uma missão — o painel se atualiza sozinho.</div>';
    return;
  }

  el.innerHTML = top.map((g, i) => `
      <div class="podium-card p${i + 1}">
        <div class="pc-pos">${['1º lugar', '2º lugar', '3º lugar', '4º lugar'][i] || `${i + 1}º lugar`}</div>
        <div class="pc-name">${escapeHtml(g.name)}</div>
        <div class="pc-score">${g.total}<span> pts</span></div>
        <div class="pc-meta">
          ${g.attempts} missão(ões) · média ${g.avg} · melhor ${g.best}<br>
          tempo total ${formatDuration(g.totalDuration)}
        </div>
        <div class="pc-missions">
          ${g.rows.map((r) => `<span class="pc-chip ${verdictByKey(r.verdict).css}" title="${escapeAttr(`${r.mission_title || r.mission_code} · ${formatDuration(durationOf(r))}`)}">${escapeHtml(r.mission_code)} <b>${r.score}</b></span>`).join('')}
        </div>
      </div>`).join('');
}

function renderTable() {
  const body = document.getElementById('rank-body');
  if (!groups.length) {
    body.innerHTML = '<tr class="empty-row"><td colspan="7">Aguardando a primeira missão da rodada…</td></tr>';
    return;
  }

  body.innerHTML = groups.map((g, i) => {
    const members = g.members ? String(g.members).replace(/\n/g, ' · ') : '';
    return `
      <tr data-key="${escapeAttr(g.key)}" class="${g.key === selectedKey ? 'selected' : ''}">
        <td class="pos">${i + 1}</td>
        <td>
          <div class="gname">${escapeHtml(g.name)}</div>
          ${members ? `<div class="gmembers">${escapeHtml(members)}</div>` : ''}
        </td>
        <td class="num score">${g.total}</td>
        <td class="num">${g.attempts}</td>
        <td class="num">${g.avg}</td>
        <td class="num">${g.best}</td>
        <td class="num">${formatDuration(g.totalDuration)}</td>
      </tr>`;
  }).join('');

  body.querySelectorAll('tr[data-key]').forEach((tr) => {
    tr.addEventListener('click', () => {
      if (selectedKey !== tr.dataset.key) selectedTab = 'resumo';
      selectedKey = tr.dataset.key;
      render();
    });
  });
}

/* ---------- memória de cálculo: resumo do grupo + uma aba por jogo ------- */

function renderDetail() {
  const el = document.getElementById('detail-body');
  const g = groups.find((x) => x.key === selectedKey);
  if (!g) {
    el.className = 'detail-empty';
    el.textContent = 'Selecione um grupo na tabela.';
    return;
  }

  el.className = '';
  const idx = selectedTab === 'resumo' ? -1 : Number(selectedTab);
  const tabs = `
    <div class="detail-tabs">
      <button class="dtab ${idx < 0 ? 'active' : ''}" data-tab="resumo">Resumo</button>
      ${g.rows.map((r, i) => `
        <button class="dtab ${idx === i ? 'active' : ''}" data-tab="${i}">${escapeHtml(r._tabLabel)}</button>
      `).join('')}
    </div>`;

  el.innerHTML = `
    <div class="detail-group">${escapeHtml(g.name)}</div>
    <div class="detail-sub">${g.attempts} missão(ões) na rodada · tempo total ${formatDuration(g.totalDuration)}</div>
    ${tabs}
    <div id="detail-content">${idx < 0 ? renderResumo(g) : renderAttempt(g.rows[idx], g)}</div>
  `;

  el.querySelectorAll('.dtab').forEach((b) => {
    b.addEventListener('click', () => {
      selectedTab = b.dataset.tab;
      renderDetail();
    });
  });
  el.querySelectorAll('[data-open-tab]').forEach((b) => {
    b.addEventListener('click', () => {
      selectedTab = b.dataset.openTab;
      renderDetail();
    });
  });
}

/** Aba "Resumo": como a soma do grupo foi formada. */
function renderResumo(g) {
  const linhas = g.rows.map((r, i) => {
    const v = verdictByKey(r.verdict);
    return `
      <div class="detail-line pos-points" data-open-tab="${i}" role="button" tabindex="0">
        <span>
          <span class="lbl-main">${escapeHtml(r.mission_code)} · ${escapeHtml(r.mission_title || '')}</span>
          <span class="lbl-sub">${v.name} · objetivo ${r.progress}% · frota ${r.total_robots - r.robots_lost}/${r.total_robots} · ${formatDuration(durationOf(r))} · ${hhmm(Date.parse(r.created_at))}</span>
        </span>
        <span class="v">+${r.score}</span>
      </div>`;
  }).join('');

  const rapidas = g.rows.filter((r) => durationOf(r) !== null);
  const maisRapida = rapidas.length
    ? rapidas.reduce((a, b) => (durationOf(a) <= durationOf(b) ? a : b))
    : null;

  return `
    <div class="detail-total">${g.total}<span> pontos somados</span></div>

    <div class="detail-section">
      <h4>Pontos por missão</h4>
      ${linhas}
    </div>

    <div class="detail-section">
      <h4>Desempenho na rodada</h4>
      <div class="detail-line"><span>Missões jogadas</span><span class="v">${g.attempts}</span></div>
      <div class="detail-line"><span>Missões diferentes</span><span class="v">${g.missions} de 4</span></div>
      <div class="detail-line"><span>Média por missão</span><span class="v">${g.avg}</span></div>
      <div class="detail-line"><span>Melhor resultado</span><span class="v">${g.best} / ${SCORE_MAX}</span></div>
      <div class="detail-line"><span>Tempo total</span><span class="v">${formatDuration(g.totalDuration)}</span></div>
      ${maisRapida ? `<div class="detail-line"><span>Missão mais rápida</span><span class="v">${escapeHtml(maisRapida.mission_code)} · ${formatDuration(durationOf(maisRapida))}</span></div>` : ''}
    </div>
  `;
}

/** Aba de um jogo: a memória de cálculo daquela missão. */
function renderAttempt(r, g) {
  const v = verdictByKey(r.verdict);
  const bd = r.breakdown || {};
  const components = bd.components || [];
  const processLog = bd.processLog || [];
  const audit = bd.audit || [];
  const risks = bd.risks || [];
  const parts = [];

  parts.push(`
    <div class="attempt-head">
      <div>
        <div class="ah-mission">${escapeHtml(r.mission_code)} · ${escapeHtml(r.mission_title || '')}</div>
        <div class="ah-when">jogada às ${hhmm(Date.parse(r.created_at))} · ${formatDuration(durationOf(r))} do briefing ao lançamento</div>
      </div>
      <span class="verdict-chip ${v.css}">${v.name}</span>
    </div>
    <div class="detail-total">${r.score}<span>/${SCORE_MAX} pontos</span></div>
  `);

  if (components.length) {
    parts.push(`<div class="detail-section"><h4>Parcelas da nota</h4>${
      components.map((c) => `
        <div class="detail-line pos-points">
          <span>
            <span class="lbl-main">${escapeHtml(c.label)}</span>
            <span class="lbl-sub">${escapeHtml(c.detail)}</span>
          </span>
          <span class="v">+${c.points}</span>
        </div>`).join('')
    }</div>`);
  }

  if (processLog.length) {
    parts.push(`<div class="detail-section"><h4>Como o processo chegou a ${r.process_eff}%</h4>${
      processLog.map((l) => `
        <div class="detail-line ${l.delta >= 0 ? 'up' : 'down'}">
          <span>${escapeHtml(l.label)}</span>
          <span class="v">${l.delta > 0 ? '+' : ''}${l.delta}</span>
        </div>`).join('')
    }</div>`);
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
    parts.push(`<div class="detail-section"><h4>Auditoria de investimento</h4>${
      audit.map((f) => `
        <div class="detail-line down">
          <span>
            <span class="lbl-main">${f.redundant ? 'Redundante' : 'Desnecessário'} · ${escapeHtml(f.name)}</span>
            <span class="lbl-sub">${escapeHtml(f.reason)}</span>
          </span>
          <span class="v">−${f.cost}c</span>
        </div>`).join('')
    }</div>`);
  }

  const realized = risks.filter((x) => x.realized);
  const exposed = risks.filter((x) => !x.realized && x.mitigation === 'exposto');
  if (realized.length || exposed.length) {
    parts.push(`<div class="detail-section"><h4>Riscos</h4>${
      realized.map((x) => `
        <div class="detail-line down"><span>${escapeHtml(x.desc)}</span><span class="v">ocorreu</span></div>`).join('')
    }${
      exposed.map((x) => `
        <div class="detail-line"><span>${escapeHtml(x.desc)}</span><span class="v">exposto, não ocorreu</span></div>`).join('')
    }</div>`);
  }

  if (bd.notes && bd.notes.length) {
    parts.push(`<div class="detail-section"><h4>Consequências</h4>
      <div class="detail-line"><span>${escapeHtml(bd.notes.join(' '))}</span></div></div>`);
  }

  parts.push(`<div class="detail-section">
    <div class="detail-line"><span>Peso desta missão na soma do grupo</span><span class="v">${r.score} de ${g.total}</span></div>
  </div>`);

  return parts.join('');
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

/* ---------- mais rápidos por missão -------------------------------------- */

function renderFastest() {
  const el = document.getElementById('fastest-body');
  if (!el) return;

  // só missões levadas até o fim: senão desistir rápido venceria a prova
  const validos = rows.filter((r) => durationOf(r) !== null && r.verdict !== 'fail');
  if (!validos.length) {
    el.innerHTML = '<div class="detail-empty">Nenhuma missão concluída com tempo registrado ainda.</div>';
    return;
  }

  const porMissao = new Map();
  validos.forEach((r) => {
    const cur = porMissao.get(r.mission_code);
    if (!cur || durationOf(r) < durationOf(cur)) porMissao.set(r.mission_code, r);
  });

  el.innerHTML = [...porMissao.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([code, r]) => {
      const v = verdictByKey(r.verdict);
      return `
        <div class="fast-row ${v.css}">
          <span class="f-mission">${escapeHtml(code)}<span class="f-title">${escapeHtml(r.mission_title || '')}</span></span>
          <span class="f-group">${escapeHtml(r.group_name)}</span>
          <span class="f-meta">${r.score} pts · ${v.name}</span>
          <span class="f-time">${formatDuration(durationOf(r))}</span>
        </div>`;
    }).join('');
}

/* ---------- todas as tentativas ------------------------------------------ */

function renderAttempts() {
  const el = document.getElementById('attempts-body');
  if (!rows.length) {
    el.innerHTML = '<div class="detail-empty">Nenhuma tentativa registrada nesta rodada.</div>';
    return;
  }
  const sorted = [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  el.innerHTML = sorted.map((r) => {
    const v = verdictByKey(r.verdict);
    return `
      <div class="attempt-row ${v.css}">
        <span class="at-when">${hhmm(Date.parse(r.created_at))}</span>
        <span class="at-group">${escapeHtml(r.group_name)}</span>
        <span class="at-mission">${escapeHtml(r.mission_code)} · ${v.name} · objetivo ${r.progress}% · ${r.robots_lost} perdido(s) · ${formatDuration(durationOf(r))}</span>
        <span class="at-score">${r.score} pts</span>
      </div>`;
  }).join('');
}

/* --------------------------------------------------------------------------
   Modo demonstração
   -------------------------------------------------------------------------- */

function demoRows() {
  const base = (over) => ({
    round_id: 0,
    created_at: new Date(Date.now() - (over.hamin || 1) * 60000).toISOString(),
    members: '',
    budget: 1000,
    breakdown: {
      durationMs: (over.secs || 120) * 1000,
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
    base({ group_name: 'Esquadrão Ares', mission_code: 'LOG-01', mission_title: 'Logística Inter-Bases', score: 842, verdict: 'success', progress: 100, process_eff: 71, robots_lost: 0, total_robots: 3, cost_used: 960, wasted: 90, secs: 184, hamin: 22 }),
    base({ group_name: 'Esquadrão Ares', mission_code: 'MIN-02', mission_title: 'Mineração de Regolito', score: 655, verdict: 'partial', progress: 80, process_eff: 77, robots_lost: 1, total_robots: 3, cost_used: 1010, wasted: 0, secs: 142, hamin: 12 }),
    base({ group_name: 'Fobos Log', mission_code: 'LOG-01', mission_title: 'Logística Inter-Bases', score: 714, verdict: 'partial', progress: 90, process_eff: 82, robots_lost: 1, total_robots: 4, cost_used: 880, wasted: 40, secs: 96, hamin: 18 }),
    base({ group_name: 'Fobos Log', mission_code: 'HAB-03', mission_title: 'Montagem do Habitat H-7', score: 498, verdict: 'partial', progress: 60, process_eff: 65, robots_lost: 2, total_robots: 4, cost_used: 940, wasted: 130, secs: 210, hamin: 6 }),
    base({ group_name: 'Deimos Ops', mission_code: 'SAR-04', mission_title: 'Resgate do Rover Endurance', score: 921, verdict: 'success', progress: 100, process_eff: 86, robots_lost: 0, total_robots: 2, cost_used: 950, wasted: 0, secs: 256, hamin: 9 }),
    base({ group_name: 'Valles', mission_code: 'MIN-02', mission_title: 'Mineração de Regolito', score: 221, verdict: 'fail', progress: 0, process_eff: 55, robots_lost: 2, total_robots: 2, cost_used: 290, wasted: 290, secs: 41, hamin: 3 }),
  ];
}

/* --------------------------------------------------------------------------
   Boot
   -------------------------------------------------------------------------- */

function startPanel() {
  load();
  refreshTimer = setInterval(load, Math.max(5, RANKING_CONFIG.refreshSeconds) * 1000);
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s).replace(/`/g, '&#96;');
}

async function boot() {
  startVersionCheck();

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
