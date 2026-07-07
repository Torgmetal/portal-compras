// /api/comercial/custo-hora — configuração de custo-hora por setor (singleton).
//   GET → devolve a config (cria padrão na 1ª vez).
//   PUT → salva. Só ADMIN/COMERCIAL.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { z } from "zod";

export const runtime = "nodejs";
const ID = "default";

const DEFAULT_SETORES = [
  { id: "corte", nome: "Corte e furação", salarios: 0, headcount: 0, horasMes: 0, cifDireto: 0 },
  { id: "solda", nome: "Solda", salarios: 0, headcount: 0, horasMes: 0, cifDireto: 0 },
  { id: "jato", nome: "Jateamento", salarios: 0, headcount: 0, horasMes: 0, cifDireto: 0 },
  { id: "pintura", nome: "Pintura", salarios: 0, headcount: 0, horasMes: 0, cifDireto: 0 },
];

export async function GET() {
  try { await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let cfg = await prisma.configCustoHora.findUnique({ where: { id: ID } });
  if (!cfg) {
    cfg = await prisma.configCustoHora.create({
      data: { id: ID, fatorEncargos: 1.8, custoTotalMensal: 1500000, criterioRateio: "MOD", margemPct: 30, setores: DEFAULT_SETORES },
    });
  }
  return NextResponse.json({ success: true, config: cfg });
}

const setorSchema = z.object({
  id: z.string(),
  nome: z.string().max(120),
  salarios: z.number().nonnegative().default(0),
  headcount: z.number().nonnegative().default(0),
  horasMes: z.number().nonnegative().default(0),
  cifDireto: z.number().nonnegative().default(0),
});
const schema = z.object({
  fatorEncargos: z.number().min(1).max(3),
  custoTotalMensal: z.number().nonnegative().nullable().optional(),
  criterioRateio: z.enum(["MOD", "HEADCOUNT", "HORAS"]),
  margemPct: z.number().min(0).max(500),
  horasDia: z.number().min(1).max(24).default(8),
  diasUteis: z.number().min(1).max(31).default(22),
  ocupacaoPct: z.number().min(1).max(100).default(80),
  setores: z.array(setorSchema).max(50),
});

export async function PUT(req) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL"]); }
  catch (e) { return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Body inválido" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message }, { status: 400 });
  const d = parsed.data;
  const dados = { fatorEncargos: d.fatorEncargos, custoTotalMensal: d.custoTotalMensal ?? null, criterioRateio: d.criterioRateio, margemPct: d.margemPct, horasDia: d.horasDia, diasUteis: d.diasUteis, ocupacaoPct: d.ocupacaoPct, setores: d.setores, atualizadoPorNome: user.name || null };

  const cfg = await prisma.configCustoHora.upsert({ where: { id: ID }, update: dados, create: { id: ID, ...dados } });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "SALVAR_CUSTO_HORA", entity: "ConfigCustoHora", entityId: ID, diff: { custoTotalMensal: d.custoTotalMensal, fatorEncargos: d.fatorEncargos } },
  }).catch(() => {});
  return NextResponse.json({ success: true, config: cfg });
}
