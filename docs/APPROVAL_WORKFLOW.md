# Aprovação profissional — implementação 0.4.0

## Estado entregue e limites

Implementado em React, Worker TypeScript e D1 para o profissional único do MVP. O profissional ainda usa a autenticação administrativa por senha existente. Google login, Calendar, e-mail transacional, recuperação de acesso por e-mail, múltiplos profissionais e recorrência continuam pendentes. Não é uma liberação do piloto real.

Solicitações públicas exigem 48 horas corridas de antecedência. A criação grava `pending_approval`, uma versão e `approval_expires_at = created_at + 86400` no relógio do banco. A interface exibe o estado pendente e o prazo no horário de Brasília. Ambos os intervalos pendentes e confirmados continuam protegidos pelos triggers de ocupação existentes.

## Transições e endpoints

| Operação | Endpoint | Resultado |
|---|---|---|
| Solicitar | POST /api/bookings | 201; pending_approval, prazo, version e token de gestão |
| Consultar | GET /api/bookings/{id} | Exige X-Cancel-Token; inclui estados terminais |
| Aprovar | POST /api/admin/bookings/{id}/approve | Exige sessão, Origin e JSON {version}; confirma antes do prazo |
| Recusar | POST /api/admin/bookings/{id}/reject | Exige sessão, Origin e versão; libera horário |
| Cancelar | DELETE /api/bookings/{id} ou /api/admin/bookings/{id} | Token de gestão ou sessão profissional; libera horário |
| Alterar pendência | PUT /api/bookings/{id} | Exige token; revalida 48h e mantém o prazo original |

Ações repetidas de aprovação/recusa com o mesmo resultado são idempotentes. Ações concorrentes ou versões desatualizadas têm uma decisão efetiva; conflito retorna 409. No instante exato do prazo a aprovação não é permitida.

Remarcação de reserva já confirmada pelo cliente é bloqueada com 409 e orientação para contatar o profissional. O fluxo completo de proposta de remarcação mantendo a reserva original será uma entrega posterior; não há troca automática que dispense nova aprovação.

A lista administrativa inclui histórico de cancelados, recusados e expirados. O painel e o recibo consultam estados a cada 15 segundos enquanto montados. A autoridade é o backend, não o relógio ou os botões do navegador.

## Expiração, atomicidade e intenções de notificação

`expirePending` usa UPDATE com condição de estado e prazo no banco. Os triggers liberam a ocupação, registram `booking_events` e gravam uma intenção em `notification_outbox` na mesma transação. Uma falha aborta a transição inteira. O mesmo mecanismo atua em requisições de agenda e em execução agendada a cada cinco minutos. Não depende de clientes manterem a página aberta; ao consultar ou tentar aprovar, a limpeza é executada antes da ação.

O job pode ter atraso operacional; a condição SQL impede aprovação vencida mesmo durante uma corrida. Intenções possuem chave única por reserva/tipo/versão. A outbox fica em `awaiting_integration`: **nenhum e-mail, aviso externo ou convite é enviado nesta versão**. Não existe integração Google a validar nesta entrega, portanto a aprovação só considera a disponibilidade interna do MVP.

As transições registram origem, destino, versão e instante; identificação individual do ator depende da futura identidade profissional. Cancelamentos de cliente e administrador ainda usam o mesmo tipo de evento.

## Migração e publicação

`0002_professional_approval.sql` preserva reservas antigas ativas como `confirmed` e canceladas como `cancelled`, sem gerar notificações retroativas. Mantém ocupações existentes. Novas inserções sem prazo correto ou sem antecedência são recusadas também no banco.

**Não aplicar o código novo sobre o esquema antigo nem manter o Worker antigo escrevendo após a migração.** A migração muda o contrato de INSERT/UPDATE. Preparar backup e janela de manutenção: suspender novas escritas, aplicar a migration com acesso autorizado, publicar o Worker correspondente, verificar saúde e fluxo completo em conta de teste e reabrir o atendimento. O Cron só é ativado no deploy da configuração. Esta entrega não aplica migration remota nem publica na Cloudflare.

Como a produção está conectada à main, a mudança é entregue em branch e pull request para coordenar migration e deploy. Não fazer rollback apenas do Worker antigo: ele não satisfaz os novos triggers. Uma reversão exige plano de compatibilidade de dados e esquema, com preservação do histórico.

## Validação

- Integração com Miniflare/workerd e D1 real local: concorrência de reserva e decisões, controles de acesso, versão, prazo, recusa, expiração, repetição e rollback.
- Migração a partir de esquema antigo com reserva ativa e cancelada; nenhuma notificação retroativa.
- Execução agendada testada sem requisição HTTP, inclusive repetição.
- Fronteira exata de 48 horas e recusa no prazo vencido de aprovação.
- Testes de navegador cobrem solicitação, alteração pendente, aprovação, cancelamento e logout; verificações automáticas de acessibilidade e largura no celular.
- Formatação, lint, build e empacotamento Wrangler em dry-run; resultados finais registrados no changelog/PR.
