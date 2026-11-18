-- ============================================================================
-- MARS-OPS — tabela do ranking (Supabase / PostgreSQL)
-- ----------------------------------------------------------------------------
-- Cole este arquivo inteiro no SQL Editor do seu projeto Supabase e rode.
-- Depois preencha supabaseUrl e supabaseAnonKey em config.js.
--
-- Modelo de segurança: o site é estático, então a chave anon fica no navegador
-- do aluno. As políticas abaixo deixam qualquer um INSERIR e LER pontuações,
-- mas ninguém pode APAGAR nem ALTERAR as dos outros. Só você, pelo painel do
-- Supabase, limpa a tabela.
-- ============================================================================

create table if not exists public.marsops_scores (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),

  -- diagnóstico: minuto em que a rodada em curso começou. O ranking NÃO é
  -- filtrado por aqui — a rodada corrente é tudo que veio depois do último
  -- reinício (ver js/net/rounds.js)
  round_id       bigint      not null,

  group_name     text        not null,
  members        text,

  mission_id     text,
  mission_code   text        not null,
  mission_title  text,

  score          integer     not null,
  verdict        text,

  progress        integer,
  fleet_preserved integer,
  process_eff     integer,

  robots_lost    integer,
  total_robots   integer,

  cost_used      integer,
  budget         integer,
  wasted         integer,

  -- memória de cálculo mostrada no painel: parcelas, log de processo,
  -- auditoria, riscos e frota montada
  breakdown      jsonb,

  constraint marsops_score_range check (score between 0 and 1000),
  constraint marsops_group_len  check (char_length(group_name) between 1 and 60),
  constraint marsops_members_len check (members is null or char_length(members) <= 500)
);

create index if not exists marsops_scores_round_idx
  on public.marsops_scores (round_id, score desc);

create index if not exists marsops_scores_created_idx
  on public.marsops_scores (created_at desc);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.marsops_scores enable row level security;

drop policy if exists "marsops insert publico" on public.marsops_scores;
create policy "marsops insert publico"
  on public.marsops_scores
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "marsops leitura publica" on public.marsops_scores;
create policy "marsops leitura publica"
  on public.marsops_scores
  for select
  to anon, authenticated
  using (true);

-- sem políticas de update/delete: ninguém altera nem apaga via API
grant select, insert on public.marsops_scores to anon, authenticated;

-- ============================================================================
-- Marcadores de reinício do ranking
-- ----------------------------------------------------------------------------
-- A rodada vale até o docente apertar "Zerar ranking" no painel, que grava
-- uma linha aqui: tudo anterior sai da classificação e a próxima rodada começa
-- na jogada seguinte. Nada é apagado do banco.
-- ============================================================================

create table if not exists public.marsops_resets (
  id        uuid primary key default gen_random_uuid(),
  at        timestamptz not null default now(),
  by_label  text,

  constraint marsops_reset_label_len check (by_label is null or char_length(by_label) <= 60)
);

create index if not exists marsops_resets_at_idx
  on public.marsops_resets (at desc);

alter table public.marsops_resets enable row level security;

drop policy if exists "marsops reset insert publico" on public.marsops_resets;
create policy "marsops reset insert publico"
  on public.marsops_resets
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "marsops reset leitura publica" on public.marsops_resets;
create policy "marsops reset leitura publica"
  on public.marsops_resets
  for select
  to anon, authenticated
  using (true);

grant select, insert on public.marsops_resets to anon, authenticated;

-- ============================================================================
-- OPCIONAL — limpeza do histórico
-- ----------------------------------------------------------------------------
-- O botão "Zerar ranking" do painel já recomeça a disputa sem apagar nada,
-- então isto aqui não é necessário para a competição funcionar.
-- Rode isto apenas se quiser descartar o histórico antigo:
--
--   delete from public.marsops_scores where created_at < now() - interval '1 day';
--
-- Para zerar tudo (inclusive a rodada atual):
--
--   truncate public.marsops_scores;
-- ============================================================================
