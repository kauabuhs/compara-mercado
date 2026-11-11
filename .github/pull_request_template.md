## O que muda e por quê

<!-- Uma ou duas frases. Link para a issue/ADR, se houver. -->

## Como testar

<!-- Passos ou comandos. Para telas, anexe captura (celular e desktop). -->

## Definition of done

- [ ] Testes novos ou ajustados passando no CI
- [ ] Migração revisada e, se necessário, reversível ou com plano de rollback
- [ ] Nenhum segredo ou dado pessoal no código ou nos logs
- [ ] Documentação e ADR atualizados
- [ ] Mudança arriscada atrás de feature flag

## Se mexe no banco

- [ ] Nova tabela com RLS **ativada** e política explícita (negar por padrão)
- [ ] Teste pgTAP cobrindo a política
- [ ] `pnpm db:types` rodado

## Se mexe na UI

- [ ] Funciona a partir de 360 px, com alvos de toque ≥ 44 px
- [ ] Estados vazio, erro e carregamento desenhados, em português
- [ ] Contraste/foco/leitor de tela conferidos (WCAG AA), claro e escuro
