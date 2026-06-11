// GET  /api/comercial/op/[id]/kickoff — kickoff salvo + dados derivados da
//      OP/orçamento/estudo para pré-preencher (pintura, itens FD, cliente).
// PUT  — cria/atualiza o kickoff (upsert).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { isBlobUrlSegura } from "@/lib/blob-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const putSchema = z.object({
  pedidoCompraCliente: z.string().max(200).optional().nullable(),
  entregaEndereco:     z.string().max(2000).optional().nullable(),
  frete:               z.enum(["TORG", "CLIENTE"]).optional().nullable(),
  padraoPintura:       z.string().max(5000).optional().nullable(),
  inspecao:            z.string().max(5000).optional().nullable(),
  notaRetorno:         z.boolean().optional(),
  notaRetornoObs:      z.string().max(2000).optional().nullable(),
  fiscalObservacao:    z.string().max(5000).optional().nullable(),
  escopo:              z.string().max(20000).optional().nullable(),
  pontosAtencao:       z.string().max(10000).optional().nullable(),
  observacoes:         z.string().max(5000).optional().nullable(),
  propostaPdfUrl:      z.string().url().optional().nullable(),
  propostaPdfNome:     z.string().max(300).optional().nullable(),
  extraidoIA:          z.any().optional(),
  kickoffComercialEm:  z.string().optional().nullable(),
  kickoffSetoresEm:    z.string().optional().nullable(),
});

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  const op = await prisma.oP.findUnique({
    where: { id: params.id },
    select: {
      id: true, numero: true, cliente: true, obra: true, descricao: true,
      dataInicio: true, dataFimPrevista: true, valorTotalContrato: true,
      clienteRazaoSocial: true, clienteCnpj: true, clienteIE: true,
      clienteEndereco: true, clienteCidade: true, clienteUF: true, clienteCep: true,
      clienteContato: true, clienteEmail: true, clienteTelefone: true,
      itens: {
        select: { id: true, descricao: true, categoria: true, valorVerba: true, faturamentoDireto: true, tipo: true },
        orderBy: { categoria: "asc" },
      },
      aditivos: {
        select: { numero: true, itens: { select: { id: true, descricao: true, categoria: true, valorVerba: true, faturamentoDireto: true } } },
      },
      kickoff: true,
      // Orçamento/estudo vinculado (quando existir) — fonte da pintura e escopo
      orcamentos: {
        select: {
          numero: true, responsavel: true, vendedor: true, tipoVenda: true, prazoEntrega: true,
          estudos: {
            orderBy: { revisao: "desc" }, take: 1,
            select: {
              revisao: true, pesoTotal: true, areaTotal: true, tipoObra: true, observacoes: true,
              esquemaPintura: true, esquemaPinturaDesc: true, esquemaPinturaEspessura: true,
              itensPintura: {
                select: { etapa: true, tipoPintura: true, descricao: true, demaos: true, espessuraMicra: true, cor: true, norma: true, metodoAplicacao: true, tintaProduto: { select: { nome: true, fabricante: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  // Sugestão de padrão de pintura a partir do estudo (quando vinculado)
  const estudo = op.orcamentos?.[0]?.estudos?.[0] || null;
  let pinturaSugerida = null;
  if (estudo) {
    const partes = [];
    if (estudo.esquemaPintura) partes.push(`Esquema: ${estudo.esquemaPintura}${estudo.esquemaPinturaDesc ? ` — ${estudo.esquemaPinturaDesc}` : ""}${estudo.esquemaPinturaEspessura ? ` (${estudo.esquemaPinturaEspessura} µm)` : ""}`);
    for (const c of estudo.itensPintura || []) {
      const linha = [
        c.etapa && `[${c.etapa}]`,
        c.tipoPintura,
        c.tintaProduto?.nome && `${c.tintaProduto.nome}${c.tintaProduto.fabricante ? ` (${c.tintaProduto.fabricante})` : ""}`,
        c.demaos && `${c.demaos} demão(s)`,
        c.espessuraMicra && `${c.espessuraMicra} µm`,
        c.cor && `cor ${c.cor}`,
        c.norma,
      ].filter(Boolean).join(" · ");
      if (linha) partes.push(linha);
    }
    pinturaSugerida = partes.join("\n") || null;
  }

  const { kickoff, orcamentos, ...opData } = op;
  return NextResponse.json({
    op: opData,
    kickoff,
    sugestoes: {
      pintura: pinturaSugerida,
      orcamento: op.orcamentos?.[0] ? {
        numero: op.orcamentos[0].numero,
        responsavel: op.orcamentos[0].responsavel,
        vendedor: op.orcamentos[0].vendedor,
        tipoVenda: op.orcamentos[0].tipoVenda,
        prazoEntrega: op.orcamentos[0].prazoEntrega,
        escopoObs: estudo?.observacoes || null,
        pesoTotal: estudo?.pesoTotal || null,
        areaTotal: estudo?.areaTotal || null,
        tipoObra: estudo?.tipoObra || null,
      } : null,
    },
  });
}

export async function PUT(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try { body = putSchema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  const op = await prisma.oP.findUnique({ where: { id: params.id }, select: { id: true, numero: true } });
  if (!op) return NextResponse.json({ error: "OP não encontrada" }, { status: 404 });

  if (body.propostaPdfUrl && !isBlobUrlSegura(body.propostaPdfUrl)) {
    return NextResponse.json({ error: "URL do PDF inválida." }, { status: 400 });
  }

  const data = {};
  for (const k of ["pedidoCompraCliente", "entregaEndereco", "frete", "padraoPintura", "inspecao",
    "notaRetornoObs", "fiscalObservacao", "escopo", "pontosAtencao", "observacoes",
    "propostaPdfUrl", "propostaPdfNome"]) {
    if (body[k] !== undefined) data[k] = body[k] || null;
  }
  if (body.notaRetorno !== undefined) data.notaRetorno = body.notaRetorno;
  if (body.extraidoIA !== undefined) data.extraidoIA = body.extraidoIA;
  for (const k of ["kickoffComercialEm", "kickoffSetoresEm"]) {
    if (body[k] !== undefined) data[k] = body[k] ? new Date(body[k]) : null;
  }

  const kickoff = await prisma.oPKickOff.upsert({
    where: { opId: op.id },
    create: { opId: op.id, createdById: user.id, ...data },
    update: data,
  });

  await prisma.auditLog.create({
    data: {
      userId: user.id, action: "SALVAR_KICKOFF", entity: "OPKickOff", entityId: kickoff.id,
      diff: { opNumero: op.numero, campos: Object.keys(data) },
    },
  }).catch(() => {});

  return NextResponse.json({ success: true, kickoff });
}
