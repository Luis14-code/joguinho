/* ============================================================================
   CAMADA DE EFEITOS — partículas movidas pelo relógio virtual
   ----------------------------------------------------------------------------
   Nada aqui usa setTimeout nem animação CSS: cada partícula recebe o progresso
   normalizado (0..1) calculado a partir de Scene.t, então pausa, velocidade e
   retrocesso funcionam de graça.
   ========================================================================== */

import { svgEl } from './geometry.js';
import { Scene } from './core.js';

export const Fx = {
  layer: null,
  items: [],

  reset() {
    if (this.layer) this.layer.innerHTML = '';
    this.items.length = 0;
  },

  add(node, life, update) {
    this.items.push({ node, born: Scene.t, life, update });
    return node;
  },

  update(t) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      const p = (t - f.born) / f.life;
      // p < 0 acontece ao retroceder a linha do tempo: ainda nem nasceu
      if (p >= 1 || p < 0) { f.node.remove(); this.items.splice(i, 1); continue; }
      f.update(p, f.node);
    }
  },
};

export function fxSparks(x, y, n = 9) {
  if (Scene.instant) return;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 10 + Math.random() * 20;
    const node = svgEl('line', {
      class: 'spark', x1: x, y1: y,
      x2: x + Math.cos(a) * 5, y2: y + Math.sin(a) * 5,
    }, Fx.layer);
    Fx.add(node, 420 + Math.random() * 220, (p, el) => {
      el.setAttribute('transform', `translate(${Math.cos(a) * d * p},${Math.sin(a) * d * p + p * p * 10})`);
      el.setAttribute('opacity', 1 - p);
    });
  }
}

export function fxDust(x, y, n = 7) {
  if (Scene.instant) return;
  for (let i = 0; i < n; i++) {
    const dx = (Math.random() - 0.5) * 30;
    const r = 3 + Math.random() * 5;
    const node = svgEl('circle', { class: 'dust', cx: x, cy: y, r }, Fx.layer);
    Fx.add(node, 700 + Math.random() * 400, (p, el) => {
      el.setAttribute('transform', `translate(${dx * p},${-16 * p}) scale(${1 + p * 1.4})`);
      el.setAttribute('opacity', 0.5 * (1 - p));
    });
  }
}

export function fxIcon(x, y, char, opts = {}) {
  if (Scene.instant) return null;
  const node = svgEl('text', { class: 'fx-icon', x, y, 'font-size': opts.size || 16 }, Fx.layer);
  node.textContent = char;
  const rise = opts.rise === undefined ? 26 : opts.rise;
  return Fx.add(node, opts.life || 1300, (p, el) => {
    el.setAttribute('transform', `translate(0,${-rise * p}) scale(${1 + 0.25 * Math.sin(p * Math.PI)})`);
    el.setAttribute('opacity', p < 0.75 ? 1 : (1 - p) * 4);
  });
}

/** "?" em sequência sobre um robô perdido. */
export function fxQuestions(x, y) {
  if (Scene.instant) return;
  for (let i = 0; i < 3; i++) {
    Scene.scheduleAt(Scene.t + i * 320, () => {
      const node = svgEl('text', { class: 'fx-q', x: x + (i - 1) * 13, y }, Fx.layer);
      node.textContent = '?';
      Fx.add(node, 1100, (p, el) => {
        el.setAttribute('transform', `translate(0,${-22 * p})`);
        el.setAttribute('opacity', p < 0.6 ? 1 : (1 - p) * 2.5);
      });
    });
  }
}

export function fxRing(x, y, color = '#ff5370', maxR = 34) {
  if (Scene.instant) return;
  const node = svgEl('circle', { class: 'ring', cx: x, cy: y, r: 3, stroke: color }, Fx.layer);
  Fx.add(node, 620, (p, el) => {
    el.setAttribute('r', 3 + maxR * p);
    el.setAttribute('opacity', 1 - p);
  });
}

export function fxKinetic(x, y) {
  if (Scene.instant) return;
  for (let i = 0; i < 3; i++) {
    const node = svgEl('line', {
      class: 'kinetic', x1: x, y1: y + (i - 1) * 5, x2: x + 14, y2: y + (i - 1) * 5,
    }, Fx.layer);
    Fx.add(node, 420, (p, el) => {
      el.setAttribute('transform', `translate(${-26 * p},0)`);
      el.setAttribute('opacity', 0.65 * (1 - p));
    });
  }
}

export function fxCoins(x, y, n = 6) {
  if (Scene.instant) return;
  for (let i = 0; i < n; i++) {
    const dx = (Math.random() - 0.5) * 46;
    const node = svgEl('text', { class: 'fx-coin', x, y }, Fx.layer);
    node.textContent = '$';
    Fx.add(node, 950 + Math.random() * 300, (p, el) => {
      el.setAttribute('transform', `translate(${dx * p},${-46 * p})`);
      el.setAttribute('opacity', 1 - p);
    });
  }
}

/** Caixa/módulo caindo torto no chão. */
export function fxFallingCrate(x, y, color = '#5c4535') {
  if (Scene.instant) return;
  const node = svgEl('rect', {
    x: x - 8, y: y - 7, width: 16, height: 13, rx: 1.5, fill: color, stroke: '#2a1a12',
  }, Fx.layer);
  Fx.add(node, 900, (p, el) => {
    const fall = 34 * p * p;
    el.setAttribute('transform', `translate(${10 * p},${fall}) rotate(${46 * p},${x},${y})`);
    el.setAttribute('opacity', p < 0.7 ? 1 : (1 - p) * 3.3);
  });
}

/** Linha de comunicação que se parte no meio. */
export function fxCommBreak(x1, y1, x2, y2) {
  if (Scene.instant) return;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - 18;
  const a = svgEl('path', { class: 'commline', d: `M${x1},${y1} Q${mx},${my} ${x2},${y2}` }, Fx.layer);
  Fx.add(a, 760, (p, el) => {
    el.setAttribute('opacity', p < 0.45 ? 1 : (p < 0.6 ? 0.2 : 0.8 * (1 - p)));
    el.setAttribute('stroke', p > 0.45 ? '#ff5370' : '#00d4ff');
  });
  Scene.scheduleAt(Scene.t + 340, () => {
    fxSparks(mx, my + 8, 6);
    fxIcon(mx, my - 6, '📡', { size: 17 });
  });
}

/** Cabo de reboque entre robô e rover. */
export function fxCable(x1, y1, x2, y2, life, broken) {
  if (Scene.instant) return null;
  const node = svgEl('path', {
    class: 'cable',
    d: `M${x1},${y1} Q${(x1 + x2) / 2},${(y1 + y2) / 2 + 16} ${x2},${y2}`,
  }, Fx.layer);
  return Fx.add(node, life, (p, el) => {
    if (broken && p > 0.5) {
      el.setAttribute('d', `M${x1},${y1} Q${(x1 + x2) / 2 - 20},${(y1 + y2) / 2 + 26} ${(x1 + x2) / 2 - 6},${(y1 + y2) / 2 + 22}`);
      el.setAttribute('stroke', '#8a7055');
    }
    el.setAttribute('opacity', p > 0.85 ? (1 - p) * 6.6 : 1);
  });
}
