
## 16/09/2026 — Referências do cliente, aditivo como pedido novo, comunicado aos setores (Claude)

- **Feito:** `Cliente` (dicionário de termos), `OPReferencia` (PROJETO/PEDIDO/ITEM/TAG/OUTRO com rótulo
  fotografado), `AditivoAceite`; `Aditivo.status/valor/divulgado*`, `OPReceita.aditivoId`,
  `OPMedicao.aditivoId`; rotas `/api/comercial/clientes`, `/api/comercial/op/[id]/referencias`,
  `/api/comercial/aditivo/[id]/divulgar|cobrar`, `/api/aditivo/aceite/[token]`; telas: nova OP
  (referências com os termos do cliente), aba Obra, modal/cartão do aditivo (pedido + TAGs + valor +
  Divulgar), Comercial › Clientes, painel de aceites com aditivos. Testes: `testes/lib/referencias-cliente`,
  `testes/lib/aditivo-comunicado`. Spec: `docs/superpowers/specs/2026-09-16-referencias-cliente-aditivo-design.md`.
- **Dúvida para o Codex (`database`):** o desenho de `OPReferencia` (árvore por `paiId`, escopo por
  `aditivoId`) e o recálculo de `OP.refCliente` — `scripts/revisao-codex/consultar.py` não está no clone,
  a consulta não rodou. Pedido guardado em texto no histórico da sessão.

## 16/09/2026 — Portal do cliente: aba "Pedidos e faturamento" (Claude)

- **Feito:** `lib/cliente-faturamento.js` (regra pura: OC ↔ pedido Omie ↔ parcelas, situação, notas),
  `lib/cliente-faturamento-servidor.js`, `lib/notas-omie.js` + `NotaFiscalOmie` (nº da NF por parcela),
  `lib/cliente-faturamento-excel.js`; rotas `/api/cliente/faturamento` (+`/excel`), `/api/comercial/op/[id]/contatos`
  (papéis por contato); telas `/cliente/faturamento`, cartão no `/cliente`, modal "Contatos e acessos" na aba Obra.
  Testes: `testes/lib/cliente-faturamento.teste.js`, `testes/cliente-faturamento-tela.teste.jsx`.
- **Para revisar (security):** a checagem do papel por e-mail da sessão em `opsComFaturamentoPara` (JSONB
  `array_contains` + filtro em JS) e o `?como=` restrito a ADMIN/COMERCIAL. O script de consulta ao Codex
  continua ausente do clone.

## 17/09/2026 — Aditivo: página de abertura com receita digitada à mão (Claude)

- **Feito:** `/comercial/[id]/aditivo/novo` (page + `NovoAditivoClient`), `components/comercial/ReceitasAditivoEditor`,
  `lib/receita-aditivo.js` (conta pura; a rota `/api/comercial/op/[id]/aditivo` usa `receitasDoAditivo` e aceita
  `receitas[]` validado por Zod); cartão do aditivo na aba Obra mostra a receita; `ModalAditivo` removido do
  `OPDetailClient`. Testes: `testes/lib/receita-aditivo.teste.js`, `testes/receitas-aditivo-editor.teste.jsx`,
  `testes/aditivos-obra-tela.teste.jsx`.
- **Para revisar (`security`/`database`):** a rota devolve 400 com a primeira issue do Zod (antes estourava 500);
  precedência digitado > planilha > valor único. O script `scripts/revisao-codex/consultar.py` continua ausente do clone.

## 17/09/2026 — Dois crons parados: sync-sharepoint (17 dias) e cmr-reconciliar (60h) (Claude)

- **Feito:** `escolherPlanilhaDaPasta` + fallback por prefixo em `downloadPlanilhaProducao` (o arquivo
  do PCP ganhou o mês no fim do nome); `findEapSheetName` passa a RECUSAR aba EAP de outro mês (a
  planilha de setembro só tem "EAP JUNHO" — o fallback mudo gravaria junho todo dia); resumo do cron
  diz qual aba leu; `graphGet` com retry/backoff nas LEITURAS do Graph em `lib/cmr-sharepoint.js`
  (escrita não é retentada, para não duplicar linha no Excel). Testes:
  `testes/lib/planilha-producao-nome.teste.js`, `testes/lib/parse-pcp-eap-aba.teste.js`,
  `testes/lib/cmr-graph-retry.teste.js`.
- **Para revisar (`architecture`):** se a recusa da aba de outro mês deve virar alerta no monitor em
  vez de só falha do cron. Pendência do PCP: criar a aba EAP do mês vigente.
