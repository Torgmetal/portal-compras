# Inteligência Fiscal mais simples — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simulador que puxa os impostos cadastrados pelo Comercial na obra e o IBS/CBS aprendido das NFs do Omie; auditoria de medição por parcela; tela reduzida a 4 abas (+ Administração só ADMIN).

**Architecture:** Funções PURAS em `lib/fiscal/` (regras IBS/CBS, impostos da obra, parcela) com teste; rotas finas que leem o banco e chamam as puras; tabela nova `FiscalRegraIbsCbs` alimentada por cron + botão a partir do `ListarNF`. A UI troca as abas e ganha dois componentes novos em arquivos próprios (o `InteligenciaFiscalClient.jsx` já tem ~1.400 linhas).

**Tech Stack:** Next.js 14 App Router (JS), Prisma 6 + Neon, Vitest (+ jsdom/@testing-library para tela), Omie REST.

**Spec:** `docs/superpowers/specs/2026-09-26-inteligencia-fiscal-simples-design.md`

## Global Constraints

- Tudo em português (nomes, comentários, UI). JS puro, sem TypeScript.
- Nenhum teste toca o banco: Prisma mockado (`testes/apoio/prisma.js`).
- Schema novo: model em `prisma/schema.prisma` + DDL idempotente em `scripts/ensure-fiscal-tables.mjs`. **Nunca `prisma db push` em produção.** Mexeu no schema → reiniciar o `npm run dev`.
- Escrita em massa: `prismaDirect`, SQL constante com `UNNEST` de arrays-literais de texto (CLAUDE.md).
- Todo cron: `aquecerBanco(prisma)` no início, `registrarExecucao(job, …)` no fim e no catch, `temCronSecret`.
- Rotas: `requireAcesso({ modulos: ["FISCAL","FINANCEIRO"] })` para leitura; o botão de atualizar regras: ADMIN ou módulo FISCAL.
- Nada é gravado pela simulação nem pela auditoria; nenhuma NF é emitida.
- Divergência nunca é resolvida escolhendo um lado; ausência de regra nunca vira 0%.
- Teto de 350 linhas por arquivo (aviso do eslint) — componentes novos em arquivos próprios.

## Review Focus

1. **NF sem grupo IBS/CBS** (remessa, nota antiga, `pAliqCbs` ausente/0) — não pode virar regra "0%"; esperado: ignorada. → teste na Task 1.
2. **NCM/CFOP com pontuação** (`"9406.90.20"`, `"6.101"`) vs pedido (`"94069020"`, `"6101"`) — mesma chave. → teste na Task 1.
3. **Linha de receita sem CFOP e com NCM só no texto** (`[NCM: 84313900]`) — NCM extraído, CFOP obrigatório na tela. → teste na Task 3.
4. **Quantidade da parcela acima do pedido, zero, negativa ou item inexistente** — recusada no servidor (400), não "corrigida". → teste na Task 4.
5. **Omie com estrangulamento/erro no meio da coleta** — o que já foi lido não é gravado parcialmente como se fosse o mês inteiro; o erro sai no heartbeat. → teste na Task 2.

---

### Task 1: Regras IBS/CBS — extração e leitura (puro)

**Files:**
- Create: `lib/fiscal/regras-ibs-cbs.js`
- Test: `testes/lib/fiscal-regras-ibs-cbs.teste.js`

**Interfaces:**
- Produces:
  - `extrairRegrasDaNf(nf) → Array<{ncm, cfop, pCbs, pIbsUf, nf, emitidaEm}>` (`ncm`/`cfop` só dígitos; `emitidaEm` ISO `YYYY-MM-DD`)
  - `agruparRegras(observacoes) → Array<{ncm, cfop, pCbs, pIbsUf, qtdNotas, primeiraNf, primeiraEm, ultimaNf, ultimaEm}>`
  - `situacaoDaRegra(linhas) → { situacao: "UNICA"|"DIVERGENTE"|"SEM_NF", linhas }`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from "vitest";
import { extrairRegrasDaNf, agruparRegras, situacaoDaRegra } from "@/lib/fiscal/regras-ibs-cbs";

// Recorte da NF 943 real (ListarNF, 01/09/2026).
const nf = (nNF, dEmi, itens) => ({ ide: { nNF, dEmi }, det: itens.map((prod) => ({ prod })) });
const NF943 = nf("00000943", "01/09/2026", [
  { NCM: "9406.90.20", CFOP: "6.101", pAliqCbs: 0.9, pAliqIBSUf: 0.1, vBCIbsCbs: 7414.74 },
]);

describe("extrairRegrasDaNf", () => {
  it("normaliza NCM e CFOP para dígitos e lê a data", () => {
    expect(extrairRegrasDaNf(NF943)).toEqual([
      { ncm: "94069020", cfop: "6101", pCbs: 0.9, pIbsUf: 0.1, nf: "943", emitidaEm: "2026-09-01" },
    ]);
  });
  it("⚠ item sem grupo IBS/CBS (remessa, nota antiga) não vira regra 0%", () => {
    const r = extrairRegrasDaNf(nf("10", "02/09/2026", [
      { NCM: "7308.90.10", CFOP: "5.901" },
      { NCM: "7308.90.10", CFOP: "5.101", pAliqCbs: 0, pAliqIBSUf: 0 },
    ]));
    expect(r).toEqual([]);
  });
});

describe("agruparRegras", () => {
  it("mesma combinação soma notas e guarda a primeira e a última", () => {
    const obs = [
      ...extrairRegrasDaNf(nf("943", "01/09/2026", [{ NCM: "94069020", CFOP: "6101", pAliqCbs: 0.9, pAliqIBSUf: 0.1 }])),
      ...extrairRegrasDaNf(nf("950", "10/09/2026", [{ NCM: "94069020", CFOP: "6101", pAliqCbs: 0.9, pAliqIBSUf: 0.1 }])),
    ];
    expect(agruparRegras(obs)).toEqual([{ ncm: "94069020", cfop: "6101", pCbs: 0.9, pIbsUf: 0.1,
      qtdNotas: 2, primeiraNf: "943", primeiraEm: "2026-09-01", ultimaNf: "950", ultimaEm: "2026-09-10" }]);
  });
  it("⚠ alíquotas diferentes para o mesmo NCM×CFOP ficam em DUAS linhas", () => {
    const obs = [
      { ncm: "1", cfop: "6101", pCbs: 0.9, pIbsUf: 0.1, nf: "1", emitidaEm: "2026-09-01" },
      { ncm: "1", cfop: "6101", pCbs: 0.8, pIbsUf: 0.1, nf: "2", emitidaEm: "2026-09-02" },
    ];
    expect(agruparRegras(obs)).toHaveLength(2);
  });
  it("a mesma NF com dois itens iguais conta uma nota", () => {
    const obs = extrairRegrasDaNf(nf("7", "01/09/2026", [
      { NCM: "1", CFOP: "6101", pAliqCbs: 0.9, pAliqIBSUf: 0.1 },
      { NCM: "1", CFOP: "6101", pAliqCbs: 0.9, pAliqIBSUf: 0.1 },
    ]));
    expect(agruparRegras(obs)[0].qtdNotas).toBe(1);
  });
});

describe("situacaoDaRegra", () => {
  it("sem linha → SEM_NF; uma → UNICA; duas → DIVERGENTE", () => {
    expect(situacaoDaRegra([]).situacao).toBe("SEM_NF");
    expect(situacaoDaRegra([{ pCbs: 0.9 }]).situacao).toBe("UNICA");
    expect(situacaoDaRegra([{ pCbs: 0.9 }, { pCbs: 0.8 }]).situacao).toBe("DIVERGENTE");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run testes/lib/fiscal-regras-ibs-cbs.teste.js`
Expected: FAIL (módulo não existe)

- [ ] **Step 3: Write minimal implementation**

```js
// ─── AS REGRAS DE IBS/CBS QUE AS NOSSAS NOTAS JÁ USAM ────────────────────────
// Matheus (26/09/2026): "puxar as regras IBS/CBS que já temos em nossa NF no Omie". O ListarNF traz,
// por item, `pAliqCbs` e `pAliqIBSUf` junto do NCM e do CFOP (conferido na NF 943).
// ⚠⚠ AUSÊNCIA NÃO É 0%: item sem o grupo (remessa, nota antiga) não gera regra.
// ⚠⚠ DIVERGÊNCIA NÃO SE RESOLVE: alíquotas diferentes para o mesmo NCM×CFOP ficam em linhas
// separadas; quem lê vê as duas com as notas.
// ⚠ Sem UF: o ListarNF não traz a UF do destinatário. Em 2027 o IBS passa a variar pelo destino.
const dig = (v) => String(v ?? "").replace(/\D/g, "");
const num = (v) => (v === null || v === undefined || v === "" ? null : Number(v));
const iso = (br) => { const [d, m, a] = String(br ?? "").split("/"); return a ? `${a}-${m}-${d}` : null; };

export function extrairRegrasDaNf(nf) {
  const nfNum = String(Number(dig(nf?.ide?.nNF)) || "");
  const emitidaEm = iso(nf?.ide?.dEmi);
  const out = [];
  for (const d of nf?.det ?? []) {
    const p = d?.prod ?? {};
    const pCbs = num(p.pAliqCbs), pIbsUf = num(p.pAliqIBSUf);
    if (!(pCbs > 0) && !(pIbsUf > 0)) continue;
    const ncm = dig(p.NCM), cfop = dig(p.CFOP);
    if (ncm.length !== 8 || cfop.length !== 4) continue;
    out.push({ ncm, cfop, pCbs: pCbs ?? 0, pIbsUf: pIbsUf ?? 0, nf: nfNum, emitidaEm });
  }
  return out;
}

export function agruparRegras(observacoes) {
  const mapa = new Map();
  for (const o of observacoes ?? []) {
    const chave = [o.ncm, o.cfop, o.pCbs, o.pIbsUf].join("|");
    let g = mapa.get(chave);
    if (!g) { g = { ncm: o.ncm, cfop: o.cfop, pCbs: o.pCbs, pIbsUf: o.pIbsUf, notas: new Set(),
      primeiraNf: o.nf, primeiraEm: o.emitidaEm, ultimaNf: o.nf, ultimaEm: o.emitidaEm }; mapa.set(chave, g); }
    g.notas.add(o.nf);
    if (o.emitidaEm < g.primeiraEm) { g.primeiraEm = o.emitidaEm; g.primeiraNf = o.nf; }
    if (o.emitidaEm > g.ultimaEm) { g.ultimaEm = o.emitidaEm; g.ultimaNf = o.nf; }
  }
  return [...mapa.values()].map(({ notas, ...g }) => ({ ...g, qtdNotas: notas.size }));
}

export function situacaoDaRegra(linhas) {
  const l = linhas ?? [];
  return { situacao: l.length === 0 ? "SEM_NF" : l.length === 1 ? "UNICA" : "DIVERGENTE", linhas: l };
}
```

Reordenar o objeto de saída do `agruparRegras` na ordem do teste (`ncm, cfop, pCbs, pIbsUf, qtdNotas, primeiraNf, primeiraEm, ultimaNf, ultimaEm`) — `toEqual` não liga para a ordem, então basta os campos baterem.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run testes/lib/fiscal-regras-ibs-cbs.teste.js` → PASS

- [ ] **Step 5: Commit** — `git add lib/fiscal/regras-ibs-cbs.js testes/lib/fiscal-regras-ibs-cbs.teste.js && git commit -m "Fiscal: regras de IBS/CBS extraídas das NFs do Omie (puro)"`

---

### Task 2: Tabela, coleta no Omie, cron e botão

**Files:**
- Modify: `prisma/schema.prisma` (model `FiscalRegraIbsCbs` no fim do bloco fiscal)
- Modify: `scripts/ensure-fiscal-tables.mjs` (DDL no array `sql`)
- Create: `lib/fiscal/coleta-ibs-cbs.js`
- Create: `app/api/cron/fiscal-ibs-cbs/route.js`
- Create: `app/api/fiscal/inteligencia/regras-ibs-cbs/route.js` (GET leitura, POST botão)
- Modify: `vercel.json` (cron `"50 4 * * *"`)
- Test: `testes/lib/fiscal-coleta-ibs-cbs.teste.js`

**Interfaces:**
- Consumes: `extrairRegrasDaNf`, `agruparRegras`, `situacaoDaRegra` (Task 1)
- Produces:
  - `coletarRegrasIbsCbs({ de, ate, listar }) → { notas, regras: agrupadas[] }` — `listar(param)` injetável (default: POST `produtos/nfconsultar` `ListarNF`); lança se qualquer página falhar (exceto "nenhum registro").
  - `gravarRegras(regras, db) → number` — upsert por `(ncm,cfop,pCbs,pIbsUf)`: SOMA `qtdNotas` e alarga primeira/última NF. Só é correto com janelas que não se sobrepõem (cron = só ontem; botão = reconstrução total com DELETE antes) — ver Step 3.
  - `regraIbsCbs({ ncm, cfop }, db) → situacaoDaRegra(...)`

- [ ] **Step 1: Write the failing test** (coleta com `listar` falso; falha no meio não devolve parcial)

```js
import { describe, it, expect, vi } from "vitest";
import { coletarRegrasIbsCbs } from "@/lib/fiscal/coleta-ibs-cbs";

const pag = (n, total, nfs) => ({ pagina: n, total_de_paginas: total, nfCadastro: nfs });
const nf = (nNF) => ({ ide: { nNF, dEmi: "01/09/2026" }, det: [{ prod: { NCM: "9406.90.20", CFOP: "6.101", pAliqCbs: 0.9, pAliqIBSUf: 0.1 } }] });

describe("coletarRegrasIbsCbs", () => {
  it("percorre as páginas e agrupa", async () => {
    const listar = vi.fn(async (p) => (p.pagina === 1 ? pag(1, 2, [nf("1")]) : pag(2, 2, [nf("2")])));
    const r = await coletarRegrasIbsCbs({ de: "01/09/2026", ate: "25/09/2026", listar });
    expect(r.notas).toBe(2);
    expect(r.regras).toEqual([expect.objectContaining({ ncm: "94069020", cfop: "6101", qtdNotas: 2 })]);
  });
  it("⚠ página que falha derruba a coleta — nada parcial", async () => {
    const listar = vi.fn(async (p) => (p.pagina === 1 ? pag(1, 2, [nf("1")]) : { faultstring: "Erro interno" }));
    await expect(coletarRegrasIbsCbs({ de: "01/09/2026", ate: "25/09/2026", listar })).rejects.toThrow(/Erro interno/);
  });
  it("janela sem nota é zero, não erro", async () => {
    const listar = vi.fn(async () => ({ faultstring: "Não existem registros para a página [1]!" }));
    expect(await coletarRegrasIbsCbs({ de: "01/01/2026", ate: "02/01/2026", listar })).toEqual({ notas: 0, regras: [] });
  });
});
```

- [ ] **Step 2: Run** `npx vitest run testes/lib/fiscal-coleta-ibs-cbs.teste.js` → FAIL

- [ ] **Step 3: Implement**

`prisma/schema.prisma`:
```prisma
/// Alíquotas de IBS/CBS que as NOSSAS NF-e de saída usaram, por NCM × CFOP (aprendidas do ListarNF).
/// ⚠ Uma linha por combinação de ALÍQUOTAS: divergência vira duas linhas, nunca sobrescrita.
model FiscalRegraIbsCbs {
  id           String   @id @default(cuid())
  ncm          String
  cfop         String
  pCbs         Float
  pIbsUf       Float
  qtdNotas     Int      @default(0)
  primeiraNf   String?
  primeiraEm   String?
  ultimaNf     String?
  ultimaEm     String?
  atualizadoEm DateTime @default(now()) @updatedAt

  @@unique([ncm, cfop, pCbs, pIbsUf])
  @@index([ncm, cfop])
}
```

`scripts/ensure-fiscal-tables.mjs` (no array `sql`):
```js
  `CREATE TABLE IF NOT EXISTS "FiscalRegraIbsCbs" (
     "id" TEXT PRIMARY KEY, "ncm" TEXT NOT NULL, "cfop" TEXT NOT NULL,
     "pCbs" DOUBLE PRECISION NOT NULL, "pIbsUf" DOUBLE PRECISION NOT NULL,
     "qtdNotas" INTEGER NOT NULL DEFAULT 0, "primeiraNf" TEXT, "primeiraEm" TEXT,
     "ultimaNf" TEXT, "ultimaEm" TEXT, "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FiscalRegraIbsCbs_ncm_cfop_pCbs_pIbsUf_key" ON "FiscalRegraIbsCbs"("ncm","cfop","pCbs","pIbsUf")`,
  `CREATE INDEX IF NOT EXISTS "FiscalRegraIbsCbs_ncm_cfop_idx" ON "FiscalRegraIbsCbs"("ncm","cfop")`,
```

`lib/fiscal/coleta-ibs-cbs.js`:
```js
import { extrairRegrasDaNf, agruparRegras, situacaoDaRegra } from "./regras-ibs-cbs";

const URL = "https://app.omie.com.br/api/v1/produtos/nfconsultar/";
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function listarOmie(param, tentativa = 0) {
  const { OMIE_APP_KEY: app_key, OMIE_APP_SECRET: app_secret } = process.env;
  const resp = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call: "ListarNF", app_key, app_secret, param: [param] }) });
  const d = await resp.json().catch(() => ({}));
  if (d.faultstring && /consumo|processadas|aguarde|timeout/i.test(d.faultstring) && tentativa < 5) {
    await espera(2000 * (tentativa + 1));
    return listarOmie(param, tentativa + 1);
  }
  return d;
}

/** ⚠ Qualquer página que falhe derruba a coleta: gravar metade do mês seria dizer que a outra metade não existe. */
export async function coletarRegrasIbsCbs({ de, ate, listar = listarOmie }) {
  const obs = []; let notas = 0, pagina = 1, total = 1;
  while (pagina <= total) {
    const d = await listar({ pagina, registros_por_pagina: 50, apenas_importado_api: "N", dEmiInicial: de, dEmiFinal: ate, tpNF: 1, tpAmb: 1 });
    if (d.faultstring) {
      if (/n[ãa]o existem registros|nenhum/i.test(d.faultstring) && pagina === 1) break;
      throw new Error(`Omie ListarNF: ${d.faultstring}`);
    }
    total = d.total_de_paginas || 1;
    for (const nf of d.nfCadastro ?? []) { notas++; obs.push(...extrairRegrasDaNf(nf)); }
    pagina++;
  }
  return { notas, regras: agruparRegras(obs) };
}

// ⚠ Statement constante + arrays-literais de texto (regra de bulk write do CLAUDE.md).
const lit = (arr) => `{${arr.map((v) => (v == null ? "NULL" : `"${String(v).replace(/["\\]/g, "\\$&")}"`)).join(",")}}`;

/** Upsert: soma notas da janela nova; alarga primeira/última. Idempotência: rodar a MESMA janela duas vezes infla `qtdNotas` — o cron usa janelas que não se sobrepõem por dia (ver rota). */
export async function gravarRegras(regras, db) {
  if (!regras.length) return 0;
  const col = (k) => lit(regras.map((r) => r[k]));
  return db.$executeRawUnsafe(`
    INSERT INTO "FiscalRegraIbsCbs" ("id","ncm","cfop","pCbs","pIbsUf","qtdNotas","primeiraNf","primeiraEm","ultimaNf","ultimaEm","atualizadoEm")
    SELECT md5(random()::text || clock_timestamp()::text), u.ncm, u.cfop, u.pcbs::float8, u.pibs::float8, u.qtd::int, u.pnf, u.pem, u.unf, u.uem, now()
    FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[])
      AS u(ncm, cfop, pcbs, pibs, qtd, pnf, pem, unf, uem)
    ON CONFLICT ("ncm","cfop","pCbs","pIbsUf") DO UPDATE SET
      "qtdNotas" = "FiscalRegraIbsCbs"."qtdNotas" + EXCLUDED."qtdNotas",
      "primeiraNf" = CASE WHEN EXCLUDED."primeiraEm" < "FiscalRegraIbsCbs"."primeiraEm" THEN EXCLUDED."primeiraNf" ELSE "FiscalRegraIbsCbs"."primeiraNf" END,
      "primeiraEm" = LEAST("FiscalRegraIbsCbs"."primeiraEm", EXCLUDED."primeiraEm"),
      "ultimaNf" = CASE WHEN EXCLUDED."ultimaEm" > "FiscalRegraIbsCbs"."ultimaEm" THEN EXCLUDED."ultimaNf" ELSE "FiscalRegraIbsCbs"."ultimaNf" END,
      "ultimaEm" = GREATEST("FiscalRegraIbsCbs"."ultimaEm", EXCLUDED."ultimaEm"),
      "atualizadoEm" = now()`,
    col("ncm"), col("cfop"), col("pCbs"), col("pIbsUf"), col("qtdNotas"), col("primeiraNf"), col("primeiraEm"), col("ultimaNf"), col("ultimaEm"));
}

export async function regraIbsCbs({ ncm, cfop }, db) {
  const n = String(ncm ?? "").replace(/\D/g, ""), c = String(cfop ?? "").replace(/\D/g, "");
  if (n.length !== 8 || c.length !== 4) return situacaoDaRegra([]);
  const linhas = await db.fiscalRegraIbsCbs.findMany({ where: { ncm: n, cfop: c }, orderBy: { ultimaEm: "desc" } });
  return situacaoDaRegra(linhas);
}
```

⚠ **Janelas sem sobreposição** (a soma de `qtdNotas` exige): o cron coleta **só o dia anterior** (`de = ate = ontem`); a carga inicial e o botão rodam por mês e **zeram a tabela antes** (`DELETE FROM "FiscalRegraIbsCbs"` numa transação com as gravações) — reconstrução total, nunca soma sobre soma.

`app/api/cron/fiscal-ibs-cbs/route.js`: padrão do `fiscal-tipi` — `temCronSecret`, `aquecerBanco(prisma)`, `coletarRegrasIbsCbs({ de: ontem, ate: ontem })`, `gravarRegras(regras, prismaDirect)`, `registrarExecucao("fiscal-ibs-cbs", { ok, mensagem: \`${notas} NF(s) · ${regras.length} regra(s)\` })`; catch registra `ok:false` com a mensagem. `maxDuration = 120`.

`app/api/fiscal/inteligencia/regras-ibs-cbs/route.js`:
- `GET ?ncm=&cfop=` → `requireAcesso({ modulos: ["FISCAL","FINANCEIRO"] })` → `regraIbsCbs(...)`.
- `POST` → ADMIN ou módulo FISCAL → reconstrução total de 01/01/ano até hoje, **mês a mês**, depois `prismaDirect.$transaction([DELETE, gravarRegras])`; `AuditLog` `RECONSTRUIR_REGRAS_IBS_CBS` com `{ notas, regras }`; `maxDuration = 300`.

`vercel.json`: `{ "path": "/api/cron/fiscal-ibs-cbs", "schedule": "50 4 * * *" }`.

- [ ] **Step 4: Run** coleta test → PASS; `node --env-file=.env.local scripts/ensure-fiscal-tables.mjs` (idempotente, cria a tabela); `npx prisma generate`; **reiniciar o dev**.
- [ ] **Step 5: Commit** — "Fiscal: regras de IBS/CBS das NFs do Omie — tabela, coleta, cron e botão"

---

### Task 3: Simulador pela obra

**Files:**
- Create: `lib/fiscal/impostos-da-obra.js`
- Modify: `app/api/fiscal/inteligencia/simular/route.js` (GET inclui `receitas` por OP; POST aceita `receitaId`)
- Create: `app/fiscal/inteligencia/SimuladorObra.jsx`
- Modify: `app/fiscal/inteligencia/InteligenciaFiscalClient.jsx` (`AbaSimulador` renderiza `<SimuladorObra/>` no topo)
- Test: `testes/lib/fiscal-impostos-da-obra.teste.js`, `testes/fiscal-simulador-obra.teste.jsx`

**Interfaces:**
- Consumes: `ncmNaDescricao` (`lib/fiscal/pedido-omie.js`), `estimarIcms`/`icmsDeReferencia` (`lib/fiscal/icms.js`), `ipiDaTipi` (`lib/fiscal/simulador.js`), `regraIbsCbs` (Task 2)
- Produces:
  - `linhaDaReceita(receita) → { id, descricao, cfop|null, ncm|null, valor, pct: {icms,ipi,pis,cofins,iss,irrf,csll} }`
  - `impostosDaObra({ receita, valor, ipiRegra, icmsRegra, ibsCbs }) → { linhas: [{ tributo, cadastrado|null, regra|null, valor|null, divergente: boolean, nota|null }], total }`

- [ ] **Step 1: Failing test (puro)**

```js
import { describe, it, expect } from "vitest";
import { linhaDaReceita, impostosDaObra } from "@/lib/fiscal/impostos-da-obra";

const REC = { id: "r1", descricao: "TP0051075 — TRELICA - [NCM: 84313900]", cfop: null, valor: 1000,
  icmsPct: 12, ipiPct: 0, pisPct: 1.65, cofinsPct: 7.6, issPct: null, irrfPct: 3, csllPct: 1.08 };

describe("linhaDaReceita", () => {
  it("NCM vem do texto; CFOP ausente fica null (não se adivinha)", () => {
    expect(linhaDaReceita(REC)).toMatchObject({ ncm: "84313900", cfop: null, pct: { icms: 12, ipi: 0, pis: 1.65 } });
  });
});

describe("impostosDaObra", () => {
  const base = { receita: linhaDaReceita(REC), valor: 1000,
    ipiRegra: { determinado: true, aliquota: 5 }, icmsRegra: { estado: "REFERENCIA", aliquota: 12 },
    ibsCbs: { situacao: "UNICA", linhas: [{ pCbs: 0.9, pIbsUf: 0.1, ultimaNf: "943" }] } };

  it("⚠ IPI 0% cadastrado contra 5% da TIPI fica DIVERGENTE", () => {
    const ipi = impostosDaObra(base).linhas.find((l) => l.tributo === "IPI");
    expect(ipi).toMatchObject({ cadastrado: 0, regra: 5, divergente: true, valor: 50 });
  });
  it("PIS/COFINS usam o cadastrado; CBS/IBS a regra das NFs", () => {
    const l = Object.fromEntries(impostosDaObra(base).linhas.map((x) => [x.tributo, x]));
    expect(l.PIS).toMatchObject({ cadastrado: 1.65, valor: 16.5 });
    expect(l.CBS).toMatchObject({ regra: 0.9, valor: 9 });
    expect(l.IBS).toMatchObject({ regra: 0.1, valor: 1 });
  });
  it("⚠ IBS/CBS divergente ou sem NF: sem valor e com nota", () => {
    const l = impostosDaObra({ ...base, ibsCbs: { situacao: "SEM_NF", linhas: [] } }).linhas.find((x) => x.tributo === "CBS");
    expect(l).toMatchObject({ regra: null, valor: null });
    expect(l.nota).toMatch(/nenhuma NF/i);
  });
  it("obra sem receita: só a regra", () => {
    const icms = impostosDaObra({ ...base, receita: null }).linhas.find((x) => x.tributo === "ICMS");
    expect(icms).toMatchObject({ cadastrado: null, regra: 12, valor: 120, divergente: false });
  });
});
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** `lib/fiscal/impostos-da-obra.js`:

```js
import { ncmNaDescricao } from "./pedido-omie";
const r2 = (n) => Math.round(n * 100) / 100;
const dig = (v) => String(v ?? "").replace(/\D/g, "");

export function linhaDaReceita(r) {
  if (!r) return null;
  const cfop = dig(r.cfop);
  return { id: r.id, descricao: r.descricao, cfop: cfop.length === 4 ? cfop : null,
    ncm: ncmNaDescricao(r.descricao) || null, valor: Number(r.valor) || 0,
    pct: { icms: r.icmsPct ?? null, ipi: r.ipiPct ?? null, pis: r.pisPct ?? null, cofins: r.cofinsPct ?? null,
      iss: r.issPct ?? null, irrf: r.irrfPct ?? null, csll: r.csllPct ?? null } };
}

const linha = (tributo, cadastrado, regra, valor, nota = null) => {
  const usa = regra ?? cadastrado;
  return { tributo, cadastrado, regra, nota,
    valor: usa == null || !(valor > 0) ? null : r2(valor * usa / 100),
    divergente: cadastrado != null && regra != null && Number(cadastrado) !== Number(regra) };
};

export function impostosDaObra({ receita, valor, ipiRegra, icmsRegra, ibsCbs }) {
  const p = receita?.pct ?? {};
  const ibs = ibsCbs?.situacao === "UNICA" ? ibsCbs.linhas[0] : null;
  const notaIbs = ibsCbs?.situacao === "DIVERGENTE"
    ? `As NFs usaram alíquotas diferentes para este NCM/CFOP: ${ibsCbs.linhas.map((l) => `CBS ${l.pCbs}% / IBS ${l.pIbsUf}% (NF ${l.ultimaNf})`).join(" · ")}`
    : ibsCbs?.situacao === "SEM_NF" || !ibsCbs ? "Nenhuma NF nossa usou este NCM/CFOP ainda." : `Como na NF ${ibs.ultimaNf}.`;
  const linhas = [
    linha("ICMS", p.icms ?? null, icmsRegra?.estado === "REFERENCIA" ? icmsRegra.aliquota : null, valor, icmsRegra?.motivo ?? null),
    linha("IPI", p.ipi ?? null, ipiRegra?.determinado ? ipiRegra.aliquota : null, valor, ipiRegra?.motivo ?? null),
    linha("PIS", p.pis ?? null, null, valor), linha("COFINS", p.cofins ?? null, null, valor),
    linha("ISS", p.iss ?? null, null, valor), linha("IRRF", p.irrf ?? null, null, valor), linha("CSLL", p.csll ?? null, null, valor),
    linha("CBS", null, ibs ? ibs.pCbs : null, valor, notaIbs), linha("IBS", null, ibs ? ibs.pIbsUf : null, valor, notaIbs),
  ];
  return { linhas, total: r2(linhas.reduce((s, l) => s + (l.valor ?? 0), 0)) };
}
```

Rota `simular`: GET passa a devolver `ops[].receitas = linhaDaReceita(...)` (select `receitas: { select: { id, descricao, cfop, valor, icmsPct, ipiPct, pisPct, cofinsPct, issPct, irrfPct, csllPct }, orderBy: { ordem: "asc" } }`). Nova rota `POST /api/fiscal/inteligencia/simular-obra` `{ opId, receitaId, ncm, cfop, valor }` (zod: ncm 8 dígitos, cfop 4 dígitos obrigatório, valor > 0): lê OP (`clienteUF`) e a receita **da mesma OP** (404 se não for), TIPI ativa do NCM → `ipiDaTipi`, `estimarIcms("SP", clienteUF, valor, daEscolhaDoCfop(cfop, ambito))`, `regraIbsCbs`, e devolve `impostosDaObra(...)`.

UI `SimuladorObra.jsx`: select de obra → lista de receitas (radio) → campos NCM/CFOP/valor preenchidos e editáveis (CFOP vazio = obrigatório, com texto "Escolha o CFOP — a linha da obra não tem") → botão Simular → tabela `Tributo | Cadastrado (Comercial) | Regra | Valor`; linha `divergente` com `bg-amber-50` e a nota; obra sem receitas mostra "Sem imposto cadastrado pelo Comercial nesta obra — simulação só pela regra.".

Teste de tela (`testes/fiscal-simulador-obra.teste.jsx`, jsdom): escolher obra preenche NCM `84313900` a partir da descrição; CFOP vazio bloqueia o envio com a mensagem.

- [ ] **Step 4: Run** os dois testes → PASS
- [ ] **Step 5: Commit** — "Fiscal: simulador pela obra — imposto do Comercial ao lado da regra"

---

### Task 4: Auditoria de medição por parcela

**Files:**
- Create: `lib/fiscal/parcela.js`
- Modify: `app/api/fiscal/inteligencia/auditoria/route.js` (JSON aceita `parcela`)
- Create: `app/fiscal/inteligencia/ParcelaMedicao.jsx`
- Modify: `AbaAuditoria` em `InteligenciaFiscalClient.jsx` (tira o upload de XML; após escolher medição mostra `<ParcelaMedicao/>`)
- Test: `testes/lib/fiscal-parcela.teste.js`

**Interfaces:**
- Consumes: doc de `lerPedidoOmie` (itens `{item, ncm, cfop, quantidade, valorUnitario, valor, ipi, icms}`), `auditar`, `estimarIcms`, `regraIbsCbs`, `impostosDaObra`
- Produces: `montarParcela(doc, selecao) → { doc } | { erro }` — `selecao = [{ item: number, quantidade: number }]`; itens não selecionados saem; `quantidade` e `valor` (= qtd × valorUnitario, ou proporcional a `valor/quantidade`) e `ipi.base`/`icms.base` escalados pela razão.

- [ ] **Step 1: Failing test**

```js
import { describe, it, expect } from "vitest";
import { montarParcela } from "@/lib/fiscal/parcela";

const DOC = { itens: [
  { item: 1, ncm: "84313900", cfop: "6101", quantidade: 100, valorUnitario: 10, valor: 1000, ipi: { aliquota: 5, base: 1000, valor: 50 }, icms: { aliquota: 12, base: 1000, valor: 120 } },
  { item: 2, ncm: "73089010", cfop: "6101", quantidade: 10, valorUnitario: 50, valor: 500, ipi: { aliquota: 0, base: 500, valor: 0 }, icms: { aliquota: 12, base: 500, valor: 60 } },
] };

describe("montarParcela", () => {
  it("escala valor e bases pela quantidade da parcela e tira os não marcados", () => {
    const { doc } = montarParcela(DOC, [{ item: 1, quantidade: 25 }]);
    expect(doc.itens).toHaveLength(1);
    expect(doc.itens[0]).toMatchObject({ quantidade: 25, valor: 250, ipi: { base: 250, valor: 12.5 }, icms: { base: 250, valor: 30 } });
  });
  it.each([
    [[{ item: 1, quantidade: 101 }], /acima/],
    [[{ item: 1, quantidade: 0 }], /maior que zero/],
    [[{ item: 9, quantidade: 1 }], /não existe/],
    [[], /Marque/],
    [[{ item: 1, quantidade: 1 }, { item: 1, quantidade: 2 }], /repetido/],
  ])("⚠ seleção inválida é recusada, não corrigida: %j", (sel, msg) => {
    expect(montarParcela(DOC, sel).erro).toMatch(msg);
  });
});
```

- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** `lib/fiscal/parcela.js`:

```js
const r2 = (n) => Math.round(n * 100) / 100;
const escala = (g, f) => (g ? { ...g, base: g.base == null ? null : r2(g.base * f), valor: g.valor == null ? null : r2(g.valor * f) } : g);

/** A parte da medição que vai nesta nota. ⚠ Seleção inválida é RECUSADA — corrigir em silêncio auditaria outra parcela. */
export function montarParcela(doc, selecao) {
  if (!Array.isArray(selecao) || selecao.length === 0) return { erro: "Marque ao menos um item da parcela." };
  const vistos = new Set(); const itens = [];
  for (const s of selecao) {
    if (vistos.has(s.item)) return { erro: `Item ${s.item} repetido na parcela.` };
    vistos.add(s.item);
    const it = doc.itens.find((i) => i.item === s.item);
    if (!it) return { erro: `Item ${s.item} não existe neste pedido.` };
    const q = Number(s.quantidade);
    if (!(q > 0)) return { erro: `Item ${s.item}: a quantidade precisa ser maior que zero.` };
    if (q > it.quantidade) return { erro: `Item ${s.item}: ${q} está acima das ${it.quantidade} do pedido.` };
    const f = q / it.quantidade;
    itens.push({ ...it, quantidade: q, valor: r2(it.valor * f), ipi: escala(it.ipi, f), icms: escala(it.icms, f) });
  }
  return { doc: { ...doc, itens } };
}
```

Rota `auditoria` (ramo JSON): `const parcela = Array.isArray(body.parcela) ? body.parcela : null;` depois de `lerPedidoOmie`: `if (parcela) { const p = montarParcela(doc, parcela); if (p.erro) return 400; doc = p.doc; }`. Além do `auditar` (IPI), para cada item devolver `esperado: impostosDaObra({ receita: receitaDoCfop, valor: item.valor, ipiRegra, icmsRegra: estimarIcms("SP", op.clienteUF, item.valor, cfopObj), ibsCbs: await regraIbsCbs(item, prisma) })`, com `receitaDoCfop` = primeira `OPReceita` da obra com o mesmo CFOP (para PIS/COFINS/ISS/IRRF/CSLL), e `totaisParcela` somando por tributo.

UI `ParcelaMedicao.jsx`: tabela dos itens do pedido (checkbox, descrição, NCM, CFOP, qtd editável com `max = quantidade`, valor da parcela recalculado na hora); botão "Auditar parcela" envia `{ medicaoId, parcela }`; resultado: por item a tabela `Tributo | Como deveria ser | Como está no pedido | Situação`, e rodapé com o total da parcela por tributo. Estados: carregando, erro com "Tentar novamente", vazio.

- [ ] **Step 4: Run** → PASS
- [ ] **Step 5: Commit** — "Fiscal: auditoria da medição por parcela — itens e quantidades escolhidos"

---

### Task 5: Tela enxuta — 4 abas + Administração

**Files:**
- Modify: `app/fiscal/inteligencia/InteligenciaFiscalClient.jsx:1378-1409`
- Create: `app/fiscal/inteligencia/ConsultaNcmCfop.jsx` (campo único: 8 dígitos → `AbaNcm`; 4 dígitos → `AbaCfop`; texto → busca de NCM)
- Test: `testes/fiscal-abas-inteligencia.teste.jsx`

**Interfaces:** Produces `ABAS_DIA_A_DIA = ["simulador","auditoria","consulta","assistente"]`, `ABAS_ADMIN = ["classificacoes","cadeia","regras","admin"]` (exportadas para o teste).

- [ ] **Step 1: Failing test** — renderiza com `ehAdmin=false`: vê exatamente "Simulador", "Auditoria de medição", "Consulta NCM/CFOP", "Assistente Fiscal" e **não** vê "Administração"; com `ehAdmin=true` vê também "Administração"; a aba ativa inicial é Simulador (componentes pesados mockados com `vi.mock`).
- [ ] **Step 2: Run** → FAIL
- [ ] **Step 3: Implement** — `ABAS` vira as 4 + `{ id: "administracao", rotulo: "Administração" }` só se `ehAdmin`; `useState("simulador")`; a aba Administração mostra um sub-seletor com as 4 antigas (renderizando os mesmos componentes de hoje).
- [ ] **Step 4: Run** → PASS; `npx eslint app/fiscal/inteligencia` sem erro.
- [ ] **Step 5: Commit** — "Fiscal: Inteligência com 4 abas do dia a dia; o resto em Administração (só ADMIN)"

---

### Task 6: Verificação, carga inicial e parecer do Codex

- [ ] `npx vitest run` (bateria inteira), `npm run checar`, `npm run build` — tudo verde.
- [ ] `npm run dev` + `node scripts/validar-tela.mjs ~/.config/torg/cred-teste.txt /fiscal/inteligencia saida.png` — sem erro de console/API; conferir Simulador com a OP-122 (tem receita) e Auditoria com uma medição não faturada.
- [ ] Carga inicial em produção (autorizada pelo Matheus em 26/09/2026: "pode seguir"): chamar a reconstrução (POST do botão) logado no localhost — grava `FiscalRegraIbsCbs` de 2026; conferir que NCM 94069020 / CFOP 6101 volta `UNICA` CBS 0,9 / IBS 0,1 (NF 943).
- [ ] Memória: `docs/memoria-claude/torg_fiscal_simples.md` + linha no `MEMORY.md`.
- [ ] `git pull --rebase`, push.
- [ ] **Pedir o parecer do Codex** (`python3 scripts/revisao-codex/consultar.py architecture --arquivo <pedido>` com o diff) quando o limite dele voltar (27/09 14h44); corrigir achados concretos direto (memória: sem pedir autorização).
