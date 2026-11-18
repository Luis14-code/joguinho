/* ============================================================================
   RANKING — cliente REST do Supabase
   ----------------------------------------------------------------------------
   Site estático não tem servidor, então o navegador fala direto com a API REST
   do Supabase usando a chave anon. As políticas RLS do schema permitem apenas
   INSERT e SELECT: ninguém apaga nem edita a pontuação de outro grupo.

   Se a wifi da sala falhar no momento do envio, a pontuação fica numa fila no
   localStorage e é reenviada na próxima tentativa.
   ========================================================================== */

import { RANKING_CONFIG } from '../../config.js';
import { currentRound } from './rounds.js';

const QUEUE_KEY = 'marsops.pendingScores';

export function isConfigured() {
  return Boolean(RANKING_CONFIG.supabaseUrl && RANKING_CONFIG.supabaseAnonKey);
}

function endpoint(query = '') {
  const base = RANKING_CONFIG.supabaseUrl.replace(/\/+$/, '');
  return `${base}/rest/v1/${RANKING_CONFIG.table}${query}`;
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

/** Monta a linha a ser gravada a partir do resultado da simulação. */
export function buildEntry(group, mission, result) {
  const round = currentRound();
  return {
    round_id: round.id,
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
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(rows),
  });
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
 * @returns {Promise<{ok:boolean, queued?:boolean, reason?:string, round:object}>}
 */
export async function submitScore(entry) {
  const round = currentRound();
  if (!isConfigured()) {
    return { ok: false, reason: 'not-configured', round };
  }
  try {
    await flushQueue();
    await postRows([entry]);
    return { ok: true, round };
  } catch (e) {
    enqueue(entry);
    return { ok: false, queued: true, reason: e.message, round };
  }
}

/** Busca as pontuações de uma rodada, já ordenadas. */
export async function fetchRound(roundId) {
  if (!isConfigured()) throw new Error('Ranking não configurado (veja config.js).');
  const query = `?round_id=eq.${roundId}&order=score.desc,wasted.asc,created_at.asc&limit=500`;
  const res = await fetch(endpoint(query), { headers: headers() });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json();
}
