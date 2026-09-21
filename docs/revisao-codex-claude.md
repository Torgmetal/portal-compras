
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

### 18/09/2026 (noite) — os três pendentes da revisão, fechados (Claude) — `8a14ae626e`

- **Form XObject com `/Matrix` própria** — *era o item "HIGH, condicional ao PDF" do parecer.*
  Investigado até o fim: o pdf.js emite a COLOCAÇÃO do form como `transform` (que todos os
  percorredores já tratavam) e a matriz INTERNA à parte. Logo, o problema só aparece com `/Matrix`
  não-identidade — **reproduzido**: `[2 0 0 2 50 30]` dava vertical em x=10 no lugar de x=70.
  Corrigido em `pontosDaPagina`, `verticais` e `horizontais`. Teste monta o PDF à mão (o pdf-lib
  só gera form identidade, que já passava).

- **Teto de escrita na rota pública** — *MEDIUM do parecer de `security`.* `podeEscrever`: 10/hora
  e 30/dia por pedido, **429**. Falha ABERTO de propósito (justificativa no código e no CLAUDE.md).
  ⚠ Fiz por token/pedido, **não por IP** — em Vercel o IP vem de `x-forwarded-for` e é falsificável;
  quem abusa já tem o token, que é o eixo que importa. Se o time quiser IP também, é acrescentar.

- **Geometria persistida** — *o ponto em que você discordou de mim, com razão.* Recorte salvo passa
  a levar `espaco: ESPACO_ATUAL`. Sem carimbo, só vale onde a matriz da página é IDENTIDADE; em
  folha girada é ignorado, cai no automático e a **tela avisa** (`MarcadorCotas`), além de `/pagina`
  não pré-carregar a caixa morta. Decisão **por desenho, na hora de ler**, não por migração — não
  há como saber quais folhas são giradas sem abrir cada PDF, e as credenciais não saem da Vercel.
  ⚠ Corrigi a afirmação errada que eu tinha feito: o corte não é "`/Rotate 0` está a salvo", é
  **matriz identidade** (CropBox deslocada afeta 0°; 180° preserva dimensões).

- **Ainda em aberto, para nova revisão:**
  - `mapeiaTextos` reduz orientação ao booleano `v` (não distingue 90 de 270, nem 0 de 180). Mexe
    em `RecorteDesenho.jsx` e `MarcadorCotas.jsx` — mudança de contrato de tela, não fiz.
  - **Cotas** continuam sem carimbo de espaço; a defesa hoje é o aviso na tela quando o recorte é
    descartado. Carimbá-las exige mexer na persistência do relatório.
  - `lib/vista-desenho.js` ~700 linhas (teto 350), sem separar extração de heurística.
  - O caso real (OP-105) segue sem confirmar qual mecanismo agia — o Vitor ajustou por fora.
    ⚠ Note que de lá para cá apareceram **três** causas independentes de "desenho incompleto":
    rotação, `closePath` e `/Matrix` de form. As duas últimas valem em folha `0°`.

- **Estado:** 2403 testes passando; `/qualidade/inspecoes` e `/compras/prazos` validadas logado.


## 20/09/2026 — Cronograma medido pela lista de peças da fase (OP-105 por TAG) (Claude)

- **Feito:** `lib/cronograma-lotes.js` (regra pura: escopo e produção por lote × setor a partir de
  `PecaLote`, croqui pelo vínculo na proporção do conjunto, marca repartida preenche as fases na ordem de
  entrega, teto na LPC); `lib/cronograma-syneco.js` passa a devolver `sync.porLote` e a casar a área pelo
  nome do lote antes da letra (chave de ambiguidade `L:<lote>|SETOR`); tarefa de manutenção
  `op105-fases-por-tag` (`lib/op105-fases-por-tag.js` + `.json`): rechaveia a LPC da fase C ("105" → "T105C"),
  divide a fase A em TC 4706 / TC 4707 (lote, áreas e tarefas do cronograma) e grava as listas. Testes:
  `testes/lib/cronograma-lotes.teste.js` (5). Simulação com dados reais da 105 no histórico da sessão.
- **Para revisar (`database`/`architecture`):** (1) `qtdNoConjunto` tratado como TOTAL no conjunto
  (medido: 133/135 croquis da T105A) — se algum importador gravar por unidade, a proporção erra;
  (2) a tarefa faz UPDATEs fora de transação, em passos idempotentes — se cair no meio, rodar de novo
  completa; (3) `sincronizarCronogramaSyneco` só carrega `ConjuntoCroqui` quando a OP tem lote com lista.
  O script `scripts/revisao-codex/consultar.py` continua ausente do clone.
- **Depende do usuário:** clicar a tarefa em Admin › Manutenção e importar `T105B- LPC_R00.xlsx` em
  Engenharia › Listas.

## 21/09/2026 — Envio de cotação: fornecedor da Vendor List sem e-mail / com dois e-mails (Claude)

- **Relato:** Vitor: "no portal de compras não estamos conseguindo enviar a cotação". Nenhuma
  `Cotacao` desde 17/09 19:32; itens das RMs T122-001/002 seguem PENDENTE; nada mudou no código do
  envio desde 16/09. Medido no banco: **435 fornecedores ativos sem e-mail** (GERDAU ACOS LONGOS ×6)
  e **10 com dois e-mails no mesmo campo** (ARCELORMITTAL) — importação do Omie de 25/08.
- **Causa:** `montarFornecedoresEnvio` fazia `f.email.toLowerCase()` fora do `try` do `submit` →
  TypeError no handler, tela sem mensagem; dois e-mails passavam pelo cliente e o servidor devolvia
  400 com o `e.message` (JSON) do Zod.
- **Feito:** `lib/fornecedores-envio.js` (`emailPrincipal`, `separarEmails`, erro nomeando o
  fornecedor; o `RMsTabelaSeletor` deixa de ter cópia própria), `components/compras/LinhaFornecedorPicker.jsx`
  (chip "sem e-mail", checkbox desligado, "informar e-mail" que faz `PATCH /api/fornecedores/[id]`),
  `submit` inteiro no `try` nos dois modais + `res.json().catch`, `mensagemDeValidacao` em
  `/api/cotacao/enviar`, importação do Omie separando e-mails, tarefa de manutenção
  `fornecedor-email-multiplo`. Testes: `testes/lib/fornecedores-envio`, `testes/lib/fornecedores-email-multiplo`,
  `testes/api/cotacao-enviar-validacao`, `testes/componentes/linha-fornecedor-picker` (2440 passando).
- **Para revisar (security/testing):** o `PATCH` de e-mail pela linha do picker usa a rota existente
  (ADMIN/COMPRAS, Zod `email`, AuditLog `edit_fornecedor`) — conferir se convém restringir o corpo
  que a linha manda (`{ email }` só). Não validei a tela logado (sem credenciais nesta sessão): a prova
  é teste de componente + build. `scripts/revisao-codex/consultar.py` segue ausente do clone.
- **Depende do usuário:** Compras repetir o envio e, se falhar, mandar o texto da tarja; clicar
  `fornecedor-email-multiplo` em Admin › Manutenção.

### 21/09/2026 (10h) — o 500 depois da primeira correção (Claude)

- **Relato:** "O servidor respondeu 500 sem detalhes" na T122-001 (7 fornecedores × 9 itens); nada gravado.
- **Evidência:** função em `iad1`, Neon em `sa-east-1` (~120 ms/statement); a transação fazia ~85
  statements (create aninhado por item) contra o teto padrão de 5 s; e o log ao vivo mostrou `P1001`
  às 09:59:27. Dry-run da rota com os dados reais da T122-001 e escritas interceptadas: 6 statements agora.
- **Feito:** `lib/cotacao-envio-gravacao.js` (lote + token como chave), rota com `aquecerBanco` +
  `withDbRetry` + 500 em JSON com a causa + 400 para prazo inválido + `maxDuration 60`. Testes:
  `testes/api/cotacao-enviar-gravacao` (6). 2446 passando; checar limpo; build ok.
- **Para revisar (database):** `createManyAndReturn` com `select` no pooler (PgBouncer) — statement
  único com N linhas; o aviso do `CLAUDE.md` sobre bulk write é para milhares de linhas, aqui são dezenas.
- **Achado paralelo, não tratado:** `/api/qualidade/plp/[opNumero]` seleciona `indiceR` (inexistente em
  `DocumentoQualidade`) → 500 desde 22/08.
- **(10h30)** Envio confirmado: T122-001 10/10 e-mails; T122-002 10/12 (Resend, ~2 req/s, `Promise.all`).
  Feito: fila com pausa de 600 ms + `email_cotacao_falha` no AuditLog. Testes +2 (2448).

## 21/09/2026 (13h30) — Pré-montagem: o servidor recusava o segundo projeto (Claude)

- **Relato:** "não estamos conseguindo mais salvar os projetos da OP-105 de pré-montagem no relatório".
- **Evidência:** dry-run da criação com os dados reais da OP-105 — 1 projeto passa, 2 projetos → 400
  "Relatório de conjunto é um por conjunto…" (regra do dimensional alcançando PRE_MONTAGEM via
  `usaCotas`); os 5 RPM existentes têm 1 projeto cada.
- **Feito:** criação exige ≥1 projeto e sai da regra; `POST /[id]/projetos` soma na pré-montagem
  (teto 12, sem repetir) e troca nos outros; rótulo do botão. Testes:
  `testes/api/inspecoes-pre-montagem-projetos` (5). 2460 passando; checar limpo; build ok.
- **Para revisar (testing):** o PDF do RPM com vários desenhos (`gerarDimensionalPDF`) — o detalhe já
  tinha seletor por desenho, mas não validei a impressão com 3 projetos.
- **(14h)** Anexar projeto nunca vinculou: `requireRole` antes do `handleUpload` dava 401 ao webhook
  `blob.upload-completed` (sem cookie), único lugar que gravava. Feito: sessão dentro de
  `onBeforeGenerateToken`, `PUT` de vínculo pelo navegador (host do blob + `head()`), webhook como
  reserva com log, `lib/inspecao-anexo.js`; pré-montagem soma, outros trocam; `DELETE ?marca=`.
  Testes: `inspecoes-desenho-anexo` (7) + `anexar-projeto` (3). 2470 passando; build ok.
  **Para revisar (security):** o `PUT` aceita URL do navegador — restrito ao host do blob e a PDF
  existente; conferir se convém amarrar também ao `tokenPayload` (relatorioId) do upload.
