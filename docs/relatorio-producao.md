# Relatório de Produção

A visão geral usa a LPC (sem fallback para LE) e o acumulado de MesOrdem por OP, marca e setor. O filtro de datas das abas detalhadas não recorta essa visão: ele seleciona ordens pela data final e mostra o acumulado dessas ordens, não uma série de produção diária.

O denominador inclui peças da LPC ainda não programadas. Croquis contam no Corte; conjuntos com croquis seguem Montagem, Solda, Acabamento, Jato e Pintura; avulsas seguem Corte, Jato e Pintura. Operações efetivamente apontadas em um setor fora da rota padrão também são consideradas. A quantidade produzida é limitada à quantidade da marca na LPC para evitar avanço acima de 100%.

Cada setor usa seu próprio apontamento: a posição/status da peça e baixas administrativas de uma OP não inventam produção. A execução geral pondera o peso de cada etapa prevista da LPC; se faltam pesos, usa unidades por etapa e identifica o critério. Não é percentual financeiro, horas executadas ou peso físico expedido.

OPs ENCERRADAS/CANCELADAS e OPs com todas as etapas aplicáveis de fabricação concluídas são excluídas da visão geral e das abas/exportações de apontamentos, sem apagar dados. Expedição continua no módulo de logística. Etapa fora da rota aparece como Não se aplica.

O Excel contém Status por OP, Detalhe dos setores e Critérios. Percentuais são células numéricas, com formato percentual. A exportação antiga de todas as ordens avisa se o recorte exceder 20.000 registros em vez de truncar silenciosamente.

A página do relatório deixou de efetuar reconciliação por POST ao abrir. As APIs operacionais continuam disponíveis aos fluxos que as utilizam; a consulta do relatório é somente leitura.
