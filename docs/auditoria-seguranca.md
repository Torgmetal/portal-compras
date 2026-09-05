# Auditoria de Segurança — Portal Torg (workspace)

> **Status:** rascunho de achados para correção incremental.
> **Data:** 2026-07-13 · **Autor:** revisão assistida (Claude) a pedido do time.
> **Não commitar sem decisão do time** — este arquivo cataloga vetores de ataque.

## Metodologia e escopo

- **Análise estática (revisão de código)** de `lib/`, `middleware.js`, `app/api/**` (419 rotas) e telas.
- **Não** foram disparados ataques ao vivo contra a produção: o portal roda contra o **banco Neon de produção e integrações reais** (Omie, Resend, Anthropic). Um teste ativo criaria dados/e-mails reais e poderia corromper registros. Os achados abaixo são de código e todos verificáveis por leitura.
- Foco pedido: **Financeiro** e **Funcionários/Holerite (RH)**; cobertos também Diretoria, Comercial, Compras, portal do fornecedor, crons e o assistente de IA.

## Resumo executivo

| Sev. | ID | Título | Área |
|---|---|---|---|
| ✅ Corrigido | SEC-01 | Crons acionáveis sem auth (spoof de `User-Agent`) — **corrigido** (commit 8fe7f56, verificado em prod: UA falso→401, Bearer válido→200) | Infra/Cron |
| ✅ Corrigido | SEC-02 | Reset de senha sem limite de tentativas — **corrigido** (commit b1df262: cap de 5 por token + rate-limit) | Auth |
| 🟠 Média | SEC-03 | Login sem rate-limit / lockout (brute-force, sobretudo por CPF) | Auth |
| 🟠 Média | SEC-04 | Assistente de IA — escopo das tools + injeção de prompt a auditar | IA |
| 🟡 Baixa | SEC-05 | COMERCIAL enxerga dados financeiros por obra (confirmar intenção) | Financeiro |
| 🟡 Baixa | SEC-06 | MES sync usa escaping manual de SQL | Integração |
| 🟡 Baixa | SEC-07 | Respostas de erro vazam `message`/`name` internos | Vários |
| 🟡 Baixa | SEC-08 | `blob-url` aceita qualquer conta pública do Vercel Blob | SSRF/dados |
| 🟡 Baixa | SEC-09 | Enumeração de usuário por timing no login | Auth |
| 🟡 Baixa | SEC-10 | Reset de senha não invalida sessões/JWT ativos | Auth |
| 🟡 Baixa | SEC-11 | Comparações de segredo não são timing-safe (CRON/MES) | Auth |

---

## Achados detalhados

### 🔴 SEC-01 — Crons acionáveis sem autenticação (spoof de User-Agent)
- **Local:** `app/api/cron/*/route.js` (padrão repetido), ex. `app/api/cron/estoque-produtos/route.js:16`.
- **Código:** `const isCron = ua.includes("vercel-cron") || auth === "Bearer " + CRON_SECRET;`
- **Problema:** o `User-Agent` é controlado pelo cliente. Qualquer um pode enviar `User-Agent: vercel-cron/1.0` e passar no gate — o `CRON_SECRET` vira irrelevante. Os crons rodam **sincronizações pesadas** (Omie, estoque, movimentações, SharePoint).
- **Cenário:** atacante externo dispara `POST/GET` nos endpoints de cron em loop → força syncs caros repetidos → **DoS / custo / “out of memory” do Neon** (o próprio CLAUDE.md alerta que sync pesado satura a compute).
- **Correção:** exigir **somente** `Authorization: Bearer CRON_SECRET` (ou validar `x-vercel-signature`). Remover o fallback por `User-Agent`. Comparar com `crypto.timingSafeEqual`. Bloquear também fora de produção quando faltar segredo.

### 🔴 SEC-02 — Reset de senha brute-forceável (código de 6 dígitos, sem limite)
- **Local:** `app/api/esqueci-senha/route.js` (ações `verificar` e `resetar`).
- **Problema:** código numérico de 6 dígitos (900k combinações), validade de 15 min, **sem rate-limit e sem contador de tentativas**. Nada impede tentar milhares de códigos para um e-mail-alvo dentro da janela.
- **Cenário:** atacante que saiba um e-mail interno chama `?acao=enviar` e depois faz brute-force em `?acao=resetar` até acertar → **troca a senha da vítima (account takeover)**, inclusive de contas com acesso a Financeiro/RH/Diretoria.
- **Correção:** rate-limit por IP **e por e-mail** (reusar `lib/rate-limit.js`); invalidar o código após N tentativas erradas (ex. 5) forçando novo pedido; considerar código de 8+ dígitos ou token forte por link. Auditar tentativas.

### 🟠 SEC-03 — Login sem rate-limit / proteção a brute-force
- **Local:** `lib/auth.js` (`authorize`).
- **Problema:** `authorize` compara `bcrypt` sem qualquer rate-limit/lockout. O **login por CPF** (funcionários) é o mais exposto: CPF é semi-público e o identificador tem formato fixo (11 dígitos) — dá pra enumerar/forçar.
- **Cenário:** brute-force de senha de funcionário (senhas definidas pelo próprio podem ser fracas) ou de usuário interno por e-mail.
- **Correção:** rate-limit por IP + por identificador no fluxo de credenciais (proxy antes do NextAuth ou verificação no `authorize`); lockout temporário após N falhas; alerta/auditoria de tentativas. `bcrypt` já ok (custo 10).

### 🟠 SEC-04 — Assistente de IA (Torguinho): escopo de tools e injeção de prompt
- **Local:** `app/api/assistente/chat/route.js`, `lib/assistente/tools.js` (`getToolsParaUser`), `lib/assistente/executar-tools.js`.
- **Problema/риsco a validar:**
  1. O acesso é `getSession()` (qualquer logado) — confirmar que `getToolsParaUser(user)` **filtra por módulo/role** e que **nenhuma tool devolve dado sensível** (salários, financeiro) para quem não deveria.
  2. **Injeção de prompt:** as tools leem dados do banco (OPs, estoque, MES) que podem conter texto controlado por terceiros; garantir que o `executarTool` **re-valida a autorização no servidor** e não confia só na lista oferecida ao modelo.
  3. **Custo:** sem rate-limit aparente — qualquer logado pode gerar chamadas ilimitadas ao modelo.
- **Correção:** auditoria dedicada do mapa tool→role; re-checar permissão dentro de cada executor; rate-limit por usuário; nunca expor RH/Financeiro por tool a menos que a role permita.

### 🟡 SEC-05 — COMERCIAL enxerga dados financeiros por obra
- **Local:** rotas `app/api/financeiro/*` com `requireRole(["ADMIN","FINANCEIRO","COMERCIAL"])` (ex. `a-pagar-por-obra`, `faturamento`, `contas`).
- **Observação:** pode ser intencional (comercial acompanha faturamento das próprias obras). **Confirmar a intenção**; se não for, remover `COMERCIAL` do gate.

### 🟡 SEC-06 — MES sync usa escaping manual de SQL
- **Local:** `app/api/mes/sync-ordens/route.js:62-66` (`q`, `ts`, `n`, `ni`) montando SQL bruto.
- **Observação:** protegido por `Bearer MES_SYNC_API_KEY` e dados vindos da ponte interna, mas escaping manual (`replace(/'/g,"''")`) é frágil. O upsert principal já usa parâmetros/UNNEST — **migrar o restante** para o mesmo padrão (recomendação do próprio CLAUDE.md) e eliminar concatenação.

### 🟡 SEC-07 — Vazamento de detalhes internos em erros
- **Local:** ex. `app/api/parse-cotacao-ai/route.js:305` retorna `err.message`/`err.name`; padrões similares em outras rotas.
- **Correção:** em rotas públicas, devolver mensagem genérica ao cliente e logar o detalhe no servidor.

### 🟡 SEC-08 — `blob-url` aceita qualquer conta pública do Vercel Blob
- **Local:** `lib/blob-url.js` — valida apenas o sufixo `*.public.blob.vercel-storage.com`.
- **Observação:** bloqueia SSRF a IP interno/metadata (bom), mas aceita blob de **qualquer** conta Vercel, não só o store do app. Baixo risco (rotas de parse já processam conteúdo do usuário), mas idealmente restringir ao host do próprio store (prefixo conhecido).

### 🟡 SEC-09 — Enumeração de usuário por timing no login
- **Local:** `lib/auth.js` — `bcrypt.compare` só roda quando o usuário existe; identificador inexistente responde mais rápido.
- **Correção:** comparar contra um hash dummy quando não achar usuário, para uniformizar o tempo.

### 🟡 SEC-10 — Reset de senha não encerra sessões ativas
- **Local:** `esqueci-senha` / `trocar-senha` (JWT stateless, 12h).
- **Observação:** após trocar a senha, tokens já emitidos continuam válidos até expirar. Considerar um `tokenVersion`/`senhaAlteradaEm` validado no callback `jwt`/`session` para invalidar sessões antigas.

### 🟡 SEC-11 — Comparações de segredo não são timing-safe
- **Local:** cron (`auth === "Bearer "+CRON_SECRET`), MES (`.slice(7) !== apiKey`).
- **Correção:** `crypto.timingSafeEqual` para segredos. Baixo risco, mas trivial de corrigir junto de SEC-01.

---

## O que está bem feito (defesas verificadas)

- **Portal do fornecedor** (`cotacao/submeter`, `parse-cotacao-ai`, etc.): rate-limit por IP, validação Zod, **tokens fortes** (`lib/token.js`, `crypto.randomBytes(32)`), e updates **escopados à própria cotação** (sem IDOR). `parse-cotacao-ai` tem cap de payload e modelo fixo no servidor.
- **Proxies do colaborador** (`meu-rh/holerite|ponto/[id]/arquivo`): checam `funcionarioId` e devolvem **404 genérico** — sem IDOR e sem vazar existência.
- **Diretoria**: gate por **allowlist de e-mail** (`lib/diretoria.js`); nem ADMIN entra sem liberação; gerência da lista só pelo dono.
- **RH / Financeiro / Admin**: `requireRole` consistente (`["ADMIN","RH"]`, `["ADMIN","FINANCEIRO"]`, `["ADMIN"]`), com distinção 401/403.
- **SSRF**: `assertBlobUrlSegura` aplicado antes de `fetch` de URLs de Blob.
- **SQL**: `$queryRawUnsafe` de produção é **parametrizado** (`$1,$2`) sem input do usuário; bulk writes via UNNEST.
- **Senhas**: `bcrypt`, nunca retornadas; provisórias com `crypto.randomBytes` (charset sem ambíguos); `deveTrocarSenha` no 1º acesso.
- **esqueci-senha**: respostas genéricas + delay anti-timing na etapa de envio (falta só o limite de tentativas — SEC-02).

## Áreas ainda não cobertas a fundo (para próxima rodada)

- IDOR item-a-item nas ~400 rotas internas (amostra revisada OK; falta varredura completa dos `PATCH/DELETE [id]`).
- CSRF em rotas mutantes (NextAuth/JWT em cookie — avaliar `sameSite` e se há endpoints sensíveis a GET).
- Cabeçalhos de segurança (CSP, HSTS, X-Frame-Options) no `next.config`/Vercel.
- Escopo real das tools do assistente (SEC-04) — merece revisão dedicada.
- Dependências (npm audit) e segredos em variáveis de ambiente.

## Ordem de correção sugerida

1. **SEC-01** (crons) e **SEC-02** (reset) — maior impacto, correção pequena.
2. **SEC-03** (rate-limit login).
3. **SEC-04** (auditoria do assistente).
4. Demais (SEC-05..11) em lote de hardening.
