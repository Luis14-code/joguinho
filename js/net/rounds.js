/* ============================================================================
   RODADAS DE COMPETIÇÃO
   ----------------------------------------------------------------------------
   O ranking se reinicia sozinho a cada N minutos, sem servidor e sem job de
   limpeza: a rodada é derivada do relógio.

     roundId = floor(agora / duração_da_rodada)

   Jogo e painel calculam o mesmo número, então o painel mostra apenas as
   pontuações da rodada corrente — quando o relógio vira, a tabela zera e
   começa uma disputa nova. As linhas antigas continuam no banco (servem de
   histórico) e podem ser apagadas pelo SQL opcional do schema.
   ========================================================================== */

import { RANKING_CONFIG } from '../../config.js';

export function roundLengthMs() {
  return Math.max(1, RANKING_CONFIG.roundMinutes) * 60 * 1000;
}

export function currentRound(now = Date.now()) {
  const len = roundLengthMs();
  const id = Math.floor(now / len);
  const startsAt = id * len;
  const endsAt = startsAt + len;
  return {
    id,
    startsAt,
    endsAt,
    msLeft: endsAt - now,
    label: `${hhmm(startsAt)} – ${hhmm(endsAt)}`,
  };
}

function hhmm(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}
