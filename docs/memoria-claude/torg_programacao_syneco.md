---
name: torg_programacao_syneco
description: Peça lançada na produção pelo programador = existe MesOrdem no Syneco; sem ordem nenhuma = não lançada. Ordens nascem para a rota inteira de uma vez
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-18T23:04:08.208Z
---

**"O programador já lançou a peça para produção?"** (pergunta do Vitor, 18/08/2026) —
o sinal é a existência de **`MesOrdem`** daquela marca no Syneco. O portal não escreve
no Syneco; a ordem nasce quando o programador lança.

Ao lançar, o Syneco cria as ordens **das operações da rota daquela peça**, com status
`Não Inicializada`. Quantas nascem depende da peça: na T89 vieram as 5–7 da rota inteira;
na T97 as 13 peças (cantoneira só cortada) têm **só a op. 10 Corte**. Nunca assuma a rota
completa — leia as ordens que existem:

| operação | setor Syneco |
|---|---|
| 10 | Corte |
| 20 | Preparação |
| 30 | Montagem |
| 40 | Solda |
| 50 | Acabamento |
| 60 | Jato |
| 70 | Pintura |

Croqui/avulsa nasce com 10+20; conjunto composto com 30–70; solo com corte nasce com
10,20,50,60,70. **Peça sem nenhuma `MesOrdem` = o programador ainda não lançou.**

Ciclo do `status`: `Não Inicializada` → `Produzindo` → `Finalizado` / `Finalizado Total`
/ `Finalizada Parcial`.

⚠️ **O Syneco separa `Corte` (op 10, laser/serra) de `Preparação` (op 20, furação/rosca/
plasma manual) — as duas são a "Preparação" (setor `CORTE`) do portal.** Ao perguntar
"tem ordem deste setor?" case as duas (`/corte|prepara|serra|plasma|oxico/i`).
**NÃO** mexa no `SETOR_SYNECO_KEYWORDS`/`whereSetorSyneco` de `lib/syneco-dia.js` pra
isso: aquilo alimenta os números de produção do dia e passaria a contar a mesma peça
duas vezes. Ver [[torg_syneco_apontamento_fonte]].

`MesOrdem.opId` é null em obras antigas (T36, T50, T49, T38, T68…) — as OPs atuais têm
opId preenchido, então filtrar por `opId` está ok pro fluxo de produção.

**Como CONFERIR** (o chip sozinho é só afirmação do portal): clicar no chip abre as ordens
cruas — operação, setor, **máquina** designada (LASER CHAPA/TUBO/CANTONEIRA/PERFIL, SERRA,
POLICORTE, FURADEIRA MAGNÉTICA, ROSQUEADEIRA, PLASMA MANUAL), planejado × produzido, status
e datas. O teste mais forte é a **quantidade**: `planejadoUn` do setor × `PecaConjunto.qte`
(divergiu = programação parcial ou peça relançada). Ordem sem máquina (`"---"`) é operação
manual, não passou por nesting.

⚠️ **A ordem NÃO guarda quem programou** — `operador` fica `"---"` nas 53.774 não iniciadas.
Dá pra provar que a ordem existe (máquina, quantidade, data), não a autoria.

Sincronização: dataset SKA 150 via `/api/mes/sync-ordens` (agente da fábrica, `MES_SYNC_API_KEY`),
snapshot completo — em 18/08/2026 as 117.404 ordens tinham `updatedAt` do mesmo dia. O painel
mostra esse horário ao lado do filtro Programação. Ver [[torg_mes_syneco]].

Implementado como coluna **Programação** + filtro no painel de Liberar do PCP
(`app/api/pcp/despacho/route.js`, `programacaoDe()`): `INICIADA` / `PROGRAMADA` /
`OUTRO_SETOR` ("lançada", mas sem ordem deste setor) / `NAO_LANCADA`.
Ver [[torg_prioridades_setor]] e [[torg_peca_setor_real]].

**11/09/2026 — "programada" continua vindo SÓ do Syneco (decisão do Vitor, commit 5954391a, build 3094).**
OP-107 liberada pela GRD saía toda "não programada": não havia ordem no Syneco. Vitor propôs a liberação do PCP já
virar "programada"; argumentei contra (a fábrica aponta no Syneco, o portal não dá baixa sozinho — peça sem ordem é
peça que ninguém aponta) e ele aceitou. Estado novo `LIBERADA_SEM_ORDEM` em `/api/pcp/despacho` (GRD impressa + sem
ordem) = "liberada · falta lançar no Syneco" em âmbar; vermelho só para quem não foi liberada nem lançada. Contador
`pecas.liberadasSemOrdem` em `/api/pcp/producao` (sai do `naoLancadas`). Quem libera E lança é o **Gabriel**
(engenharia3@torg, módulos PLANEJAMENTO/ENGENHARIA/PCP) — por isso a peça vira pendência dele, não alarme, e não
fez sentido notificá-lo pelo sino. A aba Programação do PCP foi inativada em 07/09 (82951f32) e não tem relação.
