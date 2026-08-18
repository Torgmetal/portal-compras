# Handoff — estado atual e próximos passos (para o Vitor)

> **Documento vivo.** Última atualização: **18/08/2026** · Autor: Matheus + Claude.
> Objetivo: você conseguir ver tudo que mexemos e **seguir de onde paramos**.
> Docs detalhados relacionados: [`expedicao-por-op.md`](expedicao-por-op.md) ·
> [`unificacao-romaneios.md`](unificacao-romaneios.md).

Legenda: ✅ feito e no ar · ⏳ pendente/decisão · 🔜 próximo passo sugerido.

---

## 1. Fluxo Terceirizados (envio de material p/ terceiro) — colaborativo, ATIVO

Ponta a ponta hoje: **PCP (Prioridades) → romaneio a terceiro → SharePoint → Fiscal (Remessa)**.

- **PCP → envio a terceiro**: no painel de Liberar/Prioridades, seleciona peças e envia
  a um terceiro (fornecedor + romaneio **RT-##**). *(commits `af71e452`, `768cc5d4`, `2c0f4dcc` — Vitor)*
- **RomaneioTerceiro** (`/expedicao/terceiros`, model `RomaneioTerceiro`): controle À PARTE
  do romaneio de obra. Envio + **retorno parcial por peça**, série própria RT-##. *(Claude)*
- **2º romaneio de MATERIAL** (perfis a cortar) p/ **NF de retorno** — só saindo de Corte/Montagem;
  escolha **chapa inteira × cortada**; peso normalizado pelo peso real do conjunto. *(commits
  `b6b69bed`, `891b596f`, `73c1792`, `b7165aed` — Vitor)*
- **SharePoint**: romaneios salvos em `{OP}/4. Expedição/4.7 Romaneios enviados a terceiros`
  (fallback global `01. OP/Romaneios terceiros`). Modelo **FORM 22** (`lib/romaneio-terceiro-form22.js`). *(commits `e49f0be8`, `c55c666c`, `b6c1ddf2`)*
- **Aba "Terceiros" no painel da OP** (`/comercial/[id]`): histórico + retorno. *(commit `3e3728b2` — Vitor)*

**Onde fica o fiscal disso → seção 2.**

---

## 2. Fiscal — aba "Remessa Terceiro" (NF de remessa p/ industrialização)

### ✅ Fase 1 (feito — commit `00a222849`)
- Cada `RomaneioTerceiro` **pré-cria uma remessa PENDENTE** (campo `remessaStatus` default
  PENDENTE — por construção, sem gatilho extra).
- Nova aba **Fiscal → "Remessa Terceiro"** (`/fiscal/remessa-terceiro`): fila com terceiro +
  **CNPJ/UF** (Vendor List), OP ref, itens/peso, **CFOP sugerido** (5901 SP / 6901 fora) e
  natureza "Remessa para industrialização".
- Botão **Emitir NF** → registra número/série/chave (bookkeeping, igual à aba Romaneios/NF).
  Também **Dispensar** e **Reabrir**.
- Model: campos `remessa*` em `RomaneioTerceiro` (migração aditiva, sem `db push`).
- API: `app/api/fiscal/remessa-terceiro/route.js` (GET fila) + `[id]/route.js` (PATCH
  registrar/dispensar/reabrir). Roles `ADMIN/FISCAL/FINANCEIRO`.
- UI: `app/fiscal/remessa-terceiro/{page.js,RemessaTerceiroClient.jsx}` + item no `SidebarFiscal`.

### ⏳ Fase 2 — emissão 100% integrada no Omie (NÃO ligada de propósito)
Decisão do Matheus: emitir a NF-e direto pelo portal. **Ainda não liguei o disparo** porque
o portal **nunca emitiu NF** (só consulta o Omie) e NF-e é **irreversível**. Pré-requisitos:
1. **Marcas → produtos do Omie**: a NF-e exige cada item como produto cadastrado (nCodProd/NCM).
   As marcas (T64A…) precisam de mapeamento p/ produto Omie.
2. **Terceiro como cliente no Omie** (destinatário da nota).
3. **Teste em homologação** antes da 1ª NF real.

🔜 **Próximo passo**: investigar o caminho de emissão via **pedido de venda** (`IncluirPedido`
em `produtos/pedido/` + avançar etapa → faturamento) — a infra de escrita no Omie já existe
(`omie-pedido-compra.js` usa `IncluirPedCompra`). Trazer plano concreto antes de disparar.

---

## 3. Expedição — reforma da aba "Romaneios" ✅

- **Pré-romaneios do Planejamento** na aba Romaneios: fila consolidada dos `RomaneioPrevio`
  não emitidos de todas as OPs; botão "Abrir na OP" (deep-link `?op=`). *(o `/expedicao/op` é
  espelho do fluxo do Vitor — ver [`expedicao-por-op.md`](expedicao-por-op.md)).*
- **Indicadores**: Aguardando emissão · Romaneios emitidos (semana/mês, via `emitidoEm`) ·
  Atrasados. `GET /api/expedicao/indicadores`.
- **Limpeza**: removidos os KPIs de valores, o botão "Novo Romaneio" e a tabela "Romaneios
  emitidos" (fluxo manual `Romaneio` legado).
- **Menu enxuto**: saíram do menu **A Expedir**, **Checklist** e **Prog. Cargas** (páginas/APIs
  intactas — só tiradas do `SidebarExpedicao`; reversível).

---

## 4. Unificação dos romaneios (legado × fluxo do Vitor) — PLANO ⏳

Existem **dois fluxos de romaneio que não se falam**: o `Romaneio` legado (fed pela antiga
"A Expedir"/PedidoExpedicao, alimenta Checklist/Relatório/Produção/cronograma) e o
`RomaneioPrevio`/FORM 22 → Fiscal (seu fluxo oficial). Plano completo + 5 decisões abertas em
[`unificacao-romaneios.md`](unificacao-romaneios.md). Maior gap: o `RomaneioItem` legado
vincula item→peça (`pecaConjuntoId`); o `RomaneioPrevio` guarda só marca-texto.

---

## 5. RH → Documentos (conformidade por cargo/setor) ✅

- **Dispensa de documento por funcionário** (`DocumentoDispensa`): item vira **DISPENSADO**
  (sai de AUSENTE, não conta na conformidade). Botões "Dispensar"/"Tornar obrigatório".
- **NRs dispensáveis**: todos os NRs (10/12/33/35) podem ser dispensados por funcionário.
- **NR-20** obrigatória por **setor Pintura** (todo o setor exposto a inflamáveis).
- **Formação (Técnico/Superior)** e **Registro em Órgão de Classe** por **cargo** (matriz
  FORM-11): Formação p/ Analista de PCP, Analista de Suprimentos, Coord. Produção, Orçamentista,
  Projetista; Registro de Classe só Orçamentista/Projetista.
- **Botão "Anexar"** direto no checklist de conformidade (abre o upload já preenchido com
  funcionário + categoria + tipo — resolve o "sumiu" do dropdown filtrado por categoria).
- **Motor genérico** em `lib/regras-documentos.js`: escopos `TODOS/PRODUCAO/EMPRESA/
  MONTAGEM_EXTERNA/SETOR/CARGO` (`setores:[]` / `cargos:[]`). `regrasParaFuncionario(setor, cargo)`.

---

## 6. Comercial → Materiais da OP + Conciliação de recebimento ✅

- **Coluna Material** quebra linha (não corta mais o nome). `components/MateriaisOPSection.jsx`.
- **Conciliação de recebimento (sync-entregas) — fix FD**: pedido marcado `faturamentoDireto`
  desviava só pra remessa e **ignorava a NF de entrada + `nQtdeRec`**. Agora **sempre** checa
  recebimento por quantidade + NF (inclusive FD); remessa "faturada" é sinal adicional.
  `lib/omie-recebimento.js`. *(o #1721 da OP-102 voltou a conciliar: 14/20 itens "Recebido" c/ NF 44914).*
  - ⏳ **6 itens de "0 barras" na OP-102**: a RM perdeu o peso na importação → nunca conciliam.
    Conserto é na **origem (Engenharia/RM)**, repopular o peso.

---

## 7. Infra — cold start do Neon nos crons ✅

- Causa dos e-mails "cron com problema": o Neon **suspende a compute** (scale-to-zero); o 1º
  query do cron estoura antes de acordar (`P1001`). `lib/db-retry.js` → **`aquecerBanco(prisma)`**
  (SELECT 1 com retry) no início de **todos os crons monitorados**; `registrarExecucao` retenta
  o heartbeat. ⚠️ **Correção definitiva é infra**: desligar o scale-to-zero / subir o mínimo de
  autoscaling no painel do Neon.

---

## 8. Relatórios — histórico de envios ao cliente ✅
A linha "Enviado ao cliente Nx" abre o histórico (para quem / quando / por quem). Dados já
estavam em `RelatorioStatus.envios`.

---

## Pendências / próximos passos (resumo)
1. ⏳ **Fase 2 — emissão da remessa no Omie** (3 pré-requisitos acima). 🔜 investigar `IncluirPedido`.
2. ⏳ **Unificação dos romaneios** (5 decisões — `unificacao-romaneios.md`).
3. ⏳ **6 itens "0 barras" da OP-102** — corrigir peso na RM (Engenharia).
4. ⚠️ **Infra Neon** — desligar scale-to-zero (fim definitivo dos alertas de cron).
5. Ideia futura: bolinhas de status Syneco por marca no wizard de emitir romaneio.
