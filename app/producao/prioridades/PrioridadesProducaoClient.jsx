"use client";
// Prioridades de Produção — 3 blocos de setor (Preparação · Montagem+Solda · Acabamento/Jato/Pintura).
// SÓ as OPs ENVIADAS pra produção (OP.emProducao). Por OP: PRIORITÁRIAS em cima (1,2,3 reordenável)
// e as DEMAIS pendentes embaixo, com Qtd · Peso un. · Peso total, o PRAZO do setor ("até quando"),
// botão de DESENHO (projetos da Engenharia + registro GRD) e exportação em Excel padrão Torg.
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, AlertCircle, Flag, ChevronUp, ChevronDown, Truck, RefreshCw, Inbox, CalendarClock, FileText, FileDown, X } from "lucide-react";
import DesenhoPecaModal from "@/components/DesenhoPecaModal";

const BLOCOS = [
  { key: "preparacao", label: "Preparação" },
  { key: "montagem", label: "Montagem + Solda" },
  { key: "acabamento", label: "Acabamento, Jato e Pintura" },
];
const fmtKg = (n) => `${Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} kg`;
const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtData = (d) => (d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "");

export default function PrioridadesProducaoClient({ podeEditar }) {
  const sp = useSearchParams();
  const inicial = BLOCOS.some((b) => b.key === sp.get("bloco")) ? sp.get("bloco") : "preparacao";
  const [aba, setAba] = useState(inicial);
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  const [movendo, setMovendo] = useState("");
  const [desenho, setDesenho] = useState(null); // { opNumero, marca }
  const [exportando, setExportando] = useState(false);

  const carregar = useCallback(async () => {
    setErro("");
    try {
      const r = await fetch("/api/producao/prioridades", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao carregar");
      setDados(j.blocos || []);
    } catch (e) { setErro(e.message); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Move a peça na posição i (da lista de prioritárias da OP) trocando a prioridade com a vizinha.
  async function mover(pecas, i, dir) {
    const j = i + dir;
    if (j < 0 || j >= pecas.length) return;
    const a = pecas[i], b = pecas[j];
    setMovendo(a.id);
    try {
      const r = await fetch("/api/producao/prioridades", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aId: a.id, bId: b.id }),
      });
      const jr = await r.json();
      if (!r.ok) throw new Error(jr.error || "Erro ao reordenar");
      await carregar();
    } catch (e) { setErro(e.message); } finally { setMovendo(""); }
  }

  // Remove a prioridade da peça (marcou errado) — as demais renumeram sozinhas (1,2,3…).
  async function removerPrioridade(p) {
    if (!confirm(`Tirar a prioridade #${p.prioridade} de ${p.marca}?\n\nA peça continua na fila do setor, só deixa de ser prioritária.`)) return;
    setMovendo(p.id);
    try {
      const r = await fetch("/api/producao/prioridades", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ removerId: p.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao remover");
      await carregar();
    } catch (e) { setErro(e.message); } finally { setMovendo(""); }
  }

  const blocoAtual = (dados || []).find((b) => b.key === aba);

  // Exporta o bloco ativo (todas as OPs: prioritárias + demais) no padrão Torg.
  async function exportar() {
    if (!blocoAtual || !blocoAtual.ops.length) return alert("Nada pra exportar neste bloco.");
    setExportando(true);
    try {
      const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais, adicionarRodapeISO, downloadWorkbook } = await import("@/lib/excel-relatorio");
      const headers = ["OP", "Prior.", "Marca", "Descrição", "Situação", "Qtd", "Peso un. (kg)", "Peso total (kg)"];
      const totalPecas = blocoAtual.ops.reduce((s, op) => s + op.prioritarias.length + op.demais.length, 0);
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: `Prioridades de Produção — ${blocoAtual.label}`,
        subtitulo: `OPs em produção · prioritárias na ordem + demais pendentes · gerado da tela de produção`,
        kpis: [`${blocoAtual.ops.length} OP(s)`, `${totalPecas} peça(s)`],
        totalColunas: headers.length, nomePlanilha: blocoAtual.label.slice(0, 28), codigoDoc: "REL-PCP-003",
      });
      ws.columns = [{ width: 10 }, { width: 8 }, { width: 18 }, { width: 40 }, { width: 20 }, { width: 8 }, { width: 14 }, { width: 15 }];
      let row = linhaInicio;
      adicionarHeaderTabela(ws, row, headers); row++;
      let pesoTot = 0;
      for (const op of blocoAtual.ops) {
        for (const p of [...op.prioritarias, ...op.demais]) {
          const situacao = p.terceiro ? `No terceiro${p.retornoPrevisto ? ` · volta ${fmtData(p.retornoPrevisto)}` : ""}` : p.setor;
          adicionarLinhaTabela(ws, row, [`OP-${op.opNumero}`, p.prioridade ?? "", p.marca, p.descricao || "", situacao, p.qte, p.pesoUnitKg, p.pesoTotalKg]); row++;
          pesoTot += p.pesoTotalKg || 0;
        }
      }
      adicionarLinhaTotais(ws, row, ["", "", "", "", "TOTAL", "", "", Math.round(pesoTot)]); row += 2;
      adicionarRodapeISO(ws, row, headers.length);
      const hoje = new Date().toISOString().split("T")[0];
      await downloadWorkbook(workbook, `Prioridades_${blocoAtual.label.replace(/[^\w]+/g, "_")}_${hoje}.xlsx`);
    } catch (e) { alert(e.message || "Erro ao exportar"); } finally { setExportando(false); }
  }

  // Linha de peça (tabela): prioritária tem nº + setas; demais não.
  const Linha = ({ op, p, i, lista, prioritaria }) => (
    <tr className={`border-t border-gray-50 ${prioritaria ? "" : "bg-gray-50/40"}`}>
      <td className="px-3 py-2 w-10 text-center">
        {prioritaria ? <span className="w-6 h-6 rounded-full bg-torg-orange/10 text-torg-orange font-extrabold text-[12px] inline-flex items-center justify-center tabular-nums">{p.prioridade}</span> : null}
      </td>
      <td className="px-2 py-2 min-w-[140px]">
        <p className={`font-mono text-[13px] truncate ${prioritaria ? "font-semibold text-torg-dark" : "text-torg-dark"}`}>{p.marca}</p>
        {p.descricao && <p className="text-[11px] text-torg-gray truncate max-w-[260px]">{p.descricao}</p>}
      </td>
      <td className="px-2 py-2 whitespace-nowrap">
        {p.terceiro ? (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-medium inline-flex items-center gap-1"><Truck size={11} /> no terceiro{p.retornoPrevisto ? ` · volta ${fmtData(p.retornoPrevisto)}` : ""}</span>
        ) : (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-torg-gray font-medium">{p.setor}</span>
        )}
      </td>
      <td className="px-2 py-2 text-right tabular-nums text-[13px]">{fmtN(p.qte)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-[12px] text-torg-gray whitespace-nowrap">{fmtKg(p.pesoUnitKg)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-[13px] font-semibold whitespace-nowrap">{fmtKg(p.pesoTotalKg)}</td>
      <td className="px-2 py-2 w-9 text-center">
        <button onClick={() => setDesenho({ opNumero: op.opNumero, marca: p.marca })} title="Ver os desenhos/projetos da Engenharia (imprimir + GRD)"
          className="text-gray-400 hover:text-torg-blue"><FileText size={15} /></button>
      </td>
      <td className="px-2 py-2 w-8">
        {prioritaria && podeEditar && (
          <div className="flex flex-col items-center">
            <button onClick={() => removerPrioridade(p)} disabled={movendo === p.id} title="Tirar a prioridade desta peça (marcou errado)"
              className="text-gray-300 hover:text-red-600 disabled:opacity-25 mb-0.5"><X size={14} /></button>
            <button onClick={() => mover(lista, i, -1)} disabled={i === 0 || movendo === p.id}
              className="text-gray-400 hover:text-torg-blue disabled:opacity-25" title="Subir prioridade">
              {movendo === p.id ? <Loader2 size={13} className="animate-spin" /> : <ChevronUp size={15} />}
            </button>
            <button onClick={() => mover(lista, i, 1)} disabled={i === lista.length - 1 || movendo === p.id}
              className="text-gray-400 hover:text-torg-blue disabled:opacity-25" title="Descer prioridade">
              <ChevronDown size={15} />
            </button>
          </div>
        )}
      </td>
    </tr>
  );

  return (
    <div className="min-h-screen bg-[#F3F6F9]">
      <div className="bg-[#002945] text-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/producao" className="p-2 rounded-lg hover:bg-white/10 text-white/80"><ArrowLeft size={18} /></Link>
          <div className="flex items-center gap-2">
            <Flag size={20} className="text-torg-orange" />
            <h1 className="text-xl sm:text-2xl font-extrabold">Prioridades de Produção</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={exportar} disabled={exportando || !blocoAtual?.ops?.length}
              className="px-3 py-1.5 text-[12px] font-semibold rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 inline-flex items-center gap-1.5" title="Exportar o bloco em Excel (padrão Torg)">
              {exportando ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Exportar
            </button>
            <button onClick={carregar} className="p-2 rounded-lg hover:bg-white/10 text-white/80" title="Atualizar"><RefreshCw size={16} /></button>
          </div>
        </div>
        {/* Abas dos 3 blocos */}
        <div className="max-w-6xl mx-auto px-4 flex gap-1">
          {BLOCOS.map((b) => {
            const bd = (dados || []).find((x) => x.key === b.key);
            const n = bd ? bd.total : null;
            const on = aba === b.key;
            return (
              <button key={b.key} onClick={() => setAba(b.key)}
                className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg transition ${on ? "bg-[#F3F6F9] text-torg-dark" : "text-white/70 hover:text-white hover:bg-white/5"}`}>
                {b.label}{n != null && <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded-full ${on ? "bg-torg-orange/15 text-torg-orange" : "bg-white/15 text-white/80"}`}>{n}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {erro && <p className="mb-4 text-sm text-red-600 inline-flex items-center gap-1"><AlertCircle size={14} /> {erro}</p>}

        {dados === null ? (
          <div className="py-16 text-center text-torg-gray"><Loader2 size={26} className="mx-auto animate-spin" /></div>
        ) : !blocoAtual || blocoAtual.ops.length === 0 ? (
          <div className="border border-dashed border-gray-200 rounded-xl py-16 text-center bg-white">
            <Inbox size={30} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-torg-dark">Nada neste bloco</p>
            <p className="text-xs text-torg-gray mt-1">Só aparecem as OPs <b>enviadas para produção</b> (botão no painel de Liberar do PCP). Se uma OP não está aqui, ela ainda não foi enviada.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {blocoAtual.ops.map((op) => {
              const prazo = op.prazo;
              const atrasado = prazo && prazo.atrasoDias > 0;
              return (
                <div key={op.opNumero} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
                    <span className="text-lg font-extrabold text-torg-dark tabular-nums">OP-{op.opNumero}</span>
                    <span className="text-sm text-torg-gray truncate max-w-[220px]" title={op.obra}>{op.obra}</span>
                    {prazo && (
                      <span className={`text-[11px] font-semibold inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${atrasado ? "bg-red-50 text-red-600" : "bg-torg-blue-50 text-torg-blue"}`}>
                        <CalendarClock size={11} /> {atrasado ? `${prazo.atrasoDias}d de atraso` : `até ${fmtData(prazo.entrega)}`}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-torg-gray tabular-nums">{fmtKg(op.pesoKg)}</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wide text-torg-gray">
                          <th className="px-3 py-2 w-10">#</th>
                          <th className="px-2 py-2">Marca</th>
                          <th className="px-2 py-2">Situação</th>
                          <th className="px-2 py-2 text-right">Qtd</th>
                          <th className="px-2 py-2 text-right">Peso un.</th>
                          <th className="px-2 py-2 text-right">Peso total</th>
                          <th className="px-2 py-2 w-9 text-center" title="Desenhos">Des.</th>
                          <th className="px-2 py-2 w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {op.prioritarias.map((p, i) => <Linha key={p.id} op={op} p={p} i={i} lista={op.prioritarias} prioritaria />)}
                        {op.demais.length > 0 && (
                          <tr className="border-t border-gray-100 bg-gray-50/70">
                            <td colSpan={8} className="px-3 py-1.5 text-[10px] uppercase font-semibold text-torg-gray tracking-wide">Demais pendentes ({op.demaisTotal})</td>
                          </tr>
                        )}
                        {op.demais.map((p) => <Linha key={p.id} op={op} p={p} i={-1} lista={op.demais} prioritaria={false} />)}
                      </tbody>
                    </table>
                  </div>
                  {op.demaisTotal > op.demais.length && <p className="px-4 py-2 text-[11px] text-torg-gray border-t border-gray-50">+{op.demaisTotal - op.demais.length} peças (use o Exportar pra lista completa da tela)</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {desenho && <DesenhoPecaModal opNumero={desenho.opNumero} marca={desenho.marca} setor={aba} onClose={() => setDesenho(null)} />}
    </div>
  );
}
