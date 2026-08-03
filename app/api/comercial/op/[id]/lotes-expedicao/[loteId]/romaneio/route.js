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
  placaCarreta: z.string().max(20).nullable().optional(),
  contato: z.string().max(100).nullable().optional(),
  data: z.string().nullable().optional(),
  marcas: z.array(z.string()).optional(), // (legado) subconjunto de marcas — sem quantidade
  itensSel: z.array(z.object({ marca: z.string().min(1), qtd: z.number().min(0) })).optional(), // marcas + quantidade
  mudanca: z.string().max(2000).nullable().optional(), // o que mudou (obrigatório na revisão)
  previa: z.boolean().optional(), // true = só gera pra conferir (não salva, não emite)
});

export async function POST(req, { params }) {
  let user;
  try {
    user = await requireRole(["ADMIN", "EXPEDICAO", "COMERCIAL", "PLANEJAMENTO", "PCP", "ENGENHARIA"]);
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

  const lote = await prisma.loteExpedicao.findFirst({ where: { id: params.loteId, opId: op.id } });
  if (!lote) return NextResponse.json({ error: "Lote não encontrado" }, { status: 404 });

  // Marcas vêm do romaneio prévio (mais recente) vinculado ao lote.
  const previo = await prisma.romaneioPrevio.findFirst({
    where: { opId: op.id, loteId: params.loteId },
    orderBy: { numero: "desc" },
  });
  if (!previo) return NextResponse.json({ error: "Este lote não tem romaneio prévio com marcas." }, { status: 400 });
  const marcasPrevio = Array.isArray(previo.itens) ? previo.itens : [];
  if (!marcasPrevio.length) return NextResponse.json({ error: "O romaneio prévio está sem marcas." }, { status: 400 });

  // Transportador: usa o do corpo; se ausente, cai pro salvo no lote.
  const transportadora = (body.transportadora ?? lote.transportadora) || null;
  const motorista = (body.motorista ?? lote.motorista) || null;
  const placa = (body.placa ?? lote.placaVeiculo) || null;
  const placaCarreta = (body.placaCarreta ?? lote.placaCarreta) || null;
  const contato = (body.contato ?? lote.contatoTransporte) || null;

  const numero = `R${previo.numero}`;
  const data = body.data ? new Date(body.data) : (previo.dataPrevista || new Date());
  let itens;
  if (body.itensSel?.length) {
    // Seleção com quantidade: o prévio traz o peso da qtd cheia; ao mudar a
    // quantidade, o peso vai proporcional (pesoUnit = pesoTotal / qte).
    // Universo = marcas do prévio + TODAS as da Lista de Expedição (permite INCLUIR
    // peça nova na revisão, não só as que já estavam no romaneio). pesoUnit = pesoTotal/qte.
    const porMarca = new Map();
    const listasOP = await prisma.listaExpedicao.findMany({ where: { OR: [{ opId: op.id }, { opNumero: String(op.numero) }] }, select: { frente: true, marcasJson: true } });
    for (const l of listasOP) for (const mm of (Array.isArray(l.marcasJson) ? l.marcasJson : [])) {
      const kk = String(mm.marca || "").trim().toUpperCase();
      if (kk && !porMarca.has(kk)) porMarca.set(kk, { marca: mm.marca, descricao: mm.descricao, frente: l.frente, qte: mm.qte, pesoTotal: mm.pesoTotal });
    }
    for (const m of marcasPrevio) if (m?.marca) porMarca.set(String(m.marca).trim().toUpperCase(), m);
    itens = body.itensSel
      .map((s) => {
        const pm = porMarca.get(String(s.marca).trim().toUpperCase());
        if (!pm) return null;
        const qteOrig = Number(pm.qte) || 0;
        const pesoOrig = Number(pm.pesoTotal) || 0;
        const pesoUnit = qteOrig > 0 ? pesoOrig / qteOrig : pesoOrig;
        const qtd = Number(s.qtd) || 0;
        // grava os dois nomes (qtd/pesoKg p/ o FORM 22; qte/pesoTotal/frente p/ o cruzamento de expedido)
        return { marca: pm.marca, descricao: pm.descricao || null, frente: pm.frente || null, qtd, qte: qtd, pesoKg: pesoUnit * qtd, pesoTotal: pesoUnit * qtd };
      })
      .filter((it) => it && it.qtd > 0);
  } else {
    itens = marcasPrevio.filter((m) => m?.marca).map((m) => ({
      marca: m.marca, descricao: m.descricao || null, frente: m.frente || null,
      qtd: Number(m.qte) || 0, qte: Number(m.qte) || 0,
      pesoKg: Number(m.pesoTotal) || 0, pesoTotal: Number(m.pesoTotal) || 0,
    }));
    // Ajuste de marcas (legado): se veio uma seleção sem quantidade, exporta só essas.
    if (body.marcas?.length) {
      const sel = new Set(body.marcas.map((s) => String(s).trim().toUpperCase()));
      itens = itens.filter((it) => sel.has(String(it.marca).trim().toUpperCase()));
    }
  }
  if (!itens.length) return NextResponse.json({ error: "Nenhuma marca/quantidade selecionada." }, { status: 400 });

  // Persiste o transportador no lote (vale pra prévia e final — conveniência).
  await prisma.loteExpedicao.update({ where: { id: lote.id }, data: { transportadora, motorista, placaVeiculo: placa, placaCarreta, contatoTransporte: contato } }).catch(() => {});
  const cli = (op.cliente || "").slice(0, 40).trim();

  // PRÉVIA: só gera o FORM 22 pra conferir — não salva no SharePoint, não marca
  // emitido, não vira revisão.
  if (body.previa) {
    const buf = await gerarRomaneioForm22({ op, romaneio: { numero, data, transportadora, motorista, placa, placaCarreta, contatoTransporte: contato }, itens });
    return NextResponse.json({ ok: true, previa: true, numero, nome: `PREVIA Romaneio ${numero} - OP-${op.numero}${cli ? ` - ${cli}` : ""}.xlsx`, arquivo: buf.toString("base64") });
  }

  // Emissão × revisão: 1ª vez emite R00; se já foi emitido, é revisão (exige motivo).
  const jaEmitido = !!previo.emitidoEm;
  const novaRevisao = jaEmitido ? (previo.revisao || 0) + 1 : 0;
  if (jaEmitido && !(body.mudanca && body.mudanca.trim())) {
    return NextResponse.json({ error: "Descreva o que mudou nesta revisão." }, { status: 400 });
  }
  const agora = new Date();
  const histAtual = Array.isArray(previo.historico) ? previo.historico : [];
  const historico = [...histAtual, {
    revisao: novaRevisao,
    emitidoEm: agora.toISOString(),
    mudanca: novaRevisao === 0 ? "Primeira emissão" : body.mudanca.trim(),
    porQuem: user.name || user.email || null,
  }];

  const buf = await gerarRomaneioForm22({
    op,
    romaneio: { numero, data, transportadora, motorista, placa, placaCarreta, contatoTransporte: contato },
    itens,
    historico: novaRevisao > 0 ? historico : null, // aba Histórico só na revisão
  });
  const prefixo = `Romaneio ${numero} - OP-${op.numero}`; // base do nome (acha a versão anterior na revisão)
  const fileNome = `${prefixo}${cli ? ` - ${cli}` : ""}.xlsx`;

  let sharepoint = null;
  try {
    // Na revisão, move a versão anterior desse romaneio pra Obsoleto antes de salvar.
    const r = await salvarRomaneioNoServidor({ opNumero: op.numero, fileNome, buffer: buf, moverPrefixo: jaEmitido ? prefixo : undefined });
    sharepoint = { ok: true, nome: r.nome, caminho: r.caminho, webUrl: r.webUrl };
  } catch (e) {
    sharepoint = { ok: false, erro: e?.message || "Falha ao salvar no SharePoint." };
  }

  // Marca como emitido / atualiza a revisão + histórico no prévio.
  // Guarda a URL do arquivo no SharePoint (quando salvou) — o Fiscal usa pra abrir o FORM 22.
  // Salva os ITENS realmente emitidos (incluir/tirar peça na revisão) + o peso real,
  // pra a lista de expedição (expedido/pendente) e o peso do card baterem com a realidade.
  const pesoKgReal = itens.reduce((s, it) => s + (Number(it.pesoKg ?? it.pesoTotal) || 0), 0);
  await prisma.romaneioPrevio.update({
    where: { id: previo.id },
    data: {
      itens, pesoKg: pesoKgReal,
      emitidoEm: agora, emitidoPorId: user.id, revisao: novaRevisao, historico,
      ...(sharepoint?.ok && sharepoint.webUrl ? { arquivoUrl: sharepoint.webUrl } : {}),
    },
  }).catch(() => {});

  await prisma.auditLog.create({ data: { userId: user.id, action: novaRevisao === 0 ? "EMITIR_ROMANEIO" : "REVISAR_ROMANEIO", entity: "RomaneioPrevio", entityId: previo.id, diff: { numero, revisao: novaRevisao, itens: itens.length } } }).catch(() => {});

  return NextResponse.json({ ok: true, numero, revisao: novaRevisao, nome: fileNome, arquivo: buf.toString("base64"), sharepoint });
}
