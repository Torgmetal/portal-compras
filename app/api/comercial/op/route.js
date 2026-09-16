import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { receitasDaPlanilhaComercial } from "@/lib/op-categorias";
import { clientePorNome, salvarReferencias } from "@/lib/referencias-op";
import { termosEfetivos } from "@/lib/referencias-cliente";
import { log } from "@/lib/log";
const registro = log("op");
import { prisma } from "@/lib/prisma";
import { normalizarEscopo } from "@/lib/qualidade-escopo";
import { requireRole } from "@/lib/session";
import { prepararOpConferida } from "@/lib/lqc-op-servidor";
import { validarPreenchimentoLqc } from "@/lib/lqc-op-conferencia";
import { criarOpComOrigemLqc } from "@/lib/lqc-op-criar";
import { criarCronogramaPadrao } from "@/lib/cronograma-padrao";

export const maxDuration = 60;

const itemSchema = z.object({
  categoria: z.string().min(1),
  tipo: z.enum(["VERBA", "ESTRUTURA", "AREA", "ALUGUEL", "GENERICO"]),
  descricao: z.string().min(1),
  codigoOmie: z.string().optional().nullable(),
  localEstoque: z.string().optional().nullable(),
  unidade: z.string().optional().nullable(),
  qtdContratada: z.number().optional().nullable(),
  cmcMedio: z.number().optional().nullable(),
  meses: z.number().optional().nullable(),
  valorPorMes: z.number().optional().nullable(),
  capacidade: z.string().optional().nullable(),
  valorVerba: z.number().min(0),
  faturamentoDireto: z.boolean().default(false),
  observacao: z.string().optional().nullable(),
});

const opSchema = z.object({
  numero: z.string().min(1).transform((s) => s.trim().toUpperCase()),
  cliente: z.string().min(1).transform((s) => s.trim()),
  obra: z.string().optional().nullable(),
  refCliente: z.string().optional().nullable(),
  descricao: z.string().optional().nullable(),
  dataInicio: z.string().optional().nullable(),
  dataFimPrevista: z.string().optional().nullable(),
  estoqueMaterial: z.union([z.enum(["PROPRIO_TORG", "CLIENTE_TERCEIRO"]),z.literal("")]).optional().nullable(),
  tipoDataBook: z.union([z.enum(["PADRAO_TORG", "SNQC", "RELATORIO_ACOMPANHAMENTO"]),z.literal("")]).optional().nullable(),
  // Escopo de qualidade: quais relatórios esta obra exige. Chega como lista de ids;
  // quem valida e casa com um preset é lib/qualidade-escopo.js — um só lugar.
  escopoQualidade: z.array(z.string()).optional().nullable(),
  // vínculo com o orçamento do Comercial (SharePoint) + o que foi lido da planilha de estudo
  orcamentoPasta: z.string().optional().nullable(),
  orcamentoRef: z.string().optional().nullable(),
  propostas: z.any().optional().nullable(),
  estudoArquivo: z.any().optional().nullable(),
  estudoDados: z.any().optional().nullable(),
  itens: z.array(itemSchema).min(1),
  // referências do cliente com as palavras dele: { projetos, pedidos:[{codigo, itens, tags…}], outros } (lib/referencias-cliente)
  referencias: z.any().optional().nullable(),
  estudoFabricacaoId: z.string().min(1).optional(),
  conferenciaCodigo: z.string().optional(),
  estudoAtualizadoEm: z.string().datetime().optional(),
  valorContrato: z.number().positive().optional(),
});

export async function POST(req) {
  let user;
  try {
    user = await requireRole(["ADMIN", "COMERCIAL"]);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.message === "Unauthorized" ? 401 : 403 });
  }

  let body;
  try {
    body = opSchema.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Dados inválidos: " + (e.message || "") }, { status: 400 });
  }

  if (body.estudoFabricacaoId && (!body.estudoAtualizadoEm || !body.valorContrato)) {
    return NextResponse.json({error:"Confira a origem da LQC e informe o valor contratado."},{status:400});
  }
  const existe = await prisma.oP.findUnique({ where: { numero: body.numero } });
  if (existe) {
    return NextResponse.json(
      { error: `Já existe uma OP com o número ${body.numero}.` },
      { status: 409 }
    );
  }

  const dadosOp = {
    data: {
      numero: body.numero,
      cliente: body.cliente,
      obra: body.obra || null,
      refCliente: body.refCliente || null,
      descricao: body.descricao || null,
      dataInicio: body.dataInicio ? new Date(body.dataInicio) : null,
      dataFimPrevista: body.dataFimPrevista ? new Date(body.dataFimPrevista) : null,
      estoqueMaterial: body.estoqueMaterial || null,
      tipoDataBook: body.tipoDataBook || null,
      escopoQualidade: normalizarEscopo(body.escopoQualidade),
      orcamentoPasta: body.orcamentoPasta || null,
      orcamentoRef: body.orcamentoRef || null,
      propostas: body.propostas || null,
      estudoArquivo: body.estudoArquivo || null,
      estudoDados: body.estudoDados || null,
      createdById: user.id,
      // RECEITAS DO CONTRATO — o lado da VENDA, derivado do estudo aqui no servidor (regra única,
      // vale pra OP nova e pro aditivo). Vitor (19/08): "a receita do contrato seria o valor a ser
      // faturado e itens de contrato seria o valor que o Compras deveria comprar".
      // Os `itens` acima carregam a VERBA DE COMPRA; estas linhas carregam o que se fatura.
      receitas: { create: receitasDaPlanilhaComercial(body.estudoDados?.comercial, body.estudoDados?.bdi) },
      itens: {
        create: body.itens.map((it, idx) => ({
          ordem: idx,
          categoria: it.categoria,
          tipo: it.tipo,
          descricao: it.descricao,
          codigoOmie: it.codigoOmie || null,
          localEstoque: it.localEstoque || null,
          unidade: it.unidade || null,
          qtdContratada: it.qtdContratada ?? null,
          cmcMedio: it.cmcMedio ?? null,
          meses: it.meses ?? null,
          valorPorMes: it.valorPorMes ?? null,
          capacidade: it.capacidade || null,
          valorVerba: it.valorVerba,
          faturamentoDireto: it.faturamentoDireto,
          observacao: it.observacao || null,
        })),
      },
    },
  };
  let op;
  try {
    if (body.estudoFabricacaoId) {
      const estudo = await prisma.estudoFabricacao.findUnique({where:{id:body.estudoFabricacaoId},include:{orcamento:true}});
      if (!estudo) throw new Error("LQC não encontrada.");
      const previaConferida = await prepararOpConferida(estudo);
      validarPreenchimentoLqc(previaConferida, body);
      op = await criarOpComOrigemLqc(prisma, {previaConferida,estudoId:body.estudoFabricacaoId, atualizadoEm:body.estudoAtualizadoEm, userId:user.id, dadosConfirmados:{valorContrato:body.valorContrato,cliente:body.cliente,obra:body.obra || null,itens:body.itens}},
        async (tx, previa) => tx.oP.create({data:{...dadosOp.data,
          orcamentoRef:previa.orcamentoRef,
          estudoDados:previa.estudoDados,
          estudoArquivo:previa.estudoArquivo,
          orcamentoPasta:previa.orcamentoPasta,
          receitas:{create:[{ordem:0,categoria:"FABRICACAO",tipoPreco:"VALOR",
            descricao:`Contrato — ${previa.form.obra || previa.form.cliente}`,
            valor:body.valorContrato,createdById:user.id,
            observacao:`Originado da ${previa.codigo}; valor contratado confirmado na abertura.`}]},
        }}));
    } else op = await prisma.oP.create(dadosOp);
  } catch(e) {
    const conflito = e.code === "P2002" || e.code === "P2034";
    return NextResponse.json({error:conflito ? "O cadastro mudou durante a criação. Atualize a página e confira se a OP já foi criada." : e.message},{status:409});
  }

  // CRONOGRAMA AUTOMÁTICO — nasce junto da OP, com a data que o Comercial informou (Vitor 19/08:
  // "abriu a OP, abre cronograma automático… o ideal seria o cálculo exatamente de acordo com as
  // datas que vêm indicadas pelo comercial"). Nunca derruba a criação da OP.
  // ⚠ cadastro do cliente + referências (TPR/OC/TAG com as palavras dele) — nunca derruba a criação
  try {
    const cliente = await clientePorNome(op.cliente);
    if (cliente) await prisma.oP.update({ where: { id: op.id }, data: { clienteId: cliente.id } });
    if (body.referencias && typeof body.referencias === "object") {
      await salvarReferencias({ opId: op.id, aditivoId: null, entrada: body.referencias, termos: termosEfetivos(cliente?.termos) });
    }
  } catch (e) { registro.erro("referências do cliente não gravadas", { opId: op.id, erro: e.message }); }

  try {
    await criarCronogramaPadrao({
      opId: op.id, opNumero: op.numero, titulo: op.obra || `OP-${op.numero}`,
      dataInicio: op.dataInicio, dataFim: op.dataFimPrevista,
    });
  } catch {}

  if (!body.estudoFabricacaoId) await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "create_op",
      entity: "OP",
      entityId: op.id,
      diff: { numero: op.numero, cliente: op.cliente, itens: body.itens.length },
    },
  });

  revalidatePath("/comercial");
  return NextResponse.json({ id: op.id, numero: op.numero });
}
