/* ============================================================================
   RANKING — cliente REST do Supabase
   ----------------------------------------------------------------------------
   Site estático não tem servidor, então o navegador fala direto com a API REST
   do Supabase usando a chave pública. As políticas RLS do schema permitem
   apenas INSERT e SELECT: ninguém apaga nem edita a pontuação de outro grupo.

   O relógio de referência é o do servidor (cabeçalho Date de cada resposta),
   não o da máquina: assim o cronômetro da rodada bate em todos os notebooks
   da sala, mesmo com relógios desacertados.

   Se a wifi da sala falhar no momento do envio, a pontuação fica numa fila no
   localStorage e é reenviada na próxima tentativa.
   ========================================================================== */

import { RANKING_CONFIG } from '../../config.js';
import { deriveRound } from './rounds.js';

const QUEUE_KEY = 'marsops.pendingScores';
const RESETS_TABLE = 'marsops_resets';

/** Diferença entre o relógio do servidor e o desta máquina, em ms. */
let clockOffset = 0;

export function serverNow() {
  return Date.now() + clockOffset;
}

export function isConfigured() {
  return Boolean(RANKING_CONFIG.supabaseUrl && RANKING_CONFIG.supabaseAnonKey);
}

function base() {
  return RANKING_CONFIG.supabaseUrl.replace(/\/+$/, '');
}

function endpoint(table, query = '') {
  return `${base()}/rest/v1/${table}${query}`;
}

function headers(extra = {}) {
  const key = RANKING_CONFIG.supabaseAnonKey;
  const h = { 'Content-Type': 'application/json', apikey: key, ...extra };
  // Chave legada (anon) é um JWT e vai também no Authorization. As chaves
  // novas (sb_publishable_…) não são JWT: mandá-las no Authorization faz o
  // PostgREST recusar com "invalid JWT", então só o apikey é enviado.
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

/** Sincroniza o relógio com o servidor a cada resposta recebida. */
function syncClock(res) {
  const d = res.headers.get('date');
  if (!d) return;
  const t = Date.parse(d);
  if (!Number.isNaN(t)) clockOffset = t - Date.now();
}

async function get(table, query) {
  const res = await fetch(endpoint(table, query), { headers: headers() });
  syncClock(res);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/* --------------------------------------------------------------------------
   Leitura da rodada
   -------------------------------------------------------------------------- */

/** Janela de busca: o bastante para derivar a rodada sem puxar o banco todo. */
function sinceIso() {
  return new Date(serverNow() - 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Estado completo da rodada corrente.
 * @param {{light?: boolean}} opts  light = só os horários (relógio do jogo)
 */
export async function fetchRoundState({ light = false } = {}) {
  const select = light ? 'created_at' : '*';
  const [rows, resets] = await Promise.all([
    get(RANKING_CONFIG.table, `?select=${select}&created_at=gte.${sinceIso()}&order=created_at.asc&limit=1000`),
    fetchLastReset(),
  ]);
  const times = rows.map((r) => Date.parse(r.created_at)).filter((t) => !Number.isNaN(t));
  const round = deriveRound(times, resets, serverNow());
  return { round, rows, lastResetAt: resets };
}

/** Horário do último reinício manual, ou null. */
export async function fetchLastReset() {
  try {
    const rows = await get(RESETS_TABLE, '?select=at&order=at.desc&limit=1');
    return rows.length ? Date.parse(rows[0].at) : null;
  } catch (e) {
    // tabela ainda não criada (ver sql/migracao-rodadas.sql): segue sem
    // reinício manual, que é exatamente o comportamento anterior
    if (e.status === 404 || e.status === 400) return null;
    throw e;
  }
}

/** Grava o marcador que zera o ranking a partir de agora. */
export async function pushReset(label = 'painel') {
  const res = await fetch(endpoint(RESETS_TABLE), {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify([{ by_label: label.slice(0, 60) }]),
  });
  syncClock(res);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 404 || res.status === 400) {
      throw new Error('A tabela de reinícios ainda não existe. Rode sql/migracao-rodadas.sql no Supabase.');
    }
    throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
  }
}

/* --------------------------------------------------------------------------
   Envio de pontuação
   -------------------------------------------------------------------------- */

/** Monta a linha a ser gravada a partir do resultado da simulação. */
export function buildEntry(group, mission, result, round) {
  return {
    // round_id não manda mais no ranking (a rodada é derivada dos horários),
    // mas continua gravado como diagnóstico: o minuto em que a rodada começou
    round_id: Math.floor(((round && round.startedAt) || serverNow()) / 60000),
    group_name: (group.name || 'Sem nome').slice(0, 60),
    members: (group.members || '').slice(0, 500),
    mission_id: mission.id,
    mission_code: mission.code,
    mission_title: mission.title,
    score: result.score,
    verdict: result.verdict.key,
    progress: Math.round(result.progress),
    fleet_preserved: Math.round(result.fleetPreserved),
    process_eff: Math.round(result.processEff),
    robots_lost: result.robotsLost,
    total_robots: result.totalRobots,
    cost_used: result.costUsed,
    budget: result.budget,
    wasted: result.audit.wasted,
    breakdown: {
      components: result.scoreComponents,
      processLog: result.processLog,
      audit: result.audit.findings,
      notes: result.criticalNotes,
      risks: result.riskReport,
      fleet: fleetSummary(result),
    },
  };
}

function fleetSummary(result) {
  const counts = {};
  result.fleet.forEach((f) => { counts[f.type] = (counts[f.type] || 0) + 1; });
  return counts;
}

/* --------------------------------------------------------------------------
   Fila local (resiliência a wifi ruim)
   -------------------------------------------------------------------------- */

function readQueue() {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  } catch (e) { return []; }
}

function writeQueue(list) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-20)));
  } catch (e) { /* ignora */ }
}

function enqueue(entry) {
  const q = readQueue();
  q.push(entry);
  writeQueue(q);
}

async function postRows(rows) {
  const res = await fetch(endpoint(RANKING_CONFIG.table), {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(rows),
  });
  syncClock(res);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
  }
}

/** Reenvia o que ficou pendente de tentativas anteriores. */
export async function flushQueue() {
  if (!isConfigured()) return;
  const q = readQueue();
  if (!q.length) return;
  try {
    await postRows(q);
    writeQueue([]);
  } catch (e) { /* tenta de novo na próxima vez */ }
}

/**
 * Envia a pontuação.
 * @returns {Promise<{ok:boolean, queued?:boolean, reason?:string}>}
 */
export async function submitScore(entry) {
  if (!isConfigured()) return { ok: false, reason: 'not-configured' };
  try {
    await flushQueue();
    await postRows([entry]);
    return { ok: true };
  } catch (e) {
    enqueue(entry);
    return { ok: false, queued: true, reason: e.message };
  }
}
