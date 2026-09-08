# CLAUDE.md

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
Instale o hook uma vez por clone:

```bash
git config core.hooksPath .githooks
```

Instale o hook uma vez por clone — são **dois**, o mesmo comando liga os dois.

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

⚠⚠ **A lista mostra só os itens da LISTA DE EXPEDIÇÃO, não a obra inteira.** Matheus (08/09/2026):
"não pode aparecer as posições, somente os produtos finais igual sai na Lista de Expedição".
`PecaConjunto` guarda o conjunto que sobe no caminhão E as posições que o compõem — na OP-97 são
1.236 linhas para 537 itens expedíveis; o resto são croquis ("T97A-P30"), peça de fábrica que vai
soldada dentro de outra. O filtro é o **pertencimento à LE**, nunca `tipoPeca !== "CROQUI"`: a LE
tem os parafusos (`T97-AC8`, tipo nulo) e eles se expedem.

⚠ **Duas fontes da mesma LE, e nenhuma cobre tudo.** `naLE` na peça vem do importador da Produção;
a tabela `ListaExpedicao` vem da planilha do SharePoint pela Expedição. Onde os dois rodaram eles
concordam; a OP-118 só tem `naLE` e a OP-101 só tem `ListaExpedicao`. A tela usa a **união** —
olhar uma fonte só faz obra inteira sumir do seletor.

⚠ **A contagem sai sem zero à esquerda** ("3/3", "300/300"). O "001/1" da etiqueta antiga era
limitação do BarTender, que importava a planilha com o campo de largura fixa — aqui o número vem
do banco a cada etiqueta e a largura se ajusta sozinha.

O cabeçalho da lista tem os **funis tipo Excel** do `components/FiltroColuna` (Marca, Descrição e
Etiqueta). Peças e Peso ficam sem funil de propósito — número contínuo vira menu de 200 valores.

**Quais já foram impressas** aparece numa coluna da própria lista, com data e "×N" na reimpressão.
O histórico mora no `AuditLog` (`action: "IMPRIMIR_ETIQUETA_CARREGAMENTO"`, `entity: "PecaConjunto"`),
não numa coluna de `PecaConjunto`: é a pergunta que a tabela de auditoria já existe para responder,
o registro é obrigatório de qualquer jeito, e assim ficam TODAS as impressões, não só a última.
O carimbo é gravado **depois** de o PDF existir — e uma falha ao gravar não segura o PDF.

⚠ **Não existe importação de planilha, de propósito.** Marca, descrição, quantidade e peso
vivem em `PecaConjunto`; a planilha só existia porque o BarTender não enxerga o banco.
Tirar esse pulo tira junto a chance de imprimir com dado velho.

> **Se a qualidade de impressão decepcionar**, o caminho de upgrade é gerar **PPLA cru** em vez
> de PDF — o layout e os dados se aproveitam, troca só o renderizador. Isso exige um agente
> local no PC da expedição para mandar os bytes à USB, que é a razão de não ter começado por aí.

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
