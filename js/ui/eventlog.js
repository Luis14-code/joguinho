/* ============================================================================
   LOG LATERAL DE EVENTOS
   ----------------------------------------------------------------------------
   O timestamp exibido é derivado do próprio evento, então o relógio do HUD e
   o log sempre batem.
   ========================================================================== */

export function clearEventLog() {
  const list = document.getElementById('event-list');
  if (list) list.innerHTML = '';
}

export function addEventToLog(evt) {
  const list = document.getElementById('event-list');
  if (!list) return;
  const item = document.createElement('div');
  item.className = `event-item ${evt.type}`;
  const timeStr = `T+${String(Math.floor(evt.t * 10)).padStart(3, '0')}s`;
  item.innerHTML = `<span class="event-time">${timeStr}</span>${evt.text}`;
  list.insertBefore(item, list.firstChild);
}
