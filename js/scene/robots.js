/* ============================================================================
   ROBÔS — desenho vetorial, estados e ciclo de trabalho
   ----------------------------------------------------------------------------
   Estados possíveis (r.mode):
     cycle    — trabalhando (vai, carrega, volta, descarrega)
     held     — parado temporariamente, mas operacional
     stuck    — preso (pode patinar com as rodas)
     sitting  — sentou no chão (bateria)
     circling — perdido, andando em círculos
     dead     — fora de operação
     frozen   — nunca se move: AGV sem trilha não tem o que seguir
   ========================================================================== */

import { svgEl, rp, topY, R_SCALE, laneY } from './geometry.js';
import { Scene } from './core.js';
import { Fx, fxDust, fxIcon, fxKinetic } from './fx.js';
import { state } from '../core/state.js';

const CARGO_ICONS = {
  logistica: ['🧪', '⚙️', '🍱'],
  mineracao: ['🪨'],
  habitat: ['🧱'],
  resgate: ['🛠'],
};

export function cargoIcon() {
  const list = CARGO_ICONS[state.mission.id] || ['⚙️'];
  return list[Math.floor(Math.random() * list.length)];
}

/* --------------------------------------------------------------------------
   Construção do desenho
   -------------------------------------------------------------------------- */

/** Braço articulado: ombro -> segmento 1 -> cotovelo -> segmento 2 -> garra */
function buildArm(parent, ax, ay) {
  const arm = svgEl('g', { class: 'arm', transform: `translate(${ax},${ay})` }, parent);
  const s1 = svgEl('g', { class: 'arm-s1-pivot', transform: 'rotate(-40)' }, arm);
  svgEl('rect', { class: 'arm-segment-1', x: 0, y: -2.2, width: 15, height: 4.4, rx: 2 }, s1);
  const s2 = svgEl('g', { class: 'arm-s2-pivot', transform: 'translate(15,0) rotate(55)' }, s1);
  svgEl('rect', { class: 'arm-segment-2', x: 0, y: -1.9, width: 13, height: 3.8, rx: 1.9 }, s2);
  const grip = svgEl('g', { class: 'gripper', transform: 'translate(13,0)' }, s2);
  svgEl('path', { class: 'finger finger-a', d: 'M0,0 L6,-3.4', transform: 'rotate(0)' }, grip);
  svgEl('path', { class: 'finger finger-b', d: 'M0,0 L6,3.4', transform: 'rotate(0)' }, grip);
  return arm;
}

/** Define a pose do braço. grip: 0 fechado, 1 aberto. */
export function setArm(r, shoulder, elbow, grip) {
  if (!r.armEls) return;
  r.armEls.s1.setAttribute('transform', `rotate(${shoulder})`);
  r.armEls.s2.setAttribute('transform', `translate(15,0) rotate(${elbow})`);
  const a = 10 + grip * 22;
  r.armEls.fa.setAttribute('transform', `rotate(${-a})`);
  r.armEls.fb.setAttribute('transform', `rotate(${a})`);
}

export function buildRobotSvg(r) {
  const g = svgEl('g', { class: 'robot', 'data-robot-id': r.id, 'data-idx': r.idx });
  g.style.setProperty('--rc', r.color);
  const inner = svgEl('g', { class: 'rb-in', transform: `scale(${R_SCALE})` }, g);

  const isAgv = r.kind === 'agv';
  const heavy = r.type === 'agv_reforcado' || r.type === 'amr_offroad';

  if (isAgv) {
    // ---- AGV: caixote baixo sobre 4 rodas, faixa no topo, farol ----
    const wheels = svgEl('g', { class: 'wheels' }, inner);
    [-14, -5, 5, 14].forEach((cx, i) => {
      const cls = i === 0 ? 'wheel wheel-back' : i === 3 ? 'wheel wheel-front' : 'wheel';
      svgEl('circle', { class: cls, cx, cy: -4.5, r: 4.2 }, wheels);
      svgEl('circle', { class: 'wheel-hub', cx, cy: -4.5, r: 1.4 }, wheels);
    });
    svgEl('rect', { class: 'body', x: -18, y: -19, width: 36, height: 14, rx: 2 }, inner);
    svgEl('rect', { class: 'stripe', x: -18, y: -19, width: 36, height: 3, rx: 1 }, inner);
    if (heavy) svgEl('rect', { class: 'body-dark', x: -13, y: -28, width: 26, height: 9, rx: 1.5 }, inner);
    svgEl('circle', { class: 'headlight', cx: 16.5, cy: -12, r: 2 }, inner);
    svgEl('rect', { class: 'batt-shell', x: -12, y: -13.5, width: 16, height: 4.6, rx: 1 }, inner);
    const bf = svgEl('rect', { class: 'batt-fill', x: -11.2, y: -12.8, width: 14.4, height: 3.2, rx: 0.8 }, inner);
    const led = svgEl('circle', { class: 'status-led', cx: -15, cy: -12, r: 2 }, inner);
    r.payloadY = heavy ? -34 : -25;
    r.labelY = heavy ? -38 : -29;
    r.battEl = bf;
    r.ledEl = led;
  } else {
    // ---- AMR: corpo retangular sobre esteira, torre de sensor giratória ----
    const tw = heavy ? 12 : 10;
    svgEl('rect', { class: 'track', x: -19, y: -tw, width: 38, height: tw, rx: tw / 2 }, inner);
    const wheels = svgEl('g', { class: 'wheels' }, inner);
    [-11, 0, 11].forEach((cx) => {
      svgEl('circle', { class: 'wheel', cx, cy: -tw / 2, r: heavy ? 3.8 : 3.2 }, wheels);
      svgEl('circle', { class: 'wheel-hub', cx, cy: -tw / 2, r: 1.2 }, wheels);
    });
    const by = -tw - 16;
    svgEl('rect', { class: heavy ? 'body-dark' : 'body', x: -16, y: by, width: 32, height: 16, rx: 2 }, inner);
    svgEl('rect', { class: 'stripe', x: -16, y: by, width: 32, height: 3, rx: 1 }, inner);
    const turret = svgEl('g', { class: 'sensor-turret', transform: `translate(7,${by})` }, inner);
    svgEl('rect', { class: 'turret-base', x: -5, y: -8, width: 10, height: 8, rx: 1.5 }, turret);
    svgEl('circle', { class: 'eye', cx: 2, cy: -4, r: 2.1 }, turret);
    svgEl('circle', { class: 'headlight', cx: 16, cy: by + 11, r: 1.8 }, inner);
    svgEl('rect', { class: 'batt-shell', x: -13, y: by + 8, width: 16, height: 4.6, rx: 1 }, inner);
    const bf = svgEl('rect', { class: 'batt-fill', x: -12.2, y: by + 8.7, width: 14.4, height: 3.2, rx: 0.8 }, inner);
    const led = svgEl('circle', { class: 'status-led', cx: -12, cy: by + 4, r: 2 }, inner);
    r.turretEl = turret;
    r.turretY = by;
    r.battEl = bf;
    r.ledEl = led;
    r.payloadY = by - 9;
    r.labelY = by - (r.hasArm ? 22 : 10);
  }

  // Braço (módulo): só existe se a equipe comprou
  if (r.hasArm) {
    const ax = -6;
    const ay = isAgv ? -20 : -30;
    const arm = buildArm(inner, ax, ay);
    r.armEls = {
      root: arm,
      s1: arm.querySelector('.arm-s1-pivot'),
      s2: arm.querySelector('.arm-s2-pivot'),
      fa: arm.querySelector('.finger-a'),
      fb: arm.querySelector('.finger-b'),
    };
  }

  // Carga transportada
  const payload = svgEl('g', { class: 'payload', transform: `translate(0,${r.payloadY})` }, inner);
  svgEl('rect', { class: 'body-dark', x: -8, y: -7, width: 16, height: 13, rx: 1.5 }, payload);
  const picon = svgEl('text', { class: 'fx-icon', x: 0, y: 0, 'font-size': 9 }, payload);
  picon.textContent = '⚙️';
  r.payloadEl = payload;
  r.payloadIcon = picon;

  const label = svgEl('text', { class: 'label', x: 0, y: r.labelY }, inner);
  label.textContent = r.id.toUpperCase();

  r.el = g;
  r.inner = inner;
  return g;
}

/* --------------------------------------------------------------------------
   Estados
   -------------------------------------------------------------------------- */

export function setRobotState(r, mode, params = {}) {
  r.mode = mode;
  const el = r.el;
  el.classList.remove('moving', 'spin-free', 'shaking', 'is-warn', 'is-dead', 'is-frozen');

  switch (mode) {
    case 'dead':
      el.classList.add('is-dead');
      setCarrying(r, false);
      if (params.vanish) {
        Scene.scheduleAt(Scene.t + 700, () => el.classList.add('vanished'));
        if (Scene.instant) el.classList.add('vanished');
      }
      break;

    case 'frozen':
      // Sem trilha para seguir: o robô nem tenta sair do lugar.
      el.classList.add('is-frozen');
      setCarrying(r, false);
      r.sink = 0;
      r.detour = 0;
      break;

    case 'stuck':
      el.classList.add('is-warn');
      if (params.spin) el.classList.add('spin-free');
      r.sink = params.sink || 0;
      break;

    case 'sitting':
      el.classList.add('is-warn');
      r.sink = 5;
      break;

    case 'circling':
      el.classList.add('moving', 'is-warn');
      r.circleT = 0;
      r.circleCx = r.x;
      r.circleCy = r.y;
      break;

    case 'held':
      el.classList.add('is-warn');
      break;

    default:
      break;
  }
}

export function robotShake(r, ms = 900) {
  if (Scene.instant) return;
  r.el.classList.add('shaking');
  Scene.scheduleAt(Scene.t + ms, () => r.el.classList.remove('shaking'));
}

export function robotWarn(r, ms = 1000) {
  if (Scene.instant) return;
  r.el.classList.add('is-warn');
  Scene.scheduleAt(Scene.t + ms, () => {
    if (r.mode === 'cycle') r.el.classList.remove('is-warn');
  });
}

export function setBattery(r, v) {
  r.battery = Math.max(0, Math.min(1, v));
  if (!r.battEl) return;
  r.battEl.setAttribute('transform', `scale(${r.battery},1)`);
  r.battEl.setAttribute('fill', r.battery > 0.5 ? '#3ddc84' : r.battery > 0.22 ? '#ffb547' : '#ff5370');
}

export function setCarrying(r, on, icon) {
  r.carrying = on;
  r.el.classList.toggle('carrying', !!on);
  if (on && icon && r.payloadIcon) r.payloadIcon.textContent = icon;
}

export function applyRobotTransform(r) {
  r.el.setAttribute('transform', `translate(${r.x.toFixed(1)},${(r.y + (r.sink || 0)).toFixed(1)})`);
}

/* --------------------------------------------------------------------------
   Animações de carga/descarga
   -------------------------------------------------------------------------- */

export function playLoadAnim(r) {
  if (Scene.instant) return;
  const mid = state.mission.id;
  if (r.hasArm) {
    setArm(r, -14, 24, 1);
    Scene.scheduleAt(Scene.t + 320, () => setArm(r, -16, 28, 0));
    Scene.scheduleAt(Scene.t + 640, () => setArm(r, -55, 50, 0));
  }
  if (mid === 'mineracao') {
    fxDust(rp(r, 16, -2).x, r.y - 2, 8);
    fxIcon(rp(r, 16, 0).x, topY(r, -10), '🪨', { size: 13, life: 800 });
  } else if (mid === 'resgate') {
    fxIcon(rp(r, 12, 0).x, topY(r, -8), '🔗', { size: 13, life: 800 });
  } else {
    const k = rp(r, 20, -20);
    fxKinetic(k.x, k.y);
  }
}

export function playUnloadAnim(r) {
  if (Scene.instant) return;
  const mid = state.mission.id;
  if (r.hasArm) {
    setArm(r, -16, 26, 0);
    Scene.scheduleAt(Scene.t + 300, () => setArm(r, -18, 30, 1));
    Scene.scheduleAt(Scene.t + 620, () => setArm(r, -45, 60, 0.4));
  }
  fxIcon(r.x, topY(r), '✅', { size: 14, life: 900 });
  if (mid === 'mineracao') fxDust(r.x, r.y - 2, 5);
}

/* --------------------------------------------------------------------------
   Movimento
   -------------------------------------------------------------------------- */

/** Modos em que o robô não se desloca de jeito nenhum. */
const STATIC_MODES = ['dead', 'frozen', 'stuck', 'sitting', 'held'];

export function updateRobot(r, dt) {
  const el = r.el;

  if (STATIC_MODES.includes(r.mode)) {
    el.classList.remove('moving');
    applyRobotTransform(r);
    return;
  }

  if (r.mode === 'circling') {
    r.circleT += dt / 1000;
    const rad = 22;
    r.x = r.circleCx + Math.cos(r.circleT * 2.6) * rad;
    r.y = r.circleCy + Math.sin(r.circleT * 2.6) * rad * 0.45;
    applyRobotTransform(r);
    return;
  }

  // ---- ciclo normal de trabalho ----
  if (r.waitFor > 0) {
    r.waitFor -= dt;
    el.classList.remove('moving');
    applyRobotTransform(r);
    return;
  }

  const speed = 0.115 * r.speedMul;   // px por ms
  const arrive = (target) => {
    const d = target - r.x;
    const step = speed * dt;
    if (Math.abs(d) <= step) { r.x = target; return true; }
    r.x += Math.sign(d) * step;
    return false;
  };

  switch (r.state) {
    case 'toLoad':
      el.classList.add('moving');
      // desvio temporário (rota ineficiente / rota cega)
      r.y = r.lane + (r.detour ? Math.sin(r.x / 26) * r.detour : 0);
      if (r.hasArm) setArm(r, -45, 60, 0.4);
      if (arrive(r.loadX)) {
        el.classList.remove('moving');
        r.state = 'loading';
        r.waitFor = 900;
        playLoadAnim(r);
      }
      break;

    case 'loading':
      setCarrying(r, true, cargoIcon());
      r.state = 'toUnload';
      break;

    case 'toUnload':
      el.classList.add('moving');
      r.y = r.lane + (r.detour ? Math.sin(r.x / 26) * r.detour : 0);
      if (r.hasArm) setArm(r, -62, 44, 0);
      if (arrive(r.unloadX)) {
        el.classList.remove('moving');
        r.state = 'unloading';
        r.waitFor = 800;
        playUnloadAnim(r);
      }
      break;

    case 'unloading':
      setCarrying(r, false);
      r.state = 'toLoad';
      break;

    default:
      r.state = 'toLoad';
      break;
  }

  // consumo lento de bateria durante a operação
  if (r.battery > 0.35) setBattery(r, r.battery - dt / 95000);
  applyRobotTransform(r);
}

/**
 * Volta um robô ao estado inicial da cena. Usado no setup e em cada seek.
 * Robôs estruturalmente imóveis (AGV sem trilho) nascem travados: não dão
 * um passo durante a cena inteira.
 */
export function resetRobot(r, i, pts, total) {
  r.el.classList.remove('is-dead', 'is-warn', 'is-frozen', 'moving', 'spin-free', 'shaking', 'vanished', 'carrying');
  r.mode = 'cycle';
  r.state = pts.startState;
  r.waitFor = i * 260;
  r.lane = laneY(i, total);
  r.x = pts.startX + (i % 3) * 10;
  r.y = r.lane;
  r.sink = 0;
  r.detour = 0;
  r.carrying = false;
  r.speedMul = 0.9 + ((i * 37) % 30) / 100;
  setBattery(r, 1);
  if (r.hasArm) setArm(r, -45, 60, 1);
  if (r.payloadEl) r.payloadEl.setAttribute('transform', `translate(0,${r.payloadY})`);
  if (r.turretEl) r.turretEl.setAttribute('transform', `translate(7,${r.turretY})`);
  if (r.immobile) setRobotState(r, 'frozen');
  applyRobotTransform(r);
}

