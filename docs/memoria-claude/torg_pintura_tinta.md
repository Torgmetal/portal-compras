---
name: torg_pintura_tinta
description: Portal Compras — pintura mede em m² (não kg); PLP dá demãos/cor/SV; caderno de 3 folhas sai da barra do Gantt; FEFO na tinta; o que ainda impede afirmar falta
metadata: 
  node_type: memory
  type: project
  originSessionId: 3eab059d-15a2-4872-a325-5e90f443c4e3
  modified: 2026-09-07T19:31:33.272Z
---

**Pintura e jato se medem em SUPERFÍCIE, não em peso.** `PecaConjunto.areaPinturaM2` é a área
**TOTAL da linha** (já × qte — o parser da LPC soma quando a marca repete); 89% preenchida. Na fila
a relação vai de **5 a 46 m²/t** conforme a peça — programar por kg trata chapa fina e perfil pesado
como iguais. Acabamento fica fora: rebarba segue o peso.

**O PLP (`PlanoPintura`, 1 por OP) responde quase tudo:** demãos (JSON, com produto, espessura,
diluição, secagem), `itens` = **cor por TIPO DE ESTRUTURA** (não por demão — na 067 plataforma é
preto e guarda-corpo é amarelo, no mesmo sistema).

**A demão é tempo de CALENDÁRIO, não de trabalho** — entre demãos a peça seca ocupando o galpão
(8 h no PLP da 094). `diasDePintura` = teto(kg÷meta) + (demãos−1). Lote de 3 demãos leva 3 dias
mesmo cabendo num.

**Folha do pintor sozinha (15/10/2026, `d18c3920`):** botão "Folha do pintor (Excel)" no quadro do PLP da **aba
Qualidade da OP** — só a folha 3, da OP inteira, com valores CALCULADOS (`lib/pintura-folha-pintor.js`, mesma conta
úmida = seca×(100+dil)÷SV), dizendo o que falta no PLP. Vitor: "as demais páginas apenas na produção". A rota
`/api/pcp/pintura` passou a aceitar COMERCIAL.

**⚠⚠ ESQUEMA POR ESTRUTURA (15/10/2026, `de32fe5b`, `lib/plp-esquema.js`).** Vitor: "a tinta amarela recebe o
primer e depois o acabamento amarelo, assim como a azul — no PLP isso não está claro". O PLP guarda demãos e cores
por item SEM ligação. Regra: **demãos de mesmo número são ALTERNATIVAS e a cor do item escolhe**; demão sem
alternativa (primer) vale para todos. Demãos por peça = números distintos (OP-094: 2, não 3). Tinta de cada
acabamento na área da SUA cor (`consumoDoPlano(..., { areaPorCor })`). Folha do pintor (avulsa e folha 3) em blocos
por estrutura; a avulsa só sai com o PLP completo e coerente (`problemasParaOPintor`). PDF do PLP ganhou o quadro
"Esquema por estrutura"; o editor mostra prévia e avisos. Em 15/10 só a 094 e a 106 passavam; a 067 tem preto e
amarelo no NOME de uma demão só — precisa ser separada à mão; a 094 tem "Cinza RAL 7039" nas observações contra
item "Azul". ⚠ `lib/fila-setor.js` ainda chama `consumoDoPlano` sem `areaPorCor` (conta antiga).

**Caderno de 3 folhas** sai do botão na barra da faixa Pintura do Gantt (`lib/pintura-excel-cliente`),
com os IDs do LOTE, não da obra. As células a preencher são **amarelas** e o resto é **fórmula de
Excel viva**; a folha do pintor referencia a folha 2 por endereço (colunas A..M — mexer numa quebra
tudo à direita). Folha do pintor mostra só: diluente %, **espessura ÚMIDA** e secagem.

⚠ **DOIS CATÁLOGOS DE TINTA, dívida conhecida:** `ProdutoTinta` (3, `solidosVol`, boletim, usado pelo
editor do PLP) e `TintaProduto` (60, `svPct`, semeado, usado pelo estudo do Comercial). Concordam
onde coincidem (Hardtop Flexi 64%), mas nenhum tem INDUSTHANE, W-POXI ZSP 315 nem Jotamastic 90.
⚠ **Jotamastic 90 ≠ 80** — nunca casar por nome parecido: erra o SV, erra o litro, vira ordem de compra.
📌 **INDUSTHANE RHB DF = SV 55,2%**, documentado em `EditarPlp` linha 137 (conferido contra a planilha
do fabricante). Não cadastrado — decisão do time.

**FEFO, não FIFO** (tinta vence). Lote sem validade vai para o FIM: "—" é "não sabemos", não "vence
nunca". Validade passou a ser pedida no recebimento em 07/09/2026 quando o material é tinta
(`lib/material-tinta.js`) — **avisa, não bloqueia**. A tinta vem em TRIO: tinta + endurecedor +
diluente, cada um com seu R e lote, na mesma NF.

⚠⚠ **NÃO DÁ PARA AFIRMAR QUANTO FALTA**, e Vitor sabe (07/09/2026). Duas razões independentes:
1. O CMR conta EMBALAGENS e o tamanho só aparece se o fornecedor escrever na descrição — 112 de 486
   entradas, variando 16/18/20 L. Na OP-112, zero de 3.
2. **Não existe registro de consumo.** O CMR só sabe o que entrou; na 067 os recebimentos vão de
   13/02 a 25/08 e a maior parte já está na parede.
Galão de tinta = **3,6 L**; balde = 18 L. As duas contagens saem da mesma conta em litros.

Ver [[torg_pintura_duas_telas]], [[torg_status_compra_cmr]], [[torg_rastreio_corrida]] e
[[torg_acabamento_galvanizado]].
