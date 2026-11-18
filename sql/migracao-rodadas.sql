-- ============================================================================
-- MIGRAÇÃO — botão de zerar o ranking
-- ----------------------------------------------------------------------------
-- Rode este arquivo no SQL Editor do Supabase se você já tinha criado a tabela
-- marsops_scores pelo schema.sql antigo. Quem for configurar do zero não
-- precisa dele: o schema.sql atual já cria tudo.
--
-- O que muda: a rodada deixou de ser uma fatia fixa do relógio e passou a
-- valer até o docente zerar o ranking pelo botão do painel, que grava um
-- marcador aqui.
--
-- Nada é apagado: zerar o ranking só move o corte para frente. As pontuações
-- antigas continuam no banco para consulta.
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

-- sem políticas de update/delete: o histórico de reinícios é só de ida
grant select, insert on public.marsops_resets to anon, authenticated;
