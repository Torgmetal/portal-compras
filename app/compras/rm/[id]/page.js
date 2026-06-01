import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { ArrowLeft } from "lucide-react";
import { labelCategoria } from "@/lib/op-categorias";
import RMComprasClient from "./RMComprasClient";

// Sempre busca dados frescos do banco


export default async function RMComprasDetail({ params }) {
  const user = await requireRole(["ADMIN", "COMPRAS"]);

  const rm = await prisma.rM.findUnique({
    where: { id: params.id },
    include: {
      op: {
        include: {
          itens: { orderBy: { ordem: "asc" } },
          aditivos: { orderBy: { numero: "asc" }, include: { itens: { orderBy: { ordem: "asc" } } } },
        },
      },
      createdBy: { select: { name: true, email: true } },
      itens: {
        orderBy: { ordem: "asc" },
        include: {
          opItem: { select: { categoria: true, descricao: true, valorVerba: true, qtdContratada: true, unidade: true, faturamentoDireto: true } },
          aditivoItem: { select: { categoria: true, descricao: true, valorVerba: true, qtdContratada: true, unidade: true, faturamentoDireto: true } },
        },
      },
      anexos: { orderBy: { uploadedAt: "asc" } },
    },
  });
  if (!rm) notFound();

  // Cotacoes: tanto as primarias (rmId = essa RM) quanto consolidadas que
  // incluem itens dessa RM via CotacaoItem.rmItem.rmId
  const cotacoesRelacionadas = await prisma.cotacao.findMany({
    where: {
      OR: [
        { rmId: rm.id },
        { itens: { some: { rmItem: { rmId: rm.id } } } },
      ],
    },
    select: {
      id: true, rmId: true, fornecedorNome: true, fornecedorEmail: true, token: true,
      status: true, total: true, totalProposta: true, numeroRevisao: true,
      createdAt: true, prazoResposta: true, recebidaEm: true,
      cnpj: true, nCodOmie: true,
      // Itens completos com rmItem details — pra mostrar todos os itens
      // (incluindo de outras RMs) no modal de lancamento manual
      itens: {
        select: {
          id: true, rmItemId: true, precoUnit: true, qtdCotada: true,
          icmsPct: true, ipiPct: true, observacao: true, vencedor: true,
          rmItem: {
            select: {
              id: true, descricao: true, unidade: true, qtd: true,
              peso: true, status: true,
              rm: { select: { id: true, numero: true } },
            },
          },
        },
      },
      // Anexos enviados pela cotacao (PDFs/imagens da proposta)
      anexos: {
        select: { id: true, nomeArquivo: true, blobUrl: true, tamanho: true, tipo: true, uploadedAt: true },
        orderBy: { uploadedAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  // Anota cada cotacao com a lista de RMs envolvidas e itens cotaveis
  const cotacoes = cotacoesRelacionadas.map((c) => {
    const rmsSet = new Map();
    for (const it of c.itens || []) {
      if (it.rmItem?.rmId) rmsSet.set(it.rmItem.rmId, it.rmItem.rm.numero);
    }
    const rmsVinculadas = Array.from(rmsSet.entries()).map(([id, numero]) => ({ id, numero }));
    // Itens cotaveis (status valido, ainda nao virou pedido) — usado no modal
    const itensCotaveis = (c.itens || [])
      .filter((it) => ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.rmItem?.status))
      .map((it) => ({
        cotacaoItemId: it.id,
        rmItemId: it.rmItemId,
        descricao: it.rmItem.descricao,
        unidade: (Number(it.rmItem.peso) || 0) > 0 ? "KG" : it.rmItem.unidade,
        qtdRm: (Number(it.rmItem.peso) || 0) > 0 ? Number(it.rmItem.peso) : it.rmItem.qtd,
        qtdCotada: it.qtdCotada || ((Number(it.rmItem.peso) || 0) > 0 ? Number(it.rmItem.peso) : it.rmItem.qtd),
        precoUnit: it.precoUnit > 0 ? String(it.precoUnit) : "",
        icmsPct: it.icmsPct != null ? String(it.icmsPct) : "",
        ipiPct: it.ipiPct != null ? String(it.ipiPct) : "",
        observacao: it.observacao || "",
        _rmId: it.rmItem.rm.id,
        _rmNumero: it.rmItem.rm.numero,
        _ehDestaRM: it.rmItem.rm.id === rm.id,
        status: it.rmItem.status,
      }));
    return {
      ...c,
      ehPrimaria: c.rmId === rm.id,
      rmsVinculadas,
      itensCotaveis,
      // limpa itens pra nao bloar payload (itensCotaveis tem o que precisa)
      itens: undefined,
    };
  });
  rm.cotacoes = cotacoes;

  // Marca cada item da RM: tem ou nao proposta de fornecedor com preco > 0?
  // Usado pra distinguir COTADO real (com proposta) de "marcado COTADO mas
  // fornecedor nao deu preço pra esse item" — usuario ve status correto.
  const rmItemIdsComProposta = new Set();
  for (const c of cotacoesRelacionadas) {
    if (c.status !== "RECEBIDA") continue;
    for (const ci of c.itens || []) {
      if ((ci.precoUnit || 0) > 0) rmItemIdsComProposta.add(ci.rmItemId);
    }
  }
  for (const it of rm.itens) {
    it.temPropostaComPreco = rmItemIdsComProposta.has(it.id);
  }

  // Outras RMs ativas (mesma OP em primeiro lugar; depois outras)
  // pra opcao de "vincular mais RMs no envio de cotacao"
  const outrasRMsAtivas = await prisma.rM.findMany({
    where: {
      id: { not: rm.id },
      status: { in: ["ABERTA", "EM_COTACAO", "COTADA"] },
    },
    orderBy: { numero: "asc" },
    include: {
      op: { select: { numero: true, cliente: true } },
      itens: {
        orderBy: { ordem: "asc" },
        select: {
          id: true, descricao: true, status: true, qtd: true, unidade: true, peso: true,
        },
      },
    },
  });

  // Ordena: mesma OP primeiro, depois resto numericamente
  outrasRMsAtivas.sort((a, b) => {
    const sameOpA = a.opId === rm.opId ? 0 : 1;
    const sameOpB = b.opId === rm.opId ? 0 : 1;
    if (sameOpA !== sameOpB) return sameOpA - sameOpB;
    return (a.numero || "").localeCompare(b.numero || "", undefined, { numeric: true });
  });

  // Monta estrutura "OP virtualizada" pro componente MapaCotacaoClient
  // (que espera { id, rms: [...] }). Inclui:
  // - id da OP real (pra chamar /api/op/[id]/sugerir-vencedores etc)
  // - Apenas essa RM no array rms[]
  // - Cotacoes com formato esperado pelo mapa (itens com vencedor, etc)
  //
  // Calcula tambem _fdDerivado por categoria (mesma logica do painel da OP)
  // pra que itens sem opItemId herdem FD via categoriasOP.
  const fdPorCategoria = new Map();
  const todosOpItens = [
    ...(rm.op?.itens || []).map((i) => ({ categoria: i.categoria, fd: i.faturamentoDireto })),
    ...(rm.op?.aditivos || []).flatMap((a) => a.itens.map((i) => ({ categoria: i.categoria, fd: i.faturamentoDireto }))),
  ];
  for (const { categoria, fd } of todosOpItens) {
    if (!categoria) continue;
    if (!fdPorCategoria.has(categoria)) fdPorCategoria.set(categoria, fd);
    else if (fdPorCategoria.get(categoria) !== fd) fdPorCategoria.set(categoria, true);
  }
  const rmFd = (rm.categoriasOP || []).length > 0 &&
    rm.categoriasOP.every((c) => fdPorCategoria.get(c) === true);
  // Propaga pros RMItens sem vinculo direto
  for (const it of rm.itens) {
    if (!it.opItem && !it.aditivoItem && rmFd) {
      it._fdDerivado = true;
    }
  }

  // Cotacoes no formato esperado pelo MapaCotacaoClient
  const cotacoesPorMapa = cotacoesRelacionadas.map((c) => ({
    id: c.id,
    rmId: c.rmId,
    fornecedorNome: c.fornecedorNome,
    status: c.status,
    cnpj: c.cnpj,
    nCodOmie: c.nCodOmie,
    totalProposta: c.totalProposta,
    itens: c.itens, // ja com vencedor, precoUnit, icms/ipiPct
    pedidosOmie: [], // mapa nao precisa (botao "Gerar pedidos" cria novos)
  }));

  const dadosMapa = {
    id: rm.opId || rm.id, // sem OP, usa id da RM como referência
    numero: rm.op?.numero || rm.numero,
    rms: [{
      id: rm.id,
      numero: rm.numero,
      categoriasOP: rm.categoriasOP || [],
      itens: rm.itens,
      cotacoes: cotacoesPorMapa,
    }],
  };

  // Pedidos de compra vinculados aos itens desta RM
  const pedidosVinculados = await prisma.pedidoOmie.findMany({
    where: {
      rmItens: { some: { rmId: rm.id } },
    },
    select: {
      id: true,
      fornecedorNome: true,
      numeroPedido: true,
      codigoPedido: true,
      total: true,
      status: true,
      faturamentoDireto: true,
      createdAt: true,
      rmItens: {
        where: { rmId: rm.id },
        select: { id: true, descricao: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Categorias custom de fornecedor pra filtro/chips no modal de envio
  const categoriasCustom = await prisma.categoriaFornecedor.findMany({
    where: { ativa: true },
    orderBy: [{ ordem: "asc" }, { label: "asc" }],
  });

  const data = JSON.parse(JSON.stringify(rm));
  const outrasRMs = JSON.parse(JSON.stringify(outrasRMsAtivas));
  // Sempre montar dadosMapa — RMs sem OP usam /api/rm/{id} como apiBase
  const dadosMapaSerial = JSON.parse(JSON.stringify(dadosMapa));
  // API base: RM sem OP chama /api/rm/{id}, com OP chama /api/op/{opId}
  const apiBaseMapa = rm.opId ? `/api/op/${rm.opId}` : `/api/rm/${rm.id}`;

  return (
    <div className="space-y-6 max-w-7xl">
      <Link href={rm.tipoRM === "INTERNA" ? "/compras/consumiveis" : "/compras"} className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
        <ArrowLeft size={14} /> Voltar pro Painel
      </Link>
      <RMComprasClient
        rm={data}
        outrasRMs={outrasRMs}
        userRole={user.role}
        dadosMapa={dadosMapaSerial}
        apiBaseMapa={apiBaseMapa}
        categoriasCustom={JSON.parse(JSON.stringify(categoriasCustom))}
        pedidos={JSON.parse(JSON.stringify(pedidosVinculados))}
      />
    </div>
  );
}
