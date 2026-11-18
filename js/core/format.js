/* ============================================================================
   FORMATAÇÃO COMPARTILHADA entre o jogo e o painel
   ========================================================================== */

/** 95000 → "1m35s"; 42000 → "42s"; null → "—" */
export function formatDuration(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '—';
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s}s`;
  return `${m}m${String(s).padStart(2, '0')}s`;
}

/** Duração gravada de uma linha do ranking (ms) ou null. */
export function durationOf(row) {
  const d = row && row.breakdown && row.breakdown.durationMs;
  return typeof d === 'number' && d > 0 ? d : null;
}
