/* ============================================================================
   NÚCLEO DA CENA — relógio virtual compartilhado
   ----------------------------------------------------------------------------
   Um relógio virtual (Scene.t, em ms de animação) controla tudo: pausa,
   velocidade e seek. Encenações agendam callbacks por esse relógio, nunca por
   setTimeout, para que pausar e retroceder funcionem de verdade.

   Este módulo não importa nada da cena: fx, robots e incidents dependem dele
   (e não o contrário), o que mantém o grafo de imports sem ciclos.
   ========================================================================== */

export const Scene = {
  svg: null,
  t: 0,
  duration: 31000,
  tMax: 1,
  speed: 1,
  paused: false,
  /** true durante seek/fast-forward: encenações aplicam só o estado final */
  instant: false,
  stopped: false,
  finished: false,
  raf: null,
  lastFrame: 0,

  robots: [],
  schedule: [],      // [{ at, evt }]
  cursor: 0,
  timers: [],        // [{ at, fn, done }]
  lossAt: [],
  progressCurve: null,

  commOk: true,
  budgetAlarm: false,
  lastIncidentAt: 0,
  slotsWrong: false,
  controlsBound: false,

  redwash: null,
  scanlines: null,
  offlineBadge: null,

  scheduleAt(at, fn) {
    if (this.instant) return;   // durante o seek não agendamos encenações
    this.timers.push({ at, fn, done: false });
  },

  clearTimers() { this.timers.length = 0; },
};
