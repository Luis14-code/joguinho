/* ============================================================================
   CATÁLOGO DE ENCENAÇÕES
   ----------------------------------------------------------------------------
   Uma assinatura visual por tipo de evento. A chave do objeto INCIDENT é o
   campo visual.kind do evento gerado pela simulação, de forma que log e
   animação disparam no MESMO instante.
   ========================================================================== */

import { SC, svgEl, rp, topY, laneY, handPoint } from './geometry.js';
import { Scene } from './core.js';
import {
  Fx, fxSparks, fxDust, fxIcon, fxQuestions, fxRing, fxKinetic, fxCoins,
  fxFallingCrate, fxCommBreak, fxCable,
} from './fx.js';
import {
  setRobotState, setArm, setBattery, setCarrying, robotShake, robotWarn,
} from './robots.js';
import { Hud } from './hud.js';
import { state } from '../core/state.js';

/** Resolve os robôs em cena a partir dos índices do evento. */
export function pickRobots(visual) {
  const list = (visual && visual.robots) || [];
  const out = [];
  list.forEach((i) => {
    const r = Scene.robots[i] || Scene.robots[i % Math.max(1, Scene.robots.length)];
    if (r && !out.includes(r)) out.push(r);
  });
  if (!out.length) {
    const alive = Scene.robots.filter((r) => r.mode !== 'dead' && r.mode !== 'frozen');
    if (alive.length) out.push(alive[Math.floor(Math.random() * alive.length)]);
  }
  return out;
}

/** Robôs que ainda podem protagonizar uma cena de movimento. */
function activeRobots() {
  return Scene.robots.filter((r) => r.mode !== 'dead' && r.mode !== 'frozen');
}

/* --------------------------------------------------------------------------
   Rotinas reutilizadas por vários incidentes
   -------------------------------------------------------------------------- */

/** Quebra mecânica: roda se solta e rola para fora + fumaça. */
function breakdown(rs) {
  rs.forEach((r) => {
    setRobotState(r, 'held');
    robotShake(r, 700);
    if (!Scene.instant) {
      const wp = rp(r, 12, -5);
      const wheel = svgEl('circle', {
        cx: wp.x, cy: wp.y, r: 4, fill: '#10171f', stroke: '#5d7a88', 'stroke-width': 1.1,
      }, Fx.layer);
      Fx.add(wheel, 1500, (p, el) => {
        el.setAttribute('transform',
          `translate(${46 * p},${Math.abs(Math.sin(p * 7)) * -9 + 5 * p}) rotate(${p * 720},${wp.x},${wp.y})`);
        el.setAttribute('opacity', p < 0.8 ? 1 : (1 - p) * 5);
      });
      const cp = rp(r, -4, -22);
      const chip = svgEl('rect', { x: cp.x, y: cp.y, width: 6, height: 4, fill: '#35485c' }, Fx.layer);
      Fx.add(chip, 900, (p, el) => el.setAttribute('transform',
        `translate(${-18 * p},${-20 * p + 34 * p * p}) rotate(${p * 300},${cp.x},${cp.y})`));
      fxDust(r.x - 2, r.y - 10, 8);
    }
    Scene.scheduleAt(Scene.t + 1100, () => setRobotState(r, 'dead'));
    if (Scene.instant) setRobotState(r, 'dead');
  });
}

/** Bateria drenando até o robô sentar no chão. */
function batteryDrain(rs) {
  rs.forEach((r) => {
    r.speedMul *= 0.45;
    [0.6, 0.38, 0.2, 0.06].forEach((v, i) => Scene.scheduleAt(Scene.t + i * 330, () => setBattery(r, v)));
    Scene.scheduleAt(Scene.t + 1400, () => {
      setBattery(r, 0);
      setRobotState(r, 'sitting');
      fxIcon(r.x, topY(r), '🔋', { size: 16, life: 1500 });
    });
    Scene.scheduleAt(Scene.t + 2100, () => setRobotState(r, 'dead'));
    if (Scene.instant) { setBattery(r, 0); setRobotState(r, 'dead'); }
  });
}

/** Perdido: sai do eixo, anda em círculos, "?" e some. */
function getLost(rs) {
  rs.forEach((r) => {
    setRobotState(r, 'circling');
    fxQuestions(r.x, topY(r));
    Scene.scheduleAt(Scene.t + 1800, () => {
      setRobotState(r, 'dead', { vanish: true });
      fxIcon(r.x, topY(r), '❓', { size: 18, life: 1400 });
    });
    if (Scene.instant) setRobotState(r, 'dead', { vanish: true });
  });
}

/* --------------------------------------------------------------------------
   Catálogo
   -------------------------------------------------------------------------- */

export const INCIDENT = {

  // ---------- eventos neutros ----------
  start(rs) {
    rs.forEach((r) => {
      if (r.mode === 'frozen') return;
      const k = rp(r, 18, -18);
      fxKinetic(k.x, k.y);
    });
  },

  beat(rs) {
    rs.forEach((r) => {
      if (r.mode === 'frozen') return;
      robotWarn(r, 0);
      fxIcon(r.x, topY(r), '✅', { size: 12, life: 700 });
    });
  },

  overbudget() {
    Scene.budgetAlarm = true;
    const r = Scene.robots[0];
    if (r) fxCoins(r.x, topY(r, -6), 7);
  },

  finish() {
    if (state.mission.id === 'resgate' && state.simResult.progress >= 60) {
      fxIcon(SC.baseX + 60, 360, '👨‍🚀', { size: 22, life: 1800, rise: 40 });
    }
  },

  wipe() {
    Scene.robots.forEach((r) => { if (r.mode !== 'frozen') setRobotState(r, 'dead'); });
    fxRing(SC.W / 2, 380, '#ff5370', 90);
  },

  // ---------- falhas estruturais ----------

  /**
   * AGV sem trilho. Esses robôs já nascem em 'frozen' (resetRobot), portanto
   * não deram nem um passo até aqui: a cena só explicita o motivo.
   */
  agv_no_rails(rs) {
    rs.forEach((r) => {
      setRobotState(r, 'frozen');
      fxIcon(r.x, topY(r), '⚠️', { size: 15 });
      fxIcon(rp(r, 26, 0).x, topY(r, -14), '🛤️', { size: 14, life: 1500 });
      Scene.scheduleAt(Scene.t + 1200, () => {
        setRobotState(r, 'dead');
        r.immobile = true;
      });
      if (Scene.instant) setRobotState(r, 'dead');
    });
  },

  /** AGV em terreno aberto: patina, levanta poeira, afunda e trava. */
  agv_stuck_open(rs) {
    rs.forEach((r, i) => {
      Scene.scheduleAt(Scene.t + i * 220, () => {
        setRobotState(r, 'stuck', { spin: true, sink: 4 });
        fxDust(r.x, r.y - 2, 10);
        fxIcon(r.x, topY(r), '⚠️', { size: 15 });
      });
      Scene.scheduleAt(Scene.t + 1200 + i * 220, () => setRobotState(r, 'dead'));
      if (Scene.instant) setRobotState(r, 'dead');
    });
  },

  fleet_short() {
    const alive = activeRobots();
    alive.forEach((r) => {
      setRobotState(r, 'held');
      fxIcon(r.x, topY(r), '⚠️', { size: 14 });
    });
    Scene.scheduleAt(Scene.t + 1400, () => alive.forEach((r) => {
      if (r.mode === 'held') setRobotState(r, 'cycle');
    }));
  },

  /** Sem braço: robôs chegam ao canteiro e ficam rodando o sensor, sem agir. */
  no_arm() {
    activeRobots().forEach((r, i) => {
      Scene.scheduleAt(Scene.t + i * 160, () => {
        setRobotState(r, 'held');
        fxIcon(r.x, topY(r), '❓', { size: 16, life: 1500 });
      });
      Scene.scheduleAt(Scene.t + 1800 + i * 160, () => {
        if (r.mode === 'held') setRobotState(r, 'cycle');
      });
    });
  },

  // ---------- LOG-01 ----------

  /** Pega a caixa errada, chega ao destino, ❌, volta e refaz o trajeto. */
  retrabalho_wms(rs) {
    const r = rs[0];
    if (!r || r.mode === 'frozen') return;
    setCarrying(r, true, '🍱');
    r.state = 'toUnload';
    Scene.scheduleAt(Scene.t + 1100, () => {
      fxIcon(r.x, topY(r), '❌', { size: 17, life: 1200 });
      robotWarn(r, 1200);
      setCarrying(r, false);
      r.state = 'toLoad';
      r.detour = 0;
    });
  },

  /** Dois robôs convergem, flash, faíscas, ambos tremem, um morre. */
  colisao(rs) {
    const [a, b] = rs;
    if (!a) return;
    if (b) { b.y = a.lane; b.lane = a.lane; }
    const hit = rp(a, 14, -16);
    fxRing(hit.x, hit.y, '#ff5370', 30);
    fxSparks(hit.x, hit.y, 11);
    robotShake(a, 1000);
    if (b) robotShake(b, 1000);
    Scene.scheduleAt(Scene.t + 1000, () => {
      setRobotState(a, 'dead');
      if (b) {
        b.lane = laneY(b.idx, Scene.robots.length);
        if (b.mode !== 'frozen') setRobotState(b, 'cycle');
      }
    });
    if (Scene.instant) setRobotState(a, 'dead');
  },

  /** Zigue-zague visível + 🐢 */
  rota_ineficiente(rs) {
    rs.forEach((r) => {
      if (r.mode === 'frozen') return;
      r.detour = 16;
      fxIcon(r.x, topY(r), '🐢', { size: 16, life: 1500 });
      Scene.scheduleAt(Scene.t + 4200, () => { r.detour = 0; });
    });
  },

  quebra_mecanica(rs) { breakdown(rs); },
  quebra_terreno(rs) { breakdown(rs); },

  // ---------- MIN-02 ----------
  bateria_critica(rs) { batteryDrain(rs); },
  bateria_critica_sar(rs) { batteryDrain(rs); },
  perda_localizacao(rs) { getLost(rs); },
  robo_perdido(rs) { getLost(rs); },

  /** Rodas giram em falso, poeira, afunda, fica preso. */
  atolamento_amr_padrao(rs) {
    rs.forEach((r) => {
      setRobotState(r, 'stuck', { spin: true, sink: 4 });
      fxDust(r.x, r.y - 2, 12);
      fxIcon(r.x, topY(r), '⚠️', { size: 16, life: 1600 });
      Scene.scheduleAt(Scene.t + 1500, () => setRobotState(r, 'dead'));
      if (Scene.instant) setRobotState(r, 'dead');
    });
  },

  /** Créditos voam para fora e o HUD pisca. */
  estouro_erp(rs) {
    Scene.budgetAlarm = true;
    rs.forEach((r) => fxCoins(r.x, topY(r, -6), 8));
    Hud.sub.classList.add('alarm');
  },

  // ---------- HAB-03 ----------

  /** Três robôs pegam módulos ao mesmo tempo e tentam encaixar fora de ordem. */
  sequencia_errada() {
    const crew = activeRobots().slice(0, 3);
    Scene.slotsWrong = true;
    crew.forEach((r, i) => {
      setCarrying(r, true, '🧱');
      r.state = 'toUnload';
      Scene.scheduleAt(Scene.t + 900 + i * 180, () => {
        if (r.hasArm) setArm(r, -12, 20, 0);
        fxIcon(r.x, topY(r), '❓', { size: 16, life: 1400 });
      });
    });
    const first = crew[0];
    if (first) {
      Scene.scheduleAt(Scene.t + 1500, () => {
        const h = handPoint(first);
        fxFallingCrate(h.x, h.y, '#4a6a80');
        fxSparks(h.x, h.y, 6);
        setCarrying(first, false);
        robotShake(first, 700);
      });
    }
    Scene.scheduleAt(Scene.t + 2600, () => {
      Scene.slotsWrong = false;
      crew.forEach((r) => {
        setCarrying(r, false);
        r.state = 'toLoad';
        if (r.hasArm) setArm(r, -45, 60, 0.4);
      });
    });
  },

  /** Prateleira vazia: fantasma, robô procura girando o sensor. */
  inventario_falha(rs) {
    const r = rs[0];
    if (!r || r.mode === 'frozen') return;
    r.state = 'toLoad';
    r.x = r.loadX;
    setRobotState(r, 'held');
    fxIcon(rp(r, 6, 0).x, topY(r), '👻', { size: 17, life: 1600 });
    if (r.turretEl && !Scene.instant) {
      for (let k = 0; k < 6; k++) {
        Scene.scheduleAt(Scene.t + k * 240, () => {
          r.turretEl.setAttribute('transform', `translate(7,${r.turretY}) rotate(${k % 2 ? 22 : -22})`);
        });
      }
      Scene.scheduleAt(Scene.t + 1600, () => r.turretEl.setAttribute('transform', `translate(7,${r.turretY})`));
    }
    Scene.scheduleAt(Scene.t + 1900, () => { if (r.mode === 'held') setRobotState(r, 'cycle'); });
  },

  /** Linha de sinal entre braço e transportador se parte; módulo cai. */
  comunicacao(rs) {
    const r = rs[0];
    if (!r || r.mode === 'frozen') return;
    const h = handPoint(r);
    if (r.hasArm) setArm(r, -8, 16, 0);
    fxCommBreak(h.x, h.y - 6, h.x + 70, h.y - 30);
    Scene.scheduleAt(Scene.t + 420, () => {
      if (r.payloadEl) r.payloadEl.setAttribute('transform', `translate(7,${r.payloadY - 4})`);
    });
    Scene.scheduleAt(Scene.t + 560, () => {
      if (r.payloadEl) r.payloadEl.setAttribute('transform', `translate(-6,${r.payloadY + 3})`);
    });
    Scene.scheduleAt(Scene.t + 700, () => {
      if (r.payloadEl) r.payloadEl.setAttribute('transform', `translate(0,${r.payloadY})`);
      fxFallingCrate(h.x, h.y, '#4a6a80');
      setCarrying(r, false);
      robotWarn(r, 1200);
    });
  },

  /** Garra fecha no ar, escorrega, faíscas, módulo cai torto — repete uma vez. */
  acoplamento_falho(rs) {
    const r = rs[0];
    if (!r || r.mode === 'frozen') return;
    const miss = (delay) => Scene.scheduleAt(Scene.t + delay, () => {
      const h = handPoint(r);
      if (r.hasArm) setArm(r, -10, 18, 1);
      const ghost = svgEl('rect', {
        x: h.x + 3, y: h.y - 7, width: 16, height: 13, rx: 1.5, fill: '#2a4458', stroke: '#4a6a80',
      }, Fx.layer);
      if (!Scene.instant) Fx.add(ghost, 420, (p, el) => el.setAttribute('opacity', 1 - p));
      Scene.scheduleAt(Scene.t + 180, () => { if (r.hasArm) setArm(r, -10, 18, 0); });
      Scene.scheduleAt(Scene.t + 330, () => {
        fxSparks(h.x + 6, h.y, 5);
        fxFallingCrate(h.x + 4, h.y, '#4a6a80');
      });
    });
    miss(0);
    miss(1400);
    robotWarn(r, 2200);
    Scene.scheduleAt(Scene.t + 2300, () => { if (r.hasArm) setArm(r, -45, 60, 0.4); });
  },

  /** Relógio dispara e a cena ganha tom avermelhado. */
  estouro_horas() {
    Scene.redwash.classList.add('on');
    const x = SC.W / 2;
    const y = 150;
    if (!Scene.instant) {
      const node = svgEl('text', { class: 'fx-icon', x, y, 'font-size': 26 }, Fx.layer);
      node.textContent = '⏱';
      Fx.add(node, 2200, (p, el) => {
        el.setAttribute('transform', `rotate(${p * 1440},${x},${y})`);
        el.setAttribute('opacity', p < 0.8 ? 1 : (1 - p) * 5);
      });
      for (let k = 0; k < 4; k++) {
        Scene.scheduleAt(Scene.t + 300 + k * 380,
          () => fxIcon(x + (k - 1.5) * 34, y + 40, '🔁', { size: 14, life: 800 }));
      }
    }
    Scene.scheduleAt(Scene.t + 4000, () => Scene.redwash.classList.remove('on'));
  },

  // ---------- SAR-04 ----------

  /** Chuvisco na cena inteira, base apagada, telemetria perdida. */
  comm_blackout() {
    Scene.commOk = false;
    Scene.svg.classList.add('commloss');
    Scene.scanlines.classList.add('on');
    Scene.offlineBadge.classList.add('on');
    document.querySelectorAll('#terrain-layer .struct, #terrain-layer .struct-lit')
      .forEach((e) => e.classList.add('offline'));
    Scene.scheduleAt(Scene.t + 1600, () => {
      Scene.scanlines.classList.remove('on');
      Scene.offlineBadge.classList.remove('on');
    });
    // labels e ícone de comunicação permanecem caídos: consequência duradoura
  },

  /** O cabo arrebenta, o rover tomba de volta. */
  reboque_falhou(rs) {
    const r = rs[0];
    if (!r || r.mode === 'frozen') return;
    const rover = document.querySelector('.rover-group');
    const anchor = rp(r, 18, -20);
    fxCable(anchor.x, anchor.y, 744, 418, 1400, true);
    Scene.scheduleAt(Scene.t + 700, () => {
      fxSparks(620, 400, 10);
      fxDust(744, 440, 9);
      if (rover) rover.setAttribute('transform', 'translate(772,424) rotate(34)');
      robotShake(r, 800);
      setCarrying(r, false);
    });
  },

  /** Caminho alternativo desenhado por cima de um rochedo: vão e voltam. */
  rota_cega(rs) {
    if (!Scene.instant) {
      const d = `M${SC.baseX + 60},430 Q420,318 ${SC.actionX - 30},400`;
      const path = svgEl('path', {
        d, fill: 'none', stroke: '#ff5370', 'stroke-width': 1.6, 'stroke-dasharray': '7 5',
      }, Fx.layer);
      Fx.add(path, 3200, (p, el) => el.setAttribute('opacity', p < 0.8 ? 0.85 : (1 - p) * 4.2));
      fxIcon(420, 300, '⛔', { size: 17, life: 1600 });
    }
    rs.forEach((r) => {
      if (r.mode === 'frozen') return;
      r.detour = 22;
      Scene.scheduleAt(Scene.t + 1500, () => { r.state = 'toLoad'; });
      Scene.scheduleAt(Scene.t + 3200, () => { r.detour = 0; });
    });
  },

  // ---------- quase-acidente: o mitigador funcionando ----------
  nearmiss(rs, evt) {
    const r = rs[0];
    if (!r || r.mode === 'frozen') return;
    const id = (evt.visual && evt.visual.riskId) || '';
    robotWarn(r, 1000);

    if (id.startsWith('bateria')) {
      const prev = r.battery;
      setBattery(r, 0.28);
      fxIcon(r.x, topY(r), '🔋', { size: 15, life: 1100 });
      Scene.scheduleAt(Scene.t + 900, () => setBattery(r, Math.max(prev, 0.85)));
    } else if (id === 'colisao') {
      const old = r.lane;
      r.lane = old - 16;
      const k = rp(r, 16, -18);
      fxKinetic(k.x, k.y);
      const ring = rp(r, 18, -16);
      fxRing(ring.x, ring.y, '#ffb547', 20);
      Scene.scheduleAt(Scene.t + 1100, () => { r.lane = old; });
    } else if (id === 'perda_localizacao' || id === 'robo_perdido') {
      fxIcon(r.x, topY(r), '❓', { size: 14, life: 650 });
      fxRing(r.x, rp(r, 0, -20).y, '#ffb547', 22);
    } else if (id === 'comm_blackout' || id === 'comunicacao') {
      const h = handPoint(r);
      if (!Scene.instant) {
        const node = svgEl('path', {
          class: 'commline', d: `M${h.x},${h.y} Q${h.x + 40},${h.y - 30} ${h.x + 80},${h.y - 12}`,
        }, Fx.layer);
        Fx.add(node, 900, (p, el) => el.setAttribute('opacity', 1 - p));
      }
      fxIcon(r.x, topY(r), '📡', { size: 14, life: 900 });
    } else if (id === 'acoplamento_falho' || id === 'sequencia_errada') {
      if (r.hasArm) {
        setArm(r, -10, 18, 1);
        Scene.scheduleAt(Scene.t + 260, () => setArm(r, -10, 18, 0));
        Scene.scheduleAt(Scene.t + 700, () => setArm(r, -45, 60, 0.4));
      }
      const h = handPoint(r);
      fxRing(h.x, h.y, '#ffb547', 16);
    } else if (id.startsWith('quebra') || id === 'atolamento_amr_padrao') {
      fxDust(r.x, r.y - 2, 5);
      fxRing(r.x, rp(r, 0, -16).y, '#ffb547', 22);
    } else {
      fxRing(r.x, rp(r, 0, -20).y, '#ffb547', 22);
      fxIcon(r.x, topY(r), '⚠️', { size: 13, life: 800 });
    }
  },
};
