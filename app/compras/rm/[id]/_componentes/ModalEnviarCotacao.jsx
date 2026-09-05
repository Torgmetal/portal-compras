"use client";
import { useState, useMemo, useEffect } from "react";
import { Loader2, AlertCircle, RotateCcw } from "lucide-react";
import { CATEGORIAS_FORNECEDOR_BUILTIN } from "@/lib/fornecedor-categorias";
import { montarFornecedoresEnvio } from "../_lib/fornecedores-envio";
import { FornecedoresPicker } from "./FornecedoresPicker";
import { SelecaoItensCotacao } from "./SelecaoItensCotacao";
import { VincularOutrasRMs } from "./VincularOutrasRMs";
import { Modal } from "./Modal";

export function ModalEnviarCotacao({ rm, outrasRMs = [], onClose, onSent, preSelecionarMode = null, categoriasFornecedor = CATEGORIAS_FORNECEDOR_BUILTIN }) {
  // RMs incluidas no envio: a atual sempre, mais as escolhidas via checkbox
  const [rmsExtrasIds, setRmsExtrasIds] = useState(new Set());
  // Itens cotaveis (RM atual + extras selecionadas), recalculado quando muda extras
  const todosItensCotaveis = useMemo(() => {
    const base = rm.itens
      .filter((it) => ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status))
      .map((it) => ({ ...it, _rm: { id: rm.id, numero: rm.numero, principal: true } }));
    const extras = outrasRMs
      .filter((r) => rmsExtrasIds.has(r.id))
      .flatMap((r) =>
        r.itens
          .filter((it) => ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status))
          .map((it) => ({ ...it, _rm: { id: r.id, numero: r.numero, principal: false } }))
      );
    return [...base, ...extras];
  }, [rm, outrasRMs, rmsExtrasIds]);

  // Itens selecionados — começa de acordo com o preSelecionarMode:
  // - "sem-proposta": só itens marcados COTADO sem proposta com preço
  // - null/default: todos os itens cotaveis (comportamento normal)
  const [itensSelecionados, setItensSelecionados] = useState(() => {
    if (preSelecionarMode === "sem-proposta") {
      return new Set(
        rm.itens
          .filter((it) => it.status === "COTADO" && it.temPropostaComPreco === false)
          .map((it) => it.id)
      );
    }
    return new Set(
      rm.itens
        .filter((it) => ["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status))
        .map((it) => it.id)
    );
  });
  // Quando uma RM extra é incluída, marca os itens dela automaticamente.
  // Quando é removida, desmarca os ids dela.
  const toggleRmExtra = (rmExtraId) => {
    setRmsExtrasIds((prev) => {
      const next = new Set(prev);
      if (next.has(rmExtraId)) {
        next.delete(rmExtraId);
        // Tira itens dessa RM do selecionado
        const rmExtra = outrasRMs.find((r) => r.id === rmExtraId);
        if (rmExtra) {
          setItensSelecionados((sel) => {
            const out = new Set(sel);
            for (const it of rmExtra.itens) out.delete(it.id);
            return out;
          });
        }
      } else {
        next.add(rmExtraId);
        // Adiciona itens cotáveis dessa RM
        const rmExtra = outrasRMs.find((r) => r.id === rmExtraId);
        if (rmExtra) {
          setItensSelecionados((sel) => {
            const out = new Set(sel);
            for (const it of rmExtra.itens) {
              if (["PENDENTE", "EM_COTACAO", "COTADO"].includes(it.status)) out.add(it.id);
            }
            return out;
          });
        }
      }
      return next;
    });
  };

  // Vendor List (fornecedores cadastrados) — busca quando modal abre
  const [fornecedoresCadastrados, setFornecedoresCadastrados] = useState([]);
  const [carregandoForn, setCarregandoForn] = useState(true);
  const [fornSelecionadosIds, setFornSelecionadosIds] = useState(new Set());
  const [filtroCatForn, setFiltroCatForn] = useState(null);
  const [buscaForn, setBuscaForn] = useState("");
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/fornecedores");
        const data = await res.json();
        setFornecedoresCadastrados(data.fornecedores || []);
      } catch (_) { /* silently */ }
      finally { setCarregandoForn(false); }
    })();
  }, []);

  // Linhas avulsas (nome + email) pra fornecedor nao cadastrado. Default vazio.
  const [fornecedoresLinhas, setFornecedoresLinhas] = useState([{ nome: "", email: "" }]);
  const addFornecedor = () => setFornecedoresLinhas((p) => [...p, { nome: "", email: "" }]);
  const setFornecedor = (idx, campo, valor) =>
    setFornecedoresLinhas((p) => p.map((f, i) => (i === idx ? { ...f, [campo]: valor } : f)));
  const removerFornecedor = (idx) =>
    setFornecedoresLinhas((p) => (p.length === 1 ? [{ nome: "", email: "" }] : p.filter((_, i) => i !== idx)));

  // Fornecedores da última cotação (pra pré-marcar no modo "re-enviar").
  const fornecedoresAnteriores = useMemo(() => {
    const seen = new Set(), out = [];
    for (const c of (rm.cotacoes || [])) {
      if (["CANCELADA", "DECLINADA"].includes(c.status)) continue;
      const email = String(c.fornecedorEmail || "").trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      out.push({ fornecedorId: c.fornecedorId || null, nome: c.fornecedorNome || "", email });
    }
    return out;
  }, [rm.cotacoes]);
  // Modo re-enviar: quando os fornecedores cadastrados terminam de carregar,
  // pré-marca os da última cotação — registrados via vendor list (mantém nCodOmie),
  // avulsos por e-mail. Roda uma vez (quando carregandoForn vira false).
  useEffect(() => {
    if (preSelecionarMode !== "re-enviar" || carregandoForn) return;
    const regIds = new Set(fornecedoresCadastrados.map((f) => f.id));
    const sel = new Set(), linhas = [];
    for (const f of fornecedoresAnteriores) {
      if (f.fornecedorId && regIds.has(f.fornecedorId)) sel.add(f.fornecedorId);
      else if (f.email) linhas.push({ nome: f.nome, email: f.email });
    }
    setFornSelecionadosIds(sel);
    setFornecedoresLinhas(linhas.length ? linhas : [{ nome: "", email: "" }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregandoForn]);

  // Lista filtrada de fornecedores cadastrados pra exibir
  const fornFiltrados = useMemo(() => {
    return fornecedoresCadastrados.filter((f) => {
      if (!f.ativo) return false;
      if (filtroCatForn && !(f.categorias || []).includes(filtroCatForn)) return false;
      if (buscaForn) {
        const b = buscaForn.toLowerCase();
        const hay = [f.razaoSocial, f.nomeFantasia, f.email, f.contato].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(b)) return false;
      }
      return true;
    });
  }, [fornecedoresCadastrados, filtroCatForn, buscaForn]);

  const toggleFornCadastrado = (id) => {
    setFornSelecionadosIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const [prazo, setPrazo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 5);
    return d.toISOString().slice(0, 10);
  });
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const toggleItem = (id) => {
    setItensSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const marcarTodos = () => setItensSelecionados(new Set(todosItensCotaveis.map((i) => i.id)));
  const limparTodos = () => setItensSelecionados(new Set());
  // Marca apenas itens "Sem proposta" (status COTADO mas sem precoUnit > 0 em
  // nenhuma cotacao RECEBIDA) — fornecedor anterior nao precificou.
  const marcarSemProposta = () => {
    setItensSelecionados(new Set(
      todosItensCotaveis
        .filter((it) => it.status === "COTADO" && it.temPropostaComPreco === false)
        .map((it) => it.id)
    ));
  };
  const qtdSemProposta = todosItensCotaveis.filter(
    (it) => it.status === "COTADO" && it.temPropostaComPreco === false
  ).length;

  // Monta a lista final de fornecedores combinando: (1) selecionados da
  // Vendor List + (2) avulsos digitados nos campos. Dedupe por email.
  const parsearFornecedores = () =>
    montarFornecedoresEnvio({ fornSelecionadosIds, fornecedoresCadastrados, fornecedoresLinhas });
  const submit = async () => {
    setErro("");
    const parsed = parsearFornecedores();
    if (parsed.error) return setErro(parsed.error);
    const fornecedores = parsed.fornecedores;
    if (fornecedores.length === 0) return setErro("Adicione ao menos 1 fornecedor com nome e email válido.");
    if (itensSelecionados.size === 0) return setErro("Selecione ao menos 1 item.");

    // Lista de RMs envolvidas: a atual + as extras selecionadas
    const rmIds = [rm.id, ...Array.from(rmsExtrasIds)];

    setSalvando(true);
    try {
      const res = await fetch("/api/cotacao/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rmIds,
          itensIds: Array.from(itensSelecionados),
          fornecedores,
          prazoResposta: prazo || null,
          observacaoExtra: observacao.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      onSent({ cotacoes: data.cotacoes, emails: data.emails || [], estoque: data.estoque || null });
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <Modal titulo="Enviar Cotação aos Fornecedores" onClose={onClose}>
      <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
        {erro && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5" /> <span>{erro}</span>
          </div>
        )}

        {preSelecionarMode === "sem-proposta" && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded px-3 py-2 flex items-start gap-2">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Modo: Re-cotar itens sem proposta</p>
              <p className="text-xs mt-0.5">
                Já marcamos só os itens que o fornecedor anterior não precificou. Adicione um novo fornecedor abaixo pra enviar.
              </p>
            </div>
          </div>
        )}

        {preSelecionarMode === "re-enviar" && (
          <div className="bg-torg-blue-50 border border-torg-blue-100 text-torg-dark text-sm rounded px-3 py-2 flex items-start gap-2">
            <RotateCcw size={14} className="mt-0.5 flex-shrink-0 text-torg-blue" />
            <div>
              <p className="font-medium">Reenvio da cotação — nova rodada</p>
              <p className="text-xs mt-0.5 text-torg-gray">
                Pra corrigir um erro ou pedir desconto. Já marcamos os itens e os fornecedores da última cotação — confira, ajuste se precisar e envie. Cada envio gera uma nova cotação (a anterior fica no histórico).
              </p>
            </div>
          </div>
        )}

          <VincularOutrasRMs
            outrasRMs={outrasRMs}
            rm={rm}
            rmsExtrasIds={rmsExtrasIds}
            toggleRmExtra={toggleRmExtra}
          />
        {/* Itens (consolidados das RMs marcadas) */}
          <SelecaoItensCotacao
            itensSelecionados={itensSelecionados}
            limparTodos={limparTodos}
            marcarSemProposta={marcarSemProposta}
            marcarTodos={marcarTodos}
            qtdSemProposta={qtdSemProposta}
            todosItensCotaveis={todosItensCotaveis}
            toggleItem={toggleItem}
          />

        {/* Fornecedores — Vendor List (cadastrados) + avulsos */}
        <FornecedoresPicker
          fornecedoresCadastrados={fornecedoresCadastrados}
          fornFiltrados={fornFiltrados}
          carregandoForn={carregandoForn}
          fornSelecionadosIds={fornSelecionadosIds}
          toggleFornCadastrado={toggleFornCadastrado}
          filtroCatForn={filtroCatForn}
          setFiltroCatForn={setFiltroCatForn}
          buscaForn={buscaForn}
          setBuscaForn={setBuscaForn}
          fornecedoresLinhas={fornecedoresLinhas}
          setFornecedor={setFornecedor}
          addFornecedor={addFornecedor}
          removerFornecedor={removerFornecedor}
          categoriasFornecedor={categoriasFornecedor}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Prazo de resposta</label>
            <input
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-torg-dark mb-1">Observação (opcional)</label>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: Entrega urgente, frete CIF"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-torg-blue"
            />
          </div>
        </div>
      </div>
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-torg-gray border border-gray-300 rounded-lg hover:bg-gray-100 text-sm">
          Cancelar
        </button>
        <button
          onClick={submit}
          disabled={salvando}
          className="px-5 py-2 bg-torg-blue text-white rounded-lg hover:bg-torg-blue-700 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
        >
          {salvando && <Loader2 size={14} className="animate-spin" />} Criar cotações
        </button>
      </div>
    </Modal>
  );
}
