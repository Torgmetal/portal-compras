---
name: torg_portal_lpc_rastreio
description: Portal do cliente — a LPC pode sair com o R (e corrida) de cada croqui/avulsa, OPCIONAL por obra (PortalCliente.mostrarRastreio); mesma regra dos três caminhos do carimbo (lib/rastreio-lpc.js); LE da OP-113 perdeu as 120 estruturas em 03/09
metadata:
  type: project
---

**A LPC do portal do cliente lista o conjunto e as posições dele (desde 26/08) e, ligando
`mostrarRastreio` na aba Portal do Cliente da OP, cada croqui/avulsa sai com `R nnnnnn · corrida`
na tela e na planilha.** Vitor (15/09/2026): "a LPC precisa sair as peças que são posições dos
conjuntos e já informar a rastreabilidade de cada croqui (…) queria deixar essa parte como
opcional, pois nem sempre vamos disponibilizar essas informações".

**Why:** o cliente recebe o desenho carimbado com o R e abre o portal — se as duas leituras
seguissem regras diferentes, a mesma peça teria dois R. E rastreabilidade é informação
contratual: obra que não exige não recebe (nasce desligado, como o peso).

**How to apply:**
- `lib/rastreio-lpc.js`: `comporRastreio` (pura) aplica corte > amarração (`TrocaRastreabilidade`)
  > material da obra (`NA_OP`, FIFO) — a MESMA ordem de `app/api/producao/peca/route.js` e do
  carimbo ([[torg_r_tres_caminhos]]); chave `marca|perfil` ([[torg_marca_nao_unica]]).
  `rastreioDaLpc` junta as fontes; `rastreioDaOp` é caro e a rota do portal o calcula UMA vez por
  visita (`rastreioDaObra()` memoizado) para certificados e LPC.
- Só linha com perfil leva R; conjunto fica em branco (não "—"). Corrida "N/A"/"-"/"sem" do CMR
  sai vazia ([[torg_nao_declarar_furo]]). Peça com perfil e sem R: "—".
- Coluna `PortalCliente.mostrarRastreio` (ensure-mes-tables; já criada em prod 15/09). PUT
  `/api/comercial/op/[id]/portal` aceita `mostrarRastreio`; a planilha `/api/portal/[token]/lista`
  ganha "Rastreab. (R)" + "Corrida" só na LPC e só com a flag.
- Medido 15/09: OP-113 206/206 linhas com perfil têm R (202 corte, 4 obra), 0,4 s; OP-094 571/575.
- **LE da OP-113**: o portal mostrava só 47 itens (46 AC + 1) porque as 120 marcas de estrutura
  perderam `naLE` em 03/09 ~19:40 (sem AuditLog — as linhas chaveadas "113" da LPC importada no
  número errado, que carregavam a flag, sumiram entre a revisão T113A das 17:44 e a foto das
  19:43). O arquivo `T113-LE-R00.xlsx` (2.6, 167 marcas, 16.391 kg) está íntegro: reimportar pela
  Engenharia › Listas (forçando OP 113 — o cabeçalho não tem "OP:") recria as linhas "113"/LE_IMPORT.
- Relacionado: [[torg_portal_cliente_nalpc]], [[torg_listas_le_lpc]], [[torg_lpc_chave_fase]].
