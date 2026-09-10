# CLAUDE.md

## Divisão de trabalho solicitada por Matheus (09/09/2026)

Claude Code implementa; Codex revisa o contexto, encontra problemas e testa. Antes de iniciar ou retomar trabalho, leia `docs/revisao-codex-claude.md` e trate os achados pendentes pertinentes à tarefa. Registre ali o que foi corrigido, arquivos/commits, testes e dúvidas para nova revisão. Não declare validação pelo Codex sem o retorno dele. As instruções deste fluxo não ampliam autorização para produção ou publicação.

A integração local está descrita em `docs/integracao-codex-claude.md`: o hook Stop chama o revisor e devolve achados nesta sessão. Trate o feedback dentro da tarefa autorizada; não desative ou altere o hook para contornar uma reprovação. Falha/limite/decisão humana são pendências, não aprovação. Não faça pull/push automaticamente durante a revisão. O usuário pode suspender a integração explicitamente.

**Você (Claude Code) é o orquestrador único.** Além da revisão automática acima, você pode
consultar o Codex como especialista pontual ANTES de implementar algo não-trivial — nova tela
(`design`), mudança estrutural grande (`architecture`), schema/query/concorrência (`database`),
login/permissão/endpoint (`security`), feature pronta (`testing`). Skills em `.codex/skills/*.md`;
chamada via `python3 scripts/revisao-codex/consultar.py <skill> --arquivo <pedido>` — mande
contexto mínimo (diff, arquivos, trecho relevante), nunca o projeto inteiro. É sempre read-only:
o Codex nunca edita código por conta própria, só quando você ou o usuário delegar explicitamente,
e nesse caso não edite o mesmo arquivo enquanto isso não terminar. Nem toda tarefa precisa de
especialista — use quando isso economizar retrabalho ou aumentar a qualidade da decisão, não por
reflexo. Máximo 2 ciclos de correção por tarefa (automático ou manual); sem solução depois disso,
pare e reporte ao usuário em vez de insistir.

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start dev server
npm run build        # prisma generate + next build
npx prisma generate  # regenerate Prisma client after schema changes
npx prisma db push   # apply schema changes without a migration (dev only)
npx prisma migrate dev --name <name>  # create a migration
npx prisma db seed   # seed initial admin user
npx prisma studio    # open Prisma database UI
npx vercel env pull .env  # pull env vars from Vercel

npm test             # vitest — 128 testes, NENHUM toca o banco
npm run checar       # varre no-undef/no-unused-vars em app, lib e components
npx eslint .         # quality gates completos (teto de 350 linhas, complexidade…)
```

## Testes

`npm test`. **Nenhum teste toca o banco** — o `testes/apoio/setup.js` aponta a `DATABASE_URL`
para lugar nenhum de propósito, e o Prisma é mockado em `testes/apoio/prisma.js`. Um teste que
abre conexão com o Neon é um teste que escreve em **produção** (ver o aviso de arquitetura abaixo).

Os testes do `calcularLqc` são de **caracterização**: congelam o que a função devolve hoje, não o
que ela deveria devolver. Se um número mudar numa refatoração que deveria preservar comportamento,
o errado é a refatoração. Se mudar de propósito, atualize com `npx vitest -u` **e diga no commit
qual regra mudou e por quê**.

## Workflow padrão de desenvolvimento

Todo desenvolvimento segue este fluxo obrigatório:

1. **Desenvolver localmente** — faça as alterações no projeto
2. **Validar com o servidor de dev** — rode `npm run dev` e confirme que a mudança funciona em `http://localhost:3000`
3. **Só então subir para main** — `git push origin main` apenas após validação local bem-sucedida

> Nunca faça push direto sem ter rodado e validado localmente primeiro.

## Local development setup

`.env` is a symlink to `.env.local` — create it once with:

```bash
ln -sf .env.local .env
```

This is required because Prisma CLI reads `.env` while Next.js reads `.env.local`. Without the symlink, commands like `prisma db pull` and `prisma db push` fail silently or error.

Three env vars that differ between Vercel and local:

| Var | Vercel | Local `.env.local` |
|---|---|---|
| `NEXTAUTH_URL` | empty (NextAuth falls back to `VERCEL_URL`) | `http://localhost:3000` |
| `DIRECT_URL` | empty | same value as `DATABASE_URL_UNPOOLED` (the Neon connection string **without** `-pooler` in the host) — required for `prisma migrate` and `prisma db push` |
| `NEXTAUTH_SECRET` | may be empty in production | generate with `openssl rand -base64 32` |

### Número de build (versão exibida no portal)

O rodapé da barra lateral mostra `v<VERSAO_ATUAL> · build <N>`, onde `N` é a contagem de commits.
Instale os hooks uma vez por clone — são **dois**, e o mesmo comando liga os dois:

```bash
git config core.hooksPath .githooks
```

O hook `.githooks/pre-commit` roda `scripts/gerar-versao.js`, que grava `versao-build.json` e o
inclui no próprio commit. `next.config.js` lê esse arquivo e expõe `NEXT_PUBLIC_BUILD_NUMERO`.

O `.githooks/pre-push` recusa o push com **marcador de conflito** em arquivo versionado ou com
`versao-build.json` inválido.

> ⚠⚠ **`versao-build.json` conflitado derruba o build da Vercel** (08/09/2026). O webpack importa
> esse arquivo em `app/versao/page.js`: JSON com `<<<<<<< HEAD` dentro não é aviso, é build falho —
> e **nenhum teste pega**, porque o arquivo só é lido no build.
>
> ⚠ **`git rebase --continue` NÃO roda o `pre-commit`.** Foi por aí que o arquivo sujo passou: um
> laço de rebase com `node scripts/gerar-versao.js || true` engoliu a falha do gerador (que se
> recusa, corretamente, a parsear um JSON quebrado) e commitou os marcadores. Ao resolver esse
> arquivo num rebase, **regere e confira** em vez de dar `git add` no que o merge deixou:
>
> ```bash
> git show <ultimo-commit-bom>:versao-build.json > versao-build.json
> node scripts/gerar-versao.js && git add versao-build.json
> ```

> **Depois de um `git pull`/rebase** o número gravado fica atrás da contagem real por alguns
> commits; o hook realinha sozinho no commit seguinte (ele usa o maior entre a contagem atual e o
> valor gravado, então nunca anda pra trás).

> **Por que arquivo e não `git rev-list` no build:** a Vercel faz clone **raso** do repositório, então
> contar commits durante o build lá devolveria ~10 em vez do número real. O número precisa viajar
> dentro do commit. Sem o hook instalado, o número **congela** — o hash e a data do build (no
> `title` do rótulo) continuam corretos, mas rode `npm run versao` antes de commitar.

### Branches

Time atual: Vitor (diretor) e Matheus.

- **Mudanças simples** (docs, config, fix pequeno): podem ir direto na `main`.
- **Features grandes ou mudanças de schema**: preferir branch `vitor/<feature>` ou `matheus/<feature>` com PR.
- Sempre `git pull origin main` antes de começar qualquer trabalho e antes de fazer push.
- Quando o time crescer (3+ pessoas), migrar para branches obrigatórias para todo tipo de mudança.

## Architecture

> **Warning — no staging environment.** Local development runs against the **production Neon database** and **real integrations** (Omie ERP, Resend, Anthropic). Any test that creates data — purchase orders, vendor quote emails, OP mutations — affects real production records and may trigger real emails to suppliers.

> **Warning — Neon compute pequena → "out of memory" (code 53200).** A compute do Neon satura de RAM sob carga (escritas em massa, builds que pré-renderizam páginas). O erro aparece como `PostgresError 53200 "out of memory"` em vários contextos (`MessageContext`, `ExecutorState`, `CachedPlanQuery`). **Causa estrutural: o mínimo de autoscaling da compute está baixo** — a correção definitiva é aumentá-lo no painel do Neon (decisão de infra do time). Mitigações já aplicadas no código para escritas em massa (ver `/api/mes/sync-ordens`), que **devem ser o padrão para qualquer bulk write futuro**:
> - **Usar `prismaDirect`** (conexão direta, sem pooler) de `lib/prisma.js` — o pooler (PgBouncer) estoura `MessageContext` com statements grandes.
> - **Statement SQL constante** (ex: `INSERT ... SELECT FROM UNNEST($1::text[], ...)`) com os dados passados como **arrays-literais de texto** (`'{"a","b",NULL}'`) e cast `::tipo[]` no SQL. Nunca gerar SQL com valores inline (cada SQL diferente vira um plano cacheado → `CachedPlanQuery` OOM). Não passar arrays JS direto (Prisma manda em binário → erro `22P03 improper binary format`).
> - **Bookkeeping não-fatal**: tabelas de auditoria/log (ex: `MesSyncLog`) em `try/catch` — uma falha de log nunca deve abortar a escrita dos dados de verdade.
> - **Não rodar sync pesado enquanto há deploy/build da Vercel em andamento** (o build pré-renderiza páginas que batem na produção e somam pressão de memória).
> - **Cold start (scale-to-zero) → `P1001 "Can't reach database server"`**: a compute do Neon suspende quando ociosa; o **primeiro** query de um cron estoura antes dela acordar. **Todo cron deve chamar `await aquecerBanco(prisma)` de `lib/db-retry.js` no início** (SELECT 1 com retry/backoff — acorda a compute antes do trabalho). O `registrarExecucao` (heartbeat) já retenta em erro de conexão pra não "congelar" e alertar à toa. Correção definitiva é infra: desligar o scale-to-zero / subir o mínimo de autoscaling no Neon.

**Fullstack SaaS** — Next.js 14 App Router (JavaScript, no TypeScript), PostgreSQL via Neon + Prisma 6, deployed on Vercel. It is an internal ERP workflow tool for Torg Metal (steel fabrication), orchestrating the flow: **Comercial → Engenharia → Compras → Produção/Almoxarifado → Expedição**.

### App Router structure

All pages are under `app/`. API endpoints are under `app/api/`. The `@/*` alias maps to the repo root.

Key domain modules:
- `app/comercial/` — Sales team: create/manage Ordens de Produção (OPs), contracts, budgets, measurements synced with Omie ERP
- `app/rm/` — Engineering: create Material Requisitions (RMs) linked to OPs
- `app/compras/` — Procurement: receive RMs, manage vendor quotes, generate Omie purchase orders
- `app/producao/` — Production tracking (weekly, inventory, piece control)
- `app/fornecedores/c/[token]/` — Public vendor portal (token-based, no auth)
- `app/financeiro/`, `app/expedicao/` — Financial KPIs and shipping manifests

### Shared library (`lib/`)

- `prisma.js` — Prisma singleton (import from here, never instantiate directly)
- `auth.js` / `session.js` — NextAuth config + `requireRole(["ROLE"])` guard used in every API route
- `omie-*.js` — Five modules wrapping the Omie ERP REST API (30-second cache + backoff retry)
- `parse-*.js` — Document parsers for Tekla XLSX, Le-Form21 CSVs, PCP-EAP spreadsheets, and PDF invoices
- `pdf-parser-server.js` — Regex fallback for PDF parsing when the Claude AI method fails
- `estoque-alocacao.js` — Inventory allocation logic
- `email.js` / `notificacoes.js` — Transactional email (Resend) and in-app notifications

### Authentication & roles

NextAuth credentials provider with JWT (12-hour session). Eight roles: `ADMIN`, `COMERCIAL`, `ENGENHARIA`, `COMPRAS`, `PRODUCAO`, `ALMOXARIFADO`, `FINANCEIRO`, `EXPEDICAO`. `middleware.js` enforces role-based routing; every mutating API endpoint calls `requireRole([...])` at the top.

### Data model (Prisma)

Core entities:
- **OP** — central entity; has items, revisions, budgets, addenda, receipts, measurements
- **RM / RMItem** — material requisitions linking Engineering to Procurement
- **Cotacao / CotacaoItem** — vendor quotes accessed via public token
- **PedidoOmie** — purchase orders synced to/from Omie
- **EstoqueItem / EstoqueReserva / EstoqueAlocacao** — inventory state
- **ProducaoSemanal / PecaConjunto** — weekly production data

Audit trail via `AuditLog` — write an entry for every critical mutation.

### External integrations

- **Omie ERP** — orders, service orders, inventory (all via `lib/omie-*.js`)
- **Anthropic Claude API** (`@anthropic-ai/sdk`) — primary PDF invoice parser; `lib/pdf-parser-server.js` is the regex fallback
- **Vercel Blob** — PDF/file storage; metadata saved in DB after upload via `/api/upload-blob`
- **Resend** — transactional email
- **SharePoint** — production planning sheet sync (optional cron at 8 AM)
- **SigissWeb** (`lib/sigissweb.js`) — web service REST de NFS-e da prefeitura de **Conchal**, para conciliar notas de serviço emitidas direto no portal da prefeitura (quando o Omie falha na emissão) que não aparecem nas Ordens de Serviço do Omie. Endpoint `/api/financeiro/nfse-conchal`; UI no painel de conciliação da tela Faturamento por obra.
  - **Env** (valores no `.env.local` / Vercel, **nunca** commitados): `SIGISS_URL` (= `https://wsconchal.sigissweb.com/rest`), `SIGISS_LOGIN` (CNPJ do prestador, só dígitos), `SIGISS_SENHA`. Opcionais: `SIGISS_SISTEMA_OMIE` (string que identifica o Omie no campo `sistema_gerador`, default `omie`) e `SIGISS_TLS_INSEGURO=false` para reativar a verificação de TLS.
  - **Gotcha — senha do web service ≠ senha do portal.** A `SIGISS_SENHA` **não** é a senha de acesso ao portal; é gerada à parte no SigissWeb em **Gerenciamento → Usuários → ícone de cadeado da coluna "Web. Serv." → gerar senha de PRODUÇÃO**. Login no WS com a senha do portal retorna HTTP 400 "Login e/ou Senha inválido(s)".
  - **Gotcha — TLS.** O servidor serve a cadeia de certificado incompleta (falta o intermediário) → `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. A lib usa um dispatcher undici com `rejectUnauthorized:false` **escopado só às chamadas do SigissWeb**.
  - **Método-chave**: `GET /lancamentos/pegalancamentosescriturados/{cnpj}/mes/{m}/ano/{a}/tipo/P` (tipo P = prestador) → XML `<LANCAMENTOS>`. A descrição/obra vem do XML completo da nota (`/nfes/pegaxmlpelonumeronf/{num}/serienf/{serie}`).

### Vercel cron jobs (`vercel.json`)

- `0 6 * * *` → `/api/cron/estoque-produtos`
- `30 6 * * *` → `/api/cron/estoque-movimentacoes`
- `0 8 * * *` → `/api/producao/sync-sharepoint`

Routes that exceed the default 10-second limit declare `export const maxDuration = 60` at the module level.

### UI conventions

- Tailwind CSS 3.4 with TORG brand palette (see `tailwind.config.js`): `torg-blue`, `torg-dark`, `torg-gray`, `torg-orange` + Saira font
- Icons from `lucide-react`
- All naming (variables, comments, UI text) is in **Portuguese**
- Client components use `"use client"`; keep server-only logic in API routes or lib modules
- Zod validation on all API route inputs

## Skills e plugins do time

Ficam **no projeto** (`.claude/`), não no perfil de cada um — quem clonar o repo
recebe tudo junto. Nada aqui precisa de instalação manual, com uma exceção
anotada abaixo.

| O quê | Onde | Gatilho |
|---|---|---|
| `superpowers` (plugin, 14 skills) | `.claude/settings.json` → `enabledPlugins` | automático |
| `caveman` (skill) | `.claude/skills/caveman/` | `/caveman` |
| `graphify` (skill) | `.claude/skills/graphify/` | `/graphify` |

### Primeira vez neste repo — o que fazer

```bash
git pull origin main
```

E só. Não existe comando de instalar skill. O que acontece:

1. **Abra o projeto no Claude Code.** Na primeira vez ele mostra um diálogo de
   confiança perguntando se você aceita as configurações deste repositório
   (`.claude/settings.json`). **Aceite** — é esse aceite que liga o plugin. Sem
   ele o `superpowers` fica inerte e as skills locais não carregam.
2. **Se a sessão já estava aberta durante o `git pull`, reinicie.** O
   `settings.json` é lido na abertura da sessão, não a cada mensagem.
3. Confira com `/caveman` e `/graphify` — se aparecerem na lista, está tudo no
   lugar. Para o `superpowers`, o sinal é o Claude parar para planejar antes de
   codar, sem você pedir.

**superpowers** entra via `enabledPlugins` + `extraKnownMarketplaces`. Ao aceitar
a confiança, o Claude Code baixa o marketplace `anthropics/claude-plugins-official`
sozinho — não tem download manual. São skills de *processo* (brainstorming, TDD,
depuração sistemática, revisão) que decidem **quando** parar para perguntar e
verificar, antes de sair codando.

**caveman** e **graphify** são skills de projeto: vêm no `git pull` e funcionam
direto. O `graphify` tem uma ressalva de CLI, logo abaixo.

### O CLI do graphify

O `graphify` depende de um CLI Python de ~200 MB (numpy, networkx e as gramáticas
do tree-sitter). Não cabe no repositório — cada máquina instala a sua. Um comando:

```bash
bash scripts/instalar-graphify.sh
```

Idempotente: rode quantas vezes quiser. E você normalmente **não precisa rodar** —
a skill verifica o CLI antes de qualquer comando e chama o instalador sozinha se
faltar.

O que o script resolve por você:

- **PEP 668** — o Python do Ubuntu 24.04+ e o do Homebrew são *externally managed*
  e recusam `pip install` direto. Daí o venv, em `~/.local/share/graphify/.venv`,
  **fora** de qualquer repositório (198 MB dentro do projeto seriam um acidente
  esperando o `git add -A`).
- **`ensurepip` ausente** — Debian/Ubuntu tiram o módulo do pacote base, então
  `python3 -m venv` falha na metade. O script detecta e traz o pip pelo get-pip.
- **Verificação de verdade** — carrega numpy, networkx e tree-sitter e roda o
  comando. "O pip não deu erro" já enganou antes.
- Publica uma cópia de si mesmo em `~/.local/bin/instalar-graphify`, para
  consertar o CLI de fora deste repositório.

Se o `graphify` não for achado pelo nome depois disso, é só o `~/.local/bin`
faltando no PATH — chame por `~/.local/bin/graphify` ou acrescente ao seu
`~/.bashrc`/`~/.zshrc`.

⚠ **`npx skills add <repo>` instala no diretório do projeto por padrão, e traz o
pacote INTEIRO do repositório** — o caveman, por exemplo, são 20 skills, não uma.
Se for adicionar outra, use `--skill <nome>` para escolher, e revise o
`git status` antes de commitar.

## Etiquetas de carregamento (Expedição)

Substitui o **BarTender**. `Expedição › Etiquetas de Carregamento` → escolher a OP,
marcar as peças, gerar. Sai uma etiqueta **por peça** (numerada `001/N`), não por marca.

| | |
|---|---|
| Impressora | **Argox OS-214 plus series PPLA**, USB, 203 dpi |
| Etiqueta | **100 × 50 mm**, BOPP permanente laranja, transferência térmica |
| Engine | `pdf-lib` (o mesmo dos outros 35 PDFs) + `qrcode` |
| Código | `lib/etiqueta-carregamento-pdf.js`, `app/api/expedicao/etiquetas/` |

**Ao imprimir**: escolher a Argox, escala em **100%** (nunca "ajustar à página") e margens
**nenhuma**. A página do PDF já tem o tamanho exato do rolo — qualquer ajuste do navegador
faz a etiqueta sair torta. O aviso está na própria tela.

⚠ **A impressora só imprime PRETO** — o laranja é o material do rolo. Por isso o logo da
etiqueta é o `public/torg-logo-etiqueta.png` (chapado e horizontal), e não o `torg-logo.png`
do portal, que é vertical e tem gradiente azul. Ele foi gerado a partir do
`public/torg-logo.svg` recortado em duas partes e recolorido.

⚠⚠ **QUEM DEFINE A LISTA É A LISTA DE EXPEDIÇÃO — não `PecaConjunto`.** Matheus (08/09/2026):
"não pode aparecer as posições, somente os produtos finais igual sai na Lista de Expedição" e
depois "acredito que só deve considerar a L.E e não incluir LPC junto para não duplicar". Toda a
regra mora em `lib/itens-expedicao.js` (`itensExpediveisDaOP`), usada tanto pelas etiquetas quanto
pela Conferência de Peça. Em duas etapas:

1. **A Lista de Expedição (`ListaExpedicao`, a planilha importada) diz QUAIS marcas existem e
   QUANTAS peças cada uma tem.** Ela é o documento — manda na quantidade e na descrição.
2. **`PecaConjunto` só COMPLETA** o que a L.E. não trouxer (peso, id) para as marcas carimbadas
   `naLE`, e cobre obras cuja planilha nunca foi importada. **Uma linha de LPC nunca entra na lista
   por si** — é ela que trazia as posições de fábrica e, antes desta regra, a duplicação.

Motivo do redesenho: `PecaConjunto` guarda a obra INTEIRA — o conjunto que sobe no caminhão e as
posições que o compõem — vinda de importadores diferentes sob **chaves de `opNumero` diferentes**
para a mesma OP (a OP-89 tem `"89"`, `"089"`, `"T89A"`, `"T89C"`, por causa do
`@@unique([opNumero, marca])`). Usá-la como ponto de partida gerava, ao mesmo tempo: posições na
lista (croquis como `T97A-P30`), a mesma marca até três vezes (809 linhas para 284 marcas na
OP-89), o PERFIL no lugar do nome da peça (`L1.1/2''X1/8''` em vez de `CONTRAVENTAMENTO`), e 484
marcas da OP-67 **invisíveis em toda tela** por não terem nenhuma linha em `PecaConjunto`.

Conferido linha a linha contra a planilha: OP-97, 60, 67, 85 e 121 batem **exatamente** (marcas e
peças); a OP-89 soma as poucas marcas que só existem no cadastro (planilha 8705 + 204 = 8909).

⚠ **`"TOTAL.:"` é uma marca no banco**, em 4 obras (060, 067, 085, 089) — o importador da L.E.
engoliu o rodapé da planilha; a da OP-89 tinha `qte` 8705. `ehLinhaDeTotal` filtra na leitura.
Consertar o importador e limpar as linhas continua pendente.

⚠ **O histórico de impressão é gravado pela MARCA (`entity: "EtiquetaCarregamento"`,
`entityId: "<opNumero>|<MARCA>"`), não pelo id de `PecaConjunto`.** O id não sobrevive à
reimportação da lista — mesma lição já gravada no schema em `LiberacaoProducao.pecaMarcas` — e
agora existe item legítimo sem NENHUMA linha no cadastro. Registros antigos (`entity:
"PecaConjunto"`) continuam lidos junto, senão a coluna diria "nunca impressa" para etiqueta que
já saiu.

⚠ **A contagem sai sem zero à esquerda** ("3/3", "300/300"). O "001/1" da etiqueta antiga era
limitação do BarTender, que importava a planilha com o campo de largura fixa — aqui o número vem
do banco a cada etiqueta e a largura se ajusta sozinha.

### Modelo de etiqueta por cliente (QWS/Petrobras)

Um seletor **Modelo da etiqueta** na tela escolhe entre `padrao` e `qws` (`MODELOS` em
`lib/etiqueta-carregamento-pdf.js`, que só despacha; cada desenho mora no seu arquivo —
`etiqueta-qws-pdf.js`, com o que é comum aos dois em `etiqueta-pdf-base.js`).

⚠ **O modelo é por IMPRESSÃO, não por cliente cadastrado.** Amarrar o desenho ao nome do cliente
pareceria mais esperto, mas a mesma obra pode precisar dos dois e um cliente novo com a mesma
exigência viraria um `if` aqui.

⚠⚠ **O modelo QWS identifica a peça pela TAG PETROBRAS**, não pela marca da Torg — é por esse
código que o recebimento do cliente confere. TAG, referência de desenho e posição ("SE-001") **não
existem no cadastro**: vêm da planilha "Lista Equivalência de Marcas" do cliente, importada na
própria tela (`lib/parse-equivalencia-marcas.js` → tabela `EtiquetaCampoExtra`). Quantidade e peso
continuam vindo da L.E., pra etiqueta nunca discordar da tela. Peça sem esses campos imprime "—":
a etiqueta sai e o buraco aparece na hora de colar, não depois que o caminhão saiu.

⚠ **O QR continua codificando a MARCA da Torg** nos dois modelos. Quem lê o código no pátio é a
Torg (conferência, carregamento) e a leitura tem que cair na mesma chave que o portal usa.

⚠⚠ **MARCA REPETIDA NA PLANILHA DO CLIENTE É UNIDADE, NÃO LINHA DUPLICADA.** Matheus (10/09/2026):
"a T102A15 são 3 unidades aí repetiu 3 linhas dela apenas porque cada unidade tem uma referência e
tag da QWS". Por isso `EtiquetaCampoExtra` é única por **(opNumero, marca, unidade)** e a etiqueta
`2/3` leva a TAG da segunda linha (`unidadeDaEtiqueta`) — guardar por marca fazia as 3 saírem com a
TAG da primeira.

⚠ **A L.E. (FORM 21) NÃO repete marca** — lá a T102A15 é UMA linha com `QTD. 3`. Quem repete é só a
lista de equivalência do cliente, que precisa de uma linha por TAG. Cheguei a somar marcas repetidas
no import da L.E. achando que ela também repetia; conferido no arquivo real (T102-LE-R01), não
repete, e a mudança foi desfeita. As duas planilhas são complementares: a L.E. manda em marca,
quantidade e peso; a de equivalência, só em TAG/referência/posição.

⚠ **A marca e a posição saem separadas por `  /  `**, não coladas por hífen. Matheus (10/09/2026):
"ficou T102A1-SE-001, parece um negócio só". São códigos de sistemas diferentes — o hífen os funde
num terceiro código, que não existe em lugar nenhum.

⚠⚠ **MEXEU NO `schema.prisma`? REINICIE O `npm run dev`.** O client do Prisma é gerado em disco por
`npx prisma generate`, mas o Next segura o módulo já carregado: o servidor que subiu antes continua
com o client velho e devolve `Unknown argument` numa chave que existe no banco e no client novo
(10/09/2026 — custou dois erros que pareciam bug de código: um 500 na geração das etiquetas e uma
falha no upsert de `EtiquetaCampoExtra`).

⚠ **Etiqueta além das unidades importadas cai na primeira**, não em branco — acontece quando a L.E.
do portal está numa revisão e a lista do cliente em outra.

O cabeçalho da lista tem os **funis tipo Excel** do `components/FiltroColuna` (Marca, Descrição e
Etiqueta). Peças e Peso ficam sem funil de propósito — número contínuo vira menu de 200 valores.

**Quais já foram impressas** aparece numa coluna da própria lista, com data e "×N" na reimpressão.
O histórico mora no `AuditLog` (`action: "IMPRIMIR_ETIQUETA_CARREGAMENTO"`, ver acima), não numa
coluna de `PecaConjunto`: é a pergunta que a tabela de auditoria já existe para responder,
o registro é obrigatório de qualquer jeito, e assim ficam TODAS as impressões, não só a última.
O carimbo é gravado **depois** de o PDF existir — e uma falha ao gravar não segura o PDF.

⚠ **Não existe importação de planilha, de propósito.** Marca, descrição, quantidade e peso
vivem em `PecaConjunto`; a planilha só existia porque o BarTender não enxerga o banco.
Tirar esse pulo tira junto a chance de imprimir com dado velho.

> **Se a qualidade de impressão decepcionar**, o caminho de upgrade é gerar **PPLA cru** em vez
> de PDF — o layout e os dados se aproveitam, troca só o renderizador. Isso exige um agente
> local no PC da expedição para mandar os bytes à USB, que é a razão de não ter começado por aí.

## Import de lista (LE/LPC) — o recibo tem que ser recibo

`Engenharia › Listas` importa a planilha, grava as peças e **arquiva o arquivo no SharePoint** com
uma aba `Revisao` embutida (`app/engenharia/listas/revisao-lista.js`).

⚠⚠ **ESSA ABA JÁ MENTIU, E O PAPEL CIRCULOU COMO VERDADE.** A LE R01 da OP-102, importada em
**13/08/2026**, foi arquivada dizendo "18 incluídas" — e **nenhuma das 18 entrou no banco**. O
`diff` da rota é calculado **ANTES** da gravação: ele responde "quais marcas do arquivo ainda não
existem", que é uma **previsão**, não um recibo. Quem abriu o arquivo depois leu 18 incluídas e
seguiu a vida; a divergência só apareceu **quatro semanas depois**, quando a tela de etiquetas
mostrou 71 marcas numa lista de 77 e Matheus perguntou por quê (10/09/2026).

O defeito que engoliu as 18 era do importador e já estava corrigido (`67fea4eb48`, 27/08 — a busca
da marca existente não filtrava por fonte, então a linha que a LPC já tinha virava UPDATE e a da LE
nunca nascia). O que deixou passar quatro semanas foi **não existir onde ver a diferença entre o
previsto e o gravado**. Agora:

- A aba tem duas linhas com nomes diferentes — **Previsto (antes de gravar)** e **Gravado (o que
  foi ao banco)**, esta última vinda de `criados`/`atualizados`/`ignorados`, que são o que a rota de
  fato escreveu — e uma linha `⚠ ATENÇÃO` que **só existe quando os dois discordam**.
- A coluna por marca se chama **"Situação (previsão)"**, não "Situação".
- A tela mostra o mesmo aviso em tarja âmbar logo abaixo do "Importado", antes de alguém tratar a
  lista como vigente.

⚠⚠ **O ESPERADO DEPENDE DO MODO, E ERRAR ISSO É PIOR QUE NÃO AVISAR.** Com **sobrescrever** a rota
apaga a lista anterior e recria tudo, então o certo é `criados == totalNoArquivo`. Comparar isso com
a previsão (calculada contra as linhas que a própria rota ia apagar em seguida) acusaria "gravou
mais do que o esperado" num import perfeito — e alarme falso em ferramenta de alarme ensina a
ignorar a tarja. A aba diz em qual **Modo** rodou, e o cálculo do aviso muda junto.

⚠ **Remoção não entra na comparação.** Sem marcar "sobrescrever" o import **não apaga** — a lista de
removidas é aviso de que aquelas marcas saíram do arquivo, não promessa de exclusão. Cobrar isso
marcaria o comportamento normal como defeito.

⚠ **"Importado" nunca quis dizer "entrou".** Salvar o arquivo no servidor
(`/api/engenharia/listas/servidor`) e gravar as peças (`/api/producao/pecas/importar-le`) são duas
chamadas separadas: o arquivo pode estar na pasta da obra sem que uma linha tenha chegado ao banco.

## O sino (notificações)

`components/NotificationBell.jsx`, no rodapé de **toda** sidebar (`SidebarUserFooter.jsx`), ao
lado do nome. `lib/notificacoes.js` decide quem recebe; `app/api/notificacoes/route.js` (GET
lista as minhas, PATCH marca como lida) é só leitura/escrita do que já foi decidido.

⚠⚠ **ISTO JÁ EXISTIU, MORREU E VOLTOU.** Vitor (30/08/2026), ao remover: "prisma.notificacao só
aparecia no create — nenhuma tela, API ou cron lia de volta (…) a tela `/compras/notificacoes`
foi apagada, ninguém lia. Se um dia o sino voltar, o histórico está lá e os writes voltam pelo
git." As 541 linhas antigas continuam no banco, intocadas — não foi problema de dado, foi não
ter onde ler. Desta vez o sino mora em **toda** sidebar, com contador, não atrás de um link.

⚠⚠ **POR MÓDULO OU POR PESSOA, NUNCA GLOBAL.** A versão antiga gravava uma linha só, sem
destinatário — se o sino tivesse existido, RH e Financeiro veriam "Nova RM". Agora o destinatário
é resolvido **na criação** (`criarNotificacao({ destinatarios, modulos })`), materializado em
`NotificacaoDestinatario` — uma linha por (notificação, pessoa), cada uma com sua própria
leitura. Módulo resolve para `UserModulo` ativos + ADMIN sempre (mesma regra do `requireRole`).
Sem `destinatarios` nem `modulos` resolvendo gente, a notificação **não é criada** — perder o
evento silenciosamente é pior que logar o erro.

⚠ `Notificacao.lida`/`lidaEm` (o par antigo, no singular) é **legado morto**, não a fonte da
verdade nova — um booleano só não serve para "vários destinatários, leitura independente".

**Os 5 emissores restaurados** (existiam antes de 30/08, removidos junto com a tela, trazidos de
volta pelo git com o destinatário certo desta vez):

| Evento | Rota | Quem recebe |
|---|---|---|
| RM criada | `app/api/rm/route.js` | módulo COMPRAS |
| Cotação respondida | `app/api/cotacao/submeter/[token]/route.js` | módulo COMPRAS |
| Cotação declinada | `app/api/cotacao/declinar/[token]/route.js` | módulo COMPRAS |
| Consulta de estoque criada | `app/api/rm/[id]/consulta-estoque/route.js` | módulos PRODUCAO + ENGENHARIA |
| Consulta de estoque respondida | `.../consulta-estoque/responder/route.js` | **só quem abriu** a consulta (pessoal, não módulo) |

O e-mail (`notificarEvento`/`sendEmail`) continua rodando do lado de cada um — o sino é um canal
a mais, não substitui o Resend.

## Conferência de peça (Expedição)

`Expedição › Conferência de Peça` → Iniciar conferência, escolher a OP, e lançar **MARCA,
QUANTIDADE, OBSERVAÇÃO**. Feita no **celular no pátio**, antes de a peça ir para pintura e
etiquetagem.

| | |
|---|---|
| Regra | `lib/conferencia-peca.js` — a validação mora aqui, não na rota |
| Fonte da L.E. | `lib/itens-expedicao.js` (a mesma das etiquetas) |
| Tabelas | `ConferenciaPeca` + `ConferenciaPecaItem`, criadas por `scripts/ensure-mes-tables.mjs` |
| Quem acessa | `EXPEDICAO` + `ADMIN` — Matheus (09/09/2026): "todos que tiver acesso ao módulo Expedição pode fazer conferência" |

⚠⚠ **O teto é da OBRA, não da sessão.** Se a L.E. tem 2 peças de uma marca e a conferência de
ontem pegou as 2, a de hoje não aceita mais nenhuma. Sessão **CANCELADA** não conta — é o desfazer
de quem abriu por engano; se contasse, um clique errado consumiria o saldo da obra para sempre.

⚠ **As duas recusas são problemas diferentes e a mensagem diz qual**: "não está na Lista de
Expedição" é a peça errada na mão (uma posição, que vai soldada dentro do conjunto); "você já
conferiu 2" é a peça certa contada duas vezes.

⚠⚠ **Uma sessão ABERTA por obra, garantido no banco, não só na rota.** Duas pessoas em dois
celulares somariam no mesmo teto sem se enxergar, e a segunda descobriria isso na forma de um "já
conferiu tudo" que ela não entende. Quem chega depois entra na sessão que já existe. Um índice
único PARCIAL (`ON "ConferenciaPeca"("opId") WHERE status = 'ABERTA'`) trava isso no Postgres —
mora só em `scripts/ensure-mes-tables.mjs`, porque o Prisma não tem sintaxe pra índice parcial no
`schema.prisma` (documentado no comentário do model). Achado do Codex (09/09/2026): sem essa trava,
duas aberturas simultâneas criavam duas sessões pra mesma OP.

⚠⚠ **POST, PUT, DELETE e o "finalizar/cancelar" disputam o MESMO saldo — e travam por OP, não só
validam.** Achado do Codex (09/09/2026, simulado com dependências mockadas): dois lançamentos de
"+1" simultâneos numa marca com saldo 1 passavam os DOIS. `comTravaDaObra` (`lib/conferencia-peca.js`)
pega um `pg_advisory_xact_lock(hashtext(opId))` numa transação interativa do Prisma antes de ler o
saldo — quem chega depois espera na fila do Postgres e lê o saldo já atualizado, não um retrato
velho. O status da sessão também é **relido por dentro da trava**, não só checado antes: sem isso,
uma gravação podia passar por cima de uma sessão que acabou de ser finalizada por outra chamada.

⚠⚠ **O lançamento carrega uma chave de idempotência (`chaveOperacao`), pra reenvio não duplicar.**
Achado do Codex (09/09/2026): a rota grava e SÓ DEPOIS relê o estado pra devolver à tela; se essa
releitura falhar, o operador vê erro com a peça já contada, e tocar "Lançar" de novo criava um
segundo lançamento. O front (`app/expedicao/conferencia/[id]/chave-operacao.js`) gera uma chave por
TENTATIVA, num `useRef`, e só troca depois de um sucesso — reenviar com o formulário ainda
preenchido manda a MESMA chave, e a rota devolve o que já foi gravado em vez de gravar de novo. Um
`@@unique([conferenciaId, chaveOperacao])` é o backstop se duas cópias da mesma chave baterem quase
juntas (múltiplos `NULL` não colidem, então lançamentos antigos não são afetados).

⚠ **O autocomplete ordena por exatidão**: marca exata, depois as que começam com o texto, depois as
que só o contêm. Digitar `T89A10` põe T89A10 em primeiro sem sumir com T89A100 — filtrar as outras
fora tiraria da tela justamente o que quem está no meio da digitação ia escolher.

⚠ **O autocomplete só sugere a partir de 2 letras.** A OP-97 tem 537 marcas: abrir a lista no
clique despeja algo que ninguém lê e empurra o formulário para fora da tela do celular.

⚠ **Escolher a marca NÃO preenche a quantidade** — ela fica sempre em 1. Preenchendo com o saldo, a
tela troca *contar* por *confirmar*: um toque daria por conferidas 10 peças que ninguém olhou, com
o número vindo da própria lista que a conferência existe para checar.

⚠⚠ **Ao corrigir um lançamento (PUT), o próprio lançamento sai da conta antes de validar**
(`validarEdicao`). Validando contra o saldo cru, `conferido` já inclui o item e QUALQUER correção
seria recusada — inclusive as que diminuem. O bug seria pior que a ausência da funcionalidade: a
tela deixaria consertar só o que não precisava.

⚠ **O Torguinho não aparece nesta tela.** Ele é `fixed bottom-4 right-4` e no celular fica em cima
do campo OBSERVAÇÃO, ao lado do botão de lançar (visto na validação em 390×844). Padding não
resolve — ele flutua sobre a viewport. Está na mesma lista de exceções de `/colaborador` e
`/meu-rh`, em `components/TorguinhoChat.jsx`.

⚠ **A validação é no servidor.** A tela mostra o saldo e evita a maioria dos erros, mas lê um
retrato de alguns segundos atrás. Toda gravação responde com o estado inteiro recalculado — o
navegador nunca soma saldo sozinho.

⚠⚠ **Modo Pátio — tela cheia no celular, com saída que exige confirmação.** Matheus (08/09/2026):
"quando clicar em iniciar conferencia entrar em modo tela full no celular para não ter chance do
operador sair sem querer". `app/expedicao/conferencia/modo-patio.js` (hooks `usarEhCelular`,
`usarModoPatio`, `pedirTelaCheia`) + `[id]/ModoPatio.jsx` (a moldura). Só entra no celular
(`window.innerWidth < 768`, o mesmo corte do `md:` do Tailwind) — em tablet deitado/desktop a tela
normal, com a sidebar, continua. Sair pede confirmação numa folha ("Continuar" / "Sair"); a
conferência nunca é perdida, só a tela volta pra lista.

⚠ **Duas camadas de "tela cheia", porque só uma funciona no iPhone.** `pedirTelaCheia()` chama o
Fullscreen API de verdade (`requestFullscreen`), mas só funciona onde o navegador suporta —
Android, desktop — e só dentro de um gesto do usuário, por isso é chamada no CLIQUE de "Iniciar
conferência"/retomar sessão (`ConferenciaClient.jsx`), não na tela de destino (a navegação é
client-side, o estado sobrevive à troca de rota). **No iPhone — Safari, Chrome, qualquer
navegador — o Fullscreen API não existe**, é limitação do WebKit da Apple, não dá pra contornar em
JS. A moldura de CSS (`ModoPatio.jsx`, `position: fixed` + `100dvh`) cobre a tela de qualquer
jeito, sempre; quando o Fullscreen API não está disponível e a página não está em modo `standalone`
(instalada na Tela de Início), aparece uma dica única (guardada em `localStorage`) explicando o
único jeito real de tirar a barra do navegador no iPhone: Compartilhar → Adicionar à Tela de
Início. As páginas de conferência declaram `appleWebApp` no `metadata` (`page.js`, list e sessão)
pra isso funcionar quando adicionadas.

### Validar uma tela logado, antes do push

O fluxo obrigatório manda validar no `npm run dev`. Para tela atrás de login isso não é um `curl`:
o `middleware.js` devolve **307 para /entrar antes de a página compilar**, então o curl só prova
que o middleware funciona.

```bash
npm run dev &
node scripts/validar-tela.mjs <arquivo-de-credenciais> /expedicao/conferencia saida.png --mobile
```

Ele loga, abre a rota, tira o screenshot e **relata erro de console, exceção de página e resposta
4xx/5xx de API** — sai com código 1 se achar algo. `--mobile` usa 390×844 (o tamanho em que a
Conferência de Peça é usada de verdade); `--esperar=<seletor>` espera a tela carregar os dados.

- ⚠ **As credenciais ficam FORA do repositório** — o script recebe o caminho do arquivo por
  argumento (e-mail na 1ª linha, senha na 2ª). Nada de credencial no git.
- ⚠ Ele **recusa** apontar para qualquer coisa que não seja `localhost`. É ferramenta de validação
  local; apontar para o portal no ar transformaria um teste de tela em ação sobre dado real.
- ⚠ **Chromium sem root no WSL**: as bibliotecas (libnspr4, libnss3, libasound) foram extraídas
  dos `.deb` para `~/.local/share/torg-playwright/lib`, porque `playwright install-deps` exige apt
  e senha. O script põe esse diretório no `LD_LIBRARY_PATH` sozinho.

## Este módulo abre no celular (e é o único)

`app/expedicao/layout.js` é `md:ml-64`, e o `SidebarExpedicao` vira gaveta abaixo de `md`. Os
outros 15 layouts continuam `ml-64` fixo — no telefone a barra come a tela inteira. Se algum dia
outro módulo precisar de campo, o padrão a copiar é esse par de arquivos.

## Padrões de qualidade

Consolidados nas Fases 1 e 2 (gestão de usuários). Aplicar em todos os módulos novos.

### Backend (endpoints)

- **401 vs 403**: `requireRole` lança `Error("Unauthorized")` quando não há sessão e `Error("Forbidden")` quando a role não bate. Sempre distinguir:
  ```js
  } catch (e) {
    const status = e.message === "Unauthorized" ? 401 : 403;
    return NextResponse.json({ success: false, error: e.message }, { status });
  }
  ```
- **Zod 4**: usar `e.issues[0]?.message` (não `e.errors` — foi removido). Não usar `errorMap` (silenciosamente ignorado na v4).
- **Validação Zod** em todo endpoint que recebe body.
- **AuditLog em toda mutação** — incluir diff `{ antes, depois }` quando aplicável. Nunca usar `console.log` para rastrear mutações (some no Vercel; AuditLog persiste).
- **Nunca retornar `password`** no response — nem o hash.
- **Senha temporária em plaintext** só no response imediato de criar/reset-senha, em mais nenhum outro lugar.
- **Default de listagens**: filtrar `ativo: true`; suportar `?ativo=todos` e `?ativo=false` como parâmetro explícito.
- **Anti-suicídio** para rotas de admin: ADMIN nunca pode desativar a si mesmo, mudar a própria role, ou alterar próprio `podeAlterarVerba`. Pode resetar a própria senha (com confirmação reforçada no front).
- **Geração de senhas**: usar `crypto.randomBytes` (não `Math.random`). Charset sem caracteres ambíguos (`0/O`, `1/l/I`). Ver `lib/gerar-senha.js`.

### Frontend (telas)

- **Toast**: sempre via `useStore().showToast(mensagem, tipo)` — nunca criar sistema paralelo.
- **Modais de confirmação**: reusar `components/admin/ConfirmModal.jsx` (suporta `variant="destrutivo"` e `variant="padrao"`, ESC fecha, click-outside fecha, spinner durante `loading`). Referência de estilo: `ExportOmieModal.jsx`.
- **Tabelas**: `bg-white rounded-xl border border-gray-100 shadow-sm`, `thead bg-gray-50/60`, `tbody divide-y divide-gray-50`, `overflow-x-auto` no wrapper para mobile.
- **Paleta torg-\***: `torg-blue` (#006EAB, primário), `torg-dark` (#002945), `torg-gray` (#576D7E), `torg-orange` (#F4801F). Badges de role têm cores próprias por role — ver `ROLES_LABELS` em `app/admin/usuarios/page.js`.
- **Estados obrigatórios em toda tela com dados remotos**:
  1. Loading inicial (spinner + texto)
  2. Erro com botão "Tentar novamente"
  3. Estado vazio com ícone e mensagem
  4. Loading em ações inline (por item, não bloquear a tela inteira)
- **Update otimista**: após ação bem-sucedida, atualizar `useState` local via `setX(prev => ...)` em vez de refetch, para evitar flickering.
- **`"use client"`** só onde necessário. Layout com `export const metadata` não pode ser Client Component.

### Padrões de coding

- **JS puro** (sem TypeScript); JSDoc onde o tipo for útil para quem vai ler.
- **`setModal(null)` e limpeza de estado** no `finally`, não no início do `try` — garante limpeza mesmo se a ação lançar exceção.
- **Campos `id`**: usar `cuid()` via Prisma (padrão do schema); nunca gerar IDs manualmente no front.
- **Imports de Prisma**: sempre de `@/lib/prisma`, nunca instanciar `PrismaClient` diretamente em outro arquivo.

### Comportamento esperado do Claude Code

- Quando o usuário pedir "mostre o código" ou "mostre o arquivo", **colar o conteúdo COMPLETO** em blocos markdown — nunca dizer "aqui estão" sem colar.
- Quando o usuário pedir "pause", "aguarde" ou "pare antes de X", **pausar de fato** — não seguir por iniciativa própria.
- Se discordar de algo combinado, **argumentar antes** de executar uma versão alternativa.
