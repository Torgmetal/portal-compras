
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
- **(22/09, 09h20)** Vitor: "não precisa gerar revisão, pode apenas alterar as informações". O 409 de
  relatório enviado para assinatura saiu (computador e celular); entrou `editadoAposAssinatura` +
  `assinaturasVigentes` na auditoria e a tarja com quem assinou. Três testes que afirmavam o bloqueio
  foram reescritos para a regra nova; `inspecao-editar-assinado` (3) cobre o registro. 2899 passando.
  ⚠ **Para revisar (security/processo):** a proteção agora é registro, não trava — conferir se o
  data book (que é entregue) continua exigindo revisão, como deve.

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
- **(22/09, 09h30)** Matheus autorizou fechar as pendências ("liberdade total") e o Codex aprovou o
  desenho ANTES do código (consulta `architecture`). Duas do MES fechadas:
  **(a) tetos separados para sessão legada sem número.** `numeroDaObra` só alcança a abertura nova;
  o que já estava gravado continuava em dois grupos. `completarNumeroDaObra`, no ensure, preenche o
  `opNumero` a partir do `opId` (join com `public."OP"`) **e recalcula a `chaveTrabalho`**, que
  deriva dele — preencher um sem o outro deixaria a trava de "mesma marca duas vezes no mesmo
  posto" olhando para uma identidade que não existe mais. ⚠ A linha que colidiria com uma sessão
  ABERTA já existente fica de fora e é CONTADA: juntar duas sessões é decisão humana, não chute de
  script de build.
  **(b) a mesma barra em dois postos** — a pendência das três rodadas. `mes."MesUnidadeReserva"`
  com índice parcial único `(unidadeId, ambiente) WHERE "liberadaEm" IS NULL`; liberação
  centralizada em `encerrarNaTransacao` (a tela encerra marca a marca); transferência explícita em
  `lib/mes/transferencia.js`, que **não move produção** e **recusa** sessão compartilhada com outro
  comando; liberação de emergência do ADMIN, com motivo e auditoria. Sem expiração por tempo.
  Testes: `mes-reserva-barra` (14, novo) — o fake IMITA o índice parcial, e conferi que 7 deles
  falham sem a mudança. **2.914 passando.** Tela `/mes-lab/totem` sem erro de console nem 4xx/5xx.
  Prova contra a produção: 2ª posse recusada pelo banco, DEMO não conflita, liberada→outro pega;
  linhas de prova removidas (tabela em zero).
  ⚠⚠ **LIMITE DECLARADO, não resolvido:** isto impede a barra ABERTA em dois postos, não a barra
  REABERTA depois. Fechar exige o apontamento saber a UNIDADE (hoje ele conhece a sessão, que é por
  marca). Está escrito em `docs/mes-proprio.md` §17.9.
- **(22/09) Dois achados do Codex são do trabalho do Vitor, e NÃO foram tocados** — Matheus:
  *"pendências do Vitor a gente não deve mexer, ignora, deixe para ele ajustar"*. Ficam registrados
  aqui para ele decidir:
  **(1) ALTA — o cabeçote Doppler é gravado como Mitech.** `lib/us-campos.js` tem os mesmos rótulos
  ("angular 20x22 · 45 · 2 MHz") para Mitech e Doppler, e os dois formulários
  (`app/qualidade/inspecoes/[id]/FormUS.jsx:39`, `app/campo/FormularioUSCampo.jsx:68`) resolvem o
  fabricante com `find` pelo RÓTULO — que acha Mitech primeiro. O relatório identifica o
  equipamento errado. Some a isso que `cbFabricante` **não está na lista de campos que o PATCH do
  Campo persiste** (`app/api/campo/relatorios/[id]/route.js:228`), então o fabricante escolhido é
  descartado na gravação. Saída sugerida pelo Codex: valor de opção com identidade única
  (fabricante+modelo), e `cbFabricante` na lista de campos.
  **(2) ALTA — decisão de acesso.** `app/api/qualidade/inspecoes/[id]/revisao/route.js:23` passou de
  ADMIN/QUALIDADE para `PERFIS_CAMPO`: todo QUALIDADE_CAMPO pode reabrir QUALQUER relatório já
  enviado para assinatura, de qualquer inspetor e qualquer OP, reiniciando o ciclo de aprovação. O
  pedido de origem era pontual (a Lais completar os EVS/LP da OP-102). É decisão do Vitor se a
  permissão deve ser geral ou limitada ao próprio inspetor.
- **(22/09, 09h50) Dois ciclos de correção sobre a reserva de barra, quatro achados, todos meus:**
  **(1) ALTA — transação abortada não aceita consulta.** A reserva entrava com `create` e um `catch`
  do `P2002` que ia perguntar ao banco quem era a dona — dentro de uma transação que o Postgres já
  tinha matado por causa do próprio erro. A recusa de negócio viraria **500** na cara do operador, e
  o fake do teste não mostrava porque fake nenhum aborta transação. Mesma lição do `deleteMany` da
  exclusão de RNC. Agora: `INSERT ... ON CONFLICT DO NOTHING` e a dona perguntada depois, com a
  transação viva. O fake passou a imitar o `ON CONFLICT` (zero linhas, nunca exceção).
  **(2) ALTA — a dona relida depois da trava** na liberação do ADMIN: as chaves travadas saíam da
  leitura feita ANTES, e uma transferência concorrente faria este código encerrar as sessões do
  posto NOVO sem nunca ter travado a máquina dele.
  **(3) MÉDIA — motivo em branco.** Eu tinha escrito que a liberação "exige motivo" e substituído a
  ausência por um texto genérico; a auditoria gravava `motivo: null`. Agora recusa antes de mutar.
  **(4) MÉDIA — trazer a barra apagava a PARADA do destino.** `abrirLote` já perguntava o estado do
  posto antes de gravar PRODUCAO; a transferência gravava direto, e o tempo de PARADA/MANUTENÇÃO/
  FORA_TURNO/SETUP parava de ser contado no OEE. É o achado que o próprio lote pagou para aprender,
  reaparecendo por outra porta — **porque eu repeti a regra em vez de reusá-la**. Virou
  `lib/mes/evento-posto.js`, usado pelos dois (`comecarNoPosto`, `encerrarPostoSeVazio`).
  Testes `mes-reserva-barra` (23), com os 4 estados protegidos cobertos; conferido que falham sem a
  correção. **2.926 passando.**
  ⚠ **Não provado:** duas transações concorrentes de verdade no Postgres (o teste é fake) e o
  `ON CONFLICT` contra o banco real — o ciclo pedia para não fazer operação em produção.
- **(22/09, 10h) Relatório de pintura: a numeração das fotos e a condição ambiental por etapa.**
  Dois pedidos do Vitor, medidos no RIP-102-002 antes de mexer em código.
  **(a) fotos.** *"as fotos estão ficando com marcação errada (…) ele marcar 1/8 2/8"*: a moldura da
  folha 2 dizia "Medição de Espessura · 1 de 8" e as outras SETE saíam na folha de registro **sem
  número**, com a legenda repetindo o ensaio ("Medição de Espessura · Medição de Espessura", 7×). O
  índice era calculado só na moldura. Agora sai de `numerarPorEvidencia`/`legendaDaFoto`
  (`lib/fotos-evidencia.js`), que as duas folhas chamam — índice **dentro do ensaio**, sem "1 de 1",
  sem número em foto sem área, e a legenda do inspetor entra só quando diz algo além do rótulo.
  Conferido no PDF real da produção: `1 de 2 / 2 de 2` e `1 de 8 … 8 de 8`.
  **(b) ambiente.** *"precisas que tenha o campo para informarmos tanto no jato, quanto no fundo
  quanto nas demais demãos"*: havia UM bloco (`prep*`), copiado para as três colunas — o RIP-102-002
  declarava 41% / 24 °C / 23 °C no jato do dia 17 de manhã, no fundo do 17 à tarde e na 2ª demão do
  dia 18. `ETAPAS_AMBIENTE` + `leiturasAmbientais` + `ambientePorEtapa` (`lib/pintura-campos.js`)
  viram a regra única; o celular ganhou o bloco por demão (`app/campo/PinturaAmbiente.jsx`) e o
  aviso de herança; o PDF passou a rotular "UMIDADE NO JATO" e a **nomear a etapa** fora do PO-05.
  ⚠ A herança (demão sem leitura usa a do jato) foi **mantida** — é de 04/09 e evita coluna vazia —,
  mas o campo da tela nunca mostra o valor herdado, senão salvar viraria medição inventada.
  **(c) micragem seca mínima aberta** (pedido no meio do trabalho): `espessuraMinima` entrou na
  lista fechada do `PATCH /api/campo/relatorios/[id]` e virou campo editável no portal de campo.
  ⚠⚠ **PENDENTE, do Vitor:** cada demão é julgada contra o mínimo do SISTEMA. Medido: fundo 76–110
  µm × mínimo 220 do PLP — o fundo acende vermelho sempre, e baixar o campo para 80 faria o PDF
  declarar ao cliente um sistema de 80 µm. O certo é mínimo **por demão** (o PLP tem
  `demaos[].espessuraMin`); não implementei porque depende de confirmar se aquele valor é por demão
  ou acumulado.
  Testes: `pintura-fotos-numeracao` (6), `pintura-ambiente-etapas` (6), `campo-pintura-ambiente` (3),
  `campo-espessura-minima` (3) — todos vermelhos antes. **2.935 passando**, `npm run checar` limpo,
  `next build` ok. `app/campo/Pintura.jsx` voltou para baixo do teto de 350 linhas com a extração de
  `controles.jsx` e `PinturaAmbiente.jsx`.
- **(22/09, 10h15) Fechado o achado ALTA do Codex sobre o cabeçote — era meu, de hoje de manhã.**
  Mitech e Doppler têm "angular 20x22" nos mesmos três ângulos; tirado o nome da marca do rótulo
  (pedido do Vitor), as duas telas descobriam o fabricante com `find` pelo TEXTO da opção — que acha
  Mitech primeiro. Escolher o Doppler gravava **Mitech** no relatório que vai ao cliente. Agora cada
  opção tem identidade própria (`chaveCabecote` = `fabricante|rótulo`, em `lib/us-campos.js`) e a
  marca sai da chave, não de uma busca. O que fica gravado não mudou: rótulo em `cbModelo`, marca em
  `cbFabricante`. ⚠ E `cbFabricante` **não estava na lista fechada** do `PATCH /api/campo/...`: no
  celular, a marca escolhida era descartada na gravação. Entrou.
  ⚠ Conferido na produção antes de mexer: existe **1** relatório de US (RUS-113-001), com o rótulo
  antigo ("Mitech angular 20x22 · 70° · 2 MHz") e `cbFabricante` vazio — nenhum dado errado gravado.
  A opção "(registrado antes)" mantém esse valor à vista nas duas telas.
  Testes: `us-cabecote-fabricante` (4, novo) — o terceiro reproduz o defeito pela tela de verdade
  (esperava Doppler, vinha Mitech). **2.948 passando**, `checar` limpo, build ok.
  ⚠⚠ **O segundo achado do Codex continua aberto e é decisão do Vitor**: `revisao/route.js` passou
  de ADMIN/QUALIDADE para `PERFIS_CAMPO`, então todo QUALIDADE_CAMPO pode reabrir qualquer relatório
  já enviado para assinatura, de qualquer inspetor e qualquer OP.
- **(22/09, 14h) Marca pela metade sumia da próxima carga (OP-067).** Larissa (PCP): *"eram 2 peças
  de cada marca, e uma peça de cada foi enviada no romaneio 24, o portal entende que as peças já
  foram expedidas e não aparece para que eu possa selecionar, ou ele ignora quando subo a lista"*.
  Medido antes de mexer: a leitura dos FORM 22 da pasta (`marcasExpedidasOP`) somava o peso, guardava
  os números e **descartava o `qtd` de cada linha**, gravando na marca um booleano
  (`expedidoRomaneio: true`) — e as três marcas da OP-067 estão assim, com `romaneio: "24"`. Nos 20
  romaneios da obra **nenhuma linha está sem quantidade**: a 24 diz `qtd: 1` para as três.
  A regra virou `lib/expedido-por-romaneio.js`, usada pela importação e pelas duas APIs que contavam
  isso em paralelo (marcas da lista e produção da OP).
  ⚠⚠ Dois riscos que o desenho precisou cobrir, os dois medidos na pasta da OP-067: **(a)** "08" e
  "09 R1" são o MESMO romaneio com os mesmos 22 itens (idem 14/15 e 21/22) → **máximo por número**,
  nunca soma entre arquivos; **(b)** o prévio 27 está emitido **e** existe "Romaneio R27" na pasta →
  as duas fontes se fundem **por número**, senão a mesma carga conta duas vezes.
  ⚠ Lista importada antes de hoje **não muda de comportamento**: sem `expedidoPorRomaneio` ela cai no
  booleano de sempre. O número novo nasce na reimportação ("Atualizar da pasta do servidor"), por
  obra. Simulado contra a produção na OP-067: 1.590 marcas confirmam inteiras, **33 viram parciais e
  41 peças voltam a aparecer**; 45 marcas embarcam MAIS que a LE (reenvio/LE revisada) e seguem
  limitadas ao total.
  Também: o filtro "Só pendentes" virou "Com peça pendente" (parcial tem peça a embarcar — era outro
  caminho para a marca sumir da tela), e a carga deixa de aceitar item com **0 peças**, que foi o que
  sobrou no prévio 28 da OP-067.
  ⚠ **Fora de escopo, declarado:** `pesoExpedido`/`pesoFaltante` da lista e `pesoFaltanteReal`
  (avanço da Expedição no cronograma) continuam contando a marca inteira pelo booleano — mexe no
  avanço de todas as obras e merece medição própria.
  Testes: `expedido-por-romaneio` (8) e `lista-expedicao-marcas-parcial` (5), com os dois casos
  vermelhos antes. **3.055 passando**, `checar` limpo, build ok.
- **(22/09, 15h30) O cliente passa a CONSULTAR o relatório fechado da obra liberada.** Vitor, sobre
  o Renato Massano (inspetor de qualidade da TMSA, contato da OP-105): *"vamos manter assim, apenas
  deixe disponível para ele consultar quando o Davi assinar"*. Medido antes: ele via a obra e uma
  lista vazia — zero `AssinaturaDocumento`, zero data book, fora dos 13 destinatários do portal; o
  único relatório da OP-105 (RPM-105-002) foi endereçado ao `pinho.davi@tmsa.ind.br`. Não era
  defeito: o espaço mostra o que foi **enviado para a pessoa assinar**, e essa regra fica.
  O que entra é leitura, em `lib/cliente-relatorios.js`, usada pela lista e pela rota nova do PDF.
  ⚠⚠ Três cortes que o desenho precisou fazer: **(a)** só com TODAS as assinaturas — documento em
  circulação volta para revisão, e mostrá-lo faria o inspetor do cliente conferir versão não
  fechada; **(b)** o `EnvioAssinatura.status` é best-effort (quem assina grava "CONCLUIDO" num
  update com `.catch(() => {})`), então quem manda são as assinaturas, com `REVISAO_PEDIDA` vencendo
  as colhidas; **(c)** só obra LIBERADA (contato da OP ou `clienteEmail`) — quem chegou à obra por
  ter assinado UM documento continua vendo só o dele.
  ⚠ Consulta não é pendência: fora do contador "a assinar" e do topo da lista; cartão cinza "para
  consulta", sem link de assinar. E o envio que ELE assina não aparece duas vezes.
  ⚠ A rota `/api/cliente/relatorio/[id]/pdf` não tem token: autoriza pela sessão e repassa
  `exigirOp`, então id trocado não entrega documento de outra obra. `no-store` + `no-referrer`.
  Testes: `cliente-relatorios` (8), `cliente-relatorio-consulta` (4), `cliente-relatorio-pdf` (5),
  `cliente-espaco-consulta-tela` (1) — os novos vermelhos antes. **3.078 passando**, checar limpo,
  build ok.
  ⚠ Na produção o RPM-105-002 ainda espera o Davi: até ele assinar, o espaço do Renato continua
  vazio — que é exatamente o combinado.
- **(22/09, 16h) A lista de peças voltou para o relatório já enviado para assinatura.** Vitor: *"ela
  não consegue puxar as peças informadas"*. O GET de `/api/qualidade/inspecoes/[id]` buscava as
  marcas da OP só `if (!rel.envioAssinaturaId)` — correto enquanto documento enviado era somente
  leitura, e obsoleto desde a edição liberada hoje de manhã: o editor abria com a lista de marcas
  VAZIA (datalist), sem de onde puxar a peça e sem preencher a quantidade. Os EVS/LP da OP-102, que
  motivaram aquela liberação, são exatamente os que têm envio.
  ⚠ Na mesma consulta entrou o filtro de **CROQUI** que o portal de campo já tinha: na OP-102 são
  216 croquis para 58 conjuntos — croqui é componente, não peça de inspeção, e marca repetida somaria
  quantidade errada. Medido: `tipoPeca` só assume null | CROQUI | CONJUNTO.
  ⚠ O teste que afirmava o contrário ("não busca listas atuais para relatório enviado") foi reescrito
  com o motivo — é o quinto teste desta semana que guardava a premissa "enviado = congelado".
  **3.078 passando**, checar limpo, build ok.
  ⚠ **Não confirmado com a Lais**: se o que falta for a lista de marcas nos tipos SEM quantidade
  (LP, US, EVS, pré-montagem), a tela mostra um textarea de marcas e não um seletor — aí é outra
  mudança, e depende de ela dizer em qual tela estava.
- **(22/09, 16h15) A peça entrava na carga e não chegava no romaneio.** Vitor: *"as peças da OP-67
  não está puxando para o romaneio"*. Duas coisas, ambas na emissão do FORM 22
  (`lotes-expedicao/[loteId]/romaneio`), e as duas nascidas do item que entrou no prévio com
  **quantidade 0** (as marcas que o portal dava por totalmente expedidas — ver a correção das 14h):
  **(1) sumia em silêncio.** `filter(it => it.qtd > 0)` descartava o item, e logo abaixo o prévio é
  **reescrito com o que foi emitido** — então a marca saía do romaneio E da carga, sem uma linha na
  tela. Agora volta nomeada (`ignoradas`, na resposta e no AuditLog), a tela **bloqueia** antes de
  emitir dizendo quais, e o campo de quantidade fica vermelho.
  **(2) peso ZERO mesmo corrigindo a quantidade.** O unitário era derivado do item do prévio
  (0 peças / 0 kg); o mapa da Lista de Expedição era sobrescrito por ele. Medido no teste: T67F62,
  37,1 kg para 2 peças, saía com `pesoKg: 0`. Agora, quando o item do prévio não tem de onde tirar o
  peso, quem responde é a Lista de Expedição — 18,55 kg por peça.
  Testes: `romaneio-item-zero` (4), três vermelhos antes. **3.082 passando**, checar limpo, build ok.
  ⚠ A reimportação da lista da OP-067 continua pendente (escrita no banco de produção, recusada pela
  trava desta sessão): sem ela as 33 marcas parciais seguem invisíveis na seleção.
- **(22/09, 16h40) Item avulso na carga — e a decisão de NÃO mexer na Lista de Expedição.** Vitor
  pediu uma forma de pôr item na mão ("enviar tinta para retoque"); sobre gravar peça nova na LE,
  decidiu: *"meu medo é de quebrar alguma lógica e ficar pior, acho que o caminho vai ser
  reimportar"*. Ficou só a parte contida: o avulso vive em `RomaneioPrevio.itens` + FORM 22.
  ⚠⚠ O acoplamento que a leitura do código revelou ANTES de escrever: `status-obra/route.js:48`
  soma o peso de TODOS os itens dos prévios emitidos como "expedido real" — a tinta entraria contra
  um contratado que não a tem. Daí `itensDeObra` (`lib/expedido-por-romaneio.js`), usada no
  `pesoKg` gravado na emissão, no status da obra e na simulação de carga. Romaneio sem avulso sai
  idêntico ao de antes.
  ⚠ O FORM 22 já tinha coluna **F = Unid.** e **G = código**: o avulso sai como "2 GL" sem tocar no
  modelo do Excel. Nome e descrição são obrigatórios — linha de romaneio que não diz o que é não
  serve para conferir carga.
  Testes: `romaneio-item-avulso` (5) e `itensDeObra` em `expedido-por-romaneio` (2), vermelhos antes.
  **3.089 passando**, checar limpo, build ok.
- **(22/09, 18h) Os cinco achados P1 da conversão de unidade e do CMR, e mais dois da rodada
  seguinte.** Commit `27594f5d43` fechou: (1) o `ReferenceError` que derrubava a sincronização
  inteira do CMR quando UMA criação falhava (`falhasDeCriacao.push` na zona morta do `const`);
  (2) bitola não contando como troca de material; (3) unidade escolhida sem fator gravando calado
  (25 CT viravam 25 UN); (4) o arredondamento acontecendo DEPOIS da conferência do total; (5)
  reabrir uma proposta convertida e salvar sem mexer em nada aumentando o preço.
  ⚠⚠ A rodada seguinte derrubou a solução de (2): comparar as medidas como **conjunto** perde
  ORDEM e REPETIÇÃO, e `CANTONEIRA 2 X 2 X 1/4` × `CANTONEIRA 2 X 4 X 1/4` dão o mesmo `{2,1,4}` —
  duas cantoneiras diferentes declaradas idênticas, com a segunda herdando certificado, corrida e
  NF da primeira. Virou **subsequência ordenada**: `[36]` cabe em ordem dentro de `[36; 4,75]`
  (detalhou), `[2;2;1;4]` não cabe em `[2;4;1;4]` (trocou).
  ⚠⚠ E a base da conversão ignorava o `peso`: item com peso é cotado em **KG**, não na unidade da
  coluna. Lendo a coluna crua, "UN" × "UN" parecia coincidência, a conversão era descartada e os
  números por peça viravam quilo no pedido do Omie. A regra `peso > 0 ? KG : unidade` estava escrita
  à mão em `page.js` da RM, em `pedido-itens.js` e no formulário do fornecedor — passou a morar em
  `unidadeEfetivaDoItem` (`lib/unidades.js`), com os três ligados nela.
  ⚠ **Dívida anotada, fora desta tarefa:** outras ~5 rotas repetem a mesma conta só para RÓTULO
  (`suprimentos`, `fornecedores/entrega`, `controle-financeiro`, `materiais`, `resumo-fd`). Não
  decidem conversão, então não foram trocadas — mas são cópias da mesma regra.
  ⚠⚠ **PENDÊNCIA DO VITOR — NÃO MEXIDA, por instrução do Matheus.** O Codex apontou P1 em
  `app/comercial/[id]/AbaExpedicao.jsx:617` (commit `498199259d`, de Vitor, que entrou neste diff
  pelo rebase): reabrir e revisar um romaneio perde a identificação dos avulsos, que voltam a
  contar como peças da obra — o GET de `/lotes-expedicao/pecas` projeta os itens do prévio sem
  `avulso` e sem `unidade`, e quando há `PecaLote` retorna antes e nem inclui os avulsos. É
  exatamente o acoplamento de `itensDeObra` que a entrada anterior deste log já descrevia.
  Fica registrado para ele, sem alteração nossa.
  ⚠ A chave **(série, índice)** do CMR segue aberta — Matheus mandou pular por ora.
  Testes: `cmr-reconciliar-falhas` (3) e `modal-lancar-manual-conversao` (2), novos e vermelhos
  antes; `cmr-planilha-manda` 21 → 28; `cotacao-conversao-unidade` 8 → 15.
  ⚠⚠ **(22/09, 18h10) PENDÊNCIA ACEITA POR MATHEUS — fração composta.** Terceira rodada sobre o
  mesmo defeito: `CANTONEIRA 2 X 2 X 1/4` dá `[2,2,1,4]` e `CANTONEIRA 2 X 2 X 1 1/4` dá
  `[2,2,1,1,4]` — a primeira É subsequência da segunda, então a espessura mudando de 1/4 para
  1 1/4 ainda é lida como "detalhou a descrição", e a peça nova herda certificado, corrida e NF da
  anterior. A saída é parsear a fração como VALOR (`1/4` → 0,25; `1 1/4` → 1,25) em vez de tratar
  numerador e denominador como dois números soltos. **Matheus decidiu seguir sem isso por ora**
  (`codex: aceito`, limite de 2 ciclos atingido). Não é aprovação do Codex — é pendência aberta,
  e o caso é estreito: exige bitola em fração composta E planilha sem certificado dos dois lados.
- **(22/09, 18h45) Inteligência Fiscal — MVP no ar, e a pendência da fração fechada.**
  ⚠⚠ **A fração composta do CMR foi corrigida** (a pendência aceita há duas horas): numerador e
  denominador viravam números soltos, então `1/4` → `1 1/4` passava como "detalhou a descrição".
  Agora a fração vale um NÚMERO (0,25 × 1,25). ⚠ E a fração MISTA só conta com o inteiro SOLTO —
  sem isso, `PORCA A563 3/8` leria "563 3/8" como 563,375 e a mesma porca escrita `A563 - 3/8"`
  viraria troca de material por causa de um hífen.
  **Módulo fiscal**, Fases 3–9 do briefing: parser da TIPI, sincronização das duas fontes oficiais,
  consulta, CFOP e tela. Rodado contra produção: TIPI 15.648 linhas / 11.103 NCMs em 5s; NCM do
  Siscomex 15.156 códigos em 2,9s; segunda execução = "sem mudança" em 0,2s.
  ⚠⚠ **Três defeitos das FONTES, achados medindo**: (1) 58 posições da TIPI perderam um zero por
  coerção numérica do Excel (`84.3` é 84.30, `3.03` é 03.03) — e `843` casando como prefixo de
  `8437` fazia o 8437.90.00 herdar o texto de TERRAPLENAGEM do 84.30; (2) 23% dos NCMs (2.603 de
  11.103) se descrevem só como "Outros"/"Outras", então indexar a folha dava busca vazia — o GIN
  passou a indexar o caminho hierárquico inteiro; (3) `to_tsvector` não remove acento e
  `plainto_tsquery` junta os termos com E, então "construcoes" derrubava a consulta toda.
  ⚠⚠ **Três contratos do parecer de arquitetura do Codex viraram estrutura, não comentário**:
  ATIVA ≠ VIGENTE (`vigenciaInicio` nasce nula e a tela diz por quê; a consulta histórica responde
  "referência histórica indisponível"); Ex desconhecido ≠ geral (a tela mostra a geral e cada Ex
  lado a lado, nunca elege); campo ausente ≠ conformidade.
  ⚠ Os verbetes de CFOP são **resumo operacional**, `validado: false`, com tarja na tela — a tabela
  oficial do CONFAZ segue pendente de conferência da contabilidade.
  ⚠ **PENDENTE:** o P1 do Vitor em `AbaExpedicao.jsx:617` (avulso ao reabrir romaneio) continua sem
  toque, por instrução do Matheus. E a auditoria da NF 973 ainda não foi implementada — o
  apontamento está medido (22 itens sem IPI, R$ 7.026,55 se 3,25% valer para todos), mas quem
  conclui é a contabilidade.
  Testes: `fiscal-tipi-planilha` (43) e os 3 novos de fração em `cmr-planilha-manda` (31).
  **3.155 passando**, checar limpo, tela validada logada sem erro de console.
- **(22/09, 20h55) Painel de Atualizações Tributárias — o MVP fiscal fecha.** Terceira aba, com as
  duas referências ativas, o histórico de verificações e o botão "Verificar atualizações" (só ADMIN,
  recusado no SERVIDOR e não só na tela).
  ⚠⚠ **O TETO É DA FONTE, NÃO DO PORTAL**: o Siscomex permite **3 acessos por hora** (PUCX-ER1001).
  Um botão sem trava, clicado três vezes, queima a cota e o cron da madrugada encontra a porta
  fechada. Daí o intervalo de 15 min (`reservarVez`) somado à trava compartilhada com o cron
  (`comTravaDeCron`, chave `fiscal-fontes`) — a mesma lição do botão de Prazos das RMs.
  ⚠⚠ **DEFEITOS PEGOS PELO BUILD E PELOS TESTES, não por revisão**: (1) o cron estava sendo
  PRÉ-RENDERIZADO (`○` contra `ƒ` de todos os outros) — rodava no build e serviria a resposta
  congelada, ou seja, nunca rodaria de verdade; (2) o cron estava SEM `temCronSecret`; (3) `dataBr`
  aceitava `32/13/2022` porque o JavaScript ROLA datas inválidas em vez de devolver `NaN` — virava
  01/02/2023, uma data que ninguém escreveu, numa coluna de VIGÊNCIA.
  ⚠ Matheus (22/09/2026): *"utilizamos o item ARMAÇÃO DE ESTRUTURA METÁLICA para todos os
  faturamentos, só alteramos o NCM conforme o cliente solicita; o que é cada um vai na descrição do
  item no Omie"*. Medido na NF 973: os 24 itens têm o MESMO `cProd` (ARM000010) e o mesmo `xProd`.
  **`ListarNF` não devolve a subdescrição** — só quantidade e valor diferem. Consequência para a
  auditoria: a varredura por Omie ACHA a divergência, mas identificar o que cada item é exige o XML
  (`infAdProd`) ou o pedido. ⚠⚠ E fica a questão para a contabilidade: classificação fiscal segue a
  natureza do produto, não o pedido do cliente.
  Testes: `fiscal-ncm` (12), novo. **3.167 passando**, build local EXIT=0, tela validada logada.
- **(22/09, 21h05) Auditoria de NF-e por XML — o caso da 973 fechado com evidência.** Matheus
  (22/09/2026): *"o fiscal realmente esqueceu de declarar o IPI, mas esqueceu porque o operador não
  sabia que o NCM precisava destacar — por isso estamos criando essa tela, para ajudar ele"*.
  ⚠⚠ **O XML era indispensável, e agora sei exatamente por quê.** O `ListarNF` do Omie não devolve
  `CST`, `cEnq` nem `infAdProd`. Extraído do XML real: os 22 itens sem IPI têm **CST 53** ("saída
  NÃO TRIBUTADA") com `cEnq 999`, e os 2 restantes têm **CST 50** a 3,25%. E o `infAdProd` traz a
  peça de verdade ("FLANGE MAIOR CONEXAO SAIDA - DES 71264380") — sem ele os 24 itens são
  indistinguíveis, porque todos usam o mesmo `cProd` ARM000010.
  ⚠⚠ **O achado central não é "vIPI é zero" — é a AFIRMAÇÃO.** CST 53 declara que o produto está
  FORA do campo de incidência; 51 declara alíquota zero; 55 declara suspensão. Comparar só o valor
  trataria os quatro como a mesma coisa, e cada um exige prova diferente. O motor compara a
  DECLARAÇÃO com a TIPI.
  ⚠⚠ **E o achado mais forte não depende de interpretar lei**: `CONTRADICAO_INTERNA` — o mesmo NCM,
  no mesmo documento, com dois CSTs. Um dos dois está errado por construção.
  ⚠ **O sistema aponta, não condena** (contrato do parecer): nenhum achado diz "está errado";
  campo ausente vira `NAO_AVALIAVEL` explícito; NCM com Ex TIPI sai marcado `inconclusivo`; e a
  ressalva "a TIPI não tem vigência declarada" viaja junto do resultado. "Diferença estimada",
  nunca "imposto devido". Nada é gravado e nenhuma NF complementar é gerada.
  ⚠ Medido na 973: 22 `IPI_NAO_DESTACADO` + 1 `CONTRADICAO_INTERNA`, **R$ 7.026,56** estimados
  sobre R$ 216.201,42. (Um centavo acima da conta anterior porque agora cada item é arredondado
  individualmente — que é como sairia numa complementar.)
  ⚠ `@xmldom/xmldom` passou a ser dependência DIRETA: já estava na árvore via docxtemplater/mammoth,
  e depender de transitiva é depender de algo que some quando o pai atualiza. DOM de verdade e não
  regex: é documento com valor legal.
  Testes: `fiscal-auditoria` (18), novo. **3.185 passando**, tela validada logada com o XML real.
- **(22/09, 21h15) Simulador Fiscal — a metade preventiva, e o fecho do pedido original.**
  ⚠⚠ **É O PONTO DO MÓDULO INTEIRO.** Matheus (22/09/2026): *"o operador não sabia que o NCM
  precisava destacar IPI, por isso estamos criando essa tela, para ajudar ele"*. O teste-chave do
  arquivo reproduz a operação que gerou a NF-e 973 com o CST 53 que o operador usou — e o alerta
  ALTO acende, que é o alerta que ninguém teve na hora.
  ⚠⚠ **A REGRA É LITERALMENTE A MESMA DA AUDITORIA** (`CST_IPI` importado de `lib/fiscal/auditoria`,
  não copiado). Se o simulador tivesse cópia própria, abençoaria hoje o que a auditoria condena
  amanhã — e quem seguiu a tela levaria o apontamento.
  ⚠⚠ **ELE SE CALA ONDE NÃO SABE.** ICMS, PIS/COFINS e IBS/CBS saem como NÃO DETERMINADOS **com o
  motivo escrito**, porque o briefing proíbe *"aplicar automaticamente 12% de ICMS a toda venda
  interestadual"* e *"PIS 1,65% e COFINS 7,6% a todas as operações"*. E o `cEnq` nunca é sugerido:
  sugerir seria o portal inventando fundamento legal.
  ⚠ **Entrada pela OP** — o pedido original de Matheus (*"seleciono a OP e já puxa os dados do meu
  cliente para entender a cidade que vai ser a NF de venda"*). A UF de destino vem do cadastro.
  ⚠ A IE é INDÍCIO de contribuinte, não prova: "ISENTO" e cadastro velho existem, e a tela diz de
  onde tirou o palpite.
  ⚠ **Defeito de UX pego na validação da tela**: a lista "ainda precisa ser respondido" pedia a UF
  que acabara de ser preenchida, porque os `exige` de cada CFOP são estáticos. Lista que repete o
  que a pessoa digitou ensina a IGNORAR a lista, e aí a pergunta que importa some junto. O filtro é
  conservador: na dúvida, a pergunta fica.
  Testes: `fiscal-simulador` (26), novo. **3.211 passando**, tela validada logada.
  ⚠ **AINDA ABERTO**: "Produtos da TORG" (§14 do briefing) — classificar o `ARM000010` por peça
  real, com responsável e data. É a raiz do problema: enquanto um código serve para tudo, o NCM
  segue sendo escolhido caso a caso. E o P1 do Vitor em `AbaExpedicao.jsx` continua sem toque.
- **(22/09, 21h25) O seletor do Simulador passa a ser de CFOP.** Matheus (22/09/2026): *"na
  natureza de operação tire os nomes, deixe os CFOPs e a descrição do CFOP"*. Ele está certo sobre
  o fluxo: quem emite pensa no código que vai na nota, e um rótulo como "Venda à ordem (ex.: TMSA)"
  fazia a operação parecer DAQUELE cliente.
  ⚠⚠ **E a troca HABILITOU uma verificação nova**: o CFOP contra as UFs. 5.xxx é interna e 6.xxx é
  interestadual — o primeiro dígito não é decoração. Escolher 5.101 numa venda para o RS é erro que
  a SEFAZ rejeita, e é exatamente o que o operador não sabe de cabeça. O alerta sai com o
  equivalente sugerido (6.101).
  ⚠ O par equivalente casa pelos TRÊS ÚLTIMOS DÍGITOS, não pela descrição — os textos diferem de
  propósito ("Venda de produção" × "Venda INTERESTADUAL de produção"). E nem todo par existe
  (5.902 e 5.124 não têm 6.xxx na lista da TORG), então a sugestão só entra quando há equivalente.
  ⚠ As perguntas e alertas das operações reais não se perderam: voltam pelo caminho inverso, a
  partir das operações em que o CFOP aparece. O exemplo continua sendo exemplo; só deixou de ser a
  porta de entrada.
  ⚠ Lista agrupada por família (6 optgroups): são 18 códigos, e "5.101" ao lado de "6.101" num
  select liso faz escolher o errado por um dígito.
  **3.213 passando**, tela validada logada.
- **(22/09, 22h10) Parecer de ARQUITETURA sobre a aba fiscal inteira** (consulta `architecture`,
  pedida pelo Matheus: *"pode ir revisando toda essa parte, principalmente por ser fiscal (…)
  analisem toda essa aba para ver se estamos no caminho correto para o Fiscal da TORG METAL
  Lucro Real"*). Veredito: base certa para **assistir emissão e auditoria**, não para determinar
  tributo — e a lacuna estrutural é que **as ressalvas não controlavam o resultado**. O código
  reconhecia hipótese desconhecida e mesmo assim entregava CST, alíquota e valor; para um operador
  que não é contador, o número prevalece sobre o aviso.

  **CORRIGIDO nesta rodada** (todos ALTA, todos defeito real):
  - ⚠⚠ **PIS/COFINS saía em REMESSA.** Bastava valor positivo para render 1,65%/7,6% — inclusive
    em remessa, retorno e até sem CFOP escolhido. Agora incide só onde há receita (famílias Venda e
    Industrialização), e o resto recebe o motivo em vez do número.
  - ⚠⚠ **A base do PIS/COFINS se apresentava como base.** É o que a NOTA declara, item a item; a
    apuração é mensal e tem exclusões próprias (entre elas o ICMS destacado, RE 574.706). O texto
    agora diz isso.
  - ⚠⚠ **Ex TIPI: a auditoria se abstinha e o simulador não.** Com Ex, `ipiDaTipi` entregava CST
    fechado e estimativa pela alíquota geral. Compartilhar o `CST_IPI` não é compartilhar a DECISÃO
    — era exatamente a incoerência que o módulo promete não ter. Agora `cstSugerido: null` e
    `inconclusivo: true`, nos dois ramos (PERCENTUAL e NT).
  - ⚠⚠ **A sequência de notas perdia documento entre cenários, em silêncio.** A deduplicação era
    global por CFOP+papel: o retorno 5.902 emitido pela TORG apagava o 5.902 emitido pelo TERCEIRO
    na terceirização. Mesmo código, mesmo papel, **emitente diferente**. Agora dedupe por cenário,
    com o emitente na chave.
  - ⚠⚠ **"999 não é enquadramento" era afirmação ERRADA minha.** Na tabela oficial da NF-e, 999 é
    *"Tributação normal IPI; Outros"* — existe e é legítimo. E o significado real torna o achado
    MAIS forte: 999 afirma tributação normal, então usá-lo ao lado de um CST que afirma isenção,
    imunidade ou suspensão é o documento dizendo duas coisas incompatíveis sobre o mesmo item.
  - ⚠ **CONTRADICAO_INTERNA com Ex TIPI vira "esclarecer", não "errado".** Dois CSTs no mesmo NCM
    só é contradição fechada quando a tabela não oferece tratamento alternativo.

  **ICMS entrou como REFERÊNCIA, não como imposto** (`lib/fiscal/icms.js`). O parecer confirma que
  a tabela do art. 52 do RICMS/SP não fura a proibição do briefing desde que devolva *alíquota de
  referência sob condições explícitas*. 12% para MG/PR/RJ/RS/SC; 7% para N/NE/CO **e ES**; a
  **interna fica de fora** (18% com campo grande de redução e benefício). As condições (finalidade,
  DIFAL — que existe também para contribuinte, LC 190/2022 —, redução de base, ST, FCP, FCI) saem
  do lado do número, não em rodapé.
  ⚠⚠ **Achado MEU na validação da tela, não do Codex**: a remessa 5.901 de R$ 222.769,58 saía com
  "12% · R$ 26.732,35". Número plausível, grande e provavelmente errado — remessa para
  industrialização em SP corre com suspensão (art. 402 do RICMS/SP). Remessa, retorno, entrega
  futura e outras saídas passaram a não receber alíquota de referência. O portal **não afirma** que
  há suspensão (ela tem condições e prazo): diz que não se aplica sem confirmar.
  ⚠ **Origem 0-nacional é DECLARAÇÃO com escopo e data**, não verdade gravada no código. Matheus
  (22/09): *"origem sempre é nacional, não compramos material de fora do Brasil"*. Mas comprar de
  fornecedor nacional **não prova** ausência de conteúdo importado — origem é atributo do PRODUTO,
  apurado por FCI, e >40% levaria a 4%. A tela mostra quem declarou e o que a declaração não prova.

  **PENDENTE — não tocado nesta rodada** (registrado, não aprovado):
  - ⚠ **`jaRespondida` casa por palavra-chave.** Uma propriedade respondida elimina QUALQUER
    pergunta contendo "contribuinte", inclusive uma futura pergunta composta sobre finalidade. O
    certo é ID + predicado explícito por pergunta, o que obriga a reescrever os `exige` de todos os
    18 CFOPs. Risco latente hoje, não defeito observado.
  - ⚠ **Cobertura da auditoria.** "Nenhum achado" ainda pode significar "não verifiquei", e o
    resumo não separa estimativa inconclusiva de estimativa firme. Falta registrar cobertura POR
    VERIFICAÇÃO.
  - ⚠ **Contrato comum por tributo** (`estado` / `premissas` / `pendencias` / `regra` / `resultado`).
    Hoje IPI, PIS/COFINS e ICMS devolvem formatos parecidos mas não iguais. É refatoração ampla e
    vale mais depois de o ICMS assentar.
  - ⚠ **Sintegra / consulta de CNPJ**: o parecer é de que vale como **enriquecimento cadastral
    desacoplado**, nunca como dependência do simulador — e que consulta de CNPJ **não comprova
    Lucro Real/Presumido** (só o Simples é público). Falha ou dado velho tem de produzir
    "desconhecido", nunca `false`. A IE como INDÍCIO está correta e fica.
  - ⚠⚠ **Produtos da TORG (§14)** e o **P1 do Vitor** em `AbaExpedicao.jsx` seguem abertos.

  **3.297 passando**, tela validada logada (venda SP→MG e remessa 6.901).
- **(22/09, 22h30) Rodada 3 — três lacunas fiscais, todas minhas, todas corrigidas.** O Matheus
  aceitou a pendência; corrigi mesmo assim, porque é acabamento do que eu tinha escrito 40 minutos
  antes, não escopo novo. O P1 dos avulsos (`AbaExpedicao.jsx:617`, commit `498199259d` do Vitor)
  segue **sem toque**, por instrução.
  - ⚠⚠ **P1 — eu consertei a metade errada do Ex TIPI.** Tirei o `cstSugerido` e **esqueci o
    dinheiro**: geral 3,25%, Ex 0% e R$ 1.000 continuavam rendendo "R$ 32,50" na tela, porque a
    `estimativa` olhava só `determinado && tipo && valor`. O CST é o que a pessoa lê; o VALOR é o
    que ela copia para a nota. Agora `!ipi.inconclusivo` entra na condição.
    ✔ Conferido logado no NCM 2203.00.00 (1 Ex): sai `CST —` e nenhuma estimativa.
  - ⚠⚠ **P2 — ICMS sem CFOP ainda dava 12% e R$ 120.** O bloqueio por família dependia de `cfop`
    preenchido; sem código não dá para saber se a operação é das excluídas. O PIS/COFINS já se
    abstinha na mesma condição — a incoerência era minha.
    ⚠⚠ **E eu tinha escrito um TESTE afirmando o defeito** ("sem CFOP, a referência sai"). Teste que
    congela comportamento errado é pior que teste ausente: ele defende o defeito na refatoração
    seguinte. O teste foi invertido, com o motivo escrito nele.
  - ⚠⚠ **P2 — CST 50 com `pIPI` ausente passava calado**, furando a regra 2 do próprio motor. Item
    com CST tributado, NCM na TIPI e sem alíquota não entrava na comparação nem virava
    NAO_AVALIAVEL: a nota saía com zero achados, diferença zero e zero não avaliáveis — do jeito
    que uma nota conforme sai. Agora gera NAO_AVALIAVEL com `faltam: ["IPI/pIPI"]`, e o contador
    da tela enxerga.
  **3.308 passando**, tela validada logada (NCM com Ex e simulação sem CFOP).
- **(22/09, 22h45) Oito CFOPs estavam sem o par interestadual.** Matheus, olhando o seletor:
  *"alguns CFOP ficaram sem a opção fora do estado, verifique e insira também"*. Estava certo:
  5.116, 5.124, 5.125, 5.902, 5.903, 5.922, 5.924 e 5.925 apareciam sozinhos.
  ⚠⚠ **ERA FALHA DA MINHA LISTA, NÃO DA TABELA.** A simetria 5.xxx/6.xxx é sistemática no Convênio
  S/Nº: 6.116, 6.124, 6.125, 6.902, 6.903, 6.922, 6.924 e 6.925 existem. A ausência deles fazia
  parecer que uma **industrialização para cliente de fora do estado não tinha código** — e aí o
  operador escolhia o 5.125 (interno, que a SEFAZ rejeita) ou caía no 5.949, que esconde a operação
  de quem for auditar. 18 códigos → **26**, 13 pares completos.
  ⚠ **As operações reais passaram a listar os dois âmbitos.** Sem isso o 6.125 entraria MUDO: sem
  perguntas, sem alerta e sem sequência de notas, porque `operacoesDoCfop` casa por código exato.
  ⚠ **A função de pares continua tratando código sem irmão** — um código novo entra sozinho até
  alguém acrescentar o par, e aparecer sozinho é melhor do que sumir.
  **3.326 passando**, tela validada logada (5.125/6.125 → OP 122/MG resolve para 6.125).
- **(22/09, 23h15) Autocomplete de NCM, a cadeia do art. 406 e DOIS defeitos de banco.** Matheus
  pediu o autocomplete (*"conforme vou digitando o NCM vai mostrando os resultados próximos"*) e,
  no briefing de auditoria fiscal, apontou o erro da cadeia (*"faltou a remessa simbólica que deve
  ser emitida pelo autor da encomenda"*). Ele estava certo nos dois.

  **A CADEIA DO ART. 406 ESTAVA INCOMPLETA** — o portal mostrava fornecedor → TORG, 5.925 e 5.125,
  e pulava a **remessa simbólica do cliente (5.949, art. 406, II)**, que é o documento que prova
  que o encomendante entregou à TORG insumos que são dele. Agora são 5 documentos e 3 emitentes,
  cada linha com natureza (física / simbólica / faturamento) e o inciso.
  ⚠⚠ **E O 5.924 NÃO É DA TORG.** Ele é emitido pelo **FORNECEDOR**, que despacha direto ao
  industrializador; para a TORG é documento de ENTRADA. Estava no seletor de "o que eu vou emitir",
  mandando o operador emitir a nota de outra empresa. Saiu do seletor, ficou na Consulta CFOP com a
  marca `emitida por: Fornecedor`.
  ⚠ O CFOP do fornecedor (5.122 × 5.123) depende da natureza da operação DELE — a tela diz isso em
  vez de escolher. E o parágrafo único do art. 406 prevê **dispensa** da NF do fornecedor: o portal
  não afirma obrigatoriedade sem exceção.

  **NF-e 1000 (TORG → DANPOWER, R$ 480.442,46) revelou um buraco no motor.** NCM 9406.90.20, que a
  TIPI lista a **0%**, saiu com **CST 53 — saída NÃO tributada**. Em dinheiro não muda nada; na
  declaração muda tudo: "alíquota zero" é estar DENTRO do campo e pagar zero (CST 51); "não
  tributada" é estar FORA, e exige fundamento. ⚠⚠ O motor não via: a verificação principal exige
  `aliquotaValor > 0`, então **todo NCM a 0% passava batido com qualquer CST**. Novo achado
  `CST_INCOMPATIVEL_COM_A_TIPI`, gravidade MEDIA, sem estimativa em dinheiro.

  **DOIS DEFEITOS DE BANCO, os dois silenciosos:**
  - ⚠⚠⚠ **`FiscalTipiLinha_busca` estava na COLUNA ERRADA** (`descricaoCompleta`, não `busca`).
    `CREATE INDEX IF NOT EXISTS` casa pelo **NOME**, não pela definição: quando a linha do script
    mudou de coluna, o Postgres viu o nome, disse "já existe" e manteve o índice velho. Resultado
    medido: **toda busca textual de NCM varria as 11.103 linhas — 326 ms onde o índice entrega
    0,7 ms**. Nada quebrou, nada avisou. Corrigido com um nome novo (`_busca_pt`).
    ⚠ O índice antigo ficou **órfão** e só pesa nas importações — **DROP é decisão do usuário**,
    não foi executado.
  - ⚠⚠ **`to_tsquery` NÃO aplica stemming ao termo com `:*`.** "metalicas" é indexado como o
    radical `metal`; `metalic:*` procura lexema começando em "metalic" e **nunca casa** — passar do
    limite do radical, digitando, ZERAVA a lista. Daí o segundo índice, `simple` (sem radical), com
    prefixo em todos os termos. Os dois convivem: `portuguese` resolve singular/plural de palavra
    inteira, `simple` resolve a palavra pela metade.
  - ⚠⚠ **`OR` entre os dois `@@` derrubava os dois GIN** (548 ms, varredura). Em **UNION** cada
    ramo é indexável: **0,4 ms**. E a ordenação passou a ser por `ts_rank` — ordenada por posição na
    TIPI, "constru" devolvia *mármores* antes de *construções*, porque o 25 vem antes do 94.

  **3.364 passando**, tela validada logada: autocomplete por teclado (↓ Enter → 9406.20.00) e a
  cadeia do art. 406 com os 5 documentos e 3 emitentes.

  **PENDENTE do briefing de auditoria fiscal** (PARTES 10 a 15): base documental jurídica
  (RICMS/SP, DN CAT 03/2016, RCs 33732/2026, 33438/2026, 5788/2015), motor de regras com condições
  e fundamento por regra, e validação de referências entre NFs. É trabalho de outra ordem de
  grandeza — não foi iniciado.
- **(22/09, 23h40) Quatro achados do Codex no autocomplete — todos reais, todos corrigidos.**
  - ⚠⚠ **Escolher um NCM reabria o menu e buscava de novo.** `escolher` gravava "8437.90.00" no
    campo e mandava "84379000" ao formulário; o pai devolvia isso como `valor`, o campo trocava o
    texto pelos dígitos — string diferente — e o efeito de busca disparava outra vez. **E meus
    testes não pegavam porque fixavam `valor=""`**, nunca reproduzindo o que o formulário de
    verdade faz. Agora o que se BUSCA (`consulta`) é separado do que se MOSTRA (`termo`), e só quem
    digita mexe na consulta. O teste passou a usar um pai com `useState`.
  - ⚠⚠ **Apagar o campo com requisição no ar trazia as sugestões de volta.** O retorno para termo
    curto acontecia ANTES de invalidar a vez: a requisição já disparada resolvia chamando
    `setAberto(true)`, com sugestões reaparecendo sobre um campo vazio, prontas para serem
    escolhidas por engano. `invalidar()` agora roda ao limpar, ao escolher e ao trocar de termo.
  - ⚠⚠ **A linha de Ex podia falar pelo NCM.** A busca corta no LIMITE antes de agrupar, e na busca
    por código o Postgres devolve o `Ex 01` antes do NULL da geral — a lista podia mostrar a
    **alíquota da exceção** como se fosse a do código, e o clique manda só os 8 dígitos, jogando
    fora a exceção de onde o número saiu. Era o contrato 2 do módulo ("Ex desconhecido não
    significa geral") quebrado pela própria tela. Sem a linha geral na resposta, a entrada sai
    **sem número**: "IPI depende do Ex — abra a Consulta NCM".
  - ⚠⚠ **Falha de consulta virava "Nenhum NCM com esse código".** A resposta era consumida sem
    olhar `r.ok` nem `d.success`: um 403 ou uma queda de rede levavam a pessoa a concluir que o
    código não existe. Agora são três estados — erro (com "Tentar de novo"), referência ausente
    (conserto de administrador) e busca válida sem resultado.
  **3.373 passando.** Validado logado: escolher não dispara busca extra (0 chamadas), apagar não
  reabre a lista, e o 9406.10.10 sai com **CST 51** (alíquota zero é tributação) — o mesmo ponto da
  NF-e 1000. ⚠ **Sem push**, conforme a instrução da rodada.
  ⚠⚠ **(rodada 2/2) E o mesmo ponto cego de novo: apagar o campo DEPOIS de a lista abrir.** O
  retorno para termo curto limpava a lista mas **não fechava o menu** — sobrava no ar um "Nenhum
  NCM com esse código" sobre um campo VAZIO, onde nada tinha sido buscado. Meu teste da limpeza
  apagava ANTES da primeira resposta, com o menu ainda fechado: provava o caso fácil e deixava
  passar o caminho que a pessoa percorre de verdade (digitar → ver → apagar). Corrigido com
  `setAberto(false)` e `setAtivo(-1)`, e coberto nos dois sentidos (apagar tudo, reduzir a 1
  caractere) mais o retorno (voltar a digitar reabre).
  **3.376 passando.** Validado logado: lista abre com "8437", some ao apagar sem deixar mensagem,
  reabre com 2 caracteres e fecha com 1.

---

## O P1 dos avulsos saiu da nossa lista (22/09/2026)

Matheus: *"o P1 do Vitor remova de nossa dependência, isso ele vai seguir ajustando"*.

`app/comercial/[id]/AbaExpedicao.jsx:617` — avulso perde identificação ao reabrir o romaneio
(commit `498199259d`). **Dono: Vitor.** Não é mais pendência nossa e não entra nas próximas
rodadas como item a tratar; se o Codex apontar de novo, a resposta é que o dono é ele. O histórico
das rodadas acima fica como está — reescrever o passado apagaria a procedência do achado.

Matheus também firmou **"Codex: aceito sempre"** para pendência de terceiro e decisão humana.
⚠⚠ Isso NÃO vale para `resultado: "corrigir"` em código nosso — ver
`docs/memoria-claude/torg_codex_aceito_sempre.md`.

---

## A BASE JURÍDICA (23/09/2026) — PARTES 10 a 13 do briefing de auditoria fiscal

Matheus: *"pode seguir com todas"*. O requisito central era: *"a base de conhecimento fiscal da
TORG deverá ser constituída por legislação e documentos oficiais armazenados em nosso banco
interno; não queremos um conjunto de frases escritas por inteligência artificial sem sustentação
jurídica"*.

**10 normas coletadas, conferidas, hasheadas e guardadas** (`FiscalNorma` → `FiscalNormaVersao`
→ `FiscalDispositivo`), em 11 s:

| Peso | Documento | Dispositivos | Tamanho |
|---|---|---|---|
| VINCULANTE | RICMS/SP art. 52, 125, 402, 403, **404 a 408**, 409 | 138 · 131 · 6 · 3 · **18** · 2 | 58–2 KB |
| INTERPRETATIVO | DN CAT 03/2016, RC 33732/2026, RC 33438/2026, RC 5788/2015 | — | 17–12 KB |

⚠⚠ **`art405.aspx` a `art408.aspx` devolvem 404** — os quatro moram em `art404.aspx`, cujo título
é "RICMS - Artigo 404 a 408". Sem esse mapa, o coletor concluiria que o **art. 406**, o artigo
central da industrialização por conta de terceiros, simplesmente não existe.

⚠⚠ **PESO JURÍDICO É ATRIBUTO DO DOCUMENTO.** `VINCULANTE` × `INTERPRETATIVO`: uma Resposta à
Consulta é entendimento do fisco sobre os fatos DAQUELE consulente. A ressalva viaja com o
documento e aparece na tela, não em rodapé — é o que impede uma RC de 2015 de virar regra
universal de 2026.

⚠⚠ **200 NÃO É SUCESSO.** O SharePoint da SEFAZ devolve a página de erro com HTTP 200. Todo
documento declara marcadores (artigos esperados, frase-chave, corpo mínimo de 400 caracteres) e o
que não passa **não vira ATIVO** — é gravado como SUPERADA, e a versão boa anterior continua
valendo. Gravar uma página de erro como se fosse a lei seria pior que não coletar.

⚠ **O corpo começa no primeiro artigo**, não no topo da página: das ~12.900 letras de
`art404.aspx`, a maior parte é menu do SharePoint. Guardar o chrome faria o hash mudar a cada
redesenho do portal da SEFAZ — falso "a lei mudou".

**O fundamento virou citação verificável.** Cada nota da cadeia leva `cita: { norma, rotulo }`, e
clicar no fundamento abre o **texto oficial guardado** com rótulo, peso, URL, `sha256` e data de
coleta. Conferido logado na cadeia do art. 406:
> **Artigo 406, II** · RICMS/SP — Artigos 404 a 408 · VINCULANTE
> *"o estabelecimento autor da encomenda deverá, ressalvado o disposto no parágrafo único: a)
> emitir Nota Fiscal relativa à remessa simbólica em nome do estabelecimento industrializador, sem
> destaque do valor do imposto…"*
> Coletado de legislacao.fazenda.sp.gov.br/Paginas/art404.aspx · sha256 `2be16dc63782` · 23/09/2026

⚠⚠ **O TEXTO LEGAL CONFIRMOU E REFINOU o que eu tinha escrito de cabeça**: o parágrafo único do
art. 406 **dispensa** a NF do fornecedor quando a remessa vai acompanhada da NF da alínea "a" do
inciso II — exatamente a ressalva que eu havia colocado por precaução. E o art. 408 exige que
encomendante e industrializador estejam **"localizados neste Estado"**, confirmando o corte de SP.

**DOIS DEFEITOS MEUS, achados na própria validação:**
- ⚠⚠ **`skipDuplicates` engolia dispositivo em silêncio**: 138 extraídos do art. 125 viravam **92
  gravados**. A causa era o rótulo repetido ("Artigo 125, I" do caput e de um §). Agora o inciso é
  qualificado pelo parágrafo em que está, o que ainda colidir ganha sufixo `(2)`, e o
  `skipDuplicates` **saiu** — colisão tem de estourar, não sumir. 138 e 131 gravados.
- ⚠⚠ **Entidade HTML é sensível a maiúscula**: casando por `toLowerCase()`, `&Ccedil;` virava "ç"
  e **"INSCRIÇÃO" saía "INSCRIçãO"** — que é exatamente como cabeçalho de lei se escreve. E o mapa
  não cobria `&ccedil;`/`&atilde;`: "operação" chegaria ao banco como `opera&ccedil;&atilde;o`,
  quebrando a busca textual.

⚠ **Coleta controlada**: sequencial, com pausa de 800 ms e user-agent identificado. São 9 páginas
do mesmo servidor público — disparar tudo junto é o que faz um site oficial bloquear o IP da
empresa. Cron semanal (`40 4 * * 1`), `ƒ` no build (não pré-renderizado), com `temCronSecret` e
`aquecerBanco`.

⚠ **POST é de ADMIN.** Quem lê o art. 406 usa o GET; trocar a base que fundamenta os apontamentos
é outra coisa, e vai para o `AuditLog`.

**3.403 passando.** Build limpo.

**AINDA PENDENTE do briefing** (PARTES 13 a 15, 21, 24): o motor de regras como REGISTRO
consultável (`FiscalRegra` com condições, status de validação e aprovador) — hoje as cadeias são
dados estáticos em `cfop.js`, agora com fundamento verificável, mas ainda não são linhas de tabela
que a contabilidade possa aprovar uma a uma. E a validação de referências entre NFs emitidas.

- **(23/09, 09h30) Três achados do Codex na coleta de legislação — e um erro de processo meu.**
  ⚠⚠ **EU REPORTEI "3.403 PASSANDO" SEM RERODAR.** Rodei a suíte, DEPOIS acrescentei o cron ao
  `vercel.json`, e commitei. O `testes/cron-agenda.teste.js` — que existe justamente para casar a
  agenda da Vercel com o cadastro do monitor — ficou vermelho e eu não vi. A ponte pegou.
  - ⚠ **Cron não cadastrado no monitor e sem `registrarExecucao`**: ele poderia parar de atualizar
    a legislação por semanas sem ninguém saber. Cadastrado com `maxHoras: 24*8` (é semanal; cobrar
    em 30 h alertaria seis dias por semana), e o ponto é batido mesmo com falha — **lote incompleto
    não passa por sucesso**.
  - ⚠⚠ **`SEM_MUDANCA` ignorava o status da versão.** Duas consequências: (1) página **reprovada
    que se repete** sumia das falhas — no primeiro dia entra como REPROVADA, no segundo o mesmo
    hash vira "sem mudança" e é contado como sucesso, com o portal dizendo que está tudo em dia
    sobre uma norma que nunca conseguiu ler; (2) **A → B → A deixava B ativo** — voltando a um
    conteúdo válido que o banco já tem, o caminho de criação (que é quem promove) não roda, e o
    portal seguiria citando o texto intermediário. Agora há `REPROVADA` e `REATIVADA`, e a
    reativação é atômica (senão o índice `uma_ativa` recusa o meio do caminho).
  - ⚠⚠ **10 fontes × 30 s de timeout numa rota de 60 s.** Dois downloads lentos estouravam o
    orçamento e a Vercel matava a execução no meio do lote, devolvendo "5 importadas, 0 falhas" —
    indistinguível de uma rodada completa. O timeout agora **encolhe para o tempo restante**
    (mesma lição do `ateMs` do `omieCall` nos Prazos), e **fonte não consultada é dita por nome**
    em `naoProcessadas`.
  - ⚠ O Codex também notou que **não havia teste do importador**. São 9 agora, cobrindo os três
    cenários — todos invisíveis numa rodada feliz.

- **(23/09, 10h00) A TIPI que a contabilidade mandou: o que ela complementa NÃO são as alíquotas.**
  Matheus mandou `tabela tipi.pdf` (462 páginas, 9 MB) perguntando se dava para *"complementar
  nossa base de NCMs que tributam IPI"*.
  ⚠⚠ **A BASE DE CÓDIGOS E ALÍQUOTAS NÃO PRECISAVA.** Ela já vem da planilha oficial da Receita
  (`tipi.xlsx`, sha `d155f1baafb4…`), com **11.103 NCMs e 582 linhas de Ex**. Extraí o PDF e
  comparei: das 9.344 linhas que consegui ler, **8.950 batem**. As 394 "divergências" são **erro do
  meu extrator**, não da base — conferido no `1211.20.00`, em que o portal tem `NT` na geral e `0`
  no `Ex 01`, e meu parser pegava a linha do Ex. ⚠ Num PDF de 462 páginas gerado pelo Word, com
  linhas de Ex intercaladas, **eu não consigo extração confiável o bastante para auditar alíquota**
  — e apresentar esses 394 como achados seria fabricar divergência.
  ⚠⚠ **O QUE O PDF RESOLVE É A VIGÊNCIA, E ISSO VALE MUITO.** "ATIVA" nunca foi "vigente": a
  planilha da Receita não declara, dentro dela, a norma que a aprovou — e por isso **toda auditoria
  saía com ressalva**. A folha de rosto do PDF traz a cadeia inteira: **Decreto 11.158/2022**,
  atualizado por **18 atos** até o **ADE RFB nº 1, de 30/01/2026** (retificado no DOU de 12/02/2026).
  ⚠⚠ **E A DECLARAÇÃO ESTÁ AMARRADA AO sha256 DO ARTEFATO.** Publicada uma planilha nova, o hash
  muda, a declaração deixa de valer sozinha e **a ressalva volta** — sem essa amarra, a vigência de
  hoje se arrastaria para uma tabela que ninguém conferiu, que é a mentira que a ressalva existia
  para evitar.
  ⚠ A declaração diz por extenso **o que não prova**: saber até qual ato a tabela está atualizada
  não estabelece qual redação vigorava quando uma nota de março de 2024 foi emitida.

  **3.422 passando.** ⚠ **Sem push** enquanto a rodada de correção estiver aberta.

- **(23/09, 10h30) Rodada 2/2 — três achados, e o terceiro era eu criando falsa confiança.**
  - ⚠⚠ **`resp.text()` estava FORA do try.** O `try` cobria só o `fetch`: recebidos os cabeçalhos,
    a leitura do corpo ainda pode rejeitar (o AbortSignal dispara no meio do streaming, a conexão
    cai). A exceção subia até `importarLegislacao` e **matava o lote inteiro** — sem relatório das
    fontes restantes e, no cron, **sem heartbeat**, fazendo o monitor alertar por não ter notícia
    de uma execução que rodou. Corrigido, mais uma rede de segurança por fonte: gravação e parsing
    também podem estourar, e uma fonte não pode derrubar as outras nove.
  - ⚠⚠ **O relógio do orçamento começava DEPOIS do `aquecerBanco`.** Os retries de cold start do
    Neon somam até ~16 s, e o lote ainda recebia 50 s inteiros — estourando os 60 s da rota
    justamente no dia em que a compute estava dormindo. Orçamento que não conta o que já foi gasto
    não é orçamento. `t0` passou para a primeira linha da rota.
  - ⚠⚠⚠ **A DECLARAÇÃO DA TIPI APAGAVA A RESSALVA — erro meu, e dos graves.** Eu gravei
    `vigenciaInicio: "2022-08-01"` (a data do decreto-base), `vigenciaDeclarada` virou `true` e o
    aviso **sumiu da tela**. Três problemas de uma vez: **(1)** a data descreve o decreto-base, não
    a redação consolidada, que inclui atos de **2026**; **(2)** eu troquei "a tabela se identifica
    como atualizada até o ato X" por "esta redação vigorava na data D" — afirmações diferentes, e
    só a primeira eu tenho; **(3)** a auditoria e o simulador continuaram lendo a vigência do
    **banco** (nula) e mantendo a ressalva, então o módulo passou a **discordar de si** sobre o
    próprio fundamento.
    ⚠⚠ O conserto foi **diminuir a afirmação**: `VIGENCIA_TIPI` virou `ATUALIZACAO_TIPI`, sem
    `vigenciaInicio` nenhum; `vigenciaDeclarada` volta a sair só do banco; e a tela mostra a
    atualização **ao lado** da ressalva, com o aviso "NÃO é vigência" colado. Afirmação menor e
    verdadeira vale mais que afirmação grande e conveniente.
    ⚠ A comparação do hash passou a ser do valor **inteiro**: bastava um prefixo para "quase igual"
    passar, num campo cujo propósito é dizer "é exatamente este arquivo".
  - ⚠ A ponte reportou 1 falha em `testes/componentes/gantt-salvamento.teste.jsx`, arquivo que
    **não está no diff**. Rodei 4× aqui: **12/12 passando** nas quatro. Não consigo reproduzir;
    fica registrado como possivelmente intermitente sob carga, sem atribuição à tarefa.
  **3.428 passando.** Tela conferida logada: as duas linhas convivem — *"Vigência normativa: não
  declarada pela fonte"* e *"Atualizada até: ADE RFB nº 1, de 30/01/2026"*.

---

## Auditoria de MEDIÇÃO — validar antes de emitir (23/09/2026)

Matheus: *"na Auditoria precisa ser possível selecionar uma medição do Omie para validar ela antes
de emitir"*.

⚠⚠ **É O PONTO INTEIRO DO MÓDULO.** A auditoria de XML acha o erro DEPOIS — a NF-e 973 custou
R$ 7.026,56 de IPI não destacado e só apareceu quando alguém foi procurar. O pedido de venda é o
mesmo documento antes de existir, e ele **já traz os três campos** que obrigavam a pedir o XML:
`cod_sit_trib_ipi` (CST), `enquadramento_ipi` (cEnq) e `dados_adicionais_item` (a descrição real).

⚠ **As duas entradas produzem o MESMO documento e passam pelo MESMO motor.** `lerPedidoOmie`
devolve a forma que `lerNfe` já devolvia; um `if (é pedido)` dentro da auditoria faria as duas
divergirem no primeiro ajuste de regra.

⚠⚠ **PEDIDO NÃO É NOTA, e a tela não deixa confundir**: sem chave, sem número, com a tarja *"Isto
é o pedido de venda, não a nota: o que for corrigido aqui ainda entra na emissão"*. As medições
**não faturadas** vêm num optgroup próprio e primeiro — é a janela em que o achado ainda evita o
erro em vez de documentá-lo.

### O primeiro uso já achou um caso real e aberto

**Pedido 327 · OP 120 · TMSA/RS · R$ 429.877,11 · etapa 10 · NÃO FATURADO** — 18 achados:

| Gravidade | Achado | Itens |
|---|---|---|
| ALTA | `ALIQUOTA_DIVERGENTE` — 3,25% declarado × TIPI 0% | 1 |
| ALTA | `CONTRADICAO_INTERNA` — mesmo NCM com CST 50 e CST 53 | 1 |
| MÉDIA | `NCM_DIVERGE_DA_DESCRICAO` | **6** |
| MÉDIA | `CST_INCOMPATIVEL_COM_A_TIPI` — CST 53 sobre alíquota zero | 5 |
| MÉDIA | `ENQUADRAMENTO_GENERICO` — cEnq 999 com CST 53 | 5 |

⚠⚠ **`NCM_DIVERGE_DA_DESCRICAO` é regra nova, e nasceu deste caso.** Os SEIS itens trazem
`[NCM: 84313900]` em `dados_adicionais_item` e **9406.90.20** no campo fiscal. É a marca do
problema que o Matheus já tinha descrito — *"alteramos o NCM conforme o cliente solicita"* — e sem
comparar os dois campos ninguém vê que o documento diz duas coisas sobre a mesma peça.
⚠ O achado é de **classificação, não de dinheiro**: aqui os dois códigos são 0% na TIPI. O que ele
aponta é que a nota afirma um NCM e descreve outro.
⚠ E o item 1 destaca **R$ 8.061,22** de IPI a 3,25% sobre um NCM que a referência diz **0%** —
valor que o cliente pagaria sem que a tabela sustente.

⚠ `valor_mercadoria` é a base; `valor_total` já soma o IPI. Usar o total faria o portal calcular
imposto sobre imposto e acusar divergência onde não há.

**3.451 passando**, build limpo, validado logado (55 medições no seletor; o 327 audita na tela).

- **(23/09, 11h30) Quatro achados do Codex na medição — e dois são repetição de lição minha.**
  - ⚠⚠ **`Number(null)`, `Number("")` e `Number(" ")` devolvem ZERO**, e eu deixava esse zero passar
    como valor declarado. Com CST 50 e `aliq_ipi` ausente, o item virava "0% declarado" em vez de
    NAO_AVALIAVEL — e contra uma TIPI que também diz 0% a comparação passava **em silêncio**, que é
    a conformidade por falta de dado que a regra 2 do motor existe para proibir.
  - ⚠⚠ **A regra do NCM da descrição só valia no pedido.** Eu pus a extração em `lerPedidoOmie` e
    não em `lerNfe`: o mesmo conflito **desaparecia** ao auditar o XML da nota já emitida. A regra
    vale para o DOCUMENTO, não para a porta por onde ele entrou.
  - ⚠ **Falha ao carregar as medições deixava o seletor vazio**, indistinguível de base vazia —
    ⚠⚠ **o mesmo defeito que o Codex já tinha me apontado no autocomplete**. Agora tem carregando,
    vazio, erro e "Tentar de novo", separados.
  - ⚠ **Upload de XML durante uma medição lenta deixava a resposta ANTIGA sobrescrever a recente** —
    ⚠⚠ **também repetição**: é a mesma resposta-fora-de-ordem do autocomplete. Uma `vez` só para as
    duas entradas, e o upload trava durante a auditoria.

- **(23/09, 11h45) Simulador: a ficha de emissão e a prévia dos impostos.** Matheus mandou o
  formato que a contabilidade usa (*"CFOP: … / CST ICMS: … / CST IPI: … / CBenef: … / Informações
  adicionais: …"*) e pediu *"prévia dos valores de cada imposto"*, *"menos texto"* e *"sem as
  anotações falando do meu nome"*.
  ⚠⚠ **CAMPO SEM FUNDAMENTO SAI VAZIO, COM O MOTIVO.** O exemplo trazia `CST ICMS: 41` e
  `CBenef: SP099999` — de uma operação não tributada específica. Repetir isso como sugestão seria o
  portal escolhendo tratamento de ICMS e inventando código de benefício, que é o que ele não tem
  base para fazer. O que tem fundamento ele preenche: CFOP, CST de IPI (da TIPI) e CST de
  PIS/COFINS (do regime declarado, quando a operação é receita).
  ⚠ A prévia lista **uma linha por tributo com o valor**, e mantém na tabela as que não têm número,
  com o motivo — sumir com a linha faria o total parecer o imposto inteiro da operação. O rodapé
  diz quantas ficaram sem número.
  ⚠ **A procedência fica, o nome sai**: quem declarou o regime e a origem continua em
  `lib/fiscal/regime.js`, `lib/fiscal/icms.js` e nos commits; a tela mostra o regime e a
  conferência, não a autoria.
  **3.478 passando.** Validado logado. ⚠ **Sem push** enquanto a rodada estiver aberta.

---

## A base de CST — ICMS, PIS/COFINS e origem (23/09/2026)

Matheus: *"monte essa base legal para você ter o conhecimento dos impostos que faltam preencher o
CST; precisamos ter uma base completa de tudo e os cenários principais"*.

**`lib/fiscal/cst.js`** — as tabelas oficiais, completas:
- **Tabela A (origem)**: 9 códigos — Convênio s/nº de 15/12/1970, redação do Ajuste SINIEF 03/2010.
- **Tabela B (CST de ICMS)**: 11 códigos, do `00` ao `90`.
- **CST de PIS/COFINS na saída**: 10 códigos — tabela 4.3.3 do SPED, a mesma da NF-e.

⚠⚠ **ISTO É TABELA OFICIAL, NÃO INTERPRETAÇÃO.** Os códigos e o que cada um significa são públicos
e fixos; guardá-los não é o portal decidindo nada — é ele parando de fingir que não sabe o que "41"
quer dizer.

⚠⚠ **MAS SABER O QUE O CÓDIGO SIGNIFICA NÃO É SABER QUAL USAR.** Cada verbete leva `exige`: o que
precisa estar demonstrado para aquele código se sustentar. **Sem isso a tabela vira um menu — e
menu é o que faz alguém marcar "41 — não tributada" porque a nota "não tem imposto".**

**`lib/fiscal/cenarios.js`** — os seis cenários, por família de CFOP (Venda, Industrialização,
Remessa, Retorno, Entrega futura, Outras saídas). Cada um reduz a tabela inteira aos códigos que
cabem, com o **porquê** escrito — *"uma lista sem motivo é um chute com aparência de regra"*.

⚠⚠ **"MAIS COMUM" NÃO É "CERTO", e nunca aparece sozinho.** A remessa para industrialização
normalmente corre com suspensão (CST 50), mas a suspensão tem condições e prazo, e a nota que a
declara sem atendê-las é uma nota errada. `provavel` vem sempre colado ao `exige`.
⚠ A **industrialização não tem provável nenhum**: a disciplina paulista (arts. 402 a 409) admite
tributado, diferido e redução conforme o caso, e eleger um seria inventar caminho único.
⚠ No máximo **um** provável por tributo — dois "prováveis" é o mesmo que nenhum.

⚠⚠ **O CST DE ICMS TEM DOIS DÍGITOS: origem + tributação.** Na NF-e saem grudados (`0` + `41` =
`041`), e tratar só a segunda metade como "o CST" é o engano que faz peça nacional e importada
saírem com o mesmo código. A ficha mostra o prefixo da origem declarada.

⚠ Onde o portal **já determina** (CFOP, CST de IPI pela TIPI, CST de PIS/COFINS pelo regime em
operação de receita) não há lista — candidato só aparece onde ele se abstém.

**3.527 passando.** Validado logado na remessa 6.901: três candidatos de ICMS com o 50 marcado
"mais comum", o fundamento do art. 402 e o prefixo de origem.

- **(23/09, 12h15) A FAMÍLIA era grossa demais, e eu propaguei fundamento de uma operação para
  outra.** Dois achados do Codex, e o P1 é sério.
  - ⚠⚠⚠ **`5.923/6.923` recebia "CST 50 — suspensão, mais comum" com a justificativa do art. 402.**
    A família "Remessa" junta a **remessa para industrialização** (5.901, suspensão do art. 402) com
    a **remessa por conta e ordem da VENDA À ORDEM** (5.923), que não tem nada a ver com ele — e o
    `fichaDeEmissao` consultava só a família. **Ressalva em texto não desliga destaque**: o "mais
    comum" continuava ali, apontando para o código errado pelo motivo errado.
    ⚠ O conserto é `cenarioDoCfop`, que usa a família como base e aplica **ajuste por código**. E o
    ajuste **nunca inventa um provável no lugar do que tirou**: sem fundamento para eleger, a lista
    fica sem destaque e o porquê diz de que depende — aqui, *"do que foi destacado na nota de
    venda, e não da suspensão do art. 402"*.
    ⚠ O `5.924/6.924` ganhou ajuste próprio: é emitido pelo **FORNECEDOR**, e o CST é do regime dele.
  - ⚠⚠ **O cenário de "Entrega futura" oferecia o CST 00 com a justificativa da saída física.** Só
    o `5.922/6.922` (simples faturamento) vive nessa família; o `5.116/6.116` (saída física) está em
    "Venda". O texto *"qual das duas notas está sendo emitida"* apresentava como desconhecida uma
    distinção que **o CFOP já resolveu**. Agora o 5.922 oferece `41` e `90`, sem provável, e o
    5.116 mantém o ICMS 00 mas **perde o provável de PIS/COFINS** — a receita pode já ter sido
    reconhecida no faturamento, e repetir a alíquota básica correria o risco de contar duas vezes.
  - ⚠ **A mesma contaminação estava em `lib/fiscal/icms.js`**, que citava o art. 402 para toda
    remessa. Achei ao validar a tela: o fundamento específico é do CENÁRIO, que conhece o código;
    na mensagem da família só cabe a razão comum às duas.
  **3.538 passando.** Validado logado lado a lado: 5.923 sem destaque e com o porquê da venda à
  ordem; 5.901 com o CST 50 e o art. 402. ⚠ **Sem push** enquanto a rodada estiver aberta.
  ⚠⚠⚠ **(rodada 2/2) E EU TINHA CONSERTADO O CAMINHO QUE NÃO RODA.** O ajuste do 5.116/6.116
  vivia só em `cenarios.js` — que a ficha consulta **apenas quando `estimarPisCofins` se abstém**.
  Com valor digitado, o cálculo seguia devolvendo **CST 01 e os R$ 1.650 / R$ 7.600**, e a ressalva
  sumia inteira. **É a mesma metade errada do Ex TIPI: arrumei o texto e deixei o número.**
  ⚠ A indeterminação foi para o CÁLCULO (`RECEITA_JA_PODE_TER_SIDO_RECONHECIDA` em `regime.js`), e
  daí ela chega sozinha à ficha, ao resumo e ao cartão — um lugar, três telas.
  ⚠⚠ **A família diz que há receita; ela não diz que a receita é DESTA nota.** O 5.116 é a saída
  física do que já foi faturado no 5.922: aplicar a alíquota básica aqui corre o risco de contar
  duas vezes.
  ⚠ **O ICMS do 5.116 continua determinado** — a saída física É o fato gerador do ICMS. Abster-se
  dos dois seria trocar um exagero por outro.
  ⚠ E o teste novo passa por `simular` **com valor positivo**, que é o que faltava: o anterior
  chamava `cenarioDoCfop` isolado e não via a integração.
  **3.545 passando.** Validado logado: 6.116 com R$ 100.000 sai sem CST e sem valor de PIS/COFINS,
  com os candidatos; 6.101 segue com CST 01 e R$ 1.650 / R$ 7.600.

- **(23/09, 13h20) O REGISTRO DE CLASSIFICAÇÃO DE PRODUTO — §14, a raiz do problema.** Matheus
  (22/09/2026): *"utilizamos o item ARMAÇÃO DE ESTRUTURA METÁLICA para todos os faturamentos, só
  alteramos o NCM conforme o cliente solicita; o que é cada um vai na descrição do item no Omie"*.
  Enquanto essa decisão mora na cabeça de quem emite, **não existe o que auditar** — a varredura
  acha a divergência e não tem contra o quê comparar.
  ⚠⚠ **O QUE ELE FAZ É GUARDAR QUEM CLASSIFICOU, NÃO CLASSIFICAR.** `FiscalClassificacaoProduto`
  guarda natureza da peça → NCM, com **fundamento obrigatório**, aprovador e data. `PROPOSTA` nunca
  orienta emissão; só `APROVADA` entra no motor.
  ⚠⚠ **NÃO EXISTE CAMPO DE CLIENTE, DE PROPÓSITO.** Classificação fiscal segue a natureza do
  produto: gravar "NCM X para o cliente Y" seria o portal carimbando como regra exatamente a
  prática que o briefing manda questionar.
  **Parecer do Codex (`architecture`): "Prosseguir com ajustes."** Os quatro que mudaram o desenho:
  - ⚠⚠⚠ **BUSCAR O VERBETE PELO NCM DIGITADO SERIA CONFIRMAÇÃO CIRCULAR.** O simulador só recebia
    NCM: procurar a classificação por ele devolveria exatamente o que a pessoa acabou de digitar. A
    natureza da peça virou **campo próprio** (`descricaoProduto`), e é ele que localiza a decisão.
  - ⚠⚠⚠ **`contains("FLANGE")` CASA "SUPORTE PARA FLANGE".** Casamento único **não** elimina falso
    positivo. Por isso o estado se chama `CORRESPONDENCIA_UNICA`, nunca "classificação encontrada";
    **nenhum caminho preenche NCM**, e o cartão mostra o trecho que casou para quem conferir.
  - ⚠⚠⚠ **A CONFERÊNCIA NÃO PODE VIVER DEPOIS DO `continue` DO NCM FORA DA TIPI.** Era onde eu ia
    pôr: o item cuja classificação está **mais** em dúvida — o de NCM desconhecido — nunca seria
    comparado. Ela roda ANTES, e independe de TIPI e de CST. Tem teste próprio.
  - ⚠⚠ **NULL NÃO COLIDE COM NULL NO POSTGRES.** Um índice único parcial sobre
    (`codigoProduto`,`padraoNormalizado`) deixaria dois verbetes **globais** com o mesmo padrão
    conviverem, e a consulta passaria a devolver AMBIGUA para sempre. São **dois** índices parciais
    — um para `codigoProduto IS NOT NULL`, outro para `IS NULL` — sem inventar código-sentinela.
  ⚠⚠ **GLOBAL E ESPECÍFICO CONCORREM, e nenhum ganha por ser mais específico.** Os dois casando é
  `AMBIGUA` — **mesmo com o NCM igual**, porque a sobreposição é defeito de cadastro que alguém
  precisa resolver. Inventar precedência pelo padrão mais longo seria o portal decidindo o que a
  contabilidade não decidiu.
  ⚠⚠ **AUSÊNCIA VIRA UM ACHADO, NÃO UM POR ITEM.** Hoje o cadastro está vazio: um achado por item
  devolveria 24 linhas idênticas na NF-e 973 e afogaria os apontamentos que têm o que dizer.
  Divergência e ambiguidade continuam item a item — essas são da peça.
  ⚠⚠ **FALHA DE LEITURA NÃO É AUSÊNCIA.** `verbetesAprovados()` devolve `null` em erro, e o motor
  transforma isso em `NAO_AVALIAVEL` ("a conferência não foi feita"), nunca em "esta peça não tem
  classificação" — que é uma afirmação sobre um cadastro que ninguém leu. Terceira vez que esta
  lição aparece (autocomplete, medições, agora aqui) e a primeira em que eu a escrevi antes de o
  Codex apontar.
  ⚠⚠ **NÃO EXISTE "EDITAR".** Depois de aprovada, padrão/código/NCM/fundamento são o CONTEÚDO da
  decisão. Trocar é `substituir`, que revoga a anterior e aprova a nova **na mesma transação** —
  dois passos soltos deixam ou uma janela sem classificação, ou as duas valendo (e aí bate no
  índice). O estado anterior é conferido DENTRO da transação (`updateMany` com o status no `where`),
  não lido antes.
  ⚠ **Conflito de índice é 409 com explicação, não 500** — senão quem clicou tenta para sempre.
  ⚠ **Vazamento meu, pego antes de subir**: `referencia` volta inteira no JSON da auditoria, e eu
  tinha enfiado o registro dentro dela — o cadastro completo sairia na resposta de cada auditoria.
  Destruturado fora, com teste que trava isso.
  ⚠ **Quem propõe pode aprovar** (o time são duas pessoas), mas os **dois nomes ficam gravados** e a
  tela **diz** quando coincidem. E o autor vai como **NOME**, não só id: a decisão precisa continuar
  legível depois que a pessoa sai.
  ⚠ **A aba saiu em arquivo próprio** (`AbaClassificacoes.jsx`, 224 linhas) — o Codex avisou que
  encostar no componente de 1.307 linhas agravaria o excedente que já existe.
  Arquivos: `lib/fiscal/classificacao-produto.js` (puro), `registro-classificacao.js` (transições),
  `auditoria-classificacao.js`, `achado.js` (extraído para evitar import circular), rotas
  `classificacoes` e `classificacoes/[id]`, model + `ensure-fiscal-tables.mjs`.
  Testes: `fiscal-classificacao-produto` (21) + 10 na auditoria. **3.576 passando**, lint limpo,
  build local EXIT=0 (as duas rotas saíram `ƒ`), tela validada logada de ponta a ponta: vazio →
  propor → aprovar → simular com NCM divergente, com o aviso de "proposta e aprovação da mesma
  pessoa" aparecendo. ⚠ A linha de teste foi **removida da produção** — aprovada, ela já começaria
  a apontar divergência em auditoria real.
  ⚠ **AINDA ABERTO**: o registro guarda a decisão, mas **ninguém classificou nada ainda**. A tabela
  nasce vazia de propósito: quem escreve o primeiro verbete é a contabilidade, não eu.
  ⚠⚠⚠ **(rodada 1/2) TRÊS P2, E O PRIMEIRO É O MEU PADRÃO DE SEMPRE — O TESTE DEFENDIA O DEFEITO.**
  - ⚠⚠⚠ **`aprovadoPor` NÃO EXISTE; A COLUNA É `aprovadoPorNome`.** O motor lia um campo que a
    persistência nunca devolve: em produção o aprovador saía `null` e a tela escrevia **"—"** —
    justamente o campo que dá sentido ao registro inteiro. E **minhas fixtures usavam o nome
    inventado**, então os 21 testes passavam defendendo o buraco. As fixtures agora têm a forma que
    o banco devolve, e o `codigoNormalizado` delas sai de `canonico()`, como a gravação faz.
  - ⚠⚠⚠ **A ESCRITA GRAVAVA O LITERAL E A LEITURA NORMALIZAVA.** `ARM000010` e `arm000010` passavam
    pelo índice único como escopos **diferentes** e depois casavam **juntos** — os dois aprovados,
    e a consulta devolvendo AMBIGUA para sempre, sem ninguém entender por quê. Pior: `"---"`
    sobrevivia ao `trim`, era gravado como específico e sumia na leitura, passando a valer para
    **qualquer** produto. Agora há coluna `codigoNormalizado`, é **ela** que o índice e a
    comparação usam, e código que normaliza para vazio é **recusado** na gravação.
    ⚠ Os índices antigos **caem pelo NOME** (`DROP INDEX IF EXISTS` antes dos novos): `CREATE INDEX
    IF NOT EXISTS` casa pelo nome, nunca pela definição — deixá-los de pé manteria a unicidade
    errada viva em silêncio, que é exatamente o defeito do `FiscalTipiLinha_busca`.
    ⚠ **No CÓDIGO a pontuação some; na DESCRIÇÃO ela vira espaço.** São regras diferentes de
    propósito, e por isso `canonico` não é `normalizar`: código é identificador (`arm-000010` é o
    `ARM000010`); descrição tem fronteira de palavra, que é o que impede "METALICAS FLANGE" de
    casar dois campos grudados.
  - ⚠⚠ **VERBETE COM CÓDIGO NUNCA ERA ACHADO PELO SIMULADOR.** O cadastro deixa amarrar a
    classificação a um código do Omie e a API filtra por ele — mas o formulário não mandava nenhum,
    então **todo** verbete específico era excluído e a resposta saía "sem classificação" com a
    classificação existindo. O campo entrou na tela.
  **3.580 passando**, lint sem erro, `next build` EXIT=0.
  ⚠ **(autorizado por Matheus, 23/09/2026 — "pode seguir. codex: aceito") DDL APLICADO E
  REVALIDADO.** `ensure-fiscal-tables.mjs` rodado: a coluna `codigoNormalizado` existe, os índices
  `_aprovada_escopo` e `_aprovada_geral` estão no lugar e os dois antigos **sumiram** (conferido em
  `pg_indexes`). Tabela em 0 linhas.
  **Provado contra o banco de verdade**, não só no motor:
  - o índice **recusou** `ARM000010` + `arm-000010` com o mesmo padrão — que é exatamente o par que
    antes era aprovado duas vezes e virava AMBIGUA para sempre;
  - o índice **recusou** dois verbetes globais com o mesmo padrão (o buraco do NULL);
  - a tela achou o verbete gravado como `arm-000010` ao simular com `ARM000010`;
  - o aprovador saiu **"Usuário Teste em 23/09/2026"**, não `"—"` — o achado P2 que os meus
    testes escondiam;
  - com **outro** código, e também **sem** código, o verbete específico não é alcançado.
  ⚠ As linhas de teste foram **removidas da produção** (registro e AuditLog); a tabela volta a 0.
  (Registro histórico) A correção exigia DDL em produção: A coluna `codigoNormalizado` e
  a troca dos dois índices parciais só entram com `node scripts/ensure-fiscal-tables.mjs` (ou o
  `npm run build` completo). A revisão proibiu operação em produção nesta rodada, então **não
  rodei**, e a revalidação logada depende disso. A tabela está **vazia** (0 linhas, conferido), e
  as operações são aditivas: `ADD COLUMN IF NOT EXISTS` + `DROP INDEX`/`CREATE UNIQUE INDEX` sobre
  índices criados hoje e ainda sem nenhuma linha sob eles.
- **(23/09, 15h) Relatórios de inspeção: quatro agentes, uma integração.** Vitor: *"notei que alguns
  estão com o Geraldo duplicando a assinatura, e outros estamos como emitido e faltando assinar (…)
  verifique os relatórios da OP-84 de dimensional, pois parece que os desenhos estão ficando zuado,
  precisa ajustar e ver o que mais tem errado — se for necessário coloque mais agentes"*. Quatro
  agentes em paralelo (assinatura, pendências, OP-84, varredura dos 23 relatórios), cada um numa
  worktree de origin/main e com o banco em SOMENTE LEITURA; eu integrei, revisei e testei junto.
  **(1) Geraldo duplicado.** Não era registro (nenhum envio tem assinante repetido): o gerador do
  dimensional/pré-montagem tinha CÓPIA VELHA da regra de quadros — cada coluna procurava de novo na
  lista, e "Torg Metal" está dentro de "Inspetor Torg Metal" E de "Fiscalização Torg Metal". Os 5 RPM.
  Regra única em `lib/assinatura-quadros.js`: papel do convite pela POSIÇÃO, cada assinatura num
  quadro, inspetor = aprovador vira UM quadro. De quebra: o RIP-089-002/003 punha o Geraldo como
  "Inspetor de Qualidade" (ordem alfabética) — composição que o Davi já recusou duas vezes —, e a
  cópia velha podia SUMIR com a assinatura do cliente no dimensional. Descartei a regra paralela do
  agente de pendências (`assinatura-colunas.js`): resolvia o RIP-089 mas não o dimensional.
  **(2) Emitidos faltando assinar.** Dos 12, só o RPM-105-002 espera de verdade. Os outros 11 são
  OPERAÇÃO, não código: convite para `alexandre_stival@yahoo.com.br` (não é login de ninguém), convite
  "reenviado" por script local em 21/09 que falhou calado (`.env.local` sem RESEND — ver
  [[torg_env_local_sem_resend]]), RIP-071/085 reenviados sem corrigir o que o inspetor recusou, e o
  RIP-089 esperando o PDF certo. Código: a lista e o detalhe passam a dizer "Falta assinar: nome
  (e-mail)" (`faltamAssinar`, `tarjaDoEnvio`). A conta stival2112@gmail.com é do ALEXANDRE desde 04/09.
  **(3) OP-84.** Recorte automático: a divisória do carimbo era "a vertical mais longa entre 15% e
  70% da altura" — no A2 o carimbo do Tekla tem 20% e uma cota da coluna (26%) ganhava; agora ela
  nasce na moldura de baixo, na metade direita (`bordaDoCarimbo`). O corte por "CORTE" só vale se
  menos de 2 traços do desenho atravessarem o limite. Medido contra 19 desenhos reais: os certos
  saem idênticos pixel a pixel; mudam só os quebrados (T84A2–A5 e o T102A1). E a cota agora sabe de
  qual desenho é (`lib/cota-marcacao.js`): as A/B do chumbador T84A1 saíam na folha do T84A5.
  **(4) Da varredura (24 tipos de defeito), corrigi os que saem errados para o cliente:** a COR da
  tinta que nunca saía no PDF (a TMSA devolveu o RIP-103-002 R00 por isso); a folha 1 da pintura
  estourando a margem (datas das assinaturas em y = −2,2 no RIP-106-002 — a linha das tabelas cede,
  entre 9,5 e 12,4 pt); o anexo do e-mail da pré-montagem SEM o desenho; hora da assinatura do
  dimensional em UTC; RESULTADO vazio em relatório aprovado (só o resultado — dimensional/
  alinhamento/acabamento não se inferem); e um risco MEU: desde a edição liberada em 22/09, editar o
  título de um emitido apagava o link do PDF no data book (`vincularNoDataBook(rel, null)`).
  **(5) Quantidade dobrada:** LE + LPC somadas nos RID-084 (8/2/2/4/2 para 4/1/1/2/1) — agora
  `quantidadesPorMarca` usa `pecasReais`, e a criação do dimensional também.
  ⚠⚠ **FICOU PARA DECISÃO/DEPOIS (lista da varredura):** D1 revisão antiga impressa com as
  assinaturas/peças da atual (`aplicarRevisao`); D2 link de envio devolvido mostra o documento atual;
  D10 "FOLHA x DE y" em EVS/LP/US/dimensional; D11 Nº desenho "REFERENCIA"; D14 envelope sempre R00;
  D15 backup do SharePoint gerado na aprovação (antes de assinar); D17 rascunho sem tarja fora do
  dimensional; D18 rascunho aparecendo como ANEXADO no data book; D19 campos cortados com "...";
  `pendenciasParaAssinatura` não confere pintura/EVS/LP/US; o DELETE não encerra o envio (órfão
  RPM-067-001); `lib/portal-obra-consulta.js:267` lista EMITIDO ao cliente sem exigir todas as
  assinaturas; o campo não deixa editar relatório enviado (`app/campo/Medir.jsx:77`); não há como
  TROCAR o e-mail de um assinante pendente pela tela.
  Testes novos: assinaturas-quadros-pdf (5), relatorio-tarja-assinatura (4), inspecoes-lista (+1),
  vista-desenho-folha-a2 (6), cota-desenho (8), pintura-folha1-cabe (2), dimensional-hora-resultado
  (3), assinatura-anexo-desenho (1), databook-vinculo-arquivo (3), inspecao-quantidade-canonica (3)
  — todos vermelhos antes. **3.616 passando**, checar limpo, build ok. Não validado no navegador
  logado (o dev local escreve na produção); validado regenerando os PDFs reais em leitura.

- **(23/09, 16h) Portal de campo: o que a Lais digitava e "sumia" — quatro defeitos, OP-102 medida.**
  Vitor: *"a questão que a Lais comentou de estar sumindo algumas informações que ela colocou"* e *"a
  OP-102 precisa verificar pois ela mencionou que as informações não estavam ficando"*.
  **OP-102 no banco (leitura):** pintura RIP-102-001/002 íntegra (demãos, lotes, datas/horas, rugosidade,
  espessuras, fotos — banco e PDF batem; a 3ª demão foi limpa por ela). Nenhuma gravação desfez outra: a
  auditoria `ALTERAR_PADRAO_INSPECAO` prova a ordem das 5 gravações de 22/09. A memória de padrões só age
  na CRIAÇÃO (`valoresIniciaisInspecao`), não reescreve relatório existente.
  **Os quatro defeitos (todos do caminho do celular):**
  (1) LP: nº da indicação, local, tamanho e tipo — a tela pedia e a rota DESCARTAVA (nunca gravou);
  (2) US: processo de soldagem, metal de adição, tipo de junta, chanfro e a marca do cabeçote gravavam mas
  VOLTAVAM EM BRANCO ao reabrir — a lista de carga do `Medir.jsx` não acompanhou; o seletor do cabeçote
  abria em "Selecione…" (a `chaveCabecote` precisa da marca — regressão do meu conserto de 22/09 10h15);
  (3) a lixeira da junta desalinhava: índice recontado na tela × mescla por posição na rota = dados da 2ª
  por cima da 1ª, a apagada não saía e a última duplicava; junta nova com índice pulado virava `null`;
  (4) enviado para assinatura abria só o PDF no celular, embora a gravação aceitasse desde 22/09.
  **Correção:** `lib/campo-condicoes.js` (carga única, teste que varre as telas e cobra cada `cond.X`),
  `lib/campo-linhas.js` (mescla extraída da rota: LP com os tetos do computador, `removidas` pelo índice
  do banco conferidas pela MARCA, nova junta no fim sem buraco, dimensional não apaga), lista do campo
  com `assinado` + `somenteLeitura` só para envio CONCLUIDO, aviso "já enviado… fica registrado" na tela,
  e a frase "Quem monta faz isso no computador" restrita às cotas (aparecia no EVS e na pintura — o
  EVS-102-001 foi salvo com 0 juntas; as 4 que tem vieram do script de modelo do Codex em 21/09, com laudo
  "A" copiado do resultado geral e soldador/EPS vazios).
  Testes: `campo-reabrir-relatorio` (6, tela real com fetch simulado), `campo-linhas` (9, rota),
  `campo-condicoes` (5, guarda das telas), visibilidade reescrita (3 — afirmava "emitido = consulta",
  regra de antes de 22/09). Todos vermelhos antes. **3.638 passando**, checar limpo, build ok.
  ⚠ **Para revisar:** (a) a remoção por índice confere só a MARCA — duas linhas com a mesma marca na
  mesma posição trocada passariam; (b) CONCLUÍDO só-PDF é regra de TELA, a rota continua aceitando
  (decisão do Vitor de 22/09); (c) não validado logado no navegador (o dev local grava na produção).

- **(23/09, 14h50) A CADEIA DE DOCUMENTOS DE UMA OBRA — PARTE 15.** Até aqui `notasDaOperacao` era
  só TEXTO: *"estas são as notas que geralmente saem"*. Agora a pergunta é sobre uma obra real —
  **o que eu localizei, e até onde consegui conferir.**
  ⚠⚠ **A TELA NUNCA ESCREVE "FALTA UMA NOTA", E É ESSE O RECURSO.** Metade da cadeia do art. 406 é
  emitida por terceiros e não passa pelo Omie da TORG — a venda da MP pelo fornecedor e a **remessa
  simbólica do cliente** (art. 406, II), que foi exatamente a etapa que eu tinha omitido e o
  briefing apontou. Chamar de ausente o que nunca esteve ao alcance é trocar um silêncio por uma
  afirmação falsa, e afirmação falsa é o que alguém copia para um parecer. São **quatro** estados:
  `ENCONTRADO`, `NAO_ENCONTRADO` (com o ESCOPO no motivo — "não localizada nas 2 medições da OP",
  nunca "ausente da OP"), `FORA_DO_ALCANCE` e `NAO_CONSULTADO`.
  **Parecer do Codex (`architecture`): "Prosseguir com ajustes."** O que mudou o desenho:
  - ⚠⚠ **NÃO ENTROU BUSCA POR CNPJ + PERÍODO.** Acharia mais e acharia errado: duas obras do mesmo
    cliente no mesmo mês se misturam, e o vínculo heurístico passaria a ser apresentado como fato.
    Só medição→pedido→NF e romaneio→remessa, que têm vínculo verificável.
  - ⚠⚠ **ETAPA CONDICIONAL NÃO É ITEM DE CHECKLIST.** A cadeia de "uma venda e dois caminhões"
    descreve **dois cenários no mesmo array** e o 5.922 só existe num deles; a remessa do
    fornecedor tem DISPENSA no parágrafo único do art. 406. Cobrar tudo marcaria como defeito o
    comportamento correto. Cinco notas ganharam `condicional`, ficam fora da contagem de "não
    localizadas" e mostram o "só se" na própria etapa.
  - ⚠ **Casamento por "a nota CONTÉM item com este CFOP"**, nunca "o CFOP da nota"; `5925/6925` são
    alternativas, não um código fundido. **Nota cancelada é evidência, não cumprimento.**
  - ⚠ **`remessaNfEmitidaEm` é registro local, não data fiscal** — é gravada com `new Date()` numa
    troca de status de tela. A evidência diz de que data se trata.
  - ⚠ Nada é gravado, como na auditoria: o resultado é derivado, e derivado guardado envelhece calado.
  ⚠⚠⚠ **O DEFEITO QUE EU CRIEI E DEPOIS DESFIZ — E ELE É O ESPELHO DO ANTERIOR.** O Codex apontou
  que `lib/omie-nfe.js` transformava JSON quebrado em `{}` e `{}` em `{ nf: null }`: **erro virando
  ausência**. Consertei com `if (!resp.ok) return { error }` — e **medido contra a API**, o Omie
  responde **HTTP 500 com `faultstring` no corpo** quando o pedido simplesmente não tem nota
  (`"ERROR: NF não cadastrada para o pedido […]"`). Ou seja: o caso NORMAL chega como 500, e o meu
  conserto fez **ausência virar erro** — toda medição da obra aparecia como falha de consulta. O
  corpo manda; o status só fala quando o corpo se cala. `omie-nfe-consulta.teste.js` (8) trava os
  três desfechos, porque os dois erros já aconteceram neste arquivo, um de cada vez.
  ⚠⚠⚠ **E EU BLOQUEEI A API DO OMIE POR MEIA HORA MEDINDO ISSO.** 25 `ConsultarNF` seguidas, para
  saber quantas obras tinham nota, derrubaram a conta inteira:
  `MISUSE_API_PROCESS — "API bloqueada por consumo indevido. Tente novamente em 1764 segundos"`.
  Não atinge só esta tela: atinge todo cron e toda tela do portal que fala com o Omie.
  ⚠ O conserto veio do próprio estrago: **medição que o Omie já marca "Não Faturado" não é
  consultada** (medido: das 25 mais recentes, 25 estão assim, etapa 10 — 25 chamadas para descobrir
  o que a coluna já dizia). Teto de 12 e pausa de 600 ms. O status pode estar velho, então isso
  ENCOLHE a cobertura e é DITO em `fontes`; nunca vira "esta obra não tem nota".
  ⚠ **Defeito meu pego antes de rodar**: `orfaos` comparava documento por identidade de objeto —
  depois do JSON isso nunca casa, e toda a obra apareceria como órfã. Saiu por `id`, com teste que
  faz o `JSON.parse` de propósito.
  Arquivos: `lib/fiscal/conferencia-cadeia.js` (puro), `coleta-documentos.js`, `AbaCadeia.jsx`,
  rota `inteligencia/cadeia`, `omie-nfe.js` corrigido, 5 notas de `cfop.js` marcadas `condicional`.
  Testes: `fiscal-conferencia-cadeia` (16) + `omie-nfe-consulta` (8). **3.604 passando**, lint sem
  erro, build EXIT=0 (`ƒ`), tela validada logada: a cadeia do art. 406 sai com 3 FORA_DO_ALCANCE e
  2 NAO_ENCONTRADO, com o "onde procurei" e a ressalva de fecho.
  ⚠⚠ **O QUE NÃO FOI PROVADO CONTRA DADO REAL: o estado `ENCONTRADO`.** Nenhuma medição do portal
  tem NF hoje — as 25 mais recentes estão "Não Faturado", etapa 10. O caminho positivo está coberto
  por teste de unidade, não por validação logada, e isso é uma diferença que eu não vou apagar.

- **(23/09, 15h45) O PORTÃO POR MÓDULO — a Inteligência Fiscal dava "Algo deu errado".** Matheus
  (23/09/2026): *"usuário financeiro@torg... tentou acessar a aba inteligência fiscal mas a página
  deu erro, ela deve ter acesso full"*.
  ⚠⚠ **A FALHA FOI POR OMISSÃO: `/fiscal` NUNCA TINHA SIDO CADASTRADO NO PORTÃO.** O seletor
  (`lib/modulos-portal.js`) abre o card Fiscal para `FISCAL` **ou** `FINANCEIRO`; `/fiscal` e
  `/fiscal/remessa-terceiro` aceitam os dois; a Inteligência Fiscal exigia **só FISCAL**. Sem linha
  no `moduloNegado`, a recusa vinha do `requireAcesso` DENTRO do Server Component, virava exceção e
  caía no `app/error.js` — *"Algo deu errado. Tente novamente"*, numa tela em que tentar de novo
  nunca ia funcionar. A tela `/sem-acesso`, que DIZ qual módulo falta, já existia desde sempre:
  faltava o Fiscal entrar na tabela.
  ⚠⚠ **NÃO DAVA PARA CONSERTAR NO `app/error.js`**: em produção o Next **apaga a mensagem** do erro
  de Server Component (só o `digest` sobrevive), então não há como ramificar "foi permissão" ali. O
  tratamento tem que ser ANTES, no middleware — que é exatamente onde o mecanismo já estava.
  ⚠⚠ **OMISSÃO NÃO APARECE EM REVISÃO DE DIFF** — ninguém revisa a linha que não foi escrita. Por
  isso `moduloNegado` saiu do `middleware.js` (onde o Next reserva os exports e nada podia ser
  testado) para **`lib/portao-modulos.js`**, e `testes/portao-modulos.teste.js` (23) varre o
  seletor cobrando portão para cada card. Módulo novo sem portão agora é teste vermelho.
  ⚠ A varredura achou um SEGUNDO caso, e esse é intencional: `/rm` é aberto a todo mundo logado
  ("histórico visível para todos") enquanto o card só aparece para quatro módulos. A divergência
  deliberada mora numa lista `ABERTAS_DE_PROPOSITO` **com o motivo escrito** — a diferença entre
  ela e o caso do Fiscal é que esta alguém escreveu.
  ⚠ As guardas da Inteligência Fiscal (página + 11 rotas de API) passaram a aceitar
  `["FISCAL", "FINANCEIRO"]`, alinhadas com o resto do módulo, **a pedido do Matheus**
  (*"pode abrir a tela para todos que tenham módulo fiscal e financeiro"*). `sincronizar` segue ADMIN.
  ⚠ E o módulo FISCAL foi concedido à conta dela, com AuditLog e motivo.
  ⚠⚠ **MÓDULO CONCEDIDO SÓ VALE NO PRÓXIMO LOGIN.** `token.modulos` é gravado no callback `jwt`
  apenas dentro do `if (user)` — nunca é relido do banco durante a sessão, que dura **7 dias**.
  Quem recebe um módulo e não desloga jura que continua sem acesso.
  **3.627 passando**, build EXIT=0, `/fiscal` e `/fiscal/inteligencia` validadas logadas.
  ⚠⚠ **O QUE NÃO FOI PROVADO LOGADO: o redirecionamento para `/sem-acesso`.** A conta de teste é
  ADMIN e passa em tudo, e eu não vou criar usuário em produção só para isso. O que mudou foi UMA
  linha numa tabela agora coberta por teste; o mecanismo de redirect é o mesmo de ~15 módulos e não
  foi tocado. É cobertura de unidade, não validação de tela, e eu não vou apagar essa diferença.
  ⚠ Fora do meu diff: `testes/lib/modo-demo.teste.js` tem 2 erros de lint (`global` não definido).
  Pré-existentes e fora do gate `npm run checar`, que só varre `app lib components`.
  ⚠⚠ **(23/09, 16h05) E EU TINHA ENGORDADO O SIMULADOR.** Matheus, com print: *"está pedindo muitas
  informações, não tem necessidade"*. Ele tem razão — os dois campos que entraram hoje
  (`descricaoProduto` e `codigoProduto`) subiram o formulário para **oito** campos para responder
  UMA pergunta. **Quatro decidem a simulação** (NCM, CFOP, obra, valor); descrição da peça, código
  do produto e CST pretendido só servem para CONFERIR algo que a pessoa já tem em mente, e foram
  para trás de um "Conferir também…".
  ⚠ **A seção abre sozinha quando qualquer um dos três tem valor** — campo preenchido escondido faz
  a pessoa não entender por que o resultado mudou.
  ⚠⚠ **CONTROLE DESLIGADO É RUÍDO**: com a obra escolhida, o seletor de UF ficava cinza dizendo
  *"vem da OP"* — uma célula inteira para informar que não faz nada. Ele só existe para quem simula
  SEM obra, e agora só aparece nesse caso.
  ⚠ Defeito meu na mesma mexida, pego no screenshot: com `inline-flex`, o botão **Simular** subia
  para a linha do link e **cobria o fim do texto**. `flex w-fit`. Conferido por `boundingBox` no
  teste de tela, não a olho.
  **3.627 passando**, build EXIT=0, os dois estados validados logados.

- **(23/09, 16h25) O MOTOR DE REGRAS — e por que ele NÃO virou tabela.** Última pendência grande do
  briefing (PARTES 13–15, 21, 24): *"`FiscalRegra` com condições, status de validação e aprovador"*.
  **Parecer do Codex (`architecture`): opção B, "as regras ficam em código; o banco guarda a
  VALIDAÇÃO".**
  ⚠⚠⚠ **ISTO NÃO ENTREGA A LEITURA LITERAL DO BRIEFING, E É DECISÃO DE ESCOPO — não esquecimento.**
  Regra em tabela sai do alcance do PR, do lint, do teste e da revisão do Codex: uma linha errada
  passaria a mudar **em silêncio** o que o portal manda emitir, que é o oposto de *"NÃO INVENTE
  REGRAS"*. **Autoria de regra pela contabilidade fica FORA desta entrega**, e está escrito na tela
  — esconder faria a contabilidade achar que pode consertar sozinha o que só passa por código.
  ⚠⚠ **O PROBLEMA REAL ERA OUTRO, E ESTAVA À VISTA O TEMPO TODO**: os 26 CFOPs nasceram
  `validado: false` e **nenhuma tela mostrava isso** — o flag existia só no código e num comentário
  de rota. Agora são **56 regras** (CFOPs + etapas de cadeia + cenários de CST), cada uma com
  estado visível e conferência nominal.
  ⚠⚠ **A CONFERÊNCIA É DE UMA VERSÃO, NÃO DA REGRA.** `impressao` é o sha256 do conteúdo que
  valia quando alguém conferiu; mudou o texto, vira **ALTERADA** sozinha. Herdar seria atestar um
  texto que ninguém leu. ⚠ A impressão cobre condições, efeitos, emitente, âmbito, fundamentos **e
  o texto que orienta a emissão** — uma vírgula ali pode mudar o sentido, e uma reconferência a
  mais é mais barata que uma aprovação sobre outro texto.
  ⚠⚠ **PENDENTE NÃO BLOQUEIA, E ISSO É DECISÃO MINHA.** O Codex sugeriu reservar o preenchimento da
  ficha às regras validadas e avisou que *"esse impacto precisa constar do aceite"*. Com as 56
  pendentes, isso desligaria o módulo inteiro no dia em que subisse. Escolhi o lado que não quebra:
  pendente ORIENTA e a tela **diz** que não foi conferido; só **CONTESTADA** bloqueia.
  ⚠⚠ **CONTESTADA NÃO ENTREGA FICHA — tarja não bastava** (parecer do Codex). A ficha é o bloco que
  a pessoa COPIA para o Omie: ela seria copiada com a tarja para trás. Bloqueia só o que DEPENDE da
  regra — o IPI, que vem da TIPI, continua à vista.
  ⚠⚠ **APROVAR O CFOP NÃO APROVA O CST**: um resultado usa o verbete do CFOP **e** o cenário da
  família, conferidos separadamente. Uma bloqueada derruba o conjunto, e o motivo diz qual.
  ⚠⚠ **EDITAR NÃO APAGA CONTESTAÇÃO**: se mudar o hash virasse "pendente utilizável", um ajuste de
  vírgula silenciaria quem disse que a regra está errada.
  ⚠⚠ **E AQUI FALHA DE LEITURA BLOQUEIA** — o inverso do resto do módulo, e é o inverso que
  protege: recomendar sem saber se o verbete foi contestado é arriscar repetir uma orientação já
  marcada como errada. A tela diz *suspensa*, não *tudo certo*.
  ⚠ **O id sai do conteúdo, nunca da posição no array** (parecer do Codex): inserir uma etapa no
  meio da cadeia renumeraria todas e transferiria a conferência de uma etapa para outra, calada.
  ⚠ **Histórico, não estado**: cada decisão é uma LINHA NOVA, sem índice único por `regraId` — a
  vigente é a mais recente. Sobrescrever apagaria a contestação que motivou a revisão.
  ⚠ **A impressão vem da TELA no POST**, não é recalculada no servidor: ela atesta a versão que a
  pessoa LEU. Divergiu, é **409**, não "grava assim mesmo".
  **Dois defeitos meus pegos na validação de tela, não em teste:** (1) o alerta começava com o **id
  interno** (`cfop:5101: A contabilidade contestou…`) — o título humano passou a viajar na
  situação; (2) o cartão **não mostrava o nome do estado**, só a cor e o ícone — quem não distingue
  cores não tinha como saber se estava conferido ou bloqueado.
  Arquivos: `catalogo-regras.js` (ids estáveis + impressão), `politica-regras.js` (puro),
  `validacao-regras.js` (persistência), model + ensure, rota `inteligencia/regras`, `AbaRegras.jsx`,
  e o gate no `simulador.js` + rota `simular`.
  Testes: `fiscal-regras-validacao` (19). **3.704 passando**, lint sem erro, build EXIT=0 (`ƒ`),
  validado logado: com tudo pendente a ficha SAI; contestando o 5.101 a ficha SOME, o motivo sobe
  como alerta alto e o IPI da TIPI continua. ⚠ A linha de teste foi removida da produção.
