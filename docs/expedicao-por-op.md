# Expedição por OP — replicar a "Lista Avançada Expedição" no portal

> **Handoff / acompanhamento** (Matheus + Claude). Documento vivo: vai sendo
> atualizado a cada fase. Serve para o Vitor ver **o que já foi feito** e **o que
> falta**, e retomar de onde paramos.
> Última atualização: 31/07/2026.

## Objetivo

Trazer para o portal (módulo **Expedição**) o funcionamento da planilha
`001 Lista Avançada Expedição.xlsm` que a Expedição usa hoje para controlar a
lista por OP e gerar os romaneios. **Replicamos a funcionalidade, não o layout
do Excel** — UX profissional e limpa (padrão do projeto).

### Como a planilha funciona (referência)
- **BCD / PROJETO** = marcas previstas (vêm da Lista de Expedição da Engenharia)
  cruzadas com o que já foi expedido → status por marca, faltantes, peso.
- **LISTA AVANÇADA** = onde a Expedição **cola as marcas + qtd** e atribui um
  número de romaneio (R1., R2., R3.).
- **ROMANEIO** = gera o documento (FORM 22) de um R# com as marcas daquele romaneio.

## Decisões travadas (com o Matheus)
1. **Previsto** = Lista de Expedição da **Engenharia** (já importada do SharePoint
   para a tabela `ListaExpedicao`). Não cruza com PecaConjunto.
2. **Formato do romaneio salvo no SharePoint** = **Excel FORM 22** (igual hoje).
3. **Numeração** do romaneio = **automática por OP** (R1, R2, R3…).
4. **Sem** os campos **Pos.** e **Amarrado/Caixa/Pallet** (removidos do escopo).
5. Caminhos SharePoint (dentro de `/Ordem de Servico/01. OP/{OP}`):
   - **Previsto (ler):** `2. Engenharia / 2.6 Lista de expedição` (arquivo `…-LE-R00.xls(x)`).
     O fallback legado `4. Expedição / 4.1 Lista de Avançada` **foi removido** (commit `6b63e81`).
   - **Salvar o romaneio gerado:** `4. Expedição / 4.2 Romaneios` (mesma pasta de onde
     o "expedido" é lido → o romaneio volta como expedido na próxima sincronização).

## Reuso (já existia no portal)
- `ListaExpedicao` (+ `marcasJson`) — import da Lista da Engenharia via
  `lib/lista-avancada-sharepoint.js` (`importarListasOP`).
- `Romaneio` + `RomaneioItem` + `RomaneioDoc` (documento A4 imprimível).
- `MesOrdem` (Syneco) — apontamento por setor por marca (`op` = marca).
- `lib/sharepoint.js` → `uploadFileToFolder(...)` (upload no SharePoint) e `getAccessToken`.
- `exceljs` (gerar .xlsx) e `pdf-lib` (disponível).

---

## ✅ Fase 1 — Visão da OP (previsto × expedido) — FEITA (`27ad167`, filtros `d23e963`)
Aba **"Expedição por OP"** na sidebar da Expedição.
- Seletor de OP → tabela consolidada das marcas: previsto (qtd/peso), **status**
  (Expedido/Pendente), nº do romaneio e data. KPIs (marcas expedidas/pendentes,
  peso contratado/expedido/faltante, %).
- Botão **"Sincronizar SharePoint"** (re-importa a Lista da Engenharia).
- **Filtros estilo Excel**: ordenação por coluna (Marca natural T64A1<…<T64A10,
  Qtd, Peso, Status, Data) + **filtro por grupo de marca** (T64A, T64B, T64H…).
- Arquivos:
  - `app/expedicao/op/page.js`, `app/expedicao/op/ExpedicaoOpClient.jsx`
  - `app/api/expedicao/op/[id]/route.js` (GET consolida; POST sincroniza)
  - `components/SidebarExpedicao.jsx` (item de menu)

## ✅ Fase 2 — Lista Avançada (colar marcas + Syneco + gerar romaneio) — FEITA (`d9ca1a1`)
Aba **"Montar romaneio"** dentro da Visão da OP.
- **Colar marcas estilo Excel** (uma por linha; qtd opcional). Valida contra a
  lista da OP — marca inexistente é sinalizada e ignorada.
- **Status do Syneco por marca** (bolinhas dos 6 setores, destacando montagem/solda).
- Carga editável (qtd/peso/remover) + dados de transportadora.
- **Gerar romaneio** → cria o `Romaneio` no portal com **número automático (R#)**
  e abre o documento imprimível (`RomaneioDoc`).
- Arquivos:
  - `app/expedicao/op/MontarRomaneio.jsx`
  - `app/api/expedicao/op/[id]/marcas-status/route.js` (status Syneco por marca)
  - `app/api/expedicao/op/[id]/romaneio/route.js` (gera romaneio, R# automático)

## ⏳ Fase 3 — Excel FORM 22 + salvar no SharePoint — PENDENTE
Fechar o ciclo do romaneio:
1. Gerar o **Excel FORM 22** do romaneio (via `exceljs`): cabeçalho Torg, cliente,
   transportadora, tabela marca/qtd/unid/descrição/peso.
2. **Upload** em `{OP}/4. Expedição/4.2 Romaneios` via `uploadFileToFolder(...)`.
3. Registrar no `Romaneio` onde salvou (adicionar campos `arquivoSharepointUrl` /
   `arquivoSharepointPath` — migração aditiva).
4. Estender o endpoint `POST /api/expedicao/op/[id]/romaneio` para, após criar,
   gerar o Excel e subir; devolver o link.

**Ponto de retomada:** a Fase 2 já cria o romaneio no banco e imprime. Falta só a
geração do Excel + upload (itens 1–4 acima). Tudo que precisa (dados do romaneio,
`uploadFileToFolder`, `exceljs`) já existe.

---

## Outras entregas recentes (fora da Expedição, já em produção)
- **PCP — Prioridades + Dashboard TV**: coluna de prioridade no Relatório de
  Produção (por obra+setor, ordenável, com data estimada) e nova aba **"Prioridades
  (TV)"** com metas por obra (peças/dia, dias úteis, % concluído), auto-refresh e
  logo Torg. Commits `824efa6`, `f496015`, `d413fd0`.
- **Expedição**: remoção do fallback legado da Lista de Expedição (`6b63e81`).

## Como validar
- Login local depende de `NEXTAUTH_SECRET` (não configurado) → validação plena é
  em **produção**. As lógicas foram validadas com smoke tests em dados reais
  (ex.: OP 064/BRASBIO — 1.443 marcas; Syneco 29/29; R# = R1).
