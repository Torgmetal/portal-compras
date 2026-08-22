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
import { tipoNoEscopo } from "@/lib/qualidade-escopo";
import { camposDoRelatorioPintura } from "@/lib/plp";
import { TIPO } from "@/lib/qualidade-campo";
import { requireRole } from "@/lib/session";
import { procedimentoTolerancia } from "@/lib/relatorio-dimensional";
import { CRITERIO_PADRAO } from "@/lib/evs-campos";
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
  // ⚠ a rota deixou de ser só do dimensional: qualquer tipo nasce por aqui. O que muda por tipo é a
  // exigência da peça e o que se resolve depois (o desenho, só o dimensional usa).
  const { tipoValido, usaCotas } = await import("@/lib/qualidade-campo");
  const tipo = tipoValido(body?.tipo) ? body.tipo : "DIMENSIONAL";
  const ehDimensional = usaCotas(tipo);
  const marcas = [...new Set((Array.isArray(body?.marcas) ? body.marcas : []).map((m) => String(m || "").trim().toUpperCase()).filter(Boolean))];

  if (!opNumero) return NextResponse.json({ error: "Informe a OP." }, { status: 400 });
  // ⚠ só o dimensional exige peça: o relatório é de UM conjunto e é dele que sai o desenho das
  // cotas. Um EVS pode cobrir várias peças, e quais foram fica na tabela do próprio relatório.
  if (ehDimensional && !marcas.length) return NextResponse.json({ error: "Escolha ao menos uma peça." }, { status: 400 });
  // ⚠ conjunto é UM por relatório — é o que o modelo do Vitor prevê ("IDENTIFICAÇÃO DA PEÇA",
  // "Nº DESENHO", "FOLHA 1 DE 1"). Agrupar é privilégio da peça avulsa.
  if (ehDimensional && escopo === "CONJUNTO" && marcas.length > 1) {
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
  // ⚠ O PROCEDIMENTO VEM DO CONTROLE DE DOCUMENTOS, não de texto no código. Os 21 POs do SGQ foram
  // importados em 21/08/2026; antes disso o relatório citava "PO-04" a partir de uma constante, e
  // se a Qualidade revisasse o procedimento o documento emitido continuaria dizendo a revisão
  // velha — sem ninguém perceber.
  const { procedimentoDoTipo } = await import("@/lib/importar-procedimentos");
  const proc = await procedimentoDoTipo(tipo).catch(() => null);
  const erros = [];

  const op = await prisma.oP.findFirst({ where: { numero: opNumero }, select: { id: true, escopoQualidade: true } });
  // ⚠ O ESCOPO DA OBRA MANDA, e a checagem tem que ser AQUI. Vitor (22/08/2026): "pode ser
  // que em alguns casos não vamos fazer nada além de certificado de qualidade e relatório
  // de pintura". A tela do celular já filtra os tipos, mas o relatório também nasce pelo
  // computador e por link direto — é no servidor que a regra vale para todos os caminhos.
  if (op && !tipoNoEscopo(op, tipo)) {
    return NextResponse.json({
      error: `A OP-${opNumero} não prevê ${TIPO[tipo]?.label || tipo}. Ajuste o escopo de qualidade na OP se isso mudou.`,
    }, { status: 409 });
  }
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

  // ── O QUE O PLP JÁ DIZ ──────────────────────────────────────────────────────────────────────
  //
  // Vitor (22/08/2026): "aqui já não podemos deixar definido? puxando do PLP de cada obra".
  //
  // O relatório de pintura nasce com o ESPECIFICADO preenchido: método de preparo, grau de
  // limpeza, abrasivo, faixa de rugosidade, espessura mínima e o produto/fabricante de cada
  // demão. O que se MEDE continua em branco — é do inspetor.
  //
  // ⚠ SNAPSHOT. Grava no relatório em vez de consultar o PLP na hora de imprimir: o documento
  // tem de registrar o que estava especificado NO DIA. PLP revisado depois não reescreve
  // relatório antigo — mesma razão do tipo da peça ser gravado aqui e não lido no PDF.
  let semente = {};
  if (tipo === "PINTURA") {
    try {
      const plp = await prisma.planoPintura.findUnique({ where: { opNumero } });
      semente = camposDoRelatorioPintura(plp);
    } catch { /* sem PLP o formulário nasce em branco, como antes */ }
  }

  try {
    // dimensional não usa fotos (Vitor: "não vamos usar fotos"), então nasce sem elas —
    // `criarRelatorio` exige foto, por isso o dimensional cria direto.
    const { proximoNumero } = await import("@/lib/relatorio-inspecao");
    const numero = await proximoNumero(opNumero, tipo);
    const { codigoRelatorio } = await import("@/lib/qualidade-campo");
    const codigo = codigoRelatorio(tipo, opNumero, numero);

    const rel = await prisma.relatorioInspecao.create({
      data: {
        numero, codigo, opId: op?.id || null, opNumero, tipo,
        titulo: String(body?.titulo || "").trim() || null,
        observacoes: String(body?.observacoes || "").trim() || null,
        inspetor: String(body?.inspetor || "").trim() || user.name || null,
        escopo, marcas,
        // ⚠ O LP NASCE COM AS PEÇAS. Vitor (22/08/2026): "precisa trazer as informações para o
        // inspetor ir selecionando igual aos demais, trazer todos os pontos do relatório que
        // precisa ser preenchido". O ensaio é POR PEÇA e as peças já foram escolhidas na
        // abertura — abrir uma tabela vazia obriga a redigitar o que o portal já sabe.
        //
        // Diferente do visual de solda e do ultrassom, onde a junta nasce no campo ("quem
        // descobre que existe uma junta a inspecionar é quem está na frente dela"): no LP o
        // que se ensaia é a peça inteira, e ela veio da seleção.
        //
        // No dimensional continua vazio: ali as linhas são as cotas A/B/C, marcadas no desenho.
        linhas: tipo === "LP"
          ? marcas.map((m) => ({
              marca: m,
              descricao: tiposPeca[String(m).toUpperCase()] || null,
              indicacaoLp: "", local: "", tamanho: "", tipoDefeito: "", laudo: "",
            }))
          : [],
        // ⚠ A PRÉ-MONTAGEM NASCE COM O DESENHO. Os demais resolvem na primeira abertura da
        // marcação, varrendo a pasta da OP pela MARCA da peça — e isso nunca acharia um diagrama
        // de montagem, que não é peça da LPC. Aqui o caminho vem escolhido da tela.
        desenhos: Array.isArray(body?.projetos) && body.projetos.length
          ? body.projetos.slice(0, 12).map((pr) => ({
              marca: String(pr?.nome || "").slice(0, 60),
              nome: String(pr?.nome || "").slice(0, 120),
              caminho: String(pr?.caminho || ""),
              escolhido: true,
            })).filter((d) => d.marca && d.caminho)
          : [],
        resultados: { dimensional: null, alinhamento: null, acabamento: null, resultado: null, tolerancia, tiposPeca, qtdPeca,
          procedimento: proc?.nome || null, procedimentoId: proc?.id || null,
          // o critério do ensaio visual de solda é fixado pelo PO-06, item 9.4
          criterio: tipo === "VISUAL_SOLDA" ? CRITERIO_PADRAO : null,
          // o especificado do PLP (só na pintura; vazio quando a obra não tem PLP)
          ...semente },
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
