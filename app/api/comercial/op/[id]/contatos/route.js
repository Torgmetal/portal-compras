// PATCH /api/comercial/op/[id]/contatos — os ACESSOS de cada contato do cliente no login dele.
//   body: { acessos: [{ email, papeis: ["FATURAMENTO"] }] }
//
// Vitor (16/09/2026): "nem todos devem ter acesso a essa área". O papel FATURAMENTO libera a aba
// "Pedidos e faturamento" — por pessoa, por obra, marcado pela Torg. Só o papel muda aqui: nome,
// função, telefone e e-mail continuam como estão (a tela de contatos cuida deles).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { PAPEIS_CONTATO } from "@/lib/cliente-faturamento";
import { atualizarContatosCliente } from "@/lib/contatos-cliente";

export const runtime = "nodejs";
const PAPEIS = PAPEIS_CONTATO.map((p) => p.valor);
const schema = z.object({ acessos: z.array(z.object({ email: z.string().trim().min(3), papeis: z.array(z.enum(PAPEIS)).default([]) })).max(100) });
const norm = (e) => String(e || "").trim().toLowerCase();

export async function PATCH(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true, clienteContatos: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });
  const pedidos = new Map(body.acessos.map((a) => [norm(a.email), [...new Set(a.papeis)]]));
  const contatos = (Array.isArray(op.clienteContatos) ? op.clienteContatos : []).map((c) => {
    const em = norm(c?.email);
    if (!pedidos.has(em)) return c;
    const papeis = pedidos.get(em);
    const { papeis: _antigos, ...resto } = c;
    return papeis.length ? { ...resto, papeis } : resto;
  });
  await prisma.oP.update({ where: { id: op.id }, data: { clienteContatos: contatos } });
  const comFat = (lista) => (Array.isArray(lista) ? lista : []).filter((c) => (c?.papeis || []).includes("FATURAMENTO")).map((c) => norm(c.email));
  await prisma.auditLog.create({
    data: { userId: user.id, action: "ACESSOS_CLIENTE_OP", entity: "OP", entityId: op.id, diff: { opNumero: op.numero, antes: comFat(op.clienteContatos), depois: comFat(contatos) } },
  }).catch(() => {});
  return NextResponse.json({ success: true, contatos });
}

// PUT — a LISTA de contatos do cliente (nome, função, e-mail, telefones), editada na própria OP.
//
// Vitor (21/09/2026), na OP-122 com 12 contatos da TMSA: "eu não consigo adicionar novos e-mails".
// Até aqui a aba Obra só MOSTRAVA a lista: contato novo entrava pelo envio do cronograma ou dos
// planos, e quem queria só dar acesso ao portal a mais uma pessoa não tinha por onde. É o contato
// que liga a obra ao login do cliente (`/api/cliente/meu-espaco`), então esta é a porta de entrada.
//
// ⚠ Lista COMPLETA, como a tela mostra: quem não vier, sai. `emailAnterior` corrige um e-mail sem
// perder papéis e restrições de quem já estava (regra em lib/contatos-cliente.js). Os acessos
// (papéis) continuam no PATCH acima — aqui a agenda, lá a permissão.
const contatoSchema = z.object({
  nome: z.string().trim().max(200).optional().nullable(),
  email: z.string().trim().email("E-mail inválido"),
  emailAnterior: z.string().trim().email().optional(),
  funcao: z.string().trim().max(120).optional().nullable(),
  telefone: z.string().trim().max(40).optional().nullable(),
  celular: z.string().trim().max(40).optional().nullable(),
});
const listaSchema = z.object({ contatos: z.array(contatoSchema).max(100) });

export async function PUT(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "COMERCIAL", "PLANEJAMENTO"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  let body;
  try { body = listaSchema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }
  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true, clienteContatos: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  const contatos = atualizarContatosCliente(op.clienteContatos, body.contatos);
  await prisma.oP.update({ where: { id: op.id }, data: { clienteContatos: contatos } });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "EDITAR_CONTATOS_CLIENTE", entity: "OP", entityId: op.id, diff: { opNumero: op.numero, antes: op.clienteContatos, depois: contatos } },
  }).catch(() => {});
  return NextResponse.json({ success: true, contatos });
}
