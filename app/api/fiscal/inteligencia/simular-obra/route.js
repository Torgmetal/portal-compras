// Simulador PELA OBRA: o imposto que o Comercial cadastrou (OPReceita) ao lado da regra do portal
// (TIPI, ICMS de referência, IBS/CBS das nossas NFs). Ver lib/fiscal/impostos-da-obra.js.
//   GET  ?opId=   → a obra e as suas linhas de receita
//   POST          → { opId, receitaId?, ncm, cfop, valor } → impostosDaObra(...)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAcesso } from "@/lib/session";
import { ipiDaTipi, ambitoDe, daEscolhaDoCfop } from "@/lib/fiscal/simulador";
import { estimarIcms } from "@/lib/fiscal/icms";
import { regraIbsCbs } from "@/lib/fiscal/coleta-ibs-cbs";
import { linhaDaReceita, impostosDaObra, ipiDaRegra } from "@/lib/fiscal/impostos-da-obra";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const negado = (e) => NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
const RECEITA = { id: true, descricao: true, cfop: true, valor: true, icmsPct: true, ipiPct: true, pisPct: true,
  cofinsPct: true, issPct: true, irrfPct: true, csllPct: true };

export async function GET(req) {
  try { await requireAcesso({ modulos: ["FISCAL", "FINANCEIRO"] }); } catch (e) { return negado(e); }
  const opId = new URL(req.url).searchParams.get("opId");
  if (!opId) return NextResponse.json({ success: false, error: "Informe a obra." }, { status: 400 });
  const op = await prisma.oP.findUnique({ where: { id: opId }, select: { id: true, numero: true, cliente: true, clienteUF: true,
    receitas: { select: RECEITA, orderBy: { ordem: "asc" } } } });
  if (!op) return NextResponse.json({ success: false, error: "Obra não encontrada." }, { status: 404 });
  return NextResponse.json({ success: true, obra: { id: op.id, numero: op.numero, cliente: op.cliente, uf: op.clienteUF },
    receitas: op.receitas.map(linhaDaReceita) });
}

const schema = z.object({
  opId: z.string().min(1).max(40),
  receitaId: z.string().max(40).optional().nullable(),
  ncm: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => v.length === 8, "Informe o NCM com 8 dígitos."),
  // ⚠ CFOP obrigatório: linha da obra sem CFOP não é motivo para adivinhar um.
  cfop: z.string().transform((v) => v.replace(/\D/g, "")).refine((v) => v.length === 4, "Escolha o CFOP."),
  valor: z.number().positive("Informe o valor."),
});

export async function POST(req) {
  try { await requireAcesso({ modulos: ["FISCAL", "FINANCEIRO"] }); } catch (e) { return negado(e); }
  let body;
  try { body = schema.parse(await req.json()); } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const op = await prisma.oP.findUnique({ where: { id: body.opId }, select: { numero: true, cliente: true, clienteUF: true } });
  if (!op) return NextResponse.json({ success: false, error: "Obra não encontrada." }, { status: 404 });

  let receita = null;
  if (body.receitaId) {
    // ⚠ A receita tem que ser DESTA obra — um id de outra obra traria o imposto de outro cliente.
    const r = await prisma.oPReceita.findFirst({ where: { id: body.receitaId, opId: body.opId }, select: RECEITA });
    if (!r) return NextResponse.json({ success: false, error: "Linha de receita não é desta obra." }, { status: 404 });
    receita = linhaDaReceita(r);
  }

  const versao = await prisma.fiscalTipiVersao.findFirst({ where: { status: "ATIVA" }, select: { id: true } });
  if (!versao) return NextResponse.json({ success: false, error: "Nenhuma versão da TIPI está ativa." }, { status: 409 });
  const linhas = await prisma.fiscalTipiLinha.findMany({ where: { versaoId: versao.id, nivel: "NCM", codigo: body.ncm } });
  const geral = linhas.find((l) => !l.ex) ?? null;
  const ipiRegra = ipiDaRegra(geral ? ipiDaTipi(geral, linhas.filter((l) => l.ex))
    : { determinado: false, motivo: `O NCM ${body.ncm} não existe na TIPI de referência.` });

  const ufOrigem = "SP";
  const cfopObj = daEscolhaDoCfop(body.cfop, ambitoDe(ufOrigem, op.clienteUF))?.cfop ?? null;
  const icmsRegra = estimarIcms(ufOrigem, op.clienteUF, body.valor, cfopObj);
  const ibsCbs = await regraIbsCbs({ ncm: body.ncm, cfop: body.cfop }, prisma);

  return NextResponse.json({ success: true, obra: { numero: op.numero, cliente: op.cliente, uf: op.clienteUF },
    ncm: body.ncm, cfop: body.cfop, valor: body.valor, descricaoNcm: geral?.descricaoCompleta ?? null,
    ibsCbs, ...impostosDaObra({ receita, valor: body.valor, ipiRegra, icmsRegra, ibsCbs }) });
}
