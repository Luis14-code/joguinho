/* ============================================================================
   TELA 2 — CATÁLOGO DE MISSÕES
   ========================================================================== */

import { MISSIONS } from '../data/missions.js';

export function renderMissions(onPick) {
  const grid = document.getElementById('missions-grid');
  grid.innerHTML = '';
  MISSIONS.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'mission-card';
    card.innerHTML = `
      <div class="mission-id">${m.code}</div>
      <h3>${m.title}</h3>
      <p>${m.tagline}</p>
      <div class="mission-tags">
        ${m.tags.map((t) => `<span class="tag">${t}</span>`).join('')}
      </div>
    `;
    card.addEventListener('click', () => onPick(m));
    grid.appendChild(card);
  });
}
