---
name: torg-pintura-fotos-numeracao
description: "Portal Compras Torg — as fotos do relatório de pintura são numeradas DENTRO do ensaio ('3 de 8'), por lib/fotos-evidencia.js, e a legenda não repete o nome do ensaio"
metadata:
  type: project
---

**22/09/2026.** Vitor: *"as fotos estão ficando com marcação errada, temos duas fotos 102-002 ele
marcar 1/8 2/8."*

⚠⚠ **A CONTAGEM ERA PROMETIDA E NUNCA CUMPRIDA.** A moldura da folha 2 dizia "Medição de Espessura ·
**1 de 8**" e as outras SETE fotos do mesmo ensaio saíam na folha de registro fotográfico **sem
número nenhum** — e com a legenda repetindo o nome do ensaio ("Medição de Espessura · Medição de
Espessura", sete vezes). O índice era calculado ali, na moldura, e esquecido do outro lado.

A numeração mora em **`lib/fotos-evidencia.js`** (`numerarPorEvidencia`, `legendaDaFoto`), junto dos
rótulos das áreas — as duas folhas do PDF chamam a mesma função.

- ⚠ **O índice é DENTRO do ensaio, não no total do relatório**: a 3ª foto de espessura é "3 de 8"
  ainda que seja a 5ª foto do documento. É por ensaio que se confere.
- ⚠ **"1 de 1" não se escreve** — contagem de um item só é ruído.
- ⚠ **Foto sem ensaio não ganha número** (a do acervo antigo, sem área): inventar "2 de 3" de quê?
- ⚠ **Legenda do inspetor que só repete o ensaio é descartada** (comparação normalizada, com
  contenção: "Rugosidade" dentro de "Rugosidade / Jateamento"). A que diz algo a mais fica:
  "Medição de Espessura · 2 de 8 · bolha na chapa".

Só vale para tipo com áreas de evidência (hoje **só PINTURA** — `EVIDENCIAS`); EVS, LP, US e
dimensional seguem com a legenda de antes.
