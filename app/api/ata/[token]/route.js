// Público (sem login, via token) — o envolvido CONFIRMA o recebimento e, depois
// disso, vê a ata inteira e preenche as atividades do seu setor (info+evidência).
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
const rev = (n) => `R${String(n).padStart(2, "0")}`;
const numAta = (n) => `ATA-${String(n).padStart(3, "0")}`;

async function carregar(token) {
  const conf = await prisma.ataConfirmacao.findUnique({ where: { token } });
  if (!conf) return null;
  const ata = await prisma.ataReuniao.findUnique({
    where: { id: conf.ataId },
    include: { atividades: { orderBy: { ordem: "asc" } } },
  });
  return { conf, ata };
}

export async function GET(_req, { params }) {
  const dados = await carregar(params.token);
  if (!dados?.ata) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });
  const { conf, ata } = dados;
  const confirmado = !!conf.confirmadoEm;
  return NextResponse.json({
    success: true,
    confirmacao: { nome: conf.nome, setor: conf.setor, confirmadoEm: conf.confirmadoEm },
    ata: {
      codigo: `${numAta(ata.numero)} · ${rev(ata.revisao)}`,
      titulo: ata.titulo, semanaIso: ata.semanaIso, ano: ata.ano, dataReuniao: ata.dataReuniao,
      status: ata.status, revisao: ata.revisao, revisoes: ata.revisoes,
      // Conteúdo só depois de confirmar o recebimento
      pauta: confirmado ? ata.pauta : null,
      envolvidos: confirmado ? ata.envolvidos : null,
      atividades: confirmado ? ata.atividades.map((a) => ({
        id: a.id, descricao: a.descricao, op: a.op, setor: a.setor, responsavel: a.responsavel, prazo: a.prazo,
        origemAtaNumero: a.origemAtaNumero,
        status: a.status, resposta: a.resposta, evidencia: a.evidencia, respondidoPor: a.respondidoPor, respondidoEm: a.respondidoEm,
        // destaque das atividades do setor do envolvido — NÃO é trava: qualquer
        // envolvido confirmado pode preencher qualquer atividade (a ata cobre
        // setores que nem sempre têm representante na lista de envolvidos).
        meuSetor: !!conf.setor && !!a.setor && String(a.setor).toUpperCase() === String(conf.setor).toUpperCase(),
      })) : null,
    },
  });
}

const schema = z.object({
  acao: z.enum(["confirmar", "responder"]),
  atividadeId: z.string().optional(),
  resposta: z.string().max(2000).optional().nullable(),
  evidencia: z.string().max(2000).optional().nullable(),
  respondidoPor: z.string().max(100).optional().nullable(),
  status: z.enum(["EM_ANDAMENTO", "CONCLUIDA"]).optional(),
});

export async function POST(req, { params }) {
  const dados = await carregar(params.token);
  if (!dados?.ata) return NextResponse.json({ success: false, error: "Link inválido ou expirado." }, { status: 404 });
  const { conf, ata } = dados;

  let body;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ success: false, error: e.issues?.[0]?.message || "Dados inválidos" }, { status: 400 }); }

  if (body.acao === "confirmar") {
    if (!conf.confirmadoEm) await prisma.ataConfirmacao.update({ where: { id: conf.id }, data: { confirmadoEm: new Date() } });
    return NextResponse.json({ success: true });
  }

  // responder: basta ter confirmado o recebimento. Sem trava por setor — a ata
  // cobre setores que nem sempre têm um representante entre os envolvidos, e
  // travar deixava a maioria das atividades sem ninguém que pudesse responder.
  // Quem respondeu fica registrado em respondidoPor.
  if (!conf.confirmadoEm) return NextResponse.json({ success: false, error: "Confirme o recebimento antes de responder." }, { status: 400 });
  if (!body.atividadeId) return NextResponse.json({ success: false, error: "Atividade não informada." }, { status: 400 });
  const atv = ata.atividades.find((a) => a.id === body.atividadeId);
  if (!atv) return NextResponse.json({ success: false, error: "Atividade não encontrada." }, { status: 404 });
  if (!(body.resposta || "").trim() && !(body.evidencia || "").trim()) {
    return NextResponse.json({ success: false, error: "Preencha a informação e/ou a evidência." }, { status: 400 });
  }

  await prisma.ataAtividade.update({
    where: { id: atv.id },
    data: {
      resposta: (body.resposta || "").trim() || null,
      evidencia: (body.evidencia || "").trim() || null,
      respondidoPor: (body.respondidoPor || conf.nome || "").trim().slice(0, 100) || null,
      respondidoEm: new Date(),
      status: body.status || "EM_ANDAMENTO",
    },
  });
  return NextResponse.json({ success: true });
}
