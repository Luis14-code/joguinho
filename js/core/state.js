/* ============================================================================
   ESTADO GLOBAL
   ----------------------------------------------------------------------------
   cart:
     robots      — { [robotId]: qty }
     modules     — Set de ids ativados
     infra       — Set de ids ativados
     integration — Set de ids ativados
   ========================================================================== */

const GROUP_KEY = 'marsops.group';

export const state = {
  group: { name: '', members: '' },
  mission: null,
  cart: emptyCart(),
  simResult: null,
  /** preenchido por net/leaderboard depois do envio da pontuação */
  submission: null,

  /**
   * Cronômetro da missão: começa quando o grupo abre o briefing e para no
   * lançamento. Mede o tempo de decisão (ler o briefing, montar a frota), que
   * é o que depende da equipe — a cena depois disso tem duração fixa e pode
   * ser pulada ou acelerada, então não entra na conta.
   */
  missionStartedAt: null,
  missionDurationMs: null,
};

/** Zera e inicia o cronômetro da missão. */
export function startMissionClock() {
  state.missionStartedAt = Date.now();
  state.missionDurationMs = null;
}

/** Para o cronômetro e devolve a duração em ms (null se nunca começou). */
export function stopMissionClock() {
  if (!state.missionStartedAt) return null;
  state.missionDurationMs = Date.now() - state.missionStartedAt;
  return state.missionDurationMs;
}

function emptyCart() {
  return {
    robots: {},
    modules: new Set(),
    infra: new Set(),
    integration: new Set(),
  };
}

export function resetCart() {
  state.cart = emptyCart();
}

/** Verifica se um módulo/infra/integração foi comprado. */
export function owns(id) {
  const c = state.cart;
  return c.modules.has(id) || c.infra.has(id) || c.integration.has(id);
}

export function countRobots() {
  return Object.values(state.cart.robots).reduce((a, b) => a + b, 0);
}

/* --- persistência leve do grupo, só no navegador do aluno ---------------- */

export function saveGroup() {
  try {
    localStorage.setItem(GROUP_KEY, JSON.stringify(state.group));
  } catch (e) { /* navegação privada: segue sem persistir */ }
}

export function loadGroup() {
  try {
    const raw = localStorage.getItem(GROUP_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    if (g && typeof g.name === 'string') {
      state.group = { name: g.name, members: g.members || '' };
      return state.group;
    }
  } catch (e) { /* ignora */ }
  return null;
}
