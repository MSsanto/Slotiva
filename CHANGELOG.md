# Change history

Este arquivo começa em 21/10/2026. O histórico anterior permanece nos commits do Git; não é reconstruído nem rotulado como release sem evidência.

## 0.4.0 — aprovação profissional implementada (2026-10-21)

- Novas solicitações pendentes, 48h de antecedência e prazo fixo de 24h para aprovação; controles no Worker e nos triggers D1.
- Painel com aprovação/recusa autenticadas, versões contra decisões concorrentes e repetição segura; cliente consulta status com token.
- Expiração atômica na agenda e em Cron de cinco minutos, liberação de ocupações, histórico e outbox de intenções sem remetente ativo.
- Migração 0002 preserva reservas anteriores e suas ocupações. README e runbook documentam publicação coordenada; não há migration remota ou deploy nesta entrega.
- Alteração de pendências mantém prazo original. Remarcação de reservas confirmadas exige contato com o profissional até a implementação da proposta de remarcação.
- Validação local: formatação, lint, teste de frontend, 19 testes Worker/regra temporal, build, migration D1 local e Wrangler dry-run aprovados.
- E2E atualizado para aprovação; execução local bloqueada antes de abrir a aplicação por ausência de Chromium e falha no download do navegador. Wrangler dev também encontra erro de enumeração de interfaces neste ambiente; o Worker foi exercitado em Miniflare/workerd. Validação E2E deve ocorrer no CI antes do merge.
- Limites: Google login/Calendar, e-mail, recorrência e múltiplos profissionais continuam pendentes. Outbox em awaiting_integration não significa notificação enviada. Checklist de clientes reais não foi liberado.

## 2026-10-21 — approval review and version-safe retries

- Reviewed the existing approval implementation in PR #2 rather than duplicating
  work already published on its branch.
- Fixed approve/reject replay handling: only the version immediately preceding
  the same decision is accepted as a successful retry. Stale/arbitrary versions
  now return 409 without generating another notification intent.
- Added regression coverage for stale replay after a pending edit, concurrent
  customer edit versus approval, and rollback of status/audit/occupancy when
  outbox insertion fails.
- Fixed the browser fixture's time-of-day dependency: two adjacent half-hour
  starts overlap a 30-minute service plus its buffer. The fixture now selects
  at least three available starts so its edit target is separate from the hold.
  Status assertions are scoped to the receipt, independently of the page banner.
- Published the current approval runbook in English; clarified legacy session
  behavior, actual accessibility test coverage and separation from PR #1's
  incompatible shared Preview database.
- Validation: 22 Worker/rule tests and one frontend unit test passed locally.
  Formatting, lint, build and Wrangler dry-run also passed. Chromium download
  failed locally (invalid/truncated archive); browser validation runs in GitHub CI.
  Extended the browser journey to keep the customer receipt open while a second
  tab approves and cancels, checking live status refresh and permitted actions.
- No remote migration, production deploy or real-customer release performed.
  Google identity/Calendar, notification delivery and confirmed reschedule
  proposals remain separate work. Historical entries below retain their original
  wording; the current implementation runbook is maintained in English.

## 2026-10-21 — prazos aprovados para o piloto

- Documentação v1.2: antecedência mínima de 48 horas corridas para solicitação pública; aprovação em até 24 horas corridas desde a criação.
- Expiração libera o horário e enfileira aviso ao cliente, sem convite; definidos limites temporais e disputa aprovação/expiração.
- Removida a pendência do prazo na regra atual; registros históricos anteriores foram preservados.
- Validação documental: consistência das regras atuais e exemplos de fronteira revisados. Implementação, testes de aplicação e deploy não realizados nesta alteração.

## 2026-10-21 — aprovação profissional e convite após confirmação

- Atualizada documentação para v1.1: solicitações começam em pending_approval; somente o profissional confirma.
- Documentados aprovação/recusa, convite Google após aprovação e recuperação de falhas sem duplicidade.
- Retenção temporária, expiração e remarcação pendente registradas como propostas; prazo depende do piloto.
- Validação: revisão das regras e transições documentais e referência oficial Calendar Events.insert. Implementação e testes de aplicação continuam pendentes.

## 2026-10-21 — documentação de produto e governança

- Adicionada documentação v1 com requisitos para produto real e portfólio, login Google profissional, acesso temporário por e-mail, Calendar e recorrência.
- Registrada Golden Rule no AGENTS.md: toda mudança precisa de implementação e documentação no GitHub; versionamento faz parte da entrega.
- Adicionado índice com distinção entre implementação atual e evolução planejada; preservadas as garantias D1 descritas no README.
- Atualizado README com links para requisitos e governança.
- Validação: revisão do diff, git diff --check e verificação dos links Markdown relativos dos arquivos alterados. Testes de aplicação não executados: mudança exclusivamente documental.
- Limitações: nenhuma funcionalidade, migration ou configuração de infraestrutura foi alterada. Prontidão para clientes reais depende de implementação e critérios do piloto.
