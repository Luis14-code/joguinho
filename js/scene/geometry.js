/* ============================================================================
   GEOMETRIA DA CENA
   ----------------------------------------------------------------------------
   Constantes do palco (viewBox 900x520) e helpers de posicionamento.
   ========================================================================== */

export const SVGNS = 'http://www.w3.org/2000/svg';

export const SC = {
  W: 900,
  H: 520,
  horizon: 300,
  baseX: 120,        // lado da base (descanso/descarga)
  actionX: 735,      // lado onde a ação acontece
  laneTop: 360,
  laneBottom: 495,
  maxRobots: 8,      // além disso a cena agrupa (o HUD mostra o total real)
};

/** Escala do desenho dos robôs. Efeitos ancorados no corpo passam por rp()/topY(). */
export const R_SCALE = 1.4;

export const ROBOT_COLORS = ['#00d4ff', '#3ddc84', '#ff9f45'];

/** Posição dos 5 slots do habitat (ordem de montagem). */
export const HAB_SLOTS = [
  { id: 'base', x: 690, y: 452, w: 130, h: 16 },
  { id: 'piso', x: 690, y: 432, w: 130, h: 16 },
  { id: 'lat-esq', x: 690, y: 372, w: 26, h: 56 },
  { id: 'lat-dir', x: 794, y: 372, w: 26, h: 56 },
  { id: 'teto', x: 690, y: 352, w: 130, h: 16 },
];

export function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}

/** Faixa (lane) horizontal do i-ésimo robô de uma frota de n. */
export function laneY(i, n) {
  const k = Math.min(n, SC.maxRobots);
  if (k <= 1) return (SC.laneTop + SC.laneBottom) / 2;
  return SC.laneTop + (i % k) * ((SC.laneBottom - SC.laneTop) / (k - 1));
}

/** Converte um deslocamento local do robô em ponto do mundo. */
export function rp(r, dx, dy) {
  return { x: r.x + dx * R_SCALE, y: r.y + dy * R_SCALE };
}

/** Altura logo acima do robô, onde nascem os ícones flutuantes. */
export function topY(r, extra = 0) {
  return r.y - (r.kind === 'agv' ? 30 : 44) * R_SCALE - extra;
}

/** Ponto no mundo onde está a "mão" do robô (para FX de braço). */
export function handPoint(r) {
  return rp(r, r.hasArm ? 20 : 16, r.kind === 'agv' ? -22 : -32);
}

/**
 * Pontos de carga/descarga por missão.
 * HAB carrega do galpão (esquerda) para a plataforma (direita);
 * as demais vão buscar à direita e descarregam na base (esquerda).
 */
export function missionPoints(id) {
  if (id === 'habitat') {
    return { loadX: 176, unloadX: SC.actionX, startX: 200, startState: 'toLoad' };
  }
  return { loadX: SC.actionX, unloadX: SC.baseX + 40, startX: SC.baseX + 36, startState: 'toLoad' };
}
