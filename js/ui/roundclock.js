/* ============================================================================
   ESTADO DA RODADA (cabeçalho do jogo)
   ----------------------------------------------------------------------------
   A rodada não tem prazo: vale até o docente zerar o ranking pelo painel. Aqui
   o jogo só informa se a disputa já está valendo e desde quando.
   ========================================================================== */

import { fetchRoundState, isConfigured } from '../net/leaderboard.js';
import { hhmm } from '../net/rounds.js';

const REFETCH_MS = 30000;

let round = null;
let fetching = null;

/** Última rodada conhecida (usada para carimbar o round_id da pontuação). */
export function getRound() {
  return round;
}

/** Relê a rodada no banco. Chamadas simultâneas compartilham a mesma busca. */
export function refreshRound() {
  if (!isConfigured()) return Promise.resolve(null);
  if (fetching) return fetching;
  fetching = fetchRoundState({ light: true })
    .then((state) => { round = state.round; return round; })
    .catch(() => round)
    .finally(() => { fetching = null; });
  return fetching;
}

function paint() {
  const el = document.getElementById('round-clock');
  if (!el) return;

  if (!isConfigured()) {
    el.textContent = 'Ranking desligado neste site';
    el.classList.add('idle');
    return;
  }
  if (!round || round.state !== 'running') {
    el.textContent = 'Ranking zerado · sua jogada abre a rodada';
    el.classList.add('idle');
    return;
  }
  el.classList.remove('idle');
  el.textContent = `Rodada em disputa desde ${hhmm(round.startedAt)}`;
}

export function startRoundClock() {
  paint();
  refreshRound().then(paint);
  setInterval(() => refreshRound().then(paint), REFETCH_MS);
}

/** Usada logo após enviar uma pontuação, para o cabeçalho reagir na hora. */
export async function refreshRoundNow() {
  await refreshRound();
  paint();
  return round;
}
