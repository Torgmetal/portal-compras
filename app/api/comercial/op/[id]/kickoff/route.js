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
  escopoIncluso:       z.string().max(10000).optional().nullable(),
  escopoExcluso:       z.string().max(10000).optional().nullable(),
  pontosAtencao:       z.string().max(10000).optional().nullable(),
  observacoes:         z.string().max(5000).optional().nullable(),
  dataEntregaAcordada: z.string().optional().nullable(),
  cronograma:          z.array(z.object({ fase: z.string().max(120), data: z.string().max(10).nullable().optional(), obs: z.string().max(300).optional().nullable() })).max(30).optional().nullable(),
  prioridades:         z.array(z.object({ ordem: z.number().int().min(1).max(99), descricao: z.string().max(300), data: z.string().max(10).nullable().optional() })).max(30).optional().nullable(),
  pesoResumo:          z.array(z.object({ descricao: z.string().max(200), qtd: z.number().nullable().optional(), pesoKg: z.number().nullable().optional() })).max(60).optional().nullable(),
  propostaPdfUrl:      z.string().url().optional().nullable(),
  propostaPdfNome:     z.string().max(300).optional().nullable(),
  propostaTecnicaPdfUrl:  z.string().url().optional().nullable(),
  propostaTecnicaPdfNome: z.string().max(300).optional().nullable(),
  pinturaPlpUrl:       z.string().url().optional().nullable(),
  pinturaPlpNome:      z.string().max(300).optional().nullable(),
  inspecaoArquivoUrl:  z.string().url().optional().nullable(),
  inspecaoArquivoNome: z.string().max(300).optional().nullable(),
  tipoFaturamento:     z.string().max(500).optional().nullable(),
  faturamentoEventos:  z.array(z.object({
    descricao:      z.string().max(200),
    percentual:     z.number().min(0).max(100).nullable().optional(),
    valor:          z.number().min(0).nullable().optional(),
    prazoPagamento: z.string().max(120).nullable().optional(),
    medicao:        z.string().max(80).nullable().optional(),
    obsNF:          z.string().max(500).nullable().optional(),
  })).max(40).optional().nullable(),
  retencaoContratual:  z.string().max(500).optional().nullable(),
  segurosObrigatorios: z.string().max(1000).optional().nullable(),
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
      kickoff: { include: { aceites: { orderBy: { enviadoEm: "desc" }, take: 100 } } },
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
              // Lista de materiais da planilha comercial (resumo de pesos, sem R$)
              itensPerso: {
                select: { tipoMaterial: true, descricao: true, quantidade: true, pesoTotal: true },
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

  // Resumo de pesos sugerido (agrupado por tipo de material — sem valores R$)
  let pesoResumoSugerido = null;
  if (estudo?.itensPerso?.length) {
    const porTipo = new Map();
    for (const it of estudo.itensPerso) {
      const k = String(it.tipoMaterial || "OUTRO");
      const cur = porTipo.get(k) || { descricao: k.replace(/_/g, " "), qtd: 0, pesoKg: 0 };
      cur.qtd += Number(it.quantidade) || 0;
      cur.pesoKg += Number(it.pesoTotal) || 0;
      porTipo.set(k, cur);
    }
    pesoResumoSugerido = [...porTipo.values()]
      .map((r) => ({ ...r, pesoKg: Math.round(r.pesoKg * 100) / 100 }))
      .sort((a, b) => b.pesoKg - a.pesoKg);
  }

  // Orçamentos candidatos a vínculo (quando a OP ainda não tem nenhum):
  // primeiro os do mesmo cliente, depois os demais fechados sem OP.
  let orcamentosCandidatos = [];
  if (!op.orcamentos?.length) {
    const cands = await prisma.orcamento.findMany({
      where: { opId: null, status: { in: ["FECHADA", "EM_NEGOCIACAO"] } },
      select: { id: true, numero: true, cliente: true, obra: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 60,
    });
    const cli = (op.cliente || "").toLowerCase();
    orcamentosCandidatos = cands
      .sort((a, b) => {
        const am = (a.cliente || "").toLowerCase().includes(cli) || cli.includes((a.cliente || "").toLowerCase()) ? 0 : 1;
        const bm = (b.cliente || "").toLowerCase().includes(cli) || cli.includes((b.cliente || "").toLowerCase()) ? 0 : 1;
        return am - bm;
      })
      .slice(0, 25);
  }

  const { kickoff, orcamentos, ...opData } = op;
  return NextResponse.json({
    op: opData,
    kickoff,
    orcamentosCandidatos,
    sugestoes: {
      pintura: pinturaSugerida,
      pesoResumo: pesoResumoSugerido,
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

  for (const campo of ["propostaPdfUrl", "propostaTecnicaPdfUrl", "pinturaPlpUrl", "inspecaoArquivoUrl"]) {
    if (body[campo] && !isBlobUrlSegura(body[campo])) {
      return NextResponse.json({ error: `URL de arquivo inválida (${campo}).` }, { status: 400 });
    }
  }

  const data = {};
  for (const k of ["pedidoCompraCliente", "entregaEndereco", "frete", "padraoPintura", "inspecao",
    "notaRetornoObs", "fiscalObservacao", "escopo", "escopoIncluso", "escopoExcluso",
    "pontosAtencao", "observacoes", "propostaPdfUrl", "propostaPdfNome",
    "propostaTecnicaPdfUrl", "propostaTecnicaPdfNome", "pinturaPlpUrl", "pinturaPlpNome",
    "inspecaoArquivoUrl", "inspecaoArquivoNome", "tipoFaturamento",
    "retencaoContratual", "segurosObrigatorios"]) {
    if (body[k] !== undefined) data[k] = body[k] || null;
  }
  if (body.notaRetorno !== undefined) data.notaRetorno = body.notaRetorno;
  if (body.extraidoIA !== undefined) data.extraidoIA = body.extraidoIA;
  for (const k of ["cronograma", "prioridades", "pesoResumo", "faturamentoEventos"]) {
    if (body[k] !== undefined) data[k] = body[k] ?? null;
  }
  for (const k of ["kickoffComercialEm", "kickoffSetoresEm", "dataEntregaAcordada"]) {
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
