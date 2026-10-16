# Torg Metal IA — F2c (app Electron) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O app "Torg Metal IA" para o piloto (John): tela do mockup aprovado, agente com só as ferramentas da Torg, roteiro de 6 etapas com verificadores e aceite, anexos, e confirmação nas destrutivas.

**Architecture:** Electron (processo principal em Node) roda o **Claude Agent SDK** com `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN` apontando para o portão do portal; ferramentas do agente = conector `torg-tekla` (MCP stdio, F2b) + um MCP em processo `torg-portal` que chama as rotas `/api/engenharia-ia/app/*` (F2a). Ferramentas nativas do SDK desligadas. O renderer (HTML/CSS/JS sem bundler, a partir do mockup) fala com o principal só por um `preload` com `contextBridge`. O roteiro vem do portal (fonte da verdade); o app mostra e pede transições.

**Tech Stack:** Electron (versão estável atual), `@anthropic-ai/claude-agent-sdk`, `pdfjs-dist` (texto e imagem de PDF anexado), vitest (lógica do principal), `electron-builder` (portable .exe do piloto).

**Spec:** `docs/superpowers/specs/2026-10-14-torg-engenharia-app-design.md` (portal-compras) — "F2 em detalhe" §1–§5. Depende de F2a (rotas) e F2b (ferramentas/`CLASSE_POR_FERRAMENTA`). Código em `Torgmetal/torg-engenharia`, pasta `app/`.

## Global Constraints

- Produto chama-se **Torg Metal IA**; nenhuma tela, título, log visível ou mensagem de erro mostra "Claude Code".
- Modelos: `claude-opus-5-5` (principal) e `claude-sonnet-5-5` (fundo/verificadores) — o portão recusa outros.
- Ferramentas nativas do SDK DESLIGADAS: `Bash, Read, Write, Edit, MultiEdit, Glob, Grep, WebFetch, WebSearch, NotebookEdit, TodoWrite`. Permitidas: `mcp__torg-tekla__*`, `mcp__torg-portal__*` e a de subagente (para os verificadores).
- `settingSources: []` — o app não lê `.claude/` nem CLAUDE.md do PC.
- Confirmação SÓ nas `destrutiva` (`CLASSE_POR_FERRAMENTA` do conector), pela barra "Vai … · Confirmar / Ajustar".
- Gasto em R$ NUNCA aparece para o projetista.
- Visual: tema claro do mockup (`#006EAB`, `#002945`, `#576D7E`, `#F4801F` só ação/confirmação, Saira), topo "logo │ Torg Metal **IA** │ Engenharia", ícone das 5 bolinhas que terminam no T, CSS puro.
- Electron: `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`, CSP sem `unsafe-eval`; token do aparelho guardado com `safeStorage`, nunca em texto puro nem no renderer.
- Anexos: só `.pdf .dwg .dxf .ifc .xlsx .xls .csv .png .jpg`, até 200 MB por arquivo, copiados para `<TORG_TEKLA_SAIDA>/anexos/<obra>/`.

## Review Focus

- Portal fora do ar / teto do mês atingido (429) → mensagem em português dizendo o que houve e quem procurar, sem stack (teste na Task 3).
- Projetista fecha o app no meio de uma etapa → ao abrir, o roteiro volta do portal no estado gravado, nada se perde (teste na Task 5).
- Verificador devolve JSON malformado ou item sem `evidencia` → vira `nao_verificada`, nunca "ok" (teste na Task 6).
- Destrutiva negada na barra → o agente recebe "o projetista não confirmou" e não tenta outra ferramenta destrutiva para o mesmo fim sem perguntar (teste na Task 4).
- Pasta indicada com 3.000 arquivos ou subpastas profundas → copia só as extensões aceitas, até profundidade 3 e 500 arquivos, e avisa o que ficou de fora (teste na Task 7).

---

### Task 1: Esqueleto Electron seguro com a tela do mockup

**Files:** Create `app/package.json`, `app/src/principal/main.js`, `app/src/principal/preload.js`, `app/src/tela/index.html`, `app/src/tela/estilo.css`, `app/src/tela/tela.js`, `app/vitest.config.mjs`; Test `app/test/janela.test.js`

**Interfaces:**
- Produces: `export function opcoesDaJanela() -> BrowserWindowConstructorOptions` (testável sem abrir janela); `window.torg` no renderer com `{ enviar(pedido), aoEvento(cb), confirmar(id, sim), anexar(caminhos), etapas(), mudarEtapa(dados) }` (implementações chegam nas tasks seguintes; aqui só os canais IPC `torg:*`).

- [ ] **Step 1:** Teste: `opcoesDaJanela().webPreferences` tem `contextIsolation:true, nodeIntegration:false, sandbox:true` e `preload` absoluto; `index.html` tem `<meta http-equiv="Content-Security-Policy">` sem `unsafe-eval`; título "Torg Metal IA". → FAIL
- [ ] **Step 2:** Portar o mockup (`scratchpad/build-mockup.mjs` gera o HTML aprovado — copiar o HTML/CSS final, logo como arquivo em `app/src/tela/`), sem dados fictícios: as listas começam vazias. → PASS; `npx electron .` abre a tela.
- [ ] **Step 3:** Commit `feat(app): esqueleto Electron seguro com a tela aprovada`

### Task 2: Pareamento e token do aparelho

**Files:** Create `app/src/principal/aparelho.js`; Test `app/test/aparelho.test.js`

**Interfaces:**
- Consumes: `parear({ portal, nome, fetch, esperar, avisar })` de `conector/src/parear.js` (reaproveitar, não copiar).
- Produces: `export async function obterToken({ cofre, portal }) -> string|null`; `export async function parearAparelho({ cofre, portal, nome, avisar }) -> { ok, erro? }`; `cofre` = `{ ler(), gravar(buffer) }` sobre `safeStorage` + arquivo em `app.getPath("userData")/aparelho.bin`.
- Tela: sem token → painel "Ligar este PC" mostrando o código `TRG-XXXX` e o link `workspace.torg.com.br/engenharia/ia/vincular`.

- [ ] **Step 1:** Testes com `fetch` falso: aprovado grava token cifrado (o arquivo não contém o token em claro); recusado devolve a frase do `MENSAGEM_FIM`; token existente pula o pareamento. → FAIL
- [ ] **Step 2:** Implementar → PASS
- [ ] **Step 3:** Commit `feat(app): pareamento do PC com token guardado no cofre do sistema`

### Task 3: Agente — SDK, ferramentas permitidas e MCP do portal

**Files:** Create `app/src/principal/agente.js`, `app/src/principal/ferramentas-portal.js`, `app/src/principal/erros.js`; Test `app/test/agente.test.js`, `app/test/ferramentas-portal.test.js`, `app/test/erros.test.js`

**Interfaces:**
- Consumes: rotas F2a (`/documentos`, `/documentos/arquivo`, `/listas`, `/roteiro`, `/grd`); `CLASSE_POR_FERRAMENTA` (F2b).
- Produces:
  - `export function opcoesDoAgente({ token, portal, pastaSaida, pastaBin, canUseTool, agents }) -> Options` — `model:"claude-opus-5-5"`, `env:{ ANTHROPIC_BASE_URL:`${portal}/api/engenharia-ia`, ANTHROPIC_AUTH_TOKEN:token, ANTHROPIC_DEFAULT_SONNET_MODEL:"claude-sonnet-5-5", ANTHROPIC_SMALL_FAST_MODEL:"claude-sonnet-5-5" }`, `settingSources:[]`, `disallowedTools:[...nativas]`, `allowedTools:["mcp__torg-tekla__*","mcp__torg-portal__*"]` + a ferramenta de subagente, `mcpServers:{ "torg-tekla":{command:"node",args:[<conector/src/servidor.js>],env:{TORG_TEKLA_BIN:pastaBin,TORG_TEKLA_SAIDA:pastaSaida}}, "torg-portal": criarMcpPortal(...) }`, `systemPrompt` = `app/src/principal/instrucoes.md` (roteiro, regra "sem evidência = não verificada", nunca dizer "Claude Code").
  - `export function criarMcpPortal({ token, portal, fetch }) -> McpServer` com ferramentas `listar_documentos`, `ler_documento` (PDF → texto por página + PNG da página pedida via `pdfjs-dist`; demais → bytes salvos em `<saida>/anexos/portal/` e o caminho), `importar_lista`, `roteiro_ler`, `roteiro_mudar`, `grd_da_obra`.
  - `export function mensagemDeErro(status, corpo) -> string` — 401 "Este PC foi desligado do portal. Fale com o administrador."; 403 "Seu usuário não tem acesso à Engenharia no portal."; 429 "O limite deste mês foi atingido. Fale com o Vitor."; rede/5xx "Sem conexão com o portal agora. Tente de novo em instantes."
- ⚠ Antes de codar: conferir na documentação do `@anthropic-ai/claude-agent-sdk` (versão instalada) os nomes `query`, `createSdkMcpServer`, `tool`, `canUseTool`, `agents`, `disallowedTools`, `settingSources` — o plano usa esses; se algum mudou, ajustar aqui e anotar no commit.

- [ ] **Step 1:** Testes: `opcoesDoAgente` não contém nenhuma nativa em `allowedTools` e contém todas em `disallowedTools`; `env.ANTHROPIC_BASE_URL` termina em `/api/engenharia-ia`; nenhuma string de opção contém "Claude Code"; `criarMcpPortal` manda `Authorization: Bearer <token>` e devolve `mensagemDeErro` nos 401/403/429/503. → FAIL
- [ ] **Step 2:** Implementar → PASS
- [ ] **Step 3:** Commit `feat(app): agente com só as ferramentas da Torg, pelo portão do portal`

### Task 4: Conversa na tela e barra de confirmação

**Files:** Create `app/src/principal/conversa.js`, `app/src/principal/confirmacao.js`; Modify `app/src/tela/tela.js`; Test `app/test/confirmacao.test.js`, `app/test/conversa.test.js`

**Interfaces:**
- Produces:
  - `export function criarCanUseTool({ classes, pedirConfirmacao }) -> (toolName, input) => Promise<{behavior:"allow",updatedInput}|{behavior:"deny",message}>` — classe `destrutiva` → `await pedirConfirmacao({ id, ferramenta, resumo })`; `resumo` = 1ª frase da descrição + parâmetros legíveis; negado → `{behavior:"deny", message:"O projetista não confirmou. Pergunte como ele quer seguir antes de tentar outra alteração destrutiva."}`; demais classes → allow; ferramenta sem classe conhecida → deny.
  - `export function eventoParaTela(msgDoSdk) -> { tipo:"texto"|"ferramenta"|"resultado"|"fim"|"erro", ... }` — cartão de ferramenta com nome legível em português e a etiqueta da classe ("leitura", "levar até", "escrita", "destrutiva"); NUNCA custo.
- Tela: indicador "trabalhando" (bolinhas + verbo + segundos + "esc para interromper"); `esc` interrompe a consulta (`AbortController`).

- [ ] **Step 1:** Testes de `criarCanUseTool` (4 classes, negação, ferramenta desconhecida) e de `eventoParaTela` (sem campos de custo/uso no objeto devolvido). → FAIL
- [ ] **Step 2:** Implementar e ligar na tela → PASS
- [ ] **Step 3:** Commit `feat(app): conversa com cartões de ferramenta e confirmação das destrutivas`

### Task 5: Roteiro da obra na tela

**Files:** Create `app/src/principal/roteiro.js`; Modify `app/src/tela/tela.js`, `app/src/tela/index.html`; Test `app/test/roteiro.test.js`

**Interfaces:**
- Consumes: `roteiro_ler`/`roteiro_mudar` (via `fetch` direto do principal, sem passar pelo modelo — tela barata); `ETAPAS`/`STATUS` replicados como constantes de exibição (as regras ficam no portal).
- Produces: `export async function carregarRoteiro({ op }) -> { etapas, atual }`; `export async function pedirMudanca({ op, etapa, fase, para, divergencias }) -> { ok } | { ok:false, motivo, pendentes }`; `export function proximaAcao(etapas) -> { etapa, fase, texto }` (ex.: "Etapa 4 · Fase 2 — detalhar conjuntos").
- Tela: coluna esquerda "obra › etapa"; a etapa atual mostra divergências (cada uma com fonte e evidência, botões Resolver/Aceitar); botão "Aceitar etapa" só habilita sem `aberta`/`nao_verificada`; recusa 409 do portal mostra `pendentes`. Etapas 2 e 6 têm "Não se aplica". Etapa 6 abre com a pergunta "Esta obra tem diagrama de montagem?".

- [ ] **Step 1:** Testes: `proximaAcao` para roteiro vazio → etapa 1; com 1–3 concluídas e fase 1 da 4 concluída → "Etapa 5 · Fase 1"; app reaberto lê do portal (mock) e mostra o mesmo estado; 409 vira lista de pendentes. → FAIL
- [ ] **Step 2:** Implementar → PASS
- [ ] **Step 3:** Commit `feat(app): roteiro de 6 etapas com aceite do projetista`

### Task 6: Verificadores

**Files:** Create `app/src/principal/verificadores.js`, `app/src/principal/verificadores/*.md` (um prompt por verificador); Test `app/test/verificadores.test.js`

**Interfaces:**
- Produces:
  - `export const VERIFICADORES` → definições para `options.agents`: `cotas_perfis`, `normas_materiais`, `requisitos_cliente` (Etapa 1), `colisoes` (Etapa 2), `pranchas` (Etapas 4 e 6). Todos `model:"claude-sonnet-5-5"`, só ferramentas de LEITURA (`CLASSE_POR_FERRAMENTA[x]==="leitura"`) + `ler_documento`. O de `pranchas` NÃO recebe as ferramentas que geram desenho (quem gerou não verifica).
  - Saída exigida de cada verificador: um bloco JSON `{ "divergencias":[{ "descricao", "fonte", "evidencia", "situacao" }] }`.
  - `export function lerVeredito(texto) -> Divergência[]` — pega o último bloco JSON; JSON inválido → `[{descricao:"o verificador não devolveu resultado legível", fonte:null, evidencia:null, situacao:"nao_verificada"}]`; item sem `evidencia` → `situacao:"nao_verificada"`; `situacao` fora de `aberta|nao_verificada` vinda do verificador → `aberta` (verificador não resolve nem aceita; quem resolve é o projetista).
- O resultado vai para `roteiro_mudar` (`para:"AGUARDANDO_ACEITE"`, `divergencias`).

- [ ] **Step 1:** Testes de `lerVeredito` (válido; malformado; sem evidência; verificador tentando marcar "aceita"; texto com log antes do JSON) e de que `VERIFICADORES.pranchas.tools` não contém `criar_conjuntos`/`criar_croquis`/`criar_diagrama_montagem`. → FAIL
- [ ] **Step 2:** Implementar → PASS
- [ ] **Step 3:** Commit `feat(app): verificadores independentes com regra sem evidência = não verificada`

### Task 7: Anexos e pasta indicada

**Files:** Create `app/src/principal/anexos.js`; Modify `app/src/tela/tela.js` (arrastar-soltar e botão "Indicar pasta"); Test `app/test/anexos.test.js`

**Interfaces:**
- Produces: `export async function copiarAnexos({ origens: string[], obra, pastaSaida, fs }) -> { copiados:[{nome, destino, tamanho}], ignorados:[{nome, motivo}] }` — extensões e 200 MB das Global Constraints; pasta: profundidade ≤ 3, ≤ 500 arquivos; nomes saneados para casar com `dentroDaSaida` do conector (troca o que não for `[A-Za-z0-9 ._-]` por `_`, sem colisão: sufixo `-2`, `-3`).
- O agente recebe a lista do que foi copiado (nome no destino) como mensagem do sistema da conversa; só lê pelo `ler_documento`/ferramentas do conector.

- [ ] **Step 1:** Testes com `fs` em memória: `.exe` ignorado com motivo; 250 MB ignorado; 600 arquivos → 500 copiados + aviso; nome `Planta ç/1.pdf` → `Planta _1.pdf`; dois `a.pdf` → `a.pdf` e `a-2.pdf`. → FAIL
- [ ] **Step 2:** Implementar → PASS
- [ ] **Step 3:** Commit `feat(app): anexos e pasta indicada, copiados para a pasta de saída`

### Task 8: Painel de contexto e pacote do piloto

**Files:** Create `app/src/principal/contexto.js`; Modify `app/src/tela/tela.js`; Create `app/electron-builder.yml`; Test `app/test/contexto.test.js`

**Interfaces:**
- Consumes: `criarExecutor` do conector (chama `TsTeste.exe estado` e `StatusNumeracao.exe --todos` DIRETO, sem o modelo — não gasta teto).
- Produces: `export async function lerContexto({ executar, contarTekla }) -> { chip:"verde"|"ambar"|"vermelho", texto, modelo, fase, selecao:{qtd,pesoKg}, avisos:[{texto, acao:{ferramenta, args}}] }` — atualiza a cada 30 s e ao voltar o foco; cada aviso clicável chama a ferramenta `levar_ate` correspondente direto.
- Pacote: `electron-builder --win portable` → `Torg Metal IA.exe`, com o `conector/` embutido; instalação e atualização automática ficam para a F3.

- [ ] **Step 1:** Testes: Tekla fechado → chip vermelho "O Tekla não está aberto"; 2 instâncias → âmbar com o aviso do conector; numeração desatualizada → aviso clicável. → FAIL
- [ ] **Step 2:** Implementar → PASS; `npm test` inteiro verde
- [ ] **Step 3:** Gerar o portable no Windows e validar com o John numa CÓPIA de modelo: etapas 1→6 de uma obra pequena. Registrar o resultado em `docs/revisao-codex-claude.md` (portal-compras).
- [ ] **Step 4:** Commit `feat(app): painel de contexto do Tekla e pacote portable do piloto`
