/* ============================================================================
   CONFIGURAÇÃO — o único arquivo que você precisa editar para publicar
   ----------------------------------------------------------------------------
   1. Crie um projeto gratuito no Supabase (https://supabase.com).
   2. No SQL Editor, rode o conteúdo de sql/schema.sql.
   3. Em Project Settings → API, copie "Project URL" e a chave "anon public".
   4. Cole as duas abaixo e suba o projeto para o GitHub Pages.

   A chave "anon" é pública por natureza (fica no navegador do aluno). A
   segurança vem das políticas RLS do schema: qualquer um pode inserir e ler
   pontuações, ninguém pode apagar ou alterar as dos outros.
   ========================================================================== */

export const RANKING_CONFIG = {
  /** Ex.: 'https://abcdefghijklm.supabase.co' — sem /rest/v1 e sem barra no final. */
  supabaseUrl: 'https://qcwnxqysdjhvujwohoqr.supabase.co',

  /**
   * Chave pública do projeto, em qualquer um dos dois formatos:
   *   - nova:    sb_publishable_...  (Project Settings → API Keys)
   *   - legada:  eyJhbGciOi...       (a antiga chave "anon public")
   * Nunca use a chave secreta (sb_secret_… / service_role): ela ignora as
   * políticas de segurança e aqui ela ficaria visível para a turma inteira.
   */
  supabaseAnonKey: 'sb_publishable_MWz6ThkLc7XMkxeqlVGU7A_dL106RWS',

  /** Nome da tabela criada pelo schema.sql. */
  table: 'marsops_scores',

  // A rodada não tem prazo: ela vale até você apertar "Zerar ranking" no
  // painel. Até lá, todas as jogadas disputam a mesma classificação.

  /**
   * Senha do painel de ranking, em SHA-256 (hex).
   * A senha em texto não fica no repositório: guarde-a com você.
   *
   * Para trocar, gere o hash da senha nova. No navegador (F12 → Console):
   *   crypto.subtle.digest('SHA-256', new TextEncoder().encode('SUA-SENHA'))
   *     .then(b => console.log([...new Uint8Array(b)]
   *       .map(x => x.toString(16).padStart(2,'0')).join('')));
   *
   * Isto é uma cortina para a turma não abrir o painel por curiosidade, não um
   * cofre: em site estático qualquer segredo no cliente é legível.
   */
  rankingPasswordHash: 'a03123164d096c43cc01a6e50400fae358953e84e0412c911c49827f07677549',

  /** Intervalo de auto-atualização do painel de ranking, em segundos. */
  refreshSeconds: 15,

  /** Quantos lugares ganham destaque de pódio. */
  podiumSize: 4,
};
