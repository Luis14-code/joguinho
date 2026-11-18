/* ============================================================================
   RELÓGIO DA RODADA (cabeçalho do jogo)
   ----------------------------------------------------------------------------
   Busca a rodada corrente no banco de tempos em tempos e, entre uma busca e
   outra, só recalcula o tempo restante com o relógio do servidor. Assim o
   contador anda suave sem martelar a API.
   ========================================================================== */

import { fetchRoundState, isConfigured, serverNow } from '../net/leaderboard.js';
import { formatCountdown } from '../net/rounds.js';
import { RANKING_CONFIG } from '../../config.js';

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
    el.textContent = `Ranking zerado · ${RANKING_CONFIG.roundMinutes} min começam na próxima jogada`;
    el.classList.add('idle');
    return;
  }

  const left = round.endsAt - serverNow();
  if (left <= 0) {
    // venceu: a próxima jogada abre rodada nova
    el.textContent = `Rodada encerrada · ${RANKING_CONFIG.roundMinutes} min começam na próxima jogada`;
    el.classList.add('idle');
    return;
  }
  el.classList.remove('idle');
  el.textContent = `Rodada em curso · zera em ${formatCountdown(left)}`;
}

export function startRoundClock() {
  paint();
  refreshRound().then(paint);
  setInterval(paint, 1000);
  setInterval(() => refreshRound().then(paint), REFETCH_MS);
}

/** Usada logo após enviar uma pontuação, para o contador reagir na hora. */
export async function refreshRoundNow() {
  await refreshRound();
  paint();
  return round;
}
