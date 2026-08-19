"use client";
// LISTA DE SEPARAÇÃO DE MATERIAL — o papel que vai pro Almoxarifado tirar o material dos croquis.
//
// Vitor (19/08): "precisa conter tipo do material, quantidade de barras, peso unitário e total e o
// principal a Rastreabilidade do material — será em cima disso que vamos liberar e garantir que os
// materiais que estamos usando para atender a necessidade dos croquis são de fato os Rs".
//
// O R indicado vem do motor de rastreio (FIFO pela entrega mais antiga). Mas "pode ocorrer que no
// ato da separação um fardo que esteja mais fácil de ser retirado esteja acima do que de fato é o R
// indicado" — então cada linha permite TROCAR o R, e corrida/certificado/NF/data/fornecedor vêm
// junto pelo R escolhido. A troca é registrada como tal (o papel mostra o indicado e o usado).
import { useState, useEffect, useMemo } from "react";
import { X, Loader2, FileDown, Package, AlertTriangle, RotateCcw, Check } from "lucide-react";
import { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais, downloadWorkbook } from "@/lib/excel-relatorio";

const fmtN = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtKg = (n) => Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const fmtD = (d) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const SETOR_LABEL = { CORTE: "Preparação", MONTAGEM: "Montagem", SOLDA: "Solda", ACABAMENTO: "Acabamento", JATO: "Jato", PINTURA: "Pintura", EXPEDICAO: "Expedição" };

export default function SeparacaoModal({ opId, obra, setor, ids, onClose }) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [trocas, setTrocas] = useState({}); // perfil → R escolhido no lugar do indicado
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(0); // quantas trocas já foram registradas

  useEffect(() => {
    const qs = new URLSearchParams({ opId, ...(setor ? { setor } : {}), ...(ids?.length ? { ids: ids.join(",") } : {}) });
    fetch(`/api/pcp/separacao?${qs}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.error) return setErro(j.error);
        setD(j);
        // abre com as trocas JÁ REGISTRADAS aplicadas (elas mandam sobre o FIFO)
        const jaTem = {};
        for (const it of j.itens || []) if (it.troca?.rUsado) jaTem[it.perfil] = it.troca.rUsado;
        setTrocas(jaTem);
        setSalvo(Object.keys(jaTem).length);
      })
      .catch(() => setErro("Não foi possível montar a lista."));
  }, [opId, setor, ids]);

  const itens = d?.itens || [];
  // R efetivo da linha = o trocado (se houve) ou o indicado; e os dados que ELE puxa.
  const linhas = useMemo(() => itens.map((it) => {
    const rUsado = trocas[it.perfil] || it.rIndicado || null;
    const dados = it.opcoes.find((o) => o.rastreio === rUsado) || null;
    const trocado = !!(trocas[it.perfil] && trocas[it.perfil] !== it.rIndicado);
    // "pendente" = trocado na tela mas ainda não registrado (ou registrado com outro R)
    const pendente = trocado && it.troca?.rUsado !== rUsado;
    return { ...it, rUsado, dados, trocado, pendente };
  }), [itens, trocas]);

  const trocados = linhas.filter((l) => l.trocado).length;
  const pendentes = linhas.filter((l) => l.pendente);
  const semR = linhas.filter((l) => !l.rUsado).length;

  // Registra SÓ o que mudou. Sem alteração não há ação nenhuma. (Vitor 19/08.)
  async function registrar() {
    if (!pendentes.length) return;
    setSalvando(true); setErro("");
    try {
      const r = await fetch("/api/pcp/separacao", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opId, trocas: pendentes.map((l) => ({ perfil: l.perfil, rIndicado: l.rIndicado || null, rUsado: l.rUsado })) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Erro ao registrar a troca");
      // marca como registradas (some o "pendente" sem precisar recarregar a lista toda)
      setD((old) => ({ ...old, itens: old.itens.map((it) => (trocas[it.perfil] && trocas[it.perfil] !== it.rIndicado ? { ...it, troca: { ...(it.troca || {}), rUsado: trocas[it.perfil], rIndicado: it.rIndicado } } : it)) }));
      setSalvo(trocados);
    } catch (e) { setErro(e.message); } finally { setSalvando(false); }
  }

  async function exportar() {
    const hoje = new Date().toISOString().split("T")[0];
    const nomeSetor = setor ? SETOR_LABEL[setor] || setor : "Geral";
    const headers = ["Perfil / tipo de material", "Aço", "Peças", "Barras (6 m)", "Compr. total (m)", "Peso un. (kg)", "Peso total (kg)",
      "Rastreab. (R)", "Corrida / lote", "Certificado", "NF", "Fornecedor", "Recebido em", "Saldo do R", "Conferido (visto)"];
    const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
      titulo: `Lista de separação de material — ${obra}`,
      subtitulo: `${obra} · ${nomeSetor}${d?.escopo === "selecao" ? " · somente as peças selecionadas" : " · OP inteira"}${trocados ? ` · ${trocados} R trocado(s) na separação` : ""}`,
      kpis: [`${fmtN(d?.totais?.linhas)} materiais`, `${fmtN(d?.totais?.pecas)} peças`, `${fmtKg(d?.totais?.pesoKg)} kg`],
      totalColunas: headers.length, nomePlanilha: "Separação", codigoDoc: "REL-PCP-006",
    });
    ws.columns = [{ width: 30 }, { width: 14 }, { width: 9 }, { width: 13 }, { width: 16 }, { width: 13 }, { width: 15 },
      { width: 14 }, { width: 16 }, { width: 16 }, { width: 12 }, { width: 20 }, { width: 14 }, { width: 18 }];
    let row = linhaInicio;
    adicionarHeaderTabela(ws, row, headers); row++;
    const first = row;
    for (const l of linhas) {
      adicionarLinhaTabela(ws, row, [
        l.perfil, l.materialNorma || "", l.qtdPecas, l.barras ?? (l.chapa ? "chapa" : ""), l.comprimentoTotalM || "",
        l.pesoUnitKg ?? "", Number(l.pesoTotalKg.toFixed(1)),
        l.rUsado ? `R ${l.rUsado}${l.trocado ? " (trocado)" : ""}` : "A DEFINIR",
        l.dados?.corrida || (l.rUsado ? "sem corrida no CMR" : ""), l.dados?.certificado || "", l.dados?.nf || "",
        l.dados?.fornecedor || "", fmtD(l.dados?.recebidoEm),
        l.dados?.saldo ? `saldo ${l.dados.saldo.saldoKg} kg${l.dados.saldo.esgotado ? " (esgotado)" : ""}` : "",
      ], { alinhamento: { 1: "center", 2: "center", 3: "center", 4: "right", 5: "right", 6: "right", 7: "center", 8: "center", 9: "center", 10: "center", 12: "center" } });
      row++;
    }
    if (row > first) adicionarLinhaTotais(ws, row, ["TOTAL", "", { formula: `SUM(C${first}:C${row - 1})` }, { formula: `SUM(D${first}:D${row - 1})` }, "", "", { formula: `SUM(G${first}:G${row - 1})` }, "", "", "", "", "", "", ""]);
    await downloadWorkbook(workbook, `Separacao_material_${obra}_${hoje}.xlsx`);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div className="bg-white text-torg-dark rounded-2xl w-[97vw] max-w-[1500px] max-h-[92vh] flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 py-3 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-lg font-bold inline-flex items-center gap-2"><Package size={18} className="text-torg-blue" /> Lista de separação de material</h2>
            <p className="text-[12px] text-torg-gray">
              {obra}{setor ? ` · ${SETOR_LABEL[setor] || setor}` : ""}
              {d && ` · ${fmtN(d.totais.linhas)} materiais · ${fmtN(d.totais.pecas)} peças · ${fmtKg(d.totais.pesoKg)} kg`}
              {d?.escopo === "selecao" && <b className="text-torg-blue"> · somente as selecionadas</b>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={exportar} disabled={!d} className="text-[12px] font-semibold text-torg-blue border border-torg-blue-100 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 disabled:opacity-40 inline-flex items-center gap-1"><FileDown size={13} /> Exportar</button>
            <button onClick={onClose} className="text-torg-gray hover:text-red-600"><X size={20} /></button>
          </div>
        </div>

        {(trocados > 0 || semR > 0) && (
          <div className="px-5 pt-3 flex flex-wrap items-center gap-2">
            {trocados > 0 && (
              <p className="text-[12px] text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5">
                <RotateCcw size={13} /> {trocados} R trocado(s) na separação — a lista sai com o R que foi realmente retirado.
                {salvo > 0 && !pendentes.length && <b className="text-emerald-700 ml-1">registrado ✓</b>}
              </p>
            )}
            {/* Só aparece quando HÁ o que registrar. Sem alteração, nenhuma ação. */}
            {pendentes.length > 0 && (
              <button onClick={registrar} disabled={salvando}
                title="Grava a troca: daqui pra frente o portal usa este R no lugar do indicado pelo FIFO — no painel, no carimbo do desenho e no Data Book"
                className="text-[12px] font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50">
                {salvando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Registrar {pendentes.length} troca(s)
              </button>
            )}
            {semR > 0 && (
              <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5">
                <AlertTriangle size={13} /> {semR} material sem R — escolha na coluna ou anote no papel.
              </p>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto px-5 py-3">
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          {!d && !erro && <div className="py-14 text-center text-torg-gray"><Loader2 size={24} className="mx-auto animate-spin" /><p className="text-xs mt-2">Agrupando o material e casando com o CMR…</p></div>}
          {d && !linhas.length && <p className="text-sm text-torg-gray py-10 text-center">Nenhum material a separar (as peças selecionadas não têm perfil).</p>}

          {linhas.length > 0 && (
            <table className="w-full text-[13px] min-w-[1180px]">
              <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
                <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-torg-gray">
                  <th className="text-left px-2.5 py-2 font-semibold">Perfil / tipo de material</th>
                  <th className="text-center px-2.5 py-2 font-semibold">Aço</th>
                  <th className="text-right px-2.5 py-2 font-semibold">Peças</th>
                  <th className="text-right px-2.5 py-2 font-semibold" title="Mínimo pelo comprimento total, em barra de 6 m — não considera perda de corte">Barras</th>
                  <th className="text-right px-2.5 py-2 font-semibold">Peso un.</th>
                  <th className="text-right px-2.5 py-2 font-semibold">Peso total</th>
                  <th className="text-left px-2.5 py-2 font-semibold" title="O R manda: ele puxa corrida, certificado, NF, fornecedor e data">Rastreab. (R)</th>
                  <th className="text-left px-2.5 py-2 font-semibold">O que o R traz</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {linhas.map((l) => (
                  <tr key={l.perfil} className={l.trocado ? "bg-sky-50/50" : ""}>
                    <td className="px-2.5 py-2">
                      <p className="font-mono font-semibold">{l.perfil}</p>
                      {l.materialCmr && <p className="text-[11px] text-torg-gray truncate max-w-[320px]" title={l.materialCmr}>{l.materialCmr}</p>}
                      <p className="text-[10px] text-gray-400 truncate max-w-[320px]" title={l.marcas.join(", ")}>{l.marcas.slice(0, 6).join(", ")}{l.marcas.length > 6 ? ` +${l.marcas.length - 6}` : ""}</p>
                    </td>
                    <td className="px-2.5 py-2 text-center whitespace-nowrap">{l.materialNorma || "—"}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums">{fmtN(l.qtdPecas)}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums">
                      {l.chapa ? <span className="text-torg-gray text-[11px]">chapa</span> : l.barras ? (
                        <span title={`${l.comprimentoTotalM} m no total, em barras de 6 m`}><b>{fmtN(l.barras)}</b><span className="text-[10px] text-torg-gray"> · {fmtN(l.comprimentoTotalM)} m</span></span>
                      ) : "—"}
                    </td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-torg-gray">{l.pesoUnitKg != null ? fmtKg(l.pesoUnitKg) : <span className="text-gray-300" title="Peças com pesos diferentes neste perfil">vários</span>}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums font-semibold">{fmtKg(l.pesoTotalKg)}</td>
                    <td className="px-2.5 py-2">
                      {l.opcoes.length ? (
                        <select value={l.rUsado || ""} onChange={(e) => setTrocas((t) => ({ ...t, [l.perfil]: e.target.value }))}
                          className={`text-[12px] font-mono font-semibold border rounded-lg px-2 py-1 max-w-[230px] ${l.trocado ? "border-sky-400 bg-white text-sky-800" : "border-gray-300"}`}>
                          <option value="">— escolher R —</option>
                          {l.opcoes.map((o) => (
                            <option key={o.rastreio} value={o.rastreio}>
                              R {o.rastreio}{o.corrida ? ` · ${o.corrida}` : " · sem corrida"} · {fmtD(o.recebidoEm)}{o.saldo ? ` · saldo ${o.saldo.saldoKg} kg${o.saldo.esgotado ? " (esgotado)" : ""}` : ""}{o.daOp ? "" : ` · OP-${o.opNumero}`}
                            </option>
                          ))}
                        </select>
                      ) : <span className="text-amber-700 text-[11px] font-semibold">sem material no CMR</span>}
                      {l.trocado && (
                        <p className={`text-[10px] mt-0.5 ${l.pendente ? "text-amber-700 font-semibold" : "text-emerald-700"}`}>
                          {l.pendente ? "trocado — falta registrar" : "troca registrada ✓"} · indicado era R {l.rIndicado || "—"}
                        </p>
                      )}
                      {!l.trocado && l.rsIndicados.length > 1 && <p className="text-[10px] text-torg-gray mt-0.5">peças apontam {l.rsIndicados.length} Rs diferentes</p>}
                    </td>
                    <td className="px-2.5 py-2 text-[11px]">
                      {l.dados ? (
                        <>
                          <p><b>corrida</b> {l.dados.corrida || <span className="text-amber-700">sem corrida no CMR</span>} · <b>cert.</b> {l.dados.certificado || "—"}</p>
                          <p className="text-torg-gray">NF {l.dados.nf || "—"} · {l.dados.fornecedor || "—"} · recebido {fmtD(l.dados.recebidoEm)}{!l.dados.daOp && <b className="text-sky-700"> · fardo da OP-{l.dados.opNumero}</b>}</p>
                          {l.dados.saldo && (
                            <p className={l.dados.saldo.esgotado ? "text-amber-700 font-semibold" : "text-torg-gray"}>
                              entrou {l.dados.saldo.entrouKg} kg · comprometido {l.dados.saldo.consumidoKg} kg · <b>saldo {l.dados.saldo.saldoKg} kg</b>
                              {l.dados.saldo.esgotado && " — material já usado; separar de outro fardo e registrar a troca"}
                            </p>
                          )}
                          {!l.trocado && l.rEsgotado && l.alternativas?.length > 0 && (
                            <p className="text-sky-800">
                              com saldo: {l.alternativas.map((a) => `R ${a.rastreio}${a.saldoKg != null ? ` (${a.saldoKg} kg)` : ""}${a.daOp ? "" : ` · OP-${a.opNumero}`}`).join(" · ")}
                            </p>
                          )}
                        </>
                      ) : <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-gray-100">
          <p className="text-[11px] text-torg-gray">
            <b>Barras</b> é o mínimo pelo comprimento total em barra de 6 m — não considera perda de corte; chapa se separa por peso.
            O <b>R</b> indicado vem do casamento LPC × CMR (FIFO pela entrega mais antiga); trocando o R, <b>corrida, certificado, NF, fornecedor e data vêm junto</b>.
            Trocou o R? <b>Registrar</b> grava a troca e o portal passa a usar esse R no lugar do FIFO — no painel, no carimbo do desenho e no Data Book. <b>Sem alteração não há nada a fazer</b>: o R indicado já vale.
          </p>
        </div>
      </div>
    </div>
  );
}
