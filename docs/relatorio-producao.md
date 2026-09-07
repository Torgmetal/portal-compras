# Relatório de Produção

A visão geral usa a LPC (sem fallback para LE) e o acumulado de MesOrdem por OP, marca e setor. O filtro de datas das abas detalhadas não recorta essa visão: ele seleciona ordens pela data final e mostra o acumulado dessas ordens, não uma série de produção diária.

O denominador inclui peças da LPC ainda não programadas. Croquis contam no Corte; conjuntos com croquis seguem Montagem, Solda, Acabamento, Jato e Pintura; avulsas seguem Corte, Jato e Pintura. Operações efetivamente apontadas em um setor fora da rota padrão também são consideradas. A quantidade produzida é limitada à quantidade da marca na LPC para evitar avanço acima de 100%.

Cada setor usa seu próprio apontamento: a posição/status da peça e baixas administrativas de uma OP não inventam produção. A execução geral pondera o peso de cada etapa prevista da LPC; se faltam pesos, usa unidades por etapa e identifica o critério. Não é percentual financeiro, horas executadas ou peso físico expedido.

OPs ENCERRADAS/CANCELADAS e OPs com todas as etapas aplicáveis de fabricação concluídas são excluídas da visão geral e das abas/exportações de apontamentos, sem apagar dados. Expedição continua no módulo de logística. Etapa fora da rota aparece como Não se aplica.

O Excel contém Status por OP, Detalhe dos setores e Critérios. Percentuais são células numéricas, com formato percentual. A exportação antiga de todas as ordens avisa se o recorte exceder 20.000 registros em vez de truncar silenciosamente.

A página do relatório deixou de efetuar reconciliação por POST ao abrir. As APIs operacionais continuam disponíveis aos fluxos que as utilizam; a consulta do relatório é somente leitura.

## Planilha de uma OP

Em Visão geral, **Planilha da OP**, abaixo do número, consulta `GET /api/pcp/relatorio-producao?opId=...`. Gera sete abas: Preparação, Montagem, Solda, Acabamento, Jato, Pintura e Expedição. A extração independe do filtro de datas das ordens e representa o acumulado atual. Não altera apontamentos ou baixa peças.

Preparação reconstrói a composição da LPC importada: conjunto em destaque e seus croquis abaixo, com material, descrição, comprimento, quantidades, peso, área e observação. `ConjuntoCroqui.qtdNoConjunto` já representa o total da linha da LPC (não se multiplica pela quantidade do conjunto). A aba acrescenta o preparado do vínculo e da marca na OP, saldo, percentual e último apontamento. Pesos dos croquis já estão incluídos nos conjuntos; não somar os dois níveis.

Croqui compartilhado parcialmente preparado não tem distribuição por conjunto no MES. Nesse caso, o acumulado por marca é informado e a quantidade atribuída ao vínculo fica vazia, com aviso explícito. Quando a marca inteira está preparada, todos os vínculos podem ser confirmados. Não há rateio fictício ou repetição da produção como se pertencesse a cada conjunto.

Montagem a Pintura têm uma linha por conjunto/avulsa, sem croquis. Etapas fora da rota aparecem como Não se aplica. A extração reconhece pertencimento `naLPC` além da origem de importação, preservando marcas compartilhadas com a LE.

Expedição usa a LE importada, sem substituí-la pela LPC. Quantidades de romaneios do portal emitidos e não cancelados, ou de itens de romaneios vinculados à marca, comprovam o embarque. Baixas administrativas aparecem em coluna separada. Sinalizações de arquivo sem quantidade, duplicidade de marca entre frentes ou presença nas duas fontes de romaneio são marcadas para conferência, sem quantidade inventada. A ausência de LE é indicada na própria aba.
