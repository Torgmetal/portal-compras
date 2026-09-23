import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { podeCancelarRM } from "@/lib/permissao-rm";
import { ArrowLeft } from "lucide-react";
import { calcularVerbaOP } from "@/lib/verba-op";
import { paraODocumento, unidadeEfetivaDoItem } from "@/lib/unidades";
import RMComprasClient from "./RMComprasClient";
import ConsultaEstoqueSection from "@/components/compras/ConsultaEstoqueSection";

// Sempre busca dados frescos do banco


// ⚠ O caminho de volta para o que o fornecedor escreveu: o banco guarda na unidade da RM, o modal
// mostra na unidade do documento. Sem fator gravado, devolve os próprios valores.
const doDocumento = (it) => paraODocumento({ qtd: it.qtdCotada, preco: it.precoUnit, fator: it.fatorParaRM });

// ⚠ Desconverter reintroduz ruído de ponto flutuante (49,99 vira 49,98999999999999). Seis casas
// limpam isso sem perder preço de verdade — nenhum fornecedor cota na sétima.
const semRuido = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;

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
  // incluem itens dessa RM via CotacaoItem.rmItem.rmId.
  // Busca cotacaoIds via CotacaoItem primeiro (query leve) pra evitar
  // OR com subquery aninhada que causa OOM no Neon.
  const cotItemsDestaRM = await prisma.cotacaoItem.findMany({
    where: { rmItem: { rmId: rm.id } },
    select: { cotacaoId: true },
  });
  const cotIdsDestaRM = [...new Set(cotItemsDestaRM.map((ci) => ci.cotacaoId))];
  const cotacoesRelacionadas = await prisma.cotacao.findMany({
    where: { id: { in: cotIdsDestaRM } },
    select: {
      id: true, rmId: true, fornecedorNome: true, fornecedorEmail: true, fornecedorId: true, token: true,
      status: true, total: true, totalProposta: true, numeroRevisao: true,
      createdAt: true, prazoResposta: true, recebidaEm: true,
      cnpj: true, nCodOmie: true,
      // ⚠ A observação carrega o texto livre que o fornecedor digitou em prazo/pagamento — é onde a
      // SOUFER escreveu "SEM DISPONIBILIDADE" (T67-011-R00). Sem ela o mapa não tem como avisar.
      observacao: true,
      // ⚠⚠ A CONDIÇÃO DE PAGAMENTO TEM CAMPO PRÓPRIO, e a tela não o lia (Matheus, 16/09/2026:
      // "quando o fornecedor preenche forma de pagamento devia aparecer também na tela pra gente
      // avaliar igual o prazo de entrega"). A rota de submissão grava a resposta em DOIS lugares —
      // `prazoPagamento` e, de novo, dentro de `observacao` como "Pagamento: X" — e até aqui o
      // único lugar que mostrava era o EXCEL do mapa comparativo, que alguém precisa baixar e
      // abrir. Comparar duas propostas em 28 dias e à vista sem isso na tela é comparar preço
      // fingindo que o prazo não existe.
      prazoPagamento: true,
      // ⚠⚠ O FRETE É A TERCEIRA CONDIÇÃO COMERCIAL, e faltava aqui. Matheus (21/09/2026):
      // "preciso que saia também nessa tela que resposta do fornecedor, se é CIF ou FOB". Com
      // FOB o frete NÃO está no preço e a coleta é da Torg — comparar uma proposta CIF com uma
      // FOB só pelo valor é comparar coisas diferentes, e era o que a tela permitia.
      tipoFrete: true,
      // Itens completos com rmItem details — pra mostrar todos os itens
      // (incluindo de outras RMs) no modal de lancamento manual
      itens: {
        select: {
          id: true, rmItemId: true, precoUnit: true, qtdCotada: true,
          icmsPct: true, ipiPct: true, observacao: true, vencedor: true,
          semEstoque: true, prazoEntrega: true,
          // ⚠ A trilha do documento do fornecedor — sem ela o modal reabre sem saber que houve
          // conversão e regrava os números canônicos como se fossem os do papel.
          unidadeCotada: true, fatorParaRM: true,
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
        unidade: unidadeEfetivaDoItem(it.rmItem),
        qtdRm: (Number(it.rmItem.peso) || 0) > 0 ? Number(it.rmItem.peso) : it.rmItem.qtd,
        // ⚠⚠ O MODAL RECEBE OS NÚMEROS DO DOCUMENTO, NÃO OS CANÔNICOS (achado do Codex, 22/09/2026).
        // O banco guarda "2500 UN a R$ 0,4999"; o papel do fornecedor diz "25 CT a R$ 49,99". Sem
        // desconverter aqui, reabrir a proposta e salvar sem mexer em nada regravava 2500 CT — ou,
        // sem o fator junto, arredondava R$ 0,4999 para R$ 0,50 e subia o total de R$ 1.249,75 para
        // R$ 1.250,00. Salvar sem alterar nada não pode mudar valor.
        qtdCotada: it.qtdCotada ? semRuido(doDocumento(it).qtd) : ((Number(it.rmItem.peso) || 0) > 0 ? Number(it.rmItem.peso) : it.rmItem.qtd),
        precoUnit: it.precoUnit > 0 ? String(semRuido(doDocumento(it).preco)) : "",
        unidadeCotada: it.unidadeCotada || "",
        fatorParaRM: it.fatorParaRM != null ? String(it.fatorParaRM) : "",
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
      // ⚠⚠ AS OBSERVAÇÕES DOS ITENS VÊM À PARTE, E POR ISSO. `itens` é apagado logo abaixo para
      // não inchar o payload, e `itensCotaveis` só traz item em status cotável — numa RM já
      // fechada (tudo PEDIDO_GERADO) ele é VAZIO. Era o que escondia o que o fornecedor escreveu
      // item a item: 1.266 observações no banco, e na RI-0007 as 7 da FERRO STORE não apareciam
      // nem depois de a tela passar a mostrá-las (16/09/2026). Aqui vai só o que tem texto — são
      // poucas linhas, e não dependem do status.
      observacoesItens: (c.itens || [])
        .filter((it) => String(it.observacao || "").trim())
        .map((it) => ({ id: it.id, descricao: it.rmItem?.descricao || "Item", observacao: it.observacao })),
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
      // ALUGUEL e MONTAGEM não passam por cotação — não podem ser vinculadas
      tipoRM: { notIn: ["ALUGUEL", "MONTAGEM"] },
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
      statusEntrega: true,
      dataEntregaReal: true,
      nfNumero: true,
      nfSerie: true,
      recebidoEm: true,
      recebidoPor: { select: { name: true } },
      // ⚠⚠ O ACOMPANHAMENTO PÓS-OMIE (Matheus, 16/09/2026): a previsão, cada remarcação dela e as
      // etapas lançadas à mão. Tudo isto já existia no banco — `prazoEntregaPrevisto` em 274 dos
      // 295 pedidos — e só aparecia na tela Compras › Entregas; aqui, onde se olha a RM, não havia
      // como saber se o material chegou no prazo estimado.
      prazoEntregaPrevisto: true,
      prazoOriginal: true,
      // ⚠⚠ A PROPOSTA PENDENTE DO FORNECEDOR VEM JUNTO PORQUE REMARCAR POR DENTRO A MATA. A rota
      // já faz isso (`LIMPAR_PROPOSTA`), mas sem estes campos a tela não teria como AVISAR — e
      // descartar em silêncio a data que o fornecedor mandou é o tipo de coisa que só se descobre
      // quando ele cobra uma resposta que ninguém viu.
      prazoProposto: true,
      prazoPropostoEm: true,
      prazoPropostoId: true,
      prazoHistorico: {
        select: { id: true, prazoAnterior: true, prazoNovo: true, motivo: true, criadoEm: true, alteradoPor: { select: { name: true } } },
        orderBy: { criadoEm: "asc" },
      },
      acompanhamentos: {
        select: { id: true, etapa: true, data: true, observacao: true, registradoPor: { select: { name: true } } },
        orderBy: { data: "asc" },
      },
      // ⚠ As duas últimas fontes de previsão, para a régua daqui não discordar da tela de Prazos:
      // a data que o fornecedor pôs item a item, e o prazo em palavras da observação.
      cotacao: {
        select: {
          observacao: true,
          itens: { where: { vencedor: true }, select: { prazoEntrega: true, vencedor: true } },
        },
      },
      rmItens: {
        where: { rmId: rm.id },
        select: { id: true, descricao: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Verba de material da OP (orçado − comprometido = disponível) pra comparar
  // com os preços cotados desta RM. Pedidos são da OP INTEIRA (não só desta RM).
  let verbaMaterial = null;
  if (rm.opId) {
    const pedidosOP = await prisma.pedidoOmie.findMany({
      where: { opId: rm.opId },
      select: { total: true, status: true, criadoManualmente: true },
    });
    verbaMaterial = calcularVerbaOP(rm.op, pedidosOP);
  }
  // Menor preço cotado desta RM (por item, o menor entre as propostas recebidas)
  const menorPorItem = {};
  for (const c of cotacoesRelacionadas) {
    if (c.status !== "RECEBIDA") continue;
    for (const ci of c.itens || []) {
      if (ci.rmItem?.rm?.id !== rm.id || (ci.precoUnit || 0) <= 0) continue;
      const tot = (ci.precoUnit || 0) * (ci.qtdCotada || ci.rmItem?.qtd || 0);
      if (tot <= 0) continue;
      if (menorPorItem[ci.rmItemId] == null || tot < menorPorItem[ci.rmItemId]) menorPorItem[ci.rmItemId] = tot;
    }
  }
  const menorCotacaoRM = Object.keys(menorPorItem).length ? Object.values(menorPorItem).reduce((s, v) => s + v, 0) : null;

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
      <Link
        href={{ INTERNA: "/compras/consumiveis", ALUGUEL: "/compras/aluguel", MONTAGEM: "/compras/montagem" }[rm.tipoRM] || "/compras"}
        className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1"
      >
        <ArrowLeft size={14} /> Voltar pro Painel
      </Link>
      <RMComprasClient
        rm={data}
        outrasRMs={outrasRMs}
        userRole={user.role}
        podeCancelarRM={podeCancelarRM(user)}
        dadosMapa={dadosMapaSerial}
        apiBaseMapa={apiBaseMapa}
        categoriasCustom={JSON.parse(JSON.stringify(categoriasCustom))}
        pedidos={JSON.parse(JSON.stringify(pedidosVinculados))}
        verbaMaterial={verbaMaterial ? JSON.parse(JSON.stringify(verbaMaterial)) : null}
        menorCotacaoRM={menorCotacaoRM}
      />
      <ConsultaEstoqueSection rmId={rm.id} />
    </div>
  );
}
