
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

## 18/09/2026 — Prazo proposto, remoção da prévia e a página girada (Claude)

- **Feito (3 commits, no ar em `25d2ffbb93`, build 3278):**
  1. `572d4d97e9` — a data que o fornecedor manda pelo link público virou **proposta**; quem
     efetiva é `POST /api/compras/prazos-rm/prazo-proposto`. Colunas por
     `scripts/ensure-prazo-proposto.mjs`; regra em `lib/prazo-proposto.js`; tela em
     `app/compras/prazos/PropostaDePrazo.jsx`.
  2. `20b77e3d9c` — removido o "Enviar teste para mim" da cobrança, como combinado.
  3. `25d2ffbb93` — desenho da inspeção vinha cortado: `/Rotate` não era tratado. Espaço único em
     `lib/geometria-pagina.js`; `lib/vista-desenho.js` e `lib/campos-desenho.js` passam a ler nele.

- **Pareceres do Codex atendidos (`architecture`):**
  - prazo proposto: identificador de versão da proposta (409 na divergência), `prazoOriginal` da
    previsão EFETIVA e não da coluna crua, e o segundo efetivador
    (`/api/compras/entregas/prazo`) lendo dentro da transação e matando a proposta pendente.
  - página girada: a matriz **não** é `vp.transform` (Y para baixo × Y para cima — viraria de
    cabeça para baixo o que funciona), caixa convertida pelos **quatro** cantos, e retângulo
    emitindo os **quatro** lados em `verticais`/`horizontais`.

- **Testes:** 2350 passando. Novos: `testes/lib/geometria-pagina.teste.js`,
  `testes/lib/vista-desenho-rotacao.teste.js` (43 casos; **13 falham no código anterior**),
  `testes/api/prazo-proposto.teste.js`, `testes/proposta-de-prazo.teste.jsx`,
  `testes/entrega-fornecedor-tela.teste.jsx`.

- **Garantia de não-regressão medida (A/B antes × depois, folha `/Rotate 0`):** `820 x 210`,
  mesmos 83 segmentos, **hash de geometria idêntico**; os arquivos diferiam em 1 byte, que é
  carimbo de data comprimido. Travado como teste de caracterização.

- **Não validado / dúvidas para nova revisão:**
  - **A correção da rotação não foi confirmada contra o desenho real.** `AZURE_*` e `SHAREPOINT_*`
    são Secret na Vercel (`vercel env pull` devolve `[SENSITIVE]`), então `/vetor` e `/pagina` dão
    **502** no dev local e os testes usam folha sintética. Matheus informou depois que **o Vitor
    já ajustou o desenho da OP-105** — ou seja, o caso real segue sem confirmar qual mecanismo
    estava agindo.
  - **Risco herdado (Codex, alta):** relatório de folha girada que já tinha cota marcada precisa
    ser remarcado — a cota foi posta sobre uma vista errada e não há como reinterpretá-la. Não sei
    se existe algum além do T105.
  - `lib/vista-desenho.js` está com 679 linhas (teto 350). O Codex sugeriu separar extração
    vetorial de heurística de recorte; não fiz junto para não embaralhar o diff da correção.
    (Contexto: são 188 arquivos acima do teto no repositório.)

### 18/09/2026 (tarde) — revisão pedida à mão, porque o hook não rodou (Claude)

⚠ **O hook Stop recusou a revisão em TODOS os turnos desta sessão** com "Há tarefas em segundo
plano" (`ponte.py:216`, lê `evento["background_tasks"]`). Conferido: nenhum processo rodando,
nenhuma porta em uso, e o `execucao.lock` é de 09/09 e está vazio. O sinalizador ficou preso.
**Vale olhar isso** — o efeito é a revisão automática não acontecer e ninguém perceber.

Submeti à mão o que já estava no ar: perfil `security` (rota pública do fornecedor) e `testing`
(correção da rotação).

- **`security` — nenhum CRITICAL, nenhum HIGH.** Confirmado que não há caminho para efetivar
  prazo, recebimento ou cobrança apenas com o token público. Pendências anotadas:
  - *(MEDIUM, preexistente)* o limite de avisos é contornável por concorrência: a checagem vem
    antes do envio e o carimbo depois. Sugestão: reservar a permissão atomicamente.
  - *(MEDIUM)* **escritas públicas sem limite de taxa** — alternar data/motivo gera transação,
    linha de auditoria e novo `prazoPropostoId` a cada chamada, mesmo com os avisos esgotados, e
    ainda provoca 409 sucessivos para Compras. **Decisão do time:** limitar por token/IP?
  - *(LOW, preexistente)* o prefixo `[Fornecedor]` não prova origem — comentário interno que comece
    com ele também sairia no GET público.
  - **Feito:** `prazoPropostoId` virou `randomUUID` (sugestão do parecer).

- **`testing` — a álgebra de `D` e a conversão de caixa foram confirmadas** para 0/90/180/270 e
  CropBox deslocada. Furos apontados e **corrigidos agora**:
  - caixa do texto usava `x + largura, y + altura` (só vale sem rotação) → agora pelos 4 cantos;
  - o oráculo dos testes era a inversa da própria implementação → agora é externo
    (`convertToViewportPoint` do PDF.js);
  - retângulo como operador de caminho não tinha teste → coberto.
  - **Achado novo, fora do parecer:** `closePath` não era tratado em nenhum dos quatro
    percorredores. Perdia o lado de fechamento (3 retângulos → 9 segmentos em vez de 12) e o
    `else ai += 2` dessincronizava o resto do traçado. **Vale em folha `0°` também.**

- **Pendências que NÃO tratei, para nova revisão:**
  - `mapeiaTextos` reduz orientação a um booleano `v`: não distingue 90° de 270°, nem 0° de 180°.
    Mexe em `RecorteDesenho.jsx` e `MarcadorCotas.jsx` — é mudança de contrato de tela.
  - `pontosDaPagina`, `verticais` e `horizontais` não processam `paintFormXObject*`, enquanto
    `segsDoConteudo` processa. Divergência preexistente.
  - **Geometria persistida:** o Codex discorda de eu ter resolvido "remarcar" só no CLAUDE.md, e
    tem razão em um ponto que eu errei — eu disse que folha `0°` não muda, mas **CropBox deslocada
    afeta `/Rotate 0`**, e **180° preserva as dimensões** (podia ter recorte/cota válidos antes).
    Além de recortes e cotas, há ocultações de texto/linha reusadas em
    `lib/relatorio-dimensional-pdf.js`. Precisa de decisão: versionar o espaço de coordenadas ou
    identificar e invalidar os registros afetados.
  - `lib/vista-desenho.js` segue com ~690 linhas (teto 350), sem separar extração de heurística.
  - **O caso real continua não validado** — o Vitor ajustou o desenho da OP-105 por fora.

⚠ O Codex não conseguiu EXECUTAR testes nas duas consultas (Vitest falhou ao criar diretório
temporário, `ENOENT`). Os pareceres são estáticos; quem rodou a suíte fui eu (2386 passando).

