"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { fmtOP } from "@/lib/utils";
import {
  ClipboardCheck, Loader2, AlertCircle, Search, ChevronDown, ChevronRight,
  Package, Truck, CheckCircle2, Clock, AlertTriangle, ArrowLeft, Box,
  FileText, Weight, Wrench, CircleDot, Ban, ShieldAlert,
} from "lucide-react";
import PlanejamentoCargaSection from "./PlanejamentoCargaSection";
import { validarProntidaoExpedicao } from "@/lib/expedicao";

const fmtKg = (v) =>
  v != null ? `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg` : "—";
const fmtPesoCompacto = (v) => {
  if (v == null || v === 0) return "0";
  const kg = Number(v);
  return `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
};
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const fmtPct = (v) => `${Math.round(v)}%`;

// Cores por status de peça
const STATUS_PECA_COR = {
  PENDENTE: "bg-gray-100 text-gray-500",
  CORTE: "bg-red-100 text-red-700",
  MONTAGEM: "bg-blue-100 text-blue-700",
  SOLDA: "bg-orange-100 text-orange-700",
  ACABAMENTO: "bg-purple-100 text-purple-700",
  JATO: "bg-cyan-100 text-cyan-700",
  PINTURA: "bg-green-100 text-green-700",
  EXPEDIDO: "bg-teal-100 text-teal-700",
};

// Cores por status de compra (RMItem)
const STATUS_COMPRA_LABEL = {
  PENDENTE: "Aguardando",
  EM_COTACAO: "Em cotação",
  COTADO: "Cotado",
  PEDIDO_GERADO: "Pedido gerado",
};

// Labels de categoria legíveis
const CATEGORIA_LABEL = {
  PARAFUSOS: "Parafusos",
  TELHAS: "Telhas",
  CALHAS_RUFOS: "Calhas e Rufos",
  STEEL_DECK: "Steel Deck",
  PLACA_WALL: "Placa Wall",
  GRADE_DE_PISO: "Grade de Piso",
  OUTRO: "Outro",
};

export default function ChecklistClient({ ops }) {
  const [opSelecionada, setOpSelecionada] = useState(null);
  const [busca, setBusca] = useState("");
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [secaoAberta, setSecaoAberta] = useState({ pecas: true, acessorios: true });

  // Carrega checklist quando OP é selecionada
  useEffect(() => {
    if (!opSelecionada) {
      setDados(null);
      return;
    }
    setLoading(true);
    setErro("");
    fetch(`/api/expedicao/checklist?opId=${opSelecionada}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) throw new Error(data.error);
        setDados(data);
      })
      .catch((e) => setErro(e.message || "Erro ao carregar checklist."))
      .finally(() => setLoading(false));
  }, [opSelecionada]);

  // Filtra OPs pela busca
  const opsFiltradas = useMemo(() => {
    if (!busca.trim()) return ops;
    const q = busca.toLowerCase();
    return ops.filter(
      (o) =>
        o.numero?.toLowerCase().includes(q) ||
        o.cliente?.toLowerCase().includes(q) ||
        o.obra?.toLowerCase().includes(q)
    );
  }, [ops, busca]);

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-extrabold text-torg-dark tracking-tight flex items-center gap-3">
          <ClipboardCheck size={28} className="text-torg-blue" />
          Checklist de Expedição
        </h2>
        <p className="text-sm text-torg-gray mt-1">
          Acompanhe peças e acessórios que precisam ser enviados para campo, por OP.
        </p>
      </div>

      {!opSelecionada ? (
        /* ─── Seletor de OP ──────────────────────────────────── */
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar OP por número, cliente ou obra..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-torg-blue focus:border-transparent"
            />
          </div>

          {opsFiltradas.length === 0 ? (
            <div className="text-center py-12 text-torg-gray">
              <Package size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm">Nenhuma OP encontrada.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {opsFiltradas.map((op) => (
                <button
                  key={op.id}
                  onClick={() => setOpSelecionada(op.id)}
                  className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-left hover:border-torg-blue hover:shadow-md transition-all group"
                >
                  <p className="font-mono text-lg font-bold text-torg-blue group-hover:text-torg-blue-700">
                    {fmtOP(op.numero)}
                  </p>
                  <p className="text-sm text-torg-dark mt-1 truncate">{op.cliente}</p>
                  {op.obra && (
                    <p className="text-xs text-torg-gray truncate">{op.obra}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : loading ? (
        <div className="text-center py-16 text-torg-gray">
          <Loader2 size={28} className="animate-spin mx-auto mb-3" />
          <p className="text-sm">Carregando checklist...</p>
        </div>
      ) : erro ? (
        <div className="space-y-4">
          <button
            onClick={() => setOpSelecionada(null)}
            className="text-sm text-torg-blue hover:text-torg-blue-700 flex items-center gap-1"
          >
            <ArrowLeft size={14} /> Voltar
          </button>
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{erro}</span>
          </div>
        </div>
      ) : dados ? (
        /* ─── Checklist da OP ────────────────────────────────── */
        <ChecklistOP
          dados={dados}
          secaoAberta={secaoAberta}
          setSecaoAberta={setSecaoAberta}
          onVoltar={() => setOpSelecionada(null)}
        />
      ) : null}
    </div>
  );
}

// ─── Checklist completo de uma OP ───────────────────────────

function ChecklistOP({ dados, secaoAberta, setSecaoAberta, onVoltar }) {
  const { op, pecas, pecasResumo, acessorios, acessoriosResumo, romaneios, romaneiosResumo } = dados;

  // Progresso geral
  const totalItens = pecasResumo.total + acessoriosResumo.total;
  const itensExpedidos = pecasResumo.expedidas + acessoriosResumo.expedidos;
  const pctGeral = totalItens > 0 ? (itensExpedidos / totalItens) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Breadcrumb + Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <button
            onClick={onVoltar}
            className="text-sm text-torg-blue hover:text-torg-blue-700 flex items-center gap-1 mb-2"
          >
            <ArrowLeft size={14} /> Voltar às OPs
          </button>
          <h3 className="text-2xl font-extrabold text-torg-dark tracking-tight">
            <span className="font-mono text-torg-blue">{fmtOP(op.numero)}</span>
            <span className="text-lg font-normal text-torg-gray ml-2">— {op.cliente}</span>
          </h3>
          {op.obra && <p className="text-sm text-torg-gray">{op.obra}</p>}
        </div>
        <Link
          href="/expedicao"
          className="text-sm text-torg-blue hover:text-torg-blue-700 border border-torg-blue-200 px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <FileText size={14} /> Ver romaneios
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <KpiCard
          label="Progresso geral"
          value={fmtPct(pctGeral)}
          subtitle={`${itensExpedidos} de ${totalItens} itens`}
          color="bg-torg-blue"
          Icon={ClipboardCheck}
        />
        <KpiCard
          label="Peças expedidas"
          value={`${pecasResumo.expedidas}/${pecasResumo.total}`}
          subtitle={fmtPesoCompacto(pecasResumo.pesoExpedidoKg)}
          color="bg-teal-600"
          Icon={Box}
        />
        <KpiCard
          label="Acessórios expedidos"
          value={`${acessoriosResumo.expedidos}/${acessoriosResumo.total}`}
          subtitle={`${acessoriosResumo.parciais} parciais`}
          color="bg-amber-500"
          Icon={Wrench}
        />
        <KpiCard
          label="Romaneios emitidos"
          value={String(romaneiosResumo.total)}
          subtitle={fmtPesoCompacto(romaneiosResumo.pesoTotalKg)}
          color="bg-torg-dark"
          Icon={FileText}
        />
      </div>

      {/* Barra de progresso geral */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-torg-dark">Progresso de expedição</p>
          <p className="text-sm font-bold text-torg-blue">{fmtPct(pctGeral)}</p>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div
            className="bg-torg-blue h-3 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(pctGeral, 100)}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-[10px] text-torg-gray">
          <span>{itensExpedidos} expedidos</span>
          <span>{totalItens - itensExpedidos} pendentes</span>
        </div>
      </div>

      {/* Seção: Planejamento de Carga */}
      <PlanejamentoCargaSection
        opId={op.id}
        pecas={pecas}
        acessorios={acessorios}
      />

      {/* Seção: Peças estruturais */}
      <SecaoPecas
        pecas={pecas}
        resumo={pecasResumo}
        aberta={secaoAberta.pecas}
        onToggle={() => setSecaoAberta((p) => ({ ...p, pecas: !p.pecas }))}
      />

      {/* Seção: Acessórios */}
      <SecaoAcessorios
        acessorios={acessorios}
        resumo={acessoriosResumo}
        aberta={secaoAberta.acessorios}
        onToggle={() => setSecaoAberta((p) => ({ ...p, acessorios: !p.acessorios }))}
      />

      {/* Romaneios emitidos */}
      {romaneios.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h4 className="font-semibold text-torg-dark flex items-center gap-2">
              <FileText size={16} className="text-torg-gray" />
              Romaneios emitidos ({romaneios.length})
            </h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/60">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Nº</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Data</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Descrição</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Peso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {romaneios.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/30">
                    <td className="px-4 py-2 font-mono text-torg-dark text-xs">{r.numero}</td>
                    <td className="px-4 py-2 text-xs text-torg-gray">{fmtData(r.data)}</td>
                    <td className="px-4 py-2 text-xs text-torg-dark">{r.descricao || "—"}</td>
                    <td className="px-4 py-2 text-right font-medium text-torg-dark text-xs">{fmtKg(r.pesoRealKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Seção de Peças estruturais ─────────────────────────────

function SecaoPecas({ pecas, resumo, aberta, onToggle }) {
  const pct = resumo.total > 0 ? (resumo.expedidas / resumo.total) * 100 : 0;

  // Conta pecas com problemas de prontidao
  const pecasComBloqueio = pecas.filter((p) => {
    const v = validarProntidaoExpedicao(p.status);
    return v.nivel === "BLOQUEIO";
  });
  const pecasComAtencao = pecas.filter((p) => {
    const v = validarProntidaoExpedicao(p.status);
    return v.nivel === "ATENCAO";
  });

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {aberta ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <Box size={18} className="text-teal-600" />
          <div className="text-left">
            <h4 className="font-semibold text-torg-dark">
              Peças estruturais
              <span className="text-sm font-normal text-torg-gray ml-2">
                ({resumo.expedidas}/{resumo.total} expedidas — {fmtPct(pct)})
              </span>
            </h4>
            <p className="text-xs text-torg-gray">
              Marcas da Lista de Estrutura (LE) — status avança pelo pipeline de produção
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {pecasComBloqueio.length > 0 && (
            <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
              <Ban size={10} /> {pecasComBloqueio.length} sem Jato/Pintura
            </span>
          )}
          <div className="w-24 bg-gray-100 rounded-full h-2">
            <div
              className="bg-teal-500 h-2 rounded-full transition-all"
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <span className="text-sm font-bold text-teal-600">{fmtPct(pct)}</span>
        </div>
      </button>

      {aberta && (
        pecas.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-torg-gray border-t border-gray-100">
            <Package size={24} className="mx-auto mb-2 text-gray-300" />
            Nenhuma peça cadastrada nesta OP.
          </div>
        ) : (
          <div className="border-t border-gray-100">
            {/* Alerta consolidado: pecas sem Jato/Pintura */}
            {pecasComBloqueio.length > 0 && (
              <div className="mx-4 mt-3 mb-1 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 flex items-start gap-2">
                <Ban size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-red-700">
                    {pecasComBloqueio.length} {pecasComBloqueio.length === 1 ? "peca" : "pecas"} nao {pecasComBloqueio.length === 1 ? "passou" : "passaram"} por Jato e Pintura
                  </p>
                  <p className="text-[10px] text-red-600 mt-0.5">
                    NF nao pode ser emitida sem conferencia fisica de que o item esta na carga.
                  </p>
                </div>
              </div>
            )}
            {pecasComAtencao.length > 0 && (
              <div className="mx-4 mt-2 mb-1 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 flex items-start gap-2">
                <ShieldAlert size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">
                  {pecasComAtencao.length} {pecasComAtencao.length === 1 ? "peca" : "pecas"} em processo (Jato/Pintura) — confirme fisicamente antes de expedir.
                </p>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/60">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Marca</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Descricao</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Qtd</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Peso total</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Status</th>
                    <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">Prontidao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pecas.map((p) => {
                    const prontidao = validarProntidaoExpedicao(p.status);
                    return (
                      <tr
                        key={p.id}
                        className={`hover:bg-gray-50/30 ${
                          p.status === "EXPEDIDO" ? "bg-green-50/30" :
                          prontidao.nivel === "BLOQUEIO" ? "bg-red-50/30" :
                          prontidao.nivel === "ATENCAO" ? "bg-amber-50/20" : ""
                        }`}
                      >
                        <td className="px-4 py-2 font-mono font-semibold text-torg-dark text-xs">{p.marca}</td>
                        <td className="px-4 py-2 text-xs text-torg-gray">{p.descricao || "—"}</td>
                        <td className="px-4 py-2 text-center text-xs">{p.qte}</td>
                        <td className="px-4 py-2 text-right text-xs font-medium">{fmtKg(p.pesoTotalKg)}</td>
                        <td className="px-4 py-2 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_PECA_COR[p.status] || "bg-gray-100 text-gray-500"}`}>
                            {p.status === "EXPEDIDO" && <CheckCircle2 size={11} />}
                            {p.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-center">
                          {prontidao.nivel === "OK" ? (
                            <CheckCircle2 size={14} className="text-green-500 mx-auto" />
                          ) : prontidao.nivel === "BLOQUEIO" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] text-red-600 font-medium" title={prontidao.mensagem}>
                              <Ban size={12} /> Sem Jato/Pintura
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium" title={prontidao.mensagem}>
                              <ShieldAlert size={12} /> Em processo
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}

// ─── Seção de Acessórios ────────────────────────────────────

function SecaoAcessorios({ acessorios, resumo, aberta, onToggle }) {
  const total = resumo.total;
  const pct = total > 0 ? (resumo.expedidos / total) * 100 : 0;

  // Agrupa por categoria
  const porCategoria = useMemo(() => {
    const map = {};
    for (const a of acessorios) {
      if (!map[a.categoria]) map[a.categoria] = [];
      map[a.categoria].push(a);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [acessorios]);

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {aberta ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <Wrench size={18} className="text-amber-500" />
          <div className="text-left">
            <h4 className="font-semibold text-torg-dark">
              Acessórios expedíveis
              <span className="text-sm font-normal text-torg-gray ml-2">
                ({resumo.expedidos}/{total} expedidos — {fmtPct(pct)})
              </span>
            </h4>
            <p className="text-xs text-torg-gray">
              Itens de RMs (parafusos, telhas, calhas, etc.) que precisam ir para campo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-24 bg-gray-100 rounded-full h-2">
            <div
              className="bg-amber-500 h-2 rounded-full transition-all"
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <span className="text-sm font-bold text-amber-600">{fmtPct(pct)}</span>
        </div>
      </button>

      {aberta && (
        acessorios.length === 0 ? (
          <div className="px-5 py-6 text-center text-sm text-torg-gray border-t border-gray-100">
            <Wrench size={24} className="mx-auto mb-2 text-gray-300" />
            Nenhum acessório expedível nesta OP.
            <p className="text-xs mt-1">Itens como matéria prima e tinta não são considerados expedíveis.</p>
          </div>
        ) : (
          <div className="border-t border-gray-100">
            {porCategoria.map(([categoria, itens]) => (
              <div key={categoria} className="border-b border-gray-50 last:border-b-0">
                <div className="px-5 py-2 bg-gray-50/40 flex items-center gap-2">
                  <CircleDot size={12} className="text-amber-500" />
                  <span className="text-xs font-semibold text-torg-dark uppercase tracking-wider">
                    {CATEGORIA_LABEL[categoria] || categoria}
                  </span>
                  <span className="text-[10px] text-torg-gray">({itens.length} itens)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50/30">
                      <tr>
                        <th className="px-4 py-1.5 text-left text-[10px] font-medium text-gray-400">RM</th>
                        <th className="px-4 py-1.5 text-left text-[10px] font-medium text-gray-400">Descrição</th>
                        <th className="px-4 py-1.5 text-center text-[10px] font-medium text-gray-400">Qtd total</th>
                        <th className="px-4 py-1.5 text-center text-[10px] font-medium text-gray-400">Expedido</th>
                        <th className="px-4 py-1.5 text-center text-[10px] font-medium text-gray-400">Compra</th>
                        <th className="px-4 py-1.5 text-center text-[10px] font-medium text-gray-400">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {itens.map((item) => {
                        const expedido = item.qtdExpedida >= item.qtdTotal;
                        const parcial = item.qtdExpedida > 0 && !expedido;
                        return (
                          <tr key={item.id} className={`hover:bg-gray-50/30 ${expedido ? "bg-green-50/30" : ""}`}>
                            <td className="px-4 py-2 font-mono text-torg-blue text-xs">{item.rmNumero}</td>
                            <td className="px-4 py-2 text-xs text-torg-dark max-w-[260px] truncate">
                              {item.descricao}
                            </td>
                            <td className="px-4 py-2 text-center text-xs">
                              {item.qtdTotal} {item.unidade}
                            </td>
                            <td className="px-4 py-2 text-center text-xs font-medium">
                              {item.qtdExpedida > 0 ? (
                                <span className={expedido ? "text-green-600" : "text-amber-600"}>
                                  {item.qtdExpedida} {item.unidade}
                                </span>
                              ) : (
                                <span className="text-gray-300">0</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                item.statusCompra === "PEDIDO_GERADO"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-500"
                              }`}>
                                {STATUS_COMPRA_LABEL[item.statusCompra] || item.statusCompra}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-center">
                              {expedido ? (
                                <span className="inline-flex items-center gap-1 text-green-600">
                                  <CheckCircle2 size={14} />
                                </span>
                              ) : parcial ? (
                                <span className="inline-flex items-center gap-1 text-amber-500">
                                  <AlertTriangle size={14} />
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-gray-300">
                                  <Clock size={14} />
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ─── KPI Card ───────────────────────────────────────────────

function KpiCard({ label, value, subtitle, color, Icon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-torg-blue-100 p-4 flex items-center gap-3">
      <div className={`${color} p-2.5 rounded-lg flex-shrink-0`}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-torg-gray truncate">{label}</p>
        <p className="text-xl font-extrabold text-torg-dark tabular-nums truncate">{value}</p>
        {subtitle && <p className="text-[10px] text-torg-gray truncate">{subtitle}</p>}
      </div>
    </div>
  );
}
