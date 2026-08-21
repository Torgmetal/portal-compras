// POST — monta o relatório dimensional a partir do(s) desenho(s).
//
//   { opNumero, escopo, marcas[] }                  → PRÉVIA (não grava nada)
//   { ..., salvar: true, titulo, inspetor, ... }     → cria o relatório
//
// Vitor (21/08/2026): "onde você está deixando a prévia desses relatórios?" — não estava em lugar
// nenhum. O motor lia o desenho, mas sem tela não havia como olhar antes de gravar. A prévia existe
// pra isso: o dimensional puxa dado do servidor (desenho, lista de materiais) e é preciso conferir
// o que veio ANTES de consumir um número de relatório, que não se reaproveita.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { montarDimensional, procedimentoTolerancia, baixarDesenho } from "@/lib/relatorio-dimensional";
import { gerarDimensionalPDF } from "@/lib/relatorio-dimensional-pdf";
import { criarRelatorio, vincularNoDataBook } from "@/lib/relatorio-inspecao";

export const runtime = "nodejs";
export const maxDuration = 120;

const PERFIS = ["ADMIN", "QUALIDADE"];

export async function POST(req) {
  let user;
  try { user = await requireRole(PERFIS); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 }); }

  const body = await req.json().catch(() => ({}));
  const opNumero = String(body?.opNumero || "").trim();
  const escopo = body?.escopo === "AVULSAS" ? "AVULSAS" : "CONJUNTO";
  const marcas = [...new Set((Array.isArray(body?.marcas) ? body.marcas : []).map((m) => String(m || "").trim().toUpperCase()).filter(Boolean))];

  if (!opNumero) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });
  if (!marcas.length) return NextResponse.json({ error: "Escolha ao menos uma peça." }, { status: 400 });
  // ⚠ conjunto é UM por relatório — é o que o modelo do Vitor prevê ("IDENTIFICAÇÃO DA PEÇA",
  // "Nº DESENHO", "FOLHA 1 DE 1"). Agrupar é privilégio da peça avulsa.
  if (escopo === "CONJUNTO" && marcas.length > 1) {
    return NextResponse.json({ error: "Relatório de conjunto é um por conjunto. Para agrupar, use o escopo de peças avulsas." }, { status: 400 });
  }

  const { linhas, desenhos, erros } = await montarDimensional(opNumero, marcas);
  const tolerancia = await procedimentoTolerancia();

  if (!body?.salvar) {
    // ⚠ PRÉVIA COMO DOCUMENTO. Vitor: "não consigo gerar a prévia o relatório para ver como vai
    // ficar no data book". Uma tabela na tela não responde isso — o que ele precisa ver é a FOLHA,
    // com o desenho no campo do croqui e os quadros de aprovação. Devolve o PDF de verdade, do
    // relatório que ainda não existe.
    if (body?.formato === "pdf") {
      const op = await prisma.oP.findFirst({ where: { numero: opNumero }, select: { cliente: true, obra: true } });
      const bytes = await gerarDimensionalPDF({
        rel: {
          codigo: `${escopo === "AVULSAS" ? "RID" : "RID"}-${opNumero.replace(/\D/g, "").padStart(3, "0")}-PRÉVIA`,
          opNumero, tipo: "DIMENSIONAL", marcas, linhas, desenhos,
          titulo: body?.titulo || null, inspetor: body?.inspetor || user.name || null,
          observacoes: body?.observacoes || null,
          resultados: { dimensional: null, alinhamento: null, acabamento: null, resultado: null, tolerancia },
          equipamentos: [],
          emitidoEm: new Date(),
        },
        assinaturas: null,
        desenhoBytes: (d) => baixarDesenho(d?.caminho),
        cliente: op?.cliente || null, obra: op?.obra || null,
      });
      return new NextResponse(Buffer.from(bytes), {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=\"previa.pdf\"", "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json({ previa: true, escopo, marcas, linhas, desenhos, erros, tolerancia });
  }

  if (!linhas.length) return NextResponse.json({ error: "Nada para gravar — nenhuma linha foi montada." }, { status: 400 });

  const op = await prisma.oP.findFirst({ where: { numero: opNumero }, select: { id: true } });
  try {
    // dimensional não usa fotos (Vitor: "não vamos usar fotos"), então nasce sem elas —
    // `criarRelatorio` exige foto, por isso o dimensional cria direto.
    const { proximoNumero } = await import("@/lib/relatorio-inspecao");
    const numero = await proximoNumero(opNumero, "DIMENSIONAL");
    const { codigoRelatorio } = await import("@/lib/qualidade-campo");
    const codigo = codigoRelatorio("DIMENSIONAL", opNumero, numero);

    const rel = await prisma.relatorioInspecao.create({
      data: {
        numero, codigo, opId: op?.id || null, opNumero, tipo: "DIMENSIONAL",
        titulo: String(body?.titulo || "").trim() || null,
        observacoes: String(body?.observacoes || "").trim() || null,
        inspetor: String(body?.inspetor || "").trim() || user.name || null,
        escopo, marcas,
        // as linhas que o elaborador vai preencher (encontradoMm vem vazio de propósito)
        linhas: Array.isArray(body?.linhas) && body.linhas.length ? body.linhas : linhas,
        desenhos,
        resultados: { dimensional: null, alinhamento: null, acabamento: null, resultado: null, tolerancia },
        criadoPorId: user.id, criadoPorNome: user.name || null,
      },
    });

    const vinculo = await vincularNoDataBook(rel, null);

    await prisma.auditLog.create({
      data: {
        userId: user.id, action: "CRIAR_RELATORIO_DIMENSIONAL", entity: "RelatorioInspecao", entityId: rel.id,
        diff: { codigo, opNumero, escopo, marcas, linhas: rel.linhas.length, vinculo },
      },
    }).catch(() => {});

    return NextResponse.json({ ok: true, relatorio: rel, vinculo, erros });
  } catch (e) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Número de relatório já usado — tente de novo." }, { status: 409 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
