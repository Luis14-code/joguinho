/* ============================================================================
   TERRENO — um construtor por missão
   ----------------------------------------------------------------------------
   Detalhe didático: os trilhos do corredor só são desenhados se a equipe
   comprou as guias físicas. Sem eles, dá para ver na cena que os AGVs não
   tinham o que seguir.
   ========================================================================== */

import { svgEl, SC, laneY, HAB_SLOTS } from './geometry.js';
import { state, countRobots } from '../core/state.js';

export function buildTerrain(missionId, layer) {
  layer.innerHTML = '';
  svgEl('rect', { class: 'sky', x: 0, y: 0, width: SC.W, height: SC.horizon }, layer);
  svgEl('rect', { class: 'ground-far', x: 0, y: SC.horizon, width: SC.W, height: 40 }, layer);
  svgEl('rect', { class: 'ground', x: 0, y: SC.horizon + 40, width: SC.W, height: SC.H - SC.horizon - 40 }, layer);

  const builders = {
    logistica: buildTerrainLog,
    mineracao: buildTerrainMin,
    habitat: buildTerrainHab,
    resgate: buildTerrainSar,
  };
  (builders[missionId] || buildTerrainLog)(layer);
}

/** Base genérica à esquerda. */
function buildBase(layer, label) {
  const g = svgEl('g', { class: 'base-group' }, layer);
  svgEl('rect', { class: 'struct', x: 24, y: 300, width: 96, height: 150, rx: 3 }, g);
  svgEl('rect', { class: 'struct-lit', x: 40, y: 332, width: 28, height: 36, rx: 2 }, g);
  svgEl('rect', { class: 'struct-lit', x: 76, y: 332, width: 28, height: 36, rx: 2 }, g);
  svgEl('rect', { class: 'struct', x: 56, y: 396, width: 32, height: 54, rx: 2 }, g);
  svgEl('line', { class: 'rail', x1: 72, y1: 300, x2: 72, y2: 262, 'stroke-dasharray': 'none' }, g);
  svgEl('circle', { class: 'headlight', cx: 72, cy: 258, r: 3 }, g);
  const t = svgEl('text', { class: 'label-txt', x: 72, y: 470, fill: '#00d4ff' }, g);
  t.textContent = label;
  return g;
}

function buildTerrainLog(layer) {
  // corredor pressurizado: faixa escura com teto marcado
  svgEl('rect', { class: 'corridor', x: 130, y: 330, width: 640, height: 168, rx: 4 }, layer);
  for (let x = 150; x < 770; x += 56) {
    svgEl('line', { class: 'grid-line', x1: x, y1: 330, x2: x, y2: 498 }, layer);
  }
  buildBase(layer, 'BASE ALFA');

  if (state.cart.infra.has('guias')) {
    const rails = svgEl('g', { class: 'rails-group' }, layer);
    const n = Math.min(countRobots(), SC.maxRobots);
    for (let i = 0; i < Math.max(n, 2); i++) {
      svgEl('line', { class: 'rail', x1: 140, y1: laneY(i, n) + 2, x2: 775, y2: laneY(i, n) + 2 }, rails);
    }
  }

  // Galpão Beta com prateleiras e caixas
  const g = svgEl('g', {}, layer);
  svgEl('rect', { class: 'struct', x: 782, y: 300, width: 94, height: 150, rx: 3 }, g);
  const icons = ['🧪', '⚙️', '🍱'];
  for (let row = 0; row < 3; row++) {
    const y = 318 + row * 40;
    svgEl('rect', { class: 'shelf', x: 792, y, width: 74, height: 32, rx: 2 }, g);
    for (let c = 0; c < 2; c++) {
      const t = svgEl('text', { class: 'fx-icon', x: 811 + c * 36, y: y + 17, 'font-size': 13 }, g);
      t.textContent = icons[(row + c) % 3];
    }
  }
  const t = svgEl('text', { class: 'label-txt', x: 829, y: 470, fill: '#ff6b35' }, g);
  t.textContent = 'GALPÃO BETA';
}

function buildTerrainMin(layer) {
  const rocks = [[210, 350, 26], [330, 470, 18], [470, 338, 22], [560, 486, 15], [640, 360, 20], [300, 400, 13]];
  rocks.forEach(([cx, cy, rr]) => {
    svgEl('path', {
      class: 'rock',
      d: `M${cx - rr},${cy} q${rr * 0.3},${-rr * 0.9} ${rr},${-rr * 0.75} q${rr * 0.8},${rr * 0.1} ${rr},${rr * 0.75} z`,
    }, layer);
  });
  for (let x = 150; x < 880; x += 26) {
    svgEl('line', { class: 'hatch', x1: x, y1: 318, x2: x + 14, y2: 342 }, layer);
  }
  buildBase(layer, 'BASE ALFA');

  const g = svgEl('g', {}, layer);
  svgEl('ellipse', { class: 'pit', cx: 790, cy: 430, rx: 86, ry: 40 }, g);
  svgEl('ellipse', { cx: 790, cy: 436, rx: 62, ry: 26, fill: '#3b2a20' }, g);
  svgEl('path', { d: 'M752,444 q22,-24 44,-6 q18,-16 30,8 z', fill: '#5c4535' }, g);
  const t = svgEl('text', { class: 'label-txt', x: 790, y: 486, fill: '#ff6b35' }, g);
  t.textContent = 'CÂNION OESTE';
}

function buildTerrainHab(layer) {
  for (let x = 140; x < 880; x += 30) svgEl('line', { class: 'grid-line', x1: x, y1: 340, x2: x, y2: 500 }, layer);
  for (let y = 346; y < 500; y += 30) svgEl('line', { class: 'grid-line', x1: 140, y1: y, x2: 876, y2: y }, layer);

  buildBase(layer, 'GALPÃO');
  const stack = svgEl('g', { class: 'module-stack' }, layer);
  for (let i = 0; i < 3; i++) {
    svgEl('rect', { class: 'shelf', x: 138, y: 416 - i * 16, width: 40, height: 13, rx: 1.5 }, stack);
  }

  const g = svgEl('g', { class: 'slots-group' }, layer);
  HAB_SLOTS.forEach((s) => {
    svgEl('rect', { class: 'slot', 'data-slot': s.id, x: s.x, y: s.y, width: s.w, height: s.h, rx: 2 }, g);
  });
  const t = svgEl('text', { class: 'label-txt', x: 755, y: 486, fill: '#ff6b35' }, g);
  t.textContent = 'HABITAT H-7';
}

function buildTerrainSar(layer) {
  svgEl('rect', { x: 0, y: 0, width: SC.W, height: SC.H, fill: '#0c0806', opacity: 0.55 }, layer);
  svgEl('ellipse', { class: 'fog', cx: 400, cy: 360, rx: 300, ry: 60 }, layer);
  svgEl('ellipse', { class: 'fog f2', cx: 620, cy: 430, rx: 260, ry: 52 }, layer);
  svgEl('ellipse', { cx: 760, cy: 440, rx: 110, ry: 44, fill: 'none', stroke: '#4a2e23', 'stroke-width': 1.5 }, layer);
  buildBase(layer, 'BASE ALFA');

  // rover Endurance tombado
  const g = svgEl('g', { class: 'rover-group', transform: 'translate(772,424) rotate(24)' }, layer);
  svgEl('rect', { class: 'struct', x: -32, y: -20, width: 64, height: 22, rx: 3 }, g);
  svgEl('rect', { class: 'struct-lit', x: -22, y: -16, width: 18, height: 13, rx: 2 }, g);
  svgEl('circle', { class: 'wheel', cx: -20, cy: 4, r: 7 }, g);
  svgEl('circle', { class: 'wheel', cx: 18, cy: 4, r: 7 }, g);
  svgEl('line', { x1: 24, y1: -20, x2: 38, y2: -38, stroke: '#7f8fa0', 'stroke-width': 1.5 }, g);
  svgEl('line', { x1: 38, y1: -38, x2: 31, y2: -44, stroke: '#ff5370', 'stroke-width': 1.5 }, g);
  const t = svgEl('text', { class: 'label-txt', x: 772, y: 486, fill: '#ff5370' }, layer);
  t.textContent = 'ENDURANCE';
}
