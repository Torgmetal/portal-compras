import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAcesso } from "@/lib/session";
import { simular } from "@/lib/fiscal/simulador";
import { CFOPS, FAMILIA } from "@/lib/fiscal/cfop";
import { CST_IPI } from "@/lib/fiscal/auditoria";

// Simulação fiscal de uma operação, ANTES de a nota existir.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  ncm: z.string().min(1).max(20),
  cfop: z.string().max(6).optional().nullable(),
  // ⚠ Quando vem `opId`, a UF de destino e o "é contribuinte?" saem do CADASTRO, não do formulário:
  // Matheus, no primeiro pedido do módulo — *"eu seleciono a OP e já puxa os dados do meu cliente
  // para entender a cidade que vai ser a NF de venda"*. Menos campo digitado é menos campo errado.
  opId: z.string().max(40).optional().nullable(),
  ufOrigem: z.string().max(2).optional().nullable(),
  ufDestino: z.string().max(2).optional().nullable(),
  destinatarioContribuinte: z.boolean().optional().nullable(),
  valor: z.number().min(0).optional().nullable(),
  cstPretendido: z.string().max(2).optional().nullable(),
});

export async function POST(req) {
  try {
    await requireAcesso({ modulos: ["FISCAL"] });
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
      select: { numero: true, cliente: true, clienteUF: true, clienteCidade: true, clienteIE: true, clienteCnpj: true },
    });
    if (op) {
      obra = op;
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

  return NextResponse.json({
    success: true, ...r, obra,
    descricaoNcm: daTipi?.geral?.descricaoCompleta ?? null,
    // ⚠ A IE não prova contribuinte: a tela precisa poder dizer de onde tirou o palpite.
    indicioContribuinte: obra ? { ie: obra.clienteIE || null } : null,
  });
}

export async function GET() {
  try {
    await requireAcesso({ modulos: ["FISCAL"] });
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
    // ⚠ A lista vai AGRUPADA POR FAMÍLIA e com o âmbito — são 18 códigos, e "5.101" e "6.101"
    // lado a lado num select liso fazem escolher o errado por um dígito.
    familias: Object.values(FAMILIA),
    cfops: CFOPS.map((c) => ({ codigo: c.codigo, codigoFormatado: c.codigoFormatado, resumo: c.resumo, familia: c.familia, ambito: c.ambito })),
    cstIpi: Object.entries(CST_IPI).map(([cst, v]) => ({ cst, rotulo: v.rotulo })),
  });
}
