# Torg Metal IA — F2a (portal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao app "Torg Metal IA" (no PC do projetista, sem sessão do portal) rotas autenticadas pelo token do aparelho para: ler documentos (procedimentos, pasta da obra, NORMAS), importar LE/LPC com recibo Previsto × Gravado, registrar o roteiro de 6 etapas e confirmar a GRD.

**Architecture:** Um helper `autenticarAparelho` extraído de `lib/ia-portao.js` passa a ser a porta de todas as rotas `/api/engenharia-ia/app/*` (públicas no middleware, como as do portão). A lógica fica em `lib/` (testável sem rede); as rotas só validam (zod) e chamam. O roteiro tem as regras de transição NO PORTAL (fonte da verdade), numa lib pura; o app só exibe.

**Tech Stack:** Next.js 14 (JS), Prisma 6 + SQL de `ensure` (sem `db push` em produção), zod 4, vitest com Prisma mockado, `xlsx`, Graph via `lib/sharepoint*.js`.

**Spec:** `docs/superpowers/specs/2026-10-14-torg-engenharia-app-design.md` — seção "F2 em detalhe" (§3 Documentos, §4 Roteiro, Etapa 5).

## Global Constraints

- Toda rota nova em `/api/engenharia-ia/app/`; autentica pelo token do aparelho (`Authorization: Bearer` ou `x-api-key`), mesmas regras do portão: aparelho `ATIVO`, usuário ativo, ADMIN ou módulo `ENGENHARIA`.
- Respostas de erro destas rotas: `{ ok:false, error:"<frase em português>" }` com 401/403/400/404/413 — NÃO o formato Anthropic (esse é só do portão `/v1/`).
- Credenciais do SharePoint nunca saem da Vercel; o app recebe bytes, nunca URL assinada do Graph.
- Normas: drive `SHAREPOINT_DRIVE_ID`, base `/Engenharia/03. Padrão Torg/NORMAS`. Obra: drive SERVIDOR (`resolveServidorDriveId`), pasta de `pastaDaOp(opNumero)`. Procedimentos: `DocumentoQualidade` com `categoria:"SISTEMA"`, `ativo:true`, arquivo por `sharepointItemId` no drive SERVIDOR.
- Download máximo 30 MB por arquivo; upload de lista máximo 4 MB (limite já usado em `listas/servidor`).
- Tabela nova por `scripts/ensure-*.mjs` (SQL idempotente), espelhada no `schema.prisma`.
- AuditLog em toda mutação, com o `userId` do dono do aparelho e `aparelhoId` no `details`.
- `npm test` e `npm run checar` verdes antes de cada commit; nenhum teste toca o banco.

## Review Focus

- Caminho com `..`, barra inicial, `\`, `:` ou `%2e%2e` na leitura de documentos → 400, nunca lê fora da base (teste na Task 2).
- Aparelho REVOGADO no meio do uso → a próxima chamada a qualquer rota `/app/*` dá 401 (teste na Task 1).
- Import de LE pela rota do app tem de gravar EXATAMENTE como a tela (mesmo `criados/atualizados/ignorados` para as mesmas linhas) — refatoração preserva comportamento (teste de caracterização na Task 3).
- Roteiro: tentar concluir etapa com divergência `aberta` ou `nao_verificada` → 409 com a lista do que falta (teste na Task 4).
- Pedido para a OP "89" quando o banco tem "089" → resolve igual ao import da tela, não cria OP fantasma (teste na Task 3).

---

### Task 1: `autenticarAparelho` + liberar `/api/engenharia-ia/app/` no middleware

**Files:**
- Create: `lib/ia-aparelho-auth.js`
- Modify: `lib/ia-portao.js:24-49` (passa a usar o helper; mantém `erroAnthropic` nas recusas do portão)
- Modify: `middleware.js:164-169` (acrescentar `path.startsWith("/api/engenharia-ia/app/")`)
- Test: `testes/lib/ia-aparelho-auth.teste.js` (novo); `testes/api/ia-portao.teste.js` continua verde sem mudança

**Interfaces:**
- Produces: `export async function autenticarAparelho(req) -> Promise<{ aparelho, user } | { recusa: { status: 401|403, mensagem: string } }>`; `export function respostaRecusa(recusa) -> Response` (JSON `{ok:false,error}`); `export async function comAparelho(req, fn: ({aparelho,user}) => Promise<Response>) -> Response` (autentica, chama `fn`, converte exceção em 500 `{ok:false,error:"falha interna"}`).

- [ ] **Step 1: Escrever os testes**

```js
it("sem token → 401", async () => expect((await autenticarAparelho(req())).recusa.status).toBe(401));
it("aparelho REVOGADO → 401", ...);           // iaAparelho.findUnique devolve status:"REVOGADO"
it("usuário sem módulo ENGENHARIA → 403", ...);
it("ADMIN sem módulo passa", ...);
it("aceita x-api-key igual ao Bearer", ...);
it("comAparelho converte throw em 500 sem vazar a mensagem", ...);
```
- [ ] **Step 2:** `npx vitest run testes/lib/ia-aparelho-auth.teste.js` → FAIL (módulo não existe)
- [ ] **Step 3:** Mover `tokenDoPedido` + `autenticar` de `ia-portao.js` para o helper; o registro `iaUso` com `recusado_acesso` continua SÓ no portão (o helper não grava uso). `ia-portao.js` traduz `recusa` com `erroAnthropic(status, status===401?"authentication_error":"permission_error", mensagem)`.
- [ ] **Step 4:** `npx vitest run testes/lib/ia-aparelho-auth.teste.js testes/api/ia-portao.teste.js` → PASS
- [ ] **Step 5:** Commit `feat(ia): autenticarAparelho compartilhado e rotas /app liberadas no middleware`

### Task 2: Ler documentos — procedimentos, obra, normas

**Files:**
- Create: `lib/app-documentos.js`
- Create: `app/api/engenharia-ia/app/documentos/route.js` (GET lista), `app/api/engenharia-ia/app/documentos/arquivo/route.js` (GET bytes)
- Test: `testes/lib/app-documentos.teste.js`, `testes/api/app-documentos.teste.js`

**Interfaces:**
- Consumes: `comAparelho` (Task 1); `listChildrenByPath`, `downloadFileByPath`, `downloadFileById` de `lib/sharepoint.js`; `resolveServidorDriveId` de `lib/sharepoint-lpc.js`; `pastaDaOp` de `lib/le-servidor.js`.
- Produces:
  - `export const FONTES = ["procedimentos","obra","normas"]`
  - `export function caminhoRelativoSeguro(c: string) -> string` (lança `Error("caminho inválido")`; aceita `""`; normaliza `/` repetida; recusa `..`, início `/`, `\`, `:`, `%`)
  - `export async function listarDocumentos({ fonte, opNumero?, caminho? }) -> { itens: [{ nome, tipo:"pasta"|"arquivo", tamanho, caminho, id? }] }` — procedimentos ignoram `caminho` e listam `{ nome:"PO-06 — <titulo>", tipo:"arquivo", id }`
  - `export async function baixarDocumento({ fonte, opNumero?, caminho?, id? }) -> { buffer, nome, contentType }` — `id` só vale para procedimentos; obra/normas só por `caminho`
- Rotas: `GET /documentos?fonte=&op=&caminho=` → `{ ok:true, itens }`; `GET /documentos/arquivo?fonte=&op=&caminho=|id=` → bytes com `Content-Type`, `Content-Disposition: attachment; filename*=UTF-8''…`, `Cache-Control: no-store`. 413 acima de 30 MB (checar `tamanho` na listagem do pai antes de baixar).

- [ ] **Step 1: Testes da lib**

```js
expect(() => caminhoRelativoSeguro("../RH")).toThrow("caminho inválido");
expect(() => caminhoRelativoSeguro("/Engenharia")).toThrow();
expect(() => caminhoRelativoSeguro("a\\b")).toThrow();
expect(() => caminhoRelativoSeguro("NBR%2e%2e")).toThrow();
expect(caminhoRelativoSeguro("NBR 8800//2008.pdf")).toBe("NBR 8800/2008.pdf");
// listarDocumentos({fonte:"normas", caminho:"AISC"}) chama listChildrenByPath(driveId, "/Engenharia/03. Padrão Torg/NORMAS/AISC")
// obra: pastaDaOp("105") null → lança Error("pasta da OP 105 não encontrada") ; a rota devolve 404
// procedimentos: só DocumentoQualidade categoria SISTEMA ativo; baixar por id desconhecido → 404
```
- [ ] **Step 2:** Rodar → FAIL
- [ ] **Step 3:** Implementar lib e as duas rotas (zod: `fonte: z.enum(FONTES)`, `op` obrigatório quando `fonte==="obra"`).
- [ ] **Step 4:** Testes de rota: 401 sem token; 400 com `caminho=../x`; 404 OP sem pasta; 200 normas com bytes. `npx vitest run testes/lib/app-documentos.teste.js testes/api/app-documentos.teste.js` → PASS
- [ ] **Step 5:** Commit `feat(ia): app lê procedimentos, pasta da obra e NORMAS pelo portal`

### Task 3: Importar LE/LPC pelo app, com recibo Previsto × Gravado

**Files:**
- Create: `lib/importar-le-core.js` (lógica extraída de `app/api/producao/pecas/importar-le/route.js`)
- Modify: `app/api/producao/pecas/importar-le/route.js` (vira: sessão → `importarLeRows`)
- Create: `lib/app-listas.js`, `app/api/engenharia-ia/app/listas/route.js` (POST)
- Test: `testes/lib/importar-le-core.teste.js` (caracterização), `testes/api/app-listas.teste.js`; `testes/api/importar-le-chave.teste.js` continua verde

**Interfaces:**
- Consumes: `comAparelho`; `parseFormularioLE`; `parseLPC` + `importarLpcMerge(parsed,{userId,revisao,arquivo})`; `salvarListaNoServidor({tipo,opNumero,fileNome,buffer})`; `alertaDeDivergencia` de `app/engenharia/listas/revisao-lista.js`.
- Produces:
  - `export async function importarLeRows(rows, { opNumero = null, sobrescrever = false, userId }) -> <mesmo objeto que a rota devolve hoje>` (`ok, opNumero, opEncontrada, obra, totalNoArquivo, criados, atualizados, ignorados, jaNaOutraLista, avisoListaUnica?, pesoTotal, qteTotal, diff`)
  - `export async function importarListaDoApp({ tipo, opNumero, revisao, arquivoNome, buffer, sobrescrever, userId }) -> { ok, tipo, opNumero, previsto:{incluidas,alteradas,removidas}, gravado:{criados,atualizados,ignorados}, divergente:boolean, alerta:string|null, arquivo:{webUrl,caminho}|null, avisoArquivo?:string }`
  - Rota `POST /api/engenharia-ia/app/listas`, zod `{ tipo: z.enum(["LE","LPC"]), opNumero: z.string().min(1).max(10), revisao: z.string().regex(/^R\d{2}$/), arquivoNome: z.string().min(1).max(260), arquivoBase64: z.string().min(1), sobrescrever: z.boolean().default(false) }`; >4 MB → 413.
- Ordem dentro de `importarListaDoApp`: (1) ler XLSX → rows (`XLSX.read` + `sheet_to_json({header:1, raw:true})`); (2) gravar no banco (LE: `importarLeRows`; LPC: `parseLPC` + `importarLpcMerge`); (3) arquivar no SharePoint com `salvarListaNoServidor` — falha aqui NÃO desfaz o banco, volta em `avisoArquivo`; (4) `divergente`/`alerta` de `alertaDeDivergencia` (mesma regra da tela, inclusive o modo sobrescrever); (5) AuditLog `action:"IMPORTAR_LISTA_APP"`, `details:{tipo,revisao,aparelhoId,previsto,gravado}`.

- [ ] **Step 1: Teste de caracterização ANTES de extrair** — com o Prisma mockado, alimentar a rota atual com 3 linhas (uma marca nova, uma existente na LE, uma já na LPC → P2002) e congelar o JSON de resposta (`toMatchSnapshot`). Rodar → PASS contra o código atual.
- [ ] **Step 2:** Extrair para `importarLeRows`; a rota chama a lib. Rodar o snapshot → PASS sem `-u`.
- [ ] **Step 3: Testes do app** — LE com divergência (`criados` < previsto) → `divergente:true` e `alerta` não nulo; OP "89" casa "089"; SharePoint lança → `ok:true` com `avisoArquivo`; base64 > 4 MB → 413; tipo "RM" → 400.
- [ ] **Step 4:** Implementar `lib/app-listas.js` e a rota. `npx vitest run testes/lib/importar-le-core.teste.js testes/api/app-listas.teste.js testes/api/importar-le-chave.teste.js` → PASS
- [ ] **Step 5:** Commit `feat(ia): app importa LE/LPC no portal com recibo previsto × gravado`

### Task 4: Roteiro da obra — regras, tabela e rotas

**Files:**
- Create: `lib/roteiro-engenharia.js` (regras puras), `scripts/ensure-roteiro-engenharia.mjs`
- Modify: `prisma/schema.prisma` (model `RoteiroEtapa`)
- Create: `app/api/engenharia-ia/app/roteiro/route.js` (GET, POST)
- Test: `testes/lib/roteiro-engenharia.teste.js`, `testes/api/app-roteiro.teste.js`

**Interfaces:**
- Produces:
  - `export const ETAPAS = [{n:1,nome:"Modelo"},{n:2,nome:"Interferência com o IFC do cliente",opcional:true},{n:3,nome:"Revisão ou numeração"},{n:4,nome:"Detalhamento",porFase:true},{n:5,nome:"Listas LE/LPC e GRD",porFase:true},{n:6,nome:"Diagrama de montagem",opcional:true,porFase:true}]`
  - `export const STATUS = ["PENDENTE","EM_ANDAMENTO","AGUARDANDO_ACEITE","CONCLUIDA","NAO_SE_APLICA"]`
  - Divergência: `{ id, descricao, fonte, evidencia|null, situacao: "aberta"|"resolvida"|"aceita"|"nao_verificada" }`
  - `export function podeMudar(registros, { etapa, fase = null, para, divergencias = [] }) -> { ok:true } | { ok:false, motivo:string, pendentes?:Divergência[] }`
  - Model `RoteiroEtapa { id, opId, etapa Int, fase Int?, status, divergencias Json @default("[]"), observacao String?, aceitoPorId String?, aceitoEm DateTime?, atualizadoPorId String?, updatedAt, createdAt }`, único `(opId, etapa, fase)` — no SQL: índice único com `COALESCE(fase,-1)`.
  - `GET /roteiro?op=` → `{ ok, op:{id,numero}, etapas: [...] }`; `POST /roteiro` zod `{ opNumero, etapa: z.number().int().min(1).max(6), fase: z.number().int().min(0).nullable().default(null), para: z.enum(STATUS), divergencias: z.array(...).max(500).optional(), observacao: z.string().max(2000).optional() }` → 409 `{ok:false,error:motivo,pendentes}` quando `podeMudar` recusa.
- Regras (`podeMudar`), cada uma com teste:
  1. `NAO_SE_APLICA` só nas etapas 2 e 6.
  2. Sair de `PENDENTE` na etapa n exige todas as etapas < n (obra inteira, `fase` nula) em `CONCLUIDA`/`NAO_SE_APLICA`; para etapas por fase: etapa 5 fase f exige etapa 4 fase f `CONCLUIDA`; etapa 6 fase f exige etapa 5 fase f `CONCLUIDA`.
  3. `CONCLUIDA` exige vir de `AGUARDANDO_ACEITE` e nenhuma divergência `aberta`/`nao_verificada` → senão `pendentes` com elas.
  4. `aceitoPorId/aceitoEm` são gravados SÓ na transição para `CONCLUIDA` (quem aceita é o dono do aparelho).
  5. Etapa 6 com `NAO_SE_APLICA` vale para a obra (`fase` nula) e encerra o roteiro.

- [ ] **Step 1:** Testes das 5 regras (tabela de casos) → FAIL
- [ ] **Step 2:** Implementar `lib/roteiro-engenharia.js` → PASS
- [ ] **Step 3:** SQL de ensure (`CREATE TABLE IF NOT EXISTS "RoteiroEtapa"` + `CREATE UNIQUE INDEX IF NOT EXISTS "RoteiroEtapa_op_etapa_fase" ON "RoteiroEtapa"("opId","etapa",COALESCE("fase",-1))`) e o model no schema; `npx prisma generate`.
- [ ] **Step 4:** Rota + testes (409 com pendentes; AuditLog `action:"ROTEIRO_ENGENHARIA"` com `antes/depois`; upsert por `(opId,etapa,fase)` dentro de `$transaction`). Rodar → PASS
- [ ] **Step 5:** Commit `feat(ia): roteiro de 6 etapas da obra com portão de aceite`
- [ ] **Step 6 (produção, com o Vitor):** rodar `node scripts/ensure-roteiro-engenharia.mjs` com o `.env.local` (mesmo comando do `ensure-ia-engenharia`). ⚠ É escrita no banco de produção: pedir o ok antes.

### Task 5: Confirmar a GRD da obra

**Files:**
- Create: `app/api/engenharia-ia/app/grd/route.js`
- Test: `testes/api/app-grd.teste.js`

**Interfaces:**
- Consumes: `comAparelho`; model `GrdEngenharia` (campos `numero, revisao, opNumero, data, createdAt` e os itens).
- Produces: `GET /grd?op=&desde=<ISO>` → `{ ok, grds:[{ numero, revisao, data, itens:[{documento, rev, descricao}] }], ultimaLeitura: <CronHeartbeat "grd-sincronizar".lastOkAt> }`. Casa `opNumero` com e sem zero à esquerda, como `pastaDaOp`.

- [ ] **Step 1:** Testes: OP "89" acha GRDs gravadas como "89"/"089"; `desde` filtra por `createdAt`; devolve `ultimaLeitura` para o app explicar "a GRD entra pelo cron das 11/17/21h". → FAIL
- [ ] **Step 2:** Implementar → PASS (`npx vitest run testes/api/app-grd.teste.js`)
- [ ] **Step 3:** `npm test && npm run checar` → tudo verde; commit `feat(ia): app confirma a GRD da obra`
- [ ] **Step 4:** Memória: `docs/memoria-claude/torg_app_ia_rotas.md` (rotas `/app/*`, regra de autenticação, regras do roteiro) + linha no `MEMORY.md`; commit junto.
