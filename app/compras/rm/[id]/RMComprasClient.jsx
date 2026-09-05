"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { mergeCategorias } from "@/lib/fornecedor-categorias";
import MapaCotacaoClient from "@/app/compras/painel-ops/[opId]/MapaCotacaoClient";
import BotaoResumoFD from "@/app/compras/painel-ops/[opId]/BotaoResumoFD";
import { CabecalhoRM } from "./_componentes/CabecalhoRM";
import { TabelaItensRM } from "./_componentes/TabelaItensRM";
import { CotacoesList } from "./_componentes/CotacoesList";
import { ModalAtenderEstoque, ModalCancelarItem } from "./_componentes/ModaisItem";
import { ModalEditarCategorias, ModalEncerrarRM } from "./_componentes/ModaisRM";
import { ModalAdicionarItem, ModalEditarRMItem } from "./_componentes/ModaisRMItem";
import { ModalEnviarCotacao } from "./_componentes/ModalEnviarCotacao";
import { ModalLinksEnvio } from "./_componentes/ModalLinksEnvio";
import { ModalPedidoDireto } from "./_componentes/ModalPedidoDireto";
import { PedidosGerados } from "./_componentes/PedidosGerados";
import { VerbaMaterialCard } from "./_componentes/VerbaMaterialCard";
import { STATUS_RM_LABELS } from "./_lib/formatos";

export default function RMComprasClient({ rm, outrasRMs = [], userRole, dadosMapa = null, apiBaseMapa = null, categoriasCustom = [], pedidos = [], verbaMaterial = null, menorCotacaoRM = null }) {
  const router = useRouter();
  const isAdmin = userRole === "ADMIN";
  // Lista mesclada (built-in + custom do banco)
  const todasCategoriasFornecedor = useMemo(
    () => mergeCategorias(categoriasCustom),
    [categoriasCustom]
  );

  const [modalCancelarItem, setModalCancelarItem] = useState(null);
  const [modalAtenderEstoque, setModalAtenderEstoque] = useState(null);
  const [modalEditarItem, setModalEditarItem] = useState(null);
  const [modalAddItem, setModalAddItem] = useState(false);
  const [modalEncerrarRM, setModalEncerrarRM] = useState(false);
  const [modalEnviarCot, setModalEnviarCot] = useState(false);
  const [modalPedidoDireto, setModalPedidoDireto] = useState(false);
  // ALUGUEL e MONTAGEM não passam por cotação — o pedido Omie sai direto
  const ehServicoDireto = rm.tipoRM === "MONTAGEM" || rm.tipoRM === "ALUGUEL";
  // Painel de origem por tipo — voltar/redirecionar sem cair em RMs Materiais
  const painelLista =
    rm.tipoRM === "ALUGUEL" ? "/compras/aluguel" :
    rm.tipoRM === "MONTAGEM" ? "/compras/montagem" :
    rm.tipoRM === "INTERNA" ? "/compras/consumiveis" : "/compras";
  const [modalEditarCategorias, setModalEditarCategorias] = useState(false);
  // Quando o usuario clica "Re-cotar Sem Proposta", o modal abre ja filtrando
  // os itens. Reseta pro modo normal ao fechar.
  const [preSelecionarMode, setPreSelecionarMode] = useState(null);
  const [linksParaEnvio, setLinksParaEnvio] = useState(null);
  const [excluindo, setExcluindo] = useState(false);
  const [erroExcluir, setErroExcluir] = useState("");
  const [desvinculando, setDesvinculando] = useState(false);

  async function desvincularDaOP() {
    if (!window.confirm(
      `Desvincular a RM ${rm.numero} da OP atual?\n\n` +
      `A RM permanece, mas deixa de estar ligada a essa OP. ` +
      `Os vinculos de itens (com itens da OP/aditivo) tambem serao limpos.\n\n` +
      `Use isso quando quiser excluir a OP — depois de desvincular ` +
      `todas as RMs, a OP fica liberada pra exclusao.`
    )) return;
    setErroExcluir("");
    setDesvinculando(true);
    try {
      const res = await fetch(`/api/rm/${rm.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "desvincular" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      router.refresh();
    } catch (e) {
      setErroExcluir(e.message);
    } finally {
      setDesvinculando(false);
    }
  }

  async function excluirRM(force = false) {
    if (!force && !window.confirm(
      `EXCLUIR DEFINITIVAMENTE a RM ${rm.numero}?\n\n` +
      `Apaga itens, cotações, envios e anexos.\n` +
      `Não funciona se a RM já gerou pedido no Omie (a menos que voce confirme que cancelou la).\n\n` +
      `Essa ação NÃO PODE ser desfeita.`
    )) return;
    setErroExcluir("");
    setExcluindo(true);
    try {
      const url = force ? `/api/rm/${rm.id}?force=1` : `/api/rm/${rm.id}`;
      const res = await fetch(url, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        // Backend bloqueia quando ha pedido CRIADO no Omie. Oferece forcar.
        if (data.requiresForce) {
          setExcluindo(false);
          const numeros = (data.pedidosCriados || []).join(", ");
          const ok = window.confirm(
            `${data.error}\n\n` +
            `Pedido(s): ${numeros}\n\n` +
            `Confirma que voce JA cancelou esse(s) pedido(s) no Omie?\n` +
            `Se sim, vou forcar a exclusao da RM no Workspace (so afeta nosso historico, nao reabre nada no Omie).`
          );
          if (ok) return excluirRM(true);
          return;
        }
        throw new Error(data.error || "Erro ao excluir");
      }
      router.push(painelLista);
    } catch (e) {
      setErroExcluir(e.message);
      setExcluindo(false);
    }
  }

  const status = STATUS_RM_LABELS[rm.status] || STATUS_RM_LABELS.ABERTA;
  const pesoTotal = rm.itens.reduce((s, it) => s + (Number(it.peso) || 0), 0);

  // Estatísticas dos itens
  const stats = useMemo(() => {
    const counts = { PENDENTE: 0, EM_COTACAO: 0, COTADO: 0, PEDIDO_GERADO: 0, ATENDIDO_ESTOQUE: 0, CANCELADO: 0 };
    for (const it of rm.itens) counts[it.status] = (counts[it.status] || 0) + 1;
    return counts;
  }, [rm.itens]);

  const podeEncerrar =
    isAdmin && rm.status !== "PEDIDO_GERADO" && rm.status !== "CANCELADA";

  // RM tem itens PEDIDO_GERADO mas a RM em si nao virou PEDIDO_GERADO ainda —
  // mostra botao pra fechar (cancela itens leftover).
  const itensPedidoGerado = stats.PEDIDO_GERADO || 0;
  const itensLeftover =
    (stats.PENDENTE || 0) +
    (stats.EM_COTACAO || 0) +
    (stats.COTADO || 0);
  const podeFecharComoPedido =
    rm.status !== "PEDIDO_GERADO" &&
    rm.status !== "CANCELADA" &&
    itensPedidoGerado > 0;

  // Quantidade de itens "Sem proposta" (COTADO mas sem precoUnit > 0 em
  // nenhuma cotacao recebida) — usado pra mostrar atalho de re-cotacao.
  const qtdSemPropostaRm = rm.itens.filter(
    (it) => it.status === "COTADO" && it.temPropostaComPreco === false
  ).length;

  const [fechandoComoPedido, setFechandoComoPedido] = useState(false);
  const fecharComoPedidoGerado = async () => {
    const msg = itensLeftover > 0
      ? `Atenção: vai marcar a RM como Pedido Gerado e CANCELAR ${itensLeftover} item(ns) que ainda não viraram pedido. Continuar?`
      : `Marcar RM como Pedido Gerado?`;
    if (!window.confirm(msg)) return;
    setFechandoComoPedido(true);
    try {
      const res = await fetch(`/api/rm/${rm.id}/fechar-como-pedido`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      router.refresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setFechandoComoPedido(false);
    }
  };

  return (
    <>
      {/* Cabeçalho */}
      <CabecalhoRM
        rm={rm}
        status={status}
        pesoTotal={pesoTotal}
        stats={stats}
        isAdmin={isAdmin}
        userRole={userRole}
        ehServicoDireto={ehServicoDireto}
        qtdSemPropostaRm={qtdSemPropostaRm}
        podeFecharComoPedido={podeFecharComoPedido}
        fecharComoPedidoGerado={fecharComoPedidoGerado}
        fechandoComoPedido={fechandoComoPedido}
        itensLeftover={itensLeftover}
        itensPedidoGerado={itensPedidoGerado}
        podeEncerrar={podeEncerrar}
        excluirRM={excluirRM}
        excluindo={excluindo}
        desvincularDaOP={desvincularDaOP}
        desvinculando={desvinculando}
        erroExcluir={erroExcluir}
        setModalEditarCategorias={setModalEditarCategorias}
        setModalPedidoDireto={setModalPedidoDireto}
        setPreSelecionarMode={setPreSelecionarMode}
        setModalEnviarCot={setModalEnviarCot}
        setModalEncerrarRM={setModalEncerrarRM}
      />

      {/* Itens */}
      <TabelaItensRM
        rm={rm}
        isAdmin={isAdmin}
        userRole={userRole}
        ehServicoDireto={ehServicoDireto}
        setModalAddItem={setModalAddItem}
        setModalEditarItem={setModalEditarItem}
        setModalAtenderEstoque={setModalAtenderEstoque}
        setModalCancelarItem={setModalCancelarItem}
      />

      {/* Verba de material da OP — quanto ainda tem pra comprar × preço cotado */}
      {verbaMaterial && verbaMaterial.verbaTotal > 0 && (
        <VerbaMaterialCard verba={verbaMaterial} menorCotacao={menorCotacaoRM} categoriasRM={rm.categoriasOP || []} />
      )}

      {/* Mapa de Cotação — escopo dessa RM (mesma UI do painel de OPs) */}
      {dadosMapa && rm.cotacoes.some((c) => c.status === "RECEBIDA") && (
        <div>
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <h3 className="text-lg font-semibold text-torg-dark">Mapa de Cotação</h3>
            {rm.opId && (
              <BotaoResumoFD opId={rm.opId} numero={rm.op?.numero} />
            )}
          </div>
          <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded-lg px-4 py-2 mb-2 text-xs text-torg-dark flex items-start gap-2">
            <span>💡</span>
            <span>
              {rm.opId
                ? <>Mapa filtrado pra esta RM. Clique nas células pra escolher vencedores e gerar os pedidos. O botão &quot;Gerar Pedidos Omie&quot; abaixo cria pedidos pra <strong>todos os itens vencedores dessa OP</strong> (não só desta RM).</>
                : <>Mapa de cotações desta RM. Clique nas células pra escolher vencedores e gerar pedidos no Omie.</>
              }
            </span>
          </div>
          <MapaCotacaoClient op={dadosMapa} apiBase={apiBaseMapa || undefined} />
        </div>
      )}

      {/* Pedidos gerados */}
      {pedidos.length > 0 && (
        <PedidosGerados pedidos={pedidos} rmId={rm.id} onRevertido={() => router.refresh()} isAdmin={isAdmin} userRole={userRole} />
      )}

      {/* Cotações — ALUGUEL/MONTAGEM não passam por cotação */}
      {rm.cotacoes.length > 0 ? (
        <CotacoesList rm={rm} outrasRMs={outrasRMs} />
      ) : ehServicoDireto ? (
        <div className="bg-emerald-50/60 border border-emerald-100 rounded-lg p-4 text-sm text-torg-dark">
          <p className="font-medium">Sem cotação — pedido direto no Omie</p>
          <p className="text-torg-gray text-xs mt-1">
            {rm.tipoRM === "ALUGUEL" ? "Aluguel de equipamentos" : "Medição de montagem"}: registre e use o botão
            &quot;Gerar pedido Omie&quot; acima — o custo entra direto no extrato da OP.
          </p>
        </div>
      ) : (
        <div className="bg-torg-blue-50/40 border border-torg-blue-100 rounded-lg p-4 text-sm text-torg-dark">
          <p className="font-medium">Nenhuma cotação enviada ainda</p>
          <p className="text-torg-gray text-xs mt-1">
            Use o botão &quot;Enviar Cotação&quot; acima pra solicitar propostas aos fornecedores.
          </p>
        </div>
      )}

      {/* Modais */}
      {modalPedidoDireto && (
        <ModalPedidoDireto
          rm={rm}
          onClose={() => setModalPedidoDireto(false)}
          onGerado={() => { setModalPedidoDireto(false); router.refresh(); }}
        />
      )}
      {modalEnviarCot && (
        <ModalEnviarCotacao
          preSelecionarMode={preSelecionarMode}
          rm={rm}
          outrasRMs={outrasRMs}
          categoriasFornecedor={todasCategoriasFornecedor}
          onClose={() => setModalEnviarCot(false)}
          onSent={(result) => { setModalEnviarCot(false); setLinksParaEnvio(result); router.refresh(); }}
        />
      )}
      {linksParaEnvio && (
        <ModalLinksEnvio
          rm={rm}
          links={linksParaEnvio}
          onClose={() => setLinksParaEnvio(null)}
        />
      )}
      {modalCancelarItem && (
        <ModalCancelarItem
          item={modalCancelarItem}
          rmId={rm.id}
          onClose={() => setModalCancelarItem(null)}
          onSaved={() => router.refresh()}
        />
      )}
      {modalAtenderEstoque && (
        <ModalAtenderEstoque
          item={modalAtenderEstoque}
          rmId={rm.id}
          onClose={() => setModalAtenderEstoque(null)}
          onSaved={() => { setModalAtenderEstoque(null); router.refresh(); }}
        />
      )}
      {modalEditarItem && (
        <ModalEditarRMItem
          item={modalEditarItem}
          rmId={rm.id}
          onClose={() => setModalEditarItem(null)}
          onSaved={() => { setModalEditarItem(null); router.refresh(); }}
        />
      )}
      {modalAddItem && (
        <ModalAdicionarItem
          rmId={rm.id}
          onClose={() => setModalAddItem(false)}
          onSaved={() => { setModalAddItem(false); router.refresh(); }}
        />
      )}
      {modalEncerrarRM && (
        <ModalEncerrarRM
          rm={rm}
          onClose={() => setModalEncerrarRM(false)}
          onSaved={() => { router.refresh(); router.push(painelLista); }}
        />
      )}
      {modalEditarCategorias && (
        <ModalEditarCategorias
          rm={rm}
          onClose={() => setModalEditarCategorias(false)}
          onSaved={() => { setModalEditarCategorias(false); router.refresh(); }}
        />
      )}
    </>
  );
}

// ─── PEDIDOS GERADOS (com opcao de reverter e marcar recebido) ──
