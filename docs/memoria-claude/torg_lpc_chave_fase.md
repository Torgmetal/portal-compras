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
- Limpeza do resíduo em 14/09 (AuditLog `LIMPAR_LPC_DUPLICADA` "089,113"): OP-113 (5 croquis "113" sem
  vínculo + T113A104, que virou avulsa sob T113A) e OP-089 (22 marcas "089" que também existiam em T89C).
  OP-067 ficou: T67CT-P42/P43/P46 existem em "T67" (chapa) e "T67CT" (U200) com PERFIL diferente — são
  peças diferentes, marca repetida entre sub-obras [[torg_marca_nao_unica]], não duplicata.
- Os 104 croquis T89C que só existiam sob "089" (import de 05/08, 103 já cortados) foram rechaveados
  para T89C e os 175 vínculos que apontavam para linhas da LE passaram para os conjuntos da LPC
  (AuditLog `REGULARIZAR_LPC_CHAVE`). 14 conjuntos T89C que estavam sem croqui na LPC ganharam os seus.
  Só T89C100 não tem linha na LPC; o vínculo dele ficou na LE.
- Relacionado: [[torg_pecaconjunto_opnumero]], [[torg_listas_le_lpc]], [[torg_producao_e_lpc]].

## A LE também duplicava — pela grafia do número da OP (14/09/2026)

`importar-le` gravava a chave como veio da planilha: a R00/R01 da OP-089 entrou como "089" e a R02 como
"89" (561 linhas, a antiga com a linha "TOTAL.:" de 8.705 peças); a OP-084 tinha "084" × "84". Agora a
chave da LE é o número da OP CADASTRADA quando a OP é casada, e o rodapé (TOTAL/SUBTOTAL/SOMA) fica de
fora antes de virar peça (`ehLinhaDeTotal` continua na leitura, por segurança). Limpeza de 14/09:
OP-089 ficou com a R02 (280 marcas) sob "089"; OP-084 perdeu as 9 cópias sob "84"; as linhas
"TOTAL.:" das OPs 060/067/085 foram apagadas (AuditLog `LIMPAR_LE_DUPLICADA`). Varredura: nenhuma
LE em dobro, nenhuma linha TOTAL, nenhuma LE órfã.
