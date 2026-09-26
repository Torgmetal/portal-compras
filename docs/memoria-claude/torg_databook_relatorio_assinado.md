---
name: torg_databook_relatorio_assinado
description: Relatório de inspeção só entra no data book ASSINADO POR TODOS — entra na última assinatura; rodada reprovada (retrabalho) e rodada assinada acompanham, intermediária não; anexar à mão também é barrado
metadata:
  type: project
---

**A regra (Vitor, 25/09/2026, olhando o data book da OP-112):** *"ainda está puxando relatórios em
rascunho e falamos de puxar apenas os que estiverem assinados"*. É a regra que o PIT/PLP já seguia
(26/08: "anexar ao Data Book depois de todos terem aprovado").

**Por que entrava rascunho:** `vincularNoDataBook` rodava na CRIAÇÃO do relatório (e na edição, e no
envio) e punha no livro sem olhar nada — nem se o livro estava fechado. O PDF do documento é gerado AO
VIVO, então o livro mostrava o rascunho. Medido em 25/09, em livros abertos: 5 rascunhos, 4 com
assinatura incompleta e 4 rodadas intermediárias.

**Como ficou (`lib/relatorio-inspecao.js`):**
- `vincularNoDataBook` SINCRONIZA. Assinado por todos (`assinaturaCompleta`) → entra; qualquer outro
  estado → sai do livro, se estava, e a seção vazia volta a PENDENTE. Livro fechado não recebe nem perde nada.
- Quem põe no livro é a ÚLTIMA assinatura: `aoConcluirAssinaturas`, chamada na rota
  `/api/assinar/[token]` junto do `CONCLUIDO`. O PDF vai pelo caminho relativo. Falhar ali não desfaz a assinatura.
- Abrir revisão e reinspecionar devolvem o relatório a rascunho, e ele SAI do livro até a nova rodada
  ser assinada. `anexarRevisaoNoDataBook` só REGISTRA o documento da rodada; não o põe no livro.
- ⚠⚠ **Duas regras do Vitor conciliadas:** a rodada REPROVADA/REC entra junto com o relatório assinado
  (retrabalho, 21/08), e a rodada assinada por todos também (`revisaoEntraNoLivro`). A versão corrigida
  no meio do caminho, sem as assinaturas, NÃO entra — é rascunho que ficou para trás.
- Anexar à mão (`POST …/secao/[id]/doc`) recusa documento de relatório não assinado com 409 e o motivo
  (`bloqueioRelatorioNaoAssinado`). O documento aparece na lista de candidatos da OP.
- A tela, ao criar, diz *"Entra na seção N do data book quando todos assinarem"* sem ⚠
  (`lib/relatorio-vinculo-texto.js`).

**Limpeza de 25/09:** 13 vínculos retirados de livros abertos, com auditoria
`DESVINCULAR_RELATORIO_NAO_ASSINADO_DATABOOK`:
- rascunhos: RIP-112-001/002, RID-084-001/002 e RIP-094-001;
- assinatura incompleta: RUS-113-001, RPM-105-002 e RIP-089-002/003;
- rodadas intermediárias: RIP-103-002 R00/R01, RIP-103-003 R00 e RIP-085-001 R00.

Seções que voltaram a PENDENTE: OP-112 §14, OP-113 §12, OP-105 §11, OP-094 §14. O RIP-112-001 fui eu que
religuei de manhã ao recriá-lo, pelo `vincularNoDataBook` antigo.
- Assinado fora de livro aberto: nenhum. OP-102 teve os RLP/EVS tirados à mão pela Qualidade
  (trocados pelo arquivo do servidor) e o livro já está em assinatura.

Relacionados: [[torg_databook_revisao]], [[torg_relatorio_editar_assinado]], [[torg_relatorio_us]]
