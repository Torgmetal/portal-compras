"use client";
// CARGAS PROGRAMADAS — a lista primeiro, a programação depois.
//
// Vitor (25/08/2026): "quero que mude a forma de visualizar, crie uma maneira mais adequada para
// podermos ver apenas as que estão programadas, não ficando em botões por OP onde fica difícil de
// enxergar; pensei até mesmo em formato de planilha, igual fizemos na planilha de rastreabilidade,
// com filtros e tudo mais".
//
// ⚠⚠ A TELA ESTAVA INVERTIDA. Ela abria com uma grade de botões de TODAS as OPs — 40 cartões
// idênticos — e só depois de escolher uma dava para ver alguma carga. Ou seja: para saber o que
// está programado era preciso entrar OP por OP. Agora abre na lista do que existe; escolher obra
// virou o caminho de CRIAR, não o de olhar.
//
// ⚠ "Programada" aqui é carga que alguém criou e datou. Carga PREVISTA vinda do cronograma ainda
// não entra: Vitor (25/08) — "alguns cronogramas não terão essa informação, ou seja não precisa
// destacar no momento".
import { useState, useMemo, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Truck, Search, ChevronRight, ChevronLeft, Loader2, AlertCircle,
  Building2, ListChecks, Plus, FileSpreadsheet, RefreshCw, CalendarClock,
} from "lucide-react";
import PlanejamentoCargaSection from "@/app/expedicao/checklist/PlanejamentoCargaSection";
import { useFiltroColunas, ThFiltro } from "@/components/FiltroColuna";
import { fmtOP } from "@/lib/utils";

const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
// ⚠ UTC no fuso: `dataPrevista` é dia de calendário. Sem isso, 25/06 vira 24/06 à noite no Brasil.
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

// ⚠ classes literais: Tailwind não gera classe montada em runtime, e o chip sairia sem cor.
const SIT = {
  PROGRAMADA: { rot: "Programada", chip: "bg-sky-50 text-sky-700 border-sky-200",             faixa: "border-l-sky-400" },
  ATRASADA:   { rot: "Atrasada",   chip: "bg-red-100 text-red-800 border-red-200",            faixa: "border-l-red-500" },
  CONFIRMADA: { rot: "Confirmada", chip: "bg-amber-50 text-amber-700 border-amber-200",       faixa: "border-l-amber-400" },
  EMBARCADA:  { rot: "Embarcada",  chip: "bg-emerald-50 text-emerald-700 border-emerald-200", faixa: "border-l-emerald-500" },
  CANCELADA:  { rot: "Cancelada",  chip: "bg-gray-100 text-torg-gray border-gray-200",        faixa: "border-l-gray-300" },
};

const COLUNAS = [
  { key: "op",       label: "OP",       valor: (c) => fmtOP(c.opNumero) },
  { key: "cliente",  label: "Cliente",  valor: (c) => c.cliente || "—" },
  { key: "mes",      label: "Mês",      valor: (c) => new Date(c.dataPrevista).toLocaleDateString("pt-BR", { timeZone: "UTC", month: "2-digit", year: "numeric" }) },
  { key: "situacao", label: "Situação", valor: (c) => SIT[c.situacao]?.rot || c.situacao },
];

export default function ProgramacaoCargasPlanejamentoClient({ ops }) {
  const [cargas, setCargas] = useState(null);
  const [totais, setTotais] = useState(null);
  const [erroLista, setErroLista] = useState("");
  const [escolhendo, setEscolhendo] = useState(false); // painel "nova carga"
  const [opSel, setOpSel] = useState(null);
  const [busca, setBusca] = useState("");
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [col, setCol] = useState(null);
  const [baixando, setBaixando] = useState(false);

  const carregarLista = useCallback(async () => {
    setErroLista("");
    try {
      const r = await fetch("/api/planejamento/cargas", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar as cargas");
      setCargas(j.cargas); setTotais(j.totais);
    } catch (e) { setErroLista(e.message); setCargas([]); }
  }, []);
  useEffect(() => { carregarLista(); }, [carregarLista]);

  // peças/acessórios da OP escolhida (mesmo endpoint do checklist da Expedição)
  useEffect(() => {
    if (!opSel) { setDados(null); return; }
    setLoading(true); setErro("");
    fetch(`/api/expedicao/checklist?opId=${opSel}`)
      .then((r) => r.json())
      .then((d) => { if (!d.success) throw new Error(d.error); setDados(d); })
      .catch((e) => setErro(e.message || "Erro ao carregar as peças da OP."))
      .finally(() => setLoading(false));
  }, [opSel]);

  const f = useFiltroColunas(cargas || [], COLUNAS);
  const fp = { filtros: f.filtros, setFiltros: f.setFiltros, opcoesDaColuna: f.opcoesDaColuna, aberta: col, setAberta: setCol };

  const opsFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return ops;
    return ops.filter((o) => `${o.numero} ${o.cliente || ""} ${o.obra || ""}`.toLowerCase().includes(q));
  }, [ops, busca]);

  const opAtual = ops.find((o) => o.id === opSel) || dados?.op;

  async function exportar() {
    if (!f.filtradas.length) return;
    setBaixando(true);
    try {
      const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarRodapeISO, downloadWorkbook } =
        await import("@/lib/excel-relatorio");
      const cab = ["Data prevista", "OP", "Cliente", "Obra", "Ref. cliente", "Descrição", "Situação",
        "Dias em atraso", "Itens", "Carregados", "Não enviados", "Peso planejado (kg)", "Romaneio", "Remarcada de"];
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: "Cargas programadas — Planejamento",
        subtitulo: f.ativos ? `Filtro: ${f.rotulosAtivos.join(", ")}` : "Todas as cargas programadas",
        kpis: [`${fmtN(f.filtradas.length)} carga(s)`, `${fmtN(totais?.atrasadas || 0)} atrasada(s)`, `${fmtKg(totais?.pesoAberto)} em aberto`],
        totalColunas: cab.length, nomePlanilha: "Cargas", codigoDoc: "REL-PLN-002",
      });
      ws.columns = [{ width: 14 }, { width: 10 }, { width: 20 }, { width: 26 }, { width: 16 }, { width: 30 }, { width: 13 },
        { width: 14 }, { width: 8 }, { width: 12 }, { width: 13 }, { width: 19 }, { width: 14 }, { width: 14 }];
      // ⚠ os helpers NÃO devolvem a próxima linha — contar aqui, senão a planilha sai vazia.
      let l = linhaInicio;
      adicionarHeaderTabela(ws, l, cab); l++;
      for (const c of f.filtradas) {
        adicionarLinhaTabela(ws, l, [
          fmtD(c.dataPrevista), fmtOP(c.opNumero), c.cliente, c.obra, c.refCliente, c.descricao,
          SIT[c.situacao]?.rot || c.situacao, c.diasAtraso || "", c.itens, c.carregados, c.naoEnviados,
          c.pesoPlanejadoKg, c.romaneio?.numero || "", c.remarcadaDe ? fmtD(c.remarcadaDe) : "",
        ], { alinhamento: { 7: "right", 8: "right", 9: "right", 10: "right", 11: "right" } });
        l++;
      }
      adicionarRodapeISO(ws, l + 1, cab.length);
      await downloadWorkbook(workbook, "Cargas programadas.xlsx");
    } catch (e) { setErroLista(`Não consegui gerar a planilha: ${e?.message || e}`); }
    finally { setBaixando(false); }
  }

  return (
    <div className="min-h-screen bg-[#F3F6F9]">
      <div className="bg-torg-dark text-white">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
              <Truck size={20} className="text-torg-orange" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight">Cargas</h1>
              <p className="text-xs text-white/70">
                As entregas programadas para as obras. A Expedição certifica e emite o romaneio.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => { setEscolhendo(true); setOpSel(null); }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-torg-orange hover:opacity-90 px-3 py-2 rounded-lg">
              <Plus size={14} /> Nova carga
            </button>
            <Link href="/expedicao/programacao-cargas"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg">
              <ListChecks size={14} /> Painel da Expedição
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* ── programar a carga de uma obra ── */}
        {(escolhendo || opSel) ? (
          <>
            <button onClick={() => { setOpSel(null); setEscolhendo(false); carregarLista(); }}
              className="inline-flex items-center gap-1.5 text-sm text-torg-blue hover:text-torg-dark mb-4">
              <ChevronLeft size={16} /> Voltar para a lista
            </button>

            {!opSel ? (
              <>
                <div className="relative mb-4">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus
                    placeholder="Buscar OP por número, cliente ou obra…"
                    className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-torg-blue focus:border-transparent outline-none" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {opsFiltradas.map((op) => (
                    <button key={op.id} onClick={() => setOpSel(op.id)}
                      className="group bg-white border border-gray-100 rounded-xl px-4 py-3 text-left hover:border-torg-blue hover:shadow-sm transition-all flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-bold text-torg-dark">OP {op.numero}</span>
                        <p className="text-xs text-torg-gray truncate flex items-center gap-1 mt-0.5">
                          <Building2 size={12} className="flex-shrink-0" />
                          {op.cliente || "—"}{op.obra ? ` · ${op.obra}` : ""}
                        </p>
                      </div>
                      <ChevronRight size={18} className="text-gray-300 group-hover:text-torg-blue flex-shrink-0" />
                    </button>
                  ))}
                  {!opsFiltradas.length && <p className="text-sm text-torg-gray col-span-full text-center py-8">Nenhuma OP encontrada.</p>}
                </div>
              </>
            ) : (
              <>
                {opAtual && (
                  <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-5 py-4 mb-4">
                    <h2 className="font-bold text-torg-dark flex items-center gap-2"><Building2 size={16} className="text-torg-blue" /> OP {opAtual.numero}</h2>
                    <p className="text-sm text-torg-gray mt-0.5">{opAtual.cliente || "—"}{opAtual.obra ? ` · ${opAtual.obra}` : ""}</p>
                  </div>
                )}
                {loading ? (
                  <div className="py-12 text-center text-torg-gray"><Loader2 size={26} className="animate-spin mx-auto mb-2" /><p className="text-sm">Carregando peças da OP…</p></div>
                ) : erro ? (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 flex items-start gap-2"><AlertCircle size={16} className="mt-0.5 flex-shrink-0" /><span>{erro}</span></div>
                ) : dados ? (
                  <PlanejamentoCargaSection key={opSel} opId={opSel} pecas={dados.pecas} acessorios={dados.acessorios} defaultAberta />
                ) : null}
              </>
            )}
          </>
        ) : (
          /* ── a lista ── */
          <>
            {totais && (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
                <Kpi n={fmtN(totais.programadas)} l="Programadas" cor="text-sky-700" />
                <Kpi n={fmtN(totais.atrasadas)} l="Atrasadas" cor="text-red-700" destaque={totais.atrasadas > 0} />
                <Kpi n={fmtN(totais.confirmadas)} l="Confirmadas" cor="text-amber-700" />
                <Kpi n={fmtN(totais.embarcadas)} l="Embarcadas" cor="text-emerald-700" />
                <Kpi n={fmtKg(totais.pesoAberto)} l="Peso em aberto" sub="programadas + atrasadas + confirmadas" cor="text-torg-dark" />
              </div>
            )}

            {erroLista && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2 mb-3">
                <AlertCircle size={16} /> {erroLista}
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-b border-gray-100">
                <span className="text-[12px] text-torg-gray">
                  {cargas === null ? "carregando…" : `${fmtN(f.filtradas.length)} de ${fmtN(cargas.length)} carga(s)`}
                </span>
                {f.ativos > 0 && (
                  <button onClick={f.limpar} className="text-[11px] text-torg-orange hover:underline">
                    limpar filtro ({f.rotulosAtivos.join(", ")})
                  </button>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={carregarLista} className="inline-flex items-center gap-1.5 text-[11px] text-torg-gray hover:text-torg-dark border border-gray-200 rounded-lg px-2.5 py-1.5">
                    <RefreshCw size={12} /> Atualizar
                  </button>
                  <button onClick={exportar} disabled={baixando || !f.filtradas.length}
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-torg-gray hover:bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 disabled:opacity-40">
                    {baixando ? <Loader2 size={12} className="animate-spin" /> : <FileSpreadsheet size={12} />} Planilha
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-[11px] uppercase text-torg-gray">
                    <tr>
                      <th className="px-3 py-2 font-semibold text-left">Data</th>
                      <ThFiltro col="op" label="OP" className="px-3 py-2 font-semibold text-left" {...fp} />
                      <ThFiltro col="cliente" label="Cliente" className="px-3 py-2 font-semibold text-left" {...fp} />
                      <th className="px-3 py-2 font-semibold text-left">Obra</th>
                      <th className="px-3 py-2 font-semibold text-left">Descrição</th>
                      <ThFiltro col="mes" label="Mês" className="px-3 py-2 font-semibold text-left" {...fp} />
                      <th className="px-3 py-2 font-semibold text-right">Itens</th>
                      <th className="px-3 py-2 font-semibold text-right">Peso</th>
                      <ThFiltro col="situacao" label="Situação" className="px-3 py-2 font-semibold text-left" {...fp} />
                      <th className="px-3 py-2 font-semibold text-left">Romaneio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {cargas === null && (
                      <tr><td colSpan={10} className="px-3 py-10 text-center"><Loader2 size={20} className="animate-spin mx-auto text-torg-blue" /></td></tr>
                    )}
                    {cargas?.length === 0 && (
                      <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-torg-gray">
                        Nenhuma carga programada ainda. Use <b>Nova carga</b> para criar a primeira.
                      </td></tr>
                    )}
                    {cargas?.length > 0 && !f.filtradas.length && (
                      <tr><td colSpan={10} className="px-3 py-10 text-center text-sm text-torg-gray">Nada com esse filtro.</td></tr>
                    )}
                    {f.filtradas.map((c) => {
                      const s = SIT[c.situacao] || SIT.PROGRAMADA;
                      return (
                        <tr key={c.id} onClick={() => { setEscolhendo(true); setOpSel(c.opId); }}
                          title={`Abrir a programação da OP ${c.opNumero}`}
                          className={`cursor-pointer hover:bg-gray-50/70 border-l-[3px] ${s.faixa}`}>
                          <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                            <span className={c.situacao === "ATRASADA" ? "text-red-600 font-semibold" : "text-torg-dark"}>{fmtD(c.dataPrevista)}</span>
                            {/* ⚠ remarcada só aparece quando de fato mudou — é o que separa "atrasou" de "foi empurrada". */}
                            {c.remarcadaDe && <span className="block text-[10px] text-torg-gray-light">era {fmtD(c.remarcadaDe)}</span>}
                          </td>
                          <td className="px-3 py-2 font-mono text-[12px] text-torg-blue whitespace-nowrap">{fmtOP(c.opNumero)}</td>
                          <td className="px-3 py-2 text-[12px] text-torg-dark truncate max-w-[18ch]" title={c.cliente}>{c.cliente || "—"}</td>
                          <td className="px-3 py-2 text-[12px] text-torg-gray truncate max-w-[24ch]" title={c.obra}>{c.obra || "—"}</td>
                          <td className="px-3 py-2 text-[12px] text-torg-gray truncate max-w-[28ch]" title={c.descricao}>{c.descricao || "—"}</td>
                          <td className="px-3 py-2 text-[12px] text-torg-gray whitespace-nowrap">{COLUNAS[2].valor(c)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-[12px] text-torg-gray whitespace-nowrap">
                            {fmtN(c.itens)}{c.carregados > 0 && <span className="text-torg-gray-light"> · {fmtN(c.carregados)} carregado(s)</span>}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-[12px] text-torg-gray whitespace-nowrap">
                            {c.pesoPlanejadoKg ? fmtKg(c.pesoPlanejadoKg) : "—"}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${s.chip}`}>{s.rot}</span>
                            {c.diasAtraso > 0 && <span className="text-[10px] text-red-600 ml-1 tabular-nums">{c.diasAtraso}d</span>}
                          </td>
                          <td className="px-3 py-2 text-[12px] text-torg-gray whitespace-nowrap">
                            {c.romaneio ? <span className="font-mono">{c.romaneio.numero}</span> : <span className="text-torg-gray-light">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ⚠ dito por extenso porque é uma ausência, e ausência não aparece em tabela nenhuma. */}
            <p className="text-[11px] text-torg-gray-light mt-3 inline-flex items-center gap-1.5">
              <CalendarClock size={12} /> A lista mostra as cargas criadas aqui. Datas de embarque que existem
              só no cronograma ainda não entram.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ n, l, sub, cor, destaque }) {
  return (
    <div className={`bg-white rounded-xl border p-3 ${destaque ? "border-red-200" : "border-gray-100"}`}>
      <p className={`text-xl font-bold tabular-nums ${cor}`}>{n}</p>
      <p className="text-[11px] text-torg-gray mt-0.5">{l}</p>
      {sub && <p className="text-[10px] text-torg-gray-light">{sub}</p>}
    </div>
  );
}
