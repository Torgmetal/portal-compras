---
name: torg_junta_soldada_eps
description: As 5 EPS da Torg (001–005/2025, processo, arame, RQPS de mesmo número) e a regra da "junta soldada" nos relatórios de LP/EVS — a EPS escolhida puxa processo, metal de adição e RQS; pode haver mais de uma EPS por relatório
metadata:
  type: project
---

**Vitor (23/09/2026):** *"nos relatórios da OP-102 está faltando preencher Metal de adição, Processo de
soldagem, EPS, RQS e tipo de junta"*. O modelo LP/EVS revisado em 21/09 imprime os cinco, mas eles eram
texto livre só no computador — o celular, onde a inspetora trabalha, não tinha onde pôr.

**As EPS da casa** (pasta SharePoint `Qualidade/Workspace/EPS + RQPS`; arquivos "EPS-RQPS 0N….pdf",
DIGITALIZADOS — sem texto; a "EPS Resumida.pdf" tem texto). Transcritas em `lib/eps-casa.js` (`FICHAS_EPS`):

| EPS | Processo | Metal de adição | RQPS | Material |
|---|---|---|---|---|
| 001/2025 | GMAW | ER70S-6 | 001/2025 | chapas e perfis laminados |
| 002/2025 | FCAW | E71T-1C | 002/2025 | chapas e perfis laminados |
| 003/2025 | GMAW | ER70S-6 | 003/2025 | multinorma, barras e perfis em geral |
| 004/2025 | SMAW | E7018 | 004/2025 | todos os materiais |
| 005/2025 | FCAW | E71T-1C | 005/2025 | multinorma, barras e perfis em geral |

Todas AWS D1.1:2020 e todas cobrem junta de **topo e de ângulo** — o tipo de junta NÃO sai da EPS.
⚠ O nome do arquivo só diz o processo da 01 e da 02: sem a ficha, o soldador SMAW ficava sem EPS
permitida (a junta do Adailson no EVS-102-001 foi gravada sem EPS). `listarEPS` completa pela ficha.
⚠ EPS nova na pasta aparece sozinha no seletor, mas sem arame/RQPS até entrar em `FICHAS_EPS`.

**Regra:** escolher a EPS preenche RQS, processo e metal de adição (editáveis); **pode haver mais de uma
EPS** por relatório (o EVS-102-001 tem juntas GMAW e SMAW) — cada campo lista as das escolhidas, sem
repetir (002+005 → "FCAW"). No PDF essas linhas usam `linhaInfoCresce`: duas EPS saíam "EPS 001/2025, E…".
O relatório grava o NÚMERO do documento ("EPS 001/2025", "RQPS 001/2025"); a EPS da JUNTA continua
gravada pelo código da pasta ("EPS-RQPS 01") e o PDF a mostra pelo número, igual ao cabeçalho.
Os cinco campos entraram na memória de padrões por OP (LP e EVS): o próximo relatório da obra nasce
com eles ([[torg_campo_ida_e_volta]]).

**OP-102 (medido 23/09):** a Lais lançou as juntas do EVS-102-001 às 19h12 — B34 e B55 Daniel (EPS-RQPS 01,
GMAW), B45 Christian (EPS-RQPS 01, GMAW), B62 Adailson (SMAW, sem EPS). O Syneco aponta outros nomes
para algumas (B34 Eberton+terceiro, B45 "ADM", B62 Wilson Barros, que não está na RSQ) — quem decide é
a inspeção, não o apontamento.
