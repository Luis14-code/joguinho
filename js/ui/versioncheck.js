/* ============================================================================
   AVISO DE VERSÃO ANTIGA
   ----------------------------------------------------------------------------
   O GitHub Pages serve os módulos com `Cache-Control: max-age=600`. Quem abriu
   a página antes de um deploy continua rodando o código velho por até 10
   minutos — e, pior, sem perceber: foi assim que as primeiras jogadas ficaram
   sem o tempo de missão registrado.

   Aqui comparamos a marca que veio junto do código (js/version.js, que está no
   mesmo cache) com a do servidor (version.json, lido sempre da rede). Se
   discordarem, a página avisa que só um recarregamento forçado resolve —
   recarregar normal pode servir o mesmo cache.
   ========================================================================== */

import { BUILD } from '../version.js';

const CHECK_MS = 5 * 60 * 1000;
let avisado = false;

async function buildDoServidor() {
  const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  return data && data.build ? String(data.build) : null;
}

function atalhoDoSistema() {
  const mac = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
  return mac ? 'Cmd + Shift + R' : 'Ctrl + Shift + R';
}

function mostrarAviso(doServidor) {
  if (avisado) return;
  avisado = true;

  const bar = document.createElement('div');
  bar.className = 'version-bar';
  bar.innerHTML = `
    <span>
      ⚠ Este navegador está rodando uma <b>versão antiga</b> do jogo.
      Aperte <b>${atalhoDoSistema()}</b> para atualizar — recarregar normal pode trazer a versão velha de novo.
    </span>
    <button type="button" class="vb-close" aria-label="Fechar aviso">×</button>
  `;
  bar.title = `carregado: ${BUILD} · publicado: ${doServidor}`;
  bar.querySelector('.vb-close').addEventListener('click', () => bar.remove());
  document.body.prepend(bar);
  document.body.classList.add('has-version-bar');
}

async function checar() {
  try {
    const doServidor = await buildDoServidor();
    if (doServidor && doServidor !== BUILD) mostrarAviso(doServidor);
  } catch (e) { /* offline: não atrapalha o jogo */ }
}

export function startVersionCheck() {
  console.info(`MARS-OPS build ${BUILD}`);
  checar();
  setInterval(checar, CHECK_MS);
}
