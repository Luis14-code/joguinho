/* ============================================================================
   TELA 4 — PLANEJAMENTO
   ----------------------------------------------------------------------------
   Sem aviso de pré-requisito nos cards: o aluno precisa ler a descrição e
   interpretar. As consequências aparecem na simulação e na auditoria.
   ========================================================================== */

import { CATALOG, CATALOG_INDEX } from '../data/catalog.js';
import { state } from '../core/state.js';
import { calcTotalCost, validateCart } from '../core/budget.js';

export function renderPlanning() {
  const m = state.mission;
  document.getElementById('planning-crumb').textContent = `${m.code} · ${m.title}`;
  document.getElementById('budget-total').textContent = m.budget;

  renderCatalog('cat-robots', CATALOG.robots, 'robots', 'qty');
  renderCatalog('cat-modules', CATALOG.modules, 'modules', 'toggle');
  renderCatalog('cat-infra', CATALOG.infra, 'infra', 'toggle');
  renderCatalog('cat-integration', CATALOG.integration, 'integration', 'toggle');

  updateBudget();
}

/** Catálogo genérico: robôs com +/-, demais com toggle on/off. */
function renderCatalog(containerId, items, cartKey, mode) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.dataset.itemId = item.id;

    const isRobot = mode === 'qty';
    const qty = isRobot ? (state.cart.robots[item.id] || 0) : 0;
    const active = !isRobot && state.cart[cartKey].has(item.id);

    if (active || (isRobot && qty > 0)) card.classList.add('selected');

    card.innerHTML = `
      <div class="item-head">
        <span class="item-name">${item.name}</span>
        <span class="item-cost">${item.cost}c</span>
      </div>
      <div class="item-desc">${item.desc}</div>
      <div class="item-ctrl"></div>
    `;

    const ctrl = card.querySelector('.item-ctrl');

    if (isRobot) {
      ctrl.innerHTML = '<span class="ctrl-tag">unidades</span>';
      const wrap = document.createElement('div');
      wrap.className = 'qty-ctrl';
      wrap.innerHTML = `
        <button class="qty-btn" data-op="dec" aria-label="Remover uma unidade">−</button>
        <span class="qty-val">${qty}</span>
        <button class="qty-btn" data-op="inc" aria-label="Adicionar uma unidade">+</button>
      `;
      ctrl.appendChild(wrap);

      wrap.querySelector('[data-op="inc"]').addEventListener('click', () => {
        state.cart.robots[item.id] = (state.cart.robots[item.id] || 0) + 1;
        renderPlanning();
      });
      wrap.querySelector('[data-op="dec"]').addEventListener('click', () => {
        const cur = state.cart.robots[item.id] || 0;
        if (cur > 0) state.cart.robots[item.id] = cur - 1;
        if (state.cart.robots[item.id] === 0) delete state.cart.robots[item.id];
        renderPlanning();
      });
    } else {
      ctrl.innerHTML = '<span class="ctrl-tag">opcional</span>';
      const btn = document.createElement('button');
      btn.className = `toggle-btn${active ? ' on' : ''}`;
      btn.textContent = active ? '✓ Ativo' : 'Adicionar';
      ctrl.appendChild(btn);

      btn.addEventListener('click', () => {
        if (state.cart[cartKey].has(item.id)) state.cart[cartKey].delete(item.id);
        else state.cart[cartKey].add(item.id);
        renderPlanning();
      });
    }

    container.appendChild(card);
  });
}

export function updateBudget() {
  const m = state.mission;
  const { problems, warnings, total } = validateCart();

  const pct = Math.min(100, (total / m.budget) * 100);
  const bar = document.getElementById('budget-bar');
  bar.style.width = `${pct}%`;
  bar.className = `budget-bar${total > m.budget ? ' over' : pct >= 80 ? ' warn' : ''}`;

  document.getElementById('budget-used').textContent = total;
  document.getElementById('budget-free').textContent = total <= m.budget
    ? `${m.budget - total} livre`
    : `+${total - m.budget} excedido`;

  // Lista detalhada de compras agrupada por categoria
  const summary = document.getElementById('budget-summary');
  summary.innerHTML = '';
  const addLine = (text, amt) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${text}</span><span class="amt">${amt}c</span>`;
    summary.appendChild(li);
  };
  const addCat = (text) => {
    const li = document.createElement('li');
    li.className = 'cat';
    li.textContent = text;
    summary.appendChild(li);
  };

  const robotEntries = Object.entries(state.cart.robots);
  if (robotEntries.length) {
    addCat('Frota');
    robotEntries.forEach(([id, qty]) => {
      const item = CATALOG_INDEX[id];
      addLine(`${qty}× ${item.name}`, item.cost * qty);
    });
  }
  const addSetSummary = (set, title) => {
    if (set.size === 0) return;
    addCat(title);
    set.forEach((id) => {
      const item = CATALOG_INDEX[id];
      addLine(item.name, item.cost);
    });
  };
  addSetSummary(state.cart.infra, 'Infraestrutura');
  addSetSummary(state.cart.modules, 'Módulos');
  addSetSummary(state.cart.integration, 'Integração');

  // Alertas: apenas orçamento e frota vazia
  const alerts = document.getElementById('budget-alerts');
  alerts.innerHTML = '';
  const alert = (cls, text) => {
    const el = document.createElement('div');
    el.className = `alert ${cls}`;
    el.textContent = text;
    alerts.appendChild(el);
  };
  problems.forEach((p) => alert('red', `⚠ ${p}`));
  warnings.forEach((w) => alert('amber', `⚠ ${w}`));
  if (problems.length === 0) alert('green', '✓ Frota pronta para lançamento.');

  document.getElementById('btn-launch').disabled = problems.length > 0;
  return { total: calcTotalCost(), blocked: problems.length > 0 };
}

export function bindTabs() {
  document.querySelectorAll('.tab').forEach((t) => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById(`tab-${t.dataset.tab}`).classList.add('active');
    });
  });
}
