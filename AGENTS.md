# Diretrizes do Slotiva

## Golden Rule — GitHub é parte da entrega

**TODA MUDANÇA DEVERÁ SER REALIZADA E DOCUMENTADA NO GITHUB. VERSIONAMENTO É TÃO IMPORTANTE QUANTO IMPLEMENTAÇÃO.**

Diretriz do responsável pelo projeto, registrada em 21/10/2026. Aplica-se a código, testes, documentação, configuração, migrações e decisões de arquitetura.

- Trabalhar a partir do estado atual do repositório e preservar mudanças de terceiros.
- Registrar alterações em commits descritivos e publicar no GitHub em branch ou PR adequada. Trabalho apenas local não é entrega concluída.
- Atualizar a documentação afetada junto com a implementação e registrar em CHANGELOG.md o resultado, a validação e limitações relevantes. Decisões estruturais devem ter justificativa em docs.
- Distinguir planejado, implementado, testado e publicado. Não anunciar funcionalidades ou sucesso de deploy sem evidência.
- Executar verificações proporcionais à mudança. Para documentação, revisar conteúdo, links internos e diff; não alegar testes de aplicação não executados.
- Ao concluir, informar referência do commit/PR, o que mudou, validação e pendências. Se o envio ao GitHub falhar, declarar a entrega pendente.
- Nunca versionar segredos, credenciais, dados pessoais de clientes, bancos reais ou logs sensíveis. Documentar configurações externas por nomes e instruções, sem valores secretos.
- Commit/push não autorizam, por si sós, deploy, migrations remotas ou alterações manuais de infraestrutura. Verificar automações existentes e respeitar o escopo autorizado.

## Produto e segurança

Slotiva é produto funcional destinado a clientes reais e também estudo de caso de portfólio. Demonstrações usam dados sintéticos e ambiente isolado.

O README descreve o estado atual. docs/SLOTIVA_DOCUMENTACAO_PRODUTO_V1.md descreve o objetivo e propostas; não substituir garantias existentes por alternativas sem inspeção e justificativa. Preservar atomicidade das reservas no D1, isolamento e autorização em todas as rotas.

Login Google, conexão do Calendar, acesso por e-mail e recorrência são evolução planejada até implementação e validação. O checklist do piloto deve ser cumprido antes de atender clientes reais.
