// /api/rh/holerite
//   GET  ?competencia=AAAA-MM  → lista holerites da competência (+ status) e as
//                                competências já existentes. Sem filtro: só as
//                                competências (p/ o seletor).
//   POST  { competencia, empresa?, cnpj?, arquivoOriginalUrl?, itens[] }
//         → cria o LoteHolerite e os Holerite (1 por funcionário), status PENDENTE.
// Só ADMIN/RH.
import { NextResponse } from "next/server";
import { prisma, prismaDirect } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const itemSchema = z.object({
  funcionarioId: z.string().min(1),
  arquivoUrl: z.string().url(), // agora = PDF completo do lote (mesma URL p/ todos)
  pagina: z.number().int().optional().nullable(), // página deste holerite dentro do PDF completo
  arquivoNome: z.string().optional().nullable(),
  arquivoTamanho: z.number().int().optional().nullable(),
  tipo: z.enum(["MENSAL", "DECIMO_TERCEIRO", "FERIAS", "RESCISAO"]).default("MENSAL"),
  empresa: z.string().optional().nullable(),
  valorLiquido: z.preprocess((v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v)), z.number().nullable()).default(null), // parse best-effort pode vir NaN (layout VMI) → null
});

const schema = z.object({
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Competência deve ser AAAA-MM"),
  empresa: z.string().optional().nullable(),
  cnpj: z.string().optional().nullable(),
  arquivoOriginalUrl: z.string().url().optional().nullable(),
  arquivoOriginalNome: z.string().optional().nullable(),
  itens: z.array(itemSchema).min(1, "Inclua ao menos um holerite"),
});

export async function GET(req) {
  try {
    await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const competencia = new URL(req.url).searchParams.get("competencia");

  // Competências existentes (distinct) — p/ o seletor
  const grupos = await prisma.holerite.groupBy({ by: ["competencia"], _count: true, orderBy: { competencia: "desc" } });
  const competencias = grupos.map((g) => ({ competencia: g.competencia, total: g._count }));

  if (!competencia) return NextResponse.json({ success: true, competencias, holerites: [] });

  const holerites = await prisma.holerite.findMany({
    where: { competencia },
    orderBy: { funcionario: { nome: "asc" } },
    select: {
      id: true, competencia: true, empresa: true, tipo: true, status: true,
      valorLiquido: true, arquivoNome: true, enviadoEm: true, visualizadoEm: true, confirmadoEm: true,
      funcionario: {
        select: { id: true, nome: true, email: true, telefone: true, matricula: true, usuario: { select: { id: true } } },
      },
    },
  });

  return NextResponse.json({ success: true, competencias, holerites });
}

// ─── Escrita em massa dos holerites (padrão CLAUDE.md p/ bulk write) ──────────
// Um único INSERT ... ON CONFLICT via UNNEST, na conexão DIRETA (sem pooler).
// Antes eram N upserts sequenciais numa transação interativa sobre o pooler —
// p/ lotes grandes (VMI ~52) isso estourava (MessageContext/Neon OOM) e a rota,
// sem try/catch, devolvia 500 de corpo vazio ("servidor demorou demais").
const SQL_UPSERT_HOLERITE = `
  INSERT INTO "Holerite" (
    "id","funcionarioId","loteId","competencia","tipo","empresa","valorLiquido",
    "arquivoUrl","arquivoNome","arquivoTamanho","pagina","status","createdAt","updatedAt"
  )
  SELECT gen_random_uuid()::text, t.*, 'PENDENTE', NOW(), NOW()
  FROM UNNEST(
    $1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::float8[],
    $7::text[],$8::text[],$9::int[],$10::int[]
  ) AS t("funcionarioId","loteId","competencia","tipo","empresa","valorLiquido","arquivoUrl","arquivoNome","arquivoTamanho","pagina")
  ON CONFLICT ("funcionarioId","competencia","tipo") DO UPDATE SET
    "loteId"         = EXCLUDED."loteId",
    "empresa"        = EXCLUDED."empresa",
    "valorLiquido"   = EXCLUDED."valorLiquido",
    "arquivoUrl"     = EXCLUDED."arquivoUrl",
    "arquivoNome"    = EXCLUDED."arquivoNome",
    "arquivoTamanho" = EXCLUDED."arquivoTamanho",
    "pagina"         = EXCLUDED."pagina",
    "updatedAt"      = NOW()
`;

// Cada parâmetro é um LITERAL de array Postgres em TEXTO ('{"a","b",NULL}') com
// cast ::tipo[] no SQL — evita o erro "improper binary format" do Prisma.
const litElH = (e) => e == null ? "NULL" : `"${String(e).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const pgArrH = (arr) => `{${arr.map(litElH).join(",")}}`;
const intOuNull = (v) => (v == null || !Number.isFinite(Number(v))) ? null : Math.trunc(Number(v));
const floatOuNull = (v) => (v == null || !Number.isFinite(Number(v))) ? null : Number(v);

function paramsHolerite(linhas) {
  return [
    pgArrH(linhas.map((l) => l.funcionarioId)),
    pgArrH(linhas.map((l) => l.loteId)),
    pgArrH(linhas.map((l) => l.competencia)),
    pgArrH(linhas.map((l) => l.tipo)),
    pgArrH(linhas.map((l) => l.empresa)),
    pgArrH(linhas.map((l) => floatOuNull(l.valorLiquido))),
    pgArrH(linhas.map((l) => l.arquivoUrl)),
    pgArrH(linhas.map((l) => l.arquivoNome)),
    pgArrH(linhas.map((l) => intOuNull(l.arquivoTamanho))),
    pgArrH(linhas.map((l) => intOuNull(l.pagina))),
  ];
}

const ehOOM = (e) => /53200|out of memory/i.test(e?.message || "");

// Escrita resiliente: se o Neon estourar memória, divide o lote e tenta de novo.
async function upsertHoleritesEmMassa(linhas) {
  if (linhas.length === 0) return;
  try {
    await prismaDirect.$executeRawUnsafe(SQL_UPSERT_HOLERITE, ...paramsHolerite(linhas));
  } catch (e) {
    if (ehOOM(e) && linhas.length > 1) {
      const meio = Math.ceil(linhas.length / 2);
      await upsertHoleritesEmMassa(linhas.slice(0, meio));
      await upsertHoleritesEmMassa(linhas.slice(meio));
      return;
    }
    throw e;
  }
}

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  const { competencia, empresa, cnpj, arquivoOriginalUrl, arquivoOriginalNome, itens } = parsed.data;

  // Não permitir o mesmo funcionário 2x no mesmo lote+tipo
  const chaves = itens.map((i) => `${i.funcionarioId}|${i.tipo}`);
  if (new Set(chaves).size !== chaves.length) {
    return NextResponse.json({ success: false, error: "Há funcionários repetidos (mesmo tipo) no lote" }, { status: 400 });
  }

  // Cria o lote (1 linha) e grava todos os holerites num único statement em massa
  // (reimportar a mesma competência/tipo substitui o arquivo via ON CONFLICT,
  // preservando status/ciência já existentes). Com try/catch para não devolver
  // 500 opaco (que aparecia como "servidor demorou demais").
  let lote;
  try {
    lote = await prismaDirect.loteHolerite.create({
      data: {
        competencia, empresa: empresa || null, cnpj: cnpj || null,
        arquivoOriginalUrl: arquivoOriginalUrl || null, arquivoOriginalNome: arquivoOriginalNome || null,
        totalPaginas: itens.length, criadoPorId: user.id,
      },
    });
    const linhas = itens.map((it) => ({
      funcionarioId: it.funcionarioId,
      loteId: lote.id,
      competencia,
      tipo: it.tipo,
      empresa: it.empresa || empresa || null,
      valorLiquido: it.valorLiquido ?? null,
      arquivoUrl: it.arquivoUrl,
      arquivoNome: it.arquivoNome || null,
      arquivoTamanho: it.arquivoTamanho ?? null,
      pagina: it.pagina ?? null,
    }));
    await upsertHoleritesEmMassa(linhas);
  } catch (e) {
    return NextResponse.json({ success: false, error: `Não foi possível salvar os holerites: ${e?.message || "erro desconhecido"}` }, { status: 500 });
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: "IMPORTAR_HOLERITE_LOTE", entity: "LoteHolerite", entityId: lote.id, diff: { competencia, total: itens.length } },
  }).catch(() => {});

  return NextResponse.json({ success: true, loteId: lote.id, total: itens.length });
}

// DELETE /api/rh/holerite?competencia=AAAA-MM
// Cancela a importação de uma competência (apaga holerites + lotes) p/ reimportar.
// Bloqueia se algum holerite já foi CONFIRMADO (ciência do funcionário — não perder o registro).
export async function DELETE(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "RH"]);
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const competencia = new URL(req.url).searchParams.get("competencia");
  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
    return NextResponse.json({ success: false, error: "Informe a competência (AAAA-MM)" }, { status: 400 });
  }

  const confirmados = await prisma.holerite.count({ where: { competencia, status: "CONFIRMADO" } });
  if (confirmados > 0) {
    return NextResponse.json({ success: false, error: `${confirmados} holerite(s) já confirmados pelo funcionário — não é possível excluir a competência.` }, { status: 409 });
  }

  const del = await prisma.holerite.deleteMany({ where: { competencia } });
  await prisma.loteHolerite.deleteMany({ where: { competencia } });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "CANCELAR_HOLERITE_IMPORTACAO", entity: "Holerite", entityId: competencia, diff: { competencia, apagados: del.count } },
  }).catch(() => {});

  return NextResponse.json({ success: true, apagados: del.count });
}
