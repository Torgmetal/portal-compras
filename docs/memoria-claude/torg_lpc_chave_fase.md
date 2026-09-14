---
name: torg_lpc_chave_fase
description: A chave da LPC no portal é a FASE (T94A), nunca o número da OP (094) — a mesma lista importada por duas telas com chaves diferentes duplicou 591 marcas da OP-094 na programação do corte (14/09/2026)
metadata:
  type: project
---

**A peça é única por (opNumero, marca), e o `opNumero` da LPC é a FASE (T94A, T83F) — o código SKA.**
Se a mesma lista entra sob "094" e sob "T94A", cada marca vira duas peças, e a programação do corte
mostra "Frente T94A" e "Frente 094" lado a lado.

**Why:** OP-094 (14/09/2026), PCP: "veio duplicada as peças… na coluna Frente T94A e 094". A tela de
Listas da Engenharia mandava só a OP escolhida ("094"); a de Peças manda o nome do arquivo (T94A-LPC →
"T94A"). O Diego importou pelas duas (17:14 e 17:17), e o mesmo já tinha acontecido em 03/09. Nada
acusava: a importação "deu certo" duas vezes.

**How to apply:**
- `lib/lpc-chave.js`: `chaveParaOParser` (fase do arquivo > fase escolhida > null, para o parser achar
  pela marca; número da OP nunca força) e `chaveAjustadaPeloBanco` (chave só numérica + UMA lista LPC
  já gravada na OP → usa a fase gravada). A rota `importar-lpc` devolve `chaveAjustada` quando trocou.
- Toda tela que importa LPC manda `arquivoNome` no body (Listas da Engenharia passou a mandar).
- Limpeza da 094: apagadas as 591 peças sob "094" (sem programação, sem vínculo de romaneio/carga);
  ficou a T94A, que tem as 98 programadas do PCP. AuditLog `LIMPAR_LPC_DUPLICADA`.
- Resíduo do mesmo padrão em outras obras (marcas repetidas entre chaves): OP-089 (22, entre T89C/T89A/089),
  OP-113 (6, T113A × 113), OP-067 (3). Ainda não limpas.
- Relacionado: [[torg_pecaconjunto_opnumero]], [[torg_listas_le_lpc]], [[torg_producao_e_lpc]].
