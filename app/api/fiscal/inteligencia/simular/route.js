import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAcesso } from "@/lib/session";
import { simular } from "@/lib/fiscal/simulador";
import { CFOPS, FAMILIA, paresDeCfop } from "@/lib/fiscal/cfop";
import { materiaPrimaDaOP } from "@/lib/faturamento-direto";
import { CST_IPI } from "@/lib/fiscal/auditoria";
import { verbetesAprovados } from "@/lib/fiscal/registro-classificacao";
import { verbetesDoCodigo, procurarClassificacao, compararNcm } from "@/lib/fiscal/classificacao-produto";

// Simulação fiscal de uma operação, ANTES de a nota existir.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  ncm: z.string().min(1).max(20),
  // ⚠ Aceita o código único ("6101") ou o par dentro/fora do estado ("5101/6101") — neste caso é
  // o âmbito, derivado das UFs, que decide qual dos dois vale.
  cfop: z.string().max(12).regex(/^\d{4}(\/\d{4})?$/, "CFOP inválido.").optional().nullable(),
  // ⚠ Quando vem `opId`, a UF de destino e o "é contribuinte?" saem do CADASTRO, não do formulário:
  // Matheus, no primeiro pedido do módulo — *"eu seleciono a OP e já puxa os dados do meu cliente
  // para entender a cidade que vai ser a NF de venda"*. Menos campo digitado é menos campo errado.
  opId: z.string().max(40).optional().nullable(),
  ufOrigem: z.string().max(2).optional().nullable(),
  ufDestino: z.string().max(2).optional().nullable(),
  destinatarioContribuinte: z.boolean().optional().nullable(),
  valor: z.number().min(0).optional().nullable(),
  cstPretendido: z.string().max(2).optional().nullable(),
  // ⚠⚠ A DESCRIÇÃO DA PEÇA É CAMPO PRÓPRIO, E NÃO SAI DO NCM (achado do Codex, 23/09/2026).
  // Procurar o verbete pelo NCM que está sendo conferido seria confirmação circular: o registro
  // devolveria justamente o que a pessoa digitou. O que localiza a decisão é a NATUREZA da peça.
  descricaoProduto: z.string().trim().max(300).optional().nullable(),
  codigoProduto: z.string().trim().max(60).optional().nullable(),
});

export async function POST(req) {
  try {
    await requireAcesso({ modulos: ["FISCAL", "FINANCEIRO"] });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try {
    body = schema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ success: false, error: e.issues?.[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const entrada = { ...body };
  let obra = null;
  if (body.opId) {
    const op = await prisma.oP.findUnique({
      where: { id: body.opId },
      select: {
        numero: true, cliente: true, clienteUF: true, clienteCidade: true, clienteIE: true, clienteCnpj: true,
        // ⚠⚠ O FATURAMENTO DIRETO JÁ DIZ DE QUEM É A MATÉRIA-PRIMA — é decisão do Comercial no
        // fechamento do contrato, e o simulador estava perguntando de novo o que já estava gravado.
        itens: { select: { faturamentoDireto: true } },
        aditivos: { select: { itens: { select: { faturamentoDireto: true } } } },
      },
    });
    if (op) {
      obra = { numero: op.numero, cliente: op.cliente, clienteUF: op.clienteUF, clienteCidade: op.clienteCidade, clienteIE: op.clienteIE, clienteCnpj: op.clienteCnpj };
      entrada.materiaPrima = materiaPrimaDaOP(op);
      entrada.ufDestino = entrada.ufDestino || op.clienteUF || null;
      // ⚠⚠ A INSCRIÇÃO ESTADUAL É INDÍCIO, NÃO PROVA — e a tela diz isso. Cliente com IE quase sempre
      // é contribuinte, mas "ISENTO" e cadastro desatualizado existem. Tratar o indício como fato
      // faria o portal decidir o tratamento do ICMS a partir de um campo que ninguém confere.
      if (entrada.destinatarioContribuinte == null) {
        const ie = String(op.clienteIE ?? "").trim();
        entrada.destinatarioContribuinte = ie && !/isent/i.test(ie) ? true : null;
      }
    }
  }
  // ⚠ A origem é sempre a TORG (Conchal/SP) salvo informação em contrário — é o estabelecimento
  // industrial que emite.
  entrada.ufOrigem = entrada.ufOrigem || "SP";

  const ncm = String(body.ncm).replace(/\D/g, "");
  const versao = await prisma.fiscalTipiVersao.findFirst({ where: { status: "ATIVA" }, include: { arquivo: true } });
  if (!versao) return NextResponse.json({ success: false, error: "Nenhuma versão da TIPI está ativa." }, { status: 409 });

  const linhas = await prisma.fiscalTipiLinha.findMany({ where: { versaoId: versao.id, nivel: "NCM", codigo: ncm } });
  const daTipi = linhas.length ? { geral: linhas.find((l) => !l.ex) ?? null, excecoes: linhas.filter((l) => l.ex) } : undefined;

  const r = simular(entrada, daTipi, {
    versaoId: versao.id, sha256: versao.arquivo.sha256,
    observadoEm: versao.observadoEm, vigenciaDeclarada: Boolean(versao.vigenciaInicio),
  });

  // ── A DECISÃO HUMANA, SE ALGUÉM JÁ A REGISTROU ────────────────────────────
  //
  // ⚠⚠ ISTO NÃO PREENCHE O NCM, E NÃO PODE. Correspondência textual localiza a decisão; ela não
  // prova que a decisão fala desta peça. A tela mostra o verbete, o aprovador e o trecho que casou
  // — quem enquadra é quem conhece a peça.
  const verbetes = await verbetesAprovados();
  const classificacao = body.descricaoProduto
    ? (() => {
        const achado = procurarClassificacao(
          { descricaoItem: body.descricaoProduto, codigo: body.codigoProduto },
          verbetes === null ? null : verbetesDoCodigo(verbetes, body.codigoProduto),
        );
        return { ...achado, comparacao: compararNcm(achado, ncm) };
      })()
    : null;

  return NextResponse.json({
    success: true, ...r, obra, classificacao,
    descricaoNcm: daTipi?.geral?.descricaoCompleta ?? null,
    // ⚠ A IE não prova contribuinte: a tela precisa poder dizer de onde tirou o palpite.
    indicioContribuinte: obra ? { ie: obra.clienteIE || null } : null,
  });
}

export async function GET() {
  try {
    await requireAcesso({ modulos: ["FISCAL", "FINANCEIRO"] });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }
  // As OPs abertas, para o seletor — e as operações e CSTs que o formulário oferece.
  const ops = await prisma.oP.findMany({
    where: { status: "ABERTA" },
    select: { id: true, numero: true, cliente: true, clienteUF: true, clienteCidade: true },
    orderBy: { numero: "desc" }, take: 200,
  });
  return NextResponse.json({
    success: true, ops,
    // ⚠ A lista vai AGRUPADA POR FAMÍLIA e em PARES dentro/fora do estado: são 18 códigos, e
    // "5.101" e "6.101" lado a lado num select liso fazem escolher o errado por um dígito. O par
    // tira a escolha das mãos de quem emite — o dígito sai das UFs.
    familias: Object.values(FAMILIA),
    pares: paresDeCfop(),
    cfops: CFOPS.map((c) => ({ codigo: c.codigo, codigoFormatado: c.codigoFormatado, resumo: c.resumo, quando: c.quando, familia: c.familia, ambito: c.ambito })),
    cstIpi: Object.entries(CST_IPI).map(([cst, v]) => ({ cst, rotulo: v.rotulo })),
  });
}
