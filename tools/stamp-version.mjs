/* ============================================================================
   CARIMBO DE VERSÃO
   ----------------------------------------------------------------------------
   Grava a mesma marca de build em dois lugares:

     js/version.js  — vai junto do código e fica no cache do navegador
     version.json   — lido sempre da rede (cache: 'no-store')

   Quando os dois discordam, o navegador está rodando código antigo e o jogo
   avisa na tela (ver js/ui/versioncheck.js). Isso importa porque o GitHub
   Pages manda `Cache-Control: max-age=600`: quem abriu a página antes de um
   deploy continua com os módulos velhos por até 10 minutos.

   Rode antes de cada commit que vá para o ar:
     node tools/stamp-version.mjs
   ========================================================================== */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const d = new Date();
const p = (n) => String(n).padStart(2, '0');
const build = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} `
            + `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}Z`;

await writeFile(join(ROOT, 'js', 'version.js'),
  `/* Gerado por tools/stamp-version.mjs — não edite à mão. */\n`
  + `export const BUILD = '${build}';\n`, 'utf8');

await writeFile(join(ROOT, 'version.json'),
  `${JSON.stringify({ build }, null, 2)}\n`, 'utf8');

console.log(`build carimbado: ${build}`);
