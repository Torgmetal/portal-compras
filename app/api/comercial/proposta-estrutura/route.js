// GET  /api/comercial/proposta-estrutura?orcamentoId=  — as propostas do orçamento
// POST /api/comercial/proposta-estrutura  { orcamentoId, tipo, comMontagem }
//
// A proposta nasce já sabendo o que consegue puxar sozinha: o destinatário sai do cadastro do
// orçamento, os documentos e projetos saem da pasta do SharePoint, e as áreas saem do estudo LQC
// quando ele existe.
//
// ⚠ NADA DISSO É CHUTE — cada campo tem uma origem, e o que não tem origem nasce vazio para
// alguém preencher. Proposta preenchida com dado inventado é pior que proposta em branco: ninguém
// revisa o que já parece pronto.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { selecaoPadrao } from "@/lib/proposta-estrutura";
import { pastasDoAno, arquivosDoOrcamento } from "@/lib/emails-orcamento-sharepoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const ROLES = ["ADMIN", "COMERCIAL"];

export async function GET(req) {
  try { await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }
  const orcamentoId = new URL(req.url).searchParams.get("orcamentoId");
  if (!orcamentoId) return NextResponse.json({ error: "Informe o orçamento." }, { status: 400 });
  const propostas = await prisma.propostaEstrutura.findMany({
    where: { orcamentoId },
    orderBy: { tipo: "asc" },
    include: { estudo: { select: { id: true, numero: true, ano: true, resultado: true } } },
  });
  return NextResponse.json({ propostas });
}

/** Os arquivos da pasta do orçamento, separados entre especificações e desenhos. */
async function daPasta(numero, ano) {
  try {
    const pastas = await pastasDoAno(ano);
    const p = pastas.get(numero);
    if (!p) return { documentos: [], projetos: [] };
    const arquivos = await arquivosDoOrcamento(p.caminho, 5);
    const semExt = (n) => String(n).replace(/\.[a-z0-9]+$/i, "");
    return {
      // 3.Documentos são as ESPECIFICAÇÕES do cliente (ET, PIT, check list) — é o bloco que a
      // proposta da ORCA não tinha e que o Vitor acrescentou à mão na VALE
      documentos: arquivos.filter((a) => /document/i.test(a.pasta)).map((a) => semExt(a.nome)),
      projetos: arquivos.filter((a) => /projeto/i.test(a.pasta)).map((a) => semExt(a.nome)),
    };
  } catch { return { documentos: [], projetos: [] }; }
}

export async function POST(req) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const b = await req.json().catch(() => ({}));
  const tipo = ["PT", "PC", "PTC"].includes(b.tipo) ? b.tipo : "PTC";
  const comMontagem = !!b.comMontagem;
  const orc = await prisma.orcamento.findUnique({
    where: { id: String(b.orcamentoId || "") },
    include: { estudosLqc: { orderBy: { revisao: "desc" }, take: 1 } },
  });
  if (!orc) return NextResponse.json({ error: "Orçamento não encontrado." }, { status: 404 });

  const existe = await prisma.propostaEstrutura.findUnique({
    where: { orcamentoId_tipo: { orcamentoId: orc.id, tipo } },
  });
  if (existe) return NextResponse.json({ ok: true, proposta: existe, jaExistia: true });

  const estudo = orc.estudosLqc?.[0] || null;
  const ano = 2000 + Number(String(orc.numero).split("-")[1] || new Date().getFullYear() % 100);
  const { documentos, projetos } = await daPasta(orc.numero, ano);

  // ⚠ as ÁREAS vêm do estudo quando ele existe: são as mesmas do RESUMOS_EM, e é isso que faz o
  // levantamento da proposta e o quantitativo do custo falarem da mesma obra. Sem estudo, a lista
  // nasce vazia — o levantamento é o passo 1 do assistente.
  const areas = estudo
    ? [...new Set((estudo.composicao?.resumos || []).map((r) => r.area).filter(Boolean))]
        .map((nome) => ({ nome, elementos: [] }))
    : [];

  const proposta = await prisma.propostaEstrutura.create({
    data: {
      orcamentoId: orc.id, estudoId: estudo?.id || null, tipo, comMontagem,
      destinatario: { empresa: orc.cliente || "", contato: orc.responsavel || "", email: orc.contato || "" },
      referencia: orc.obra || null,
      documentos, projetos, areas,
      selecao: selecaoPadrao({ tipo, comMontagem }),
      criadoPorId: user.id,
    },
  });
  return NextResponse.json({ ok: true, proposta });
}
