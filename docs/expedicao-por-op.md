# Expedição por OP — status e arquitetura

> **Handoff / acompanhamento** (Matheus + Vitor + Claude). Documento vivo.
> Última atualização: 04/08/2026.

## Decisão (03/08): modelo do Vitor é o OFICIAL; a Expedição é um ESPELHO

O Vitor construiu, **dentro do módulo OPs (`/comercial/[id]`)**, um fluxo de
expedição completo. Ficou decidido: **seguir 100% o modelo do Vitor** e deixar o
**módulo Expedição (`/expedicao/op`) como um espelho** — a Expedição vê os lotes e
**emite/revisa romaneio**, mas **não gerencia lotes** (isso fica no módulo OPs).

## Fluxo oficial (Vitor) — módulo OPs → aba "Expedição"
Arquivo: `app/comercial/[id]/AbaExpedicao.jsx` (+ `ListaExpedicaoSection.jsx`).

Entidades:
- **`LoteExpedicao`** — lote de entrega (ordem/prioridade, local, data, peso, e
  transportador: transportadora/motorista/placa caminhão/placa carreta/contato).
- **`PecaLote`** — peças do lote (vêm da lista do Tekla via Planejamento) → dão o peso.
- **`RomaneioPrevio`** — a carga: `itens` (marcas+peso), `numero` (série contínua),
  `emitidoEm`/`revisao`/`historico`, **`arquivoUrl`** (FORM 22 no SharePoint) +
  campos Fiscais (`nfNumero`/`nfTipo`/`nfEmitidaEm`).

Passo a passo:
1. Engenharia gera a **Lista de Expedição (LE)** → importada em `ListaExpedicao`.
2. Marcas escolhidas viram um **RomaneioPrevio**, vinculado a um **Lote**.
3. Wizard **Emitir/Revisar** (3 passos: marcas+qtd → transportador → emitir/prévia):
   - **Prévia**: gera o FORM 22 só pra conferir (não salva, não emite).
   - **Emitir**: gera o FORM 22, salva em `4. Expedição/4.2 Romaneios` e baixa;
     vira R00. Reemissão = **revisão** (exige "o que mudou"; versão anterior vai pra
     `Obsoleto`, novo Excel ganha aba **Histórico**).
4. Emitido cai no **módulo Fiscal** (`/fiscal`) aguardando NF.

Libs-chave:
- `lib/romaneio-form22.js` — preenche o **template FORM 22 real** (embutido base64),
  preserva logo/estilo, corrige a área de impressão A4. Peso vai como número.
- `lib/sharepoint-lista.js` → `salvarRomaneioNoServidor` — salva no drive **SERVIDOR**
  (`SHAREPOINT_SERVIDOR_DRIVE_ID` / `listarPastasOp`), em `4. Expedição/4.2 Romaneios`;
  na revisão move a versão anterior pra `Obsoleto`.

## O ESPELHO (nosso módulo Expedição) — `app/expedicao/op/`
- `page.js` + `ExpedicaoOpClient.jsx`: seletor de OP → renderiza o **mesmo
  `AbaExpedicao`** do Vitor com `podeEditarLotes={false}`.
- A Expedição pode: **ver lotes, ver marcas, emitir/revisar romaneio** (FORM 22 +
  SharePoint + Fiscal). Não pode: criar/editar/importar/reordenar lotes.
- Ajuste de permissão: `EXPEDICAO` liberado só na **leitura** (`GET`) da rota
  `lotes-expedicao/pecas` (carregar marcas). Emitir romaneio já permitia `EXPEDICAO`.

### Removido (emissor paralelo que duplicava o Vitor)
Deletados de `app/expedicao/op/` e `app/api/expedicao/op/[id]/`:
`MontarRomaneio.jsx`, e as rotas `romaneio`, `marcas-status`, `pecas`, `route.js`.
Criavam um `Romaneio` paralelo (outra entidade) que **o Fiscal não enxergava** e
gerava numeração/arquivo duplicados. A Visão previsto×expedido + filtros Excel
saiu junto (era da nossa versão; não fazia parte do fluxo do Vitor).

## Um modelo só de SharePoint (unificado 03/08)
Antes a **importação** da Lista/expedido usava `SHAREPOINT_DRIVE_ID` e o **save** do
romaneio usava o drive SERVIDOR (`resolveServidorDriveId`) — risco de divergência.
**Unificado:** `lib/lista-avancada-sharepoint.js` agora resolve o drive pelo MESMO
`resolveServidorDriveId()` do `sharepoint-lpc`/`sharepoint-lista` (biblioteca
SERVIDOR; fallback = `SHAREPOINT_DRIVE_ID`) e usa `SHAREPOINT_OP_BASE_FOLDER`. Assim
**leitura e escrita ficam no mesmo drive/base por construção** — o romaneio salvo é
lido pela sincronização (o ciclo do "expedido" fecha). Um modelo só, caminhos do Vitor.

> Nota: `SHAREPOINT_SERVIDOR_DRIVE_ID` não está setado em produção; a resolução acha
> a biblioteca "SERVIDOR" por nome ou cai no fallback. Se quiser fixar, definir a env.

## Fila de pré-romaneios na aba "Romaneios" (04/08)
A aba **Romaneios** (`/expedicao`, tela principal do módulo) agora mostra uma
**fila consolidada dos pré-romaneios (`RomaneioPrevio`)** de todas as OPs abertas —
o que o **Planejamento** monta dentro da OP já aparece aqui, sem a Expedição ter que
entrar OP por OP. É o mesmo dado que a Expedição vê no espelho (`/expedicao/op`),
reunido num lugar só.
- API: `GET /api/expedicao/romaneios-previos` (roles `ADMIN/EXPEDICAO/PRODUCAO/COMERCIAL`)
  — retorna só os `RomaneioPrevio` **NÃO emitidos** (`emitidoEm = null`) e não cancelados
  de OPs abertas, com `op{numero,cliente,obra}`, `itensCount`, `pesoKg`, `dataPrevista`,
  e `situacao` (**PREVISTO** = em aberto / **APROVADO** = liberado). Emitido sai da fila
  (vira romaneio → Fiscal / SharePoint). Ordem: por data prevista (sem data por último).
- UI (`ExpedicaoClient.jsx`): tabela "Pré-romaneios do Planejamento" com badge de
  situação (Em aberto / Liberado), respeita o filtro por OP existente, badge
  "N aguardando emissão" no cabeçalho, e botão **"Abrir na OP"** →
  `/expedicao/op?op=<opId>` pra emitir o FORM 22.
- Deep-link: `ExpedicaoOpClient` aceita `?op=<id>` (via `page.js` `searchParams`) e já
  abre a OP selecionada no espelho.

## Limpeza da aba Romaneios (04/08)
Na tela principal (`/expedicao`) saíram os **4 KPIs de valores**, o botão
**"+ Novo Romaneio"** (+ modal) e a tabela **"Romaneios emitidos"** — era o fluxo
manual antigo (`Romaneio`, peso/R$kg) que ninguém alimentava. Ficou: filtro por OP +
**Pré-romaneios do Planejamento** + **Romaneios SharePoint (por OP)**. `page.js` não
busca mais os `Romaneio` manuais.

## Nova aba "Romaneios Terceirizados" (04/08)
Controle **À PARTE** (sem vínculo com o romaneio da obra) de material enviado a
terceiros pra trabalhar (galvanização, usinagem, pintura, jato…) — **envio e retorno**.
Menu: **Expedição → Terceirizados** (`/expedicao/terceiros`).

- **Model** `RomaneioTerceiro` (schema.prisma, tabela criada via `prisma db execute`,
  aditiva): série própria `numero` (RT-##), `terceiroNome` (+ `fornecedorId` opcional
  do Vendor List), `servico`, `opRefId/opRefNumero` (só rastreio, denormalizado, **sem
  FK**), transporte, `itens` Json `[{marca,descricao,qte,pesoUn,pesoTotal}]`,
  `pesoEnviadoKg`, `retornos` Json `[{id,data,itens,pesoKg,observacao,porNome}]`,
  `pesoRetornadoKg`, `status` (ENVIADO/PARCIAL/RETORNADO/CANCELADO), datas.
- **Status derivado do retorno**: 0 = ENVIADO; parcial = PARCIAL; ≥ enviado = RETORNADO.
- **API** (`/api/expedicao/terceiros`, roles `ADMIN/EXPEDICAO/PRODUCAO/COMERCIAL/ALMOXARIFADO`):
  `route.js` (GET list + proximoNumero, POST cria), `[id]/route.js` (GET/PATCH/DELETE),
  `[id]/retorno/route.js` (POST retorno parcial por peça + DELETE desfazer),
  `[id]/romaneio/route.js` (GET baixa Excel). Zod + AuditLog + 401/403.
- **Excel**: `lib/romaneio-terceiro-excel.js` — documento próprio no espírito do FORM 22
  (cabeçalho Torg, tabela Marca/Descrição/Qtd/Peso, total, assinaturas), **não** usa o
  template da obra. Download direto (sem SharePoint por enquanto).
- **UI**: `app/expedicao/terceiros/{page.js,TerceirizadosClient.jsx}` — KPIs (no terceiro/
  peso pendente/atrasados/retornados no mês), filtros por status + busca, tabela com
  linha expansível (itens + histórico de retornos), modal criar/editar (terceiro combobox
  Vendor List+livre, serviço, OP ref dropdown, itens, transporte, datas), modal
  **Registrar retorno** (marca a marca, parcial), baixar Excel, editar, excluir.
- Item do menu em `components/SidebarExpedicao.jsx` (ícone `Factory`).
- Validado: model (create/delete no banco) e Excel (buffer 7,7 KB) OK; telas compilam.

## Ideias futuras (não feitas)
- Salvar o Excel do romaneio terceirizado no SharePoint (definir pasta — não é da OP).
- Levar as **bolinhas de status do Syneco por marca** (montagem/solda) — que
  estavam no nosso `MontarRomaneio` — pro wizard de emitir do Vitor.
