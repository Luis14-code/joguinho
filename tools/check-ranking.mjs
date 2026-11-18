/* ============================================================================
   VERIFICAÇÃO DA CONEXÃO COM O SUPABASE
   ----------------------------------------------------------------------------
   Confere, sem abrir o navegador, se o ranking vai funcionar depois de
   preencher o config.js:

     1. a URL e a chave anon respondem;
     2. a tabela existe e é legível (política de SELECT);
     3. é possível gravar uma pontuação (política de INSERT);
     4. o que foi gravado volta na leitura.

   A linha de teste usa round_id = -1, uma rodada que nunca acontece, então ela
   NÃO aparece no painel e não atrapalha a competição.

   Uso (dentro da pasta mars-ops):
     node tools/check-ranking.mjs

   Para apagar as linhas de teste depois, rode no SQL Editor do Supabase:
     delete from public.marsops_scores where round_id = -1;
   ========================================================================== */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(HERE, '..', 'config.js');

const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`\x1b[31m✗\x1b[0m ${m}`);
const info = (m) => console.log(`  ${m}`);

/** Lê o config.js como texto: evita depender de package.json no site estático. */
async function readConfig() {
  const src = await readFile(CONFIG_PATH, 'utf8');
  const pick = (key) => {
    const m = src.match(new RegExp(`${key}\\s*:\\s*['"\`]([^'"\`]*)['"\`]`));
    return m ? m[1].trim() : '';
  };
  return {
    url: pick('supabaseUrl').replace(/\/+$/, ''),
    key: pick('supabaseAnonKey'),
    table: pick('table') || 'marsops_scores',
  };
}

function explain(status, body) {
  if (status === 401 || status === 403) {
    return 'Chave anon inválida, ou as políticas RLS não foram criadas (rode o sql/schema.sql).';
  }
  if (status === 404) {
    return 'Tabela não encontrada nesse projeto. Confira o nome em config.js e se o sql/schema.sql rodou.';
  }
  if (/row-level security/i.test(body)) {
    return 'A política de RLS barrou a operação. Rode o sql/schema.sql inteiro no SQL Editor.';
  }
  return body.slice(0, 300) || 'sem detalhes';
}

async function main() {
  const cfg = await readConfig();

  console.log('\nMARS-OPS · verificação do ranking\n');

  if (!cfg.url || !cfg.key) {
    bad('config.js ainda não tem supabaseUrl e/ou supabaseAnonKey.');
    info('Preencha os dois campos e rode de novo. Passo a passo: README.md, seção 6.');
    process.exitCode = 1;
    return;
  }

  info(`projeto: ${cfg.url}`);
  info(`tabela:  ${cfg.table}`);
  info(`chave:   ${cfg.key.slice(0, 12)}…${cfg.key.slice(-6)} (${cfg.key.length} caracteres)\n`);

  const endpoint = (q = '') => `${cfg.url}/rest/v1/${cfg.table}${q}`;
  const headers = (extra = {}) => {
    const h = { 'Content-Type': 'application/json', apikey: cfg.key, ...extra };
    // só a chave legada (JWT) vai no Authorization; ver js/net/leaderboard.js
    if (cfg.key.startsWith('eyJ')) h.Authorization = `Bearer ${cfg.key}`;
    return h;
  };

  // 1 e 2 — leitura
  let res;
  try {
    res = await fetch(endpoint('?select=id&limit=1'), { headers: headers() });
  } catch (e) {
    bad(`Não consegui falar com ${cfg.url}`);
    info(e.message);
    process.exitCode = 1;
    return;
  }
  if (!res.ok) {
    bad(`Leitura recusada (HTTP ${res.status})`);
    info(explain(res.status, await res.text().catch(() => '')));
    process.exitCode = 1;
    return;
  }
  ok('Leitura da tabela autorizada (política de SELECT).');

  // 3 — gravação, em uma rodada que nunca acontece
  const marker = `verificacao-${Date.now()}`;
  const row = {
    round_id: -1,
    group_name: marker.slice(0, 60),
    members: 'linha de teste do check-ranking.mjs',
    mission_id: 'logistica',
    mission_code: 'LOG-01',
    mission_title: 'Logística Inter-Bases',
    score: 777,
    verdict: 'partial',
    progress: 80,
    fleet_preserved: 75,
    process_eff: 70,
    robots_lost: 1,
    total_robots: 4,
    cost_used: 900,
    budget: 1000,
    wasted: 0,
    breakdown: { components: [], processLog: [], audit: [], risks: [], notes: [], fleet: {} },
  };

  res = await fetch(endpoint(), {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify([row]),
  });
  if (!res.ok) {
    bad(`Gravação recusada (HTTP ${res.status})`);
    info(explain(res.status, await res.text().catch(() => '')));
    process.exitCode = 1;
    return;
  }
  ok('Gravação de pontuação autorizada (política de INSERT).');

  // 4 — a linha volta na leitura
  res = await fetch(endpoint(`?round_id=eq.-1&group_name=eq.${encodeURIComponent(marker)}&select=*`), {
    headers: headers(),
  });
  const back = res.ok ? await res.json() : [];
  if (!back.length) {
    bad('A linha gravada não voltou na leitura. Confira a política de SELECT.');
    process.exitCode = 1;
    return;
  }
  ok('A pontuação gravada voltou na leitura, com a memória de cálculo.');

  console.log('\nTudo certo: o jogo já pode enviar pontuações e o painel já pode exibi-las.');
  console.log('As linhas de teste ficam em round_id = -1 e não aparecem no painel.');
  console.log('Para removê-las: delete from public.marsops_scores where round_id = -1;\n');
}

main().catch((e) => {
  bad(e.message);
  process.exitCode = 1;
});
