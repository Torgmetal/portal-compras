"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, AlertCircle, Loader2, Plus, FolderOpen, X, Building2,
  FileSpreadsheet, Link2, ChevronRight, FileText,
} from "lucide-react";
import OrcamentosTabs from "@/components/OrcamentosTabs";

// ─── PROPOSTAS ESTRUTURAS — E A LQC É QUEM AS GERA ────────────────────────────
// Vitor (29/08/2026): "a estrutura LQC na verdade é o que gera a proposta, ou seja precisa vincular
// ela ao criador de proposta estruturas; apague o conceito que está dentro dessa parte hoje e
// substitua por essa da LQC".
//
// ⚠⚠ O QUE FOI SUBSTITUÍDO, e por que dava para substituir. Esta tela criava `PropostaEstudo` — um
// segundo modelo de composição de custo, com 30 rotas de API atrás. Medido antes de mexer: **3
// registros, os três em rascunho, zero itens de custo, nenhum com valor, o último tocado em
// 11/06** — e um deles chamado "Teste". A LQC, no mesmo período, tinha **4 estudos reais com peso e
// preço** (TMSA VALE TR36, ORCA, DANPOWER ENC 336, Torg Galpão), todos de agosto. Não eram duas
// ferramentas concorrendo: era uma viva e uma abandonada ocupando o mesmo lugar no menu.
//
// ⚠ O ESTUDO ANTIGO NÃO FOI APAGADO DO BANCO. Só saiu do caminho. `PropostaEstudo` continua lá com
// os 151 documentos do A Yoshii e a cotação de frete da INPASA — apagar dado de proposta para
// limpar menu seria trocar uma bagunça visível por uma perda invisível.

const fmtR$ = (v) => (v || v === 0
  ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  : "—");
const fmtKg = (v) => (v ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg` : "—");
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const cod = (e) => `LQC-${String(e.numero || 0).padStart(3, "0")}-${String(e.ano).slice(-2)}`;

const STATUS = {
  RASCUNHO:   { label: "Rascunho",   cor: "bg-gray-100 text-gray-700" },
  EM_ANALISE: { label: "Em análise", cor: "bg-amber-100 text-amber-700" },
  APROVADO:   { label: "Aprovado",   cor: "bg-emerald-100 text-emerald-700" },
  CONCLUIDO:  { label: "Concluído",  cor: "bg-torg-blue/10 text-torg-blue" },
};

// ── Modal: nova proposta de estrutura = novo estudo LQC ────────

function NovaPropostaModal({ onClose, onCriado }) {
  const [cliente, setCliente] = useState("");
  const [obra, setObra] = useState("");
  const [orcamentoId, setOrcamentoId] = useState("");
  const [orcamentos, setOrcamentos] = useState([]);
  const [buscaOrc, setBuscaOrc] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  // a lista de orçamentos da central — é a ela que a proposta se amarra
  useEffect(() => {
    fetch("/api/comercial/orcamento")
      .then((r) => r.json())
      .then((j) => setOrcamentos(j.orcamentos || []))
      .catch(() => {});
  }, []);

  // ⚠ escolher o orçamento PREENCHE cliente e obra: eles já estão cadastrados na central, e
  // redigitar é como o mesmo cliente vira "Inpasa" numa tela e "INPASA" na outra.
  const escolher = (id) => {
    setOrcamentoId(id);
    const o = orcamentos.find((x) => x.id === id);
    if (o) { setCliente(o.cliente || ""); setObra(o.obra || ""); }
  };

  const filtrados = buscaOrc.trim()
    ? orcamentos.filter((o) =>
        `${o.numero} ${o.cliente} ${o.obra || ""}`.toLowerCase().includes(buscaOrc.trim().toLowerCase()))
    : orcamentos.slice(0, 40);

  const criar = async () => {
    if (!cliente.trim()) return setErro("Cliente é obrigatório");
    setSalvando(true); setErro("");
    try {
      const res = await fetch("/api/comercial/estudos", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente: cliente.trim(), obra: obra.trim() || undefined, orcamentoId: orcamentoId || undefined }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao criar");
      onCriado(j.estudo);
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-torg-dark">Nova Proposta de Estrutura</h2>
            <p className="text-[12px] text-torg-gray mt-0.5">Abre um estudo LQC — é ele que compõe o custo e gera a proposta.</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} className="text-gray-400" /></button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-torg-dark mb-1.5">
              Orçamento da central <span className="font-normal text-torg-gray">(opcional, mas é o que amarra a proposta ao pipeline)</span>
            </label>
            <div className="relative mb-2">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={buscaOrc} onChange={(e) => setBuscaOrc(e.target.value)}
                placeholder="Buscar por número, cliente ou obra..."
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
            <div className="border border-gray-200 rounded-xl max-h-44 overflow-y-auto divide-y divide-gray-50">
              {filtrados.length === 0 && <p className="text-[12px] text-torg-gray px-3 py-2.5">Nenhum orçamento encontrado.</p>}
              {filtrados.map((o) => (
                <button key={o.id} onClick={() => escolher(o.id)} type="button"
                  className={`w-full text-left px-3 py-2 text-[13px] flex items-center gap-2 hover:bg-torg-blue-50 ${orcamentoId === o.id ? "bg-torg-blue-50" : ""}`}>
                  <Link2 size={13} className={orcamentoId === o.id ? "text-torg-blue" : "text-gray-300"} />
                  <span className="font-semibold text-torg-dark">{o.numero}</span>
                  <span className="text-torg-gray truncate">{o.cliente}{o.obra ? ` · ${o.obra}` : ""}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1.5">Cliente <span className="text-red-400">*</span></label>
              <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Nome do cliente"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-torg-dark mb-1.5">Obra <span className="font-normal text-torg-gray">(opcional)</span></label>
              <input value={obra} onChange={(e) => setObra(e.target.value)} placeholder="Nome da obra ou projeto"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
            </div>
          </div>

          {erro && <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-xl text-sm"><AlertCircle size={16} />{erro}</div>}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-torg-gray hover:text-torg-dark">Cancelar</button>
          <button onClick={criar} disabled={!cliente.trim() || salvando}
            className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark disabled:opacity-50">
            {salvando ? <Loader2 size={16} className="animate-spin" /> : <Building2 size={16} />}
            Criar proposta
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página ─────────────────────────────────────────────────────

export default function PropostasClient() {
  const router = useRouter();
  const [estudos, setEstudos] = useState(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [showModal, setShowModal] = useState(false);

  // abre (ou cria) a proposta do orçamento e leva para a elaboração
  async function abrirProposta(orcamentoId) {
    try {
      const r = await fetch("/api/comercial/proposta-estrutura", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orcamentoId, tipo: "PTC" }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao abrir a proposta");
      router.push(`/comercial/orcamentos/propostas/${j.proposta.id}`);
    } catch (e) { alert(e.message); }
  }

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/comercial/estudos");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Erro ao carregar");
      setEstudos(j.estudos || []); setErro("");
    } catch (e) { setErro(e.message); setEstudos([]); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = (estudos || []).filter((e) => {
    if (!busca.trim()) return true;
    const t = busca.trim().toLowerCase();
    return `${cod(e)} ${e.cliente} ${e.obra || ""} ${e.orcamento?.numero || ""}`.toLowerCase().includes(t);
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <OrcamentosTabs />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight">Propostas Estruturas</h2>
          <p className="text-sm text-torg-gray mt-1">
            Cada proposta de estrutura é um estudo <strong>LQC</strong> — a composição de custo no formato da planilha,
            com o cenário financeiro e a proposta saindo dela.
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-torg-blue text-white rounded-xl text-sm font-semibold hover:bg-torg-dark shadow-sm">
          <Plus size={18} /> Nova Proposta de Estrutura
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por LQC, orçamento, cliente ou obra..."
          className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-torg-blue/30 focus:border-torg-blue outline-none" />
      </div>

      {estudos === null && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-torg-blue mr-3" />
          <span className="text-torg-gray">Carregando propostas...</span>
        </div>
      )}

      {erro && (
        <div className="flex flex-col items-center justify-center py-20">
          <AlertCircle size={32} className="text-red-400 mb-3" />
          <p className="text-red-600 mb-3">{erro}</p>
          <button onClick={carregar} className="text-sm text-torg-blue hover:underline">Tentar novamente</button>
        </div>
      )}

      {estudos !== null && !erro && filtrados.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col items-center justify-center py-20">
          <FolderOpen size={48} className="text-gray-300 mb-4" />
          <p className="text-torg-gray font-medium mb-1">Nenhuma proposta de estrutura</p>
          <p className="text-sm text-gray-400">Clique em <strong>Nova Proposta de Estrutura</strong> para abrir o primeiro estudo.</p>
        </div>
      )}

      {filtrados.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr className="text-left text-xs font-semibold text-torg-gray uppercase tracking-wider">
                  <th className="px-4 py-3">Estudo</th>
                  <th className="px-4 py-3">Orçamento</th>
                  <th className="px-4 py-3">Cliente / Obra</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Peso</th>
                  <th className="px-4 py-3 text-right">Preço</th>
                  <th className="px-4 py-3 text-right">R$/kg</th>
                  <th className="px-4 py-3">Atualizado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtrados.map((e) => {
                  const st = STATUS[e.status] || STATUS.RASCUNHO;
                  const r = e.resultado || {};
                  return (
                    <tr key={e.id} onClick={() => router.push(`/comercial/orcamentos/estudos/${e.id}`)}
                      className="hover:bg-gray-50/50 cursor-pointer transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-torg-blue whitespace-nowrap">
                        {cod(e)}{e.revisao ? <span className="text-torg-gray font-sans"> R{e.revisao}</span> : null}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {/* ⚠ sem orçamento a proposta existe, mas fica fora do pipeline — e é isso
                            que a tela diz, em vez de fingir que está tudo ligado. */}
                        {e.orcamento
                          ? <span className="inline-flex items-center gap-1 font-semibold text-torg-dark"><Link2 size={12} className="text-torg-blue" />{e.orcamento.numero}</span>
                          : <span className="text-[11px] text-amber-600">sem vínculo</span>}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-torg-dark">{e.cliente}</p>
                        {e.obra && <p className="text-xs text-torg-gray truncate max-w-[220px]">{e.obra}</p>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${st.cor}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{fmtKg(r.pesoTotal)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap">{fmtR$(r.preco)}</td>
                      <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-torg-gray">{fmtR$(r.precoPorKg)}</td>
                      <td className="px-4 py-3 text-torg-gray whitespace-nowrap text-xs">{fmtD(e.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <Link href={`/api/comercial/estudos/${e.id}/planilha`} onClick={(ev) => ev.stopPropagation()}
                            title="Baixar no modelo da LQC"
                            className="text-[11px] font-semibold text-torg-blue hover:underline inline-flex items-center gap-1">
                            <FileSpreadsheet size={12} /> planilha
                          </Link>
                          {/* ⚠ o caminho do estudo para a PROPOSTA. Sem este atalho o portal
                              calcula o preço e para ali — e o documento continua sendo escrito no
                              Word, que é o trabalho que a tela existe para tirar. */}
                          {e.orcamentoId && (
                            <button onClick={(ev) => { ev.stopPropagation(); abrirProposta(e.orcamentoId); }}
                              title="Elaborar a proposta a partir deste estudo"
                              className="text-[11px] font-semibold text-torg-orange hover:underline inline-flex items-center gap-1">
                              <FileText size={12} /> proposta
                            </button>
                          )}
                          <ChevronRight size={16} className="text-gray-300" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <NovaPropostaModal onClose={() => setShowModal(false)}
          onCriado={(e) => { setShowModal(false); router.push(`/comercial/orcamentos/estudos/${e.id}`); }} />
      )}
    </div>
  );
}
