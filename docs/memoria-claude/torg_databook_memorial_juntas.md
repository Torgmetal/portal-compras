---
name: torg_databook_memorial_juntas
description: Memorial de cálculo entra na §03 do data book (pastas 2.2 e 2.5.5); o nome da §03 muda sozinho com/sem memorial; mapa de juntas vai na §09 e aguarda a lista da API do Tekla
metadata:
  type: project
---

**Pedido (Vitor, 14/10/2026):** acrescentar ao data book o **memorial de cálculo** (PDF da pasta da Engenharia da OP)
e o **mapa de juntas** (gerado pela API do Tekla — Vitor vai trazer a lista).

**Memorial (`b9b413b3`):**
- Fica na **§03**, por escolha do Vitor. *"Temos obras que terá o memorial e outros não"* → o **nome muda sozinho**:
  "ARTs e memorial de cálculo" quando há memorial anexado, o nome do template quando não há
  (`lib/databook-memorial.js`, memorial = nome do arquivo com "memorial"/"memória de cálculo").
- ⚠ O nome é acertado **na leitura** (ao abrir o livro e ao gerar), não em cada rota que anexa, porque mais de dez
  rotas mexem em `DataBookSecaoDoc`. Livro emitido não muda.
- A §03 navega em `2. Engenharia/2.2 Memória de Calculo` e, opcional, `2.5 Projetos/2.5.5 Cliente/Memorial de
  Cálculo e ART` (casa pelo CÓDIGO da pasta). Conferido no SharePoint: OP-112 e OP-102 têm as duas; a OP-105 só a 2.2.

**Mapa de juntas:** já existe a **§09 "Mapa de soldagem"**, que navega em `8. Qualidade/Mapa de Juntas`. A MJ sai do
**ListasTORG** (sessão do Tekla, Windows) em xlsx + pdf, com duas abas: "Juntas por conjunto" (desenho, qtd, peças,
soldas, emendas, EPS, soldador/sinete, consumível R, data, EVS, LP) e "Emendas de topo" (junta J-nnn ou "A EMENDAR",
peças A/B, perfil, material, espessura, chanfro, EPS, ensaios do PIT, soldador, data, EVS, LP, US/RX). Soldador e
consumível vêm de `apontamentos*.csv` (marca;soldador;data;consumivel).
- **OP-112 (15/10/2026):** T112-MJ-R00 (121 marcas, 36 emendas "A EMENDAR"). O ProjectNumber do modelo era **T78**
  (sobra do modelo de origem); foi trocado para T112 com o ok do Vitor e a MJ gravada na pasta da obra. Anexei o PDF
  na §09 pela rota `navegar` (NA → ANEXADO).
- PRÓXIMO, se o Vitor quiser: o portal preencher EVS/LP/US/RX da MJ a partir dos relatórios assinados.

Relacionado: [[torg_databook_relatorio_assinado]], [[torg_tekla_tmsa_vale]].
