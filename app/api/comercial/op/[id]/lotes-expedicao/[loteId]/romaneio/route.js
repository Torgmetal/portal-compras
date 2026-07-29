// POST /api/comercial/op/[id]/lotes-expedicao/[loteId]/romaneio
// Gera o FORM 22 do romaneio a partir do romaneio prévio do lote (marcas + peso),
// com os dados do transportador, salva na pasta 4.2 Romaneios da OP no SharePoint
// e devolve o arquivo (base64) pra download.
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { gerarRomaneioForm22 } from "@/lib/romaneio-form22";
import { salvarRomaneioNoServidor } from "@/lib/sharepoint-lista";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  transportadora: z.string().max(200).nullable().optional(),
  motorista: z.string().max(200).nullable().optional(),
  placa: z.string().max(20).nullable().optional(),
  contato: z.string().max(100).nullable().optional(),
  data: z.string().nullable().optional(),
});

export async function POST(req, { params }) {
  try {
    await requireRole(["ADMIN", "EXPEDICAO", "COMERCIAL", "PLANEJAMENTO", "PCP", "ENGENHARIA"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

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

  // Marcas vêm do romaneio prévio (mais recente) vinculado ao lote.
  const previo = await prisma.romaneioPrevio.findFirst({
    where: { opId: op.id, loteId: params.loteId },
    orderBy: { numero: "desc" },
  });
  if (!previo) return NextResponse.json({ error: "Este lote não tem romaneio prévio com marcas." }, { status: 400 });
  const marcas = Array.isArray(previo.itens) ? previo.itens : [];
  if (!marcas.length) return NextResponse.json({ error: "O romaneio prévio está sem marcas." }, { status: 400 });

  const numero = `R${previo.numero}`;
  const data = body.data ? new Date(body.data) : (previo.dataPrevista || new Date());
  const itens = marcas.filter((m) => m?.marca).map((m) => ({
    marca: m.marca, descricao: m.descricao || null,
    qtd: Number(m.qte) || 0, pesoKg: Number(m.pesoTotal) || 0,
  }));

  const buf = await gerarRomaneioForm22({
    op,
    romaneio: { numero, data, transportadora: body.transportadora, contatoTransporte: body.contato },
    itens,
  });
  const cli = (op.cliente || "").slice(0, 40).trim();
  const fileNome = `Romaneio ${numero} - OP-${op.numero}${cli ? ` - ${cli}` : ""}.xlsx`;

  let sharepoint = null;
  try {
    const r = await salvarRomaneioNoServidor({ opNumero: op.numero, fileNome, buffer: buf });
    sharepoint = { ok: true, nome: r.nome, caminho: r.caminho, webUrl: r.webUrl };
  } catch (e) {
    sharepoint = { ok: false, erro: e?.message || "Falha ao salvar no SharePoint." };
  }

  return NextResponse.json({ ok: true, numero, nome: fileNome, arquivo: buf.toString("base64"), sharepoint });
}
