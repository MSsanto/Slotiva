# Slotiva — documentação de produto e engenharia

Versão: 1.0 · Data: 21/10/2026 · Responsável: Matheus Sergio

“Horários livres que viram encontros.”

## 1. Objetivo e status

Construir um produto de agendamento funcional para profissionais que atendem por horário, começando pela validação com um barbeiro e uma psicóloga. O mesmo projeto integra o portfólio como estudo de caso de engenharia e operação real.

Esta documentação registra decisões da conversa e propostas de implementação. Não certifica funcionalidades existentes: o repositório e a infraestrutura não foram auditados nesta entrega. Nenhum cliente real deve ser cadastrado apenas porque este documento foi concluído.

Convenções: **Definido** = requisito acordado; **Proposto** = decisão técnica inicial sujeita a validação; **Pendente** = depende de descoberta ou configuração. As seções técnicas descrevem o comportamento alvo, não o estado atual do código.

## 2. Decisões de produto

| Tema | Decisão | Estado |
|---|---|---|
| Posicionamento | Produto real e projeto de portfólio na mesma base de código | Definido |
| Profissional | Entrada com Google | Definido |
| Cliente | Reserva sem criar conta ou senha | Definido |
| Recuperação de acesso | Link temporário enviado ao e-mail | Definido |
| Identificação | ID interno permanente; e-mail/telefone como contatos | Definido |
| Google Agenda | Inserir reservas e considerar horários ocupados | Definido como objetivo |
| Agenda do cliente | Convite para aceitar na própria agenda | Proposto |
| Recorrência | Suportar séries de agendamentos | Definido |
| Quem cria séries | Inicialmente o profissional | Proposto; validar com a psicóloga |
| WhatsApp | Fora do primeiro escopo | Proposto após discussão de custos |
| Hospedagem | Aproveitar Cloudflare existente, após inspeção | Proposto |
| Pagamentos e prontuário | Fora do primeiro escopo | Proposto |

O login Google não dá automaticamente permissão para acessar o Calendar. A conexão da agenda exige consentimento específico.

## 3. Personas e jornadas

### Profissional

Entra com Google → configura perfil, serviços, duração, expediente e política de cancelamento → conecta uma agenda → revisa disponibilidade → acompanha reservas → bloqueia horários e gerencia séries.

Cada profissional acessa somente seus dados. Entrar com uma conta Google válida não concede papel de administrador nem acesso a cadastros de terceiros. No piloto, o acesso profissional será por convite previamente autorizado; adesão pública depende de decisão posterior.

### Cliente

Abre a página pública do profissional → escolhe serviço e horário → informa nome, e-mail e telefone → confirma → recebe confirmação e convite → gerencia a reserva por acesso temporário.

Depois de sair, fechar o navegador ou trocar de aparelho: abre “Meus agendamentos”, informa e-mail e recebe novo link. Não precisa recordar senha. A resposta na tela não revela se o e-mail tem cadastro.

### Falta de acesso ao e-mail

O profissional trata a recuperação após verificação de identidade por procedimento definido no piloto. Informar telefone, nome ou e-mail não basta para trocar o contato. Registrar a alteração e revogar acessos anteriores; não usar perguntas com respostas públicas.

## 4. Requisitos e critérios de aceitação

| ID | Requisito | Critério verificável |
|---|---|---|
| RF01 | Login profissional Google | Token inválido, expirado ou de outro aplicativo é rejeitado |
| RF02 | Isolamento por profissional | Profissional A não lê nem modifica dados de B, inclusive alterando IDs |
| RF03 | Serviços | Serviço possui nome, duração e estado ativo; preço é opcional |
| RF04 | Disponibilidade | Respeita expediente, fuso, duração, intervalos e bloqueios |
| RF05 | Reserva pública | Cliente reserva sem senha; dados são validados no servidor |
| RF06 | Concorrência | Duas tentativas simultâneas para intervalos sobrepostos geram no máximo uma reserva ativa |
| RF07 | Acesso temporário | Link expirado, revogado ou já consumido não cria nova sessão |
| RF08 | Gestão pelo cliente | Cliente acessa somente o escopo autorizado; regras de cancelamento são aplicadas no servidor |
| RF09 | Integração Calendar | Reserva tem vínculo rastreável com o evento; repetição de envio não duplica evento |
| RF10 | Convite | Destinatário recebe convite com título discreto; entrega e aceitação não são presumidas |
| RF11 | Recorrência | Série possui limite explícito; conflitos são exibidos antes de confirmar |
| RF12 | Alteração de série | Distingue uma ocorrência de esta e as próximas; alterações são auditáveis |
| RF13 | Operação degradada | Falha do Google ou e-mail fica visível e pode ser recuperada |
| RF14 | Portfólio | Demonstração usa dados sintéticos e não expõe registros do piloto |

### Regras de disponibilidade

- Armazenar instantes em UTC e o fuso IANA do profissional, inicialmente America/Sao_Paulo.
- Sobreposição usa intervalos semiabertos [início, fim): um atendimento pode começar quando o anterior termina, salvo intervalo configurado.
- Preço, duração e regras aplicáveis são registrados na reserva para preservar o histórico após alteração do serviço.
- Toda criação ou remarcação revalida disponibilidade no servidor.
- Remarcar deve reservar o novo intervalo e liberar o antigo em uma operação consistente; falha mantém a reserva anterior.
- Definir antecedência mínima, horizonte máximo de reserva, pausas e prazo de cancelamento antes do piloto.

## 5. Autenticação e autorização

### ADR-001 — identidade Google e sessão própria

Adotar integração oficial Google Identity Services. Backend valida assinatura, emissor, audiência e expiração do ID token com biblioteca compatível com o runtime. Aplicar proteção CSRF adequada ao fluxo utilizado; não confiar em token apenas decodificado no frontend.

Vincular identidade por (provider=google, subject=sub), não por e-mail. Criar sessão própria com cookie Secure, HttpOnly e SameSite apropriado. Rotacionar sessão após autenticação; logout revoga a sessão no servidor. Definir duração, renovação e expiração antes de produção. Login, sessão e permissão de acesso ao profissional são verificações distintas.

### ADR-002 — cliente sem senha

Gerar link com token aleatório de alta entropia; armazenar somente hash, propósito, expiração, escopo e consumo. Proposta inicial: validade de 15 minutos e uso único, a validar em testes de usabilidade. Requisição de link tem limite por origem e destinatário e resposta genérica, sem expor existência de cadastro.

O GET do link exibe uma página neutra; o consumo ocorre por ação explícita protegida, reduzindo consumo por scanners de e-mail. Após consumo atômico, criar sessão restrita e redirecionar para URL sem token. Não carregar analytics ou recursos de terceiros na página do token; usar política de referência restritiva e não registrar token em logs.

O acesso deve ser limitado ao profissional e ao cadastro ou reserva autorizados. E-mail compartilhado não justifica reunir cadastros silenciosamente. Se houver ambiguidade, usar acesso a uma reserva específica e resolver o vínculo com o profissional. Contatos não verificados não autorizam anexar histórico existente a uma nova reserva.

### ADR-003 — clientes e contatos

ID interno é imutável. Normalizar telefone com código do país e DDD; validar e-mail sem remover pontos ou sufixos arbitrariamente. Não impor unicidade global a telefone/e-mail: contatos compartilhados e menores são casos possíveis. Correspondências conflitantes não causam fusão nem atualização automática. Deduplicação exige resolução explícita e auditada.

## 6. Google Agenda e agenda do cliente

### Conexão

Fluxo OAuth no servidor, com redirecionamento cadastrado, validação de state e proteção PKCE quando suportada pelo fluxo/biblioteca. Solicitar somente os escopos necessários à agenda selecionada. Credenciais sensíveis ficam no backend, criptografadas em repouso, com chave separada dos dados. Nunca guardar refresh token no navegador ou no repositório.

Acesso offline permite renovar credenciais para sincronização sem sessão aberta; não garante autorização permanente. Tratar revogação, expiração e necessidade de reconectar. Desconectar interrompe sincronização, remove credenciais armazenadas e apresenta claramente o destino dos eventos existentes.

### ADR-004 — fonte de verdade e conflitos externos

Slotiva controla reservas e regras de negócio; Google oferece visualização e ocupações externas. Banco confirma a reserva e registra uma tarefa de sincronização na mesma transação. O envio ao Google ocorre com idempotência e tentativas controladas. Mostrar separadamente “reserva confirmada” e “sincronização pendente/com erro”.

Consultar ocupações externas antes da confirmação e manter reconciliação periódica. Não existe transação atômica entre nosso banco e a agenda Google: uma alteração externa simultânea ainda pode criar conflito. Ao detectá-lo, alertar o profissional e encaminhar resolução; não cancelar nem mover atendimento silenciosamente. Se não houver leitura confiável da agenda, suspender novas confirmações automáticas até recuperar ou obter revisão explícita.

Proposta do piloto: alterações de reservas são feitas no Slotiva. Alterações externas de eventos vinculados são detectadas e apresentadas para reconciliação, sem sobrescrever silenciosamente a reserva. Convites do cliente só são enviados depois de criar com sucesso o evento correspondente.

### Convite ao cliente

Adicionar o e-mail como participante e solicitar envio das atualizações pelo Calendar. O cliente não conecta conta ao Slotiva. Aceitação, exibição automática e notificações dependem do provedor e das configurações do destinatário; não prometer inserção automática universal.

Uma alternativa de exportação ICS pode ser oferecida, explicando que a importação isolada pode não acompanhar mudanças. Não enviar simultaneamente convite e arquivo de importação como se fossem duas reservas. Cancelamentos e alterações precisam preservar identificadores dos eventos e propagar atualizações.

Usar título neutro, sem diagnóstico, relato clínico, motivo da consulta ou dados sensíveis na descrição. Eventos não podem revelar outros participantes atendidos pelo profissional.

## 7. Recorrência

Proposta inicial: profissional cria séries semanais ou quinzenais, com data final ou quantidade e limite máximo configurado. Cliente pode gerir ocorrências autorizadas, mas não cria séries públicas no primeiro piloto.

Gerar ocorrências em horário local e converter individualmente para UTC. Validar todos os intervalos da série contra reservas e ocupações externas antes de confirmar. Proposta: conflito em qualquer ocorrência rejeita a série inteira e apresenta alternativas; não pular sessões sem aviso. Reservar todas as ocorrências atomicamente na fonte interna.

Manter série e ocorrências explícitas no banco. Proposta técnica inicial: eventos individuais vinculados às ocorrências no Google, priorizando simplicidade de exceções; validar custo de chamadas e comportamento de convites antes de adotar. Série nativa do Calendar é alternativa, não decisão implementada.

Operações suportadas: alterar/cancelar somente uma ocorrência; alterar/cancelar esta e as próximas. Preservar histórico passado. Toda mudança coletiva mostra resumo antes de confirmar. Nenhuma série ilimitada no piloto.

## 8. Modelo de dados proposto

| Entidade | Campos essenciais |
|---|---|
| professional | id, display_name, timezone, status |
| identity | id, professional_id, provider, subject, email; unique(provider, subject) |
| service | id, professional_id, name, duration_minutes, price, active |
| client | id, professional_id, name, status |
| client_contact | id, client_id, kind, normalized_value, verified_at |
| availability_rule | id, professional_id, weekday, local_start, local_end |
| schedule_block | id, professional_id, start_at, end_at |
| booking_series | id, professional_id, client_id, recurrence_rule, timezone, end_condition |
| booking | id, professional_id, client_id, service_id, series_id?, start_at, end_at, status, version, service_snapshot |
| calendar_connection | id, professional_id, provider_subject, calendar_id, scopes, encrypted_credentials, status |
| calendar_event_link | booking_id, connection_id, event_id, sync_status, external_version, last_synced_at |
| access_token | id, token_hash, purpose, professional_id, client_id?, booking_id?, expires_at, consumed_at |
| session | id_hash, principal_type, principal_id, professional_id, expires_at, revoked_at |
| outbox_job | id, kind, aggregate_id, idempotency_key, payload, attempt, next_attempt_at, status |
| audit_event | id, professional_id, actor_type, actor_id, action, resource_id, timestamp, correlation_id |

Todas as referências entre dados de negócio devem garantir o mesmo professional_id. Índices cobrem disponibilidade por profissional/intervalo e contatos normalizados. Evitar cascatas destrutivas que apaguem histórico sem política definida.

Status de reserva propostos: confirmed, cancelled, completed, no_show. Estado de sincronização é separado: pending, synced, failed, disconnected. Estado de verificação de contato também é separado.

### ADR-005 — persistência e exclusão mútua

React está definido como objetivo do projeto. Cloudflare Workers + D1 e mecanismo de serialização por profissional são proposta, não stack confirmada por inspeção. Uma consulta de disponibilidade seguida de INSERT sem proteção não satisfaz RF06.

Escolher antes de implementar: serialização de todas as mutações de agenda por profissional (por exemplo, Durable Object, incluindo bloqueios e séries) com recuperação consistente; ou banco com restrição transacional adequada a intervalos. Unique(professional_id, start_at) sozinho não impede sobreposição de serviços com durações diferentes. Demonstrar a garantia com teste concorrente.

## 9. Contrato de API proposto

Prefixo /api/v1; contratos finais serão publicados em OpenAPI após inspeção do backend. Endpoints abaixo são desenho inicial.

| Método e rota | Acesso e finalidade |
|---|---|
| POST /auth/google | Validar credencial e abrir sessão profissional |
| POST /auth/logout | Revogar sessão atual |
| POST /client-access/request | Público; solicitar link com resposta genérica |
| POST /client-access/consume | Consumir token uma vez e abrir sessão restrita |
| GET /public/professionals/{slug}/services | Listar serviços públicos |
| GET /public/professionals/{slug}/availability | Listar horários sem expor nomes ou eventos externos |
| POST /public/professionals/{slug}/bookings | Reservar; chave de idempotência obrigatória |
| GET /client/bookings | Somente reservas do escopo autenticado |
| POST /client/bookings/{id}/reschedule | Remarcar com versão esperada |
| POST /client/bookings/{id}/cancel | Cancelar conforme política |
| GET /professional/bookings | Agenda do profissional autenticado |
| POST /professional/series | Criar série limitada |
| POST /professional/series/{id}/changes | Aplicar escopo occurrence ou following |
| GET /integrations/google/start | Iniciar consentimento autenticado |
| GET /integrations/google/callback | Validar retorno OAuth e vincular conexão |
| DELETE /integrations/google | Desconectar com política explícita para eventos |

Convenções: 201 criação; 202 solicitação de e-mail aceita sem revelar cadastro; 400 entrada inválida; 401 sessão ausente/inválida; 403 ação não permitida; 404 recurso inexistente ou oculto ao solicitante; 409 conflito de horário/versão/idempotência; 429 limite excedido; 503 dependência indisponível quando impedir confirmação segura. Erros contêm código estável e correlation_id, sem detalhes sensíveis. Não confiar em professional_id ou client_id enviados pelo cliente para autorizar acesso.

## 10. Segurança, privacidade e operação

Este produto agenda atendimentos; não é prontuário. Não coletar diagnóstico, notas de sessão nem motivo clínico. Mesmo metadados de atendimento exigem tratamento cuidadoso; evitar exposição em logs, URL, métricas ou portfólio.

Antes de clientes reais: definir aviso de privacidade, responsabilidades entre operador do produto e profissional, finalidade de coleta, retenção, exclusão/exportação, atendimento de solicitações e resposta a incidentes. Essas definições precisam de revisão adequada ao contexto; este documento não constitui análise jurídica.

- Separar desenvolvimento, demonstração e produção, com credenciais e dados distintos.
- Frontend nunca contém segredos. Logs não contêm tokens, contatos completos ou conteúdo privado de eventos.
- Aplicar limites a reserva e envio de links; confirmação de reserva não comprova titularidade do contato informado.
- Proteger sessões, rotas de mutação, validações e alterações de e-mail. Nenhuma integração externa pode desabilitar autorização interna.
- Fazer backup protegido e testar restauração. Proposta de piloto: RPO de 24 horas e RTO de 4 horas, somente após demonstrar capacidade de cumprir e acordar com o profissional.
- Monitorar falhas de autenticação, conflitos, fila de sincronização, e-mails rejeitados e conexões revogadas com correlation_id.
- Tarefas têm limite de tentativas e fila de falhas para intervenção; repetir operação não duplica reserva, convite ou evento.
- Definir responsável e canal de suporte; não prometer disponibilidade permanente sem capacidade operacional.

### Procedimentos mínimos

Google indisponível: sinalizar desconexão/atraso, preservar reservas, pausar confirmações que dependam de disponibilidade externa, retentar e reconciliar. E-mail indisponível: não exibir token ao público; registrar pendência e permitir reenvio controlado. Suspeita de vazamento: revogar sessões/credenciais afetadas, preservar evidências sem expor conteúdo e acionar responsáveis. Restauração: validar integridade e reconciliar eventos externos antes de reabrir reservas.

## 11. Plano de implementação

| Etapa | Entrega | Condição de saída |
|---|---|---|
| 0 — diagnóstico | Inspecionar repositório, stack, banco, deploy e testes existentes | Mapa de diferenças entre estado atual e documento |
| 1 — identidade | Google login, sessão e autorização por profissional | Testes de tokens e isolamento aprovados |
| 2 — reservas | Serviços, disponibilidade, bloqueios e reserva sem conta | Concorrência e remarcação atômica demonstradas |
| 3 — cliente | E-mail transacional, link temporário e recuperação | Uso único, expiração, abuso e escopo validados |
| 4 — Calendar | OAuth, eventos, convites, fila e reconciliação | Revogação, indisponibilidade e repetição testadas |
| 5 — recorrência | Série limitada e exceções | Conflitos e mudança de próximas sessões testados |
| 6 — piloto | Operação assistida com profissionais e clientes reais | Checklist abaixo atendido e aceite registrado |

Não há estimativa de prazo fechada até concluir a etapa 0. Não há deploy ou alteração de infraestrutura autorizada implicitamente por esta documentação.

## 12. Testes e liberação do piloto

- [ ] Token Google falso, expirado e com audiência errada são rejeitados.
- [ ] Profissional não autorizado não recebe acesso administrativo.
- [ ] Alterar IDs não permite acesso entre profissionais nem entre clientes.
- [ ] Links expiram, são consumidos atomicamente e resistem a repetição e scanners.
- [ ] E-mails/telefones compartilhados ou conflitantes não juntam históricos.
- [ ] Reserva simultânea e intervalos parcialmente sobrepostos não geram duplicidade.
- [ ] Cancelamento e remarcação respeitam prazo e mantêm consistência sob falha.
- [ ] Fuso, limites de expediente, pausas e duração são respeitados.
- [ ] Série conflitante não é criada parcialmente; exceções mantêm histórico.
- [ ] Tentativas repetidas de sincronização não duplicam eventos nem convites.
- [ ] Cliente recebe convite; aceitação e mudança/cancelamento são verificados em contas de teste.
- [ ] Revogação Google, falha de envio e alteração externa têm recuperação testada.
- [ ] Backup restaurado em ambiente isolado; operação e suporte definidos.
- [ ] Avisos, retenção e responsabilidades de dados revisados para o piloto.
- [ ] Fluxo utilizável no celular, teclado e leitor de tela; erros claros.
- [ ] Demo sem dados reais e sem acesso a credenciais de produção.
- [ ] Profissional valida fluxo completo com dados fictícios antes de convidar clientes.

## 13. Custos e viabilidade

Login Google direto não pressupõe assinatura de um provedor de autenticação. Uso padrão da API Calendar é informado pelo Google como sem custo adicional, sujeito a cotas. Workers possui plano gratuito e pago a partir de US$ 5/mês, com excedentes. Esses preços não incluem todos os serviços de banco, coordenação, filas, e-mail, domínio ou suporte.

A faixa anteriormente discutida de R$ 0–40/mês é hipótese de hospedagem inicial, não orçamento completo nem garantia operacional. Acesso sem senha depende de e-mail transacional: escolher fornecedor, configurar remetente e autenticação de domínio, testar entrega e conferir preços. Conversão cambial, impostos e eventual plano pago variam. Revisar custos após definir a arquitetura e medir consumo. WhatsApp permanece fora desta estimativa.

## 14. Pendências de descoberta

1. Barbeiro atende sozinho? Psicóloga atende menores ou usa contatos de responsáveis?
2. Cliente escolhe horário fixo recorrente ou só a profissional cria séries?
3. Quais serviços, durações, pausas, prazos e limites de reserva?
4. Qual agenda Google será conectada e quais outras precisam bloquear disponibilidade?
5. Qual comportamento desejado para alterações feitas diretamente no Google?
6. Quem paga infraestrutura, responde suporte e administra o produto?
7. Qual domínio/remetente de e-mail e qual política de dados para o piloto?
8. Quais funcionalidades, migrations e proteções já existem no repositório?

## 15. Portfólio e evidências

Manter uma base de código e separar ambientes/dados. Publicar estudo de caso com problema, decisões, arquitetura, testes e resultados autorizados. Não divulgar nomes de clientes, agendas, contatos, capturas de atendimentos ou métricas identificáveis. Uso real só deve ser declarado depois de ocorrer; não usar “100% funcional” como substituto de evidências de aceitação.

Indicadores propostos: conclusão de reservas, conflitos impedidos, tempo de sincronização, falhas de e-mail e solicitações de suporte. Coletar somente o necessário e publicar apenas agregados autorizados.

## 16. Referências oficiais

Consultadas durante a conversa; confirmar requisitos e preços na implementação:

- Google Identity Services: https://developers.google.com/identity/gsi/web/guides/overview
- Validação de ID token: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- OAuth servidor e acesso offline: https://developers.google.com/identity/protocols/oauth2/web-server
- Cotas Calendar: https://developers.google.com/workspace/calendar/api/guides/quota
- Cloudflare Workers: https://developers.cloudflare.com/workers/platform/pricing/

## 17. Histórico

v1.0 — consolida produto real com demonstração de portfólio, acesso Google profissional, cliente sem senha, acesso por e-mail, integração de agenda, recorrência e critérios de piloto. Documento preparado sem alteração de código ou publicação.
