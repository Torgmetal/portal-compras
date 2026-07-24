// GET /api/compras/op/[opId]/resumo-fd
// Resumo de Faturamento Direto pro cliente: os itens de FD que cada fornecedor
// venceu na cotação da OP, com dados cadastrais (razão social, CNPJ, endereço),
// forma de pagamento, nº da proposta e prazo de entrega. Endereço vem do Omie
// (best-effort, ConsultarCliente), com fallback cidade/UF do cadastro local.
// O front (BotaoResumoFD) monta o Excel padrão Torg a partir desse JSON.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { mapearFDPorRM, itemEhFD } from "@/lib/faturamento-direto";
import { omieCall } from "@/lib/omie-call";

export const runtime = "nodejs";
export const maxDuration = 60;

const OMIE_CLIENTES_URL = "https://app.omie.com.br/api/v1/geral/clientes/";

// Mesma lógica de quantidade do gerar-pedidos, pra o resumo bater com o pedido.
function calcQtd(rmItem, ci) {
  if (ci.qtdPecasCotada != null) {
    const pesoRm = Number(rmItem.peso) || 0;
    const qtdRm = Number(rmItem.qtd) || 0;
    const pesoLiquido = pesoRm > 0 && qtdRm > 0
      ? Math.round((pesoRm * Number(ci.qtdPecasCotada) / qtdRm) * 100) / 100
      : Number(ci.qtdPecasCotada);
    return Number(ci.qtdCotada) > 0 ? Number(ci.qtdCotada) : pesoLiquido;
  }
  return Number(rmItem.peso) > 0 ? Number(rmItem.peso) : Number(ci.qtdCotada) || 0;
}

// Best-effort e limitado: timeout curto e sem retry de transporte, pra o export
// não pendurar se o Omie estiver lento — o fallback é a cidade/UF local.
const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((r) => setTimeout(() => r(null), ms))]);

async function enderecoOmie(codOmie) {
  if (!codOmie) return null;
  try {
    const d = await omieCall(
      OMIE_CLIENTES_URL,
      "ConsultarCliente",
      { codigo_cliente_omie: Number(codOmie) },
      { timeout: 8000, retryTransport: false }
    );
    if (!d || d.faultstring) return null;
    const cidUf = d.cidade ? `${d.cidade}${d.estado ? "/" + d.estado : ""}` : null;
    const partes = [
      d.endereco,
      d.endereco_numero && `nº ${d.endereco_numero}`,
      d.complemento || null,
      d.bairro,
      cidUf,
      d.cep && `CEP ${d.cep}`,
    ].filter(Boolean);
    return partes.length ? partes.join(", ") : null;
  } catch {
    return null;
  }
}

export async function GET(req, { params }) {
  try {
    await requireRole(["ADMIN", "COMPRAS", "COMERCIAL"]);
  } catch {
    return NextResponse.json({ error: "Apenas Admin, Compras ou Comercial." }, { status: 403 });
  }

  const { opId } = await params;
  const op = await prisma.oP.findUnique({
    where: { id: opId },
    select: { id: true, numero: true, cliente: true, obra: true, refCliente: true },
  });
  if (!op) return NextResponse.json({ error: "OP não encontrada." }, { status: 404 });

  const rms = await prisma.rM.findMany({ where: { opId }, select: { id: true } });
  const rmIds = rms.map((r) => r.id);
  if (rmIds.length === 0) return NextResponse.json({ op, fornecedores: [], totalGeral: 0 });

  const fdPorRM = await mapearFDPorRM(rmIds);

  const cotacoes = await prisma.cotacao.findMany({
    where: {
      status: "RECEBIDA",
      OR: [{ rmId: { in: rmIds } }, { itens: { some: { rmItem: { rmId: { in: rmIds } } } } }],
    },
    select: {
      id: true, fornecedorNome: true, cnpj: true, nCodOmie: true, prazoPagamento: true, numeroProposta: true,
      fornecedor: { select: { razaoSocial: true, nomeFantasia: true, cnpj: true, cidade: true, uf: true, nCodOmie: true, contato: true, telefone: true } },
      itens: {
        where: { vencedor: true, precoUnit: { gt: 0 } },
        select: {
          precoUnit: true, qtdCotada: true, qtdPecasCotada: true, ipiPct: true, prazoEntrega: true,
          rmItem: {
            select: {
              id: true, rmId: true, descricao: true, unidade: true, peso: true, qtd: true, codigo: true, codigoOmieEstoque: true,
              opItem: { select: { faturamentoDireto: true } },
              aditivoItem: { select: { faturamentoDireto: true } },
            },
          },
        },
      },
    },
  });

  // Monta os blocos por fornecedor (só itens de FD desta OP)
  const blocos = [];
  for (const cot of cotacoes) {
    const itensFD = cot.itens.filter((ci) => {
      const ri = ci.rmItem;
      return ri && rmIds.includes(ri.rmId) && itemEhFD(ri, fdPorRM);
    });
    if (itensFD.length === 0) continue;

    const itens = itensFD.map((ci) => {
      const ri = ci.rmItem;
      const ehPeso = (Number(ri.peso) || 0) > 0;
      const qtd = calcQtd(ri, ci);
      const precoUnit = Number(ci.precoUnit) * (1 + (Number(ci.ipiPct) || 0) / 100);
      return {
        codigo: ri.codigoOmieEstoque || ri.codigo || null,
        descricao: ri.descricao,
        qtd,
        unidade: ehPeso ? "KG" : (ri.unidade || "UN"),
        precoUnit,
        total: qtd * precoUnit,
        prazoEntrega: ci.prazoEntrega || null,
      };
    });

    const prazos = [...new Set(itens.map((i) => (i.prazoEntrega ? new Date(i.prazoEntrega).toISOString().slice(0, 10) : null)).filter(Boolean))];

    blocos.push({
      cotacaoId: cot.id,
      razaoSocial: cot.fornecedor?.razaoSocial || cot.fornecedorNome,
      nomeFornecedor: cot.fornecedorNome,
      cnpj: cot.fornecedor?.cnpj || cot.cnpj || null,
      nCodOmie: cot.nCodOmie || cot.fornecedor?.nCodOmie || null,
      cidadeUf: [cot.fornecedor?.cidade, cot.fornecedor?.uf].filter(Boolean).join("/") || null,
      contato: cot.fornecedor?.contato || null,
      telefone: cot.fornecedor?.telefone || null,
      formaPagamento: cot.prazoPagamento || null,
      numeroProposta: cot.numeroProposta || null,
      prazoEntregaUnico: prazos.length === 1 ? prazos[0] : null,
      itens,
      total: itens.reduce((s, i) => s + i.total, 0),
    });
  }

  // Endereço do Omie (best-effort) → fallback cidade/UF. Dedup por código do
  // fornecedor: o mesmo fornecedor pode ter várias propostas na OP (não repete a
  // consulta). Cada consulta é limitada por timeout pra não pendurar o export.
  const codigosUnicos = [...new Set(blocos.map((b) => b.nCodOmie).filter(Boolean))];
  const enderecoPorCod = new Map();
  await Promise.all(
    codigosUnicos.map(async (cod) => {
      enderecoPorCod.set(cod, await withTimeout(enderecoOmie(cod), 12000));
    })
  );
  for (const b of blocos) {
    b.endereco = (b.nCodOmie && enderecoPorCod.get(b.nCodOmie)) || b.cidadeUf || null;
  }

  blocos.sort((a, b) => (a.razaoSocial || "").localeCompare(b.razaoSocial || "", "pt-BR"));
  const totalGeral = blocos.reduce((s, b) => s + b.total, 0);

  return NextResponse.json({ op, fornecedores: blocos, totalGeral });
}
