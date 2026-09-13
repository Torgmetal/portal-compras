# Remodelação operacional da Produção

Pedido: substituir o conteúdo e a organização da Produção; preservar consulta 3D.

A entrada passa a ser uma carteira de OPs na ordem definida pelo Planejamento. Cada etapa abre suas peças, quantidades e saldo. Uma OP selecionada mantém o contexto ao consultar execução, material/R, qualidade e romaneios. Carga da preparação mostra demanda em kg, meta do setor e ritmo medido separadamente. O usuário pode buscar marcas, filtrar pendências, consultar desenhos/ficha e registrar baixa com quantidade explícita pelo endpoint já auditado.

Regras: marcas não são unidades; produção manual e Syneco usam máximo, não soma; ausência de informação não prova impedimento; recebido não significa disponível em estoque; prazo de etapa não é entrega contratual; filtros de lote e etapa aparecem na tela. Nenhuma nova regra de roteamento ou escrita no MES. Nenhuma alteração no visualizador 3D. Não alterar dados reais durante validação.

Implementação: helpers com testes; nova interface por OP; API mínima de romaneios; carga e materiais; navegação enxuta; testes de troca de contexto e filtros; dev local desktop/mobile; revisão independente e publicação após validação.

## Entrega e validação

- Carteira, execução, materiais/R, inspeções e romaneios substituem as telas de entrada anteriores. OPs históricas têm consulta sem apontamento.
- Agenda de lotes mostra dia, recurso, quantidade, saldo e datas solicitadas pelo Planejamento. Ferramentas especializadas de bancadas, importação e PMP continuam acessíveis na agenda.
- Conciliação de etapa anterior é separada de trabalho a executar. Zero reverte a baixa existente. Nenhuma alteração nas regras/API de apontamento do MES.
- 18 testes focados aprovados: quantidades, filtros, troca de OP, confirmação, reversão, histórico, API, navegação mobile e status 3D. ESLint de referências e diff check aprovados.
- Dev iniciado por npm run dev na porta 3005; validação posterior usou cache isolado para não conflitar com servidor do usuário na porta 3000.
- GETs reais de carteira, despacho (OP112,133 registros), catálogo de OPs, qualidade, romaneios, carga e Gantt: HTTP200. Dados destas leituras reutilizados como fixtures no navegador, sem escritas reais.
- Chrome em 320/390/1440px: execução, materiais, qualidade, romaneios, carga e agenda sem erros JS ou overflow da página. Resumo da OP recolhido para priorizar peças no celular.
- Revisão independente corrigiu avanço de etapa, reversão, acesso histórico, unidade da carga e bloqueio de alterações históricas.
