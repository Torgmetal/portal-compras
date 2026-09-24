// POST → PDF do modelo de carga (separar por fase, formar volumes, montar por camada) de uma carga da
// simulação gravada. As fotos do 3D vêm no corpo (o 3D é desenhado no navegador); o resto sai do banco.
// ⚠ A TELA NÃO USA MAIS ESTA ROTA: o modal monta o PDF no navegador (lib/carga/modelo-carga-pdf roda lá),
// porque uma carga com várias camadas estoura os 4,5 MB de corpo da função na Vercel (14/09/2026).
// Fica como caminho de servidor para quem já tem as fotos e quer o PDF por API (limite de ~3 MB).
import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { dispArquivo } from "@/lib/arquivo-http";
import { gerarModeloCargaPDF } from "@/lib/carga/modelo-carga-pdf";
import { prefixoDaOp } from "@/lib/carga/classificar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP", "ENGENHARIA", "EXPEDICAO", "PRODUCAO"];
const imagem = z.string().max(600000).regex(/^data:image\/jpeg;base64,/).optional().nullable();
const schema = z.object({
  simulacaoId: z.string().optional(),
  indice: z.number().int().min(0).max(19).default(0),
  imagens: z.object({ full: z.object({ iso: imagem, lado: imagem, topo: imagem }).partial().optional(), camadas: z.array(z.object({ ci: z.number().int().min(0), iso: imagem, topo: imagem })), volumes: z.record(z.string(), imagem).optional() }).default({}),
});

export async function POST(req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const { id, previoId } = await params;
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }
  const op = await prisma.oP.findUnique({ where: { id }, select: { id: true, numero: true, cliente: true, obra: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  const previo = await prisma.romaneioPrevio.findFirst({ where: { id: previoId, opId: id }, select: { id: true, numero: true } });
  if (!previo) return NextResponse.json({ error: "Romaneio prévio não encontrado" }, { status: 404 });
  const sim = body.simulacaoId ? await prisma.cargaSimulada.findFirst({ where: { id: body.simulacaoId, romaneioPrevioId: previo.id } }) : await prisma.cargaSimulada.findFirst({ where: { romaneioPrevioId: previo.id }, orderBy: { createdAt: "desc" } });
  if (!sim) return NextResponse.json({ error: "Simule a carga antes de gerar o modelo." }, { status: 400 });
  const cargas = Array.isArray(sim.cargas) ? sim.cargas : [], carga = cargas[body.indice];
  if (!carga) return NextResponse.json({ error: "Carga não encontrada na simulação." }, { status: 404 });
  if (!(carga.versaoMontagem >= 6)) return NextResponse.json({error:"Simule de novo para verificar os apoios antes de gerar o PDF."}, {status:409});
  const estimadas = Array.isArray(sim.avisos?.estimadas) ? sim.avisos.estimadas.filter((e) => carga.itens?.some((u) => (u.membros || []).some((m) => m.marca === e.marca))) : [];
  let logo = null; try { logo = fs.readFileSync(path.join(process.cwd(), "public", "torg-logo-white.png")); } catch { logo = null; }
  const { bytes, filename } = await gerarModeloCargaPDF({ op, previo, carga, indice: body.indice, total: cargas.length, perfilNome: sim.perfilNome || sim.perfil, prefixo: prefixoDaOp(op.numero), imagens: body.imagens, estimadas, ajustes: sim.avisos?.ajustes || {}, logo });
  return new NextResponse(Buffer.from(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": dispArquivo(filename, "inline") } });
}
