---
name: torg_organograma_pdf
description: "RH › Organograma tem \"Exportar PDF\" em estrutura de organograma (árvore A3 paisagem, Diretoria → ADM|Fábrica → setores)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 1754de4f-06da-423d-8c20-70c99cbd5bad
  modified: 2026-08-11T12:47:39.623Z
---

RH › Organograma (`/rh/organograma`) tem botão **"Exportar PDF"** (commit 0baa951, Vitor 09/08).
Vitor rejeitou a 1ª versão (lista em A4) — **tem que ser ESTRUTURA de organograma** (caixas +
linhas, hierárquico), **A3 paisagem** (não A4).

- `lib/organograma-pdf.js` → `gerarOrganogramaPDF({empresa,totalFuncionarios,setores})` (pdf-lib,
  server-only). 3 níveis: **Diretoria** (topo) → **ADMINISTRATIVO | FÁBRICA** (2 nós navy) → setores
  em "pente" (espinha + barramento por linha). Cada caixa de setor = barra da cor do setor + sigla +
  contador + gestor (azul) + equipe (primeiro+último nome). **Caixas desenhadas por último** p/
  cobrir as linhas da espinha. Cabe numa página (10 setores por grupo).
- Classificação ADM×Fábrica = **mesma regex do portal do cliente** `RX_FABRICA`
  (`app/api/qualidade/auditorias/portal/[token]/route.js`): produ|fábric|montag|solda|prepar|corte|
  pintura|jato|almox|expedi|caldeir|acabamento|usinag|oficina|manuten|ferrament|serralher|estoque →
  Fábrica; resto → Adm.
- `GET /api/rh/organograma/pdf` (ADMIN/RH) — mesmo filtro da tela (esconde setor vazio, exceto Compras).
- Padrão Torg pdf-lib (navy #0D1F3C + filete #F4801F + `torg-logo-white.png` + `san()` WinAnsi),
  igual [[torg_kickoff]]/ata-op. Ajustes possíveis pendentes: cargo junto do nome; versão enxuta
  (só setor+gestor+nº).
