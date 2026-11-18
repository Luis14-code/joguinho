/* ============================================================================
   ORQUESTRAÇÃO DA CENA
   ----------------------------------------------------------------------------
   Monta o palco, agenda os eventos da simulação na linha do tempo da animação,
   roda o loop principal e implementa o player (pausa, velocidade, seek,
   replay, pular).
   ========================================================================== */

import { SC, svgEl, laneY, ROBOT_COLORS, HAB_SLOTS, missionPoints } from './geometry.js';
import { Scene } from './core.js';
import { Fx } from './fx.js';
import { buildTerrain } from './terrain.js';
import { Hud } from './hud.js';
import { INCIDENT, pickRobots } from './incidents.js';
import { buildRobotSvg, updateRobot, resetRobot } from './robots.js';
import { CATALOG_INDEX } from '../data/catalog.js';
import { state } from '../core/state.js';
import { addEventToLog, clearEventLog } from '../ui/eventlog.js';

let onFinishCallback = null;

/* --------------------------------------------------------------------------
   Montagem
   -------------------------------------------------------------------------- */

function buildOverlay(layer) {
  layer.innerHTML = '';
  Scene.redwash = svgEl('rect', { class: 'redwash', x: 0, y: 0, width: SC.W, height: SC.H }, layer);
  Scene.scanlines = svgEl('rect', { class: 'scanlines', x: 0, y: 0, width: SC.W, height: SC.H }, layer);
  const badge = svgEl('g', { class: 'offline-badge' }, layer);
  svgEl('rect', {
    x: 358, y: 212, width: 184, height: 60, rx: 5,
    fill: 'rgba(10,6,4,0.88)', stroke: '#ff5370', 'stroke-width': 1.5,
  }, badge);
  const i1 = svgEl('text', { class: 'hud-comm', x: 450, y: 238, 'font-size': 20 }, badge);
  i1.textContent = '📡';
  const i2 = svgEl('text', {
    x: 450, y: 262, fill: '#ff5370', 'font-family': 'monospace', 'font-size': 13,
    'text-anchor': 'middle', 'letter-spacing': '0.2em',
  }, badge);
  i2.textContent = 'OFFLINE';
  Scene.offlineBadge = badge;
}

/** Curva de progresso: sobe nas janelas de trabalho, trava nos incidentes. */
function buildProgressCurve(incidentTimes, finalP, duration) {
  const step = 100;
  const n = Math.ceil(duration / step) + 1;
  const stalled = (t) => incidentTimes.some((it) => t >= it && t < it + 1700);
  let work = 0;
  const flags = new Array(n);
  for (let i = 0; i < n; i++) {
    const s = stalled(i * step);
    flags[i] = s;
    if (!s) work += step;
  }
  const curve = new Float32Array(n);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (!flags[i]) acc += step;
    curve[i] = work ? finalP * (acc / work) : finalP;
  }
  return { curve, step, n };
}

function progressAt(t) {
  const c = Scene.progressCurve;
  const i = Math.max(0, Math.min(c.n - 1, Math.floor(t / c.step)));
  return c.curve[i];
}

function sceneSetup() {
  const m = state.mission;
  const res = state.simResult;

  Scene.svg = document.getElementById('scene-svg');
  Fx.layer = document.getElementById('fx-layer');

  buildTerrain(m.id, document.getElementById('terrain-layer'));
  Hud.build(document.getElementById('hud-layer'), m);
  buildOverlay(document.getElementById('overlay-layer'));

  // --- robôs ---
  const layer = document.getElementById('robot-layer');
  layer.innerHTML = '';
  Scene.robots = [];
  const shown = Math.min(res.fleet.length, SC.maxRobots);
  const pts = missionPoints(m.id);

  for (let i = 0; i < shown; i++) {
    const f = res.fleet[i];
    const item = CATALOG_INDEX[f.type];
    const r = {
      idx: i,
      id: `r${i}`,
      type: f.type,
      kind: f.kind || item.kind,
      hasArm: res.hasArm,
      immobile: !!f.immobile,
      color: ROBOT_COLORS[i % ROBOT_COLORS.length],
      lane: laneY(i, shown),
      battery: 1,
      carrying: false,
      mode: 'cycle',
      state: pts.startState,
      waitFor: 0,
      speedMul: 1,
      sink: 0,
      detour: 0,
      circleT: 0,
      loadX: pts.loadX,
      unloadX: pts.unloadX,
    };
    buildRobotSvg(r);
    layer.appendChild(r.el);
    resetRobot(r, i, pts, shown);
    Scene.robots.push(r);
  }

  // --- agenda de eventos: mapeia event.t para a duração da animação ---
  const evs = res.events;
  const tMax = Math.max(1, ...evs.map((e) => e.t));
  Scene.tMax = tMax;
  const playable = Scene.duration - 2600;    // reserva uma cauda para o fecho
  Scene.schedule = evs
    .map((e) => ({ at: Math.min(playable, (e.t / tMax) * playable), evt: e }))
    .sort((a, b) => a.at - b.at);

  const incidentTimes = Scene.schedule.filter((s) => s.evt.type === 'bad').map((s) => s.at);
  Scene.progressCurve = buildProgressCurve(incidentTimes, res.progress, Scene.duration);

  // perdas acumuladas por instante, para o contador de frota do HUD
  Scene.lossAt = Scene.schedule
    .filter((s) => s.evt.lose && s.evt.lose.length)
    .map((s) => ({ at: s.at, n: s.evt.lose.length }));
}

/* --------------------------------------------------------------------------
   Disparo sincronizado: log + encenação
   -------------------------------------------------------------------------- */

function fireEvent(entry) {
  const evt = entry.evt;
  addEventToLog(evt);

  const vis = evt.visual || {};
  const handler = INCIDENT[vis.kind];
  if (handler) {
    const rs = pickRobots(vis);
    try {
      handler(rs, evt);
    } catch (e) {
      // uma cena com erro não derruba a simulação
      console.warn('[cena] falha ao encenar', vis.kind, e);
    }
  }
  if (evt.type === 'bad') Scene.lastIncidentAt = entry.at;
}

/* --------------------------------------------------------------------------
   Loop principal
   -------------------------------------------------------------------------- */

function updateSceneHud() {
  const res = state.simResult;
  const p = progressAt(Scene.t);
  const lost = Scene.lossAt.reduce((a, l) => a + (l.at <= Scene.t ? l.n : 0), 0);
  const alive = Math.max(0, res.totalRobots - lost);
  const tSec = (Scene.t / (Scene.duration - 2600)) * Scene.tMax * 10;
  Hud.update(p, alive, res.totalRobots, Math.min(tSec, Scene.tMax * 10), Scene.commOk, Scene.budgetAlarm);

  // HAB: slots vão sendo preenchidos conforme o objetivo avança
  if (state.mission.id === 'habitat') {
    const filled = Scene.slotsWrong ? 0 : Math.round((p / 100) * HAB_SLOTS.length);
    document.querySelectorAll('#terrain-layer .slot').forEach((el, i) => {
      el.classList.toggle('filled', i < filled);
    });
  }
}

/**
 * Avança o relógio virtual em dt ms de animação e atualiza tudo que depende
 * dele. Separado do rAF para poder ser chamado passo a passo em testes.
 */
export function stepScene(dt) {
  Scene.t = Math.min(Scene.duration, Scene.t + dt);

  while (Scene.cursor < Scene.schedule.length && Scene.schedule[Scene.cursor].at <= Scene.t) {
    fireEvent(Scene.schedule[Scene.cursor]);
    Scene.cursor++;
  }
  for (const tm of Scene.timers) {
    if (!tm.done && tm.at <= Scene.t) {
      tm.done = true;
      try { tm.fn(); } catch (e) { /* uma encenação quebrada não para a cena */ }
    }
  }
  Scene.robots.forEach((r) => updateRobot(r, dt));
  Fx.update(Scene.t);
  updateSceneHud();
  updateSeekUi();

  if (Scene.t >= Scene.duration && !Scene.finished) {
    Scene.finished = true;
    // o guard em Scene.finished evita encerrar se o usuário retroceder a cena
    setTimeout(() => { if (!Scene.stopped && Scene.finished) finishScene(); }, 900);
  }
}

function sceneTick(now) {
  if (Scene.stopped) return;
  const dtReal = Math.min(64, now - (Scene.lastFrame || now));
  Scene.lastFrame = now;
  if (!Scene.paused) stepScene(dtReal * Scene.speed);
  Scene.raf = requestAnimationFrame(sceneTick);
}

export function stopScene() {
  Scene.stopped = true;
  if (Scene.raf) cancelAnimationFrame(Scene.raf);
  Scene.raf = null;
}

function finishScene() {
  stopScene();
  if (onFinishCallback) onFinishCallback();
}

/* --------------------------------------------------------------------------
   Seek / reset — reconstrói a cena em um instante qualquer
   -------------------------------------------------------------------------- */

export function seekTo(target) {
  target = Math.max(0, Math.min(Scene.duration, target));

  Scene.instant = true;
  Scene.t = 0;
  Scene.cursor = 0;
  Scene.clearTimers();
  Fx.reset();
  Scene.commOk = true;
  Scene.budgetAlarm = false;
  Scene.slotsWrong = false;
  Scene.svg.classList.remove('commloss');
  Scene.scanlines.classList.remove('on');
  Scene.offlineBadge.classList.remove('on');
  Scene.redwash.classList.remove('on');
  Hud.sub.classList.remove('alarm');
  document.querySelectorAll('#terrain-layer .struct, #terrain-layer .struct-lit')
    .forEach((e) => e.classList.remove('offline'));
  clearEventLog();

  // robôs voltam ao estado inicial (imóveis seguem imóveis)
  const pts = missionPoints(state.mission.id);
  Scene.robots.forEach((r, i) => {
    r.immobile = !!state.simResult.fleet[i].immobile;
    resetRobot(r, i, pts, Scene.robots.length);
  });

  // reaplica eventos até o instante alvo (apenas estados finais)
  while (Scene.cursor < Scene.schedule.length && Scene.schedule[Scene.cursor].at <= target) {
    fireEvent(Scene.schedule[Scene.cursor]);
    Scene.cursor++;
  }

  Scene.instant = false;
  Scene.t = target;
  Scene.finished = false;
  updateSceneHud();
  updateSeekUi();
}

/* --------------------------------------------------------------------------
   Player
   -------------------------------------------------------------------------- */

function updateSeekUi() {
  const seek = document.getElementById('pb-seek');
  if (seek && !seek.dragging) seek.value = Math.round((Scene.t / Scene.duration) * 1000);
  const tEl = document.getElementById('pb-time');
  if (tEl) {
    const tSec = Math.min((Scene.t / (Scene.duration - 2600)) * Scene.tMax * 10, Scene.tMax * 10);
    tEl.textContent = `T+${String(Math.floor(tSec)).padStart(3, '0')}s`;
  }
}

function setScenePaused(p) {
  Scene.paused = p;
  Scene.svg.classList.toggle('paused', p);
  const btn = document.getElementById('pb-play');
  if (btn) btn.textContent = p ? '▶' : '⏸';
}

function setSceneSpeed(s) {
  Scene.speed = s;
  Scene.svg.style.setProperty('--spd', s);
  const btn = document.getElementById('pb-speed');
  if (btn) {
    btn.textContent = `${s}×`;
    btn.classList.toggle('active', s !== 1);
  }
}

function bindPlayerControls() {
  if (Scene.controlsBound) return;
  Scene.controlsBound = true;

  document.getElementById('pb-play').addEventListener('click', () => setScenePaused(!Scene.paused));

  document.getElementById('pb-speed').addEventListener('click', () => {
    setSceneSpeed({ 1: 2, 2: 4, 4: 1 }[Scene.speed] || 1);
  });

  // Pular: o debrief mostra exatamente o mesmo resultado já calculado
  document.getElementById('pb-skip').addEventListener('click', () => {
    while (Scene.cursor < Scene.schedule.length) {
      addEventToLog(Scene.schedule[Scene.cursor].evt);
      Scene.cursor++;
    }
    finishScene();
  });

  // Replay: volta 2,5 s antes do último incidente
  document.getElementById('pb-replay').addEventListener('click', () => {
    seekTo(Math.max(0, (Scene.lastIncidentAt || Scene.t) - 2500));
    setScenePaused(false);
  });

  const seek = document.getElementById('pb-seek');
  seek.addEventListener('pointerdown', () => { seek.dragging = true; });
  seek.addEventListener('pointerup', () => { seek.dragging = false; });
  seek.addEventListener('input', () => {
    seek.dragging = true;
    seekTo((seek.value / 1000) * Scene.duration);
  });
  seek.addEventListener('change', () => { seek.dragging = false; });
}

/* --------------------------------------------------------------------------
   Entrada
   -------------------------------------------------------------------------- */

export function animateSimulation(onFinish) {
  const m = state.mission;
  onFinishCallback = onFinish;

  document.getElementById('sim-crumb').textContent = `${m.code} · ${m.title}`;
  clearEventLog();

  Scene.stopped = false;
  Scene.finished = false;
  Scene.t = 0;
  Scene.cursor = 0;
  Scene.paused = false;
  Scene.commOk = true;
  Scene.budgetAlarm = false;
  Scene.slotsWrong = false;
  Scene.lastIncidentAt = 0;
  Scene.instant = false;
  Scene.clearTimers();
  Fx.reset();

  sceneSetup();
  bindPlayerControls();
  setSceneSpeed(1);
  setScenePaused(false);
  updateSceneHud();

  Scene.lastFrame = performance.now();
  Scene.raf = requestAnimationFrame(sceneTick);
}

