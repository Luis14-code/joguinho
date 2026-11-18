# MARS-OPS — Comando de Frota Autônoma

Simulador de missões com frota autônoma em Marte, usado como atividade em grupo
na disciplina **Integração de Sistemas na Indústria** (Engenharia de Produção, UFSM).

Cada grupo recebe um briefing com objetivos e riscos declarados, monta uma frota
dentro de um orçamento, assiste à execução animada e recebe um relatório com a
nota aberta parcela por parcela. A nota entra no **ranking da turma**, que se
reinicia a cada 10 minutos.

---

## 1. O que mudou em relação ao arquivo único

| Antes | Agora |
| --- | --- |
| Um `.html` de ~3000 linhas com CSS e JS embutidos | Módulos ES separados por responsabilidade |
| Sem pontuação comparável entre grupos | Pontuação 0–1000 com memória de cálculo |
| Sem ranking | Painel com pódio de 1º a 4º e botão de zerar a rodada |
| AGV sem trilho andava e só depois travava | AGV sem trilho **não sai do lugar** desde o primeiro quadro |

---

## 2. Estrutura

```
mars-ops/
├── index.html              Jogo (link que vai para a turma)
├── ranking.html            Painel de ranking (uso do docente, com senha)
├── config.js               ÚNICO arquivo a editar antes de publicar
├── css/
│   ├── base.css            Tema, reset, cabeçalho, botões, impressão
│   ├── screens.css         Telas 1–4 e 6
│   ├── scene.css           Cena de simulação (robôs, terreno, HUD, player)
│   └── ranking.css         Painel de ranking
├── js/
│   ├── main.js             Ponto de entrada e navegação entre telas
│   ├── data/
│   │   ├── catalog.js      Robôs, sensores, infraestrutura, integração
│   │   └── missions.js     As 4 missões e seus riscos declarados
│   ├── core/
│   │   ├── state.js        Estado global (grupo, missão, carrinho)
│   │   ├── budget.js       Custos, tolerância e validação de lançamento
│   │   ├── audit.js        Auditoria de investimento (supérfluo/redundante)
│   │   ├── simulation.js   Rolagem de riscos e desfecho da missão
│   │   ├── scoring.js      Fórmula da pontuação e veredito
│   │   └── format.js       Formatação de tempo compartilhada
│   ├── scene/
│   │   ├── core.js         Relógio virtual compartilhado
│   │   ├── geometry.js     Palco, lanes e helpers de posição
│   │   ├── fx.js           Partículas regidas pelo relógio virtual
│   │   ├── robots.js       Desenho, estados e ciclo de trabalho dos robôs
│   │   ├── terrain.js      Um terreno por missão
│   │   ├── hud.js          HUD sobreposto
│   │   ├── incidents.js    Uma encenação por tipo de evento
│   │   └── scene.js        Montagem, loop, seek e player
│   ├── ui/                 Render de cada tela
│   ├── net/
│   │   ├── rounds.js       Rodada corrente (tudo desde o último reinício)
│   │   └── leaderboard.js  Cliente REST do Supabase + fila offline
│   └── ranking/main.js     Painel do docente
├── version.json            Marca do build publicado (lida sempre da rede)
├── sql/
│   ├── schema.sql          Tabelas e políticas do Supabase
│   └── migracao-rodadas.sql  Migração para quem já tinha o schema antigo
└── tools/
    ├── check-ranking.mjs   Testa a conexão com o Supabase pelo terminal
    └── stamp-version.mjs   Carimba o build antes de publicar
```

Nenhum build, nenhum `npm install`: são módulos ES servidos como arquivos
estáticos. Só não funciona abrindo o `index.html` com duplo clique
(`file://` bloqueia módulos) — veja a seção 5.

---

## 3. Como a pontuação é calculada

A nota é a **eficiência global × 10**, de 0 a 1000 pontos, em três parcelas:

| Parcela | Peso | De onde vem |
| --- | --- | --- |
| **Objetivo cumprido** | até 500 | `progresso% × 5` — quanto da missão se concretizou |
| **Frota preservada** | até 300 | `frota viva% × 3` — robôs que voltaram |
| **Processo e investimento** | até 200 | `processo% × 2` |

A parcela de processo começa em 100 e cai com:

- riscos de **processo** não mitigados (falta de ERP, MES, WMS…);
- **estouro de orçamento** (2 pontos por 1% acima do teto);
- **investimento mal direcionado** — itens que não atuam sobre nenhum risco da
  missão ou que duplicam a cobertura de outro item comprado (auditoria), com
  teto de −50.

Tanto o debrief quanto o painel de ranking mostram essa conta linha a linha, de
forma que o grupo e o docente veem **por que** a nota deu aquilo.

Cada missão também registra o **tempo do briefing ao lançamento** — o tempo de
decisão da equipe. A cena depois disso tem duração fixa e pode ser pulada ou
acelerada, então não entra na conta. O tempo não altera a pontuação; serve para
o prêmio de velocidade e para você comparar quem decidiu rápido.

Vereditos: `MISSÃO BEM-SUCEDIDA`, `MISSÃO PARCIALMENTE COMPLETA` e
`MISSÃO FRACASSADA` (esta última reservada a erro de planejamento ou objetivo
muito baixo).

---

## 4. Rodadas e ranking

A rodada **não tem prazo**: ela vale até você apertar **⟲ Zerar ranking** no
painel. Enquanto não zerar, todas as jogadas disputam a mesma classificação —
a turma pode jogar quantas missões quiser, e a melhor pontuação de cada grupo é
a que conta.

Zerar **não apaga nada**: grava um marcador em `marsops_resets` e tudo que veio
antes sai da classificação. O histórico continua no banco. Depois de zerar, o
ranking fica em espera até alguém terminar a próxima missão — essa jogada abre
a rodada nova.

Tudo isso é derivado de dois dados públicos — os horários das pontuações e o
último marcador de reinício — então o jogo e o painel chegam exatamente à mesma
rodada sem precisar de servidor. O painel busca apenas as pontuações posteriores
ao último reinício, então o tráfego acompanha o tamanho da rodada e não o do
banco.

No ranking o grupo é classificado pela **soma dos pontos de todas as missões**
que jogou na rodada — jogar mais missões, e melhor, sobe a colocação. Empate se
desfaz por menor tempo total e, depois, por quem começou antes.

O painel mostra, para cada grupo:

- a **soma** e os chips de cada missão com a nota que ela rendeu (pódio);
- soma, missões jogadas, média, melhor nota e tempo total (tabela);
- ao clicar na linha, o **desempenho do grupo** e uma **aba por jogo**, cada
  uma com a memória de cálculo completa daquela missão;
- um painel de **mais rápidos por missão**, contando só missões que não
  fracassaram — senão desistir rápido venceria a prova de velocidade.

## 5. Rodar localmente

```powershell
python -m http.server 8765
```

Depois abra <http://127.0.0.1:8765/index.html>.

Painel de ranking: `http://127.0.0.1:8765/ranking.html?k=SUA-SENHA`
Para conferir o layout do painel sem banco nenhum, acrescente `&demo=1`.

Em `localhost`, o jogo expõe `window.__mars` no console (`state`, `stepScene`,
`seekTo`, `runSimulation`) para inspecionar uma partida ou avançar a cena passo
a passo. Fora de localhost esse objeto não existe.

---

## 6. Configurar o ranking (Supabase, grátis)

1. Crie um projeto em <https://supabase.com> (plano gratuito basta).
2. **SQL Editor → New query** → cole o conteúdo de `sql/schema.sql` → **Run**.
   (Se você já tinha rodado uma versão anterior do schema, rode também
   `sql/migracao-rodadas.sql`, que cria a tabela dos reinícios de ranking.)
3. **Project Settings → API** → copie:
   - *Project URL* (ex.: `https://abcdefgh.supabase.co`)
   - a **chave pública**: nos projetos novos é a *Publishable key*
     (`sb_publishable_…`); nos antigos, a *anon public* (`eyJ...`). Os dois
     formatos funcionam. **Nunca** use a *Secret key* (`sb_secret_…`): ela
     ignora as políticas de segurança e ficaria visível para a turma.
4. Cole as duas em `config.js`:

```js
export const RANKING_CONFIG = {
  supabaseUrl: 'https://abcdefgh.supabase.co',
  supabaseAnonKey: 'eyJhbGciOi...',
  table: 'marsops_scores',
  // ...
};
```

5. Confira se funcionou, sem abrir o navegador:

```powershell
node tools/check-ranking.mjs
```

O script testa leitura e gravação e explica o erro quando algo falha (chave
errada, tabela ausente, RLS não aplicada). A linha de teste que ele grava usa
`round_id = -1`, uma rodada que nunca acontece, então ela não aparece no painel.

A chave `anon` é pública por natureza — ela fica no navegador de quem joga. A
proteção está nas políticas RLS do schema: qualquer um pode **inserir** e
**ler** pontuações, **ninguém** pode apagar ou alterar as dos outros. Para zerar
tudo, use o painel do Supabase.

### Trocar a senha do painel

O `config.js` guarda apenas o SHA-256 da senha — o texto dela não fica no
repositório. Para trocar, gere o hash da senha nova no console do navegador
(F12):

```js
crypto.subtle.digest('SHA-256', new TextEncoder().encode('MINHA-SENHA'))
  .then(b => console.log([...new Uint8Array(b)]
    .map(x => x.toString(16).padStart(2, '0')).join('')));
```

e cole o resultado em `rankingPasswordHash`.

> Em um site estático qualquer segredo no cliente é legível por quem abrir o
> código-fonte. A senha serve para a turma não abrir o painel por curiosidade;
> ela não impede alguém determinado de ler as pontuações pela API.

---

## 7. Publicar no GitHub Pages

### Opção A — conteúdo na raiz do repositório (mais simples)

1. Crie um repositório novo (público) no GitHub, por exemplo `mars-ops`.
2. Copie **o conteúdo desta pasta** para a raiz do repositório (o `index.html`
   precisa ficar na raiz) e faça o push.
3. **Settings → Pages → Build and deployment**: *Deploy from a branch*,
   branch `main`, pasta `/ (root)`. Salve.
4. Em um ou dois minutos o site sai em
   `https://SEU-USUARIO.github.io/mars-ops/`.

O arquivo `.nojekyll` já está incluído — ele evita que o Jekyll do GitHub
interfira nos arquivos.

### Opção B — workflow do GitHub Actions

Se preferir manter a pasta `mars-ops/` dentro de um repositório maior, use o
workflow em `.github/workflows/deploy-pages.yml` (incluído aqui). Ele vem
**desativado** (só roda à mão, pela aba *Actions*) para não falhar em quem usa
a Opção A. Para ligá-lo: em **Settings → Pages** escolha *GitHub Actions* como
origem, troque o gatilho do workflow por `push: branches: [main]` e ajuste o
`path:` para a pasta onde o site estiver.

### Antes de publicar: carimbe o build

```powershell
node tools/stamp-version.mjs
```

Isso grava a mesma marca em `js/version.js` (que viaja no cache do navegador)
e em `version.json` (lido sempre da rede). O GitHub Pages manda
`Cache-Control: max-age=600`, então **quem já estava com a página aberta
continua com o código antigo por até 10 minutos** — foi exatamente assim que as
primeiras jogadas ficaram sem o tempo de missão registrado.

Com o carimbo, a página detecta a diferença e mostra uma faixa amarela pedindo
`Ctrl + Shift + R`. Recarregar normal não basta: só o recarregamento forçado
ignora o cache dos módulos.

Na prática: publique as alterações **uns 15 minutos antes da aula**, ou peça
`Ctrl + Shift + R` nas máquinas que já estavam abertas.

### Links para a aula

- **Turma:** `https://SEU-USUARIO.github.io/mars-ops/`
- **Você:** `https://SEU-USUARIO.github.io/mars-ops/ranking.html?k=SUA-SENHA`

O jogo não tem nenhum link para o ranking: quem joga não encontra o painel
navegando.

---

## 8. Regras de projeto (para quem for mexer no código)

- **Briefings descrevem a necessidade, nunca o equipamento.** O aluno precisa
  traduzir "a frota precisa saber onde está" em LiDAR, e não ler "compre LiDAR".
- **Nada é bloqueado no planejamento**, exceto frota vazia e orçamento acima da
  tolerância de 10%. Comprar errado é permitido — a consequência aparece na
  simulação e na auditoria.
- **Módulos e infraestrutura são por frota**, não por robô. O braço robótico é
  um módulo e não conta como robô.
- **A cena nunca usa `setTimeout` para encenar.** Tudo passa pelo relógio
  virtual (`scene/core.js`), para que pausa, velocidade e seek funcionem.
- **Só `transform` e `opacity` são animados**, e os loops em CSS leem a variável
  `--spd` para acompanhar a velocidade do player.
- **AGV sem trilho nasce imóvel**: a simulação marca o robô com `immobile`, e a
  cena o coloca no estado `frozen` desde o quadro zero — rodas paradas, farol
  apagado, nenhum deslocamento.
