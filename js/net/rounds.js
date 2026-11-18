/* ============================================================================
   RODADAS DE COMPETIÇÃO
   ----------------------------------------------------------------------------
   A rodada NÃO é uma fatia fixa do relógio: ela começa quando alguém faz a
   primeira jogada e dura `roundMinutes`. Enquanto ninguém joga, o cronômetro
   não corre — a turma pode receber o link antes e nada é descartado.

   Quando a rodada vence, o ranking zera sozinho: as pontuações seguintes já
   pertencem à rodada seguinte, que por sua vez só começa a contar na primeira
   jogada depois do vencimento.

   O docente também pode zerar na hora, pelo botão do painel. Isso grava um
   marcador na tabela `marsops_resets`; a partir dele, tudo que veio antes sai
   do ranking (nada é apagado do banco) e o cronômetro volta a esperar a
   próxima jogada.

   Tudo é derivado de dois dados públicos — os horários das pontuações e o
   último marcador de reinício —, então jogo e painel chegam exatamente à
   mesma rodada sem precisar de servidor.
   ========================================================================== */

import { RANKING_CONFIG } from '../../config.js';

export function roundLengthMs() {
  return Math.max(1, RANKING_CONFIG.roundMinutes) * 60 * 1000;
}

/**
 * Descobre a rodada corrente.
 *
 * @param {number[]} times  horários das pontuações (ms), em ordem crescente
 * @param {number|null} lastResetAt  horário do último reinício manual (ms)
 * @param {number} now  agora, de preferência o relógio do servidor
 * @returns {{state:'waiting'|'running', cutAt:number, startedAt?:number,
 *            endsAt?:number, msLeft?:number}}
 *   waiting — ninguém jogou ainda nesta rodada; o cronômetro não começou
 *   running — rodada em andamento, começou em startedAt e vence em endsAt
 */
export function deriveRound(times, lastResetAt, now) {
  const len = roundLengthMs();
  let cut = lastResetAt || 0;

  // Cada volta pula uma rodada que já venceu. O corte só cresce, então
  // o laço termina: ou acha uma rodada viva, ou acaba a lista de jogadas.
  for (;;) {
    const first = times.find((t) => t > cut);
    if (first === undefined) return { state: 'waiting', cutAt: cut };

    const endsAt = first + len;
    if (now < endsAt) {
      return { state: 'running', cutAt: cut, startedAt: first, endsAt, msLeft: endsAt - now };
    }
    cut = endsAt;
  }
}

/** Mantém só as linhas que pertencem à rodada corrente. */
export function filterRoundRows(rows, round) {
  if (round.state !== 'running') return [];
  return rows.filter((r) => {
    const t = Date.parse(r.created_at);
    return t >= round.startedAt && t < round.endsAt;
  });
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function hhmm(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Texto curto da situação da rodada, usado no jogo e no painel. */
export function roundLabel(round) {
  if (round.state !== 'running') {
    return `Ranking zerado · a rodada de ${RANKING_CONFIG.roundMinutes} min começa na próxima jogada`;
  }
  return `Rodada iniciada ${hhmm(round.startedAt)} · zera em ${formatCountdown(round.msLeft)}`;
}
