"use client";
// ─── REPARTIR A FILA DA SOLDA ENTRE AS BANCADAS ───────────────────────────────
// Espelha o painel da montagem (app/producao/programacao/montagem/PainelBancadas.jsx). O PCP marca
// os conjuntos, escolhe quantas bancadas vai usar, e o painel divide pelo CUSTO real de cada peça.
//
// ⚠⚠ NÃO DIVIDE POR QUANTIDADE DE PEÇA. Na solda, 58% das peças pesam ≤25 kg e valem 6% dos quilos;
// 6% pesam mais de 300 kg e valem 51%. Dividir 60 peças em 6 pilhas de 10 daria uma bancada com um
// dia de trabalho e outra com uma semana.
import { useState, useMemo } from "react";
import { Flame, Loader2, Download, ArrowRight } from "lucide-react";
import { BANCADAS, RITMO_META, RITMO_GUERRA, RITMO_NORMAL, repartirPorBancada, distribuirEmDias } from "@/lib/solda-capacidade";

const fmtKg = (v) => `${Math.round(Number(v) || 0).toLocaleString("pt-BR")} kg`;
const fmtN = (v) => (Number(v) || 0).toLocaleString("pt-BR");
const isoHoje = () => new Date().toISOString().split("T")[0];
const fmtDia = (iso) => {
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
  const s = d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return `${s} ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}`;
};

// ⚠ AS TRÊS RÉGUAS APARECEM, e a de guerra é a padrão. Vitor (01/09/2026): "a meta tem que ser
// acima de 200 ton" e "vamos para a guerra, precisa ser o desafio maior para validarmos". Mostrar
// as três lado a lado é o que deixa o desafio honesto: dá para ver quanto ele pede a mais do que a
// fábrica faz hoje, em vez de esconder o número dentro da conta.
const CURVAS = [
  { k: "GUERRA", rot: "guerra · 200 t/mês", curva: RITMO_GUERRA, kgDia: 1588 },
  { k: "META", rot: "meta · o que já se faz", curva: RITMO_META, kgDia: 918 },
  { k: "NORMAL", rot: "dia comum", curva: RITMO_NORMAL, kgDia: 453 },
];

export default function PainelSolda({ conjuntos, onSugerir, ocupado }) {
  const [n, setN] = useState(6);
  const [inicio, setInicio] = useState(isoHoje());
  const [curvaK, setCurvaK] = useState("GUERRA");
  const [baixando, setBaixando] = useState(false);

  const curva = (CURVAS.find((c) => c.k === curvaK) || CURVAS[0]).curva;
  const distrib = useMemo(() => repartirPorBancada(conjuntos, n, { curva }), [conjuntos, n, curva]);
  const porDia = useMemo(() => distribuirEmDias(distrib, inicio), [distrib, inicio]);

  const resumo = useMemo(() => {
    const un = conjuntos.reduce((s, c) => s + Math.max(1, Number(c.qte) || 1), 0);
    const kg = conjuntos.reduce((s, c) => s + (Number(c.pesoTotalKg) || 0), 0);
    const dias = Math.max(0, ...porDia.map((b) => b.dias.length));
    const ops = [...new Set(conjuntos.map((c) => c.opNumero).filter(Boolean))];
    return { un, kg, dias, ops, diasBancada: distrib.reduce((s, b) => s + b.custo, 0) };
  }, [conjuntos, porDia, distrib]);

  async function exportarFolha() {
    setBaixando(true);
    try {
      const { criarRelatorioTorg, adicionarHeaderTabela, adicionarLinhaTabela, adicionarLinhaTotais,
              downloadWorkbook, CORES } = await import("@/lib/excel-relatorio");
      const ops = [...new Set(conjuntos.map((c) => c.opNumero).filter(Boolean))];
      // ⚠⚠ COLUNA OP SÓ QUANDO O LOTE MISTURA OBRAS. Vitor (01/09/2026) pediu para poder juntar
      // peças de OPs diferentes numa mesma repartição — e aí a folha SEM a OP deixa o soldador com
      // uma marca que ele não sabe onde procurar. Com uma obra só a coluna é redundante e rouba a
      // largura da descrição, que é o que ele lê de longe.
      const varias = ops.length > 1;
      const nCols = varias ? 7 : 6;
      const { workbook, sheet: ws, linhaInicio } = await criarRelatorioTorg({
        titulo: "Ordem de Solda", subtitulo: `${ops.map((o) => `OP ${o}`).join(", ")} · inicio ${fmtDia(inicio)}`,
        kpis: [], totalColunas: nCols, nomePlanilha: "Ordem de solda", codigoDoc: "REL-PRD-012",
      });
      // ⚠ mesmo formato da folha do montador: retrato, fonte 13, uma folha por bancada.
      ws.pageSetup.orientation = "portrait";
      ws.pageSetup.printTitlesRow = `1:${linhaInicio}`;
      ws.columns = varias
        ? [{ width: 12 }, { width: 9 }, { width: 19 }, { width: 34 }, { width: 8 }, { width: 12 }, { width: 11 }]
        : [{ width: 13 }, { width: 20 }, { width: 40 }, { width: 8 }, { width: 13 }, { width: 12 }];
      let row = linhaInicio;
      adicionarHeaderTabela(ws, row, varias
        ? ["Dia", "OP", "Marca", "Descricao", "Qte", "Peso (kg)", "Feito"]
        : ["Dia", "Marca", "Descricao", "Qte", "Peso (kg)", "Feito"]);
      for (let c = 1; c <= nCols; c++) ws.getCell(row, c).font = { name: "Arial", size: 12, bold: true, color: { argb: "FFFFFF" } };
      ws.getRow(row).height = 30;
      row++;
      for (const [iB, b] of porDia.entries()) {
        const itens = b.dias.flatMap((d) => d.itens.map((it) => ({ ...it, _dia: d.dia })));
        const un = itens.reduce((s, it) => s + Math.max(1, Number(it.qte) || 1), 0);
        const kg = itens.reduce((s, it) => s + (Number(it.pesoTotalKg) || 0), 0);
        ws.mergeCells(row, 1, row, nCols);
        const cab = ws.getCell(row, 1);
        cab.value = `${b.bancada}      ${un} peca(s)      ${Math.round(kg).toLocaleString("pt-BR")} kg`;
        cab.font = { name: "Arial", size: 16, bold: true, color: { argb: "FFFFFF" } };
        cab.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CORES.TORG_BLUE } };
        cab.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
        ws.getRow(row).height = 34;
        row++;
        for (const it of itens) {
          const linha = varias
            ? [fmtDia(it._dia), it.opNumero || "", it.marca, it.descricao || "", Math.max(1, Number(it.qte) || 1), Math.round(Number(it.pesoTotalKg) || 0), ""]
            : [fmtDia(it._dia), it.marca, it.descricao || "", Math.max(1, Number(it.qte) || 1), Math.round(Number(it.pesoTotalKg) || 0), ""];
          const centro = varias
            ? { 0: "center", 1: "center", 4: "center", 5: "center", 6: "center" }
            : { 0: "center", 3: "center", 4: "center", 5: "center" };
          adicionarLinhaTabela(ws, row, linha, { fontSize: 13, rowHeight: 26, alinhamento: centro });
          row++;
        }
        adicionarLinhaTotais(ws, row, varias
          ? ["", "", `${itens.length} conjunto(s)`, "", un, Math.round(kg), ""]
          : ["", `${itens.length} conjunto(s)`, "", un, Math.round(kg), ""],
          { fontSize: 13, rowHeight: 28,
            alinhamento: varias ? { 0: "center", 1: "center", 4: "center", 5: "center", 6: "center" }
                                : { 0: "center", 3: "center", 4: "center", 5: "center" } });
        row += 2;
        if (iB < porDia.length - 1) ws.getRow(row - 1).addPageBreak();
      }
      await downloadWorkbook(workbook, `Ordem de solda - ${ops.join("-")} - ${inicio}.xlsx`);
    } catch (e) {
      alert("Erro ao gerar a folha: " + (e?.message || e));
    } finally { setBaixando(false); }
  }

  if (!conjuntos.length) return null;

  return (
    <div className="rounded-xl border border-torg-blue-100 bg-white p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <Flame size={16} className="text-torg-orange" />
        <span className="font-semibold text-torg-dark">Repartir entre as bancadas</span>
        <span className="text-[12px] text-torg-gray">{fmtN(conjuntos.length)} conjuntos · {fmtN(resumo.un)} peças · {fmtKg(resumo.kg)}</span>
        {resumo.ops.length > 1 && (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-torg-blue-50 border border-torg-blue-100 text-torg-blue font-semibold">
            {resumo.ops.length} OPs no lote
          </span>
        )}
        <span className="text-[11px] text-torg-gray ml-auto">bancadas:</span>
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden">
          {[1, 2, 3, 4, 5, 6].map((x) => (
            <button key={x} onClick={() => setN(x)}
              className={`px-2.5 py-1 text-sm font-semibold ${x === n ? "bg-torg-blue text-white" : "bg-white text-torg-gray hover:bg-gray-50"}`}>{x}</button>
          ))}
        </div>
        <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)}
          className="px-2 py-1 text-sm border border-gray-200 rounded-lg" />
      </div>

      {/* ⚠ as três réguas visíveis: sem isso o "200 t" viraria um número mágico dentro da conta */}
      <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
        <span className="text-torg-gray">ritmo:</span>
        {CURVAS.map((c) => (
          <button key={c.k} onClick={() => setCurvaK(c.k)}
            title={`${c.kgDia} kg por bancada-dia · ${Math.round(c.kgDia * 21 * 6 / 1000)} t/mês com 6 bancadas`}
            className={`px-2 py-1 rounded-md border font-semibold ${
              curvaK === c.k ? "border-torg-orange bg-torg-orange text-white" : "border-gray-200 bg-white text-torg-gray hover:bg-gray-50"}`}>
            {c.rot}
          </button>
        ))}
        <span className="text-torg-gray-light ml-1">
          {(CURVAS.find((c) => c.k === curvaK) || CURVAS[0]).kgDia} kg/bancada-dia
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Cx rot="fecha em" val={`${resumo.dias} dia(s)`} sub={`${n} bancada(s)`} forte />
        <Cx rot="carga total" val={`${resumo.diasBancada.toFixed(1)}`} sub="dias-bancada" />
        <Cx rot="por bancada/dia" val={`${Math.round(resumo.kg / Math.max(0.1, resumo.diasBancada))} kg`} sub="no ritmo escolhido" />
        <Cx rot="peças/bancada" val={fmtN(Math.round(resumo.un / n))} sub="no total do lote" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="text-[10px] uppercase text-torg-gray-light border-b border-gray-100">
            <tr><th className="text-left py-1">Bancada</th><th className="text-right">Conj</th><th className="text-right">Peças</th>
                <th className="text-right">kg</th><th className="text-right">Dias</th><th className="text-left pl-3">Quando</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {porDia.map((b) => {
              const itens = b.dias.flatMap((d) => d.itens);
              const un = itens.reduce((s, c) => s + Math.max(1, Number(c.qte) || 1), 0);
              const kg = itens.reduce((s, c) => s + (Number(c.pesoTotalKg) || 0), 0);
              return (
                <tr key={b.bancada}>
                  <td className="py-1.5 font-semibold text-torg-dark">{b.bancada}</td>
                  <td className="text-right tabular-nums">{itens.length}</td>
                  <td className="text-right tabular-nums">{fmtN(un)}</td>
                  <td className="text-right tabular-nums">{fmtKg(kg)}</td>
                  <td className="text-right tabular-nums font-semibold">{b.dias.length}</td>
                  <td className="pl-3 text-torg-gray text-[11px]">
                    {b.dias.length ? `${fmtDia(b.dias[0].dia)} → ${fmtDia(b.dias[b.dias.length - 1].dia)}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 flex-wrap pt-1">
        <button onClick={() => onSugerir(distrib)} disabled={ocupado}
          className="px-4 py-2 bg-torg-blue text-white text-sm font-medium rounded-lg hover:bg-torg-blue-700 inline-flex items-center gap-2 disabled:opacity-50">
          {ocupado ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
          Gravar a sugestão por bancada
        </button>
        <button onClick={exportarFolha} disabled={baixando}
          title="Folha para entregar ao soldador: uma por bancada, letra grande"
          className="px-3 py-2 border border-torg-blue-100 text-torg-blue text-sm font-medium rounded-lg hover:bg-torg-blue-50 inline-flex items-center gap-2 disabled:opacity-50">
          {baixando ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          Folha do soldador
        </button>
        {/* ⚠ a bancada continua sendo SUGESTÃO — quem manda nela é o líder no chão (decisão do
            Vitor em 01/09). O painel reparte e registra a intenção; não cobra aderência. */}
        <span className="text-[11px] text-torg-gray">a bancada é sugestão — quem senta nela é decisão do líder</span>
      </div>
    </div>
  );
}

function Cx({ rot, val, sub, forte }) {
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${forte ? "border-torg-orange/40 bg-torg-orange/5" : "border-gray-100 bg-gray-50/60"}`}>
      <p className="text-[10px] uppercase tracking-wider text-torg-gray-light">{rot}</p>
      <p className="text-[15px] font-extrabold text-torg-dark tabular-nums leading-tight">{val}</p>
      <p className="text-[10px] text-torg-gray">{sub}</p>
    </div>
  );
}
