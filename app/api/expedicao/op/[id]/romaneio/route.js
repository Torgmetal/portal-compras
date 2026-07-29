// POST /api/expedicao/op/[id]/romaneio
// Gera um romaneio da OP a partir das marcas montadas na "Lista Avançada".
// Número automático por OP (R1, R2, R3…). Cria Romaneio + itens no portal.
// (A geração do Excel FORM 22 + upload no SharePoint entra na Fase 3.)
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { syncExpedicaoProducao } from "@/lib/expedicao";
import { gerarRomaneioForm22 } from "@/lib/romaneio-form22";
import { salvarRomaneioNoServidor } from "@/lib/sharepoint-lista";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  data: z.string().optional(),
  destino: z.string().max(200).nullable().optional(),
  transportadora: z.string().max(200).nullable().optional(),
  motorista: z.string().max(200).nullable().optional(),
  placaVeiculo: z.string().max(20).nullable().optional(),
  contatoTransporte: z.string().max(100).nullable().optional(),
  observacao: z.string().max(2000).nullable().optional(),
  itens: z.array(z.object({
    marca: z.string().min(1),
    descricao: z.string().nullable().optional(),
    qtd: z.number().min(0),
    pesoKg: z.number().min(0).nullable().optional(),
  })).min(1, "Inclua ao menos uma marca na carga."),
});

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(["ADMIN", "EXPEDICAO", "PLANEJAMENTO", "PCP"]); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const op = await prisma.oP.findUnique({
    where: { id: params.id },
    select: {
      id: true, numero: true, cliente: true, obra: true, clienteRazaoSocial: true,
      clienteEndereco: true, clienteCidade: true, clienteUF: true, clienteCep: true,
      clienteCnpj: true, clienteIE: true, clienteContato: true, clienteEmail: true,
    },
  });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  // Próximo número R# da OP (maior número existente + 1).
  const existentes = await prisma.romaneio.findMany({ where: { opId: op.id }, select: { numero: true } });
  let max = 0;
  for (const r of existentes) { const m = String(r.numero || "").match(/(\d+)/); if (m) max = Math.max(max, parseInt(m[1], 10)); }
  const numero = `R${max + 1}`;

  const itens = body.itens.map((it) => ({
    tipo: "PECA",
    descricao: it.descricao ? `${it.marca} — ${it.descricao}` : it.marca,
    marca: it.marca,
    qtd: it.qtd,
    pesoKg: it.pesoKg ?? null,
  }));
  const pesoRealKg = Math.round(itens.reduce((s, it) => s + (it.pesoKg || 0), 0) * 100) / 100;
  const data = body.data ? new Date(body.data) : new Date();

  const created = await prisma.romaneio.create({
    data: {
      numero, opId: op.id, data, pesoRealKg,
      destino: body.destino?.trim() || null,
      transportadora: body.transportadora?.trim() || null,
      motorista: body.motorista?.trim() || null,
      placaVeiculo: body.placaVeiculo?.trim() || null,
      contatoTransporte: body.contatoTransporte?.trim() || null,
      observacao: body.observacao?.trim() || null,
      nfStatus: "PENDENTE",
      createdById: user.id,
      itens: { create: itens.map((it) => ({ tipo: it.tipo, descricao: it.descricao, qtd: it.qtd, pesoKg: it.pesoKg })) },
    },
  });

  await prisma.auditLog.create({
    data: { userId: user.id, action: "EXPEDICAO_GERAR_ROMANEIO", entity: "Romaneio", entityId: created.id, diff: { depois: { numero, opId: op.id, itens: itens.length, pesoRealKg } } },
  }).catch(() => {});

  try { await syncExpedicaoProducao(op.id, data); } catch (e) { console.error("syncExpedicaoProducao:", e.message); }

  // Gera o FORM 22 preenchido e salva na pasta 4.2 Romaneios da OP no SharePoint.
  // É o que fecha o loop do "expedido" (o portal lê essa pasta). Best-effort: se o
  // SharePoint falhar, o romaneio já está salvo no portal — devolve o erro pra UI.
  let sharepoint = null;
  try {
    const buf = await gerarRomaneioForm22({ op, romaneio: { ...created, numero, data }, itens: body.itens });
    const cli = (op.cliente || "").slice(0, 40).trim();
    const fileNome = `Romaneio ${numero} - OP-${op.numero}${cli ? ` - ${cli}` : ""}.xlsx`;
    const r = await salvarRomaneioNoServidor({ opNumero: op.numero, fileNome, buffer: buf });
    sharepoint = { ok: true, nome: r.nome, caminho: r.caminho, webUrl: r.webUrl };
  } catch (e) {
    console.error("[romaneio] FORM22/SharePoint:", e?.message);
    sharepoint = { ok: false, erro: e?.message || "Falha ao salvar no SharePoint." };
  }

  return NextResponse.json({ success: true, id: created.id, numero, sharepoint });
}
