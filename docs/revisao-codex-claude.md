
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

## 21/09/2026 (14h30) — Contatos do cliente editáveis na OP + obras liberadas por login (Claude)

- **Pedido:** "como eu vinculo as OPs para um usuário do cliente?" → "eu não consigo adicionar novos
  e-mails" → "preciso deixar uma forma de conseguir liberar as OPs que eu quero que ele veja".
- **Feito:** `PUT /api/comercial/op/[id]/contatos` (lista completa; `atualizarContatosCliente` carrega
  função/telefones quando vêm), `ModalEditarContatosCliente` na aba Obra; `lib/cliente-obras.js` +
  `GET/PUT /api/admin/usuarios/[id]/obras` (liberar = e-mail nos contatos da OP; revogar = tirar;
  idempotente) + `ObrasDoCliente` na página do usuário CLIENTE. Testes: `contatos-cliente` (+1),
  `op-contatos-editar` (4), `admin-usuario-obras` (7), `contatos-cliente-obra` (3). 2492 passando; build ok.
- **Para revisar (security):** o `PUT` de obras é `requireAdminDoPortal` (allowlist Vitor/Matheus) e
  grava em `OP.clienteContatos` — conferir se Comercial/Planejamento também deveriam poder liberar.
- **(19h30)** Excel: `refinarPlanilhaExcel` só congela o painel se o cabeçalho da tabela está até a
  linha 10 (`LINHA_MAXIMA_CONGELAR`), com opt-out `_torgSemCongelar`. Teste `excel-congelar-painel` (3).

## 21/09/2026 (noite) — Ambiente de demonstração (Claude)

- **Pedido:** localhost com OP fake da Vale, da abertura à expedição, para apresentar ao cliente.
- **Feito:** Postgres 17 local + `scripts/demo-banco.sh` (pg_dump → `torg_demo`); `lib/modo-demo.js`
  (`MODO_DEMO=1`): e-mail não sai, Omie recusa/pedido `DEMO-…`, SharePoint grava em `DEMO/…` (pais
  criados só em demo); `components/FaixaDemo.jsx`; `npm run demo` (3002) + launch; modelo
  `docs/env-demo.exemplo`. Teste `modo-demo` (4). 2546 passando; build ok.
- **Para revisar (security):** fora do modo demo nada muda (flag lida por `process.env`); conferir se
  vale bloquear `MODO_DEMO=1` em produção (ex.: recusar quando `VERCEL_ENV === "production"`).

## 21/09/2026 (21h) — O "PDF: R$ X" acendia vermelho em linha certa (Claude)

- **Pedido:** validar na tela o casamento PDF × RM (pendência aprovada em "Subir 1 e 2"). Feito com
  Playwright interceptando **só** `/api/cotacao/anexar/*` — a única rota do fluxo que grava —, com o
  parse e o casamento rodando de verdade. **Zero escrita em produção**, 1 tentativa bloqueada por
  rodada. Medido: **T122-001 8 de 9** e **T122-002 7 de 8**, com as duas sobras sendo recusas
  corretas.
- **Defeito que a validação achou:** as 7 linhas casadas da T122-002 saíram TODAS com o aviso
  vermelho `⚠ PDF: R$ …`, e as 7 estavam certas. A tela comparava `preço × qtd` (líquido) contra o
  `total` do parser, que no layout SOUFER é **com IPI** (3,25% naquele documento). Não é regressão:
  só ficou visível porque antes nada casava e nada era comparado.
- **Medição (não dedução):** os dois PDFs reais da SOUFER, 17 linhas somadas, fecham em
  `qtd × preço × (1 + IPI/100)` com erro de **0,000%** em todas.
- **Parecer do Codex (`architecture`):** favorável a normalizar na fonte, **condicionado a
  confirmar o layout** — apontou que uma linha de exemplo do próprio `SOUFER_RE` não fecha (é
  comentário errado, conferido no PDF real), que o regex GERDAU descarta uma terceira coluna de
  porcentagem, e que `totalBruto = null` não desliga a comparação (cai no `total`). E classificou
  como **risco ALTO** a reescrita de preço em `sanitizeItens`. Tudo tratado abaixo.
- **Feito:** `lib/cotacao-total-pdf.js` (`BASE_TOTAL`, `divergeDoPdf`, `ehTotalComImposto`); o parser
  carimba a base (SOUFER `COM_IPI` medido; **GERDAU sem carimbo de propósito** → aceita as duas
  leituras, sem falso positivo e sem perder a checagem); `sanitizeItens` saiu para
  `lib/cotacao-itens-ia.js` (a rota passava de 410 linhas, agora 339) com a guarda que **impede a
  reescrita do preço** quando o total é o com imposto. O número exibido continua o **impresso no
  PDF** — converter para líquido mostraria valor que não está em documento nenhum.
- **Provado na tela:** 7 de 7 vermelhos viraram cinza; o documento de IPI zero segue igual.
  Testes novos: `cotacao-total-pdf` (12) + `cotacao-itens-ia` (7). **2554 passando; lint sem erro.**
- **Para revisar (testing):** o caminho da IA **não é testável na tela aqui** — sem
  `ANTHROPIC_API_KEY` no `.env.local` a rota dá 500 e o fluxo cai no regex. A guarda está coberta só
  por teste de unidade; vale conferir em produção qual base a IA devolve de fato nestes PDFs.
- **Pendência registrada:** GERDAU sem PDF real para medir a base, e a terceira coluna de
  porcentagem do `GERDAU_RE` continua descartada.
- **(22h)** RNC: a exclusão deixa de ser cega. O `diff` do `EXCLUIR_RNC` era `{}` — foi o que fez a
  recuperação da RNC-019 virar arqueologia (timestamp no `cuid`, fotos órfãs no blob; cliente, OP e
  descrição não voltaram). Agora o registro INTEIRO e o plano 5W2H vão para o `diff`, na MESMA
  transação da exclusão, e o `.catch(() => {})` da auditoria saiu: não conseguir preservar a cópia
  impede apagar. `deleteMany` no plano (dentro de transação interativa, query que estoura aborta
  tudo mesmo com `.catch`). 404 no id inexistente. Teste `rnc-excluir` (6). 2578 passando.
  **Para revisar (database):** a transação envolve `auditLog.create` com um JSON do registro
  inteiro — conferir se algum campo grande (fotos/anexos com muitos itens) merece corte.
  **Pendente de decisão do Vitor/Matheus:** se RNC deveria ser CANCELÁVEL em vez de excluível.

## 22/09/2026 — Os cinco achados do Codex no MES (Claude)

Revisão automática do commit do MES em produção. **Os cinco conferidos no código antes de mexer**;
todos procedem. Três são anteriores ao meu trabalho (o saldo, o teto do nesting, o encerramento);
dois são buracos do que EU fiz (o isolamento parou nas APIs e não chegou às telas).

1. **ALTA — uma etapa comia o saldo da seguinte.** `MesSessao.operacao` era gravada
   (`recurso.setor.codigo`) e não participava de conta nenhuma: cortar as 10 peças de uma marca na
   PREPARAÇÃO fazia MONTAGEM e SOLDA verem as mesmas 10 como produzidas e recusarem o PRIMEIRO
   apontamento delas. `operacao` entrou em `saldoDaMarca`, `saldosDasMarcas` e `produzidoPorMarca`.
   ⚠ Continua somando entre POSTOS da mesma etapa — é o que a peça física permite.
2. **ALTA — a segunda barra do nesting nascia bloqueada.** `planejadoQtd` vem da unidade, o saldo
   desconta todas as sessões da marca: duas barras de 2 peças ficavam com teto 2 em vez de 4. Agora
   o reuso SOMA — e só quando a UNIDADE é nova, senão o reenvio com outro id de lote inflaria.
3. **ALTA — concluir uma marca encerrava o POSTO.** A tela chama `encerrar` sozinha, e
   `encerrarNaTransacao` gravava ENCERRAMENTO sem olhar as outras sessões (`encerrarLote` já tinha
   a guarda; o caminho individual não). O monitor mostrava a máquina parada com duas marcas ainda
   produzindo, e essa duração entrava no OEE. ⚠ A contagem ficou DENTRO do `!semEvento`: no lote
   quem decide é `encerrarLote`, e contar por marca seria o N+1 que acabei de tirar do totem.
4. **ALTA — o isolamento parava na API.** A página do totem ignorava `searchParams`, o cliente não
   mandava `ambiente`, e ausência vale PROD: abrir o posto DEMO caía no PROD de mesmo código.
   Agora o ambiente vem da URL, viaja em toda chamada e em todo link, a lista filtra, há seletor
   Produção/Simulação e **tarja âmbar no totem de DEMO**.
5. **MEDIA — `planosDoPosto` com `take: 10` sem filtro.** Dez importações de teste empurravam para
   fora todos os planos reais do posto, e ainda ofereciam opções que `abrirNesting` recusa depois.

**Testes:** `mes-etapas-saldo` (9, novo) + `totem-bancadas` (+1). **2.844 passando** (eram 2.834).
Telas `/mes-lab/totem`, `?ambiente=DEMO` e `/mes-lab/monitor` sem erro de console nem 4xx/5xx.
Índices conferidos no banco: `MesRecurso_codigo_ambiente_key` e `MesOperador_cracha_ambiente_key`
existem como `btree (codigo, ambiente)` e `btree (cracha, ambiente)`.

⚠ **NÃO empurrei nem escrevi em produção** — a rodada de correção proíbe. A prova de banco do
achado 4 (dois recursos de mesmo código em DEMO e PROD coexistindo) exige INSERT e ficou de fora;
o que dá para afirmar sem escrever é a definição dos índices, acima.

## 22/09/2026 (3ª rodada) — o teto do nesting, que eu tinha corrigido pela metade (Claude)

O Codex reprovou de novo, com razão: o meu `increment` só cobria a sessão ainda **ABERTA**.

> Após produzir as 2 peças da primeira barra, o frontend encerra a sessão automaticamente. Abrir a
> segunda barra cria outra sessão com planejadoQtd=2, enquanto saldoDaMarca desconta as 2 peças da
> sessão anterior: saldo zero para duas peças legítimas. Em outro posto, também não ocorre
> reutilização.

⚠⚠ **A RAIZ: `planejadoQtd` QUER DIZER COISAS DIFERENTES NOS DOIS CAMINHOS.** No manual é o total
da MARCA; no nesting é a quantidade daquela BARRA. O saldo soma as BOAS de todas as irmãs mas
tomava o planejado de UMA sessão.

**O teto passou a ser DERIVADO** (`comporTeto`, `lib/mes/saldo.js`): as barras distintas entre as
irmãs (`Set`, cada uma contada uma vez) e o total digitado à parte, em `planejadoManual`.
`Math.max` entre os dois — o digitado é o total da marca e as barras são um recorte dele; somar
inflaria.

Quatro achados do parecer `database` que o meu desenho não cobria:

1. **Origem do planejamento perdida.** Sessão manual (total 10) que depois recebe uma barra passa a
   ter `nestingUnidades` — e o filtro "sem unidades" a tirava do manual: teto desabava de 10 para
   2. Por isso o total digitado ganhou **coluna própria**, que o nesting não toca.
2. **Atalhos `planejadoQtd <= 0 → semTeto`** nas duas funções: sessão com zero pode ter irmãs com
   teto válido — e era por ali que a segunda barra escapava da conta.
3. **Identidade da obra na agregação**: `MesNestingItem` tem `opNumero`, e unidade+marca não
   garante obra única. Entrou no filtro.
4. **Referência quebrada virando "sem teto"**: plano apagado/reimportado faz a soma voltar zero, e
   zero quer dizer ILIMITADO. Agora é recusa com mensagem própria.

⚠ No lote, `groupBy` por unidade e repartição **por grupo (obra+marca+etapa+ambiente)** — agrupar
só por marca misturaria contextos.

**Testes:** `mes-teto-nesting` (10, novo) cobrindo simultâneo, sequencial, postos diferentes, mesma
barra em duas sessões, manual→nesting, nesting acima do manual e referência quebrada.
**2.854 passando.** Telas do MES sem erro de console nem 4xx/5xx.

**Prova de banco** (autorizada pelo Matheus): `PROVA 1` e crachá `PROVA-9999` criados nos DOIS
ambientes com ids distintos; duplicata no MESMO ambiente recusada com `P2002`; linhas removidas ao
fim (0 recursos, 0 setores).

⚠ **Fica pendente, explicitamente não feito:** o Codex apontou que a mesma barra aberta em dois
postos não é impedida — o `Set` evita dobrar o TETO, mas não detecta produção duplicada. A saída
seria uma reserva exclusiva por unidade+etapa+ambiente, com transferência explícita. É desenho
novo, não conserto, e não entra sem o Matheus decidir.
- **(23h40, 4ª rodada)** Dois defeitos a mais, ambos ALTA, ambos conferidos e corrigidos:
  **(a) coluna nova com DEFAULT 0 apagando planejamento.** `planejadoManual` nascia 0 e
  `comporTeto` não olha mais `planejadoQtd`: sessão antiga manual com total 10 viraria `semTeto` —
  trava solta. `transportarPlanejadoManual` no ensure transporta as PURAMENTE manuais
  (`cardinality("nestingUnidades") = 0`) e **conta e avisa** as mistas, sem adivinhar: ali
  `planejadoQtd` virou soma de origens diferentes e chutar seria inventar teto. ⚠ Em produção o
  efeito é zero (as tabelas estão vazias); o conserto é para o dia em que não estiverem.
  **(b) leitura e gravação discordando sobre a obra do item.** `abrirNesting` resolve
  `i.opNumero ?? unidade.nesting.opNumero`; a leitura em lote aceitava item com `opNumero` nulo e a
  individual o excluía — a tela mostrava saldo e o apontamento era recusado como "referência
  quebrada". Agora as duas passam pelo mesmo `itemContaPara`/`somarItens`, e a individual usa
  `groupBy` em vez de `aggregate` justamente para a regra não virar `where` em SQL de um lado só.
  Testes: `mes-teto-nesting` (+3, agora 13). **2.857 passando.**
  Novo: `scripts/mes-zerar.mjs` — apaga o MES inteiro (ou só o movimento, com `--manter-cadastro`),
  numa transação, só com `--confirmo`, e conferindo que sobrou zero. Não alcança o portal por
  construção: só nomeia tabelas do schema `mes`.
- **22/09 (manhã)** Regressão do modo demo: `pastaDeGravacao` normalizava o caminho fora do demo e
  derrubou TODA gravação no SharePoint em produção (lote de desenhos OP-94/118, romaneio, data book).
  Corrigido: fora do demo devolve o caminho intocado; teste novo cobre o caminho antigo.
- **(22/09, manhã)** Última divergência tela × gravação fechada: a busca das irmãs preferia `opId`
  e caía para `opNumero`; o agrupamento particionava por `opId`. Para a sessão de NESTING — que
  nasce sem `opId`, porque `abrirNesting` só manda `opNumero` — a busca varria a obra pelo número e
  juntava as manuais, mas o agrupamento separava justamente essas. Medido no exemplo do parecer:
  manual encerrada (planejado 10, 2 boas) + nesting de 2 peças → tela dizia teto 2/saldo 2, gravação
  dizia teto 10/saldo 8. **A identidade da obra virou UMA função (`daObra`)**, usada pela busca e
  pelo agrupamento, com a precedência INVERTIDA: `opNumero` primeiro, porque é o campo que os dois
  caminhos de abertura preenchem. Testes `mes-teto-nesting` (+3, agora 16). **2.860 passando.**
  ⚠ O seletor de DEMO saiu da tela (decisão do Matheus); coluna, índices e filtros ficam.
  ⚠ **Segue aberto e NÃO foi feito:** a mesma barra aberta em dois postos não é impedida — precisa
  de reserva exclusiva por unidade+etapa+ambiente, que é desenho novo e aguarda o Matheus.

## 22/09/2026 — Relatório de US: cabeçote sem marca, material padrão, junta soldada (Claude)

- **Pedidos do Vitor, na tela e no PDF do RUS:** "tirar esse Mitech, pois já informamos a marca dele
  antes — deixar apenas angular 20x22 70 · 2"; "o ângulo não precisa [do símbolo de] grau"; "deixe
  ela pré-setado em aço carbono" (Material); "pode tirar esse AWS a frente do procedimento"; "não
  tenho campo para informar o processo de soldagem".
- **Feito:** `CABECOTES` com `fabricante` separado + `rotuloCabecote`/`cabecotesPorFabricante`
  (a marca virou título de `optgroup`, porque Mitech e Doppler têm o mesmo 20x22 nos três ângulos, e
  o formulário grava `cbFabricante`); `MATERIAL_PADRAO` nos valores iniciais, no normalizador e no
  formulário aberto; `PROCEDIMENTO_US` sem a norma, com normalização do nome antigo; campos da junta
  ensaiada (processo de soldagem, metal de adição, tipo de junta, chanfro, técnica, desenho) no
  computador e no celular — o PDF já os imprimia sem ter onde preencher. Testes: `us-relatorio` (+9).
  2874 passando; build ok.
- **Para revisar (testing):** a chave da junta passou a ser `tipoJunta` (a do EVS/LP); o PDF lê
  `tipoJunta || junta` para não perder o que já estivesse gravado.
- **De passagem:** `npm run checar` acusou `CheckCircle2` usado sem import em
  `app/mes-lab/totem/[codigo]/Escolher.jsx` (commit 07dc4916) — corrigido em commit próprio.
- **(22/09, tarde)** Mais três no RUS: seletor de espessura de chapa (8 mm → 3", lista conferida no
  banco; rótulo com a bitola comercial, valor gravado em mm), aparelhagem da casa pré-preenchida
  (`APARELHAGEM_PADRAO_US` — Mitech MDF350B/FD10012912 e o cabeçote 20x22 2 MHz, ⚠ sem o ângulo
  real, que é medido) e **guarda de valor fora da lista** nos seletores: relatório antigo tem o
  cabeçote com a marca, que não existe mais entre as opções — sem isso o campo abriria vazio e a
  gravação seguinte apagaria o registro.
- **(22/09, 09h)** Junta ensaiada do RUS conforme a casa: processo de soldagem em lista (GMAW/FCAW),
  chanfro em lista (X/V), tipo de junta e técnica nascem preenchidos (Topo, Direto). ⚠ Processo e
  chanfro NÃO têm padrão — são escolha do inspetor, como o ângulo real.
- **(22/09, 09h15)** Relatório assinado com campos em branco (EVS/LP da OP-102, assinados pelo
  Geraldo com penetrante, revelador e tempos vazios): a rota `/revisao` passou a aceitar
  `PERFIS_CAMPO` — quem inspeciona é quem completa, e a revisão continua sendo o único caminho
  (congela a rodada, sobe o R, exige motivo). A tarja passou a dizer QUEM assinou. Teste
  `inspecao-revisao-perfil` (3).
  ⚠ **Para revisar (security):** dar ao `QUALIDADE_CAMPO` o poder de abrir revisão descarta
  assinaturas de terceiros — está auditado e com motivo obrigatório, mas convém uma segunda leitura.

- **(22/09, 09h)** Mesma linha, terceira rodada — o ESPELHO do defeito anterior. `{ opId }` solto na
  busca não particiona nada: a sessão aberta SÓ por id varria também as que têm id E número, e o
  agrupamento separava as duas. Medido pelo parecer: `A={opId:"op1", opNumero:null}` e
  `B={opId:"op1", opNumero:"107"}`, ambas com `planejadoManual` 10 e 2 boas em B → tela de A dizia
  saldo 10, gravação calculava 8. **`daObra` ficou ESTRITO**: sem número, a obra é
  `{ opNumero: null, opId }` — as duas condições juntas. Aí "ser irmã" é relação de equivalência e a
  chave do grupo é literalmente a mesma pergunta que o `where` faz.
  ⚠ O preço de partição estrita é a obra existir em duas formas (uma sessão só com id, outra com
  id e número) e ganhar dois tetos. Por isso a PORTA passou a completar o número quando só vem o id:
  `numeroDaObra` (`lib/mes/programado.js`, cross-banco como o resto da lib) chamado no `abrir` da
  rota do totem. Não achar a OP não impede abrir — seria trocar teto duplicado por operador parado.
  Testes `mes-teto-nesting` (+4, agora 20), **com fake que aplica o `where`** — pedido do parecer:
  mock que devolve a lista inteira prova só que as duas funções somam igual, não que escolhem as
  mesmas irmãs. Conferido que o teste FALHA no código anterior (saldo 10 × 8). **2.873 passando.**
  ⚠ `testes/lib/carga-simular.teste.js` estourou 5 s na suíte completa e passa sozinho (25/25) —
  flake de carga da máquina, ao lado de um teste de 41 s; não é deste trabalho.
  ⚠ **Segue aberto e continua sendo decisão do Matheus:** reserva exclusiva por barra
  (unidade+etapa+ambiente) com transferência explícita entre postos.
