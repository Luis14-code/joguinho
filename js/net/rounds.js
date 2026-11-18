/* ============================================================================
   RODADAS DE COMPETIÇÃO
   ----------------------------------------------------------------------------
   A rodada não tem prazo: ela vale até o docente apertar "Zerar ranking" no
   painel. Isso grava um marcador em `marsops_resets`; tudo que veio antes sai
   da classificação (nada é apagado do banco) e o ranking volta a esperar a
   próxima jogada.

   Ou seja: a rodada corrente é simplesmente "tudo que foi jogado depois do
   último reinício". Jogo e painel derivam isso dos mesmos dois dados públicos
   — os horários das pontuações e o último marcador —, então ambos chegam à
   mesma rodada sem precisar de servidor.
   ========================================================================== */

/**
 * Descobre a rodada corrente.
 *
 * @param {number[]} times  horários das pontuações (ms), em ordem crescente
 * @param {number|null} lastResetAt  horário do último reinício (ms)
 * @returns {{state:'waiting'|'running', cutAt:number, startedAt?:number}}
 *   waiting — ninguém jogou desde o último reinício
 *   running — rodada em andamento desde startedAt (a primeira jogada dela)
 */
export function deriveRound(times, lastResetAt) {
  const cut = lastResetAt || 0;
  const first = times.find((t) => t > cut);
  if (first === undefined) return { state: 'waiting', cutAt: cut };
  return { state: 'running', cutAt: cut, startedAt: first };
}

/** Mantém só as linhas que pertencem à rodada corrente. */
export function filterRoundRows(rows, round) {
  if (round.state !== 'running') return [];
  return rows.filter((r) => Date.parse(r.created_at) > round.cutAt);
}

export function hhmm(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
