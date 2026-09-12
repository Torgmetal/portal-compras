---
name: torg_montagem_solda
description: "Portal Compras Torg — fluxo montagem→solda: planejamento marca o dia por conjunto, PCP imprime, e a fila da solda sugere bancada"
metadata:
  type: project
---

**Fluxo desenhado pelo Vitor em 01/09/2026:** planejamento libera os conjuntos e marca o dia da montagem → PCP imprime os conjuntos para o líder da fábrica → o que saiu da montagem cai numa fila para escolher a bancada da solda.

**1. Aba "Montagem — conjuntos" dentro de `/planejamento/datas-setor`** (`MontagemConjuntos.jsx`) — o dia de início da montagem, **por conjunto**.

⚠️ **NÃO é tela própria.** Fiz primeiro em `/planejamento/montagem`, no menu, e Vitor corrigiu: *"não era isso, queria dentro da aba de datas por setor"*. A tela solta obrigava a escolher a obra de novo e deixava a data longe do marco do cronograma que a justifica. São duas abas na OP já selecionada: "Liberar para o PCP" e "Montagem — conjuntos". A data sugerida é o **marco do cronograma** do setor MONTAGEM, não hoje.

⚠️⚠️ **`GET /api/planejamento/montagem?opId=` filtra por `opId`, nunca por número.** A tela trabalha com a OP-mãe ("103") e a LPC grava a sub-obra em `opNumero` ("T103") — ver [[torg_pecaconjunto_opnumero]]. Medido na OP-103: por `opId` vêm T103 e 103 juntas (43 conjuntos); por número viria metade da obra. Vitor: *"será por conjunto que tenha todas as sub peças prontas para iniciar a montagem"*. Campos `montagemDiaProgramado` / `montagemDiaOriginal` / `montagemAdiado` na `PecaConjunto`, com a mesma regra do corte ([[torg_programacao_dia]]): o dia se move ao adiar, o **original nunca**.

⚠️⚠️ **A PRONTIDÃO NÃO TRAVA O PLANEJAMENTO.** Fiz primeiro o contrário — só deixava programar conjunto com todos os croquis cortados — e Vitor corrigiu: *"para a liberação da montagem no planejamento não precisa estar com os croquis prontos para ele liberar, apenas colocar para poder lançar para o PCP"*. Isso invertia quem decide: **o planejamento marca a data olhando o cronograma, e o corte corre atrás.** Na aba a prontidão é só informação — ordena a lista (mais cortado primeiro) e aparece no cartão, mas não separa, não esconde e não impede seleção.

⚠️⚠️ **QUEM EXIGE 100% É O PCP, não o planejamento.** Vitor: *"lá na página do pcp sim precisamos ter uma forma para podermos liberar os conjuntos de montagem somente com os croquis que estiverem 100% prontos"*. `POST /api/producao/pecas/liberar-montagem` confere no **servidor** (aba aberta desde ontem mandaria conjunto com croqui na máquina) e devolve os bloqueados **nomeados, com quanto falta** — "23 ignorados" manda o PCP procurar no escuro. **Isso substitui a regra da metade nesta liberação**: o rótulo "pode montar" (≥ metade, decisão de 12/06 em [[torg_fila_corte]]) segue na tela como leitura do estado, mas não é mais o que se seleciona para descer. Medido em 01/09: dos 26 conjuntos em CORTE, 23 estão 100% e nenhum está no grupo só-≥metade.

⚠️ `calcularProntidao` mora em **`lib/prontidao-conjunto.js`** (saiu de dentro do `MontagemClient`) — a rota confere de novo no servidor, porque a regra que decide se a fábrica pode montar não pode morar só no navegador.

⚠️ **30 conjuntos não têm croqui vinculado** → prontidão não medível, e sumiriam da tela para sempre. Aparecem num grupo próprio, selecionáveis.

**2. Impressão** — botão "Imprimir conjuntos" na tela de Montagem, reusando a emissão carimbada + GRD do setor MONTAGEM ([[torg_desenho_rastreado]], [[torg_grd_desenhos]]). **Uma chamada por OBRA**: a rota do lote é por OP e a seleção atravessa obras.

**3. `/pcp/fila-solda`** — entra quem teve a montagem apontada como concluída **no Syneco**, não por clique. As **bancadas saem do próprio Syneco** (`MesOrdem.setor="Solda"` → SOLDA 1..10; filtrar o `"---"`), nunca de cadastro novo.

⚠️⚠️ **A bancada é SUGESTÃO, não ordem.** Vitor escolheu explicitamente *"só registra a intenção"* — quem manda na bancada é o líder no chão. **Não medir aderência** contra `soldaBancada`: transformar a anotação em cobrança seria mudar a regra sem avisar quem trabalha.

⚠️ **`/pcp/solda` ≠ `/pcp/fila-solda`.** A primeira é a "Programação de Solda" (`SetorClient`: quem ESTÁ no setor, com furo de apontamento) e **já existia**; a segunda é a fila de entrada. Eu sobrescrevi a primeira por engano — ver [[torg_nao_sobrescrever_arquivo]].

Medido em 01/09: 2.218 conjuntos de obras vivas, 1.497 já montados, **60 prontos para programar** (11,5 t), 541 parciais — o corte é o gargalo. **83 conjuntos** com montagem concluída e solda aberta (13,1 t).
