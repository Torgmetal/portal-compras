---
name: torg_torguinho
description: "Torguinho (assistente interno): modelo automático × fixo, o peso produzido pela ferramenta do MES e o contrato das ferramentas"
metadata:
  type: project
---

O Torguinho é `app/api/assistente/chat` + `lib/assistente/` (prompt, ferramentas, executores). O do cliente
(`lib/portal-assistente.js`) e o Assistente Fiscal são outros, com ferramentas próprias.

⚠⚠ **O MODELO FICAVA PRESO NO HAIKU SEM NINGUÉM TER ESCOLHIDO.** `ConfigAssistente.modelo` nasce
`"claude-haiku-4-5"` e a rota tratava qualquer valor como escolha do admin. A escolha por pergunta, que existe
desde 12/06 (Sonnet na pergunta complexa, com anexo ou depois da 3ª rodada), nunca rodou em produção. Desde
26/09/2026 o valor `"auto"` deixa a rota escolher (`lib/assistente/modelo.js`, opção "Automático" em
Admin › Torguinho). Enquanto ninguém escolher "Automático" lá, continua tudo no Haiku.

⚠⚠ **PESO PRODUZIDO DE UMA OP = kg DO SETOR MAIS AVANÇADO COM APONTAMENTO, nunca a soma dos setores:** a peça é
apontada em cada setor por onde passa. A ferramenta `consultar_mes_producao` devolvia `totalKg` somado (o
número que o próprio prompt proibia usar). Medido em 26/09: para a OP-97 o Haiku respondeu **59.660 kg**; com
`pesoProduzidoKg` (Acabamento), **13.865 kg**. A ordem dos setores vem de `SETOR_SYNECO` (`lib/produzido-setor.js`).

⚠ **Contrato da ferramenta manda mais que texto do prompt.** O status que `consultar_ops` oferecia
(`EM_ANDAMENTO`, `CONCLUIDA`) não existe no enum: o Prisma recusava e o modelo gastava duas chamadas até dar a
volta pela consulta genérica. O teste `testes/lib/assistente-contrato.teste.js` compara o enum da ferramenta com o
do `schema.prisma` e confere que o prompt não cita ferramenta que o perfil do usuário não recebe.

⚠ `consultar_rms` segue com a lista de status antiga (inclui `ATENDIDA`, que não existe) **por decisão do Vitor
(26/09)**: o que toca cotação/RM só muda depois de o Compras decidir. Ver [[torg_ia_integracao]].
