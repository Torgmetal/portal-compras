---
name: torg_fluxo_producao
description: "Diretoria › Fluxo da Produção — o funil Engenharia→programador→setor, e o buraco dos 4.576 itens fora do mapa"
metadata:
  type: project
---

Vitor (25/08/2026), sobre dar ritmo à produção: *"não tenho o controle do que a engenharia desce de desenho para o programador, não tenho a visão do que o programador de fato fez e não tenho o controle do que cada setor está fazendo"*. Pediu para estruturar **na Diretoria**, sem criar mais tela no PCP/Produção.

**`/api/diretoria/fluxo` + `app/diretoria/FluxoProducao.jsx`** (aba "Fluxo da Produção"). Três blocos, uma fonte cada, **nenhuma tabela nova**:
1. **Fora do mapa** — item com ordem no `MesOrdem` que NÃO existe na LPC do portal
2. **Fila do programador** — LPC importada × ordem lançada, + **dias sem lançar**
3. **Ritmo por setor** — apontamento do Syneco por dia (14 dias)

🚨 **O diagnóstico que motivou tudo (medido 25/08/2026):**
- **4.576 itens fora do mapa** em 12 obras — **OP-064 sozinha tem 3.671**; OP-060 422; OP-097 266. **OP-071 e OP-036-01 produzem sem LPC nenhuma.**
- **1.630 peças na fila do programador** — OP-067 com **1.110, último lançamento há 31 dias**; OP-085 com 103 **há 53 dias**.
- Setores em 14 dias: Pintura 59 t em **5 dias**, Corte 44 t em 12, Jato 38 t em 10, Montagem 26 t em 11, Solda 25 t em 11, Acabamento 24 t em 9. Ritmo diário oscila de **1 t a 33 t**.

⚠️ **A ordem dos blocos é a ordem da dor**: "fora do mapa" vem PRIMEIRO porque enquanto a lista não entra, kg pendente / avanço de setor / fila saem errados. Não reordenar.
⚠️ **Tela de LEITURA** — nenhum botão muda dado; links vão para a OP, não para telas de trabalho. Virar tela de ação = quarta lista de trabalho da mesma fábrica.
⚠️ **"Entregues" = marcas DISTINTAS**, não linhas da LPC (marca se repete — [[torg_marca_nao_unica]]). 11.877 marcas para 13.027 linhas.
⚠️ Pendente e sabido: o painel **mostra** o buraco das listas, não tapa. Enquanto a Engenharia não importar a LPC dessas obras, os números delas seguem distorcidos. Ver [[torg_listas_le_lpc]].
