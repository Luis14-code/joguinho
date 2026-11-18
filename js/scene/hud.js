/* ============================================================================
   HUD sobreposto à cena
   ========================================================================== */

import { svgEl } from './geometry.js';

export const Hud = {
  build(layer, mission) {
    layer.innerHTML = '';
    const x = 636;
    const y = 182;
    const w = 248;
    const h = 96;
    svgEl('rect', { class: 'hud-panel', x, y, width: w, height: h, rx: 4 }, layer);

    const lblObj = svgEl('text', { class: 'hud-label', x: x + 12, y: y + 20 }, layer);
    lblObj.textContent = 'OBJETIVO';
    this.objVal = svgEl('text', { class: 'hud-value', x: x + 12, y: y + 40 }, layer);
    svgEl('rect', { class: 'hud-bar-bg', x: x + 12, y: y + 48, width: 120, height: 6, rx: 3 }, layer);
    this.objBar = svgEl('rect', {
      class: 'hud-bar-fill', x: x + 12.8, y: y + 48.8, width: 118.4, height: 4.4, rx: 2,
    }, layer);
    this.objBar.setAttribute('transform', 'scale(0,1)');
    this.objBarX = x + 12.8;

    const lblFleet = svgEl('text', { class: 'hud-label', x: x + 150, y: y + 20 }, layer);
    lblFleet.textContent = 'FROTA';
    this.fleetVal = svgEl('text', { class: 'hud-value', x: x + 150, y: y + 40 }, layer);

    this.commIcon = svgEl('text', { class: 'hud-comm', x: x + 222, y: y + 40 }, layer);
    this.commIcon.textContent = '📡';

    this.clock = svgEl('text', { class: 'hud-clock', x: x + 150, y: y + 72 }, layer);
    this.sub = svgEl('text', { class: 'hud-sub', x: x + 12, y: y + 72 }, layer);

    // alvo exibido varia por missão
    this.target = ({
      logistica: (n) => `${Math.round((n * 20) / 100)}/20 entregas`,
      mineracao: (n) => `${Math.round((n * 500) / 100)}/500 kg`,
      habitat: (n) => `${Math.round((n * 5) / 100)}/5 módulos`,
      resgate: (n) => `reboque ${Math.round(n)}%`,
    })[mission.id] || ((n) => `${Math.round(n)}%`);
  },

  update(progress, alive, total, tSec, commOk, budgetAlarm) {
    this.objVal.textContent = `${Math.round(progress)}%`;
    this.objBar.setAttribute(
      'transform',
      `translate(${this.objBarX},0) scale(${Math.max(0, progress / 100)},1) translate(${-this.objBarX},0)`
    );
    this.fleetVal.textContent = `${alive}/${total}`;
    this.clock.textContent = `T+${String(Math.floor(tSec)).padStart(3, '0')}s`;
    this.sub.textContent = this.target(progress);
    this.commIcon.classList.toggle('down', !commOk);
    this.commIcon.textContent = commOk ? '📡' : '📵';
    if (budgetAlarm) this.sub.classList.add('alarm');
  },
};
