import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { fmtOP } from "@/lib/utils";
import { ArrowLeft, FileText } from "lucide-react";
import MapaCotacaoClient from "./MapaCotacaoClient";
import OPAcoesClient from "./OPAcoesClient";
import BotaoResumoFD from "./BotaoResumoFD";
import PedidosOmieSection from "@/components/PedidosOmieSection";
import FDAvulsosSection from "@/components/FDAvulsosSection";
import ControleFinanceiroOP from "@/components/ControleFinanceiroOP";
import MateriaisOPSection from "@/components/MateriaisOPSection";


const fmtMoeda = (v) =>
  v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";

const STATUS_RM_BADGE = {
  ABERTA:        { label: "Aberta",         className: "bg-torg-blue-50 text-torg-blue" },
  EM_COTACAO:    { label: "Em cotação",     className: "bg-torg-orange-50 text-torg-orange-700" },
  COTADA:        { label: "Cotada",         className: "bg-torg-blue-100 text-torg-blue-800" },
  PEDIDO_GERADO: { label: "Pedido gerado",  className: "bg-torg-dark text-white" },
  CANCELADA:     { label: "Cancelada",      className: "bg-gray-100 text-gray-500" },
};

export default async function PainelOPDetalhe({ params }) {
  // ⚠⚠ DOIS PÚBLICOS NESTA TELA. Matheus (17/09/2026): "libere o painel de OPs para o
  // almoxarifado@torg.com.br, ele precisa ver somente a tela de compras de cada OP." Quem entra
  // pelo ALMOXARIFADO acompanha a obra pelo lado de quem RECEBE material: quais RMs existem, o que
  // já virou pedido, por quanto e quando chega.
  //
  // ⚠⚠ O QUE ELE NÃO VÊ, E POR QUÊ: a verba da obra e o saldo (número de gestão, não de
  // recebimento); o MAPA DE COTAÇÃO, que expõe o preço de CADA concorrente item a item; o resumo FD
  // (documento do cliente), os FDs avulsos e o controle financeiro; e os botões de finalizar e
  // excluir a OP. Ele vê o valor dos pedidos JÁ FECHADOS — foi a linha que o Matheus escolheu.
  //
  // ⚠ Esconder não é o mesmo que não mandar: cada bloco abaixo é montado só quando `ehCompras`, e
  // o `data` do mapa nem é construído para quem não pode vê-lo. Componente escondido com o dado
  // dentro do payload é teatro — o HTML continua tendo o número.
  const user = await requireRole(["ADMIN", "COMPRAS", "ALMOXARIFADO"]);
  const ehCompras = user.tipo === "ADMIN" || (user.modulos ?? []).includes("COMPRAS");

  const op = await prisma.oP.findUnique({
    where: { id: params.opId },
    include: {
      itens: { select: { id: true, valorVerba: true, categoria: true, faturamentoDireto: true } },
      aditivos: { include: { itens: { select: { id: true, valorVerba: true, categoria: true, faturamentoDireto: true } } } },
      rms: {
        include: {
          itens: {
            include: {
              opItem: { select: { categoria: true, faturamentoDireto: true } },
              aditivoItem: { select: { categoria: true, faturamentoDireto: true } },
              // ⚠ preciso do vencedor para saber o que já tem preço decidido mas ainda não virou
              // pedido — é o "comprometido em cotação" que o saldo passou a descontar.
              cotacaoItens: {
                where: { vencedor: true },
                select: { precoUnit: true, qtdCotada: true, ipiPct: true, vencedor: true,
                          cotacao: { select: { status: true } } },
              },
            },
            orderBy: { ordem: "asc" },
          },
          cotacoes: {
            include: {
              itens: {
                select: {
                  id: true, rmItemId: true, precoUnit: true, qtdCotada: true,
                  icmsPct: true, ipiPct: true, vencedor: true, observacao: true,
                  semEstoque: true, prazoEntrega: true,
                },
              },
              pedidosOmie: {
                orderBy: { createdAt: "desc" },
                select: {
                  id: true,
                  codigoPedido: true,
                  numeroPedido: true,
                  total: true,
                  faturamentoDireto: true,
                  status: true,
                  erroOmie: true,
                  fornecedorNome: true,
                  createdAt: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!op) notFound();

  // Conta cotações por RM considerando consolidadas: uma cotação consolidada
  // que tem itens de varias RMs conta pra cada RM envolvida (nao so a primaria).
  const rmIdsDaOP = op.rms.map((r) => r.id);
  const cotItensDaOP = await prisma.cotacaoItem.findMany({
    where: { rmItem: { rmId: { in: rmIdsDaOP } } },
    select: { cotacaoId: true, rmItem: { select: { rmId: true } } },
  });
  const cotacoesPorRm = new Map();
  for (const ci of cotItensDaOP) {
    const rid = ci.rmItem.rmId;
    if (!cotacoesPorRm.has(rid)) cotacoesPorRm.set(rid, new Set());
    cotacoesPorRm.get(rid).add(ci.cotacaoId);
  }

  // EXTRA: cotacoes consolidadas cuja RM PRINCIPAL e de OUTRA OP, mas que
  // tem itens (CotacaoItem.rmItem.rmId) DENTRO dessa OP. Sem esse fetch
  // extra, elas nao aparecem no mapa porque op.rms[].cotacoes so pega
  // cotacoes cujo Cotacao.rmId == rm.id.
  const cotIdsJaIncluidas = new Set();
  for (const rm of op.rms) {
    for (const c of rm.cotacoes) cotIdsJaIncluidas.add(c.id);
  }
  const cotIdsTocandoOP = new Set();
  for (const ci of cotItensDaOP) cotIdsTocandoOP.add(ci.cotacaoId);
  const cotIdsExternas = [...cotIdsTocandoOP].filter((id) => !cotIdsJaIncluidas.has(id));

  if (cotIdsExternas.length > 0) {
    const cotacoesExternas = await prisma.cotacao.findMany({
      where: { id: { in: cotIdsExternas } },
      include: {
        itens: {
          select: {
            id: true, rmItemId: true, precoUnit: true, qtdCotada: true,
            icmsPct: true, ipiPct: true, vencedor: true, observacao: true,
            prazoEntrega: true,
          },
        },
        pedidosOmie: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            codigoPedido: true,
            numeroPedido: true,
            total: true,
            faturamentoDireto: true,
            status: true,
            erroOmie: true,
            fornecedorNome: true,
            createdAt: true,
          },
        },
      },
    });
    // Anexa as cotacoes externas a primeira RM da OP. O buildMatriz no
    // mapa processa cada CotacaoItem pelo rmItemId individual, entao a
    // RM "host" nao importa pra exibicao.
    if (op.rms.length > 0) {
      op.rms[0].cotacoes = [...op.rms[0].cotacoes, ...cotacoesExternas];
    }
  }

  // Verba estimada total (base + aditivos)
  const verbaBase = op.itens.reduce((s, i) => s + i.valorVerba, 0);
  const verbaAditivos = op.aditivos.reduce(
    (s, a) => s + a.itens.reduce((ss, i) => ss + i.valorVerba, 0), 0
  );
  const verbaTotal = verbaBase + verbaAditivos;

  // Total já em pedidos (soma dos PedidoOmie.total CRIADOS nessa OP) + lista flat
  let totalEmPedidos = 0;
  const pedidosFlat = [];
  for (const rm of op.rms) {
    for (const cot of rm.cotacoes) {
      for (const ped of cot.pedidosOmie || []) {
        if (ped.status === "REVERTIDO") continue; // pedidos revertidos somem do historico
        if (ped.status === "CRIADO") totalEmPedidos += ped.total || 0;
        pedidosFlat.push({
          id: ped.id,
          codigoPedido: ped.codigoPedido,
          numeroPedido: ped.numeroPedido,
          total: ped.total,
          faturamentoDireto: ped.faturamentoDireto,
          status: ped.status,
          erroOmie: ped.erroOmie,
          fornecedorNome: ped.fornecedorNome,
          createdAt: ped.createdAt.toISOString(),
          rmNumero: rm.numero,
          cotacaoId: cot.id,
        });
      }
    }
  }

  // FDs avulsos cadastrados direto na OP (sem cotacao)
  const fdAvulsosRaw = await prisma.pedidoOmie.findMany({
    where: { opId: op.id, criadoManualmente: true },
    orderBy: { createdAt: "desc" },
  });
  const pedidosFdAvulsos = fdAvulsosRaw.map((p) => ({
    id: p.id,
    codigoPedido: p.codigoPedido,
    numeroPedido: p.numeroPedido,
    total: p.total,
    faturamentoDireto: p.faturamentoDireto,
    status: p.status,
    fornecedorNome: p.fornecedorNome,
    observacao: p.observacao,
    cnpj: p.cnpj,
    createdAt: p.createdAt.toISOString(),
    criadoManualmente: p.criadoManualmente,
    anexoUrl: p.anexoUrl,
    anexoNome: p.anexoNome,
    categoriaItem: p.categoriaItem,
  }));
  // Soma os FDs avulsos no totalEmPedidos pra saldo refletir.
  // IMPORTANTE: pra FDs avulsos, conta tambem status PENDENTE_OMIE e ERRO —
  // o valor da NF/proposta ja foi comprometido, mesmo se o pedido ainda
  // nao foi criado no Omie. So nao conta CANCELADO.
  for (const p of pedidosFdAvulsos) {
    if (p.status === "REVERTIDO") continue; // pedidos revertidos somem do historico
    if (p.status !== "CANCELADO") totalEmPedidos += p.total || 0;
    pedidosFlat.push({
      ...p,
      erroOmie: null,
      rmNumero: null,
      cotacaoId: null,
    });
  }
  pedidosFlat.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  // ─── O QUE AINDA VAI CONSUMIR A VERBA ─────────────────────────────────────────────────────
  // Vitor (30/08/2026): "aqui era bom ser mais detalhado".
  //
  // ⚠⚠ O SALDO ESTAVA OTIMISTA. Ele descontava só o pedido EMITIDO. Item com vencedor escolhido e
  // pedido ainda não gerado é dinheiro decidido, e aparecia como disponível — o comprador olhava um
  // saldo que já tinha dono. Agora entra como "comprometido em cotação", separado do que já virou
  // pedido, e o saldo livre é o que sobra dos dois.
  //
  // ⚠ E o que ainda NEM foi cotado entra como contagem, não como valor: sem cotação não existe preço,
  // e inventar uma estimativa aqui seria colocar um número onde não há informação.
  const FINAL_ITEM = ["PEDIDO_GERADO", "CANCELADO", "ATENDIDO_ESTOQUE"];
  let comprometidoCotacao = 0, itensSemCotacao = 0;
  const rmsComPendencia = new Set();
  for (const rm of op.rms || []) {
    for (const it of rm.itens || []) {
      if (FINAL_ITEM.includes(it.status)) continue;
      const vencedores = (it.cotacaoItens || []).filter(
        (ci) => ci.vencedor && ci.cotacao?.status === "RECEBIDA"
      );
      if (vencedores.length) {
        for (const ci of vencedores) {
          comprometidoCotacao += (ci.precoUnit || 0) * (ci.qtdCotada || 0) * (1 + (Number(ci.ipiPct) || 0) / 100);
        }
      } else {
        itensSemCotacao++;
      }
      rmsComPendencia.add(rm.numero);
    }
  }
  const saldo = verbaTotal - totalEmPedidos - comprometidoCotacao;
  const consumoPct = verbaTotal > 0 ? ((totalEmPedidos + comprometidoCotacao) / verbaTotal) * 100 : 0;

  // Deduz "Faturamento Direto" por CATEGORIA da OP — usado como fallback
  // quando RMItem.opItemId e null (RM nao vinculada diretamente ao OPItem).
  // Para cada categoria, se TODOS os OPItens dessa categoria sao FD, a
  // categoria inteira e FD. Caso contrario nao-FD (ou misto, tratado como nao-FD).
  const fdPorCategoria = new Map();
  const todosOpItens = [
    ...op.itens.map((i) => ({ categoria: i.categoria, fd: i.faturamentoDireto })),
    ...op.aditivos.flatMap((a) => a.itens.map((i) => ({ categoria: i.categoria, fd: i.faturamentoDireto }))),
  ];
  for (const { categoria, fd } of todosOpItens) {
    if (!categoria) continue;
    if (!fdPorCategoria.has(categoria)) {
      fdPorCategoria.set(categoria, fd);
    } else if (fdPorCategoria.get(categoria) !== fd) {
      // Misto pra essa categoria — vamos prevalecer FD (mais conservador
      // pra evitar erro de calculo). Ou sempre Torg? Optei FD: melhor avisar
      // que algo e FD do que esconder.
      fdPorCategoria.set(categoria, true);
    }
  }

  // Enriquece cada RM com `_fdDerivado` baseado em rm.categoriasOP
  for (const rm of op.rms) {
    let rmFd = null; // null = indefinido (sem categoriasOP)
    if (rm.categoriasOP && rm.categoriasOP.length > 0) {
      // RM e FD se TODAS suas categorias sao FD
      rmFd = rm.categoriasOP.every((c) => fdPorCategoria.get(c) === true);
    }
    rm._fdDerivado = rmFd;
    // Propaga pros RMItens que nao tem opItemId — eles herdam o flag da RM
    for (const it of rm.itens) {
      const temVinculo = it.opItem || it.aditivoItem;
      if (!temVinculo && rmFd === true) {
        // Injeta sintaticamente: cria um opItem fake so com a flag pra que o
        // buildMatriz no client consiga ler igual aos itens vinculados
        it._fdDerivado = true;
      }
    }
  }

  // ⚠⚠ O TOKEN DA COTAÇÃO NUNCA VAI PARA O NAVEGADOR. As duas buscas de cotação acima usam
  // `include` sem `select`, então trazem TODOS os escalares de `Cotacao` — inclusive `token`, que é
  // `@unique` e é a chave do portal PÚBLICO do fornecedor (`/fornecedores/c/[token]`), aberto SEM
  // login, onde ele lê a RM, vê os dados do cliente e ENVIA a proposta.
  //
  // Medido em 17/09/2026 abrindo a OP-097 logado: o token da cotação da VITOR estava no HTML da
  // página. Na prática, quem abria a tela de uma OP recebia o link privado de cotação de todos os
  // fornecedores dela. Isso já valia para ADMIN e COMPRAS — o defeito é anterior a esta tela ganhar
  // um público novo, e é por isso que ele é corrigido aqui e não só escondido do público novo.
  //
  // ⚠ Tirado na SERIALIZAÇÃO, não na consulta, de propósito: o `include` alimenta cálculos do
  // servidor mais acima, e recortá-lo lá arriscaria quebrá-los em silêncio. Aqui a regra é simples
  // e vale para as duas origens (as cotações da RM e as externas anexadas na `rms[0]`).
  const semToken = (rms) => rms.map((rm) => ({
    ...rm,
    cotacoes: (rm.cotacoes || []).map(({ token, ...resto }) => resto),
  }));

  // O identificador da obra, que os dois públicos veem.
  const cabecalho = { id: op.id, numero: op.numero, cliente: op.cliente, obra: op.obra, descricao: op.descricao };

  // ⚠⚠ O PAYLOAD DO MAPA SÓ EXISTE PARA O COMPRAS. Ele carrega `verbaTotal` e as cotações inteiras
  // (preço de cada fornecedor por item). Montá-lo e só não renderizar o componente mandaria tudo
  // isso no HTML para quem não pode ver.
  const data = ehCompras
    ? JSON.parse(JSON.stringify({ ...cabecalho, verbaTotal, rms: semToken(op.rms) }))
    : null;

  // ⚠ A lista de RMs aparece para os dois, mas para o Almoxarifado ela sai PROJETADA: só o que a
  // linha mostra. Sem itens detalhados, sem cotações, sem preço.
  const rmsDaLista = ehCompras ? data.rms : op.rms.map((rm) => ({
    id: rm.id, numero: rm.numero, descricao: rm.descricao, status: rm.status,
    itens: rm.itens.map(() => ({})),     // só a contagem é usada na linha
    cotacoes: rm.cotacoes.map(() => ({})),
  }));

  return (
    <div className="space-y-6 max-w-7xl">
      <Link href="/compras/painel-ops" className="text-sm text-torg-gray hover:text-torg-dark inline-flex items-center gap-1">
        <ArrowLeft size={14} /> Voltar pro Painel de OPs
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight font-mono">{fmtOP(cabecalho.numero)}</h2>
          <p className="text-torg-dark font-medium mt-1">{cabecalho.cliente}</p>
          {cabecalho.obra && <p className="text-sm text-torg-gray">{cabecalho.obra}</p>}
          {cabecalho.descricao && <p className="text-sm text-torg-gray mt-2">{cabecalho.descricao}</p>}
        </div>

        {/* ⚠ Verba, saldo e as ações de finalizar/excluir a OP são de gestão da obra, não de
            recebimento — só o Compras. */}
        {ehCompras && (<>
        <div className="mt-5 pt-5 border-t border-gray-100">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-torg-gray">Verba estimada</p>
              <p className="text-2xl font-extrabold text-torg-dark tabular-nums">{fmtMoeda(verbaTotal)}</p>
              {/* ⚠ base e aditivos separados: somados, ninguém via o que foi acrescido depois */}
              {verbaAditivos > 0 && (
                <p className="text-[10px] text-torg-gray mt-0.5">
                  {fmtMoeda(verbaBase)} + {fmtMoeda(verbaAditivos)} em aditivos
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-torg-gray">Já em pedidos</p>
              <p className="text-2xl font-extrabold text-torg-blue tabular-nums">{fmtMoeda(totalEmPedidos)}</p>
              <p className="text-[10px] text-torg-gray mt-0.5">{pedidosFlat.length} pedido(s)</p>
            </div>
            <div>
              <p className="text-xs text-torg-gray">Comprometido em cotação</p>
              <p className="text-2xl font-extrabold text-torg-orange-700 tabular-nums">{fmtMoeda(comprometidoCotacao)}</p>
              <p className="text-[10px] text-torg-gray mt-0.5">
                {comprometidoCotacao > 0 ? "vencedor escolhido, pedido não emitido" : "nada decidido sem pedido"}
              </p>
            </div>
            <div>
              <p className="text-xs text-torg-gray">Saldo livre</p>
              <p className={`text-2xl font-extrabold tabular-nums ${
                saldo < 0 ? "text-red-600" : consumoPct >= 70 ? "text-torg-orange-700" : "text-torg-dark"
              }`}>
                {fmtMoeda(saldo)}
              </p>
              <p className="text-[10px] text-torg-gray mt-0.5">{consumoPct.toFixed(1)}% da verba comprometida</p>
              {saldo < 0 && <p className="text-[10px] text-red-600 mt-0.5 font-medium">⚠ verba estourada</p>}
              {saldo >= 0 && consumoPct >= 70 && <p className="text-[10px] text-torg-orange-700 mt-0.5 font-medium">⚠ acima de 70%</p>}
            </div>
          </div>

          {/* ⚠ O QUE FALTA COMPRAR ENTRA COMO CONTAGEM, NÃO COMO VALOR: sem cotação não existe
              preço, e estimar aqui seria pôr número onde não há informação. Mas some da tela era
              pior — é ele que diz que a verba ainda vai ser consumida. */}
          {itensSemCotacao > 0 && (
            <div className="mt-4 rounded-lg border border-torg-blue-100 bg-torg-blue-50/40 px-4 py-2.5 text-sm text-torg-dark">
              <strong>{itensSemCotacao}</strong> item(ns) ainda sem cotação, em{" "}
              <strong>{rmsComPendencia.size}</strong> RM(s) — a verba ainda vai ser consumida por eles.
            </div>
          )}
        </div>

        <OPAcoesClient
          opId={op.id}
          numero={op.numero}
          status={op.status}
          qtdRMs={op.rms.length}
          isAdmin={user.role === "ADMIN"}
        />
        </>)}
      </div>

      {/* RMs vinculadas */}
      {rmsDaLista.length > 0 && (
        <div id="rms-vinculadas" className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden scroll-mt-4">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-lg font-semibold text-torg-dark">RMs vinculadas ({rmsDaLista.length})</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 text-xs">
                <span className="text-torg-gray">
                  {pedidosFlat.filter((p) => p.status === "CRIADO").length} pedidos no Omie
                </span>
                {pedidosFlat.filter((p) => p.status === "CRIADO").length > 0 && (
                  <span className="text-torg-orange-700 font-medium tabular-nums">
                    {fmtMoeda(pedidosFlat.filter((p) => p.status === "CRIADO").reduce((s, p) => s + (p.total || 0), 0))}
                  </span>
                )}
              </div>
              {/* ⚠ O Resumo FD é documento para o CLIENTE — não é leitura de almoxarifado. */}
              {ehCompras && <BotaoResumoFD opId={op.id} numero={op.numero} />}
            </div>
          </div>
          <ul className="divide-y divide-gray-100">
            {rmsDaLista.map((rm) => {
              const pedidosDaRm = pedidosFlat.filter((p) => p.rmNumero === rm.numero && p.status === "CRIADO");
              const totalPedidosRm = pedidosDaRm.reduce((s, p) => s + (p.total || 0), 0);
              // Contagem considera cotacoes consolidadas que tocam essa RM
              const qtdCotacoes = cotacoesPorRm.get(rm.id)?.size ?? rm.cotacoes.length;
              return (
              <li key={rm.id} className="px-6 py-3 flex items-center justify-between hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <FileText size={16} className="text-torg-gray" />
                  {/* ⚠ O detalhe da RM continua sendo só do Compras. Para o Almoxarifado o número
                      aparece como TEXTO: link que leva a um 403 é pior que nenhum link. */}
                  {ehCompras ? (
                    <Link href={`/compras/rm/${rm.id}`} className="font-mono font-semibold text-torg-blue hover:underline">
                      {rm.numero}
                    </Link>
                  ) : (
                    <span className="font-mono font-semibold text-torg-dark">{rm.numero}</span>
                  )}
                  <span className="text-sm text-torg-dark">{rm.descricao}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-torg-gray">
                  <span>{rm.itens.length} itens</span>
                  <span>{qtdCotacoes} cotações</span>
                  {pedidosDaRm.length > 0 && (
                    <span className="text-torg-blue font-medium" title={`${pedidosDaRm.length} pedido(s) — ${fmtMoeda(totalPedidosRm)}`}>
                      {pedidosDaRm.length} pedido{pedidosDaRm.length !== 1 ? "s" : ""}
                    </span>
                  )}
                  {(() => {
                    const s = STATUS_RM_BADGE[rm.status] || STATUS_RM_BADGE.ABERTA;
                    return (
                      <span className={`px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${s.className}`}>
                        {s.label}
                      </span>
                    );
                  })()}
                </div>
              </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Materiais da OP — todos os itens com status */}
      <MateriaisOPSection opId={op.id} />

      {/* Mapa de Cotação — preço de cada concorrente, item a item. Só o Compras. */}
      {ehCompras && <MapaCotacaoClient op={data} />}

      {/* ⚠ FDs avulsos trazem valores, observações e anexos do faturamento direto — só o Compras. */}
      {ehCompras && (
      <FDAvulsosSection
        opId={op.id}
        pedidos={pedidosFdAvulsos}
        podeEditar={["ADMIN", "COMERCIAL", "COMPRAS"].includes(user.role)}
        categoriasOP={Array.from(new Set([
          ...op.itens.map((i) => i.categoria).filter(Boolean),
          ...op.aditivos.flatMap((a) => a.itens.map((i) => i.categoria)).filter(Boolean),
        ]))}
        rmsAtivas={(op.rms || [])
          .filter((rm) => !["PEDIDO_GERADO", "CANCELADA"].includes(rm.status))
          .map((rm) => ({ id: rm.id, numero: rm.numero, status: rm.status }))}
      />
      )}

      {/* Pedidos no Omie vinculados a essa OP */}
      <PedidosOmieSection pedidos={pedidosFlat} />

      {/* Controle Financeiro — pedidos + estoque, com valores de gestão. Só o Compras. */}
      {ehCompras && <ControleFinanceiroOP opId={op.id} />}
    </div>
  );
}
