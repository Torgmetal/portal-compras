---
name: torg_baixa_em_massa_113
description: OP-113 — baixa em massa da preparação (05/09) declarou cortado 16 croquis de perfil U que nunca foram cortados, e "marcar como conjunto" em lote engoliu 30 chapas-posição; portal ficou invertido em relação à fábrica
metadata:
  type: project
---

**Duas ações em lote na OP-113 deixaram o portal dizendo o CONTRÁRIO da fábrica por onze dias.**

1. **03/09, "marcar como conjunto" em 82 peças "sem máquina"** (PCP, logo após importar a LPC R00):
   30 delas eram **chapas-posição** (T113A-P3, P8, P9, P13, P17–P21, P27, P29, P32, P35, P36, P39,
   P46, P47, P59, P64–P73, P75, P76) — croquis de T113A1…A120 que não têm máquina na lista porque
   a chapa se corta na preparação. Viraram `tipoPeca: CONJUNTO, status: MONTAGEM` ("avulsa que vai
   direto ao Jato"): nenhuma baixa de corte as alcançava mais e os conjuntos-pai ficaram "N/M
   cortados" para sempre — enquanto a planilha da produção os dava por **"Passível Mont."**.
2. **05/09, "Baixa da preparação da OP-113"** (tarefa de manutenção, a partir da frase de 04/09 "a
   preparação da 113 está concluída"): pôs `corteConcluidoEm` em TUDO que não era conjunto —
   inclusive **16 croquis de perfil U (11 U75X40X2.25 + 5 UE200X75X20X3.00) com zero no Syneco**
   que nunca foram cortados. Vitor (14/09): "os que eu consegui imprimir … na verdade falta perfil
   U para preparar". T113A38–A45 apareceram "2/2 pronto", desceram para a bancada (15–16/09) e o
   maço foi impresso.

**Why:** baixa em massa é DECLARAÇÃO, não fato — e chapa/U não são apontados no Syneco (a fábrica
não aponta Preparação), então nada corrige sozinho. A tarefa de manutenção foi **aposentada** em
14/09 (ficaria oferecendo re-baixar os 16 U). "Marcar como conjunto" agora **recusa posição de
conjunto** (`croquiConjuntos: some`) e devolve quem ficou de fora nomeado.

**How to apply:**
- Baixa de corte de croqui é **por peça**: TV de prioridades (baixa portal, com qtd/quem/quando →
  `baixaSetores.CORTE`) ou fila de corte "concluir". Nunca `updateMany` por obra.
- Posição de conjunto (`croquiConjuntos.some`) é componente: passa pelo corte, nunca "começa na
  montagem". Peça "sem máquina" na LPC costuma ser chapa, não avulsa.
- Se a lista diz "pronto" e a fábrica diz que não (ou vice-versa), olhar primeiro `tipoPeca` e
  `corteConcluidoEm` dos croquis do conjunto.
- Correção de dados da 113 (14/09, script `scripts/corrigir-op113-preparacao.mjs`): 30 posições →
  CROQUI (25 com baixa, as dos conjuntos que a produção confirmou; 5 PENDENTE: P46, P47, P59, P64,
  P65); 16 U com baixa desfeita; T113A38–A45 de volta ao corte. AuditLog `CORRIGIR_OP113_PREPARACAO`.
- Relacionado: [[torg_croqui_cortado_regra_unica]], [[torg_liberar_montagem_pendente]], [[torg_marca_conjunto_croqui]].
