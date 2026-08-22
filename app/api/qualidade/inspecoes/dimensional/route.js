// POST — cria o relatório dimensional.  { opNumero, escopo, marcas[], titulo, inspetor }
//
// ⚠ CRIAR É INSTANTÂNEO, DE PROPÓSITO. Vitor (21/08/2026): "vamos mudar esse caminho para criar o
// relatório, pois está muito lento; como não vamos alterar nada das cotas, você só precisa trazer o
// desenho".
//
// A rota já montou prévia aqui: procurava o desenho nas pastas da OP (varredura recursiva, dezenas
// de chamadas ao Graph), baixava a folha, recortava a vista e gerava um PDF só para olhar. Fazia
// sentido quando o relatório nascia preenchido pela lista de materiais. Não faz mais: hoje ele
// nasce VAZIO e as dimensões só existem depois que alguém marca a Cota A no desenho.
//
// O caminho do desenho é resolvido na primeira vez que a marcação ou o PDF precisam dele
// (`garantirDesenhos`) e fica gravado a partir dali.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { procedimentoTolerancia } from "@/lib/relatorio-dimensional";
import { vincularNoDataBook } from "@/lib/relatorio-inspecao";

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

  // ⚠ NADA DE VARRER O SERVIDOR AQUI. Vitor (21/08/2026): "vamos mudar esse caminho para criar o
  // relatório, pois está muito lento; como não vamos alterar nada das cotas, você só precisa trazer
  // o desenho".
  //
  // Antes esta rota montava a prévia inteira antes de gravar: procurava o desenho nas pastas da OP
  // (varredura recursiva, dezenas de chamadas ao Graph), baixava a folha, recortava a vista e ainda
  // gerava um PDF de prévia. Tudo isso para um relatório que nasce VAZIO — as dimensões só existem
  // depois que alguém marca a Cota A no desenho.
  //
  // O caminho do desenho passa a ser resolvido na primeira vez que a marcação ou o PDF precisarem
  // dele (`garantirDesenhos`), e fica gravado no relatório a partir dali.
  const tolerancia = await procedimentoTolerancia();
  const erros = [];

  const op = await prisma.oP.findFirst({ where: { numero: opNumero }, select: { id: true } });
  // ── O TIPO DA PEÇA ──────────────────────────────────────────────────────────────────────────
  //
  // Vitor (21/08/2026): "aqui trazer o tipo da peça — coluna, viga, tesoura, etc — conforme
  // descrito na lista". O cabeçalho trazia só a marca ("T89A1"), que não diz nada a quem lê o
  // relatório meses depois; "T89A1 · COLUNA" diz.
  //
  // ⚠ A BUSCA É POR opId, NÃO POR opNumero. `PecaConjunto.opNumero` guarda o código da Engenharia
  // (T67B, T89A), não o número da OP — procurar por "089" ali não acha nada.
  //
  // ⚠ E o tipo é `descricao`. `tipoPeca` é outra coisa: vale "CONJUNTO" ou "CROQUI", e usá-lo como
  // reserva encheria o cabeçalho de "CONJUNTO" no lugar de COLUNA.
  //
  // ⚠ Gravado na CRIAÇÃO, não lido na hora de gerar o PDF: a lista da Engenharia é reimportada a
  // cada revisão, e o relatório deve continuar dizendo o que a peça era quando foi inspecionada.
  const tiposPeca = {}, qtdPeca = {};
  if (op?.id) {
    try {
      const pecas = await prisma.pecaConjunto.findMany({
        where: { opId: op.id, marca: { in: marcas } },
        select: { marca: true, descricao: true, qte: true },
      });
      for (const pc of pecas) {
        const k = String(pc.marca).toUpperCase();
        const t = (pc.descricao || "").trim();
        if (t && !tiposPeca[k]) tiposPeca[k] = t.toUpperCase();
        // ⚠ SOMA as ocorrências: a mesma marca aparece uma vez por conjunto na lista, e a
        // quantidade do relatório é quantas peças daquela marca a OP tem.
        qtdPeca[k] = (qtdPeca[k] || 0) + (pc.qte || 0);
      }
    } catch { /* sem tipo, o cabeçalho mostra a marca — como antes */ }
  }

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
        // nasce SEM linha: elas aparecem conforme as cotas A/B/C forem marcadas no desenho
        linhas: [],
        // e sem desenho: o caminho é resolvido na primeira abertura da marcação
        desenhos: [],
        resultados: { dimensional: null, alinhamento: null, acabamento: null, resultado: null, tolerancia, tiposPeca, qtdPeca },
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
