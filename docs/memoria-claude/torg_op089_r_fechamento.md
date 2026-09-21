---
name: torg_op089_r_fechamento
description: OP-089 (15/09/2026) — "307 projetos sem R" eram 198 peças: CMR da obra sem a cantoneira 1.1/2" (estoque da 067), U dobrado lançado pela espessura da tira, chapa 12,5 de estoque, grade de piso contada como peça; fechado com 28 amarrações SEM_R + 7 baixas de corte + §04 do data book com 7 certificados de outras obras
metadata:
  type: project
---

**Vitor (15/09/2026): "temos 307 projetos sem R" na OP-089.** Eram 198 peças (de 445 com perfil)
e os 64 conjuntos que as contêm. Causas, do maior para o menor:

1. **Cantoneira L1.1/2"×1/8" — 119 peças, 1.275 kg**: o CMR da 089 só tinha cantoneira de 2".
   Veio de estoque → amarrada ao **R 260129** (OP-067, 5.382 kg, 12/02 — único lote com peso
   suficiente recebido antes do 1º corte, 30/07).
2. **Perfil dobrado lançado pela espessura da tira** (20 peças): `PERFIL IND FQ 2.25X6000MM` (R 260843)
   é o U100X50X2.25 e `PERFIL IND FQ 3.00X6000MM` (R 260844) é o U200X70X3.00 — o matcher não tem
   como saber. Amarração ao R da própria obra (mesmo caso do Z da OP-105).
3. **Chapa 12,5/12,7 — 22 peças, ~700 kg**, cortadas 29/07–04/08: nada no CMR da 089. ⚠ O R 261189
   (084) que eu tinha sugerido chegou em 19/08 — DEPOIS do corte; usado o **R 260948** (098,
   7.567 kg, 20/07). **Regra que apliquei para estoque: o lote mais recente recebido ANTES do 1º
   corte, com peso suficiente** (mesma lógica para CH3.00→260763, W150X18→261002, TB100X100X8→250605,
   CH8→261067, FRØ1/2"→261274).
4. **Grade de piso (18 "peças", 2.350 kg)**: Tekla escreve como CH30 → nunca casa. Corrigido no
   código: `rastreioDaOp` filtra `ehItemComprado` (commit a155344a). Vitor: "grade de piso não faz
   parte R e nem deve estar no data book".
5. **7 peças "aguardando corte"** (tubos 42,4/25,4 e CH16) já estavam cortadas sem apontamento —
   baixa portal de CORTE (`baixaSetores.CORTE`, porNome "Vitor Costa (registrado pelo Claude)").

**How to apply:**
- As 28 amarrações são `TrocaRastreabilidade` com **escopo SEM_R** (só a peça sem R recebe; quem
  já tinha R do CMR da obra fica) e motivo dizendo a regra. Cobre ESTOQUE, SEM_MATERIAL e
  AGUARDANDO_CORTE — não precisa marcar como cortada para ganhar R. AuditLog `AMARRAR_R_OP089`.
- §04 do data book: `popular-material` já puxa o certificado dos R declarados (outras obras) — de 23
  para 30 certificados; §02 ficou 733/733 posições com certificado.
- Amarração de estoque é declaração, não fato: se o Almoxarifado disser outro fardo, trocar em
  Qualidade › Perfis sem material (a linha é por perfil).
- Relacionado: [[torg_rastreio_corrida]], [[torg_r_tres_caminhos]], [[torg_itens_comprados]].
