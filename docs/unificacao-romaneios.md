# Unificação dos fluxos de Romaneio — plano

> **Handoff / decisão** (Matheus + Vitor + Claude). Documento de planejamento.
> Criado: 04/08/2026. Status: **proposta, aguardando alinhamento com o Vitor**.

## Por que existe este documento
Hoje o portal tem **dois fluxos de romaneio paralelos que não se falam**. A aba
**"A Expedir"** (`/expedicao/pedidos`) parece redundante, mas na verdade é o único
lugar que cria o **`Romaneio` legado**, e esse `Romaneio` sustenta várias telas.
Antes de aposentar qualquer coisa, precisamos migrar quem depende dele. Este doc
mapeia o acoplamento e propõe a migração.

## Os dois fluxos

| | **Fluxo do Vitor** (oficial, módulo OPs) | **A Expedir** (legado) |
|---|---|---|
| Entidade | `LoteExpedicao` + `RomaneioPrevio` | `Romaneio` + `RomaneioItem` |
| Origem | **Lista de Expedição** (Engenharia, por **marca**) | **`PedidoExpedicao`** (Planejamento "Enviar à Expedição", por **destino**, a partir das entregas de `PecaConjunto`/Syneco) |
| Documento | **FORM 22** salvo no SharePoint (`4.2 Romaneios`) | Romaneio impresso (`/expedicao/romaneio/[id]/imprimir`) |
| NF | Módulo **Fiscal** (`RomaneioPrevio.nfNumero/nfTipo/nfEmitidaEm`) | **Omie** (`nfStatus/nfNumero/nfSerie/nfChave` no `Romaneio`) |
| Peso | `pesoKg` (previsto, da marca) | **`pesoRealKg`** (real expedido) |
| Receita | — | **`valorPorKg`/`valorTotal`** (R$/kg → Financeiro) |
| Vínculo com peça | itens = **texto** (marca/descrição) | `RomaneioItem` → **`pecaConjuntoId`/`rmItemId` + qtd** |
| Cria/emite em | `/expedicao/op` (espelho) e módulo OPs | `/expedicao/pedidos` (A Expedir) → `POST /api/producao/romaneio` |

## Quem CONSOME o `Romaneio` legado (o que quebra se sumir)
Levantamento (grep `prisma.romaneio.*` sem `Previo`/`Terceiro`):

| Tela / módulo | Arquivo | O que usa do `Romaneio` |
|---|---|---|
| **Checklist** (Expedição) | `app/api/expedicao/checklist/route.js` | `RomaneioItem.qtd` por `pecaConjuntoId`/`rmItemId` (**qtd expedida** por peça/RM), `pesoRealKg`, `valorTotal` |
| **Confronto** (Expedição) | `app/api/expedicao/confronto/route.js` | idem — `qtdExpedida` por peça, `pesoRealKg`, `valorTotal` |
| **Relatório** (Expedição) | `app/api/expedicao/relatorio/route.js` | `pesoRealKg`, `valorTotal` por OP (peso/valor expedido) |
| **KPIs** (Expedição) | `lib/expedicao.js` | `aggregate _sum pesoRealKg` |
| **Romaneios (Produção)** | `app/producao/romaneios/page.js` | lista `Romaneio` (peso, valor, transportadora) |
| **Cronograma — peso** | `app/api/planejamento/cronogramas/[id]/peso/route.js` | `Romaneio` da OP (peso expedido no cronograma) |
| **Expedição Semanal** | `app/api/planejamento/expedicao-semanal/route.js` | `Romaneio` + `PedidoExpedicao` (handoff) |
| **Impressão** | `app/expedicao/romaneio/[id]/imprimir/page.js` | romaneio completo p/ imprimir |
| **Carga do Planejamento** | relação `Romaneio.planejamentoCarga` (1:1 `PlanejamentoCarga`) | vínculo carga↔romaneio |

**Cria o `Romaneio`:** só a A Expedir (`PedidosExpedicaoClient` → `POST /api/producao/romaneio`).
**Cria o `PedidoExpedicao`:** só o Planejamento (`/api/planejamento/expedicao/enviar`).

## Gaps a fechar (RomaneioPrevio hoje NÃO cobre)
1. **Vínculo item→peça** *(o mais difícil)*: Checklist/Confronto calculam "quanto de
   cada `PecaConjunto`/`RMItem` já foi expedido" a partir de `RomaneioItem.qtd`. O
   `RomaneioPrevio.itens` é **texto por marca**, sem `pecaConjuntoId`/`rmItemId`.
2. **Peso real vs previsto**: `RomaneioPrevio.pesoKg` é da marca (previsto); os
   consumidores usam `pesoRealKg` (real expedido). Definir onde entra o peso real.
3. **Receita (R$/kg)**: `valorPorKg/valorTotal` do legado alimenta o Financeiro;
   `RomaneioPrevio` não tem valor.
4. **NF Omie**: legado tem `nfStatus/nfSerie/nfChave` (Omie); `RomaneioPrevio` tem NF
   simples do Fiscal. Precisa unificar o modelo de NF.
5. **Destino**: legado tem `destino`; `RomaneioPrevio` tem `local`/`loteId`.
6. **Origem do handoff**: Planejamento manda por **destino** (`PedidoExpedicao` das
   entregas de `PecaConjunto`); o fluxo do Vitor parte da **Lista de Expedição** por
   marca. Reconciliar as duas origens é decisão de processo, não só de código.

## Proposta de migração (faseada, sem big-bang)
> Princípio: **ninguém perde dado**. Migra-se consumidor por consumidor, comparando
> com o legado, atrás de flag, e só se aposenta o legado no fim.

- **Fase 0 — Alinhamento com o Vitor** (dono do fluxo oficial). Decidir as questões
  abertas abaixo antes de tocar em schema.
- **Fase 1 — Camada de leitura única**: criar em `lib/` um "serviço de expedição"
  que devolve, por OP, os **itens expedidos** (peça, qtd, peso, valor, NF) a partir
  do fluxo do Vitor. Enriquecer `RomaneioPrevio.itens` com `pecaConjuntoId` (casar por
  marca na emissão) e registrar **peso real** e **valor** no ato de emitir.
- **Fase 2 — Migrar consumidores** (um a um, com flag e comparação com o legado):
  Relatório e KPIs (só somam peso/valor — mais fáceis) → Cronograma peso →
  Checklist/Confronto (dependem do vínculo por peça — mais difíceis) → Produção.
- **Fase 3 — Handoff do Planejamento**: decidir se o "Enviar à Expedição" passa a
  criar/alimentar o fluxo do Vitor (lote por destino) ou é aposentado.
- **Fase 4 — Backfill**: converter `Romaneio` históricos em `RomaneioPrevio` emitidos
  (ou manter leitura dupla durante a transição).
- **Fase 5 — Aposentar**: remover A Expedir, `Romaneio`/`RomaneioItem`/`PedidoExpedicao`
  e o `POST /api/producao/romaneio` só depois de tudo migrado e conferido.

## Questões abertas (decidir com o Vitor)
1. **Peso real**: capturar no ato de emitir o romaneio (Expedição digita/pesagem) ou
   assumir o peso das marcas como "expedido"?
2. **Receita**: o valor R$/kg continua por romaneio? De onde vem (preço da OP)?
3. **NF**: unifica no Fiscal (RomaneioPrevio) ou mantém a via Omie? Precisamos de
   `nfSerie/nfChave` no fluxo unificado?
4. **Origem**: o handoff do Planejamento (por destino) vira lote no fluxo do Vitor, ou
   a Expedição passa a montar tudo a partir da Lista de Expedição por marca?
5. **Vínculo por peça**: casar marca→`PecaConjunto` automaticamente é confiável no
   parque de dados atual? (define a viabilidade de Checklist/Confronto no novo fluxo)

## Enquanto a unificação não acontece
A A Expedir **fica como está** (é load-bearing). Nada de escondê-la antes da Fase 5,
senão Checklist/Relatório/Produção/cronograma param de receber romaneios novos.
