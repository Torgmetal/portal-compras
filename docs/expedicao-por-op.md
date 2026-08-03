# Expedição por OP — status e arquitetura

> **Handoff / acompanhamento** (Matheus + Vitor + Claude). Documento vivo.
> Última atualização: 03/08/2026.

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

## Ideias futuras (não feitas)
- Levar as **bolinhas de status do Syneco por marca** (montagem/solda) — que
  estavam no nosso `MontarRomaneio` — pro wizard de emitir do Vitor.
