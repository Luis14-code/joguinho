/* ============================================================================
   MARS-OPS — ponto de entrada do jogo
   ----------------------------------------------------------------------------
   Fluxo: registro → missão → briefing → planejamento → simulação → debrief.
   Cada etapa é um <section class="screen">; só a .active fica visível.
   ========================================================================== */

import { state, resetCart, saveGroup, loadGroup, startMissionClock, stopMissionClock } from './core/state.js';
import { runSimulation } from './core/simulation.js';
import { showScreen } from './ui/screens.js';
import { renderMissions } from './ui/missions.js';
import { renderBriefing } from './ui/briefing.js';
import { renderPlanning, bindTabs } from './ui/planning.js';
import { renderDebrief } from './ui/debrief.js';
import { animateSimulation, stopScene, stepScene, seekTo } from './scene/scene.js';
import { flushQueue } from './net/leaderboard.js';
import { startRoundClock } from './ui/roundclock.js';

function pickMission(m) {
  state.mission = m;
  resetCart();
  startMissionClock();
  renderBriefing();
  showScreen('screen-briefing');
}

function launchMission() {
  stopMissionClock();
  runSimulation();
  showScreen('screen-simulation');
  animateSimulation(() => {
    renderDebrief();
    showScreen('screen-debrief');
  });
}

function boot() {
  renderMissions(pickMission);
  bindTabs();
  startRoundClock();
  flushQueue();

  // grupo já registrado antes neste navegador
  const saved = loadGroup();
  if (saved) {
    document.getElementById('group-name').value = saved.name;
    document.getElementById('group-members').value = saved.members;
  }

  // Tela 1 → 2
  document.getElementById('btn-start').addEventListener('click', () => {
    const name = document.getElementById('group-name').value.trim();
    if (!name) {
      const hint = document.getElementById('group-error');
      hint.textContent = 'Informe ao menos o nome do grupo.';
      hint.hidden = false;
      document.getElementById('group-name').focus();
      return;
    }
    state.group.name = name;
    state.group.members = document.getElementById('group-members').value.trim();
    saveGroup();
    showScreen('screen-missions');
  });

  document.getElementById('btn-change-group').addEventListener('click', () => showScreen('screen-start'));
  document.getElementById('btn-back-to-missions').addEventListener('click', () => showScreen('screen-missions'));

  document.getElementById('btn-to-planning').addEventListener('click', () => {
    renderPlanning();
    showScreen('screen-planning');
  });

  document.getElementById('btn-back-to-briefing').addEventListener('click', () => showScreen('screen-briefing'));

  document.getElementById('btn-launch').addEventListener('click', launchMission);

  document.getElementById('btn-new-mission').addEventListener('click', () => {
    stopScene();
    showScreen('screen-missions');
  });

  document.getElementById('btn-retry-mission').addEventListener('click', () => {
    stopScene();
    startMissionClock();   // nova tentativa, cronômetro do zero
    renderPlanning();
    showScreen('screen-planning');
  });

  document.getElementById('btn-print').addEventListener('click', () => window.print());

  // Ponte de depuração, só em desenvolvimento local: permite avançar a cena
  // passo a passo no console quando o requestAnimationFrame está parado
  // (aba em segundo plano), além de inspecionar o estado da partida.
  if (['localhost', '127.0.0.1'].includes(location.hostname)) {
    window.__mars = { state, stepScene, seekTo, runSimulation };
  }
}

boot();
