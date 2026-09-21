# Produção integrada — plano de implementação

**Objetivo:** tornar os recursos operacionais existentes acessíveis dentro de Produção, preservando Obra em 3D, dados, permissões e regras de liberação.

**Arquitetura:** navegação por trabalho (visão geral, ordens e peças, programação semanal, execução por setor, materiais e saída). Reutilizar os motores do portal; não criar cópias de regras nem indicadores fictícios. A visão geral organiza as informações por ação necessária, andamento e resultados.

**Escopo implementável nesta entrega:** nova navegação, central de produção com abas funcionais, acesso às ordens/peças e à programação semanal dentro de Produção. Busca de ferramentas para celular/desktop. Qualidade consultada na ficha e em nova consulta paginada por OP (somente leitura, sem tokens de assinatura); estoque, rastreabilidade e expedição por telas existentes.

**Limites explícitos:** nesting industrial, comunicação com máquinas, gestão de retalhos e simulação multissetorial dependem de motores/integrações próprios. Não declarar essas capacidades entregues por mudança de interface.

**Restrições:** não modificar o modelo 3D; não ampliar permissões de mutação; sem alterações de banco; não testar escritas no banco real.

- [x] Criar catálogo de navegação agrupado, pesquisável, sem rotas ocultas.
- [x] Reorganizar painel em prioridades, andamento, resultados e solicitações; corrigir textos que confundem consulta com sincronização ou falta de atualização com parada física.
- [x] Reutilizar ordens do PCP e programação semanal em rotas de Produção, preservando os caminhos antigos.
- [x] Testar navegação, abas, estados vazios e regressão do 3D; validar localmente celular/desktop.
- [ ] Revisar alterações e publicar após validação.

## Validação

- 15 testes passando: central, navegação, leitura de qualidade, menu móvel, ficha e filtro 3D.
- Navegação e layout validados em 320, 390 e 1440 px; estados e ficha com dados controlados.
- GETs reais de ordens, programação semanal e consulta de qualidade responderam 200, sem mutações.
- Linters dos arquivos alterados sem erros.

## Fontes da proposta

- https://www.voortman.net/en/logicsteel/mrp
- https://www.tekla.com/products/tekla-powerfab
- https://support.tekla.com/doc/tekla-powerfab/2025i/go_production_planner

A nova organização aproveita gestão por OP, programação, rastreabilidade e qualidade integrada. Não representa equivalência funcional completa com esses produtos.

Revisão independente concluída sem achados acionáveis de acesso ou regressão no escopo.
