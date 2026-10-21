# Documentação do Slotiva

- [Aprovação implementada e runbook](APPROVAL_WORKFLOW.md): estados, prazos, API, testes e publicação coordenada.
- [Produto e engenharia v1](SLOTIVA_DOCUMENTACAO_PRODUTO_V1.md): requisitos, decisões, autenticação, modelo de dados, integração, recorrência, operação e critérios de piloto.
- [Diretrizes e Golden Rule](../AGENTS.md): obrigações para toda alteração.
- [Histórico de mudanças](../CHANGELOG.md): entregas e evidências de validação.
- [README do projeto](../README.md): implementação atual e execução.

## Leitura do estado atual

O README atual registra React/TypeScript, Workers e D1, autenticação administrativa por senha e token de reserva mantido em memória. Registra também ocupação atômica por intervalos com triggers SQL. Essa informação foi conferida no README, não por auditoria completa de código nesta entrega.

A documentação v1 nasceu antes dessa leitura e contém alternativas de arquitetura. A inspeção deve partir das garantias existentes; não há decisão de substituir o mecanismo D1 por Durable Objects ou outro banco.

Google login, e-mail temporário, integração Calendar e recorrência são requisitos de evolução, não capacidades já entregues. A regra de profissional único do MVP evoluirá conforme o isolamento e o modelo de negócio forem implementados. Nenhum dado clínico faz parte do escopo.

A versão 0.4.0 implementa aprovação, recusa e expiração com 48h/24h para o profissional único. E-mail, Google e recorrência permanecem pendentes; consultar o runbook acima para limites e migração.
