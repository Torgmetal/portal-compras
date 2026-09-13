// Veículos e índice de frete do simulador de carga — Planejamento › Configuração da expedição.
// GET devolve as linhas (padrão + gravado); PUT grava a lista inteira (uma linha só, id "padrao").
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { linhasDeConfiguracao } from "@/lib/carga/config-carga";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROLES = ["ADMIN", "PLANEJAMENTO", "EXPEDICAO"];
const negar = (e) => NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
const lerConfig = () => prisma.configCarga.findUnique({ where: { id: "padrao" } }).catch(() => null);

export async function GET() {
  try { await requireRole(ROLES); } catch (e) { return negar(e); }
  const cfg = await lerConfig();
  return NextResponse.json({ success: true, veiculos: linhasDeConfiguracao(cfg), atualizadoEm: cfg?.updatedAt || null });
}

const veiculo = z.object({
  chave: z.enum(["hr", "tresquartos", "toco", "truck", "carreta", "carreta14"]),
  nome: z.string().min(1).max(80),
  C: z.number().min(1000).max(30000), L: z.number().min(1000).max(3000), alturaUtil: z.number().min(500).max(4000),
  pesoMax: z.number().min(100).max(60000), assoalho: z.number().min(300).max(2000),
  frete: z.number().min(1).max(100000), ativo: z.boolean(),
});
const schema = z.object({ veiculos: z.array(veiculo).min(1).max(10) });

export async function PUT(req) {
  let user;
  try { user = await requireRole(ROLES); } catch (e) { return negar(e); }
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }
  const antes = await lerConfig();
  const frete = Object.fromEntries(body.veiculos.map((v) => [v.chave, v.frete]));
  const depois = await prisma.configCarga.upsert({ where: { id: "padrao" }, create: { id: "padrao", veiculos: body.veiculos, frete, atualizadoPorId: user.id }, update: { veiculos: body.veiculos, frete, atualizadoPorId: user.id, updatedAt: new Date() } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "CONFIG_CARGA_VEICULOS", entity: "ConfigCarga", entityId: "padrao", diff: { antes: antes ? { veiculos: antes.veiculos, frete: antes.frete } : null, depois: { veiculos: depois.veiculos, frete: depois.frete } } } }).catch(() => {});
  return NextResponse.json({ success: true, veiculos: linhasDeConfiguracao(depois), atualizadoEm: depois.updatedAt });
}
