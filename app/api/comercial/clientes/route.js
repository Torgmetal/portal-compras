// GET  /api/comercial/clientes?q=   — os clientes cadastrados (nome + dicionário de termos)
// POST /api/comercial/clientes      — { nome } cria o cadastro mínimo (com dicionário inicial se o nome é conhecido)
// PUT  /api/comercial/clientes      — { id, termos?, razaoSocial?, cnpj?, observacoes?, ativo? }
//
// Vitor (16/09/2026): "no caso dos clientes que pedem outras numerações (…) vamos deixar amarrado
// esses termos?" → não: o papel é fixo, a palavra é do cliente. Ver lib/referencias-cliente.js.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { clientePorNome } from "@/lib/referencias-op";
import { termosEfetivos, nomeClienteNormalizado } from "@/lib/referencias-cliente";

export const dynamic = "force-dynamic";
const ROLES = ["ADMIN", "COMERCIAL", "ENGENHARIA", "PLANEJAMENTO", "PCP", "QUALIDADE", "EXPEDICAO", "FISCAL", "FINANCEIRO"];
const ESCREVE = ["ADMIN", "COMERCIAL"];

const Termo = z.object({ rotulo: z.string().trim().max(40).optional(), exemplo: z.string().trim().max(80).optional(), ativo: z.boolean().optional() }).partial();
const Termos = z.object({ projeto: Termo.optional(), pedido: Termo.optional(), item: Termo.optional(), tag: Termo.optional() }).partial();

const auth = (e) => NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });

export async function GET(req) {
  try { await requireRole(ROLES); } catch (e) { return auth(e); }
  const q = String(new URL(req.url).searchParams.get("q") || "").trim();
  const clientes = await prisma.cliente.findMany({
    where: { ativo: true, ...(q ? { nome: { contains: q, mode: "insensitive" } } : {}) },
    orderBy: { nome: "asc" }, take: 300,
  });
  // ⚠ nomes que só existem nas OPs (sem cadastro ainda) também aparecem, para a tela de nova OP
  // sugerir o mesmo nome e não nascer "TMSA" e "TMSA Tecnologia…" como dois clientes
  const nomesOp = await prisma.oP.findMany({ where: { clienteId: null }, distinct: ["cliente"], select: { cliente: true }, orderBy: { cliente: "asc" } });
  const cadastrados = new Set(clientes.map((c) => nomeClienteNormalizado(c.nome).toUpperCase()));
  const semCadastro = nomesOp.map((o) => nomeClienteNormalizado(o.cliente)).filter((n) => n && !cadastrados.has(n.toUpperCase()));
  return NextResponse.json({
    clientes: clientes.map((c) => ({ ...c, termosEfetivos: termosEfetivos(c.termos) })),
    semCadastro: [...new Set(semCadastro)],
  });
}

export async function POST(req) {
  let user;
  try { user = await requireRole(ESCREVE); } catch (e) { return auth(e); }
  let b;
  try { b = z.object({ nome: z.string().trim().min(2).max(160), termos: Termos.optional() }).parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }
  const cliente = await clientePorNome(b.nome);
  const atualizado = b.termos ? await prisma.cliente.update({ where: { id: cliente.id }, data: { termos: b.termos } }) : cliente;
  await prisma.auditLog.create({ data: { userId: user.id, action: "CLIENTE_CADASTRADO", entity: "Cliente", entityId: cliente.id, diff: { nome: cliente.nome, termos: atualizado.termos } } }).catch(() => {});
  return NextResponse.json({ cliente: { ...atualizado, termosEfetivos: termosEfetivos(atualizado.termos) } });
}

export async function PUT(req) {
  let user;
  try { user = await requireRole(ESCREVE); } catch (e) { return auth(e); }
  let b;
  try {
    b = z.object({
      id: z.string().min(1), termos: Termos.optional(), razaoSocial: z.string().trim().max(200).nullable().optional(),
      cnpj: z.string().trim().max(20).nullable().optional(), observacoes: z.string().trim().max(2000).nullable().optional(), ativo: z.boolean().optional(),
    }).parse(await req.json());
  } catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }
  const antes = await prisma.cliente.findUnique({ where: { id: b.id } });
  if (!antes) return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  const { id, ...dados } = b;
  const cliente = await prisma.cliente.update({ where: { id }, data: dados });
  await prisma.auditLog.create({ data: { userId: user.id, action: "CLIENTE_EDITADO", entity: "Cliente", entityId: id, diff: { antes: { termos: antes.termos, razaoSocial: antes.razaoSocial, cnpj: antes.cnpj }, depois: dados } } }).catch(() => {});
  return NextResponse.json({ cliente: { ...cliente, termosEfetivos: termosEfetivos(cliente.termos) } });
}
