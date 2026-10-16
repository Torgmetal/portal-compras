# Torg Engenharia — app de projeto por prompt no Tekla

**Data:** 14/10/2026 · **Pedido:** Vitor · **Status:** F0 e F1 no ar; F2 aprovada (16/10/2026)

## O que é

Um aplicativo da Torg para os 4 projetistas (Tekla Structures 2025) em que o projetista escreve o pedido
("crie as terças do eixo A ao F com U 150", "gere as listas da fase 2") e o Claude executa **no Tekla do
computador dele** — como a sessão "Tekla project automation setup" faz hoje no PC do Vitor.

Vitor (14/10/2026): *"quero um app de respeito com uma interface notória e com um visual autêntico"*.

## Arquitetura (3 blocos)

1. **Conector `torg-tekla` (Windows, no PC de cada projetista)** — servidor MCP (Node 20+, `@modelcontextprotocol/sdk`,
   stdio) com uma **lista fechada** de ferramentas. Cada ferramenta chama um dos EXEs C# que já existem
   (Tekla Open API, .NET Framework 4.x). **Sem terminal livre**: é o que mantém o uso dentro da Engenharia e
   protege o PC.
2. **App "Torg Engenharia" (Windows)** — Electron + Claude Agent SDK (o harness do Claude Code), com interface
   própria (ver *Direção visual*). Confere o estado do Tekla antes de agir e pede confirmação antes de alterar o
   modelo.
3. **Portão no portal (nuvem, workspace.torg.com.br)** — o app entra com o login do portal; toda chamada ao
   Claude passa por uma rota do portal que confere setor (ENGENHARIA), saldo do mês, registra uso e encaminha à
   Anthropic com a chave da empresa (`ANTHROPIC_BASE_URL` do Agent SDK apontando para o portão). **A chave nunca
   fica no PC.** Tela de admin com teto e consumo por projetista.

⚠ **Assinatura não é motor de app próprio.** O app é cobrado pela API (Console). O plano Team inclui
"até US$ 500/mês em créditos de API compartilhados" — condições não publicadas; **confirmar com a Anthropic**
se valem para app próprio antes de contar com eles.

## Fases

| Fase | Entrega | Onde |
|---|---|---|
| **F0** | `Tekla-Ferramentas` no git + build reproduzível + conector `torg-tekla` com ferramentas de **leitura**, testado com o Claude Code no PC do Vitor | Windows (sessão do Tekla) |
| F1 | Portão no portal (auth por dispositivo, setor, saldo, log) + tela de limites | Mac (portal) |
| F2 | App Electron, piloto com 1 projetista, ferramentas de **escrita** com confirmação | Windows + Mac |
| F3 | Os 4 projetistas, instalador, atualização automática | Windows |

## F0 em detalhe

**Base (fatos da sessão do Tekla, 14/10/2026):** EXEs de console em `C:\Users\VitorCosta\Desktop\Tekla-Ferramentas`
(`src\*.cs`, `bin\*.exe`, `build.ps1` desatualizado — o ListasTORG precisa também de `ChapasCompra.cs`), compilados
com o `csc.exe` do .NET Framework 4.x (C# 5), referenciando `C:\TeklaStructures\2025.0\bin\Tekla.Structures*.dll`;
utilitários soltos em `C:\Temp\des` e `C:\Temp\pref`. Não é repositório git. Não há MCP server.

1. **Repositório git** com fontes, `build.ps1` corrigido (compila tudo, inclusive ListasTORG com ChapasCompra.cs)
   e os utilitários de `C:\Temp\des`/`C:\Temp\pref` que o conector usar. Binários fora do git (gerados pelo build).
2. **Saída padronizada dos EXEs que o conector chama:** modo `--json` → stdout com
   `{ "ok": bool, "dados": …, "avisos": [], "erro": null }`, código de saída ≠ 0 em erro. Texto humano continua
   no modo normal (não quebrar quem usa hoje).
3. **Conector `torg-tekla` — ferramentas de LEITURA (F0):**
   - `estado_tekla` — Tekla aberto? quantas instâncias? modelo aberto (nome, caminho)? licença (edição × Graphite)?
     janela modal aberta (título)? → mensagem clara em português quando algo impede.
   - `ler_selecao` — objetos selecionados com tipo, perfil, material, comprimento, peso, UDAs principais.
   - `propriedades` — report properties de objetos por id.
   - `listar_conjuntos` — conjuntos/peças de uma fase ou filtro (marca, perfil, peso).
   - `conferir_numeracao` — lacunas, peças sem número, "(?)".
   - `verificar_colisoes` — clash check (só leitura do resultado).
   - `gerar_listas` — ListasTORG (LE/LPC/RM/MAT/APV/MJ) em arquivo; não altera o modelo.
4. **Guardas no conector:** só executa EXEs de uma lista fixa (caminho absoluto), timeout por ferramenta,
   detecção de diálogo modal (devolve "o Tekla está esperando você responder: <título>" em vez de travar),
   recusa se houver duas instâncias do Tekla, nunca mexe em `.locked`.
5. **Teste:** registrar o conector no Claude Code do PC do Vitor (`claude mcp add`) e validar cada ferramenta numa
   **cópia** de um modelo (nunca no modelo de produção de uma obra).

**Fora da F0:** ferramentas de escrita (montar_spec, numerar, nomear_conjuntos, desenhos), app, portão.

## Ferramentas de navegação — "levar até" (F2, baixo risco)

Clicar num aviso do painel (colisão, conjunto sem desenho, peça sem número) e o assistente **mostra o problema no
Tekla aberto**: seleciona os objetos e dá zoom. Pedido do Vitor (16/10/2026), a partir do aviso de colisões do mockup.

⚠ NÃO altera o modelo, mas MEXE na tela do Tekla (seleção + vista) — por isso é F2, não F0. Entra como uma classe
própria de ferramentas, entre leitura e escrita:
- `selecionar` / `levar_ate <ids|marca>` — seleciona e enquadra; base do clique nos avisos.
- `isolar` / `esconder_resto` — deixa só o alvo visível (reversível, não altera o modelo).
São de baixo risco (view-only): podem rodar SEM a barra de confirmação que as de escrita exigem — mas seguem passando
pelo portão (teto, log). Confirmar no piloto se alguma merece confirmação.

## F1 em detalhe — o portão no portal (16/10/2026)

**Decisões do Vitor (16/10):** teto **mensal por projetista** (em R$); **só ADMIN aprova** um PC novo; modelos
**Opus 5.5** (principal) + **Sonnet 5.5** (apoio) — o portão recusa qualquer outro; o registro guarda o **consumo e o
pedido do projetista** (não a resposta). Piloto com 1 projetista e teto baixo, para medir o custo real por usuário.

**Onde mora cada coisa:** no PC fica só o código de acesso daquele aparelho (revogável). Chave da Anthropic (env da
Vercel), limites, registro de uso e permissão (login do portal, setor ENGENHARIA) ficam no portal. Notebook perdido
ou alguém que sai: revoga o aparelho na tela e acabou.

### 1. Ligar um PC à conta (pareamento, aprovação do ADMIN)

1. O app (ou o Claude Code, no piloto) chama `POST /api/engenharia-ia/aparelho/iniciar` com o nome do PC →
   recebe um **código curto** (`TRG-4F7K`, 10 min) e um **segredo de espera** (só o app conhece).
2. O projetista abre `/engenharia/ia/vincular` logado e digita o código → o pedido fica **aguardando o ADMIN**,
   com o nome dele e o do PC.
3. O ADMIN aprova na tela de Admin. O app, que consulta `…/aparelho/status` com o segredo de espera, recebe **uma
   única vez** o token do aparelho (32 bytes, `crypto.randomBytes`). No banco fica só o **hash SHA-256**.
4. Revogar = efeito imediato (a próxima chamada já volta 401). Usuário desativado ou sem ENGENHARIA também barra.

### 2. O portão — `POST /api/engenharia-ia/v1/messages`

Mesmo formato da API da Anthropic, para o Agent SDK/Claude Code usarem só trocando a base:
`ANTHROPIC_BASE_URL=https://workspace.torg.com.br/api/engenharia-ia` + `ANTHROPIC_AUTH_TOKEN=<token do aparelho>`.
Também `…/v1/messages/count_tokens` (sem custo, mesmas checagens menos o saldo).

Em ordem, antes de gastar um token:
1. **Aparelho:** hash do token → aparelho ATIVO → usuário ativo com ENGENHARIA (ou ADMIN). Senão 401/403.
2. **Modelo:** só `claude-opus-5-5` e `claude-sonnet-5-5`. Outro → 400 em português. ⚠ O Claude Code usa um modelo
   pequeno em tarefas de fundo: o app/Claude Code do piloto é configurado com Sonnet como modelo pequeno.
3. **Saldo:** soma do custo do mês (fuso de São Paulo) do usuário < teto. Bateu → 429 "teto do mês atingido
   (R$ X de R$ Y) — fale com o Vitor". ⚠ Teto **flexível**: duas chamadas simultâneas no limite podem passar um pouco.
4. **Ritmo:** no máximo 60 chamadas/min por aparelho (anti-laço).

Então encaminha para `https://api.anthropic.com/v1/messages` com a chave **`ANTHROPIC_API_KEY_ENGENHARIA`** (chave
separada da que o portal usa nos PDFs — o consumo da Engenharia fica isolado também no Console). Repassa só os
cabeçalhos da lista (`anthropic-version`, `anthropic-beta`); nunca o `Authorization` do aparelho.
**Streaming** é repassado byte a byte; os eventos `message_start`/`message_delta` são lidos no caminho para pegar o
`usage`. O registro é gravado no fim do stream — falhar ao gravar **não** derruba a resposta já entregue.

### 3. Custo

`lib/ia-precos.js`, US$ por milhão de tokens (tabela da Anthropic de 06/10/2026):

| Modelo | Entrada | Saída | Cache lido | Cache gravado |
|---|---|---|---|---|
| Opus 5.5 | 4,00 | 20,00 | 0,20 | 5,00 (1,25×) |
| Sonnet 5.5 | 2,00 | 10,00 | 0,20 | 2,50 (1,25×) |

Teto em R$: o custo em US$ vira R$ pela cotação de `IA_COTACAO_USD_BRL` (env, atualizada à mão). Guardam-se os dois.

### 4. O que se grava (tabelas novas, por SQL como as outras do portal)

- `IaAparelho` — usuário, nome do PC, hash do token, status (AGUARDANDO_ADMIN | ATIVO | REVOGADO), código de
  pareamento e validade, quem aprovou/revogou e quando, último uso.
- `IaUso` — aparelho, usuário, modelo, tokens (entrada, saída, cache lido, cache gravado), custo US$ e R$, duração,
  situação (ok | erro | recusado: modelo/teto/permissão) e o **pedido do projetista**: o último texto escrito por ele
  na conversa (não os resultados de ferramenta), até 2.000 caracteres. Visível só para ADMIN; ⚠ dado de obra.
- `IaLimite` — teto mensal em R$ por usuário (sem linha = sem acesso). Mudança vai para o AuditLog.

### 5. Tela de Admin — `/admin/engenharia-ia`

Aparelhos aguardando (aprovar/recusar), ativos (revogar), teto por projetista, consumo do mês por pessoa (barra
contra o teto), e o histórico de uso com o pedido. Aprovar, revogar e mudar teto gravam AuditLog.

### 6. Segurança e testes

- A rota é pública para o middleware (autentica pelo token do aparelho, não pela sessão), igual às rotas de cron.
- Nada de chave no PC nem no repositório; o token aparece uma vez e só o hash fica.
- Consulta ao Codex (`security`) antes de implementar: pareamento, portão e repasse do stream.
- Testes sem banco e sem Anthropic (fetch e Prisma simulados): pareamento, cada recusa do portão, cálculo do custo,
  leitura do `usage` no stream, registro que falha sem derrubar a resposta.
- ⚠ Vercel: a rota do portão declara `maxDuration` alto (resposta longa do Opus em stream).

## F2 em detalhe — o app "Torg Metal IA" (16/10/2026)

Aprovado pelo Vitor em 16/10/2026. Piloto: John (engenharia4@), teto R$ 200/mês.

### 1. Base técnica
Electron + **Claude Agent SDK** (o harness do Claude Code, embutido). O app entra com o login do portal e todo uso de IA
passa pelo portão da F1 (teto, registro, só Opus 5.5/Sonnet 5.5). O agente só enxerga as ferramentas da Torg:
**sem terminal, sem leitura livre de disco** (Bash/Read/Write/Edit do SDK desligados). O projetista não vê "Claude
Code" em lugar nenhum — o produto se chama **Torg Metal IA**.

### 2. Ferramentas — quatro classes

| Classe | Ferramentas | Confirma? |
|---|---|---|
| Leitura | as 7 da F0; documentos (portal, pasta da obra, NORMAS, anexos) | não |
| Levar até | `SelecionarIds`, `DestacarPeca`, `ZoomCaptura`, `LimparSelecao` | não |
| Escrita | `NomearConjuntos`, `Desenhos`/`DesenhoCroquis`, `MontarSpec gerar`, `ListasTORG` | não |
| Destrutiva | `NumerarBlanks` (muda marcas), `MontarSpec apagar` (TAG), sobrescrever desenho, alterar por revisão | **sim** |

Decisão do Vitor: confirmação **só nas destrutivas** — barra "Vai … · Confirmar / Ajustar".

### 3. Documentos
- **Procedimentos** (Controle de Documentos da Qualidade), **pasta da obra** no SharePoint e **normas**
  (`Engenharia/03. Padrão Torg/NORMAS`, já existe, ~2 GB): lidos **pelo portal** — rotas novas de leitura
  autenticadas pelo token do aparelho. As credenciais do SharePoint não saem da Vercel.
- **PC do projetista**: só o que ele **anexar** ou a **pasta que ele indicar** (PDF, DWG, IFC, XLSX). O app não varre
  o disco.

### 4. Roteiro da obra — etapas com portão
O app é um roteiro, não um chat solto. Coluna esquerda: obra › etapa. Cada etapa só fecha com **verificação
dos agentes + aceite do projetista**, gravados no portal (quem, quando, divergências aceitas — rastreabilidade ISO).

**Etapa 1 — Modelo.** O Claude lê documentos do cliente, normas e procedimentos e monta o spec (JSON do
`MontarSpec`, um por desenho). Antes de criar, **três verificadores independentes** conferem: (a) cotas/perfis
contra o desenho do cliente, (b) normas e materiais, (c) requisitos do cliente (memorial, pintura, galvanização).
Saída: lista de divergências **com a fonte** (arquivo/página). Projetista resolve ou aceita cada uma → só então
`MontarSpec gerar` (confere o peso de cada peça). Tudo nasce com a TAG da obra; desfazer = apagar a TAG (destrutiva).

**Etapa 2 — Interferência com o IFC do cliente** (opcional). Sem IFC → "não se aplica", registrado. Com IFC: importa
como referência (`IfcToTekla`/`IfcDump`), roda o clash (`VerColisoes`), os agentes classificam cada colisão (real /
tolerável / falso positivo), o projetista confirma; "levar até" mostra cada uma no Tekla.

**Etapa 3 — Revisão ou numeração.** Com revisão: o Claude compara a revisão nova com a anterior, lista o que muda no
modelo e aplica (destrutivas confirmadas). Sem revisão: numeração (confirmada) + `StatusNumeracao`.

**Etapa 4 — Detalhamento, por fase:** Croquis → Conjuntos → pergunta obrigatória *"Esta obra tem diagrama de
montagem?"*. Depois de cada lote, **verificação profunda** (onde o Claude mais erra):
- dados das **ferramentas** (`DesenhoCotas`, `MarcasDesenho`, `DesenhoAuditar`), nunca da opinião do modelo;
- cada prancha **renderizada em imagem** e conferida por um verificador que **não** a gerou: cotas × geometria,
  marcas × lista, detalhes (furos, solda, chanfro);
- prancha sem evidência = **"não verificada"**, nunca "ok"; aceite do projetista por prancha ou lote.

**Etapa 5 — Listas e GRD.** `ListasTORG` gera **LE e LPC**; o app **importa as duas no portal sozinho**
(rota de import autenticada pelo token do aparelho + usuário) e mostra o recibo **Previsto × Gravado** — divergência
não fecha a etapa. Projetos vão para a 2.5.2 e o FORM 09 para `Engenharia/13. GRD`; a **GRD entra no portal pelo cron
que já existe** (`/api/engenharia/grd/sincronizar`, 11/17/21h dias úteis — conferido em 16/10/2026: rodando, GRD-539
lida). O app só confirma que ela apareceu.

### 5. Visual (mockup aprovado em 16/10/2026)
**Tema claro** igual ao portal (substitui a "tela escura" do rascunho): cartões brancos, azul `#006EAB`, laranja só em
ação/confirmação, Saira. Topo: logo Torg │ **Torg Metal IA** (selo "IA") │ Engenharia. Três colunas: conversas/obras ·
pedido + cartões de etapa · contexto vivo do modelo com avisos clicáveis ("levar até").
**Ícone do assistente:** 5 bolinhas que trocam de formação (linha → quadrado → roda) e **sempre terminam no T**;
CSS puro (sem JS). O gasto em R$ **não** aparece para o projetista — só na tela de Admin.

### 6. Fora da F2
Instalador e atualização automática (F3); os outros 3 projetistas (F3).

## Decisões (Vitor)

- ~~Repositório~~: separado — `Torgmetal/torg-engenharia`, privado (16/10/2026).
- ~~Confirmação~~: só destrutivas (16/10/2026).
- ~~Piloto~~: John, teto R$ 200/mês (16/10/2026).
- Pendente: créditos de API do Team/Enterprise — confirmar com a Anthropic.
