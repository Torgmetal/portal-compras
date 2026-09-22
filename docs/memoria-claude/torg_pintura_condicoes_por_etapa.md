---
name: torg-pintura-condicoes-por-etapa
description: "Portal Compras Torg — a condição ambiental do relatório de pintura é POR ETAPA (jato, fundo, demais demãos); a demão sem leitura herda a do jato e a tela diz que herdou"
metadata:
  type: project
---

**22/09/2026.** Vitor: *"nas informações de temperatura e umidade que seriam as condições
ambientais, precisas que tenha o campo para informarmos tanto no jato, quanto no fundo quanto nas
demais demãos."*

⚠⚠ **ERA UMA LEITURA SÓ, IMPRESSA COMO SE FOSSEM TRÊS.** O portal pedia um bloco
(`prepUmidade`/`prepTAmb`/`prepTSup`/`prepOrvalho`) e o PDF o copiava em todas as colunas da tabela
de aplicação. Medido no RIP-102-002: as mesmas **41% / 24 °C / 23 °C** declaradas no jateamento do
dia 17 de manhã, no fundo do dia 17 à tarde e na 2ª demão do dia 18 — três medições que ninguém fez.

A regra mora em **`lib/pintura-campos.js`**: `ETAPAS_AMBIENTE` (ids `jato`, `1`, `2`, `3` — a 1ª
demão é o **fundo**), `leiturasAmbientais(res, etapa)` e `ambientePorEtapa(res)`. As duas telas e o
PDF leem dali; calculada em cada lugar, foi assim que a tabela do PDF passou a ler `dem[n].umidade`
enquanto a única tela que existia gravava `prep*`.

- ⚠ **A demão sem leitura própria HERDA a do jateamento** — decisão de 04/09/2026 (Vitor: *"não
  está salvando umidade e temperatura no relatório"*, quando a coluna saía em branco). `herdado:
  true` é o que deixa a tela pedir a medição de verdade.
- ⚠ **Só herda demão que EXISTE** (tem algum campo preenchido): coluna de demão que ninguém aplicou
  seria registro de ensaio inventado.
- ⚠ **O campo da tela mostra o que a demão TEM, nunca o valor herdado.** Preenchido com a leitura do
  jato, um toque em salvar transformaria a herança em medição daquela demão.
- ⚠⚠ **O julgamento do item 5.4 é POR ETAPA.** Um fundo aplicado com 92% de umidade reprova mesmo
  que o jato tenha sido num dia perfeito — e o aviso do PDF, ao lado do laudo, **nomeia a etapa**
  ("Fora do PO-05 (5.4) na 2ª demão: …"). Antes, só o jato era conferido.

Onde mexer (são **duas** telas — ver [[torg_pintura_duas_telas]]): `app/campo/Pintura.jsx` (+
`app/campo/PinturaAmbiente.jsx`, que tem os 4 campos e o veredito) e
`app/qualidade/inspecoes/[id]/FormPintura.jsx` (os campos da demão já estavam em `CAMPOS_DEMAO`, na
tabela de aplicação; o que faltava era rotular o bloco como do jato e julgar cada etapa).
