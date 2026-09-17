---
name: torg_apontamentos_syneco_planilha
description: Planilha "Apontamentos para o Syneco" — o que o portal deu baixa (baixaSetores) e o Syneco ainda não tem, por marca e setor; em Produção › Meu trabalho (todas as obras) e em Peças › OP › setor (só aquele setor)
metadata:
  type: project
---

**Onde:** `Produção › Meu trabalho` ("Hoje na fábrica", `components/producao/MinhaFila.jsx`) tem o botão
*Planilha p/ Syneco* no cabeçalho, ao lado de *Modelo 3D* — gera a planilha do SETOR escolhido no posto.
`Produção › Gestão das OPs` (`PainelProducaoClient`, aba Visão geral) tem o card com o total de todas as
OPs vivas e o botão *Planilha para o Syneco*. Em `Produção › Peças › OP › setor`, o botão
*Apontamentos p/ Syneco* ao lado de *Exportar seleção* gera só daquela OP e setor.
⚠ `/producao` renderiza `MinhaFila`, NÃO `PainelProducaoClient` (que é o /producao/gestao) — errei
isso na primeira entrega e o Vitor não achou o botão. Lib `lib/apontamentos-syneco.js`, rota
`/api/producao/apontamentos-syneco?opId&setor`, planilha no padrão Torg (`criarExcelTabular`).

**Why:** Vitor (14/09/2026): "precisamos ter uma forma de exportar a planilha de Apontamentos para ser
corrigido no Syneco, onde poderíamos colocar isso?". A baixa do portal só adianta; o Syneco é o
registro oficial (cronograma do cliente, PDF e portal do cliente leem de lá). Já existia a "Baixa
Syneco" no Gantt do PCP, mas por marcas selecionadas — o encarregado não vive no Gantt.

**How to apply:**
- Linha = baixa do portal (limitada à qte da marca; sem `qtd` = marca inteira) − produzido no Syneco no
  setor (`mesOrdem` por `whereSetorSyneco`); só saldo > 0. Obra vai no código SKA (`opNumero` da LPC).
- Medido em 14/09: 3.496 marcas / 14.855 peças em 4 obras (067: 8.694 croquis de corte baixados em
  agosto como "fora do escopo — já fabricada"). Quando o Syneco recebe o lançamento, a linha some no sync.
- Relacionado: [[torg_syneco_apontamento_fonte]], [[torg_pecaconjunto_opnumero]], [[torg_baixa_etapa_anterior]].

## ⚠⚠ SÓ BAIXA DE SETOR — romaneio, terceiro e fechamento administrativo ficam de fora (17/09/2026)

Vitor: *"vc esta trazendo algumas informações sem sentido, informações de romaneio, enfim está bem
ruim"* → *"somente dos setores para podermos baixar as peças"*.

A planilha lia TODA linha de `baixaSetores`. Medido no banco no mesmo dia: das **3.527** baixas,
**3.504 não eram produção de ninguém no chão de fábrica** — 1.723 `porNome: "Romaneio importado"`
(a peça já embarcou, a baixa nasceu da importação do FORM-22), 1.280 com
`motivo: "preparação encerrada — nada mais a cortar nesta obra"` (fechamento em massa do corte),
456 `"Guarda-corpo — fabricação no terceiro"` (fabricada FORA: não existe operação para lançar) e
45 `"Fora do escopo — já fabricada (Vitor)"`. Sobravam 23 baixas reais, escondidas atrás de 3.503
linhas de ruído; depois de subtrair o que o Syneco já tem, a planilha sai com **8 linhas**.

- `ehBaixaDeSetor(bx)` (`lib/apontamentos-syneco.js`) é o portão: recusa pelo `motivo` de fechamento
  e pelo `porNome` de importação/terceiro. ⚠ A regra mora no VALOR GRAVADO, não numa rota — nenhum
  código vivo escreve esses nomes (são scripts/importações históricas), e uma importação nova de
  romaneio volta a cair no filtro sozinha. Baixa em lote feita por uma PESSOA (`lote: true` com
  motivo de produção) continua valendo.
- `obraDoSyneco(opNumero, obrasDaOP)`: a coluna **Obra (Syneco)** mostrava `083` em 724 linhas — o
  número do PORTAL, que não existe do lado de lá ([[torg_pecaconjunto_opnumero]]). Agora só sai
  código `T\d+[A-Z]*`; na falta dele, a obra que o Syneco tem para aquela OP (quando é uma só), e
  senão `—`. ⚠ `MesOrdem.obra` é NOT NULL: um `{ not: null }` no `groupBy` invalida a consulta
  inteira e o `catch` devolvia lista vazia calada.
- A planilha passou a ordenar por **setor** primeiro (ela é trabalhada setor a setor).

## A 2ª aba: apontamento na frente manda dar baixa atrás (17/09/2026)

Vitor: *"antes tínhamos uma planilha que pegava esses furos de apontamentos, exemplo: se a peça
estava apontada na pintura já indicava que tinha que dar baixa nos setores anteriores que não foram
dado baixa"*. A planilha passou a ter **duas abas**, que são duas ORIGENS diferentes:

| Aba | De onde vem | Hoje |
|---|---|---|
| **Baixa do portal** | alguém baixou no portal, o Syneco não tem (`baixaSetores`) | 8 linhas |
| **Setores anteriores** | o próprio Syneco: peça apontada à frente prova que passou atrás | 1.090 linhas · 4.366 peças · 146 t |

`lib/baixa-etapa-anterior.js` (`lancamentosAtrasados` é puro), cadeia
`Corte → Preparação → Montagem → Solda → Acabamento → Jato → Pintura`. Regra de
[[torg_baixa_etapa_anterior]]. As travas, todas com teste:

- ⚠⚠ **só é alvo o setor que TEM ordem no Syneco.** Etapa sem ordem não é "zero apontado", é peça
  que não passa por ali — sem isso, toda chapa que pula a Preparação viraria linha falsa.
- ⚠ **Acabamento nunca é cobrado** (opcional; mesma regra de `lib/conjuntos-setor.js`).
- ⚠ **terceiro e encaminhamento cortam a cadeia**: quem volta do terceiro no Jato não deve nada à
  Montagem. Terceiro **sem destino** ou com destino EXPEDIÇÃO fica FORA — melhor não listar do que
  mandar lançar etapa que talvez não tenha acontecido.
- ⚠ **teto no `planejadoUn`** da própria ordem; **inativo sem produção** (MesInativo) é feito fora.
- ⚠ A **prova** é o setor MAIS ADIANTADO com apontamento (empate vai para o mais à frente): "chegou
  na Pintura" convence mais que "chegou no Jato".
- Distribuição hoje: Preparação 524, Jato 518, Corte 24, Solda 16, Montagem 8; OPs 083, 067 e 089
  concentram 78%.
