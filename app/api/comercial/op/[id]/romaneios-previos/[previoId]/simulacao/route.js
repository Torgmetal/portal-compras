// Simulação de carga de um romaneio prévio.
// GET  → a lista para simular (marca, descrição, quantidade, kg por peça), o perfil de embalagem da LQC
//        da obra e a última simulação gravada (com aviso de desatualizada se o romaneio mudou).
// POST → grava a simulação feita no navegador (o motor roda lá: o IFC já está no navegador, e a Vercel
//        não teria tempo). Só o resultado vem: volumes posicionados, passos, madeira — sem as malhas.
//
// Vitor (12/09/2026): "pode ser o romaneio prévio gerado pelo planejamento" — a lista é o romaneio;
// o motor não sabe a lógica de prioridade de cada obra.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { hashItens } from "@/lib/carga/hash-itens";
import { PERFIS, perfilDaLqc } from "@/lib/carga/premissas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ROLES = ["ADMIN", "COMERCIAL", "PLANEJAMENTO", "PCP", "ENGENHARIA", "EXPEDICAO", "PRODUCAO"];
const negar = (e) => NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });

async function carregar(id, previoId) {
  const op = await prisma.oP.findUnique({ where: { id }, select: { id: true, numero: true, cliente: true, obra: true } });
  if (!op) return { erro: NextResponse.json({ error: "OP não encontrada" }, { status: 404 }) };
  const previo = await prisma.romaneioPrevio.findFirst({ where: { id: previoId, opId: id }, select: { id: true, numero: true, status: true, itens: true, pesoKg: true, dataPrevista: true } });
  if (!previo) return { erro: NextResponse.json({ error: "Romaneio prévio não encontrado" }, { status: 404 }) };
  return { op, previo };
}

export async function GET(_req, { params }) {
  try { await requireRole(ROLES); } catch (e) { return negar(e); }
  const { id, previoId } = await params;
  const { op, previo, erro } = await carregar(id, previoId); if (erro) return erro;
  const itens = Array.isArray(previo.itens) ? previo.itens : [];
  // ⚠ kg por peça = pesoTotal ÷ qte do próprio romaneio (o que a Expedição vai pesar), não o cadastro
  const lista = itens.map((i) => ({ marca: String(i.marca || "").toUpperCase(), desc: i.descricao || "", qtd: Math.max(1, Number(i.qte) || 1), kgUn: Number(i.pesoTotal) > 0 ? Number(i.pesoTotal) / Math.max(1, Number(i.qte) || 1) : 0 }));
  // nível de embalagem da LQC da obra → perfil do simulador
  const estudo = await prisma.estudoFabricacao.findFirst({ where: { orcamento: { opId: op.id } }, orderBy: { updatedAt: "desc" }, select: { cenario: true } }).catch(() => null);
  const perfilLqc = perfilDaLqc(estudo?.cenario?.embalagem?.nivel);
  const ultima = await prisma.cargaSimulada.findFirst({ where: { romaneioPrevioId: previo.id }, orderBy: { createdAt: "desc" } });
  const hash = hashItens(itens);
  return NextResponse.json({ success: true, op, previo: { id: previo.id, numero: previo.numero, status: previo.status, pesoKg: previo.pesoKg, dataPrevista: previo.dataPrevista }, lista, hash,
    perfilPadrao: perfilLqc.chave, perfis: Object.values(PERFIS).map((p) => ({ chave: p.chave, nome: p.nome, resumo: p.resumo })),
    simulacao: ultima ? { ...ultima, desatualizada: ultima.itensHash !== hash } : null });
}

const schema = z.object({
  perfil: z.string().min(1).max(40),
  itensHash: z.string().max(40),
  resumo: z.record(z.string(), z.any()),
  cargas: z.array(z.record(z.string(), z.any())).max(20),
  avisos: z.record(z.string(), z.any()).optional(),
});

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(ROLES.filter((r) => r !== "PRODUCAO")); } catch (e) { return negar(e); }
  const { id, previoId } = await params;
  const { op, previo, erro } = await carregar(id, previoId); if (erro) return erro;
  let body;
  try { body = schema.parse(await req.json()); } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }
  const perfil = PERFIS[body.perfil]; if (!perfil) return NextResponse.json({ error: "Perfil de embalagem desconhecido" }, { status: 400 });
  const sim = await prisma.cargaSimulada.create({ data: { opId: op.id, romaneioPrevioId: previo.id, perfil: perfil.chave, perfilNome: perfil.nome, itensHash: body.itensHash, resumo: body.resumo, cargas: body.cargas, avisos: body.avisos || {}, criadoPorId: user.id } });
  await prisma.auditLog.create({ data: { userId: user.id, action: "SIMULAR_CARGA_ROMANEIO_PREVIO", entity: "CargaSimulada", entityId: sim.id, diff: { opNumero: op.numero, romaneioPrevio: previo.numero, perfil: perfil.chave, viagens: body.resumo?.viagens, volumes: body.resumo?.volumes, peso: body.resumo?.peso } } }).catch(() => {});
  return NextResponse.json({ success: true, simulacao: { ...sim, desatualizada: sim.itensHash !== hashItens(previo.itens) } });
}
