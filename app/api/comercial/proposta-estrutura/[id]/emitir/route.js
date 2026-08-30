// POST /api/comercial/proposta-estrutura/[id]/emitir   { revisar?: bool, formato?: "docx"|"pdf" }
//
// Gera o documento no modelo da Torg e devolve o arquivo.
//
// ⚠⚠ EMITIR É UM ATO, NÃO UMA PRÉVIA. Cada emissão sobe a revisão e entra no log — é assim que a
// PT da VALE chegou ao R04 e a PC ao R06, cada uma no seu ritmo. Quem só quer conferir usa
// `revisar: false`, que gera o mesmo documento sem mexer no número.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { montarPropostaDocx } from "@/lib/proposta-estrutura-docx";
import { numeroDaProposta } from "@/lib/proposta-estrutura";
import { converterDocxParaPdf, cloudConvertConfigurado } from "@/lib/cloudconvert";
import { dataBR } from "@/lib/data-br";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ROLES = ["ADMIN", "COMERCIAL"];

export async function POST(req, { params }) {
  let user;
  try { user = await requireRole(ROLES); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const formato = b.formato === "pdf" ? "pdf" : "docx";
  const revisar = b.revisar !== false;

  const p = await prisma.propostaEstrutura.findUnique({
    where: { id },
    include: {
      orcamento: { select: { numero: true, cliente: true, obra: true } },
      estudo: { select: { numero: true, ano: true, resultado: true } },
    },
  });
  if (!p) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });

  // ⚠ a revisão sobe ANTES de gerar: o número que sai impresso no documento tem que ser o mesmo
  // que fica gravado. Gerar com um número e salvar outro é como nasce documento sem rastro.
  const revisao = revisar ? p.revisao + 1 : p.revisao;
  const numero = numeroDaProposta({ tipo: p.tipo, orcamento: p.orcamento.numero, revisao });

  const d = p.destinatario || {};
  const dados = {
    escopo: p.escopo || [],
    documentos: p.documentos || [],
    projetos: p.projetos || [],
    areas: p.areas || [],
    // o escopo reescreve o item 1.1 e derruba a menção a cálculo no 1.4; a modalidade preenche o
    // item que hoje sai fixo no modelo
    escopoItens: p.escopo || [],
    modalidade: p.modalidade || null,
    // o cálculo do estudo, que vira a tabela de preço e as frases de faturamento
    resultado: p.estudo?.resultado || null,
    // a capa: o modelo tem os marcadores na ordem em que aparecem no parágrafo
    marcadores: {
      __CAPA__: [d.empresa, d.endereco, d.bairroCidade, d.contato, d.email, d.fone,
                 p.referencia, d.cidadeEstado, String(revisao).padStart(2, "0"), dataBR(new Date())],
    },
  };

  let buffer;
  try {
    buffer = await montarPropostaDocx({
      tipo: p.tipo, comMontagem: p.comMontagem, selecao: p.selecao || {}, dados,
    });
  } catch (e) {
    return NextResponse.json({ error: `Falha ao montar o documento: ${e.message}` }, { status: 502 });
  }

  let nomeArquivo = `${numero}-${String(p.orcamento.cliente || "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 24)}-TORG.docx`;
  if (formato === "pdf") {
    if (!cloudConvertConfigurado()) {
      return NextResponse.json({ error: "PDF indisponível: configure CLOUDCONVERT_API_KEY." }, { status: 503 });
    }
    try {
      buffer = await converterDocxParaPdf(buffer, nomeArquivo);
      nomeArquivo = nomeArquivo.replace(/\.docx$/, ".pdf");
    } catch (e) {
      return NextResponse.json({ error: `Falha ao converter em PDF: ${e.message}` }, { status: 502 });
    }
  }

  if (revisar) {
    await prisma.propostaEstrutura.update({
      where: { id },
      data: {
        revisao, emitidoEm: new Date(), status: "EMITIDA",
        emissoes: [...(Array.isArray(p.emissoes) ? p.emissoes : []),
                   { em: new Date().toISOString(), revisao, tipo: p.tipo, arquivo: nomeArquivo, porNome: user.name || user.email }],
      },
    });
    await prisma.auditLog.create({
      data: { userId: user.id, action: "EMITIR_PROPOSTA_ESTRUTURA", entity: "PropostaEstrutura",
              entityId: id, diff: { numero, tipo: p.tipo, revisao } },
    }).catch(() => {});
  }

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": formato === "pdf" ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      "X-Proposta-Numero": numero,
    },
  });
}
