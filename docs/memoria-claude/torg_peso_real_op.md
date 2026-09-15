---
name: torg_peso_real_op
description: Peso REAL da OP (lib/peso-op.js) — evita dobrar croqui e LE+LPC; canônico = LE
metadata: 
  node_type: memory
  type: feedback
  originSessionId: dcd073c6-4b21-46d4-b2d3-f4c7977df22a
  modified: 2026-08-06T11:54:13.024Z
---

Somar `PecaConjunto.pesoTotalKg` cru DOBRA/TRIPLICA o peso da OP:
- **CROQUI** é o detalhamento do CONJUNTO (mesmo peso) — na OP 088, conjuntos=16.814 kg **=** croquis=16.814 kg. Somar os dois = 2×.
- **LE e LPC** descrevem a MESMA estrutura, com marcas diferentes — e às vezes com o MESMO `opNumero` (OP 104: opNumero="104" tem LE_IMPORT=13.611 kg **e** LPC_IMPORT=16.068 kg). Somar as duas = 2×.

**Why:** Vitor apontou (29/07) OP 104 mostrando 29.679 kg (LE+LPC+croqui) quando o real é **13,6 t**. Fonte canônica do peso = **a LE** (marcas de expedição; sem LE, cai pro LPC).

**How to apply:** use **`pesoRealPecas(pecas)`** de `lib/peso-op.js` em QUALQUER soma de peso por OP. Regra: se houver peça `fonte==="LE_IMPORT"`, soma só a LE; senão soma o LPC com `tipoPeca!=="CROQUI"` (conjuntos + avulsas). As peças precisam trazer `{ fonte, tipoPeca, pesoTotalKg }` no select. Validado: OP 104 29.679→13.611, OP 088 33.627→16.814.

**Já corrigido (usam pesoRealPecas):** painel "Lista de peças (LPC)" do detalhe da OP (OPDetailClient), import da LE (soma LE_IMPORT do banco), planejamento/dashboard, planejamento/expedicao-semanal, expedicao/relatorio, expedicao/checklist, expedicao/programacao-cargas, cronogramas/[id]/peso e /importar-peso, **indicador de prazos da Produção** (planejado por OP). **Já estavam certos** (filtram LPC+conjunto): producao/mapa, planejamento/analise-critica. **De fora** (domínio Syneco, agrupam por marca/etapa): mes/conjuntos, mes/rastreabilidade-op. Ver [[torg_listas_le_lpc]], [[torg_materiais_op]].

**Linha "TOTAL.:" importada como marca (dobra separada, achada 06/08 na OP-071).** O parser da LE (`lib/parse-le-form21.js`) ingeria a linha de TOTAL da planilha como se fosse peça, dobrando o peso — o skip era por `qtd===0`, mas a linha de total traz a SOMA das quantidades no campo qtd (não 0), então escapava. **13 OPs afetadas, ~411t fantasma.** OP-071: 18.664 = 9.332 real + TOTAL 9.332 (o contratado 9.332 estava certo). **Fix**: parser pula marca que `normalize()` começa com "total" (commit 0cfb9c2). **Limpeza do dado existente (06/08)**: apaguei as linhas TOTAL das **6 duplicatas** (071→9.332, 082→10.975, 083→97.198, 092→35.832, 095→29.313, 098→12.157) e das **3 só-total** (104/106/108 → 0, pois as listas ainda não foram emitidas — Vitor confirmou que 0 é o correto). **Pendentes**: 4 divergentes (060, 067, 085, 089) NÃO são esse bug (import incompleto/inconsistente, sem dup nem croqui) — **067 crítica** (só 19.671 de 173.357 kg / 575 de 2.094 marcas importadas). Decisão do Vitor: **aguardar a Engenharia mandar as listas novas e re-importar** (com "sobrescrever", que apaga a LE da OP e recria). LPC usa outro parser e está limpo. Deleção de dado de prod passa pelo guard (precisa autorização).

**Módulo ENGENHARIA usa outro helper: `pecasTekla(pecas)`** (mesma lib, dff6497, 06/08). A Engenharia mostra o **peso MODELADO (Tekla)**, não o peso real de expedição — então a base é o **LPC sem croqui** (conjuntos+avulsas), caindo pra LE só quando o LPC não tem peso (placeholder 0 kg, ex.: OP-071). É a preferência INVERSA do pesoRealPecas (que prioriza a LE): aqui usar a LE quebraria o `%` produzido (apontado nas peças LPC — OP-078 daria 63t modelado × 96t produzido = 152%). **Bug corrigido**: carteira/detalhe da Engenharia somavam `pesoTotalKg` CRU (groupBy `_sum`) e dobravam ~2× (carteira 2.328t→1.726t; OP-067 aparecia 339t vs 25t reais). Corrigido em `app/api/engenharia/carteira` e `/op/[opNumero]` (cards + funil por status). Ver [[torg_portal_engenharia]].

## Contagem de peças pela mesma régua (15/09/2026)

Vitor, OP-103: "no relatório de pintura 678 peças, no data book 854, na lista de pintura 442".
- **854 do data book = LPC (442) + LE (412)** — o cabeçalho somava toda linha CONJUNTO/null da
  OP. Agora `contagemRealPecas`/`pesoRealPecas` (lib/peso-op: `pecasReais` = LE pela flag `naLE`
  ou fonte, senão LPC sem croqui; **parafuso AC não é peça**). Cabeçalhos dos data books EM
  MONTAGEM recalculados (`CORRIGIR_CABECALHO_DATABOOK`); os emitidos não se mexem.
- **442 = LPC** (conjunto + avulsa): 402 estrutura + 32 degrau + 8 calhas. 412 = LE. A diferença
  de 30 são conjuntos que estão na LPC e não na LE (CJS CORRIMÃO DA BASE ×16, CJS FUNIL ×6,
  FLANGE PISO ×8) — pergunta para a Engenharia, não para o portal. Sufixos "-DOB"/"-USI" da LPC
  são as mesmas marcas da LE sem sufixo.
- **678 do RIP-103-002** = 43 marcas de croqui (532 pç, as "-DOB" posições) + 16 marcas de
  estrutura (136 pç); faltam 25 marcas (318 pç). Relatório criado pelo celular antes do filtro de
  croqui ([[torg_inspetor_produto_final_fase]]).
- **"CALHA SAIDA RESIDUOS GROSSOS" é chute fabricado**, não calha de cobertura — `ehItemComprado`
  ganhou a exceção (`RX_CALHA_FABRICADA`). Calha comprada é "CALHA GALVALUME 0.65MM".
- **OP-089: 246 linhas da LPC (T89A/T89C) estavam com `naLE`**, duplicando a LE "089" (280 marcas):
  portal da TMSA com 526 linhas/23 t, data book com o dobro. Flags tiradas
  (`LIMPAR_LE_DUPLICADA`), foto do portal sem diff. **Vigiar**: LPC importada na chave numérica e
  depois rechaveada carrega o `naLE` junto — rechavear = conferir as flags.

